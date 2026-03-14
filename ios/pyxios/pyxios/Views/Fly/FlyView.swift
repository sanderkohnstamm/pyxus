//
//  FlyView.swift
//  pyxios
//
//  Main flight view: map, HUD, action buttons, mode selector.
//  Shows connect button when no drone is connected.
//

import SwiftUI
import CoreLocation

struct FlyView: View {
    let droneManager: DroneManager
    @State private var showVideo = false
    @State private var showConnectSheet = false
    @State private var wasConnected = false
    @State private var showJoysticks = false
    @State private var showConsole = false
    @State private var isLandscape = false
    @State private var showMissionPicker = false
    @State private var savedMissions: [SavedMission] = []
    @State private var missionUploadProgress: String?
    @State private var followMode = true
    @State private var activeMission: [Waypoint] = []
    @State private var gotoTarget: CLLocationCoordinate2D?
    @State private var showGotoConfirm = false
    @State private var continueFromSeq: Int?
    @State private var showContinueConfirm = false
    private let videoManager = VideoPlayerManager.shared

    private var isConnected: Bool { droneManager.state.connectionState.isConnected }

    private var connectionLost: Bool {
        wasConnected && !isConnected
    }

    private var showHUD: Bool {
        isConnected || connectionLost
    }

    var body: some View {
        ZStack {
            // Map or video as primary view
            if showVideo && videoManager.isPlaying {
                VideoFeedView()
                    .ignoresSafeArea()
            } else {
                DroneMapView(
                    droneManager: droneManager,
                    followMode: $followMode,
                    missionWaypoints: activeMission,
                    activeMissionSeq: droneManager.state.missionSeq,
                    onMapTap: { coordinate in
                        guard droneManager.state.armed && !droneManager.state.landed else { return }
                        gotoTarget = coordinate
                        showGotoConfirm = true
                    },
                    onWaypointTap: { index in
                        continueFromSeq = index + 1  // mission seq is 1-based (0 = home)
                        showContinueConfirm = true
                    }
                )
                .ignoresSafeArea(edges: .top)
            }

            // HUD + controls overlay
            VStack(spacing: 0) {
                // Link lost banner
                if let since = droneManager.state.linkLostSince {
                    LinkLostBanner(since: since)
                }

                if showHUD {
                    HStack(alignment: .top, spacing: 8) {
                        if isConnected {
                            Button {
                                droneManager.disconnect()
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.title3)
                                    .foregroundStyle(.white.opacity(0.7))
                            }
                            .padding(.top, 10)
                        }

                        FlightHUD(state: droneManager.state, connectionOk: isConnected)
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 8)

                    // Telemetry alerts
                    if !droneManager.alertService.activeAlerts.isEmpty {
                        VStack(spacing: 4) {
                            ForEach(droneManager.alertService.activeAlerts) { alert in
                                HStack(spacing: 6) {
                                    Image(systemName: alert.level == .critical ? "exclamationmark.triangle.fill" : "exclamationmark.circle.fill")
                                        .font(.caption2)
                                    Text(alert.message)
                                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                                }
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background((alert.level == .critical ? Color.red : Color.orange).gradient, in: .capsule)
                            }
                        }
                        .padding(.top, 4)
                    }
                }

                Spacer()

                // Bottom controls
                if isConnected {
                    if showJoysticks && isLandscape {
                        JoystickOverlay(droneManager: droneManager)
                    }

                    HStack(alignment: .bottom) {
                        Spacer()
                        VStack(spacing: 12) {
                            controlToggles
                            modeSelector
                            actionButtons
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 16)
                }
            }

            // Console overlay (bottom-left)
            if showConsole && isConnected {
                VStack {
                    Spacer()
                    HStack {
                        MessageConsole(droneManager: droneManager)
                        Spacer()
                    }
                    .padding(.leading, 12)
                    .padding(.bottom, 90)
                }
            }

            // Connect button when disconnected
            if !isConnected {
                VStack {
                    Spacer()
                    Button {
                        showConnectSheet = true
                    } label: {
                        Label(connectionLost ? "Reconnect" : "Connect",
                              systemImage: connectionLost ? "arrow.triangle.2.circlepath" : "antenna.radiowaves.left.and.right")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background((connectionLost ? Color.red : Color.cyan).gradient, in: .capsule)
                    }
                    .padding(.bottom, 40)
                }
            }

            // Video PiP
            if !showVideo && videoManager.isPlaying {
                VStack {
                    HStack {
                        Spacer()
                        VideoPlayerPiP()
                            .padding(.top, 100)
                            .padding(.trailing, 12)
                    }
                    Spacer()
                }
            }

            // Map/Video toggle
            if videoManager.isPlaying {
                VStack {
                    HStack {
                        Spacer()
                        Button {
                            showVideo.toggle()
                        } label: {
                            Image(systemName: showVideo ? "map" : "video")
                                .font(.title3)
                                .foregroundStyle(.white)
                                .padding(10)
                                .background(.ultraThinMaterial)
                                .clipShape(Circle())
                        }
                        .padding(.top, 56)
                        .padding(.trailing, 12)
                    }
                    Spacer()
                }
            }
        }
        .sheet(isPresented: $showConnectSheet) {
            ConnectSheet(droneManager: droneManager, isPresented: $showConnectSheet)
                .presentationDetents([.medium, .large])
        }
        .alert("Go to location?", isPresented: $showGotoConfirm) {
            Button("Go", role: .destructive) {
                if let target = gotoTarget {
                    droneManager.gotoLocation(
                        lat: target.latitude,
                        lon: target.longitude,
                        alt: droneManager.state.altitudeRelative
                    )
                }
                gotoTarget = nil
            }
            Button("Cancel", role: .cancel) { gotoTarget = nil }
        } message: {
            if let target = gotoTarget {
                Text(String(format: "Fly to %.5f, %.5f at current altitude?", target.latitude, target.longitude))
            }
        }
        .alert("Continue from waypoint?", isPresented: $showContinueConfirm) {
            Button("Continue") {
                if let seq = continueFromSeq {
                    droneManager.setMissionCurrent(seq: seq)
                    droneManager.startMission()
                }
                continueFromSeq = nil
            }
            Button("Cancel", role: .cancel) { continueFromSeq = nil }
        } message: {
            if let seq = continueFromSeq {
                Text("Continue mission from waypoint \(seq)?")
            }
        }
        .onChange(of: isConnected) { _, connected in
            if connected {
                wasConnected = true
            } else {
                showJoysticks = false
            }
        }
        .onChange(of: droneManager.missionService.downloadedMission) { _, newMission in
            if !newMission.isEmpty {
                activeMission = newMission
            }
        }
        .onGeometryChange(for: Bool.self) { proxy in
            proxy.size.width > proxy.size.height
        } action: { newIsLandscape in
            isLandscape = newIsLandscape
        }
        .onChange(of: isLandscape) { _, landscape in
            if !landscape && showJoysticks {
                showJoysticks = false
                droneManager.stopManualControl()
            }
        }
        .onAppear {
            savedMissions = FlightPlan.savedMissions()
        }
    }

    // MARK: - Control Toggles

    private var controlToggles: some View {
        HStack(spacing: 8) {
            // Follow toggle
            Button {
                followMode.toggle()
            } label: {
                Image(systemName: followMode ? "location.fill" : "location")
                    .font(.body)
                    .foregroundStyle(followMode ? .cyan : .white.opacity(0.7))
                    .padding(8)
                    .background(followMode ? Color.cyan.opacity(0.2) : Color.clear)
                    .background(.ultraThinMaterial)
                    .clipShape(Circle())
            }

            // Joystick toggle (landscape only)
            if isLandscape {
                Button {
                    showJoysticks.toggle()
                    if showJoysticks {
                        droneManager.startManualControl()
                    } else {
                        droneManager.stopManualControl()
                    }
                } label: {
                    Image(systemName: showJoysticks ? "gamecontroller.fill" : "gamecontroller")
                        .font(.body)
                        .foregroundStyle(showJoysticks ? .cyan : .white.opacity(0.7))
                        .padding(8)
                        .background(showJoysticks ? Color.cyan.opacity(0.2) : Color.clear)
                        .background(.ultraThinMaterial)
                        .clipShape(Circle())
                }
            }

            // Console toggle
            Button {
                showConsole.toggle()
            } label: {
                Image(systemName: showConsole ? "text.bubble.fill" : "text.bubble")
                    .font(.body)
                    .foregroundStyle(showConsole ? .cyan : .white.opacity(0.7))
                    .padding(8)
                    .background(showConsole ? Color.cyan.opacity(0.2) : Color.clear)
                    .background(.ultraThinMaterial)
                    .clipShape(Circle())
            }
        }
    }

    // MARK: - Mode Selector

    private var modeSelector: some View {
        HStack(spacing: 8) {
            Menu {
                ForEach(availableModes, id: \.self) { mode in
                    Button {
                        droneManager.setFlightMode(mode)
                    } label: {
                        if mode == droneManager.state.flightMode {
                            Label(mode, systemImage: "checkmark")
                        } else {
                            Text(mode)
                        }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "airplane.circle")
                        .font(.body)
                    Text(droneManager.state.flightMode.isEmpty ? "Mode" : droneManager.state.flightMode)
                        .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.caption2)
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial)
                .clipShape(Capsule())
            }

            // Mission menu
            Menu {
                if savedMissions.isEmpty {
                    Text("No saved missions")
                } else {
                    ForEach(savedMissions) { mission in
                        Button {
                            uploadMission(mission)
                        } label: {
                            Label("\(mission.name) (\(mission.waypoints.count) wp)",
                                  systemImage: "arrow.up.doc")
                        }
                    }
                }
                Divider()
                Button {
                    droneManager.downloadMission { waypoints in
                        activeMission = waypoints ?? []
                    }
                } label: {
                    Label("Download Mission", systemImage: "arrow.down.doc")
                }
                Divider()
                if droneManager.state.flightMode == "Auto" {
                    Button {
                        droneManager.pauseMission()
                    } label: {
                        Label("Pause Mission", systemImage: "pause.circle")
                    }
                }
                Button {
                    droneManager.startMission()
                } label: {
                    Label("Start Mission", systemImage: "play.circle")
                }
                Button(role: .destructive) {
                    droneManager.clearMission()
                    activeMission = []
                } label: {
                    Label("Clear Mission", systemImage: "trash")
                }
            } label: {
                Image(systemName: "map.circle")
                    .font(.body)
                    .foregroundStyle(.white.opacity(0.7))
                    .padding(8)
                    .background(.ultraThinMaterial)
                    .clipShape(Circle())
            }

            Spacer()

            // Mission upload status
            if let status = missionUploadProgress {
                Text(status)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.cyan)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
            }
        }
    }

    private var availableModes: [String] {
        droneManager.availableModes
    }

    // MARK: - Action Buttons

    @ViewBuilder
    private var actionButtons: some View {
        let s = droneManager.state
        let isRover = s.vehicleType == .rover

        HStack(spacing: 10) {
            if !s.armed {
                actionButton("Arm", icon: "lock.open.fill", tint: .orange) {
                    droneManager.arm()
                }
                if !isRover {
                    actionButton("Takeoff", icon: "arrow.up.circle.fill", tint: .green) {
                        droneManager.takeoff()
                    }
                }
            } else if s.landed {
                if isRover {
                    actionButton("Disarm", icon: "lock.fill", tint: .red) {
                        droneManager.disarm()
                    }
                } else {
                    actionButton("Takeoff", icon: "arrow.up.circle.fill", tint: .green) {
                        droneManager.takeoff()
                    }
                    actionButton("Disarm", icon: "lock.fill", tint: .red) {
                        droneManager.disarm()
                    }
                }
            } else {
                if isRover {
                    actionButton("Hold", icon: "pause.circle.fill", tint: .orange) {
                        droneManager.hold()
                    }
                } else {
                    actionButton("Land", icon: "arrow.down.circle.fill", tint: .yellow) {
                        droneManager.land()
                    }
                }
                actionButton("RTL", icon: "house.fill", tint: .red) {
                    droneManager.returnToLaunch()
                }
            }
        }
    }

    private func uploadMission(_ mission: SavedMission) {
        missionUploadProgress = "Uploading..."
        droneManager.uploadMission(waypoints: mission.waypoints) { success in
            if success {
                activeMission = mission.waypoints
                missionUploadProgress = "Uploaded \(mission.name)"
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    missionUploadProgress = nil
                }
            } else {
                missionUploadProgress = "Upload failed"
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    missionUploadProgress = nil
                }
            }
        }
    }

    private func actionButton(_ title: String, icon: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(tint.gradient, in: .capsule)
        }
    }
}

// MARK: - Link Lost Banner

struct LinkLostBanner: View {
    let since: Date

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let elapsed = Int(context.date.timeIntervalSince(since))
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.caption)
                Text("LINK LOST")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                Text("\(elapsed)s")
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.8))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(.red.gradient)
        }
    }
}

// MARK: - Message Console

struct MessageConsole: View {
    let droneManager: DroneManager

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Image(systemName: "text.bubble")
                    .font(.caption2)
                Text("Messages")
                    .font(.caption2.bold())
                Spacer()
                Text("\(droneManager.statusMessages.count)")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
            .foregroundStyle(.white.opacity(0.6))
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(.white.opacity(0.05))

            Divider().background(.white.opacity(0.1))

            // Messages
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    // App status message at top if present
                    if !droneManager.statusMessage.isEmpty {
                        HStack(alignment: .top, spacing: 4) {
                            Text("APP")
                                .font(.system(size: 8, weight: .bold, design: .monospaced))
                                .foregroundStyle(.cyan)
                                .frame(width: 32, alignment: .leading)
                            Text(droneManager.statusMessage)
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(.cyan)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                    }

                    // MAV status messages
                    ForEach(droneManager.statusMessages.prefix(50)) { msg in
                        HStack(alignment: .top, spacing: 4) {
                            Text(msg.type)
                                .font(.system(size: 8, weight: .bold, design: .monospaced))
                                .foregroundStyle(colorForType(msg.type))
                                .frame(width: 32, alignment: .leading)
                            Text(msg.text)
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(.white.opacity(0.8))
                            Spacer()
                            Text(msg.timestamp, style: .time)
                                .font(.system(size: 8, design: .monospaced))
                                .foregroundStyle(.white.opacity(0.3))
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 1)
                    }
                }
                .padding(.vertical, 4)
            }
        }
        .frame(width: 280, height: 160)
        .background(.black.opacity(0.75))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(.white.opacity(0.1), lineWidth: 0.5)
        )
    }

    private func colorForType(_ type: String) -> Color {
        switch type {
        case "ERROR", "CRIT", "ALERT", "EMERG": return .red
        case "WARN": return .orange
        case "INFO", "NOTICE": return .green
        case "DEBUG": return .gray
        default: return .white
        }
    }
}
