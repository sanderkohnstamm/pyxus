//
//  CommandView.swift
//  pyxios
//
//  Command view: map, HUD, action buttons, hamburger menu.
//  Unified layout for portrait and landscape.
//

import SwiftUI
import CoreLocation

struct CommandView: View {
    let droneManager: DroneManager
    var switchTab: ((AppTab) -> Void)?
    @Binding var showJoysticks: Bool
    @State private var showConnectSheet = false
    @State private var wasConnected = false
    @State private var showConsole = false
    @State private var isLandscape = false
    @State private var savedMissions: [SavedMission] = []
    @State private var missionUploadProgress: String?
    @State private var followMode = true
    @State private var activeMission: [Waypoint] = []
    @State private var gotoTarget: CLLocationCoordinate2D?
    @State private var showGotoConfirm = false
    @State private var continueFromSeq: Int?
    @State private var showContinueConfirm = false
    @State private var pendingTab: AppTab?
    @State private var showManualWarning = false
    @State private var showMiniVideo = false
    private let videoManager = VideoPlayerManager.shared

    private static let manualModes: Set<String> = [
        "STABILIZE", "ALT_HOLD", "POSHOLD", "ACRO",
        "MANUAL", "QSTABILIZE", "QHOVER", "QLOITER"
    ]

    private var isConnected: Bool { droneManager.state.connectionState.isConnected }
    private var connectionLost: Bool { wasConnected && !isConnected }
    private var showHUD: Bool { isConnected || connectionLost }
    private var isManualMode: Bool { Self.manualModes.contains(droneManager.state.flightMode) }

    var body: some View {
        ZStack {
            // Map
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
                    continueFromSeq = index + 1
                    showContinueConfirm = true
                }
            )
            .ignoresSafeArea(edges: .top)

            // Top: link-lost banner + HUD + hamburger + alerts
            VStack(spacing: 0) {
                if let since = droneManager.state.linkLostSince {
                    LinkLostBanner(since: since)
                }

                if showHUD {
                    HStack(alignment: .center, spacing: 8) {
                        FlightHUD(state: droneManager.state, connectionOk: isConnected)
                            .frame(maxWidth: .infinity)
                        hamburgerMenu
                            .fixedSize()
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 8)

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
                } else {
                    // No HUD — just hamburger top-right
                    HStack {
                        Spacer()
                        disconnectedMenu
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                }

                Spacer()
            }

            // Bottom controls
            if isConnected {
                VStack {
                    Spacer()

                    if showJoysticks {
                        // Joysticks higher, action buttons below
                        VStack(spacing: 12) {
                            JoystickOverlay(droneManager: droneManager)

                            HStack(spacing: 10) {
                                Spacer()
                                actionButtons
                                if let status = missionUploadProgress {
                                    uploadStatusPill(status)
                                }
                                Spacer()
                            }
                        }
                        .padding(.bottom, 8)
                    } else {
                        // No joysticks: action buttons centered at bottom
                        VStack(spacing: 10) {
                            actionButtons
                            if let status = missionUploadProgress {
                                uploadStatusPill(status)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.bottom, 16)
                    }
                }
            }

            // Console overlay
            if showConsole && isConnected {
                VStack {
                    Spacer()
                    HStack {
                        MessageConsole(droneManager: droneManager)
                        Spacer()
                    }
                    .padding(.leading, 12)
                    .padding(.bottom, showJoysticks ? 140 : 90)
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

            // Mini video PiP — tap to switch to video view
            if showMiniVideo {
                VStack {
                    HStack {
                        Spacer()
                        MiniVideoView(videoManager: videoManager)
                            .onTapGesture { switchTab?(.video) }
                            .padding(.top, 100)
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
                if showJoysticks {
                    showJoysticks = false
                    droneManager.stopManualControl()
                }
            }
        }
        .onChange(of: droneManager.missionService.downloadedMission) { _, newMission in
            if !newMission.isEmpty {
                activeMission = newMission
            }
        }
        .onChange(of: droneManager.state.flightMode) { _, newMode in
            if Self.manualModes.contains(newMode) && !showJoysticks {
                showJoysticks = true
                droneManager.startManualControl()
            }
        }
        .alert("Manual Control Active", isPresented: $showManualWarning) {
            Button("Leave (drone will fall!)", role: .destructive) {
                showJoysticks = false
                droneManager.stopManualControl()
                if let tab = pendingTab {
                    switchTab?(tab)
                    pendingTab = nil
                }
            }
            Button("Cancel", role: .cancel) { pendingTab = nil }
        } message: {
            Text("You are sending manual control input. Leaving this view will stop stick input and the drone may fall out of the sky.")
        }
        .onGeometryChange(for: Bool.self) { proxy in
            proxy.size.width > proxy.size.height
        } action: { newIsLandscape in
            isLandscape = newIsLandscape
        }
        .onAppear {
            savedMissions = FlightPlan.savedMissions()
        }
    }

    // MARK: - Hamburger Menu

    private var hamburgerMenu: some View {
        Menu {
            // Tab navigation — always first
            Button {
                navigateToTab(.video)
            } label: {
                Label("Video", systemImage: "video")
            }
            Button {
                navigateToTab(.plan)
            } label: {
                Label("Plan", systemImage: "map")
            }
            Button {
                navigateToTab(.tools)
            } label: {
                Label("Tools", systemImage: "wrench.and.screwdriver")
            }

            Divider()

            // Toggles
            Button {
                followMode.toggle()
            } label: {
                Label(followMode ? "Following" : "Follow Drone",
                      systemImage: followMode ? "location.fill" : "location")
            }

            Button {
                showJoysticks.toggle()
                if showJoysticks {
                    droneManager.startManualControl()
                } else {
                    droneManager.stopManualControl()
                }
            } label: {
                Label(showJoysticks ? "Joysticks On" : "Joysticks",
                      systemImage: showJoysticks ? "gamecontroller.fill" : "gamecontroller")
            }

            Button {
                showConsole.toggle()
            } label: {
                Label(showConsole ? "Console On" : "Console",
                      systemImage: showConsole ? "text.bubble.fill" : "text.bubble")
            }

            Button {
                showMiniVideo.toggle()
            } label: {
                Label(showMiniVideo ? "Mini Video On" : "Mini Video",
                      systemImage: showMiniVideo ? "pip.fill" : "pip")
            }

            Divider()

            // Mode selection
            Menu {
                ForEach(droneManager.availableModes, id: \.self) { mode in
                    Button {
                        droneManager.setFlightMode(mode)
                        if Self.manualModes.contains(mode) && !showJoysticks {
                            showJoysticks = true
                            droneManager.startManualControl()
                        }
                    } label: {
                        if mode == droneManager.state.flightMode {
                            Label(mode, systemImage: "checkmark")
                        } else {
                            Text(mode)
                        }
                    }
                }
            } label: {
                Label(droneManager.state.flightMode.isEmpty ? "Mode" : droneManager.state.flightMode,
                      systemImage: "airplane.circle")
            }

            // Mission
            Menu {
                if !savedMissions.isEmpty {
                    ForEach(savedMissions) { mission in
                        Button {
                            uploadMission(mission)
                        } label: {
                            Label("\(mission.name) (\(mission.waypoints.count) wp)",
                                  systemImage: "arrow.up.doc")
                        }
                    }
                    Divider()
                }
                Button {
                    droneManager.downloadMission { waypoints in
                        activeMission = waypoints ?? []
                    }
                } label: {
                    Label("Download Mission", systemImage: "arrow.down.doc")
                }
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
                Label("Mission", systemImage: "map.circle")
            }

            if isConnected {
                Divider()
                Button(role: .destructive) {
                    droneManager.disconnect()
                } label: {
                    Label("Disconnect", systemImage: "xmark.circle")
                }
            }
        } label: {
            Image(systemName: "line.3.horizontal")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white.opacity(0.85))
                .frame(width: 44, height: 44)
                .background(.regularMaterial)
                .clipShape(Circle())
        }
    }

    private var disconnectedMenu: some View {
        Menu {
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
            Button {
                switchTab?(.tools)
            } label: {
                Label("Tools", systemImage: "wrench.and.screwdriver")
            }
        } label: {
            Image(systemName: "line.3.horizontal")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white.opacity(0.85))
                .frame(width: 44, height: 44)
                .background(.regularMaterial)
                .clipShape(Circle())
        }
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

    // MARK: - Navigation

    private func navigateToTab(_ tab: AppTab) {
        if showJoysticks && !tab.isFlightView {
            pendingTab = tab
            showManualWarning = true
        } else {
            switchTab?(tab)
        }
    }

    // MARK: - Helpers

    private func uploadMission(_ mission: SavedMission) {
        missionUploadProgress = "Uploading..."
        droneManager.uploadMission(waypoints: mission.waypoints) { success in
            if success {
                activeMission = mission.waypoints
                missionUploadProgress = "Uploaded \(mission.name)"
            } else {
                missionUploadProgress = "Upload failed"
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                missionUploadProgress = nil
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
                .background {
                    Capsule()
                        .fill(.ultraThinMaterial)
                        .overlay(Capsule().fill(tint.opacity(0.25)))
                        .overlay(Capsule().strokeBorder(tint.opacity(0.4), lineWidth: 0.5))
                }
        }
    }

    private func uploadStatusPill(_ status: String) -> some View {
        Text(status)
            .font(.system(size: 10, design: .monospaced))
            .foregroundStyle(.cyan)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(.ultraThinMaterial)
            .clipShape(Capsule())
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

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
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
