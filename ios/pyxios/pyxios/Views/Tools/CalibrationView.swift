//
//  CalibrationView.swift
//  pyxios
//
//  Sensor calibration: gyro, accelerometer, compass, level, barometer.
//  Uses CalibrationService for proper ArduPilot/PX4 protocol handling.
//

import SwiftUI

struct CalibrationView: View {
    let droneManager: DroneManager

    private var cal: CalibrationService { droneManager.calibrationService }

    var body: some View {
        List {
            // Sensor status
            Section("Sensor Status") {
                statusRow("Gyroscope", icon: "gyroscope", ok: droneManager.state.isGyrCalOk)
                statusRow("Accelerometer", icon: "arrow.down.to.line.compact", ok: droneManager.state.isAccCalOk)
                statusRow("Magnetometer", icon: "safari", ok: droneManager.state.isMagCalOk)
            }

            // Calibrations
            ForEach(CalibrationType.allCases) { type in
                calibrationSection(type)
            }
        }
        .navigationTitle("Calibration")
    }

    // MARK: - Calibration Section

    @ViewBuilder
    private func calibrationSection(_ type: CalibrationType) -> some View {
        let isRunning = cal.activeCal == type
        let color = calColor(type)

        Section {
            // Header
            HStack {
                Image(systemName: type.icon)
                    .foregroundStyle(color)
                Text(type.label)
                    .font(.subheadline.weight(.semibold))
                Spacer()
            }

            if !isRunning {
                Text(type.description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            // Active calibration content
            if isRunning {
                calibrationContent(type, color: color)
            }

            // Messages
            if isRunning && !cal.messages.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(cal.messages.prefix(5).enumerated()), id: \.offset) { _, msg in
                        Text(msg)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                .padding(.vertical, 4)
            }

            // Buttons
            if isRunning {
                activeButtons(type, color: color)
            } else {
                Button {
                    droneManager.startCalibration(type)
                } label: {
                    Label("Start \(type.label)", systemImage: "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(color)
                .disabled(cal.activeCal != nil)
            }
        }
    }

    // MARK: - Active Calibration Content

    @ViewBuilder
    private func calibrationContent(_ type: CalibrationType, color: Color) -> some View {
        switch type {
        case .accel:
            accelStepView

        case .compass:
            if case .completed(let success) = cal.state {
                completionBadge(success: success)
            } else if case .compassProgress(let pct) = cal.state {
                VStack(spacing: 6) {
                    ProgressView(value: Float(pct), total: 100)
                        .tint(color)
                    Text("Rotate vehicle slowly — \(pct)%")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                HStack(spacing: 8) {
                    ProgressView()
                        .tint(color)
                    Text("Rotate vehicle around all axes...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

        default:
            if case .completed(let success) = cal.state {
                completionBadge(success: success)
            } else {
                HStack(spacing: 8) {
                    ProgressView()
                        .tint(color)
                    Text("Calibrating...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    // MARK: - Active Buttons

    @ViewBuilder
    private func activeButtons(_ type: CalibrationType, color: Color) -> some View {
        if case .completed = cal.state {
            // No buttons during completion (auto-resets)
            EmptyView()
        } else {
            HStack(spacing: 10) {
                if type == .accel {
                    if case .waitingForPosition = cal.state {
                        Button {
                            droneManager.confirmAccelPosition()
                        } label: {
                            Label("Continue", systemImage: "checkmark.circle")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                    }
                }

                Button {
                    droneManager.cancelCalibration()
                } label: {
                    Label("Cancel", systemImage: "xmark.circle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
            }
        }
    }

    // MARK: - Accel Step View

    private var accelStepView: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Progress bar
            HStack(spacing: 3) {
                ForEach(0..<6, id: \.self) { i in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(i < cal.accelStep ? Color.green : (i == cal.accelStep ? Color.green.opacity(0.5) : Color.gray.opacity(0.3)))
                        .frame(height: 4)
                }
            }

            // Current position instruction
            if cal.accelStep < CalibrationService.accelPositions.count {
                let pos = CalibrationService.accelPositions[cal.accelStep]
                HStack(spacing: 10) {
                    Image(systemName: pos.1)
                        .font(.title2)
                        .foregroundStyle(.green)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Step \(cal.accelStep + 1)/6: \(pos.0)")
                            .font(.subheadline.weight(.semibold))
                        Text(pos.2)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.green.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
            }

            if case .completed(let success) = cal.state {
                HStack(spacing: 8) {
                    Image(systemName: success ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundStyle(success ? .green : .red)
                    Text(success ? "Calibration successful" : "Calibration failed")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(success ? .green : .red)
                }
            }
        }
    }

    // MARK: - Helpers

    private func statusRow(_ name: String, icon: String, ok: Bool) -> some View {
        HStack {
            Image(systemName: icon)
                .foregroundStyle(ok ? .green : .orange)
                .frame(width: 24)
            Text(name)
            Spacer()
            Image(systemName: ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(ok ? .green : .orange)
        }
    }

    private func completionBadge(success: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: success ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(success ? .green : .red)
            Text(success ? "Calibration successful" : "Calibration failed")
                .font(.caption.weight(.semibold))
                .foregroundStyle(success ? .green : .red)
        }
    }

    private func calColor(_ type: CalibrationType) -> Color {
        switch type {
        case .gyro: return .cyan
        case .accel: return .green
        case .level: return .blue
        case .compass: return .orange
        case .pressure: return .purple
        }
    }
}
