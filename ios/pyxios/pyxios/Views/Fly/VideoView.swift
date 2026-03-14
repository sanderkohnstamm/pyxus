//
//  VideoView.swift
//  pyxios
//
//  Full-screen video view with HUD, action buttons, joysticks, and hamburger menu.
//

import SwiftUI
import CoreLocation

struct VideoView: View {
    let droneManager: DroneManager
    var switchTab: ((AppTab) -> Void)?
    @Binding var showJoysticks: Bool
    @State private var showConsole = false
    @State private var showMiniMap = false
    @State private var pendingTab: AppTab?
    @State private var showManualWarning = false
    private let videoManager = VideoPlayerManager.shared
    private let settings = AppSettings.shared

    private static let manualModes: Set<String> = [
        "STABILIZE", "ALT_HOLD", "POSHOLD", "ACRO",
        "MANUAL", "QSTABILIZE", "QHOVER", "QLOITER"
    ]

    private var isConnected: Bool { droneManager.state.connectionState.isConnected }

    var body: some View {
        ZStack {
            // Full-screen video or camera feed
            Color.black.ignoresSafeArea()
            if let player = videoManager.player, videoManager.isPlaying {
                VideoPlayerView(player: player)
                    .ignoresSafeArea()
            } else if settings.useCameraFeed {
                CameraFeedView()
                    .ignoresSafeArea()
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "video.slash")
                        .font(.system(size: 40))
                        .foregroundStyle(.gray.opacity(0.5))
                    Text("No video feed")
                        .font(.callout)
                        .foregroundStyle(.gray.opacity(0.5))
                }
            }

            // Top: HUD + hamburger
            VStack(spacing: 0) {
                if let since = droneManager.state.linkLostSince {
                    LinkLostBanner(since: since)
                }

                if isConnected {
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
                        VStack(spacing: 12) {
                            JoystickOverlay(droneManager: droneManager)

                            HStack(spacing: 10) {
                                Spacer()
                                actionButtons
                                Spacer()
                            }
                        }
                        .padding(.bottom, 8)
                    } else {
                        HStack(alignment: .bottom) {
                            Spacer()
                            actionButtons
                        }
                        .padding(.horizontal, 16)
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

            // Mini map PiP — tap to switch to command view
            if showMiniMap {
                VStack {
                    HStack {
                        Spacer()
                        MiniMapView(droneManager: droneManager)
                            .onTapGesture { switchTab?(.command) }
                            .padding(.top, 100)
                            .padding(.trailing, 12)
                    }
                    Spacer()
                }
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

    // MARK: - Hamburger Menu

    private var hamburgerMenu: some View {
        Menu {
            // Tab navigation — always first
            Button {
                navigateToTab(.command)
            } label: {
                Label("Command", systemImage: "airplane")
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
                showMiniMap.toggle()
            } label: {
                Label(showMiniMap ? "Mini Map On" : "Mini Map",
                      systemImage: showMiniMap ? "map.fill" : "map")
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
                switchTab?(.command)
            } label: {
                Label("Command", systemImage: "airplane")
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
}

// MARK: - Mini Video

struct MiniVideoView: View {
    let videoManager: VideoPlayerManager
    private let settings = AppSettings.shared

    var body: some View {
        Group {
            if let player = videoManager.player, videoManager.isPlaying {
                VideoPlayerView(player: player)
            } else if settings.useCameraFeed {
                CameraFeedView()
            } else {
                ZStack {
                    Color.black
                    Image(systemName: "video.slash")
                        .font(.system(size: 20))
                        .foregroundStyle(.gray.opacity(0.5))
                }
            }
        }
        .frame(width: 180, height: 120)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.white.opacity(0.2), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.5), radius: 8, y: 4)
    }
}

// MARK: - Mini Map

struct MiniMapView: View {
    let droneManager: DroneManager
    @State private var followMode = true

    var body: some View {
        DroneMapView(
            droneManager: droneManager,
            followMode: $followMode,
            missionWaypoints: [],
            activeMissionSeq: -1
        )
        .frame(width: 180, height: 120)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.white.opacity(0.2), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.5), radius: 8, y: 4)
    }
}
