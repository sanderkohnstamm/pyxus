//
//  GamepadManager.swift
//  pyxios
//
//  Bluetooth gamepad (MFi / Xbox / PS / 8BitDo etc.) support via GameController framework.
//  Polls stick axes at 20Hz and maps to DroneManager manual control values.
//  On-screen joystick thumbs mirror controller input when connected.
//

import Foundation
import GameController

// MARK: - Button Action Enum

enum GamepadAction: String, CaseIterable, Identifiable {
    case none = "None"
    case arm = "Arm"
    case disarm = "Disarm"
    case takeoff = "Takeoff"
    case land = "Land"
    case rtl = "RTL"
    case brake = "Brake"
    case toggleMode = "Toggle Mode"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .none: return "circle.dashed"
        case .arm: return "lock.open.fill"
        case .disarm: return "lock.fill"
        case .takeoff: return "arrow.up.circle.fill"
        case .land: return "arrow.down.circle.fill"
        case .rtl: return "house.fill"
        case .brake: return "pause.circle.fill"
        case .toggleMode: return "arrow.triangle.2.circlepath"
        }
    }
}

// MARK: - Button ID Enum

enum GamepadButton: String, CaseIterable, Identifiable {
    case a = "A"
    case b = "B"
    case x = "X"
    case y = "Y"
    case leftShoulder = "L1"
    case rightShoulder = "R1"
    case leftTrigger = "L2"
    case rightTrigger = "R2"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .a: return "a.circle.fill"
        case .b: return "b.circle.fill"
        case .x: return "x.circle.fill"
        case .y: return "y.circle.fill"
        case .leftShoulder: return "l1.rectangle.roundedbottom.fill"
        case .rightShoulder: return "r1.rectangle.roundedbottom.fill"
        case .leftTrigger: return "l2.rectangle.roundedtop.fill"
        case .rightTrigger: return "r2.rectangle.roundedtop.fill"
        }
    }

    var defaultAction: GamepadAction {
        switch self {
        case .a: return .none
        case .b: return .none
        case .x: return .none
        case .y: return .none
        case .leftShoulder: return .disarm
        case .rightShoulder: return .arm
        case .leftTrigger: return .land
        case .rightTrigger: return .takeoff
        }
    }

    var settingsKey: String { "gamepad_\(rawValue)" }
}

@Observable
final class GamepadManager {
    static let shared = GamepadManager()

    // MARK: - Published State

    var isConnected = false
    var controllerName: String = ""
    var batteryLevel: Float = -1  // -1 = unknown

    /// Normalized stick values (-1..1), updated at 20Hz when a controller is connected.
    var leftX: Float = 0
    var leftY: Float = 0
    var rightX: Float = 0
    var rightY: Float = 0

    /// Button states for UI indicators
    var pressedButtons: Set<GamepadButton> = []

    /// Configurable button→action mappings
    var buttonMappings: [GamepadButton: GamepadAction] = [:] {
        didSet { saveMappings() }
    }

    /// Dead zone threshold (0-0.5)
    var deadZone: Float = 0.12 {
        didSet { UserDefaults.standard.set(Double(deadZone), forKey: "gamepad_deadzone") }
    }

    /// Invert Y axes
    var invertLeftY: Bool = false {
        didSet { UserDefaults.standard.set(invertLeftY, forKey: "gamepad_invertLeftY") }
    }
    var invertRightY: Bool = false {
        didSet { UserDefaults.standard.set(invertRightY, forKey: "gamepad_invertRightY") }
    }

    // MARK: - Private

    private var controller: GCController?
    private var pollTimer: Timer?
    private weak var droneManager: DroneManager?

    private init() {
        loadMappings()
        loadSettings()
        setupNotifications()
        if let first = GCController.controllers().first {
            attachController(first)
        }
    }

    // MARK: - Persistence

    private func loadMappings() {
        for btn in GamepadButton.allCases {
            if let raw = UserDefaults.standard.string(forKey: btn.settingsKey),
               let action = GamepadAction(rawValue: raw) {
                buttonMappings[btn] = action
            } else {
                buttonMappings[btn] = btn.defaultAction
            }
        }
    }

    private func saveMappings() {
        for (btn, action) in buttonMappings {
            UserDefaults.standard.set(action.rawValue, forKey: btn.settingsKey)
        }
    }

    private func loadSettings() {
        let dz = UserDefaults.standard.double(forKey: "gamepad_deadzone")
        deadZone = dz > 0 ? Float(dz) : 0.12
        invertLeftY = UserDefaults.standard.bool(forKey: "gamepad_invertLeftY")
        invertRightY = UserDefaults.standard.bool(forKey: "gamepad_invertRightY")
    }

    func resetToDefaults() {
        for btn in GamepadButton.allCases {
            buttonMappings[btn] = btn.defaultAction
        }
        deadZone = 0.12
        invertLeftY = false
        invertRightY = false
    }

    // MARK: - Setup

    private func setupNotifications() {
        NotificationCenter.default.addObserver(
            forName: .GCControllerDidConnect,
            object: nil, queue: .main
        ) { [weak self] note in
            if let gc = note.object as? GCController {
                self?.attachController(gc)
            }
        }

        NotificationCenter.default.addObserver(
            forName: .GCControllerDidDisconnect,
            object: nil, queue: .main
        ) { [weak self] note in
            if let gc = note.object as? GCController, gc === self?.controller {
                self?.detachController()
            }
        }
    }

    private func attachController(_ gc: GCController) {
        controller = gc
        gc.playerIndex = .index1
        isConnected = true
        controllerName = gc.vendorName ?? "Controller"
        if let battery = gc.battery {
            batteryLevel = battery.batteryLevel
        }
        setupButtonHandlers(gc)
        startPolling()
    }

    private func detachController() {
        stopPolling()
        controller = nil
        isConnected = false
        controllerName = ""
        batteryLevel = -1
        leftX = 0; leftY = 0; rightX = 0; rightY = 0
        pressedButtons = []
    }

    // MARK: - Polling

    /// Bind to a DroneManager for flight control. Stick visualization runs independently.
    func start(droneManager: DroneManager) {
        self.droneManager = droneManager
    }

    /// Unbind from DroneManager.
    func stop() {
        droneManager = nil
    }

    /// Start the input poll timer. Called automatically when a controller connects.
    private func startPolling() {
        guard pollTimer == nil else { return }
        pollTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 20.0, repeats: true) { [weak self] _ in
            self?.poll()
        }
    }

    private func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
        leftX = 0; leftY = 0; rightX = 0; rightY = 0
    }

    private func poll() {
        guard let gamepad = controller?.extendedGamepad else { return }

        // Always update stick values for visualization
        let lx = applyDeadZone(gamepad.leftThumbstick.xAxis.value)
        let ly = applyDeadZone(gamepad.leftThumbstick.yAxis.value)
        let rx = applyDeadZone(gamepad.rightThumbstick.xAxis.value)
        let ry = applyDeadZone(gamepad.rightThumbstick.yAxis.value)

        leftX = lx
        leftY = invertLeftY ? -ly : ly
        rightX = rx
        rightY = invertRightY ? -ry : ry

        // Only write to drone when bound
        if let dm = droneManager {
            let settings = AppSettings.shared
            let thr = settings.throttleCenter
            if settings.joystickMode == .mode2 {
                dm.manualZ = thr.mapThrottle(leftY)
                dm.manualR = leftX
                dm.manualX = rightY
                dm.manualY = rightX
            } else {
                dm.manualX = leftY
                dm.manualR = leftX
                dm.manualZ = thr.mapThrottle(rightY)
                dm.manualY = rightX
            }
        }

        // Update battery
        if let battery = controller?.battery {
            batteryLevel = battery.batteryLevel
        }
    }

    // MARK: - Dead Zone

    private func applyDeadZone(_ value: Float) -> Float {
        let abs = Swift.abs(value)
        guard abs > deadZone else { return 0 }
        let normalized = (abs - deadZone) / (1 - deadZone)
        return value > 0 ? normalized : -normalized
    }

    // MARK: - Button Handlers

    private func setupButtonHandlers(_ gc: GCController) {
        guard let gamepad = gc.extendedGamepad else { return }

        let mapButton = { [weak self] (btn: GamepadButton) -> ((GCControllerButtonInput, Float, Bool) -> Void) in
            return { _, _, pressed in
                guard let self else { return }
                DispatchQueue.main.async {
                    if pressed {
                        self.pressedButtons.insert(btn)
                        self.executeAction(for: btn)
                    } else {
                        self.pressedButtons.remove(btn)
                    }
                }
            }
        }

        gamepad.buttonA.pressedChangedHandler = mapButton(.a)
        gamepad.buttonB.pressedChangedHandler = mapButton(.b)
        gamepad.buttonX.pressedChangedHandler = mapButton(.x)
        gamepad.buttonY.pressedChangedHandler = mapButton(.y)
        gamepad.leftShoulder.pressedChangedHandler = mapButton(.leftShoulder)
        gamepad.rightShoulder.pressedChangedHandler = mapButton(.rightShoulder)
        gamepad.leftTrigger.pressedChangedHandler = mapButton(.leftTrigger)
        gamepad.rightTrigger.pressedChangedHandler = mapButton(.rightTrigger)
    }

    private func executeAction(for button: GamepadButton) {
        guard let dm = droneManager,
              let action = buttonMappings[button], action != .none else { return }

        switch action {
        case .none: break
        case .arm: dm.arm()
        case .disarm: dm.disarm()
        case .takeoff: dm.takeoff()
        case .land: dm.land()
        case .rtl: dm.returnToLaunch()
        case .brake:
            if dm.state.isArdupilot {
                dm.setFlightMode("BRAKE")
            } else {
                dm.setFlightMode("POSCTL")
            }
        case .toggleMode:
            // Cycle between common modes
            let modes = ["STABILIZE", "ALT_HOLD", "LOITER", "POSHOLD"]
            let current = dm.state.flightMode.uppercased()
            if let idx = modes.firstIndex(of: current) {
                dm.setFlightMode(modes[(idx + 1) % modes.count])
            } else {
                dm.setFlightMode(modes[0])
            }
        }
    }
}
