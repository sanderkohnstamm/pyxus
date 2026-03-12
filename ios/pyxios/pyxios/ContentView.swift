//
//  ContentView.swift
//  pyxios
//
//  Created by Sander Kohnstamm on 12/03/2026.
//

import SwiftUI

struct ContentView: View {
    let pythonRunner: PythonRunner
    let videoManager = VideoPlayerManager.shared

    var body: some View {
        ZStack {
            if pythonRunner.isReady {
                WebViewContainer()
                    .ignoresSafeArea()

                // Video PiP overlay (top-right when not fullscreen)
                if videoManager.isPlaying && !videoManager.isFullscreen {
                    VStack {
                        HStack {
                            Spacer()
                            VideoPlayerPiP()
                                .padding(.top, 56) // Below status strip
                                .padding(.trailing, 12)
                        }
                        Spacer()
                    }
                }

                // Fullscreen video overlay
                if videoManager.isFullscreen {
                    ZStack(alignment: .topLeading) {
                        VideoPlayerFullscreen()
                        VideoHUDOverlay()
                            .padding(.top, 56)
                            .padding(.leading, 16)
                    }
                    .transition(.opacity)
                }
            } else {
                LaunchView(status: pythonRunner.statusMessage)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: videoManager.isFullscreen)
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
