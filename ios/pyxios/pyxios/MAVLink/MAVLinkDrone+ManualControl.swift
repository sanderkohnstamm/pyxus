//
//  MAVLinkDrone+ManualControl.swift
//  pyxios
//
//  RC override, manual control, motor test, servo — extracted from MAVLinkDrone.swift.
//

import Foundation

extension MAVLinkDrone {

    // MARK: - Manual Control

    func sendManualControl(x: Int16, y: Int16, z: Int16, r: Int16) {
        var msg = MsgManualControl()
        msg.target = targetSystem
        msg.x = x
        msg.y = y
        msg.z = z
        msg.r = r
        msg.buttons = 0
        connection.sendMessage(id: MsgManualControl.id, payload: msg.encode())
    }

    func sendRCOverride(channels: [UInt16]) {
        var msg = MsgRcChannelsOverride()
        msg.target_system = targetSystem
        msg.target_component = targetComponent
        let chans = channels + Array(repeating: UInt16(0), count: max(0, 8 - channels.count))
        msg.chan1_raw = chans[0]
        msg.chan2_raw = chans[1]
        msg.chan3_raw = chans[2]
        msg.chan4_raw = chans[3]
        msg.chan5_raw = chans[4]
        msg.chan6_raw = chans[5]
        msg.chan7_raw = chans[6]
        msg.chan8_raw = chans[7]
        connection.sendMessage(id: MsgRcChannelsOverride.id, payload: msg.encode())
    }

    // MARK: - Motor & Servo Test

    /// MAV_CMD_DO_MOTOR_TEST (209)
    /// motor: 1-indexed motor instance
    /// throttlePercent: 0-100
    /// duration: seconds
    func motorTest(motor: Int, throttlePercent: Float, duration: Float) {
        if isArdupilot {
            sendCommandLong(
                command: 209,
                param1: Float(motor),       // motor instance (1-indexed)
                param2: 0,                  // throttle type: percent
                param3: throttlePercent,    // throttle value
                param4: duration,           // timeout
                param5: 1,                  // motor count (1 = single)
                param6: 0                   // test order
            )
        } else {
            // PX4: MAV_CMD_ACTUATOR_TEST (310)
            sendCommandLong(
                command: 310,
                param1: throttlePercent / 100.0,   // normalized 0-1
                param2: duration,
                param5: Float(100 + motor)          // actuator function: Motor1=101
            )
        }
    }

    /// Test all motors at once (ArduPilot only)
    func motorTestAll(throttlePercent: Float, duration: Float) {
        sendCommandLong(
            command: 209,
            param1: 1,
            param2: 0,
            param3: throttlePercent,
            param4: duration,
            param5: 0,       // motor count 0 = all
            param6: 0
        )
    }

    /// MAV_CMD_DO_SET_SERVO (183)
    func servoSet(servo: Int, pwm: UInt16) {
        sendCommandLong(
            command: 183,
            param1: Float(servo),
            param2: Float(pwm)
        )
    }
}
