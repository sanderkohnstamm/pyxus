//
//  VehicleState.swift
//  pyxios
//
//  Published telemetry state, observed by SwiftUI views.
//

import Foundation
import CoreLocation

enum VehicleType: String, CaseIterable {
    case copter, plane, rover

    var description: String {
        switch self {
        case .copter: return "Copter"
        case .plane: return "Plane"
        case .rover: return "Rover"
        }
    }
}

enum ConnectionState: Equatable {
    case disconnected
    case connecting
    case connected
    case error(String)

    var isConnected: Bool {
        if case .connected = self { return true }
        return false
    }
}

struct VehicleState {
    // Connection
    var connectionState: ConnectionState = .disconnected

    // Position
    var coordinate: CLLocationCoordinate2D = CLLocationCoordinate2D(latitude: 0, longitude: 0)
    var altitudeRelative: Float = 0  // meters above home
    var altitudeAMSL: Float = 0      // meters above mean sea level

    // Attitude
    var heading: Float = 0           // degrees 0-360
    var pitch: Float = 0
    var roll: Float = 0

    // Velocity
    var groundSpeed: Float = 0       // m/s
    var verticalSpeed: Float = 0     // m/s (positive = up)

    // Battery
    var batteryPercent: Float = -1   // 0-100, -1 = unknown
    var batteryVoltage: Float = 0
    var batteryCurrent: Float = 0    // amps

    // GPS
    var satellites: Int = 0
    var gpsFixType: Int = 0          // 0=none, 2=2D, 3=3D, etc.

    // State
    var armed: Bool = false
    var flightMode: String = ""
    var landed: Bool = true
    var vehicleType: VehicleType = .copter
    var mavType: UInt8 = 0
    var isArdupilot: Bool = true

    /// Specific platform name from MAV_TYPE (e.g. "Quadrotor", "Hexarotor", "Boat")
    var platformName: String {
        switch mavType {
        case 0: return "Generic"
        case 1: return "Fixed Wing"
        case 2: return "Quadrotor"
        case 3: return "Coaxial"
        case 4: return "Helicopter"
        case 10: return "Rover"
        case 11: return "Boat"
        case 12: return "Submarine"
        case 13: return "Hexarotor"
        case 14: return "Octorotor"
        case 15: return "Tricopter"
        case 19: return "VTOL Duorotor"
        case 20: return "VTOL Quadrotor"
        case 21: return "VTOL Tiltrotor"
        case 22: return "VTOL Fixedrotor"
        case 23: return "VTOL Tailsitter"
        case 24: return "VTOL Tiltwing"
        case 25: return "VTOL Reserved"
        case 26: return "Gimbal"
        case 27: return "ADSB"
        case 29: return "Dodecarotor"
        case 35: return "Helicopter (Coax)"
        default: return "Type \(mavType)"
        }
    }
    var missionSeq: Int = -1

    // Home
    var homeCoordinate: CLLocationCoordinate2D?
    var distanceToHome: Float = 0    // meters

    // Link
    var linkLostSince: Date?

    // Health
    var isGyrCalOk: Bool = false
    var isAccCalOk: Bool = false
    var isMagCalOk: Bool = false
    var isLocalPositionOk: Bool = false
    var isGlobalPositionOk: Bool = false
    var isHomePositionOk: Bool = false
    var isArmable: Bool = false

    var hasValidPosition: Bool {
        coordinate.latitude != 0 || coordinate.longitude != 0
    }
}
