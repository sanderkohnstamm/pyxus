//
//  InspectorView.swift
//  pyxios
//
//  Live telemetry stream rates and status messages from the vehicle.
//

import SwiftUI

struct InspectorView: View {
    let droneManager: DroneManager
    @State private var selectedTab = 0
    @State private var selectedStream: TelemetryStream?

    var body: some View {
        VStack(spacing: 0) {
            // Tab picker
            Picker("View", selection: $selectedTab) {
                Text("Streams").tag(0)
                Text("Messages").tag(1)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 8)

            Divider()

            if selectedTab == 0 {
                streamsView
            } else {
                messagesView
            }
        }
        .navigationTitle("Inspector")
        .sheet(item: $selectedStream) { stream in
            MessageDetailSheet(stream: stream, droneManager: droneManager)
                .presentationDetents([.medium, .large])
        }
    }

    // MARK: - Streams Tab

    private var streamsView: some View {
        Group {
            if droneManager.telemetryStreams.isEmpty {
                ContentUnavailableView {
                    Label("No Streams", systemImage: "waveform.path")
                } description: {
                    Text("Telemetry streams will appear here when connected.")
                }
            } else {
                List(droneManager.telemetryStreams) { stream in
                    Button {
                        selectedStream = stream
                    } label: {
                        HStack(spacing: 10) {
                            // Hz rate
                            Text(String(format: "%.1f", stream.hz))
                                .font(.system(size: 13, weight: .bold, design: .monospaced))
                                .foregroundStyle(rateColor(stream.hz))
                                .frame(width: 44, alignment: .trailing)
                            Text("Hz")
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundStyle(.secondary)

                            // Stream name
                            Text(stream.name)
                                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                .frame(width: 100, alignment: .leading)

                            // Last value
                            Text(stream.lastValue)
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .foregroundStyle(.primary)
                }
                .listStyle(.plain)
            }
        }
    }

    // MARK: - Messages Tab

    @State private var filterType: String = "All"
    private let types = ["All", "INFO", "WARN", "ERROR", "CRIT", "DEBUG"]

    private var filteredMessages: [StatusMessage] {
        if filterType == "All" { return droneManager.statusMessages }
        return droneManager.statusMessages.filter { $0.type == filterType }
    }

    private var messagesView: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(types, id: \.self) { type in
                        Button {
                            filterType = type
                        } label: {
                            Text(type)
                                .font(.caption2.bold())
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(filterType == type ? colorForType(type) : Color(.systemGray5))
                                .foregroundStyle(filterType == type ? .white : .primary)
                                .clipShape(Capsule())
                        }
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
            }

            Divider()

            if filteredMessages.isEmpty {
                ContentUnavailableView {
                    Label("No Messages", systemImage: "antenna.radiowaves.left.and.right")
                } description: {
                    Text("Status messages from the vehicle will appear here.")
                }
            } else {
                List(filteredMessages) { msg in
                    HStack(alignment: .top, spacing: 8) {
                        Text(msg.type)
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(colorForType(msg.type))
                            .frame(width: 40, alignment: .leading)
                        Text(msg.text)
                            .font(.system(.caption, design: .monospaced))
                        Spacer()
                        Text(msg.timestamp, style: .time)
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    // MARK: - Helpers

    private func rateColor(_ hz: Double) -> Color {
        if hz > 5 { return .green }
        if hz > 1 { return .cyan }
        if hz > 0 { return .yellow }
        return .gray
    }

    private func colorForType(_ type: String) -> Color {
        switch type {
        case "ERROR", "CRIT", "ALERT", "EMERG": return .red
        case "WARN": return .orange
        case "INFO", "NOTICE": return .blue
        case "DEBUG": return .gray
        default: return .cyan
        }
    }
}

// MARK: - Message Detail Sheet

struct MessageDetailSheet: View {
    let stream: TelemetryStream
    let droneManager: DroneManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    // Header
                    HStack {
                        Text(stream.name)
                            .font(.headline.monospaced())
                        Spacer()
                        Text(String(format: "%.1f Hz", stream.hz))
                            .font(.subheadline.monospaced())
                            .foregroundStyle(.cyan)
                    }

                    Divider()

                    // Raw payload hex dump
                    if let drone = droneManager.drone,
                       let payload = drone.lastPayloads[stream.name] {
                        Text("Last Payload (\(payload.count) bytes)")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)

                        // Hex view
                        Text(hexDump(payload))
                            .font(.system(size: 11, design: .monospaced))
                            .textSelection(.enabled)
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 8))

                        // Decoded fields (if known message)
                        if let decoded = decodeMessage(name: stream.name, payload: payload) {
                            Text("Decoded Fields")
                                .font(.caption.bold())
                                .foregroundStyle(.secondary)
                                .padding(.top, 4)

                            ForEach(decoded, id: \.0) { field, value in
                                HStack {
                                    Text(field)
                                        .font(.system(size: 12, weight: .semibold, design: .monospaced))
                                        .frame(width: 140, alignment: .leading)
                                    Text(value)
                                        .font(.system(size: 12, design: .monospaced))
                                        .foregroundStyle(.secondary)
                                    Spacer()
                                }
                            }
                            .padding(10)
                            .background(Color(.systemGray6))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    } else {
                        Text("No payload data available")
                            .foregroundStyle(.secondary)
                    }

                    // Stats
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Stats")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                        HStack {
                            Text("Messages received:")
                                .font(.caption)
                            Spacer()
                            Text("\(stream.updateCount)")
                                .font(.caption.monospaced())
                        }
                        HStack {
                            Text("Last update:")
                                .font(.caption)
                            Spacer()
                            Text(stream.lastUpdate, style: .time)
                                .font(.caption.monospaced())
                        }
                    }
                    .padding(.top, 8)
                }
                .padding()
            }
            .navigationTitle(stream.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func hexDump(_ data: Data) -> String {
        var lines: [String] = []
        let bytes = Array(data)
        for offset in stride(from: 0, to: bytes.count, by: 16) {
            let end = min(offset + 16, bytes.count)
            let hex = bytes[offset..<end].map { String(format: "%02X", $0) }.joined(separator: " ")
            let ascii = bytes[offset..<end].map { (0x20...0x7E).contains($0) ? String(UnicodeScalar($0)) : "." }.joined()
            lines.append(String(format: "%04X: %-48s  %@", offset, hex as NSString, ascii))
        }
        return lines.joined(separator: "\n")
    }

    private func decodeMessage(name: String, payload: Data) -> [(String, String)]? {
        switch name {
        case "HEARTBEAT":
            let m = MsgHeartbeat(from: payload)
            return [
                ("type", "\(m.type)"),
                ("autopilot", "\(m.autopilot)"),
                ("base_mode", String(format: "0x%02X", m.base_mode)),
                ("custom_mode", "\(m.custom_mode)"),
                ("system_status", "\(m.system_status)"),
            ]
        case "ATTITUDE":
            let m = MsgAttitude(from: payload)
            return [
                ("roll", String(format: "%.2f°", m.roll * 180 / .pi)),
                ("pitch", String(format: "%.2f°", m.pitch * 180 / .pi)),
                ("yaw", String(format: "%.2f°", m.yaw * 180 / .pi)),
                ("rollspeed", String(format: "%.3f", m.rollspeed)),
                ("pitchspeed", String(format: "%.3f", m.pitchspeed)),
                ("yawspeed", String(format: "%.3f", m.yawspeed)),
            ]
        case "GLOBAL_POSITION_INT":
            let m = MsgGlobalPositionInt(from: payload)
            return [
                ("lat", String(format: "%.7f", Double(m.lat) / 1e7)),
                ("lon", String(format: "%.7f", Double(m.lon) / 1e7)),
                ("alt", String(format: "%.1f m MSL", Float(m.alt) / 1000)),
                ("relative_alt", String(format: "%.1f m", Float(m.relative_alt) / 1000)),
                ("vx", String(format: "%.2f m/s", Float(m.vx) / 100)),
                ("vy", String(format: "%.2f m/s", Float(m.vy) / 100)),
                ("vz", String(format: "%.2f m/s", Float(m.vz) / 100)),
                ("hdg", "\(m.hdg)"),
            ]
        case "GPS_RAW_INT":
            let m = MsgGpsRawInt(from: payload)
            let fixNames = ["No GPS", "No Fix", "2D Fix", "3D Fix", "DGPS", "RTK Float", "RTK Fixed"]
            let fixStr = Int(m.fix_type) < fixNames.count ? fixNames[Int(m.fix_type)] : "\(m.fix_type)"
            return [
                ("fix_type", fixStr),
                ("lat", String(format: "%.7f", Double(m.lat) / 1e7)),
                ("lon", String(format: "%.7f", Double(m.lon) / 1e7)),
                ("alt", String(format: "%.1f m", Float(m.alt) / 1000)),
                ("eph", "\(m.eph)"),
                ("epv", "\(m.epv)"),
                ("satellites", "\(m.satellites_visible)"),
            ]
        case "VFR_HUD":
            let m = MsgVfrHud(from: payload)
            return [
                ("airspeed", String(format: "%.1f m/s", m.airspeed)),
                ("groundspeed", String(format: "%.1f m/s", m.groundspeed)),
                ("heading", "\(m.heading)°"),
                ("throttle", "\(m.throttle)%"),
                ("alt", String(format: "%.1f m", m.alt)),
                ("climb", String(format: "%.2f m/s", m.climb)),
            ]
        case "SYS_STATUS":
            let m = MsgSysStatus(from: payload)
            return [
                ("voltage", String(format: "%.2f V", Float(m.voltage_battery) / 1000)),
                ("current", String(format: "%.2f A", Float(m.current_battery) / 100)),
                ("remaining", "\(m.battery_remaining)%"),
                ("cpu_load", "\(m.load)"),
                ("errors_comm", "\(m.errors_comm)"),
            ]
        case "BATTERY_STATUS":
            let m = MsgBatteryStatus(from: payload)
            return [
                ("id", "\(m.id)"),
                ("temperature", m.temperature != Int16.max ? String(format: "%.1f°C", Float(m.temperature) / 100) : "N/A"),
                ("current", String(format: "%.2f A", Float(m.current_battery) / 100)),
                ("remaining", "\(m.battery_remaining)%"),
            ]
        case "HOME_POSITION":
            let m = MsgHomePosition(from: payload)
            return [
                ("lat", String(format: "%.7f", Double(m.latitude) / 1e7)),
                ("lon", String(format: "%.7f", Double(m.longitude) / 1e7)),
                ("alt", String(format: "%.1f m", Float(m.altitude) / 1000)),
            ]
        default:
            return nil
        }
    }
}
