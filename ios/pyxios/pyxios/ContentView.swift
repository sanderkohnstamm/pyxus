//
//  ContentView.swift
//  pyxios
//
//  Created by Sander Kohnstamm on 12/03/2026.
//

import SwiftUI

struct ContentView: View {
    let pythonRunner: PythonRunner

    var body: some View {
        ZStack {
            if pythonRunner.isReady {
                WebViewContainer()
                    .ignoresSafeArea()
            } else {
                LaunchView(status: pythonRunner.statusMessage)
            }
        }
    }
}

/// Shown while Python backend is booting
struct LaunchView: View {
    let status: String

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 24) {
                Image(systemName: "airplane")
                    .font(.system(size: 48))
                    .foregroundStyle(.cyan)
                Text("Pyxus")
                    .font(.largeTitle.bold())
                    .foregroundStyle(.white)
                ProgressView()
                    .tint(.cyan)
                Text(status)
                    .font(.caption)
                    .foregroundStyle(.gray)
            }
        }
    }
}

#Preview {
    ContentView(pythonRunner: PythonRunner())
}
