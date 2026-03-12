//
//  NativeVideoPlayer.swift
//  pyxios
//
//  Native RTSP video player using AVPlayer with Picture-in-Picture support.
//  Controlled from the React frontend via the JS bridge.
//

import SwiftUI
import AVKit
import Combine

/// Manages native video playback state shared between SwiftUI views and the JS bridge.
@Observable
final class VideoPlayerManager {
    static let shared = VideoPlayerManager()

    var player: AVPlayer?
    var isPlaying = false
    var isFullscreen = false
    var currentURL: String = ""

    private init() {}

    func play(urlString: String) {
        guard let url = URL(string: urlString) else { return }

        // Reuse player if same URL
        if currentURL == urlString, let player = player {
            player.play()
            isPlaying = true
            return
        }

        // Configure audio session for video playback
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)

        let asset = AVURLAsset(url: url, options: [
            "AVURLAssetHTTPHeaderFieldsKey": [:] as [String: String]
        ])
        let item = AVPlayerItem(asset: asset)
        let newPlayer = AVPlayer(playerItem: item)
        newPlayer.automaticallyWaitsToMinimizeStalling = false

        self.player = newPlayer
        self.currentURL = urlString
        newPlayer.play()
        isPlaying = true
    }

    func stop() {
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        player = nil
        isPlaying = false
        isFullscreen = false
        currentURL = ""
    }

    func toggleFullscreen() {
        isFullscreen.toggle()
    }

    func enterFullscreen() {
        isFullscreen = true
    }

    func exitFullscreen() {
        isFullscreen = false
    }
}

/// PiP video view — small overlay in the corner.
struct VideoPlayerPiP: View {
    let manager = VideoPlayerManager.shared

    var body: some View {
        if manager.isPlaying, let player = manager.player {
            VideoPlayerView(player: player)
                .frame(width: 160, height: 90)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.white.opacity(0.15), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.5), radius: 8, y: 4)
                .onTapGesture {
                    manager.enterFullscreen()
                }
                .onLongPressGesture {
                    manager.stop()
                }
        }
    }
}

/// Fullscreen video overlay with telemetry HUD.
struct VideoPlayerFullscreen: View {
    let manager = VideoPlayerManager.shared
    @State private var showHUD = true
    @State private var hideTimer: Timer?

    var body: some View {
        if manager.isFullscreen, let player = manager.player {
            ZStack {
                Color.black.ignoresSafeArea()

                VideoPlayerView(player: player)
                    .ignoresSafeArea()
                    .onTapGesture {
                        showHUD.toggle()
                        resetHideTimer()
                    }

                if showHUD {
                    // Close button
                    VStack {
                        HStack {
                            Spacer()
                            Button {
                                manager.exitFullscreen()
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.title2)
                                    .foregroundStyle(.white.opacity(0.8))
                                    .padding(16)
                            }
                        }
                        Spacer()
                    }
                }
            }
            .transition(.opacity)
            .onAppear { resetHideTimer() }
            .onDisappear { hideTimer?.invalidate() }
        }
    }

    private func resetHideTimer() {
        hideTimer?.invalidate()
        showHUD = true
        hideTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: false) { _ in
            DispatchQueue.main.async {
                showHUD = false
            }
        }
    }
}

/// UIKit wrapper for AVPlayerLayer — gives better performance than SwiftUI's VideoPlayer.
struct VideoPlayerView: UIViewRepresentable {
    let player: AVPlayer

    func makeUIView(context: Context) -> PlayerUIView {
        PlayerUIView(player: player)
    }

    func updateUIView(_ uiView: PlayerUIView, context: Context) {
        uiView.updatePlayer(player)
    }
}

final class PlayerUIView: UIView {
    private var playerLayer: AVPlayerLayer

    init(player: AVPlayer) {
        playerLayer = AVPlayerLayer(player: player)
        super.init(frame: .zero)
        playerLayer.videoGravity = .resizeAspect
        layer.addSublayer(playerLayer)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        playerLayer.frame = bounds
    }

    func updatePlayer(_ player: AVPlayer) {
        playerLayer.player = player
    }
}
