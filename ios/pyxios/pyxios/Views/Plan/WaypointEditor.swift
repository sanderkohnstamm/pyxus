//
//  WaypointEditor.swift
//  pyxios
//
//  Inline editor for a single waypoint shown as overlay on map.
//

import SwiftUI
import CoreLocation

struct WaypointEditor: View {
    @Binding var waypoint: Waypoint
    let index: Int
    var onDelete: () -> Void
    var onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            // Header
            HStack {
                Image(systemName: waypoint.action.icon)
                    .foregroundStyle(waypoint.action.markerColor)
                Text("Waypoint \(index + 1)")
                    .font(.headline)
                Spacer()
                Button { onDelete() } label: {
                    Image(systemName: "trash")
                        .foregroundStyle(.red)
                }
                Button { onDismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
            }

            // Coordinates
            Text(String(format: "%.6f, %.6f", waypoint.latitude, waypoint.longitude))
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            // Type picker — full width, scrollable
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Waypoint.WaypointAction.allCases, id: \.self) { action in
                        Button {
                            waypoint.action = action
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: action.icon)
                                    .font(.system(size: 10))
                                Text(action.rawValue)
                                    .font(.caption2)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                            .background(waypoint.action == action ? action.markerColor : Color(.systemGray5))
                            .foregroundStyle(waypoint.action == action ? .white : .primary)
                            .clipShape(Capsule())
                        }
                    }
                }
            }

            // Parameters row
            HStack(spacing: 10) {
                paramField(label: "Alt (m)", value: $waypoint.altitude)
                paramField(label: "Speed (m/s)", value: $waypoint.speed)

                if waypoint.action == .loiter || waypoint.action == .loiterTurns {
                    paramField(label: "Radius (m)", value: $waypoint.loiterRadius)
                }
                if waypoint.action == .loiter {
                    paramField(label: "Time (s)", value: $waypoint.loiterTime)
                }
            }

            // Advanced row
            HStack(spacing: 10) {
                // Camera action
                VStack(alignment: .leading, spacing: 2) {
                    Text("Camera").font(.caption2).foregroundStyle(.secondary)
                    Picker("", selection: $waypoint.cameraAction) {
                        ForEach(Waypoint.CameraAction.allCases, id: \.self) { ca in
                            Text(ca.rawValue).tag(ca)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .tint(.primary)
                }

                paramField(label: "Yaw (°)", value: $waypoint.yawAngle)
                paramField(label: "Accept (m)", value: $waypoint.acceptRadius)
            }
        }
        .onDisappear { clampValues() }
    }

    private func paramField(label: String, value: Binding<Float>) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            TextField("0", value: value, format: .number)
                .keyboardType(.decimalPad)
                .font(.system(.callout, design: .monospaced))
                .padding(6)
                .background(Color(.systemGray6))
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }

    /// Clamp all waypoint parameters to safe ranges.
    private func clampValues() {
        waypoint.altitude = min(max(waypoint.altitude, 0), 500)
        waypoint.speed = min(max(waypoint.speed, 0), 50)
        waypoint.loiterRadius = min(max(waypoint.loiterRadius, 0.1), 1000)
        waypoint.loiterTime = min(max(waypoint.loiterTime, 0), 3600)
        waypoint.yawAngle = waypoint.yawAngle.truncatingRemainder(dividingBy: 360)
        if waypoint.yawAngle < 0 { waypoint.yawAngle += 360 }
        waypoint.acceptRadius = min(max(waypoint.acceptRadius, 0.1), 1000)
    }
}
