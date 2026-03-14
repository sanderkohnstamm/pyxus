//
//  MotorTestView.swift
//  pyxios
//
//  Motor test controls. Uses MAVSDK Shell plugin to send MAV_CMD_DO_MOTOR_TEST.
//

import SwiftUI

struct MotorTestView: View {
    let droneManager: DroneManager
    @State private var selectedMotor: Int = 1
    @State private var throttlePercent: Double = 5
    @State private var durationSeconds: Double = 1

    var body: some View {
        List {
            Section {
                Text("Test individual motors by spinning them briefly. Use low throttle values.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Motor") {
                Stepper("Motor \(selectedMotor)", value: $selectedMotor, in: 1...8)

                VStack(alignment: .leading) {
                    Text("Throttle: \(Int(throttlePercent))%")
                    Slider(value: $throttlePercent, in: 0...20, step: 1)
                        .tint(.orange)
                }

                VStack(alignment: .leading) {
                    Text("Duration: \(String(format: "%.1f", durationSeconds))s")
                    Slider(value: $durationSeconds, in: 0.5...5, step: 0.5)
                        .tint(.cyan)
                }
            }

            Section {
                Button {
                    droneManager.statusMessage = "Motor test not yet available via MAVSDK-Swift"
                    HapticManager.shared.trigger(style: "warning")
                } label: {
                    Label("Test Motor \(selectedMotor)", systemImage: "gear.badge")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.orange)
            } footer: {
                Text("WARNING: Remove propellers before testing motors. Motor test requires the vehicle to be disarmed.")
                    .foregroundStyle(.red)
            }
        }
        .navigationTitle("Motor Test")
    }
}
