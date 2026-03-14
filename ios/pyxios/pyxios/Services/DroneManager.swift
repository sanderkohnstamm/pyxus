//
//  DroneManager.swift
//  pyxios
//
//  Singleton wrapping MAVLinkDrone for direct MAVLink v2 communication.
//  Publishes @Observable properties for SwiftUI consumption.
//

import Foundation
import CoreLocation

// MARK: - Param Model

struct DroneParam: Identifiable {
    var id: String { name }
    let name: String
    var value: String      // display value
    var floatValue: Float?
    var intValue: Int32?
    var isFloat: Bool
}

// MARK: - Status Text Model

struct StatusMessage: Identifiable {
    let id = UUID()
    let timestamp: Date
    let type: String     // "INFO", "WARN", "ERROR", etc.
    let text: String
}

// MARK: - Log Entry Model

struct LogEntry: Identifiable {
    let id: Int
    let date: String
    let sizeBytes: Int
}

// MARK: - Telemetry Stream Model

struct TelemetryStream: Identifiable {
    let id: String     // stream name
    let name: String
    var hz: Double = 0
    var lastValue: String = ""
    var lastUpdate: Date = .distantPast
    var updateCount: Int = 0
    var firstUpdate: Date = .distantPast
}

@Observable
final class DroneManager {
    static let shared = DroneManager()

    // MARK: - Published State

    var state = VehicleState()
    var statusMessage: String = ""

    // Tools state
    var params: [DroneParam] = []
    var isLoadingParams = false
    var statusMessages: [StatusMessage] = []
    var logEntries: [LogEntry] = []
    var isLoadingLogs = false

    // Telemetry stream rates for inspector
    var telemetryStreams: [TelemetryStream] = []

    // Manual control state (normalized -1..1, throttle 0..1)
    var manualControlActive = false
    var manualX: Float = 0      // pitch  (-1 = nose down, 1 = nose up)
    var manualY: Float = 0      // roll   (-1 = left, 1 = right)
    var manualZ: Float = 0.5    // throttle (0 = min, 1 = max)
    var manualR: Float = 0      // yaw    (-1 = left, 1 = right)

    // MARK: - Private

    private var drone: MAVLinkDrone?
    private var manualControlTimer: Timer?
    private var paramCount: UInt16 = 0
    private var paramBuffer: [String: DroneParam] = [:]

    private init() {}

    // MARK: - Connection

    func connect(address: String) {
        switch state.connectionState {
        case .disconnected, .error:
            break
        case .connecting, .connected:
            return
        }

        state.connectionState = .connecting
        statusMessage = "Connecting..."

        let mav = MAVLinkDrone()
        drone = mav

        mav.onConnectionStateChanged = { [weak self] connState in
            guard let self else { return }
            switch connState {
            case .ready:
                self.state.connectionState = .connected
                self.statusMessage = "Connected"
            case .failed(let err):
                self.state.connectionState = .error(err)
                self.statusMessage = "Connection failed: \(err)"
            case .idle:
                self.state.connectionState = .disconnected
            case .connecting:
                break
            }
        }

        mav.onTelemetryUpdate = { [weak self] drone in
            self?.updateTelemetry(from: drone)
        }

        mav.onStatusText = { [weak self] severity, text in
            self?.handleStatusText(severity: severity, text: text)
        }

        mav.onParamValue = { [weak self] name, value, type, index, count in
            self?.handleParamValue(name: name, value: value, type: type, index: index, count: count)
        }

        mav.onCommandAck = { [weak self] command, result in
            self?.handleCommandAck(command: command, result: result)
        }

        // Parse URI: "udp://0.0.0.0:14550" (listen), "udp://host:port" (connect), "tcp://host:port"
        let parsed = Self.parseConnectionURI(address)

        switch parsed.mode {
        case .udpListen:
            statusMessage = "Listening on port \(parsed.port)..."
            mav.listen(port: parsed.port)
        case .udpConnect:
            statusMessage = "Connecting to \(parsed.host):\(parsed.port)..."
            mav.connect(host: parsed.host, port: parsed.port)
        case .tcpConnect:
            statusMessage = "Connecting via TCP to \(parsed.host):\(parsed.port)..."
            mav.connect(host: parsed.host, port: parsed.port)
        }

        startStreamFlush()
        AppSettings.shared.addToHistory(address)
    }

    // MARK: - URI Parsing

    enum ConnectionMode {
        case udpListen
        case udpConnect
        case tcpConnect
    }

    struct ParsedConnection {
        let mode: ConnectionMode
        let host: String
        let port: UInt16
    }

    static func parseConnectionURI(_ address: String) -> ParsedConnection {
        let trimmed = address.trimmingCharacters(in: .whitespaces)

        // Strip scheme
        var remainder = trimmed
        var scheme = "udp"
        if remainder.hasPrefix("udp://") {
            scheme = "udp"
            remainder = String(remainder.dropFirst(6))
        } else if remainder.hasPrefix("tcp://") {
            scheme = "tcp"
            remainder = String(remainder.dropFirst(6))
        }

        // Parse host:port from remainder
        let host: String
        let port: UInt16

        // Check for [IPv6]:port format
        if remainder.hasPrefix("["), let closeBracket = remainder.firstIndex(of: "]") {
            host = String(remainder[remainder.index(after: remainder.startIndex)..<closeBracket])
            let afterBracket = remainder[remainder.index(after: closeBracket)...]
            if afterBracket.hasPrefix(":"), let p = UInt16(afterBracket.dropFirst()) {
                port = p
            } else {
                port = 14550
            }
        } else if let lastColon = remainder.lastIndex(of: ":") {
            let beforeColon = String(remainder[..<lastColon])
            let afterColon = String(remainder[remainder.index(after: lastColon)...])
            if let p = UInt16(afterColon) {
                host = beforeColon
                port = p
            } else {
                host = remainder
                port = 14550
            }
        } else {
            // Port-only (e.g., "14550") or host-only
            if let p = UInt16(remainder) {
                host = "0.0.0.0"
                port = p
            } else {
                host = remainder.isEmpty ? "0.0.0.0" : remainder
                port = 14550
            }
        }

        // Determine mode
        if scheme == "tcp" {
            return ParsedConnection(mode: .tcpConnect, host: host, port: port)
        }

        // UDP: listen if host is 0.0.0.0 or empty, connect otherwise
        let isListen = host.isEmpty || host == "0.0.0.0" || host == ":"
        return ParsedConnection(mode: isListen ? .udpListen : .udpConnect, host: host, port: port)
    }

    func disconnect() {
        stopManualControl()
        drone?.disconnect()
        drone = nil

        state = VehicleState()
        state.connectionState = .disconnected
        streamFlushTimer?.invalidate()
        streamFlushTimer = nil
        streamBuffer = [:]
        statusMessage = "Disconnected"
        params = []
        paramBuffer = [:]
        statusMessages = []
        logEntries = []
        telemetryStreams = []
    }

    // MARK: - Flight Actions

    func arm() {
        drone?.arm()
        statusMessage = "Arming..."
        HapticManager.shared.trigger(style: "success")
    }

    func disarm() {
        drone?.disarm()
        statusMessage = "Disarming..."
        HapticManager.shared.trigger(style: "success")
    }

    func takeoff(altitude: Float = 2.5) {
        guard let drone else { return }
        statusMessage = "Preparing takeoff..."

        if state.armed {
            drone.takeoff(altitude: altitude)
            statusMessage = "Taking off"
            HapticManager.shared.trigger(style: "success")
        } else {
            drone.arm()
            statusMessage = "Arming..."
            // Wait for armed state then takeoff
            waitForArmedThenTakeoff(altitude: altitude, attempts: 0)
        }
    }

    private func waitForArmedThenTakeoff(altitude: Float, attempts: Int) {
        if state.armed {
            drone?.takeoff(altitude: altitude)
            statusMessage = "Taking off"
            HapticManager.shared.trigger(style: "success")
        } else if attempts < 20 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
                self?.waitForArmedThenTakeoff(altitude: altitude, attempts: attempts + 1)
            }
        } else {
            drone?.takeoff(altitude: altitude)
            statusMessage = "Armed state not confirmed, trying takeoff..."
        }
    }

    func land() {
        drone?.land()
        statusMessage = "Landing"
        HapticManager.shared.trigger(style: "success")
    }

    func returnToLaunch() {
        drone?.returnToLaunch()
        statusMessage = "Returning to launch"
        HapticManager.shared.trigger(style: "warning")
    }

    func hold() {
        drone?.hold()
        statusMessage = "Holding position"
    }

    func setFlightMode(_ mode: String) {
        guard let drone else { return }
        switch mode.lowercased() {
        case "rtl", "return":
            returnToLaunch()
        case "land":
            land()
        case "hold", "loiter":
            hold()
        case "takeoff":
            takeoff()
        case "auto":
            startMission()
        case "guided":
            if state.hasValidPosition {
                let alt = state.altitudeAMSL > 0 ? state.altitudeAMSL : 10
                drone.gotoLocation(lat: state.coordinate.latitude,
                                   lon: state.coordinate.longitude,
                                   alt: alt)
                statusMessage = "Guided mode"
                HapticManager.shared.trigger(style: "success")
            } else {
                hold()
            }
        default:
            // Try setting the mode directly by name
            drone.setMode(mode.uppercased())
            statusMessage = "Setting \(mode)"
        }
    }

    // MARK: - Manual Control

    func startManualControl() {
        guard !manualControlActive else { return }
        manualControlActive = true
        manualX = 0; manualY = 0; manualZ = 0.5; manualR = 0
        statusMessage = "Manual control active"

        manualControlTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            self?.sendManualControlInput()
        }
    }

    func stopManualControl() {
        manualControlActive = false
        manualX = 0; manualY = 0; manualZ = 0.5; manualR = 0

        var remaining = 10
        manualControlTimer?.invalidate()
        manualControlTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
            guard let self else { timer.invalidate(); return }
            self.sendManualControlInput()
            remaining -= 1
            if remaining <= 0 {
                timer.invalidate()
                self.manualControlTimer = nil
            }
        }
        statusMessage = "Manual control off"
    }

    private func sendManualControlInput() {
        guard let drone, manualControlActive else { return }
        // MANUAL_CONTROL uses int16 for all axes: x/y/r (-1000..1000), z (0..1000)
        drone.sendManualControl(
            x: Int16(manualX * 1000),
            y: Int16(manualY * 1000),
            z: Int16(manualZ * 1000),
            r: Int16(manualR * 1000)
        )
    }

    // MARK: - Parameters

    func fetchAllParams() {
        guard let drone else { return }
        isLoadingParams = true
        paramBuffer = [:]
        paramCount = 0
        drone.requestAllParams()
    }

    func setParam(name: String, value: String) {
        guard let drone else { return }
        if let floatVal = Float(value) {
            drone.setParam(name: name, value: floatVal)
            statusMessage = "Setting \(name) = \(value)"
        }
    }

    // MARK: - Log Files

    func fetchLogEntries() {
        // Log file management requires MAVLink FTP or LOG_REQUEST_LIST
        // Not directly supported in basic MAVLink — placeholder for future implementation
        statusMessage = "Log download not yet available via native MAVLink"
    }

    // MARK: - Mission Upload

    var missionUploadStatus: String = ""
    var isMissionUploading = false

    func uploadMission(waypoints: [Waypoint], completion: @escaping (Bool) -> Void) {
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

        isMissionUploading = true
        missionUploadStatus = "Clearing old mission..."
        statusMessage = "Uploading mission..."

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }

            // Clear existing mission
            drone.sendMissionClearAll()
            Thread.sleep(forTimeInterval: 0.3)

            // Upload
            drone.drainMissionQueue()
            let totalCount = UInt16(waypoints.count + 1)  // +1 for home at seq 0
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
                    // Break out of loop on any ACK
                    DispatchQueue.main.async {
                        self.finishMissionUpload(success: success, count: waypoints.count, completion: completion)
                    }
                    return

                case MsgMissionRequestInt.id, MsgMissionRequest.id:
                    let seq: UInt16
                    if frame.messageID == MsgMissionRequestInt.id {
                        seq = MsgMissionRequestInt(from: frame.payload).seq
                    } else {
                        seq = MsgMissionRequest(from: frame.payload).seq
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
                    }

                default:
                    break
                }
            }

            // Timeout
            DispatchQueue.main.async {
                self.finishMissionUpload(success: false, count: waypoints.count, completion: completion)
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
            command = 16  // MAV_CMD_NAV_WAYPOINT
            frame = 3     // MAV_FRAME_GLOBAL_RELATIVE_ALT_INT
        case .takeoff:
            command = 22  // MAV_CMD_NAV_TAKEOFF
            frame = 3
        case .land:
            command = 21  // MAV_CMD_NAV_LAND
            frame = 3
        case .loiter:
            command = 17  // MAV_CMD_NAV_LOITER_UNLIM
            frame = 3
        case .loiterTurns:
            command = 18  // MAV_CMD_NAV_LOITER_TURNS
            frame = 3
        case .returnToLaunch:
            command = 20  // MAV_CMD_NAV_RETURN_TO_LAUNCH
            frame = 2     // MAV_FRAME_MISSION
            x = 0; y = 0; z = 0
        case .speedChange:
            command = 178 // MAV_CMD_DO_CHANGE_SPEED
            frame = 2
            x = 0; y = 0; z = 0
        case .regionOfInterest:
            command = 201 // MAV_CMD_DO_SET_ROI
            frame = 2
            x = 0; y = 0; z = 0
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

    private func finishMissionUpload(success: Bool, count: Int, completion: @escaping (Bool) -> Void) {
        isMissionUploading = false
        if success {
            missionUploadStatus = "Uploaded (\(count) items)"
            statusMessage = "Mission uploaded"
            HapticManager.shared.trigger(style: "success")
        } else {
            if missionUploadStatus.isEmpty || !missionUploadStatus.contains("rejected") {
                missionUploadStatus = "Upload failed"
            }
            statusMessage = "Mission upload failed"
            HapticManager.shared.trigger(style: "error")
        }
        completion(success)
    }

    func startMission() {
        guard let drone else { return }
        drone.sendMissionSetCurrent(seq: 1)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
            if drone.isArdupilot {
                drone.setMode("AUTO")
            } else {
                drone.setMode("AUTO_MISSION")
            }
        }
        statusMessage = "Mission started"
        HapticManager.shared.trigger(style: "success")
    }

    func pauseMission() {
        drone?.hold()
        statusMessage = "Mission paused"
    }

    func clearMission() {
        drone?.sendMissionClearAll()
        statusMessage = "Mission cleared"
    }

    // MARK: - Telemetry Updates

    private func updateTelemetry(from drone: MAVLinkDrone) {
        state.coordinate = CLLocationCoordinate2D(latitude: drone.lat, longitude: drone.lon)
        state.altitudeRelative = drone.altRelative
        state.altitudeAMSL = drone.altMSL
        state.heading = Float(drone.heading)
        state.pitch = drone.pitch * 180 / .pi
        state.roll = drone.roll * 180 / .pi
        state.groundSpeed = drone.groundSpeed
        state.verticalSpeed = drone.climbRate
        state.batteryVoltage = drone.batteryVoltage
        state.batteryPercent = drone.batteryRemaining >= 0 ? Float(drone.batteryRemaining) : -1
        state.satellites = Int(drone.satellites)
        state.gpsFixType = Int(drone.gpsFixType)
        state.armed = drone.armed
        state.flightMode = drone.mode
        state.landed = !drone.armed  // Simplified: landed ≈ not armed

        if drone.homeLat != 0 || drone.homeLon != 0 {
            state.homeCoordinate = CLLocationCoordinate2D(latitude: drone.homeLat, longitude: drone.homeLon)
        }

        // Distance to home
        if let home = state.homeCoordinate, state.hasValidPosition {
            let homeLoc = CLLocation(latitude: home.latitude, longitude: home.longitude)
            let droneLoc = CLLocation(latitude: drone.lat, longitude: drone.lon)
            state.distanceToHome = Float(droneLoc.distance(from: homeLoc))
        }

        // Vehicle type
        switch drone.mavType {
        case 1: state.vehicleType = .plane
        case 10, 11: state.vehicleType = .rover
        default: state.vehicleType = .copter
        }

        // Link status
        if drone.linkLost {
            state.connectionState = .error("Link lost")
            statusMessage = "Link lost"
        }

        // Update stream rates from drone's message tracking
        for (name, info) in drone.messageRates {
            let elapsed = Date().timeIntervalSince(info.firstSeen)
            let hz = elapsed > 1 ? Double(info.count) / elapsed : 0
            updateStreamRate(name: name, value: "\(hz > 0 ? String(format: "%.1f Hz", hz) : "—")")
        }
    }

    // MARK: - Status Text Handler

    private static let severityNames: [UInt8: String] = [
        0: "EMERG", 1: "ALERT", 2: "CRIT", 3: "ERROR",
        4: "WARN", 5: "NOTICE", 6: "INFO", 7: "DEBUG",
    ]

    private func handleStatusText(severity: UInt8, text: String) {
        let typeStr = Self.severityNames[severity] ?? "?"
        let msg = StatusMessage(timestamp: Date(), type: typeStr, text: text)
        statusMessages.insert(msg, at: 0)
        if statusMessages.count > 200 {
            statusMessages = Array(statusMessages.prefix(200))
        }
    }

    // MARK: - Parameter Handler

    private func handleParamValue(name: String, value: Float, type: UInt8, index: UInt16, count: UInt16) {
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
            statusMessage = "Loaded \(params.count) parameters"
        }
    }

    // MARK: - Command ACK Handler

    private func handleCommandAck(command: UInt16, result: UInt8) {
        // MAV_CMD_PREFLIGHT_CALIBRATION = 241
        if command == 241 {
            let resultTexts: [UInt8: String] = [
                0: "Calibration accepted",
                1: "Calibration temporarily rejected",
                2: "Calibration denied",
                3: "Calibration unsupported",
                4: "Calibration failed",
                5: "Calibration in progress",
                6: "Calibration cancelled",
            ]
            let text = resultTexts[result] ?? "Calibration result: \(result)"
            handleStatusText(severity: result == 0 || result == 5 ? 6 : 4, text: text)
        }

        // MAV_CMD_COMPONENT_ARM_DISARM = 400
        if command == 400 {
            if result == 0 {
                statusMessage = state.armed ? "Armed" : "Disarmed"
            } else {
                statusMessage = "Arm/disarm failed (result=\(result))"
                HapticManager.shared.trigger(style: "error")
            }
        }
    }

    // MARK: - Stream Rate Tracking

    private var streamBuffer: [String: TelemetryStream] = [:]
    private var streamFlushTimer: Timer?

    private func startStreamFlush() {
        streamFlushTimer?.invalidate()
        streamFlushTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.flushStreams()
        }
    }

    private func flushStreams() {
        telemetryStreams = streamBuffer.values.sorted { $0.name < $1.name }
    }

    private func updateStreamRate(name: String, value: String) {
        let now = Date()
        if var existing = streamBuffer[name] {
            existing.updateCount += 1
            existing.lastValue = value
            existing.lastUpdate = now
            let elapsed = now.timeIntervalSince(existing.firstUpdate)
            if elapsed > 1 {
                existing.hz = Double(existing.updateCount) / elapsed
            }
            streamBuffer[name] = existing
        } else {
            var stream = TelemetryStream(id: name, name: name)
            stream.lastValue = value
            stream.lastUpdate = now
            stream.firstUpdate = now
            stream.updateCount = 1
            streamBuffer[name] = stream
            flushStreams()
        }
    }
}
