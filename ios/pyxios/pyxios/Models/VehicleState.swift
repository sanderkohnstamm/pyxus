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

    // GPS
    var satellites: Int = 0
    var gpsFixType: Int = 0          // 0=none, 2=2D, 3=3D, etc.

    // State
    var armed: Bool = false
    var flightMode: String = ""
    var landed: Bool = true
    var vehicleType: VehicleType = .copter

    // Home
    var homeCoordinate: CLLocationCoordinate2D?
    var distanceToHome: Float = 0    // meters

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
