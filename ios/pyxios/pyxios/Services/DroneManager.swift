//
//  DroneManager.swift
//  pyxios
//
//  Thin coordinator: connection lifecycle, flight actions, manual control.
//  Delegates mission, parameter, and telemetry work to focused services.
//

import Foundation
import CoreLocation

// MARK: - Param Model

struct DroneParam: Identifiable {
    var id: String { name }
    let name: String
    var value: String      // display value
    var floatValue: Float?
    var intValue: Int32?
    var isFloat: Bool
}

// MARK: - Status Text Model

struct StatusMessage: Identifiable {
    let id = UUID()
    let timestamp: Date
    let type: String     // "INFO", "WARN", "ERROR", etc.
    let text: String
}

// MARK: - Log Entry Model

struct LogEntry: Identifiable {
    let id: Int
    let date: String
    let sizeBytes: Int
}

// MARK: - Telemetry Stream Model

struct TelemetryStream: Identifiable {
    let id: String     // stream name
    let name: String
    var hz: Double = 0
    var lastValue: String = ""
    var lastUpdate: Date = .distantPast
    var updateCount: Int = 0
    var firstUpdate: Date = .distantPast
}

@Observable
final class DroneManager {
    static let shared = DroneManager()

    // MARK: - Services

    let missionService = MissionService()
    let paramService = ParameterService()
    let telemetryService = TelemetryService()
    let alertService = TelemetryAlertService()
    let cameraService = CameraService()

    // MARK: - Published State

    var state = VehicleState()
    var statusMessage: String = ""
    var statusMessages: [StatusMessage] = []
    var logEntries: [LogEntry] = []
    var isLoadingLogs = false

    // Manual control state (normalized -1..1, throttle 0..1)
    var manualControlActive = false
    var manualX: Float = 0      // pitch  (-1 = nose down, 1 = nose up)
    var manualY: Float = 0      // roll   (-1 = left, 1 = right)
    var manualZ: Float = 0.5    // throttle (0 = min, 1 = max)
    var manualR: Float = 0      // yaw    (-1 = left, 1 = right)

    // MARK: - Private

    private var drone: MAVLinkDrone?
    private var manualControlTimer: Timer?

    private init() {}

    // MARK: - Connection

    func connect(address: String) {
        switch state.connectionState {
        case .disconnected, .error:
            break
        case .connecting, .connected:
            return
        }

        state.connectionState = .connecting
        statusMessage = "Connecting..."

        let mav = MAVLinkDrone()
        drone = mav
        missionService.update(drone: mav)
        paramService.update(drone: mav)
        cameraService.update(drone: mav)

        mav.onConnectionStateChanged = { [weak self] connState in
            guard let self else { return }
            switch connState {
            case .ready:
                self.state.connectionState = .connected
                self.statusMessage = "Connected"
                // Auto-discover camera after connection stabilizes
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                    self?.cameraService.startDiscovery()
                }
                // Auto-download mission after connection stabilizes
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                    guard let self, self.state.connectionState.isConnected else { return }
                    self.missionService.downloadMission(statusCallback: { [weak self] msg in
                        self?.statusMessage = msg
                    }) { [weak self] waypoints in
                        if let waypoints, !waypoints.isEmpty {
                            self?.missionService.downloadedMission = waypoints
                        }
                    }
                }
            case .failed(let err):
                self.state.connectionState = .error(err)
                self.statusMessage = "Connection failed: \(err)"
            case .idle:
                self.state.connectionState = .disconnected
            case .connecting:
                break
            }
        }

        mav.onTelemetryUpdate = { [weak self] snapshot in
            guard let self else { return }
            if let linkMsg = self.telemetryService.updateTelemetry(from: snapshot, state: &self.state) {
                self.statusMessage = linkMsg
            }
            self.alertService.check(state: self.state, params: self.paramService.params)
        }

        mav.onStatusText = { [weak self] severity, text in
            self?.handleStatusText(severity: severity, text: text)
        }

        mav.onParamValue = { [weak self] name, value, type, index, count in
            self?.paramService.handleParamValue(name: name, value: value, type: type, index: index, count: count) { [weak self] msg in
                self?.statusMessage = msg
            }
        }

        mav.onCommandAck = { [weak self] command, result in
            self?.handleCommandAck(command: command, result: result)
        }

        mav.onCameraMessage = { [weak self] msgID, payload in
            guard let self else { return }
            switch msgID {
            case 259: self.cameraService.handleCameraInformation(payload)
            case 260: self.cameraService.handleCameraSettings(payload)
            case 262: self.cameraService.handleCameraCaptureStatus(payload)
            case 263: self.cameraService.handleCameraImageCaptured(payload)
            case 269: self.cameraService.handleVideoStreamInformation(payload)
            default: break
            }
        }

        // Parse URI: "udp://0.0.0.0:14550" (listen), "udp://host:port" (connect), "tcp://host:port"
        let parsed = Self.parseConnectionURI(address)

        switch parsed.mode {
        case .udpListen:
            statusMessage = "Listening on port \(parsed.port)..."
            mav.listen(port: parsed.port)
        case .udpConnect:
            statusMessage = "Connecting to \(parsed.host):\(parsed.port)..."
            mav.connect(host: parsed.host, port: parsed.port)
        case .tcpConnect:
            statusMessage = "Connecting via TCP to \(parsed.host):\(parsed.port)..."
            mav.connect(host: parsed.host, port: parsed.port)
        }

        telemetryService.startStreamFlush()
        AppSettings.shared.addToHistory(address)
    }

    // MARK: - URI Parsing

    enum ConnectionMode {
        case udpListen
        case udpConnect
        case tcpConnect
    }

    struct ParsedConnection {
        let mode: ConnectionMode
        let host: String
        let port: UInt16
    }

    static func parseConnectionURI(_ address: String) -> ParsedConnection {
        let trimmed = address.trimmingCharacters(in: .whitespaces)

        // Strip scheme
        var remainder = trimmed
        var scheme = "udp"
        if remainder.hasPrefix("udp://") {
            scheme = "udp"
            remainder = String(remainder.dropFirst(6))
        } else if remainder.hasPrefix("tcp://") {
            scheme = "tcp"
            remainder = String(remainder.dropFirst(6))
        }

        // Parse host:port from remainder
        let host: String
        let port: UInt16

        // Check for [IPv6]:port format
        if remainder.hasPrefix("["), let closeBracket = remainder.firstIndex(of: "]") {
            host = String(remainder[remainder.index(after: remainder.startIndex)..<closeBracket])
            let afterBracket = remainder[remainder.index(after: closeBracket)...]
            if afterBracket.hasPrefix(":"), let p = UInt16(afterBracket.dropFirst()) {
                port = p
            } else {
                port = 14550
            }
        } else if let lastColon = remainder.lastIndex(of: ":") {
            let beforeColon = String(remainder[..<lastColon])
            let afterColon = String(remainder[remainder.index(after: lastColon)...])
            if let p = UInt16(afterColon) {
                host = beforeColon
                port = p
            } else {
                host = remainder
                port = 14550
            }
        } else {
            // Port-only (e.g., "14550") or host-only
            if let p = UInt16(remainder) {
                host = "0.0.0.0"
                port = p
            } else {
                host = remainder.isEmpty ? "0.0.0.0" : remainder
                port = 14550
            }
        }

        // Determine mode
        if scheme == "tcp" {
            return ParsedConnection(mode: .tcpConnect, host: host, port: port)
        }

        // UDP: listen if host is 0.0.0.0 or empty, connect otherwise
        let isListen = host.isEmpty || host == "0.0.0.0" || host == ":"
        return ParsedConnection(mode: isListen ? .udpListen : .udpConnect, host: host, port: port)
    }

    func disconnect() {
        stopManualControl()
        drone?.disconnect()
        drone = nil

        state = VehicleState()
        state.connectionState = .disconnected
        statusMessage = "Disconnected"
        statusMessages = []
        logEntries = []

        missionService.reset()
        paramService.reset()
        telemetryService.reset()
        alertService.reset()
        cameraService.reset()
    }

    // MARK: - Flight Actions

    func arm() {
        drone?.arm()
        statusMessage = "Arming..."
        HapticManager.shared.trigger(style: "success")
    }

    func disarm() {
        drone?.disarm()
        statusMessage = "Disarming..."
        HapticManager.shared.trigger(style: "success")
    }

    func takeoff(altitude: Float? = nil) {
        let altitude = altitude ?? AppSettings.shared.defaultTakeoffAltitude
        guard let drone else { return }
        statusMessage = "Preparing takeoff..."

        if state.armed {
            drone.takeoff(altitude: altitude)
            statusMessage = "Taking off"
            HapticManager.shared.trigger(style: "success")
        } else {
            drone.arm()
            statusMessage = "Arming..."
            waitForArmedThenTakeoff(altitude: altitude, attempts: 0)
        }
    }

    private func waitForArmedThenTakeoff(altitude: Float, attempts: Int) {
        if state.armed {
            drone?.takeoff(altitude: altitude)
            statusMessage = "Taking off"
            HapticManager.shared.trigger(style: "success")
        } else if attempts < 20 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                self?.waitForArmedThenTakeoff(altitude: altitude, attempts: attempts + 1)
            }
        } else {
            drone?.takeoff(altitude: altitude)
            statusMessage = "Armed state not confirmed, trying takeoff..."
        }
    }

    func land() {
        drone?.land()
        statusMessage = "Landing"
        HapticManager.shared.trigger(style: "success")
    }

    func returnToLaunch() {
        drone?.returnToLaunch()
        statusMessage = "Returning to launch"
        HapticManager.shared.trigger(style: "warning")
    }

    func hold() {
        drone?.hold()
        statusMessage = "Holding position"
    }

    func setFlightMode(_ mode: String) {
        guard let drone else { return }
        drone.setMode(mode)
        statusMessage = "Setting \(mode)"
        HapticManager.shared.trigger(style: "success")
    }

    // MARK: - Manual Control

    func startManualControl() {
        guard !manualControlActive else { return }
        manualControlActive = true
        manualX = 0; manualY = 0; manualZ = 0.5; manualR = 0
        statusMessage = "Manual control active"

        manualControlTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.sendManualControlInput()
        }
    }

    func stopManualControl() {
        manualControlActive = false
        manualX = 0; manualY = 0; manualZ = 0.5; manualR = 0

        var remaining = 10
        manualControlTimer?.invalidate()
        manualControlTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
            guard let self else { timer.invalidate(); return }
            self.sendManualControlInput()
            remaining -= 1
            if remaining <= 0 {
                timer.invalidate()
                self.manualControlTimer = nil
            }
        }
        statusMessage = "Manual control off"
    }

    private func sendManualControlInput() {
        guard let drone, manualControlActive else { return }
        drone.sendManualControl(
            x: Int16(manualX * 1000),
            y: Int16(manualY * 1000),
            z: Int16(manualZ * 1000),
            r: Int16(manualR * 1000)
        )
    }

    // MARK: - Log Files

    func fetchLogEntries() {
        statusMessage = "Log download not yet available via native MAVLink"
    }

    /// Available flight modes for the current vehicle/autopilot
    var availableModes: [String] {
        if let drone {
            return drone.availableModes
        }
        return ["STABILIZE", "ALT_HOLD", "LOITER", "GUIDED", "AUTO", "RTL", "LAND"]
    }

    // MARK: - Status Text Handler

    private static let severityNames: [UInt8: String] = [
        0: "EMERG", 1: "ALERT", 2: "CRIT", 3: "ERROR",
        4: "WARN", 5: "NOTICE", 6: "INFO", 7: "DEBUG",
    ]

    private func handleStatusText(severity: UInt8, text: String) {
        let typeStr = Self.severityNames[severity] ?? "?"
        let msg = StatusMessage(timestamp: Date(), type: typeStr, text: text)
        statusMessages.insert(msg, at: 0)
        if statusMessages.count > 200 {
            statusMessages = Array(statusMessages.prefix(200))
        }
    }

    // MARK: - Command ACK Handler

    private func handleCommandAck(command: UInt16, result: UInt8) {
        if command == 241 {
            let resultTexts: [UInt8: String] = [
                0: "Calibration accepted",
                1: "Calibration temporarily rejected",
                2: "Calibration denied",
                3: "Calibration unsupported",
                4: "Calibration failed",
                5: "Calibration in progress",
                6: "Calibration cancelled",
            ]
            let text = resultTexts[result] ?? "Calibration result: \(result)"
            handleStatusText(severity: result == 0 || result == 5 ? 6 : 4, text: text)
        }

        if command == 400 {
            if result == 0 {
                statusMessage = state.armed ? "Armed" : "Disarmed"
            } else {
                statusMessage = "Arm/disarm failed (result=\(result))"
                HapticManager.shared.trigger(style: "error")
            }
        }
    }

    // MARK: - Convenience Forwarding

    /// Upload mission via MissionService.
    func uploadMission(waypoints: [Waypoint], completion: @escaping (Bool) -> Void) {
        missionService.uploadMission(waypoints: waypoints, statusCallback: { [weak self] msg in
            self?.statusMessage = msg
        }, completion: completion)
    }

    /// Download mission via MissionService.
    func downloadMission(completion: @escaping ([Waypoint]?) -> Void) {
        missionService.downloadMission(statusCallback: { [weak self] msg in
            self?.statusMessage = msg
        }, completion: completion)
    }

    /// Start mission via MissionService.
    func startMission() {
        missionService.startMission { [weak self] msg in
            self?.statusMessage = msg
        }
    }

    /// Pause mission via MissionService.
    func pauseMission() {
        missionService.pauseMission { [weak self] msg in
            self?.statusMessage = msg
        }
    }

    /// Clear mission via MissionService.
    func clearMission() {
        missionService.clearMission { [weak self] msg in
            self?.statusMessage = msg
        }
    }

    /// Fly to a specific coordinate in GUIDED mode.
    func gotoLocation(lat: Double, lon: Double, alt: Float) {
        drone?.gotoLocation(lat: lat, lon: lon, alt: alt)
        statusMessage = "Going to location"
    }

    /// Set the current mission item (continue-from).
    func setMissionCurrent(seq: Int) {
        drone?.sendMissionSetCurrent(seq: UInt16(seq))
        statusMessage = "Setting mission to WP \(seq)"
    }

    /// Fetch all params via ParameterService.
    func fetchAllParams() {
        paramService.fetchAllParams()
    }

    /// Set param via ParameterService.
    func setParam(name: String, value: String) {
        paramService.setParam(name: name, value: value) { [weak self] msg in
            self?.statusMessage = msg
        }
    }
}
