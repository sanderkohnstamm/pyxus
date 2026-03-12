//
//  VideoHUDOverlay.swift
//  pyxios
//
//  Telemetry heads-up display shown over the fullscreen video player.
//  Displays critical flight info: armed state, mode, battery, altitude, speed.
//  Data is pushed from the React frontend via the JS bridge.
//

import SwiftUI

/// Telemetry data pushed from the JS frontend.
@Observable
final class TelemetryHUD {
    static let shared = TelemetryHUD()

    var armed = false
    var mode = ""
    var batteryPercent: Int = -1
    var altitude: Double = 0
    var groundSpeed: Double = 0
    var heading: Int = 0

    private init() {}

    func update(from dict: [String: Any]) {
        armed = dict["armed"] as? Bool ?? armed
        mode = dict["mode"] as? String ?? mode
        batteryPercent = dict["battery"] as? Int ?? batteryPercent
        altitude = dict["altitude"] as? Double ?? altitude
        groundSpeed = dict["groundSpeed"] as? Double ?? groundSpeed
        heading = dict["heading"] as? Int ?? heading
    }
}

/// HUD overlay shown in top-left corner of fullscreen video.
struct VideoHUDOverlay: View {
    let hud = TelemetryHUD.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            // Armed + Mode
            HStack(spacing: 6) {
                Circle()
                    .fill(hud.armed ? Color.red : Color.green)
                    .frame(width: 8, height: 8)
                Text(hud.armed ? "ARMED" : "DISARMED")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(hud.armed ? .red : .green)
                if !hud.mode.isEmpty {
                    Text(hud.mode)
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.white.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }

            // Telemetry values
            HStack(spacing: 12) {
                hudItem(icon: "arrow.up", value: String(format: "%.1fm", hud.altitude))
                hudItem(icon: "speedometer", value: String(format: "%.1fm/s", hud.groundSpeed))
                hudItem(icon: "location.north", value: "\(hud.heading)°")
                if hud.batteryPercent >= 0 {
                    hudItem(
                        icon: "battery.50",
                        value: "\(hud.batteryPercent)%",
                        color: hud.batteryPercent <= 20 ? .red : (hud.batteryPercent <= 30 ? .yellow : .white)
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
