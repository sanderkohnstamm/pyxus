//
//  MainTabView.swift
//  pyxios
//
//  Three-tab scaffold: Fly, Plan, Tools. Shown after connection.
//

import SwiftUI

struct MainTabView: View {
    let droneManager: DroneManager

    var body: some View {
        TabView {
            Tab("Fly", systemImage: "airplane") {
                FlyView(droneManager: droneManager)
            }

            Tab("Plan", systemImage: "map") {
                PlanView(droneManager: droneManager)
            }

            Tab("Tools", systemImage: "wrench.and.screwdriver") {
                ToolsView(droneManager: droneManager)
            }
        }
        .tint(.cyan)
    }
}
