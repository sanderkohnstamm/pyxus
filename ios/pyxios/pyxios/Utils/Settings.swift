//
//  Settings.swift
//  pyxios
//
//  UserDefaults-backed app settings.
//

import Foundation
import CoreGraphics

enum JoystickMode: Int, CaseIterable {
    case mode1 = 1  // Left: pitch/yaw, Right: throttle/roll
    case mode2 = 2  // Left: throttle/yaw, Right: pitch/roll (most common)

    var description: String {
        switch self {
        case .mode1: return "Mode 1"
        case .mode2: return "Mode 2"
        }
    }
}

enum ThrottleCenter: String, CaseIterable {
    case mid           // Center stick = 50% throttle (copters: hover)
    case bottom        // Center stick = 0%, up = forward (boats/rovers: stop)
    case bidirectional // Center = 0%, up = forward, down = reverse (boats/rovers)

    var description: String {
        switch self {
        case .mid: return "Center (50%)"
        case .bottom: return "Bottom (0%)"
        case .bidirectional: return "Bidirectional"
        }
    }

    var detail: String {
        switch self {
        case .mid: return "Stick center = mid throttle. For copters."
        case .bottom: return "Stick center = no throttle, up = forward."
        case .bidirectional: return "Center = stop, up = forward, down = reverse."
        }
    }

    /// Map raw joystick Y (-1..1) to MAVLink throttle value.
    /// MAVLink MANUAL_CONTROL z: 0..1000 for mid/bottom, -1000..1000 for bidirectional.
    /// We normalize to 0..1 for mid/bottom (DroneManager scales to 0..1000),
    /// and -1..1 for bidirectional (needs special handling in send).
    func mapThrottle(_ y: Float) -> Float {
        switch self {
        case .mid: return (y + 1) / 2       // -1→0, 0→0.5, 1→1
        case .bottom: return max(0, y)       // -1→0, 0→0, 1→1
        case .bidirectional: return y        // -1→-1, 0→0, 1→1 (full range)
        }
    }

    /// Neutral throttle value when sticks are released
    var neutralZ: Float {
        switch self {
        case .mid: return 0.5
        case .bottom: return 0
        case .bidirectional: return 0
        }
    }
}

enum MapType: String, CaseIterable {
    case satellite, standard, hybrid

    var description: String {
        switch self {
        case .satellite: return "Satellite"
        case .standard: return "Standard"
        case .hybrid: return "Hybrid"
        }
    }
}

enum UnitSystem: String, CaseIterable {
    case metric, imperial

    var speedUnit: String { self == .metric ? "m/s" : "mph" }
    var altitudeUnit: String { self == .metric ? "m" : "ft" }

    func convertSpeed(_ mps: Float) -> Float {
        self == .metric ? mps : mps * 2.23694
    }

    func convertAltitude(_ meters: Float) -> Float {
        self == .metric ? meters : meters * 3.28084
    }
}

@Observable
final class AppSettings {
    static let shared = AppSettings()

    var joystickMode: JoystickMode {
        didSet { UserDefaults.standard.set(joystickMode.rawValue, forKey: "joystickMode") }
    }

    var unitSystem: UnitSystem {
        didSet { UserDefaults.standard.set(unitSystem.rawValue, forKey: "unitSystem") }
    }

    var lastConnectionAddress: String {
        didSet { UserDefaults.standard.set(lastConnectionAddress, forKey: "lastConnectionAddress") }
    }

    var connectionHistory: [String] {
        didSet { UserDefaults.standard.set(connectionHistory, forKey: "connectionHistory") }
    }

    var useCameraFeed: Bool {
        didSet { UserDefaults.standard.set(useCameraFeed, forKey: "useCameraFeed") }
    }

    var defaultTakeoffAltitude: Float {
        didSet { UserDefaults.standard.set(defaultTakeoffAltitude, forKey: "defaultTakeoffAltitude") }
    }

    var videoStreamURL: String {
        didSet { UserDefaults.standard.set(videoStreamURL, forKey: "videoStreamURL") }
    }

    var mapType: MapType {
        didSet { UserDefaults.standard.set(mapType.rawValue, forKey: "mapType") }
    }

    var showTrail: Bool {
        didSet { UserDefaults.standard.set(showTrail, forKey: "showTrail") }
    }

    var throttleCenter: ThrottleCenter {
        didSet { UserDefaults.standard.set(throttleCenter.rawValue, forKey: "throttleCenter") }
    }

    var autoConnectOnLaunch: Bool {
        didSet { UserDefaults.standard.set(autoConnectOnLaunch, forKey: "autoConnectOnLaunch") }
    }

    // Follow Me settings
    var followMeHeight: Float {
        didSet { UserDefaults.standard.set(followMeHeight, forKey: "followMeHeight") }
    }
    var followMeDistance: Float {
        didSet { UserDefaults.standard.set(followMeDistance, forKey: "followMeDistance") }
    }
    var followMeAngle: Float {
        didSet { UserDefaults.standard.set(followMeAngle, forKey: "followMeAngle") }
    }

    /// Shared PiP (mini map / mini video) offset from default position (top-right).
    var pipOffsetX: CGFloat {
        didSet { UserDefaults.standard.set(Double(pipOffsetX), forKey: "pipOffsetX") }
    }
    var pipOffsetY: CGFloat {
        didSet { UserDefaults.standard.set(Double(pipOffsetY), forKey: "pipOffsetY") }
    }

    private init() {
        let modeRaw = UserDefaults.standard.integer(forKey: "joystickMode")
        joystickMode = JoystickMode(rawValue: modeRaw) ?? .mode2

        let unitRaw = UserDefaults.standard.string(forKey: "unitSystem") ?? "metric"
        unitSystem = UnitSystem(rawValue: unitRaw) ?? .metric

        lastConnectionAddress = UserDefaults.standard.string(forKey: "lastConnectionAddress") ?? "udp://0.0.0.0:14550"
        connectionHistory = UserDefaults.standard.stringArray(forKey: "connectionHistory") ?? ["udp://0.0.0.0:14550", "tcp://127.0.0.1:5760"]
        useCameraFeed = UserDefaults.standard.bool(forKey: "useCameraFeed")

        let altVal = UserDefaults.standard.float(forKey: "defaultTakeoffAltitude")
        defaultTakeoffAltitude = altVal > 0 ? altVal : 10

        videoStreamURL = UserDefaults.standard.string(forKey: "videoStreamURL") ?? ""

        let mapRaw = UserDefaults.standard.string(forKey: "mapType") ?? "satellite"
        mapType = MapType(rawValue: mapRaw) ?? .satellite

        showTrail = UserDefaults.standard.object(forKey: "showTrail") == nil ? true : UserDefaults.standard.bool(forKey: "showTrail")

        let throttleRaw = UserDefaults.standard.string(forKey: "throttleCenter") ?? "mid"
        throttleCenter = ThrottleCenter(rawValue: throttleRaw) ?? .mid

        autoConnectOnLaunch = UserDefaults.standard.bool(forKey: "autoConnectOnLaunch")

        let fmh = UserDefaults.standard.float(forKey: "followMeHeight")
        followMeHeight = fmh > 0 ? fmh : 20
        let fmd = UserDefaults.standard.float(forKey: "followMeDistance")
        followMeDistance = fmd > 0 ? fmd : 10
        followMeAngle = UserDefaults.standard.float(forKey: "followMeAngle")

        pipOffsetX = CGFloat(UserDefaults.standard.double(forKey: "pipOffsetX"))
        pipOffsetY = CGFloat(UserDefaults.standard.double(forKey: "pipOffsetY"))
    }

    func addToHistory(_ address: String) {
        if let idx = connectionHistory.firstIndex(of: address) {
            connectionHistory.remove(at: idx)
        }
        connectionHistory.insert(address, at: 0)
        if connectionHistory.count > 10 {
            connectionHistory = Array(connectionHistory.prefix(10))
        }
        lastConnectionAddress = address
    }
}
