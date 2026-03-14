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

    private init() {
        let modeRaw = UserDefaults.standard.integer(forKey: "joystickMode")
        joystickMode = JoystickMode(rawValue: modeRaw) ?? .mode2

        let unitRaw = UserDefaults.standard.string(forKey: "unitSystem") ?? "metric"
        unitSystem = UnitSystem(rawValue: unitRaw) ?? .metric

        lastConnectionAddress = UserDefaults.standard.string(forKey: "lastConnectionAddress") ?? "udp://0.0.0.0:14550"
        connectionHistory = UserDefaults.standard.stringArray(forKey: "connectionHistory") ?? ["udp://0.0.0.0:14550", "tcp://127.0.0.1:5760"]
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
