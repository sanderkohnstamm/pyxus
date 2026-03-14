//
//  ParameterService.swift
//  pyxios
//
//  Handles parameter fetch and set via MAVLink PARAM protocol.
//

import Foundation

@Observable
final class ParameterService {

    // MARK: - Published State

    var params: [DroneParam] = []
    var isLoadingParams = false

    // MARK: - Private

    private var drone: MAVLinkDrone?
    private var paramCount: UInt16 = 0
    private var paramBuffer: [String: DroneParam] = [:]

    /// Called by DroneManager when the connection changes.
    func update(drone: MAVLinkDrone?) {
        self.drone = drone
    }

    /// Reset all state (called on disconnect).
    func reset() {
        drone = nil
        params = []
        paramBuffer = [:]
        paramCount = 0
        isLoadingParams = false
    }

    // MARK: - Actions

    func fetchAllParams() {
        guard let drone else { return }
        isLoadingParams = true
        paramBuffer = [:]
        paramCount = 0
        drone.requestAllParams()
    }

    func setParam(name: String, value: String, statusCallback: @escaping (String) -> Void) {
        guard let drone else { return }
        if let floatVal = Float(value) {
            drone.setParam(name: name, value: floatVal)
            statusCallback("Setting \(name) = \(value)")
        }
    }

    // MARK: - Callback Handler

    func handleParamValue(name: String, value: Float, type: UInt8, index: UInt16, count: UInt16, statusCallback: @escaping (String) -> Void) {
        paramCount = count

        // Determine if integer or float based on MAV_PARAM_TYPE
        let isFloat = (type >= 9)  // REAL32=9, REAL64=10
        let displayValue: String
        let intVal: Int32?
        let floatVal: Float?
        if isFloat {
            displayValue = String(format: "%.4f", value)
            floatVal = value
            intVal = nil
        } else {
            intVal = Int32(bitPattern: value.bitPattern)
            displayValue = "\(intVal!)"
            floatVal = nil
        }

        let param = DroneParam(name: name, value: displayValue, floatValue: floatVal, intValue: intVal, isFloat: isFloat)
        paramBuffer[name] = param

        // Check if we have all params
        if paramBuffer.count >= Int(count) {
            params = paramBuffer.values.sorted { $0.name < $1.name }
            isLoadingParams = false
            statusCallback("Loaded \(params.count) parameters")
        }
    }
}
