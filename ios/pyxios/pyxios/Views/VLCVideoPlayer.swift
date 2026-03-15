//
//  VLCVideoPlayer.swift
//  pyxios
//
//  VLCKit-based video player for RTSP streams.
//  AVPlayer does not support RTSP on iOS — VLCKit handles it.
//

import SwiftUI
import VLCKitSPM

/// UIViewRepresentable wrapping VLCMediaPlayer for RTSP playback.
struct VLCVideoView: UIViewRepresentable {
    let url: String

    func makeUIView(context: Context) -> VLCPlayerUIView {
        let view = VLCPlayerUIView()
        view.play(urlString: url)
        return view
    }

    func updateUIView(_ uiView: VLCPlayerUIView, context: Context) {
        if uiView.currentURL != url {
            uiView.play(urlString: url)
        }
    }

    static func dismantleUIView(_ uiView: VLCPlayerUIView, coordinator: ()) {
        uiView.stopAsync()
    }
}

/// UIView that hosts VLCMediaPlayer rendering.
final class VLCPlayerUIView: UIView {
    private var mediaPlayer: VLCMediaPlayer?
    private(set) var currentURL: String = ""

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func play(urlString: String) {
        stop()
        currentURL = urlString
        print("[VLCPlayer] Playing: \(urlString)")

        guard let url = URL(string: urlString) else {
            print("[VLCPlayer] Invalid URL: \(urlString)")
            return
        }

        let media = VLCMedia(url: url)
        // Low-latency options for drone video
        media.addOption("--network-caching=150")
        media.addOption("--rtsp-tcp")
        media.addOption("--no-audio")

        let player = VLCMediaPlayer()
        player.drawable = self
        player.media = media
        mediaPlayer = player

        player.play()
        print("[VLCPlayer] Started playback, state: \(player.state.rawValue)")

        // Log state after a short delay to catch init failures
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
            guard let self, let player = self.mediaPlayer else { return }
            print("[VLCPlayer] State after 2s: \(player.state.rawValue), isPlaying: \(player.isPlaying)")
            if !player.isPlaying {
                print("[VLCPlayer] WARNING: Player not playing — may indicate init failure on this device")
            }
        }
    }

    func stop() {
        if let player = mediaPlayer {
            print("[VLCPlayer] Stopping playback")
            player.stop()
            mediaPlayer = nil
        }
        currentURL = ""
    }

    /// Stop playback on a background queue to avoid blocking the main thread.
    func stopAsync() {
        if let player = mediaPlayer {
            mediaPlayer = nil
            currentURL = ""
            print("[VLCPlayer] Stopping playback async")
            DispatchQueue.global(qos: .utility).async {
                player.stop()
            }
        } else {
            currentURL = ""
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        // VLCMediaPlayer uses the drawable's bounds automatically
    }

    deinit {
        if let player = mediaPlayer {
            DispatchQueue.global(qos: .utility).async {
                player.stop()
            }
        }
    }
}
