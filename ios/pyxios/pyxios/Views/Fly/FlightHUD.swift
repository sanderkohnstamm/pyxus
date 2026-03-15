//
//  FlightHUD.swift
//  pyxios
//
//  Compact telemetry overlay: armed state, mode, altitude, speed, heading, battery, GPS.
//  Landscape mode shows extended info: voltage, current, distance to home, attitude indicator.
//  Turns red when connection is lost.
//

import SwiftUI

struct FlightHUD: View {
    let state: VehicleState
    let connectionOk: Bool
    private let settings = AppSettings.shared

    @Environment(\.horizontalSizeClass) private var hSizeClass

    private var isWide: Bool {
        hSizeClass == .regular
    }

    @State private var isLandscape = false

    var body: some View {
        Group {
            if isLandscape {
                landscapeHUD
            } else {
                portraitHUD
            }
        }
        .background(connectionOk ? AnyShapeStyle(.ultraThinMaterial) : AnyShapeStyle(Color.red.opacity(0.6)))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .animation(.easeInOut(duration: 0.3), value: connectionOk)
        .onGeometryChange(for: Bool.self) { proxy in
            proxy.size.width > 500
        } action: { newVal in
            isLandscape = newVal
        }
    }

    // MARK: - Portrait HUD (compact)

    private var portraitHUD: some View {
        VStack(spacing: 4) {
            topRow
            HStack(spacing: 12) {
                hudItem(icon: "arrow.up", value: altString)
                hudItem(icon: "speedometer", value: speedString)
                hudItem(icon: "location.north", value: "\(Int(state.heading))°")
                if state.batteryPercent >= 0 {
                    hudItem(icon: batteryIcon, value: "\(Int(state.batteryPercent))%", color: batteryColor)
                }
                Spacer()
            }
        }
        .padding(10)
    }

    // MARK: - Landscape HUD (extended)

    private var landscapeHUD: some View {
        HStack(spacing: 0) {
            // Left: attitude indicator
            AttitudeIndicator(pitch: state.pitch, roll: state.roll)
                .frame(width: 50, height: 50)
                .padding(.leading, 8)
                .padding(.trailing, 6)

            // Center: main telemetry
            VStack(alignment: .leading, spacing: 3) {
                topRow
                HStack(spacing: 8) {
                    Text("\(state.platformName) · \(state.isArdupilot ? "ArduPilot" : "PX4")")
                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.45))
                }
                HStack(spacing: 10) {
                    hudItem(icon: "arrow.up", value: altString)
                    hudItem(icon: "speedometer", value: speedString)
                    hudItem(icon: "arrow.up.arrow.down", value: vsiString)
                    hudItem(icon: "location.north", value: "\(Int(state.heading))°")
                    if state.distanceToHome > 0 {
                        hudItem(icon: "house", value: distString)
                    }
                }
            }

            Spacer(minLength: 8)

            // Right: battery detail + heartbeat
            VStack(alignment: .trailing, spacing: 3) {
                // Battery
                if state.batteryPercent >= 0 {
                    HStack(spacing: 4) {
                        Image(systemName: batteryIcon)
                            .font(.system(size: 10))
                            .foregroundStyle(batteryColor.opacity(0.7))
                        Text("\(Int(state.batteryPercent))%")
                            .foregroundStyle(batteryColor)
                    }
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                }

                // Voltage + current
                HStack(spacing: 6) {
                    if state.batteryVoltage > 0 {
                        Text(String(format: "%.1fV", state.batteryVoltage))
                            .foregroundStyle(batteryColor)
                    }
                    if state.batteryCurrent > 0 {
                        Text(String(format: "%.1fA", state.batteryCurrent))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                }
                .font(.system(size: 10, weight: .medium, design: .monospaced))

                // Heartbeat age
                if let since = state.linkLostSince {
                    let _ = since // suppress warning
                    Text("LOST")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(.red)
                } else if connectionOk {
                    Text("LIVE")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(.green)
                }
            }
            .padding(.trailing, 10)
        }
        .padding(.vertical, 6)
    }

    // MARK: - Shared Components

    private var topRow: some View {
        HStack(spacing: 8) {
            if !connectionOk {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 10))
                    if let since = state.linkLostSince {
                        TimelineView(.periodic(from: .now, by: 1)) { context in
                            let elapsed = Int(context.date.timeIntervalSince(since))
                            Text("NO LINK \(elapsed)s")
                                .font(.system(size: 11, weight: .bold, design: .monospaced))
                        }
                    } else {
                        Text("NO LINK")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                    }
                }
                .foregroundStyle(.white)
            } else {
                HStack(spacing: 4) {
                    Circle()
                        .fill(state.armed ? Color.red : Color.green)
                        .frame(width: 8, height: 8)
                    Text(state.armed ? "ARMED" : "DISARMED")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(state.armed ? .red : .green)
                }

                if !state.flightMode.isEmpty {
                    Text(state.flightMode)
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.white.opacity(0.15))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }

                Text("\(state.platformName) / \(state.isArdupilot ? "AP" : "PX4")")
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.35))
            }

            Spacer()

            HStack(spacing: 3) {
                Image(systemName: gpsIcon)
                    .font(.system(size: 10))
                    .foregroundStyle(gpsColor)
                Text("\(state.satellites)")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(gpsColor)
            }
        }
    }

    // MARK: - Formatted Strings

    private var altString: String {
        String(format: "%.1f%@",
               settings.unitSystem.convertAltitude(state.altitudeRelative),
               settings.unitSystem.altitudeUnit)
    }

    private var speedString: String {
        String(format: "%.1f%@",
               settings.unitSystem.convertSpeed(state.groundSpeed),
               settings.unitSystem.speedUnit)
    }

    private var vsiString: String {
        String(format: "%+.1fm/s", state.verticalSpeed)
    }

    private var distString: String {
        String(format: "%.0f%@",
               settings.unitSystem.convertAltitude(state.distanceToHome),
               settings.unitSystem.altitudeUnit)
    }

    // MARK: - HUD Item

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

    // MARK: - Battery / GPS helpers

    private var gpsIcon: String {
        state.gpsFixType >= 3 ? "location.fill" : "location.slash"
    }

    private var gpsColor: Color {
        if state.gpsFixType >= 3 { return .green }
        if state.gpsFixType >= 2 { return .yellow }
        return .red
    }

    private var batteryIcon: String {
        let pct = state.batteryPercent
        if pct > 75 { return "battery.100" }
        if pct > 50 { return "battery.75" }
        if pct > 25 { return "battery.50" }
        return "battery.25"
    }

    private var batteryColor: Color {
        let pct = state.batteryPercent
        if pct <= 20 { return .red }
        if pct <= 30 { return .yellow }
        return .white
    }
}

// MARK: - Attitude Indicator

struct AttitudeIndicator: View {
    let pitch: Float  // degrees, positive = nose up
    let roll: Float   // degrees, positive = right wing down

    var body: some View {
        GeometryReader { geo in
            let size = min(geo.size.width, geo.size.height)
            let r = size / 2

            ZStack {
                // Sky/ground split
                Circle()
                    .fill(Color.cyan.opacity(0.25))

                // Ground half, shifted by pitch
                let pitchOffset = CGFloat(pitch) / 90 * r
                Circle()
                    .fill(Color.brown.opacity(0.35))
                    .clipShape(
                        HorizonClip(offset: pitchOffset)
                    )
                    .rotationEffect(.degrees(Double(-roll)))

                // Center dot
                Circle()
                    .fill(Color.white)
                    .frame(width: 4, height: 4)

                // Wings indicator
                HStack(spacing: 0) {
                    Rectangle()
                        .fill(Color.white.opacity(0.9))
                        .frame(width: r * 0.35, height: 2)
                    Spacer()
                        .frame(width: 8)
                    Rectangle()
                        .fill(Color.white.opacity(0.9))
                        .frame(width: r * 0.35, height: 2)
                }

                // Horizon line
                Rectangle()
                    .fill(Color.white.opacity(0.5))
                    .frame(width: size * 0.7, height: 1)
                    .offset(y: -CGFloat(pitch) / 90 * r)
                    .rotationEffect(.degrees(Double(-roll)))

                // Border ring
                Circle()
                    .stroke(Color.white.opacity(0.3), lineWidth: 1)
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
        }
    }
}

/// Clips the bottom half of a circle, shifted by an offset for pitch.
struct HorizonClip: Shape {
    let offset: CGFloat

    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.addRect(CGRect(x: 0, y: rect.midY + offset, width: rect.width, height: rect.height))
        return p
    }
}
