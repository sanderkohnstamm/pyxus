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
