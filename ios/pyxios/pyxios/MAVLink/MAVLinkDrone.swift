//
//  MAVLinkDrone.swift
//  pyxios
//
//  High-level MAVLink drone API — port of backend/drone.py patterns.
//  Core: properties, connect/disconnect, telemetry parsing, frame routing.
//  Commands, mission, params, manual control, and calibration are in extensions.
//

import Foundation

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
    var sensorHealth: UInt32 = 0
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
    var onCommandLongReceived: ((UInt16, Float) -> Void)?  // (command, param1) — for ArduPilot accel cal prompts
    var onMagCalProgress: ((UInt8, UInt8, UInt8, UInt8) -> Void)?  // (compassId, calMask, percent, status)
    var onMagCalReport: ((UInt8, UInt8, Float) -> Void)?    // (compassId, status, fitness)
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

    // Sensor health
    private var sensorHealth: UInt32 = 0

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
            sensorHealth: sensorHealth,
            messageRates: messageRates, lastPayloads: lastPayloads
        )
    }

    // Mission protocol queue (internal for extension access)
    var missionQueue: [MAVLinkFrame] = []
    let missionLock = NSLock()
    let missionSemaphore = DispatchSemaphore(value: 0)

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
            // Explicitly request HOME_POSITION (not always in data streams)
            // MAV_CMD_REQUEST_MESSAGE = 512, param1 = message ID (242 = HOME_POSITION)
            sendCommandLong(command: 512, param1: Float(MsgHomePosition.id))
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

        // Route incoming COMMAND_LONG (ArduPilot accel cal sends vehicle position prompts)
        if msgID == MsgCommandLong.id {
            let cmd = MsgCommandLong(from: frame.payload)
            DispatchQueue.main.async { [weak self] in
                self?.onCommandLongReceived?(cmd.command, cmd.param1)
            }
            return
        }

        // Route MAG_CAL_PROGRESS
        if msgID == MsgMagCalProgress.id {
            let prog = MsgMagCalProgress(from: frame.payload)
            DispatchQueue.main.async { [weak self] in
                self?.onMagCalProgress?(prog.compass_id, prog.cal_mask, prog.completion_pct, prog.cal_status)
            }
            return
        }

        // Route MAG_CAL_REPORT
        if msgID == MsgMagCalReport.id {
            let report = MsgMagCalReport(from: frame.payload)
            DispatchQueue.main.async { [weak self] in
                self?.onMagCalReport?(report.compass_id, report.cal_status, report.fitness)
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
            sensorHealth = sys.onboard_control_sensors_health
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
