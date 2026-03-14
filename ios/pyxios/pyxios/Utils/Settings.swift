//
//  Settings.swift
//  pyxios
//
//  UserDefaults-backed app settings.
//

import Foundation

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

    var autoConnectOnLaunch: Bool {
        didSet { UserDefaults.standard.set(autoConnectOnLaunch, forKey: "autoConnectOnLaunch") }
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

        autoConnectOnLaunch = UserDefaults.standard.bool(forKey: "autoConnectOnLaunch")
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
