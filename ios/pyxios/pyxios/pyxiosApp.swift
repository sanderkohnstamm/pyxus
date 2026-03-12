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

    var body: some Scene {
        WindowGroup {
            ContentView(pythonRunner: pythonRunner)
                .task {
                    await pythonRunner.start()
                }
        }
    }
}
