//
//  WaypointEditor.swift
//  pyxios
//
//  Inline editor for a single waypoint shown as overlay on map.
//  Responsive: compact on iPhone, comfortable on iPad.
//

import SwiftUI
import CoreLocation

struct WaypointEditor: View {
    @Binding var waypoint: Waypoint
    let index: Int
    var onDelete: () -> Void
    var onDismiss: () -> Void

    @Environment(\.horizontalSizeClass) private var hSizeClass
    private var isCompact: Bool { hSizeClass == .compact }

    var body: some View {
        VStack(spacing: isCompact ? 8 : 10) {
            // Header
            HStack {
                Image(systemName: waypoint.action.icon)
                    .foregroundStyle(waypoint.action.markerColor)
                Text("WP \(index + 1)")
                    .font(.headline)
                Spacer()
                Text(String(format: "%.5f, %.5f", waypoint.latitude, waypoint.longitude))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.secondary)
                Button { onDelete() } label: {
                    Image(systemName: "trash")
                        .font(.subheadline)
                        .foregroundStyle(.red)
                }
                Button { onDismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
            }

            // Type picker — scrollable chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 5) {
                    ForEach(Waypoint.WaypointAction.allCases, id: \.self) { action in
                        Button {
                            waypoint.action = action
                        } label: {
                            HStack(spacing: 3) {
                                Image(systemName: action.icon)
                                    .font(.system(size: 9))
                                Text(action.rawValue)
                                    .font(.system(size: 10, weight: .medium))
                            }
                            .padding(.horizontal, 7)
                            .padding(.vertical, 5)
                            .background(waypoint.action == action ? action.markerColor : Color(.systemGray5))
                            .foregroundStyle(waypoint.action == action ? .white : .primary)
                            .clipShape(Capsule())
                        }
                    }
                }
            }

            // Parameters — adaptive grid
            let showRadius = waypoint.action == .loiter || waypoint.action == .loiterTurns
            let showTime = waypoint.action == .loiter

            if isCompact {
                // iPhone: 2-column grid
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                    paramField(label: "Alt (m)", value: $waypoint.altitude)
                    paramField(label: "Speed (m/s)", value: $waypoint.speed)
                    if showRadius {
                        paramField(label: "Radius (m)", value: $waypoint.loiterRadius)
                    }
                    if showTime {
                        paramField(label: "Time (s)", value: $waypoint.loiterTime)
                    }
                    paramField(label: "Yaw (°)", value: $waypoint.yawAngle)
                    // Camera
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Camera").font(.system(size: 10)).foregroundStyle(.secondary)
                        Picker("", selection: $waypoint.cameraAction) {
                            ForEach(Waypoint.CameraAction.allCases, id: \.self) { ca in
                                Text(ca.rawValue).tag(ca)
                            }
                        }
                        .labelsHidden()
                        .pickerStyle(.menu)
                        .tint(.primary)
                        .font(.system(size: 12))
                    }
                }
            } else {
                // iPad: single row of params, then advanced row
                HStack(spacing: 10) {
                    paramField(label: "Alt (m)", value: $waypoint.altitude)
                    paramField(label: "Speed (m/s)", value: $waypoint.speed)
                    if showRadius {
                        paramField(label: "Radius (m)", value: $waypoint.loiterRadius)
                    }
                    if showTime {
                        paramField(label: "Time (s)", value: $waypoint.loiterTime)
                    }
                    paramField(label: "Yaw (°)", value: $waypoint.yawAngle)
                    paramField(label: "Accept (m)", value: $waypoint.acceptRadius)

                    // Camera
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
                }
            }
        }
        .onDisappear { clampValues() }
    }

    private func paramField(label: String, value: Binding<Float>) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.system(size: 10)).foregroundStyle(.secondary)
            TextField("0", value: value, format: .number)
                .keyboardType(.decimalPad)
                .font(.system(size: isCompact ? 13 : 14, design: .monospaced))
                .padding(.horizontal, 6)
                .padding(.vertical, isCompact ? 5 : 6)
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
