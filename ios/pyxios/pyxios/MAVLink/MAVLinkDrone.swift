//
//  MAVLinkDrone.swift
//  pyxios
//
//  High-level MAVLink drone API — port of backend/drone.py patterns.
//  Handles telemetry parsing, commands, mode management, mission protocol.
//

import Foundation
import CoreLocation

// MARK: - ArduPilot Mode Maps

/// ArduPilot mode mappings per vehicle type (custom_mode → name).
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

    /// MAV_TYPE → mode dict. Multirotor types → copter, VTOL → plane.
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

    /// Reverse lookup: mode name → custom_mode ID for a given MAV_TYPE.
    static func modeID(name: String, mavType: UInt8) -> UInt32? {
        let modes = modesForType(mavType)
        return modes.first(where: { $0.value == name })?.key
    }
}

/// PX4 mode mappings (main_mode, sub_mode) → name.
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

// MARK: - MAVLink Drone

/// Thread-safe telemetry snapshot passed from network queue to main queue.
struct TelemetrySnapshot: Sendable {
    var armed = false
    var mode = ""
    var systemStatus: UInt8 = 0
    var lat: Double = 0
    var lon: Double = 0
    var altRelative: Float = 0
    var altMSL: Float = 0
    var roll: Float = 0
    var pitch: Float = 0
    var yaw: Float = 0
    var groundSpeed: Float = 0
    var airSpeed: Float = 0
    var climbRate: Float = 0
    var heading: UInt16 = 0
    var batteryVoltage: Float = 0
    var batteryCurrent: Float = 0
    var batteryRemaining: Int8 = -1
    var gpsFixType: UInt8 = 0
    var satellites: UInt8 = 0
    var hdop: Float = 99.99
    var homeLat: Double = 0
    var homeLon: Double = 0
    var homeAlt: Float = 0
    var missionSeq: UInt16 = 0
    var linkLost = false
    var mavType: UInt8 = 2
    var isArdupilot = true
    var messageRates: [String: (count: Int, firstSeen: Date)] = [:]
    var lastPayloads: [String: Data] = [:]
}

/// High-level MAVLink drone API. Connects via UDP, parses telemetry, sends commands.
final class MAVLinkDrone {

    let connection = MAVLinkConnection()

    // Target system/component (set from first heartbeat)
    private(set) var targetSystem: UInt8 = 1
    private(set) var targetComponent: UInt8 = 1
    private(set) var isArdupilot = true
    private(set) var mavType: UInt8 = 2  // default quadrotor

    // Callbacks (called on main thread)
    var onTelemetryUpdate: ((TelemetrySnapshot) -> Void)?
    var onStatusText: ((UInt8, String) -> Void)?  // (severity, text)
    var onParamValue: ((String, Float, UInt8, UInt16, UInt16) -> Void)?  // (name, value, type, index, count)
    var onCommandAck: ((UInt16, UInt8) -> Void)?  // (command, result)
    var onCameraMessage: ((UInt32, Data) -> Void)?  // (messageID, payload)
    var onConnectionStateChanged: ((MAVLinkConnection.State) -> Void)?

    // Telemetry state — only accessed from network queue
    private var armed = false
    private var mode = ""
    private var systemStatus: UInt8 = 0
    var lastHeartbeat: Date = .distantPast

    // Position
    private var lat: Double = 0
    private var lon: Double = 0
    private var altRelative: Float = 0
    private var altMSL: Float = 0

    // Attitude
    private var roll: Float = 0
    private var pitch: Float = 0
    private var yaw: Float = 0

    // Velocity
    private var groundSpeed: Float = 0
    private var airSpeed: Float = 0
    private var climbRate: Float = 0
    private var heading: UInt16 = 0

    // Battery
    private var batteryVoltage: Float = 0
    private var batteryCurrent: Float = 0
    private var batteryRemaining: Int8 = -1

    // GPS
    private var gpsFixType: UInt8 = 0
    private var satellites: UInt8 = 0
    private var hdop: Float = 99.99

    // Home
    private var homeLat: Double = 0
    private var homeLon: Double = 0
    private var homeAlt: Float = 0

    // Mission
    private var missionSeq: UInt16 = 0

    // Link
    var linkLost = false
    private var linkLostTime: Date?
    private let heartbeatTimeout: TimeInterval = 3.0
    private var linkCheckTimer: DispatchSourceTimer?

    // Stream rate tracking
    private var messageRates: [String: (count: Int, firstSeen: Date)] = [:]

    // Last raw payload per message type (for inspector)
    private var lastPayloads: [String: Data] = [:]

    /// Create a thread-safe snapshot of current telemetry state.
    private func makeSnapshot() -> TelemetrySnapshot {
        TelemetrySnapshot(
            armed: armed, mode: mode, systemStatus: systemStatus,
            lat: lat, lon: lon, altRelative: altRelative, altMSL: altMSL,
            roll: roll, pitch: pitch, yaw: yaw,
            groundSpeed: groundSpeed, airSpeed: airSpeed, climbRate: climbRate, heading: heading,
            batteryVoltage: batteryVoltage, batteryCurrent: batteryCurrent, batteryRemaining: batteryRemaining,
            gpsFixType: gpsFixType, satellites: satellites, hdop: hdop,
            homeLat: homeLat, homeLon: homeLon, homeAlt: homeAlt,
            missionSeq: missionSeq, linkLost: linkLost,
            mavType: mavType, isArdupilot: isArdupilot,
            messageRates: messageRates, lastPayloads: lastPayloads
        )
    }

    // Mission protocol queue
    private var missionQueue: [MAVLinkFrame] = []
    private let missionLock = NSLock()
    private let missionSemaphore = DispatchSemaphore(value: 0)

    // MARK: - Connect / Disconnect

    /// Whether we've received the first heartbeat and requested data streams.
    private var hasRequestedStreams = false

    func connect(host: String, port: UInt16) {
        hasRequestedStreams = false
        connection.connect(host: host, port: port, onFrame: { [weak self] frame in
            self?.handleFrame(frame)
        }, onState: { [weak self] state in
            DispatchQueue.main.async {
                self?.onConnectionStateChanged?(state)
            }
        })
        startLinkCheck()
    }

    func listen(port: UInt16) {
        hasRequestedStreams = false
        connection.listen(port: port, onFrame: { [weak self] frame in
            self?.handleFrame(frame)
        }, onState: { [weak self] state in
            DispatchQueue.main.async {
                self?.onConnectionStateChanged?(state)
            }
        })
        startLinkCheck()
    }

    func disconnect() {
        linkCheckTimer?.cancel()
        linkCheckTimer = nil
        hasRequestedStreams = false
        lastHeartbeat = .distantPast
        connection.disconnect()
    }

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

    // MARK: - Data Streams

    func requestDataStreams() {
        if isArdupilot {
            // ArduPilot: REQUEST_DATA_STREAM
            let streams: [(UInt8, UInt16)] = [
                (0, 2),   // ALL at 2Hz
                (1, 2),   // RAW_SENSORS
                (2, 2),   // EXTENDED_STATUS
                (3, 2),   // RC_CHANNELS
                (6, 4),   // POSITION at 4Hz
                (10, 4),  // EXTRA1 (attitude) at 4Hz
                (11, 2),  // EXTRA2 (VFR_HUD)
                (12, 2),  // EXTRA3
            ]
            for (streamID, rate) in streams {
                var msg = MsgRequestDataStream()
                msg.target_system = targetSystem
                msg.target_component = targetComponent
                msg.req_stream_id = streamID
                msg.req_message_rate = rate
                msg.start_stop = 1
                connection.sendMessage(id: MsgRequestDataStream.id, payload: msg.encode())
            }
        } else {
            // PX4: SET_MESSAGE_INTERVAL
            let intervals: [(UInt32, Int32)] = [
                (MsgHeartbeat.id, 1_000_000),
                (MsgAttitude.id, 100_000),        // 10Hz
                (MsgGlobalPositionInt.id, 200_000), // 5Hz
                (MsgGpsRawInt.id, 1_000_000),
                (MsgVfrHud.id, 500_000),
                (MsgSysStatus.id, 1_000_000),
                (MsgHomePosition.id, 2_000_000),
                (MsgRcChannels.id, 500_000),
            ]
            for (msgID, intervalUS) in intervals {
                // MAV_CMD_SET_MESSAGE_INTERVAL = 511
                sendCommandLong(command: 511, param1: Float(msgID), param2: Float(intervalUS))
            }
        }
    }

    // MARK: - Calibration

    func requestCalibration(gyro: Bool = false, mag: Bool = false, accel: Bool = false, radio: Bool = false) {
        // MAV_CMD_PREFLIGHT_CALIBRATION = 241
        sendCommandLong(
            command: 241,
            param1: gyro ? 1 : 0,
            param2: mag ? 1 : 0,
            param3: 0,  // ground pressure
            param4: radio ? 1 : 0,
            param5: accel ? 1 : 0
        )
    }

    // MARK: - Motor Test

    func motorTest(motor: Int, throttle: Float, duration: Float, motorCount: Int = 1) {
        if isArdupilot {
            // MAV_CMD_DO_MOTOR_TEST = 209
            sendCommandLong(
                command: 209,
                param1: Float(motor),
                param2: 0,  // throttle type = percent
                param3: throttle,
                param4: duration,
                param5: Float(motorCount)
            )
        } else {
            // MAV_CMD_ACTUATOR_TEST = 310
            let value = throttle / 100.0
            let motorFunction = Float(100 + motor)
            sendCommandLong(command: 310, param1: value, param2: duration, param5: motorFunction)
        }
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

    // MARK: - Link Loss Detection

    private func startLinkCheck() {
        linkCheckTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: .global(qos: .utility))
        timer.schedule(deadline: .now() + 1, repeating: 1.0)
        timer.setEventHandler { [weak self] in
            guard let self else { return }
            if self.lastHeartbeat != .distantPast &&
                Date().timeIntervalSince(self.lastHeartbeat) > self.heartbeatTimeout {
                if !self.linkLost {
                    self.linkLost = true
                    self.linkLostTime = Date()
                    let snapshot = self.makeSnapshot()
                    DispatchQueue.main.async {
                        self.onTelemetryUpdate?(snapshot)
                    }
                }
            }
        }
        timer.resume()
        linkCheckTimer = timer
    }

    // MARK: - Frame Handler

    private func handleFrame(_ frame: MAVLinkFrame) {
        let msgID = frame.messageID

        // Track message rate and store last payload
        let msgName = MAVLinkCRCExtras.messageNames[msgID] ?? "MSG_\(msgID)"
        trackRate(msgName)
        lastPayloads[msgName] = frame.payload

        // Route mission protocol messages to dedicated queue
        switch msgID {
        case MsgMissionRequestInt.id, MsgMissionRequest.id, MsgMissionAck.id,
             MsgMissionCount.id, MsgMissionItemInt.id:
            missionLock.lock()
            missionQueue.append(frame)
            missionLock.unlock()
            missionSemaphore.signal()
            return
        default:
            break
        }

        // Route PARAM_VALUE
        if msgID == MsgParamValue.id {
            let pv = MsgParamValue(from: frame.payload)
            let name = pv.param_id
            DispatchQueue.main.async { [weak self] in
                self?.onParamValue?(name, pv.param_value, pv.param_type, pv.param_index, pv.param_count)
            }
            return
        }

        // Route STATUSTEXT
        if msgID == MsgStatustext.id {
            let st = MsgStatustext(from: frame.payload)
            DispatchQueue.main.async { [weak self] in
                self?.onStatusText?(st.severity, st.text)
            }
            return
        }

        // Route camera messages
        switch msgID {
        case MsgCameraInformation.id, MsgCameraSettings.id,
             MsgVideoStreamInformation.id, MsgCameraCaptureStatus.id,
             MsgCameraImageCaptured.id:
            let payload = frame.payload
            DispatchQueue.main.async { [weak self] in
                self?.onCameraMessage?(msgID, payload)
            }
            return
        default:
            break
        }

        // Route COMMAND_ACK
        if msgID == MsgCommandAck.id {
            let ack = MsgCommandAck(from: frame.payload)
            DispatchQueue.main.async { [weak self] in
                self?.onCommandAck?(ack.command, ack.result)
            }
            return
        }

        // Telemetry updates
        var updated = false

        switch msgID {
        case MsgHeartbeat.id:
            let hb = MsgHeartbeat(from: frame.payload)

            // Skip GCS heartbeats
            if hb.type == 6 { return }

            // First heartbeat sets target
            if lastHeartbeat == .distantPast {
                targetSystem = frame.systemID
                targetComponent = frame.componentID
                mavType = hb.type
                isArdupilot = (hb.autopilot == 3)  // MAV_AUTOPILOT_ARDUPILOTMEGA
            }

            // Only process from our target
            guard frame.systemID == targetSystem && frame.componentID == targetComponent else { return }

            armed = (hb.base_mode & 0x80) != 0  // MAV_MODE_FLAG_SAFETY_ARMED
            systemStatus = hb.system_status
            lastHeartbeat = Date()

            if isArdupilot {
                let modes = ArduPilotModes.modesForType(mavType)
                mode = modes[hb.custom_mode] ?? "MODE_\(hb.custom_mode)"
            } else {
                mode = PX4Modes.decode(customMode: hb.custom_mode)
            }

            // Link recovery — re-request streams (vehicle may have rebooted)
            if linkLost {
                linkLost = false
                hasRequestedStreams = false
            }

            // Request data streams once after first heartbeat (or after link recovery)
            if !hasRequestedStreams {
                hasRequestedStreams = true
                requestDataStreams()
            }
            updated = true

        case MsgAttitude.id:
            let att = MsgAttitude(from: frame.payload)
            roll = att.roll
            pitch = att.pitch
            yaw = att.yaw
            updated = true

        case MsgGlobalPositionInt.id:
            let pos = MsgGlobalPositionInt(from: frame.payload)
            lat = Double(pos.lat) / 1e7
            lon = Double(pos.lon) / 1e7
            altRelative = Float(pos.relative_alt) / 1000.0
            altMSL = Float(pos.alt) / 1000.0
            updated = true

        case MsgGpsRawInt.id:
            let gps = MsgGpsRawInt(from: frame.payload)
            gpsFixType = gps.fix_type
            satellites = gps.satellites_visible
            hdop = gps.eph != 65535 ? Float(gps.eph) / 100.0 : 99.99
            updated = true

        case MsgVfrHud.id:
            let hud = MsgVfrHud(from: frame.payload)
            airSpeed = hud.airspeed
            groundSpeed = hud.groundspeed
            heading = UInt16(hud.heading)
            climbRate = hud.climb
            updated = true

        case MsgSysStatus.id:
            let sys = MsgSysStatus(from: frame.payload)
            batteryVoltage = Float(sys.voltage_battery) / 1000.0
            batteryCurrent = sys.current_battery != -1 ? Float(sys.current_battery) / 100.0 : 0
            batteryRemaining = Int8(clamping: sys.battery_remaining)
            updated = true

        case MsgMissionCurrent.id:
            let mc = MsgMissionCurrent(from: frame.payload)
            missionSeq = mc.seq
            updated = true

        case MsgHomePosition.id:
            let hp = MsgHomePosition(from: frame.payload)
            homeLat = Double(hp.latitude) / 1e7
            homeLon = Double(hp.longitude) / 1e7
            homeAlt = Float(hp.altitude) / 1000.0
            updated = true

        case MsgBatteryStatus.id:
            let bs = MsgBatteryStatus(from: frame.payload)
            if bs.battery_remaining >= 0 {
                batteryRemaining = Int8(clamping: bs.battery_remaining)
            }
            updated = true

        default:
            break
        }

        if updated {
            let snapshot = makeSnapshot()
            DispatchQueue.main.async { [weak self] in
                self?.onTelemetryUpdate?(snapshot)
            }
        }
    }

    // MARK: - Rate Tracking

    private func trackRate(_ name: String) {
        if var existing = messageRates[name] {
            existing.count += 1
            messageRates[name] = existing
        } else {
            messageRates[name] = (count: 1, firstSeen: Date())
        }
    }
}
