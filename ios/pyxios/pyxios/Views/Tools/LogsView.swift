//
//  LogsView.swift
//  pyxios
//
//  Log file list from vehicle via MAVSDK LogFiles plugin.
//

import SwiftUI

struct LogsView: View {
    let droneManager: DroneManager

    var body: some View {
        Group {
            if droneManager.isLoadingLogs {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Fetching log entries...")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if droneManager.logEntries.isEmpty {
                ContentUnavailableView {
                    Label("No Logs", systemImage: "doc.text")
                } description: {
                    Text("Tap refresh to fetch log entries from the vehicle.")
                } actions: {
                    Button("Fetch Logs") {
                        droneManager.fetchLogEntries()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.cyan)
                }
            } else {
                List(droneManager.logEntries) { entry in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Log #\(entry.id)")
                                .font(.subheadline.bold())
                            Text(entry.date)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Text(formatBytes(entry.sizeBytes))
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Logs (\(droneManager.logEntries.count))")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    droneManager.fetchLogEntries()
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(droneManager.isLoadingLogs)
            }
        }
        .onAppear {
            if droneManager.logEntries.isEmpty && droneManager.state.connectionState.isConnected {
                droneManager.fetchLogEntries()
            }
        }
    }

    private func formatBytes(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f KB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / (1024 * 1024))
    }
}
