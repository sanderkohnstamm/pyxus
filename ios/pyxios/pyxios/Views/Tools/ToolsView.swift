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

    private var isConnected: Bool { droneManager.state.connectionState.isConnected }

    var body: some View {
        NavigationStack {
            List {
                // Status summary card
                Section {
                    HStack(spacing: 12) {
                        Image(systemName: isConnected ? "checkmark.circle.fill" : "circle.dashed")
                            .font(.title2)
                            .foregroundStyle(isConnected ? .green : .secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(isConnected ? "Connected" : "Not Connected")
                                .font(.subheadline.weight(.semibold))
                            if isConnected {
                                Text("\(droneManager.state.flightMode.isEmpty ? "—" : droneManager.state.flightMode) · \(droneManager.state.vehicleType.description)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        if isConnected {
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("\(Int(droneManager.state.batteryPercent))%")
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(droneManager.state.batteryPercent > 20 ? .green : .red)
                                Text(String(format: "%.1fV", droneManager.state.batteryVoltage))
                                    .font(.system(.caption2, design: .monospaced))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section {
                    toolRow("Parameters", icon: "slider.horizontal.3", color: .blue) {
                        ParamsView(droneManager: droneManager)
                    }
                    toolRow("Calibration", icon: "gyroscope", color: .orange) {
                        CalibrationView(droneManager: droneManager)
                    }
                } header: {
                    Label("Vehicle", systemImage: "airplane")
                }

                Section {
                    toolRow("MAVLink Inspector", icon: "antenna.radiowaves.left.and.right", color: .purple) {
                        InspectorView(droneManager: droneManager)
                    }
                    toolRow("Motor & Servo", icon: "gear.badge", color: .red) {
                        MotorTestView(droneManager: droneManager)
                    }
                    toolRow("Logs", icon: "doc.text", color: .gray) {
                        LogsView(droneManager: droneManager)
                    }
                } header: {
                    Label("Debug", systemImage: "ladybug")
                }

                Section {
                    toolRow("Settings", icon: "gearshape", color: .gray) {
                        SettingsView()
                    }
                } header: {
                    Label("App", systemImage: "app.badge")
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

    private func toolRow<Destination: View>(_ title: String, icon: String, color: Color, @ViewBuilder destination: @escaping () -> Destination) -> some View {
        NavigationLink {
            destination()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.body)
                    .foregroundStyle(.white)
                    .frame(width: 30, height: 30)
                    .background(color.gradient, in: RoundedRectangle(cornerRadius: 7))
                Text(title)
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

                Picker("Throttle Neutral", selection: Binding(
                    get: { settings.throttleCenter },
                    set: { settings.throttleCenter = $0 }
                )) {
                    ForEach(ThrottleCenter.allCases, id: \.self) { mode in
                        Text(mode.description).tag(mode)
                    }
                }

                Text(settings.throttleCenter.detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)

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
                NavigationLink {
                    GamepadSettingsView()
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "gamecontroller.fill")
                            .font(.body)
                            .foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(Color.cyan.gradient, in: RoundedRectangle(cornerRadius: 7))
                        Text("Controller")
                        Spacer()
                        if GamepadManager.shared.isConnected {
                            Text(GamepadManager.shared.controllerName)
                                .font(.caption)
                                .foregroundStyle(.cyan)
                        }
                    }
                }
            } header: {
                Label("Flight", systemImage: "airplane")
            }

            Section {
                HStack {
                    Label("Height", systemImage: "arrow.up")
                    Spacer()
                    TextField("20", text: Binding(
                        get: { String(format: "%.0f", settings.followMeHeight) },
                        set: { if let v = Float($0), v > 0 { settings.followMeHeight = v } }
                    ))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 60)
                    Text("m")
                        .foregroundStyle(.secondary)
                }
                HStack {
                    Label("Distance", systemImage: "arrow.left.and.right")
                    Spacer()
                    TextField("10", text: Binding(
                        get: { String(format: "%.0f", settings.followMeDistance) },
                        set: { if let v = Float($0), v > 0 { settings.followMeDistance = v } }
                    ))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 60)
                    Text("m")
                        .foregroundStyle(.secondary)
                }
                HStack {
                    Label("Angle", systemImage: "angle")
                    Spacer()
                    TextField("0", text: Binding(
                        get: { String(format: "%.0f", settings.followMeAngle) },
                        set: { if let v = Float($0) { settings.followMeAngle = v } }
                    ))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 60)
                    Text("°")
                        .foregroundStyle(.secondary)
                }
            } header: {
                Label("Follow Me", systemImage: "figure.walk.circle")
            } footer: {
                Text("Height above your position, horizontal distance, and angle (0° = behind).")
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
