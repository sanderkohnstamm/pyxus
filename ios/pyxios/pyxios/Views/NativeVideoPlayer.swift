//
//  NativeVideoPlayer.swift
//  pyxios
//
//  Native RTSP video player using AVPlayer with Picture-in-Picture support.
//

import SwiftUI
import AVKit
import Combine

/// Manages native video playback state shared between SwiftUI views.
@Observable
final class VideoPlayerManager {
    static let shared = VideoPlayerManager()

    var player: AVPlayer?
    var isPlaying = false
    var isFullscreen = false
    var currentURL: String = ""

    private init() {}

    var errorMessage: String = ""
    private var statusObserver: NSKeyValueObservation?
    private var errorObserver: NSKeyValueObservation?

    func play(urlString: String) {
        print("[VideoPlayer] play() called with: \(urlString)")
        guard let url = URL(string: urlString) else {
            errorMessage = "Invalid URL: \(urlString)"
            print("[VideoPlayer] Invalid URL: \(urlString)")
            return
        }

        // Reuse player if same URL and player is ready
        if currentURL == urlString, let player = player {
            let itemStatus = player.currentItem?.status ?? .unknown
            print("[VideoPlayer] Same URL, item status: \(itemStatus.rawValue) (0=unknown, 1=ready, 2=failed), timeControlStatus: \(player.timeControlStatus.rawValue)")
            if itemStatus == .readyToPlay {
                player.play()
                isPlaying = true
                return
            }
            // If unknown (still loading), just wait — don't recreate
            if itemStatus == .unknown {
                print("[VideoPlayer] Still loading, not recreating")
                return
            }
            // If failed, fall through to recreate
            print("[VideoPlayer] Previous player failed, recreating")
        }

        print("[VideoPlayer] Creating new player for: \(urlString)")
        stop()
        errorMessage = ""

        // Configure audio session for video playback
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)

        // For RTSP: use networkAccessType .none to avoid HTTP-only options
        let isRTSP = urlString.lowercased().hasPrefix("rtsp://")
        print("[VideoPlayer] isRTSP: \(isRTSP), URL scheme: \(url.scheme ?? "nil")")
        let asset: AVURLAsset
        if isRTSP {
            // RTSP streams: no HTTP headers, use default transport
            asset = AVURLAsset(url: url)
        } else {
            asset = AVURLAsset(url: url, options: [
                "AVURLAssetHTTPHeaderFieldsKey": [:] as [String: String]
            ])
        }
        print("[VideoPlayer] Asset created: \(asset.url)")

        let item = AVPlayerItem(asset: asset)
        item.preferredForwardBufferDuration = 1  // low latency
        print("[VideoPlayer] PlayerItem created, status: \(item.status.rawValue)")

        let newPlayer = AVPlayer(playerItem: item)
        newPlayer.automaticallyWaitsToMinimizeStalling = false
        print("[VideoPlayer] AVPlayer created, calling play()")

        // Observe playback status for errors
        statusObserver = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                switch item.status {
                case .failed:
                    let underlying = (item.error as? NSError)?.localizedDescription ?? "Unknown error"
                    self.errorMessage = underlying
                    self.isPlaying = false
                    self.currentURL = ""  // Allow retry
                    print("[VideoPlayer] Failed: \(underlying)")
                    if let err = item.error as? NSError {
                        print("[VideoPlayer] Domain: \(err.domain) Code: \(err.code)")
                        if let underlying = err.userInfo[NSUnderlyingErrorKey] as? NSError {
                            print("[VideoPlayer] Underlying: \(underlying)")
                        }
                    }
                case .readyToPlay:
                    self.errorMessage = ""
                    print("[VideoPlayer] Ready to play")
                default:
                    break
                }
            }
        }

        // Observe player error
        errorObserver = newPlayer.observe(\.status, options: [.new]) { [weak self] player, _ in
            if player.status == .failed, let error = player.error {
                DispatchQueue.main.async {
                    self?.errorMessage = error.localizedDescription
                    self?.isPlaying = false
                    print("[VideoPlayer] Player error: \(error)")
                }
            }
        }

        self.player = newPlayer
        self.currentURL = urlString
        newPlayer.play()
        isPlaying = true
        print("[VideoPlayer] play() called on AVPlayer, url: \(urlString)")

        // Periodic status check for debugging
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self, weak newPlayer] in
            guard let self, let p = newPlayer else { return }
            let item = p.currentItem
            print("[VideoPlayer] +2s check — item.status: \(item?.status.rawValue ?? -1), timeControl: \(p.timeControlStatus.rawValue), rate: \(p.rate), error: \(item?.error?.localizedDescription ?? "none")")
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self, weak newPlayer] in
            guard let self, let p = newPlayer else { return }
            let item = p.currentItem
            print("[VideoPlayer] +5s check — item.status: \(item?.status.rawValue ?? -1), timeControl: \(p.timeControlStatus.rawValue), rate: \(p.rate), error: \(item?.error?.localizedDescription ?? "none")")
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self, weak newPlayer] in
            guard let self, let p = newPlayer else { return }
            let item = p.currentItem
            print("[VideoPlayer] +10s check — item.status: \(item?.status.rawValue ?? -1), timeControl: \(p.timeControlStatus.rawValue), rate: \(p.rate), error: \(item?.error?.localizedDescription ?? "none")")
            if item?.status == .unknown {
                self.errorMessage = "Stream timeout — could not connect"
                print("[VideoPlayer] Timeout: still in .unknown after 10s")
            }
        }
    }

    func stop() {
        print("[VideoPlayer] stop() called, was playing: \(currentURL)")
        statusObserver?.invalidate()
        statusObserver = nil
        errorObserver?.invalidate()
        errorObserver = nil
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        player = nil
        isPlaying = false
        isFullscreen = false
        currentURL = ""
        errorMessage = ""
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
