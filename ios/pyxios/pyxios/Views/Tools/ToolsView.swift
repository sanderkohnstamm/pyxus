//
//  ToolsView.swift
//  pyxios
//
//  Tool list: Params, Calibration, MAVLink Inspector, Motor Test, Logs.
//

import SwiftUI

struct ToolsView: View {
    let droneManager: DroneManager
    var switchTab: ((AppTab) -> Void)?

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
                }
            }
            .navigationTitle("Tools")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        // Tab navigation — always first
                        Button {
                            switchTab?(.command)
                        } label: {
                            Label("Command", systemImage: "airplane")
                        }
                        Button {
                            switchTab?(.video)
                        } label: {
                            Label("Video", systemImage: "video")
                        }
                        Button {
                            switchTab?(.plan)
                        } label: {
                            Label("Plan", systemImage: "map")
                        }

                        Divider()

                        // Tools actions
                        if droneManager.state.connectionState.isConnected {
                            Button(role: .destructive) {
                                droneManager.disconnect()
                            } label: {
                                Label("Disconnect", systemImage: "xmark.circle")
                            }
                        }
                    } label: {
                        Image(systemName: "line.3.horizontal")
                    }
                }
            }
        }
    }
}

struct SettingsView: View {
    private let settings = AppSettings.shared
    @State private var takeoffAltText: String = ""

    var body: some View {
        Form {
            Section {
                Picker("Joystick Mode", selection: Binding(
                    get: { settings.joystickMode },
                    set: { settings.joystickMode = $0 }
                )) {
                    ForEach(JoystickMode.allCases, id: \.self) { mode in
                        Text(mode.description).tag(mode)
                    }
                }

                HStack {
                    Label("Takeoff Altitude", systemImage: "arrow.up.circle")
                    Spacer()
                    TextField("10", text: $takeoffAltText)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 60)
                        .onChange(of: takeoffAltText) { _, newVal in
                            if let val = Float(newVal), val > 0 {
                                settings.defaultTakeoffAltitude = val
                            }
                        }
                    Text("m")
                        .foregroundStyle(.secondary)
                }
            } header: {
                Label("Flight", systemImage: "airplane")
            }

            Section {
                Picker("Units", selection: Binding(
                    get: { settings.unitSystem },
                    set: { settings.unitSystem = $0 }
                )) {
                    ForEach(UnitSystem.allCases, id: \.self) { unit in
                        Text(unit.rawValue.capitalized).tag(unit)
                    }
                }

                Picker("Map Style", selection: Binding(
                    get: { settings.mapType },
                    set: { settings.mapType = $0 }
                )) {
                    ForEach(MapType.allCases, id: \.self) { type in
                        Text(type.description).tag(type)
                    }
                }

                Toggle(isOn: Binding(
                    get: { settings.showTrail },
                    set: { settings.showTrail = $0 }
                )) {
                    Label("Show Flight Trail", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                }
            } header: {
                Label("Display", systemImage: "paintbrush")
            }

            Section {
                HStack {
                    Label("Stream URL", systemImage: "video")
                    Spacer()
                    TextField("rtsp://...", text: Binding(
                        get: { settings.videoStreamURL },
                        set: { settings.videoStreamURL = $0 }
                    ))
                    .font(.system(.caption, design: .monospaced))
                    .multilineTextAlignment(.trailing)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                }

                Toggle(isOn: Binding(
                    get: { settings.useCameraFeed },
                    set: { settings.useCameraFeed = $0 }
                )) {
                    Label("Use Device Camera", systemImage: "camera")
                }
            } header: {
                Label("Video", systemImage: "play.rectangle")
            } footer: {
                Text("Stream URL for RTSP video feed. Device camera is for testing without a drone.")
            }

            Section {
                Toggle(isOn: Binding(
                    get: { settings.autoConnectOnLaunch },
                    set: { settings.autoConnectOnLaunch = $0 }
                )) {
                    Label("Auto-Connect on Launch", systemImage: "bolt.horizontal")
                }

                if !settings.connectionHistory.isEmpty {
                    ForEach(settings.connectionHistory, id: \.self) { addr in
                        HStack {
                            Image(systemName: addr.hasPrefix("tcp") ? "network" : "antenna.radiowaves.left.and.right")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 20)
                            Text(addr)
                                .font(.system(.caption, design: .monospaced))
                        }
                    }
                    .onDelete { offsets in
                        settings.connectionHistory.remove(atOffsets: offsets)
                    }
                }
            } header: {
                Label("Connection", systemImage: "antenna.radiowaves.left.and.right")
            }

            Section {
                HStack {
                    Text("Version")
                    Spacer()
                    Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                        .foregroundStyle(.secondary)
                }
                HStack {
                    Text("Build")
                    Spacer()
                    Text(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—")
                        .foregroundStyle(.secondary)
                }
            } header: {
                Label("About", systemImage: "info.circle")
            }
        }
        .navigationTitle("Settings")
        .onAppear {
            takeoffAltText = String(format: "%.0f", settings.defaultTakeoffAltitude)
        }
    }
}
