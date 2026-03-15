//
//  MAVLinkDrone+Calibration.swift
//  pyxios
//
//  Calibration commands — extracted from MAVLinkDrone.swift.
//

import Foundation

extension MAVLinkDrone {

    // MARK: - Calibration

    /// MAV_CMD_PREFLIGHT_CALIBRATION (241)
    func calibrate(gyro: Bool = false, compass: Bool = false, baro: Bool = false, accel: Int = 0, level: Bool = false) {
        sendCommandLong(
            command: 241,
            param1: gyro ? 1 : 0,
            param2: compass ? 1 : 0,
            param3: baro ? 1 : 0,
            param5: level ? 2 : Float(accel)   // 1=full accel, 4=simple/next, 2=level
        )
    }

    /// Cancel any active calibration
    func cancelCalibration() {
        sendCommandLong(command: 241)  // all zeros = cancel
    }
}
