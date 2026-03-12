//
//  pyxiosApp.swift
//  pyxios
//
//  Created by Sander Kohnstamm on 12/03/2026.
//

import SwiftUI

@main
struct pyxiosApp: App {
    @State private var pythonRunner = PythonRunner()
    // Keep backend alive when backgrounded during active flights
    private let backgroundManager = BackgroundManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView(pythonRunner: pythonRunner)
                .task {
                    await pythonRunner.start()
                }
        }
    }
}
