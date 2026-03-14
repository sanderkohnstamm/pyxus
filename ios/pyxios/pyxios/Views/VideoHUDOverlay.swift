//
//  VideoHUDOverlay.swift
//  pyxios
//
//  Telemetry heads-up display shown over the fullscreen video player.
//

import SwiftUI

struct VideoHUDOverlay: View {
    let state: VehicleState

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Circle()
                    .fill(state.armed ? Color.red : Color.green)
                    .frame(width: 8, height: 8)
                Text(state.armed ? "ARMED" : "DISARMED")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(state.armed ? .red : .green)
                if !state.flightMode.isEmpty {
                    Text(state.flightMode)
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.white.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }

            HStack(spacing: 12) {
                hudItem(icon: "arrow.up", value: String(format: "%.1fm", state.altitudeRelative))
                hudItem(icon: "speedometer", value: String(format: "%.1fm/s", state.groundSpeed))
                hudItem(icon: "location.north", value: "\(Int(state.heading))°")
                if state.batteryPercent >= 0 {
                    let pct = Int(state.batteryPercent)
                    hudItem(
                        icon: "battery.50",
                        value: "\(pct)%",
                        color: pct <= 20 ? .red : (pct <= 30 ? .yellow : .white)
                    )
                }
            }
        }
        .padding(10)
        .background(.black.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private func hudItem(icon: String, value: String, color: Color = .white) -> some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
                .font(.system(size: 10))
                .foregroundStyle(color.opacity(0.7))
            Text(value)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(color)
        }
    }
}
