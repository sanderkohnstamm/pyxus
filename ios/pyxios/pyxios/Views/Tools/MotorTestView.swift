//
//  MotorTestView.swift
//  pyxios
//
//  Motor and servo test controls via MAVLink.
//

import SwiftUI

struct MotorTestView: View {
    let droneManager: DroneManager

    // Motor test state
    @State private var selectedMotor: Int = 1
    @State private var throttlePercent: Double = 5
    @State private var durationSeconds: Double = 1

    // Servo test state
    @State private var selectedServo: Int = 1
    @State private var servoPWM: Double = 1500

    var body: some View {
        List {
            // Motor Test Section
            Section {
                Text("Test individual motors by spinning them briefly. Use low throttle values.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section(header: Text("Motor Test"), footer: Text("WARNING: Remove propellers before testing. Vehicle should be disarmed.").foregroundStyle(.red)) {
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

                motorTestButtons
            }

            // Servo Test Section
            Section(header: Text("Servo Test"), footer: Text("Sets servo output to specified PWM. Use 1000-2000 for standard servos.")) {
                Stepper("Servo \(selectedServo)", value: $selectedServo, in: 1...16)

                VStack(alignment: .leading) {
                    Text("PWM: \(Int(servoPWM)) µs")
                    Slider(value: $servoPWM, in: 800...2200, step: 10)
                        .tint(.blue)
                }

                servoQuickButtons

                Button {
                    droneManager.servoSet(servo: selectedServo, pwm: UInt16(servoPWM))
                } label: {
                    Label("Set Servo \(selectedServo)", systemImage: "arrow.left.and.right")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.blue)
            }
        }
        .navigationTitle("Motor & Servo Test")
    }

    private var servoQuickButtons: some View {
        HStack(spacing: 10) {
            Button("Min") { servoPWM = 1000 }
                .buttonStyle(.bordered)
            Button("Mid") { servoPWM = 1500 }
                .buttonStyle(.bordered)
            Button("Max") { servoPWM = 2000 }
                .buttonStyle(.bordered)
            Spacer()
        }
    }

    private var motorTestButtons: some View {
        HStack(spacing: 10) {
            Button {
                droneManager.motorTest(
                    motor: selectedMotor,
                    throttlePercent: Float(throttlePercent),
                    duration: Float(durationSeconds)
                )
            } label: {
                Label("Test Motor \(selectedMotor)", systemImage: "gear.badge")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange)

            Button {
                droneManager.motorTestAll(
                    throttlePercent: Float(throttlePercent),
                    duration: Float(durationSeconds)
                )
            } label: {
                Label("Test All", systemImage: "gearshape.2.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.orange.opacity(0.7))
        }
    }
}
