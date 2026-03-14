//
//  ContentView.swift
//  pyxios
//
//  Root view: always shows MainTabView. Connection overlay when disconnected.
//

import SwiftUI

struct ContentView: View {
    let droneManager: DroneManager
    private let settings = AppSettings.shared

    var body: some View {
        MainTabView(droneManager: droneManager)
            .onAppear {
                if settings.autoConnectOnLaunch {
                    let addr = settings.lastConnectionAddress
                    if !addr.isEmpty {
                        droneManager.connect(address: addr)
                    }
                }
            }
    }
}
