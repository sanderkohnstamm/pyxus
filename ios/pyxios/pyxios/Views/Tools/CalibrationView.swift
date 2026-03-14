//
//  CalibrationView.swift
//  pyxios
//
//  Gyro/accel/mag/level calibration with progress feedback.
//  Phase 4 — scaffold.
//

import SwiftUI

struct CalibrationView: View {
    let droneManager: DroneManager

    var body: some View {
        List {
            Section("Sensor Status") {
                statusRow("Gyroscope", ok: droneManager.state.isGyrCalOk)
                statusRow("Accelerometer", ok: droneManager.state.isAccCalOk)
                statusRow("Magnetometer", ok: droneManager.state.isMagCalOk)
            }

            Section("Actions") {
                Button("Calibrate Gyro") { }
                Button("Calibrate Accelerometer") { }
                Button("Calibrate Magnetometer") { }
            }
        }
        .navigationTitle("Calibration")
    }

    private func statusRow(_ name: String, ok: Bool) -> some View {
        HStack {
            Text(name)
            Spacer()
            Image(systemName: ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(ok ? .green : .orange)
        }
    }
}
