//
//  VideoFeedView.swift
//  pyxios
//
//  RTSP video feed view, reusing existing AVPlayer infrastructure.
//

import SwiftUI

struct VideoFeedView: View {
    private let videoManager = VideoPlayerManager.shared

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let player = videoManager.player {
                VideoPlayerView(player: player)
                    .ignoresSafeArea()
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "video.slash")
                        .font(.largeTitle)
                        .foregroundStyle(.gray)
                    Text("No video feed")
                        .foregroundStyle(.gray)
                }
            }
        }
    }
}
