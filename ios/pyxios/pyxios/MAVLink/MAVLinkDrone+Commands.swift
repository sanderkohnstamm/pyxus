//
//  MAVLinkDrone+Commands.swift
//  pyxios
//
//  Flight commands, goto, follow, home, fence — extracted from MAVLinkDrone.swift.
//

import Foundation

extension MAVLinkDrone {

    // MARK: - Commands

    /// Send a COMMAND_LONG message.
    func sendCommandLong(command: UInt16, param1: Float = 0, param2: Float = 0,
                         param3: Float = 0, param4: Float = 0, param5: Float = 0,
                         param6: Float = 0, param7: Float = 0) {
        var msg = MsgCommandLong()
        msg.target_system = targetSystem
        msg.target_component = targetComponent
        msg.command = command
        msg.confirmation = 0
        msg.param1 = param1
        msg.param2 = param2
        msg.param3 = param3
        msg.param4 = param4
        msg.param5 = param5
        msg.param6 = param6
        msg.param7 = param7
        connection.sendMessage(id: MsgCommandLong.id, payload: msg.encode())
    }

    func arm() {
        // MAV_CMD_COMPONENT_ARM_DISARM = 400
        sendCommandLong(command: 400, param1: 1)
    }

    func disarm() {
        sendCommandLong(command: 400, param1: 0)
    }

    func forceDisarm() {
        sendCommandLong(command: 400, param1: 0, param2: 21196)
    }

    func takeoff(altitude: Float = 10) {
        if isArdupilot {
            // ArduPilot requires GUIDED mode for takeoff
            setMode("GUIDED")
        }
        // MAV_CMD_NAV_TAKEOFF = 22
        sendCommandLong(command: 22, param7: altitude)
    }

    func land() {
        // MAV_CMD_NAV_LAND = 21
        sendCommandLong(command: 21)
    }

    func returnToLaunch() {
        if isArdupilot {
            setMode("RTL")
        } else {
            setMode("AUTO_RTL")
        }
    }

    func hold() {
        if isArdupilot {
            setMode("LOITER")
        } else {
            setMode("AUTO_LOITER")
        }
    }

    func setMode(_ modeName: String) {
        let upper = modeName.uppercased()
        if isArdupilot {
            guard let modeID = ArduPilotModes.modeID(name: upper, mavType: mavType) else { return }
            // MAV_CMD_DO_SET_MODE = 176, param1 = MAV_MODE_FLAG_CUSTOM_MODE_ENABLED (1)
            sendCommandLong(command: 176, param1: 1, param2: Float(modeID))
        } else {
            guard let customMode = PX4Modes.encode(name: upper) else { return }
            // MAV_MODE_FLAG_CUSTOM_MODE_ENABLED = 1
            sendCommandLong(command: 176, param1: 1, param2: Float(customMode))
        }
    }

    /// All available mode names for the current vehicle type and autopilot.
    var availableModes: [String] {
        if isArdupilot {
            return ArduPilotModes.modesForType(mavType).values.sorted()
        } else {
            return Array(Set(PX4Modes.modes.values)).sorted()
        }
    }

    func gotoLocation(lat: Double, lon: Double, alt: Float) {
        var msg = MsgSetPositionTargetGlobalInt()
        msg.target_system = targetSystem
        msg.target_component = targetComponent
        msg.coordinate_frame = 6  // MAV_FRAME_GLOBAL_RELATIVE_ALT_INT
        msg.type_mask = 0b0000_1111_1111_1000  // use only lat/lon/alt
        msg.lat_int = Int32(lat * 1e7)
        msg.lon_int = Int32(lon * 1e7)
        msg.alt = alt
        connection.sendMessage(id: MsgSetPositionTargetGlobalInt.id, payload: msg.encode())
    }

    // MARK: - Follow Me

    /// Send FOLLOW_TARGET (144) with GCS position at the configured rate.
    func sendFollowTarget(lat: Double, lon: Double, alt: Float) {
        var msg = MsgFollowTarget()
        msg.timestamp = UInt64(Date().timeIntervalSince1970 * 1000)
        msg.est_capabilities = 1  // POS valid
        msg.lat = Int32(lat * 1e7)
        msg.lon = Int32(lon * 1e7)
        msg.alt = alt
        msg.attitude_q = [1, 0, 0, 0]  // identity quaternion
        connection.sendMessage(id: MsgFollowTarget.id, payload: msg.encode())
    }

    // MARK: - Home

    func setHome(lat: Double = 0, lon: Double = 0, alt: Float = 0, useCurrent: Bool = true) {
        // MAV_CMD_DO_SET_HOME = 179
        sendCommandLong(
            command: 179,
            param1: useCurrent ? 1 : 0,
            param5: Float(lat),
            param6: Float(lon),
            param7: alt
        )
    }

    // MARK: - Fence

    func setFenceEnabled(_ enabled: Bool) {
        // MAV_CMD_DO_FENCE_ENABLE = 207
        sendCommandLong(command: 207, param1: enabled ? 1 : 0)
    }
}
