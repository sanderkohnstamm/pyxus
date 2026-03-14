//
//  ContentView.swift
//  pyxios
//
//  Root view: always shows MainTabView. Connection overlay when disconnected.
//

import SwiftUI

struct ContentView: View {
    let droneManager: DroneManager

    var body: some View {
        MainTabView(droneManager: droneManager)
    }
}
