//
//  MAVLinkDrone+Params.swift
//  pyxios
//
//  Parameter request/set — extracted from MAVLinkDrone.swift.
//

import Foundation

extension MAVLinkDrone {

    // MARK: - Parameters

    func requestAllParams() {
        var msg = MsgParamRequestList()
        msg.target_system = targetSystem
        msg.target_component = targetComponent
        connection.sendMessage(id: MsgParamRequestList.id, payload: msg.encode())
    }

    func setParam(name: String, value: Float, type: UInt8 = 9) {
        var msg = MsgParamSet()
        msg.target_system = targetSystem
        msg.target_component = targetComponent
        msg.param_id = name
        msg.param_value = value
        msg.param_type = type  // MAV_PARAM_TYPE_REAL32 = 9
        connection.sendMessage(id: MsgParamSet.id, payload: msg.encode())
    }
}
