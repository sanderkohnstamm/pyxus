//
//  pyxiosApp.swift
//  pyxios
//
//  Created by Sander Kohnstamm on 12/03/2026.
//

import SwiftUI

@main
struct pyxiosApp: App {
    // Keep reference so BackgroundManager stays alive for notification handling
    private let backgroundManager = BackgroundManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView(droneManager: DroneManager.shared)
        }
    }
}
