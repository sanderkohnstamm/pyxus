//
//  MainTabView.swift
//  pyxios
//
//  View router: Command, Video, Plan, Tools. No tab bar — navigation via hamburger menu.
//  Joystick state is shared between Command and Video views.
//

import SwiftUI

enum AppTab: String {
    case command, video, plan, tools

    /// Command and Video are "flight views" — switching between them keeps joystick state.
    var isFlightView: Bool {
        self == .command || self == .video
    }
}

struct MainTabView: View {
    let droneManager: DroneManager
    @State private var selectedTab: AppTab = .command
    @State private var showJoysticks = false

    var body: some View {
        ZStack {
            CommandView(droneManager: droneManager, switchTab: { selectedTab = $0 }, showJoysticks: $showJoysticks)
                .opacity(selectedTab == .command ? 1 : 0)
                .allowsHitTesting(selectedTab == .command)
            VideoView(droneManager: droneManager, switchTab: { selectedTab = $0 }, showJoysticks: $showJoysticks)
                .opacity(selectedTab == .video ? 1 : 0)
                .allowsHitTesting(selectedTab == .video)
            PlanView(droneManager: droneManager, switchTab: { selectedTab = $0 })
                .opacity(selectedTab == .plan ? 1 : 0)
                .allowsHitTesting(selectedTab == .plan)
            ToolsView(droneManager: droneManager, switchTab: { selectedTab = $0 })
                .opacity(selectedTab == .tools ? 1 : 0)
                .allowsHitTesting(selectedTab == .tools)
        }
    }
}
