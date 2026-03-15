//
//  MissionService.swift
//  pyxios
//
//  Handles mission upload, download, start/pause/clear via MAVLink.
//

import Foundation
import CoreLocation

@Observable
final class MissionService {

    // MARK: - Published State

    var missionUploadStatus: String = ""
    var isMissionUploading = false
    var isMissionDownloading = false
    var downloadedMission: [Waypoint] = []
    var downloadedFence: [CLLocationCoordinate2D] = []

    // MARK: - Drone Reference

    private var drone: MAVLinkDrone?

    /// Called by DroneManager when the connection changes.
    func update(drone: MAVLinkDrone?) {
        self.drone = drone
    }

    /// Reset all state (called on disconnect).
    func reset() {
        drone = nil
        downloadedMission = []
        downloadedFence = []
        isMissionUploading = false
        isMissionDownloading = false
        missionUploadStatus = ""
    }

    // MARK: - Mission Upload

    func uploadMission(waypoints: [Waypoint], repeatFromWaypoint: Int = 0, repeatCount: Int = 0, statusCallback: @escaping (String) -> Void, completion: @escaping (Bool) -> Void) {
        guard let drone else {
            missionUploadStatus = "No drone connected"
            completion(false)
            return
        }

        guard !waypoints.isEmpty else {
            missionUploadStatus = "No waypoints to upload"
            completion(false)
            return
        }

        guard !isMissionDownloading else {
            missionUploadStatus = "Download in progress"
            completion(false)
            return
        }

        isMissionUploading = true
        missionUploadStatus = "Clearing old mission..."
        statusCallback("Uploading mission...")

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }

            // Clear existing mission and wait for ACK
            drone.drainMissionQueue()
            drone.sendMissionClearAll()
            let _ = drone.recvMissionMessage(timeout: 0.5)

            // Drain again before starting upload
            drone.drainMissionQueue()
            let hasDoJump = repeatCount != 0 && repeatFromWaypoint > 0 && repeatFromWaypoint <= waypoints.count
            let totalCount = UInt16(waypoints.count + 1 + (hasDoJump ? 1 : 0))  // +1 home, +1 optional DO_JUMP
            drone.sendMissionCount(totalCount)

            DispatchQueue.main.async {
                self.missionUploadStatus = "Uploading \(waypoints.count) waypoints..."
            }

            let deadline = Date().addingTimeInterval(30)
            var success = false

            while Date() < deadline {
                guard let frame = drone.recvMissionMessage(timeout: 5.0) else {
                    break
                }

                switch frame.messageID {
                case MsgMissionAck.id:
                    let ack = MsgMissionAck(from: frame.payload)
                    success = (ack.type == 0)  // MAV_MISSION_ACCEPTED
                    if !success {
                        DispatchQueue.main.async {
                            self.missionUploadStatus = "Upload rejected: type=\(ack.type)"
                        }
                    }
                    DispatchQueue.main.async {
                        self.finishMissionUpload(success: success, count: waypoints.count, statusCallback: statusCallback, completion: completion)
                    }
                    return

                case MsgMissionRequestInt.id, MsgMissionRequest.id:
                    let seq: UInt16
                    if frame.messageID == MsgMissionRequestInt.id {
                        seq = MsgMissionRequestInt(from: frame.payload).seq
                    } else {
                        seq = MsgMissionRequest(from: frame.payload).seq
                    }

                    DispatchQueue.main.async {
                        self.missionUploadStatus = "Uploading item \(seq)/\(totalCount)"
                        statusCallback("Uploading item \(seq)/\(totalCount)")
                    }

                    if seq == 0 {
                        // Home position
                        drone.sendMissionItemInt(
                            seq: 0,
                            frame: 0,  // MAV_FRAME_GLOBAL
                            command: 16,  // MAV_CMD_NAV_WAYPOINT
                            x: Int32(waypoints[0].latitude * 1e7),
                            y: Int32(waypoints[0].longitude * 1e7),
                            z: 0
                        )
                    } else if seq <= waypoints.count {
                        let wp = waypoints[Int(seq) - 1]
                        self.sendMissionItem(drone: drone, seq: seq, waypoint: wp)
                    } else if hasDoJump && seq == UInt16(waypoints.count + 1) {
                        // DO_JUMP: jump back to repeatFromWaypoint (seq = wp index since home is seq 0)
                        drone.sendMissionItemInt(
                            seq: seq,
                            frame: 2,   // MAV_FRAME_MISSION
                            command: 177,  // MAV_CMD_DO_JUMP
                            param1: Float(repeatFromWaypoint),  // target seq (1-based = matches our wp index)
                            param2: Float(repeatCount)  // repeat count (-1 = infinite)
                        )
                    }

                default:
                    break
                }
            }

            // Timeout
            DispatchQueue.main.async {
                self.finishMissionUpload(success: false, count: waypoints.count, statusCallback: statusCallback, completion: completion)
            }
        }
    }

    private func sendMissionItem(drone: MAVLinkDrone, seq: UInt16, waypoint: Waypoint) {
        let command: UInt16
        let frame: UInt8
        var x: Int32 = Int32(waypoint.latitude * 1e7)
        var y: Int32 = Int32(waypoint.longitude * 1e7)
        var z: Float = waypoint.altitude

        switch waypoint.action {
        case .waypoint:
            command = 16; frame = 3
        case .takeoff:
            command = 22; frame = 3
        case .land:
            command = 21; frame = 3
        case .loiter:
            command = 17; frame = 3
        case .loiterTurns:
            command = 18; frame = 3
        case .returnToLaunch:
            command = 20; frame = 2; x = 0; y = 0; z = 0
        case .speedChange:
            command = 178; frame = 2; x = 0; y = 0; z = 0
        case .regionOfInterest:
            command = 201; frame = 2; x = 0; y = 0; z = 0
        }

        drone.sendMissionItemInt(
            seq: seq,
            frame: frame,
            command: command,
            param1: waypoint.loiterTime,
            param2: waypoint.acceptRadius,
            param3: waypoint.loiterRadius,
            param4: waypoint.yawAngle,
            x: x, y: y, z: z
        )
    }

    private func finishMissionUpload(success: Bool, count: Int, statusCallback: @escaping (String) -> Void, completion: @escaping (Bool) -> Void) {
        isMissionUploading = false
        if success {
            missionUploadStatus = "Uploaded (\(count) items)"
            statusCallback("Mission uploaded")
            HapticManager.shared.trigger(style: "success")
        } else {
            if missionUploadStatus.isEmpty || !missionUploadStatus.contains("rejected") {
                missionUploadStatus = "Upload failed"
            }
            statusCallback("Mission upload failed")
            HapticManager.shared.trigger(style: "error")
        }
        completion(success)
    }

    // MARK: - Mission Start / Pause / Clear

    func startMission(fromSeq: UInt16 = 1, statusCallback: @escaping (String) -> Void) {
        guard let drone else { return }
        drone.sendMissionSetCurrent(seq: fromSeq)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            if drone.isArdupilot {
                drone.setMode("AUTO")
            } else {
                drone.setMode("AUTO_MISSION")
            }
        }
        statusCallback(fromSeq > 1 ? "Continuing from WP \(fromSeq)" : "Mission started")
        HapticManager.shared.trigger(style: "success")
    }

    func pauseMission(statusCallback: @escaping (String) -> Void) {
        drone?.hold()
        statusCallback("Mission paused")
    }

    func clearMission(statusCallback: @escaping (String) -> Void) {
        drone?.sendMissionClearAll()
        statusCallback("Mission cleared")
    }

    // MARK: - Mission Download

    func downloadMission(statusCallback: @escaping (String) -> Void, completion: @escaping ([Waypoint]?, _ repeatFrom: Int, _ repeatCount: Int) -> Void) {
        guard let drone else {
            statusCallback("No drone connected")
            completion(nil, 0, 0)
            return
        }

        guard !isMissionUploading else {
            statusCallback("Upload in progress")
            completion(nil, 0, 0)
            return
        }

        isMissionDownloading = true
        statusCallback("Downloading mission...")

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }

            drone.drainMissionQueue()
            drone.sendMissionRequestList()

            // Wait for MISSION_COUNT
            guard let countFrame = drone.recvMissionMessage(timeout: 5.0),
                  countFrame.messageID == MsgMissionCount.id else {
                DispatchQueue.main.async {
                    self.isMissionDownloading = false
                    statusCallback("Mission download timeout")
                    completion(nil, 0, 0)
                }
                return
            }

            let count = Int(MsgMissionCount(from: countFrame.payload).count)
            if count == 0 {
                DispatchQueue.main.async {
                    self.isMissionDownloading = false
                    statusCallback("No mission on drone")
                    completion([], 0, 0)
                }
                return
            }

            var items: [MsgMissionItemInt] = []

            for seq in 0..<UInt16(count) {
                drone.sendMissionRequestInt(seq: seq)

                guard let itemFrame = drone.recvMissionMessage(timeout: 5.0),
                      itemFrame.messageID == MsgMissionItemInt.id else {
                    DispatchQueue.main.async {
                        self.isMissionDownloading = false
                        statusCallback("Download failed at item \(seq)")
                        completion(nil, 0, 0)
                    }
                    return
                }

                items.append(MsgMissionItemInt(from: itemFrame.payload))
            }

            // Send ACK
            drone.sendMissionAck(type: 0)

            // Convert to Waypoints, skipping seq 0 (home) and DO_JUMP items
            var waypoints: [Waypoint] = []
            var dlRepeatFrom = 0
            var dlRepeatCount = 0
            for item in items where item.seq > 0 {
                // DO_JUMP (177): extract repeat info, don't add as waypoint
                if item.command == 177 {
                    dlRepeatFrom = Int(item.param1)
                    dlRepeatCount = Int(item.param2)
                    continue
                }

                let lat = Double(item.x) / 1e7
                let lon = Double(item.y) / 1e7
                let coord = CLLocationCoordinate2D(latitude: lat, longitude: lon)

                var wp = Waypoint(coordinate: coord, altitude: item.z)
                wp.action = Self.waypointAction(from: item.command)
                wp.loiterTime = item.param1
                wp.acceptRadius = item.param2
                wp.loiterRadius = item.param3
                wp.yawAngle = item.param4

                waypoints.append(wp)
            }

            let repeatFrom = dlRepeatFrom
            let repeatCt = dlRepeatCount

            DispatchQueue.main.async {
                self.isMissionDownloading = false
                statusCallback("Downloaded \(waypoints.count) waypoints")
                completion(waypoints, repeatFrom, repeatCt)
            }
        }
    }

    // MARK: - Fence Download

    func downloadFence(statusCallback: @escaping (String) -> Void) {
        guard let drone else {
            statusCallback("No drone connected")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }

            drone.drainMissionQueue()
            drone.sendMissionRequestList(missionType: 1)  // MAV_MISSION_TYPE_FENCE

            // Wait for MISSION_COUNT
            guard let countFrame = drone.recvMissionMessage(timeout: 5.0),
                  countFrame.messageID == MsgMissionCount.id else {
                DispatchQueue.main.async {
                    statusCallback("No fence on drone")
                }
                return
            }

            let count = Int(MsgMissionCount(from: countFrame.payload).count)
            if count == 0 {
                DispatchQueue.main.async {
                    statusCallback("No fence items")
                }
                return
            }

            var points: [CLLocationCoordinate2D] = []

            for seq in 0..<UInt16(count) {
                drone.sendMissionRequestInt(seq: seq, missionType: 1)

                guard let itemFrame = drone.recvMissionMessage(timeout: 5.0),
                      itemFrame.messageID == MsgMissionItemInt.id else {
                    DispatchQueue.main.async {
                        statusCallback("Fence download failed at \(seq)")
                    }
                    return
                }

                let item = MsgMissionItemInt(from: itemFrame.payload)
                let lat = Double(item.x) / 1e7
                let lon = Double(item.y) / 1e7
                if lat != 0 || lon != 0 {
                    points.append(CLLocationCoordinate2D(latitude: lat, longitude: lon))
                }
            }

            drone.sendMissionAck(type: 0, missionType: 1)

            DispatchQueue.main.async {
                self.downloadedFence = points
                statusCallback("Downloaded \(points.count) fence points")
            }
        }
    }

    static func waypointAction(from command: UInt16) -> Waypoint.WaypointAction {
        switch command {
        case 16: return .waypoint
        case 22: return .takeoff
        case 21: return .land
        case 17: return .loiter
        case 18: return .loiterTurns
        case 20: return .returnToLaunch
        case 178: return .speedChange
        case 201: return .regionOfInterest
        default: return .waypoint
        }
    }
}
