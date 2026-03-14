//
//  CalibrationService.swift
//  pyxios
//
//  Manages sensor calibration state machine for ArduPilot and PX4.
//
//  Protocol summary (ArduPilot):
//  - Gyro/Level/Baro: CMD 241 → COMMAND_ACK result=5 (in progress) → result=0 (done)
//  - Accel 6-side: CMD 241 param5=1 → COMMAND_LONG 42003 param1=1..6 (positions, 1-based)
//    → user sends COMMAND_ACK(cmd=0, result=1) to advance → param1=7 (success) / 8 (fail)
//  - Compass: CMD 42424 → MAG_CAL_PROGRESS (191) → MAG_CAL_REPORT (192) status=3 done
//    Set COMPASS_CAL_FITNESS=100 before starting for reliable success.
//
//  Protocol summary (PX4):
//  - All cals: CMD 241 → [cal] prefixed STATUSTEXT messages for progress/completion
//

import Foundation

// MARK: - Calibration Types

enum CalibrationType: String, CaseIterable, Identifiable {
    case gyro, accel, level, compass, pressure

    var id: String { rawValue }

    var label: String {
        switch self {
        case .gyro: return "Gyroscope"
        case .accel: return "Accelerometer"
        case .level: return "Level Horizon"
        case .compass: return "Compass"
        case .pressure: return "Barometer"
        }
    }

    var icon: String {
        switch self {
        case .gyro: return "gyroscope"
        case .accel: return "arrow.down.to.line.compact"
        case .level: return "level"
        case .compass: return "safari"
        case .pressure: return "barometer"
        }
    }

    var description: String {
        switch self {
        case .gyro: return "Keep the vehicle completely still on a flat surface."
        case .accel: return "Follow the 6-position sequence. Place the vehicle in each orientation when prompted."
        case .level: return "Place the vehicle level on a flat surface. Calibrates the horizon reference."
        case .compass: return "Rotate the vehicle slowly around all axes."
        case .pressure: return "Keep the vehicle still. Calibrates the barometric pressure sensor."
        }
    }
}

// MARK: - Calibration State

enum CalibrationState: Equatable {
    case idle
    case running(CalibrationType)
    case waitingForPosition(Int)  // accel: waiting for user to place vehicle (step 0-5 display)
    case compassProgress(Int)     // compass: completion percentage
    case completed(Bool)          // success or failure
}

// MARK: - Calibration Service

@Observable
final class CalibrationService {

    // MARK: - Published State

    var state: CalibrationState = .idle
    var activeCal: CalibrationType?
    var accelStep: Int = 0            // 0-5 display index (0-based for UI)
    var compassPercent: Int = 0
    var messages: [String] = []       // recent calibration messages
    var isComplete = false

    // MARK: - Private

    private weak var drone: MAVLinkDrone?
    /// Track per-compass MAG_CAL_REPORT results: compassId → success
    private var compassResults: [UInt8: Bool] = [:]
    /// Expected number of compasses (from MAG_CAL_PROGRESS cal_mask)
    private var compassCount: Int = 0

    /// Accel positions (display order matches ArduPilot param1 values 1-6)
    static let accelPositions = [
        ("Level", "rectangle.fill", "Place vehicle level on a flat surface"),
        ("Left Side", "arrow.left.to.line", "Roll to left side (left wing down)"),
        ("Right Side", "arrow.right.to.line", "Roll to right side (right wing down)"),
        ("Nose Down", "arrow.down.to.line", "Pitch forward (nose pointing down)"),
        ("Nose Up", "arrow.up.to.line", "Pitch backward (nose pointing up)"),
        ("On Back", "arrow.uturn.down", "Flip upside down (belly up)"),
    ]

    func update(drone: MAVLinkDrone?) {
        self.drone = drone
    }

    func reset() {
        state = .idle
        activeCal = nil
        accelStep = 0
        compassPercent = 0
        messages = []
        isComplete = false
        compassResults = [:]
        compassCount = 0
    }

    // MARK: - Start Calibration

    func startCalibration(_ type: CalibrationType) {
        guard let drone else { return }

        reset()
        activeCal = type
        messages = []

        switch type {
        case .gyro:
            state = .running(.gyro)
            drone.calibrate(gyro: true)
            addMessage("Gyro calibration — keep still...")

        case .accel:
            state = .waitingForPosition(0)
            accelStep = 0
            drone.calibrate(accel: 1)
            addMessage("Accel calibration — place vehicle level, then tap Continue...")

        case .level:
            state = .running(.level)
            drone.calibrate(level: true)
            addMessage("Level calibration — keep level...")

        case .compass:
            state = .running(.compass)
            compassPercent = 0
            compassResults = [:]
            compassCount = 0
            if drone.isArdupilot {
                // QGC sets COMPASS_CAL_FITNESS=100 before starting to ensure cal succeeds
                drone.setParam(name: "COMPASS_CAL_FITNESS", value: 100)
                // ArduPilot: MAV_CMD_DO_START_MAG_CAL (42424)
                // param1=0 (all compasses), param2=0 (no retry), param3=1 (autosave),
                // param4=0 (delay), param5=0 (no autoreboot)
                drone.sendCommandLong(
                    command: 42424,
                    param1: 0,
                    param2: 0,
                    param3: 1,
                    param4: 0,
                    param5: 0
                )
            } else {
                // PX4: uses standard preflight calibration
                drone.calibrate(compass: true)
            }
            addMessage("Compass calibration — rotate all axes...")

        case .pressure:
            state = .running(.pressure)
            drone.calibrate(baro: true)
            addMessage("Baro calibration — keep still...")
        }

        HapticManager.shared.trigger(style: "success")
    }

    // MARK: - Cancel

    func cancelCalibration() {
        guard let drone else { return }

        if activeCal == .compass && drone.isArdupilot {
            // ArduPilot: MAV_CMD_DO_CANCEL_MAG_CAL (42426)
            drone.sendCommandLong(command: 42426)
        } else {
            drone.cancelCalibration()
        }

        addMessage("Calibration cancelled")
        state = .idle
        activeCal = nil
        accelStep = 0
        compassPercent = 0
    }

    // MARK: - Accel Continue (ArduPilot)

    /// User confirms current position during accel calibration.
    func confirmAccelPosition() {
        guard let drone, activeCal == .accel else { return }

        // ArduPilot expects COMMAND_ACK with command=0, result=1 to advance to next position
        var ack = MsgCommandAck()
        ack.command = 0
        ack.result = 1
        ack.target_system = drone.targetSystem
        ack.target_component = drone.targetComponent
        drone.connection.sendMessage(id: MsgCommandAck.id, payload: ack.encode())

        // Advance step immediately for visual feedback
        if accelStep < 5 {
            accelStep += 1
            state = .waitingForPosition(accelStep)
            let pos = Self.accelPositions[accelStep]
            addMessage("Step \(accelStep + 1)/6: \(pos.0)")
        } else {
            addMessage("All positions done, waiting for result...")
            state = .running(.accel)
        }
    }

    // MARK: - Message Handlers

    /// Handle COMMAND_ACK for preflight calibration (cmd 241)
    func handleCommandAck(command: UInt16, result: UInt8) {
        guard activeCal != nil else { return }

        if command == 241 {
            // Result codes: 0=ACCEPTED, 1=TEMP_REJECTED, 2=DENIED, 3=UNSUPPORTED, 4=FAILED, 5=IN_PROGRESS
            switch result {
            case 0: // MAV_RESULT_ACCEPTED — calibration complete (success)
                if activeCal == .gyro || activeCal == .level || activeCal == .pressure {
                    addMessage("Calibration successful!")
                    completeCalibration(success: true)
                }
            case 5: // MAV_RESULT_IN_PROGRESS — calibration started, still running
                addMessage("Calibration in progress...")
            case 4: // FAILED
                addMessage("Calibration failed")
                completeCalibration(success: false)
            case 2: // DENIED
                addMessage("Calibration denied — disarm vehicle first")
                completeCalibration(success: false)
            case 1: // TEMP_REJECTED
                addMessage("Calibration temporarily rejected — try again")
                completeCalibration(success: false)
            case 3: // UNSUPPORTED
                addMessage("Calibration not supported")
                completeCalibration(success: false)
            default:
                addMessage("Calibration result: \(result)")
            }
        }
    }

    /// Handle incoming COMMAND_LONG from ArduPilot (accel position prompts)
    /// ArduPilot sends MAV_CMD_ACCELCAL_VEHICLE_POS (42003) with param1:
    ///   1=Level, 2=Left, 3=Right, 4=NoseDown, 5=NoseUp, 6=Back, 7=Success, 8=Failed
    func handleCommandLong(command: UInt16, param1: Float) {
        if command == 42003 {
            let posValue = Int(param1)

            if posValue >= 1 && posValue <= 6 {
                // Position prompt (1-based): convert to 0-based for UI
                accelStep = posValue - 1
                state = .waitingForPosition(accelStep)
                let pos = Self.accelPositions[posValue - 1]
                addMessage("Position \(posValue)/6: \(pos.0)")
                HapticManager.shared.trigger(style: "success")
            } else if posValue == 7 {
                // ACCELCAL_VEHICLE_POS_SUCCESS
                accelStep = 6  // all done — fills all bars
                addMessage("Accel calibration successful!")
                completeCalibration(success: true)
            } else if posValue == 8 {
                // ACCELCAL_VEHICLE_POS_FAILED
                addMessage("Accel calibration failed")
                completeCalibration(success: false)
            }
        }
    }

    /// Handle MAG_CAL_PROGRESS message (191)
    func handleMagCalProgress(compassId: UInt8, calMask: UInt8, percent: UInt8, status: UInt8) {
        guard activeCal == .compass else { return }

        // Derive compass count from cal_mask (bitmask of active compasses)
        if compassCount == 0 && calMask > 0 {
            var mask = calMask
            var count = 0
            while mask != 0 {
                count += Int(mask & 1)
                mask >>= 1
            }
            compassCount = count
        }

        compassPercent = Int(percent)
        state = .compassProgress(Int(percent))
    }

    /// Handle MAG_CAL_REPORT message (192)
    /// cal_status: 3=SUCCESS, 4=FAILED, 5=BAD_ORIENTATION, 6=BAD_RADIUS
    func handleMagCalReport(compassId: UInt8, status: UInt8, fitness: Float) {
        guard activeCal == .compass else { return }

        let success = (status == 3)
        compassResults[compassId] = success

        if success {
            addMessage("Compass \(compassId) calibrated (fitness: \(String(format: "%.1f", fitness)))")
        } else {
            let reasons: [UInt8: String] = [4: "Failed", 5: "Bad orientation", 6: "Bad radius"]
            let reason = reasons[status] ?? "Error \(status)"
            addMessage("Compass \(compassId): \(reason)")
        }

        // Wait until all compasses have reported before declaring result
        let expectedCount = compassCount > 0 ? compassCount : 1
        if compassResults.count >= expectedCount {
            let allSuccess = compassResults.values.allSatisfy { $0 }
            if allSuccess {
                addMessage("All compasses calibrated successfully")
                if let drone {
                    drone.setParam(name: "COMPASS_LEARN", value: 0)
                }
                completeCalibration(success: true)
            } else {
                addMessage("Compass calibration failed")
                completeCalibration(success: false)
            }
        }
    }

    /// Handle STATUSTEXT — primarily for PX4 [cal] messages
    func handleStatusText(text: String) {
        guard activeCal != nil else { return }

        addMessage(text)

        let lower = text.lowercased()

        // PX4 calibration uses [cal] prefix for state machine
        if lower.hasPrefix("[cal]") {
            if lower.contains("calibration done") || lower.contains("calibration passed") ||
               (lower.contains("done") && lower.contains("successful")) {
                completeCalibration(success: true)
                return
            }
            if lower.contains("calibration failed") || lower.contains("calibration cancelled") ||
               lower.contains("failed") {
                completeCalibration(success: false)
                return
            }
        }
    }

    // MARK: - Private

    private func addMessage(_ text: String) {
        messages.insert(text, at: 0)
        if messages.count > 20 {
            messages = Array(messages.prefix(20))
        }
    }

    private func completeCalibration(success: Bool) {
        guard activeCal != nil else { return }  // prevent double-completion
        state = .completed(success)
        isComplete = true
        HapticManager.shared.trigger(style: success ? "success" : "error")

        // Auto-reset after a delay
        DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
            self?.state = .idle
            self?.activeCal = nil
            self?.isComplete = false
        }
    }
}
