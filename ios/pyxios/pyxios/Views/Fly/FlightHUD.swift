//
//  FlightHUD.swift
//  pyxios
//
//  Compact telemetry overlay: armed state, mode, altitude, speed, heading, battery, GPS.
//  Turns red when connection is lost.
//

import SwiftUI

struct FlightHUD: View {
    let state: VehicleState
    let connectionOk: Bool
    private let settings = AppSettings.shared

    var body: some View {
        VStack(spacing: 4) {
            // Top row: armed + mode + GPS + connection warning
            HStack(spacing: 8) {
                if !connectionOk {
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 10))
                        Text("NO LINK")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                    }
                    .foregroundStyle(.white)
                } else {
                    // Armed indicator
                    HStack(spacing: 4) {
                        Circle()
                            .fill(state.armed ? Color.red : Color.green)
                            .frame(width: 8, height: 8)
                        Text(state.armed ? "ARMED" : "DISARMED")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundStyle(state.armed ? .red : .green)
                    }

                    // Flight mode
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

                Spacer()

                // GPS
                HStack(spacing: 3) {
                    Image(systemName: gpsIcon)
                        .font(.system(size: 10))
                        .foregroundStyle(gpsColor)
                    Text("\(state.satellites)")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(gpsColor)
                }
            }

            // Bottom row: telemetry values
            HStack(spacing: 12) {
                hudItem(
                    icon: "arrow.up",
                    value: String(format: "%.1f%@",
                                  settings.unitSystem.convertAltitude(state.altitudeRelative),
                                  settings.unitSystem.altitudeUnit)
                )
                hudItem(
                    icon: "speedometer",
                    value: String(format: "%.1f%@",
                                  settings.unitSystem.convertSpeed(state.groundSpeed),
                                  settings.unitSystem.speedUnit)
                )
                hudItem(icon: "location.north", value: "\(Int(state.heading))°")
                if state.batteryPercent >= 0 {
                    hudItem(
                        icon: batteryIcon,
                        value: "\(Int(state.batteryPercent))%",
                        color: batteryColor
                    )
                }
                Spacer()
            }
        }
        .padding(10)
        .background(connectionOk ? AnyShapeStyle(.ultraThinMaterial) : AnyShapeStyle(Color.red.opacity(0.6)))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .animation(.easeInOut(duration: 0.3), value: connectionOk)
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
