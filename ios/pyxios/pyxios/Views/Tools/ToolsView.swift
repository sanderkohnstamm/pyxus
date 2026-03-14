//
//  ToolsView.swift
//  pyxios
//
//  Tool list: Params, Calibration, MAVLink Inspector, Motor Test, Logs.
//

import SwiftUI

struct ToolsView: View {
    let droneManager: DroneManager

    var body: some View {
        NavigationStack {
            List {
                Section("Vehicle") {
                    NavigationLink {
                        ParamsView(droneManager: droneManager)
                    } label: {
                        Label("Parameters", systemImage: "slider.horizontal.3")
                    }

                    NavigationLink {
                        CalibrationView(droneManager: droneManager)
                    } label: {
                        Label("Calibration", systemImage: "gyroscope")
                    }
                }

                Section("Debug") {
                    NavigationLink {
                        InspectorView(droneManager: droneManager)
                    } label: {
                        Label("MAVLink Inspector", systemImage: "antenna.radiowaves.left.and.right")
                    }

                    NavigationLink {
                        MotorTestView(droneManager: droneManager)
                    } label: {
                        Label("Motor Test", systemImage: "gear.badge")
                    }
                }

                Section("Data") {
                    NavigationLink {
                        LogsView(droneManager: droneManager)
                    } label: {
                        Label("Logs", systemImage: "doc.text")
                    }
                }

                Section("App") {
                    NavigationLink {
                        SettingsView()
                    } label: {
                        Label("Settings", systemImage: "gearshape")
                    }

                    // Disconnect
                    Button(role: .destructive) {
                        droneManager.disconnect()
                    } label: {
                        Label("Disconnect", systemImage: "link.badge.plus")
                    }
                }
            }
            .navigationTitle("Tools")
        }
    }
}

struct SettingsView: View {
    private let settings = AppSettings.shared

    var body: some View {
        Form {
            Section("Controls") {
                Picker("Joystick Mode", selection: Binding(
                    get: { settings.joystickMode },
                    set: { settings.joystickMode = $0 }
                )) {
                    ForEach(JoystickMode.allCases, id: \.self) { mode in
                        Text(mode.description).tag(mode)
                    }
                }
            }

            Section("Display") {
                Picker("Units", selection: Binding(
                    get: { settings.unitSystem },
                    set: { settings.unitSystem = $0 }
                )) {
                    ForEach(UnitSystem.allCases, id: \.self) { unit in
                        Text(unit.rawValue.capitalized).tag(unit)
                    }
                }
            }

            Section("Connection History") {
                ForEach(settings.connectionHistory, id: \.self) { addr in
                    Text(addr)
                        .font(.system(.body, design: .monospaced))
                }
            }
        }
        .navigationTitle("Settings")
    }
}
