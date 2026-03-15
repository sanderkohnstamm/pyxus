//
//  MAVLinkModes.swift
//  pyxios
//
//  ArduPilot and PX4 mode mappings — extracted from MAVLinkDrone.swift.
//

import Foundation

// MARK: - ArduPilot Mode Maps

/// ArduPilot mode mappings per vehicle type (custom_mode -> name).
enum ArduPilotModes {
    static let copter: [UInt32: String] = [
        0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD", 3: "AUTO",
        4: "GUIDED", 5: "LOITER", 6: "RTL", 7: "CIRCLE",
        9: "LAND", 11: "DRIFT", 13: "SPORT", 14: "FLIP",
        15: "AUTOTUNE", 16: "POSHOLD", 17: "BRAKE", 18: "THROW",
        19: "AVOID_ADSB", 20: "GUIDED_NOGPS", 21: "SMART_RTL",
    ]
    static let plane: [UInt32: String] = [
        0: "MANUAL", 1: "CIRCLE", 2: "STABILIZE", 3: "TRAINING",
        4: "ACRO", 5: "FBWA", 6: "FBWB", 7: "CRUISE",
        8: "AUTOTUNE", 10: "AUTO", 11: "RTL", 12: "LOITER",
        13: "TAKEOFF", 14: "AVOID_ADSB", 15: "GUIDED",
        17: "QSTABILIZE", 18: "QHOVER", 19: "QLOITER",
        20: "QLAND", 21: "QRTL", 22: "QAUTOTUNE", 23: "QACRO",
        24: "THERMAL",
    ]
    static let rover: [UInt32: String] = [
        0: "MANUAL", 1: "ACRO", 2: "STEERING", 3: "HOLD",
        4: "LOITER", 5: "FOLLOW", 6: "SIMPLE",
        10: "AUTO", 11: "RTL", 12: "SMART_RTL",
        15: "GUIDED",
    ]
    static let sub: [UInt32: String] = [
        0: "STABILIZE", 1: "ACRO", 2: "ALT_HOLD",
        3: "AUTO", 4: "GUIDED", 7: "CIRCLE",
        9: "SURFACE", 16: "POSHOLD", 19: "MANUAL",
    ]

    /// MAV_TYPE -> mode dict. Multirotor types -> copter, VTOL -> plane.
    static func modesForType(_ mavType: UInt8) -> [UInt32: String] {
        switch mavType {
        case 1:  return plane     // Fixed Wing
        case 10, 11: return rover // Ground Rover, Surface Boat
        case 12: return sub       // Submarine
        case 2, 3, 4, 13, 14, 15, 29, 35: return copter  // Multirotor variants
        case 19, 20, 21, 22, 23, 24, 25: return plane     // VTOL variants
        default: return copter
        }
    }

    /// Reverse lookup: mode name -> custom_mode ID for a given MAV_TYPE.
    static func modeID(name: String, mavType: UInt8) -> UInt32? {
        let modes = modesForType(mavType)
        return modes.first(where: { $0.value == name })?.key
    }
}

/// PX4 mode mappings (main_mode, sub_mode) -> name.
enum PX4Modes {
    static let modes: [UInt16: String] = [
        0x0000: "UNKNOWN",
        0x0100: "MANUAL",    0x0101: "MANUAL",
        0x0200: "ALTCTL",    0x0201: "ALTCTL",
        0x0300: "POSCTL",    0x0301: "POSCTL",
        0x0400: "AUTO",      0x0401: "AUTO_READY",   0x0402: "AUTO_TAKEOFF",
        0x0403: "AUTO_LOITER", 0x0404: "AUTO_MISSION",
        0x0405: "AUTO_RTL",  0x0406: "AUTO_LAND",
        0x0407: "AUTO_RTGS", 0x0408: "AUTO_FOLLOW",
        0x0500: "ACRO",
        0x0600: "OFFBOARD",
        0x0700: "STABILIZED",
        0x0800: "RATTITUDE",
    ]

    /// Decode PX4 custom_mode to mode string.
    static func decode(customMode: UInt32) -> String {
        let mainMode = UInt16((customMode >> 16) & 0xFF)
        let subMode = UInt16((customMode >> 24) & 0xFF)
        let key = (mainMode << 8) | subMode
        return modes[key] ?? "PX4_\(mainMode)_\(subMode)"
    }

    /// Encode PX4 mode name to custom_mode value.
    static func encode(name: String) -> UInt32? {
        guard let (key, _) = modes.first(where: { $0.value == name }) else { return nil }
        let mainMode = UInt32((key >> 8) & 0xFF)
        let subMode = UInt32(key & 0xFF)
        return (mainMode << 16) | (subMode << 24)
    }
}
