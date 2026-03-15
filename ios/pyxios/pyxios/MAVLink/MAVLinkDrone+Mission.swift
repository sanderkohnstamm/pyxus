//
//  MAVLinkDrone+Mission.swift
//  pyxios
//
//  Mission protocol — extracted from MAVLinkDrone.swift.
//

import Foundation

extension MAVLinkDrone {

    // MARK: - Mission Protocol

    func sendMissionCount(_ count: UInt16, missionType: UInt8 = 0) {
        var msg = MsgMissionCount()
        msg.target_system = targetSystem
        msg.target_component = targetComponent
        msg.count = count
        msg.mission_type = missionType
        connection.sendMessage(id: MsgMissionCount.id, payload: msg.encode())
    }

    func sendMissionItemInt(seq: UInt16, frame: UInt8, command: UInt16,
                            current: UInt8 = 0, autocontinue: UInt8 = 1,
                            param1: Float = 0, param2: Float = 0,
                            param3: Float = 0, param4: Float = 0,
                            x: Int32 = 0, y: Int32 = 0, z: Float = 0,
                            missionType: UInt8 = 0) {
        var msg = MsgMissionItemInt()
        msg.target_system = targetSystem
        msg.target_component = targetComponent
        msg.seq = seq
        msg.frame = frame
        msg.command = command
        msg.current = current
        msg.autocontinue = autocontinue
        msg.param1 = param1
        msg.param2 = param2
        msg.param3 = param3
        msg.param4 = param4
        msg.x = x
        msg.y = y
        msg.z = z
        msg.mission_type = missionType
        connection.sendMessage(id: MsgMissionItemInt.id, payload: msg.encode())
    }

    func sendMissionRequestList(missionType: UInt8 = 0) {
        var msg = MsgMissionRequestList()
        msg.target_system = targetSystem
        msg.target_component = targetComponent
        msg.mission_type = missionType
        connection.sendMessage(id: MsgMissionRequestList.id, payload: msg.encode())
    }

    func sendMissionRequestInt(seq: UInt16, missionType: UInt8 = 0) {
        var msg = MsgMissionRequestInt()
        msg.target_system = targetSystem
        msg.target_component = targetComponent
        msg.seq = seq
        msg.mission_type = missionType
        connection.sendMessage(id: MsgMissionRequestInt.id, payload: msg.encode())
    }

    func sendMissionAck(type: UInt8 = 0, missionType: UInt8 = 0) {
        var msg = MsgMissionAck()
        msg.target_system = targetSystem
        msg.target_component = targetComponent
        msg.type = type  // MAV_MISSION_ACCEPTED = 0
        msg.mission_type = missionType
        connection.sendMessage(id: MsgMissionAck.id, payload: msg.encode())
    }

    func sendMissionClearAll(missionType: UInt8 = 0) {
        var msg = MsgMissionClearAll()
        msg.target_system = targetSystem
        msg.target_component = targetComponent
        msg.mission_type = missionType
        connection.sendMessage(id: MsgMissionClearAll.id, payload: msg.encode())
    }

    func sendMissionSetCurrent(seq: UInt16) {
        var msg = MsgMissionSetCurrent()
        msg.target_system = targetSystem
        msg.target_component = targetComponent
        msg.seq = seq
        connection.sendMessage(id: MsgMissionSetCurrent.id, payload: msg.encode())
    }

    /// Wait for a mission protocol message (blocking, with timeout).
    func recvMissionMessage(timeout: TimeInterval = 5.0) -> MAVLinkFrame? {
        let result = missionSemaphore.wait(timeout: .now() + timeout)
        guard result == .success else { return nil }
        missionLock.lock()
        let msg = missionQueue.isEmpty ? nil : missionQueue.removeFirst()
        missionLock.unlock()
        return msg
    }

    /// Clear any stale mission messages from the queue.
    func drainMissionQueue() {
        missionLock.lock()
        missionQueue.removeAll()
        missionLock.unlock()
        // Drain semaphore
        while missionSemaphore.wait(timeout: .now()) == .success {}
    }
}
