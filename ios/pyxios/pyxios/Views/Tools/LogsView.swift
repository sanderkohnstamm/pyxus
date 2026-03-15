//
//  LogsView.swift
//  pyxios
//
//  Log file list with per-log download via MAVLink LOG protocol.
//

import SwiftUI

struct LogsView: View {
    let droneManager: DroneManager
    @State private var shareURL: URL?
    @State private var showShareSheet = false

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
                    logRow(entry)
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
        .sheet(isPresented: $showShareSheet) {
            if let url = shareURL {
                ShareSheet(url: url)
            }
        }
    }

    // MARK: - Log Row

    private func logRow(_ entry: LogEntry) -> some View {
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

            // Download / progress / share
            let progress = droneManager.logDownloadProgress[entry.id]
            let isDownloading = droneManager.logDownloadingID == entry.id

            if isDownloading, let p = progress {
                ProgressView(value: p)
                    .frame(width: 40)
                    .tint(.cyan)
            } else if let p = progress, p >= 1, droneManager.logFileURL(for: entry.id) != nil {
                // Downloaded — share button
                Button {
                    shareURL = droneManager.logFileURL(for: entry.id)
                    showShareSheet = true
                } label: {
                    Image(systemName: "square.and.arrow.up")
                        .foregroundStyle(.cyan)
                }
                .buttonStyle(.plain)
            } else {
                // Download button
                Button {
                    droneManager.downloadLog(entry: entry)
                } label: {
                    Image(systemName: "arrow.down.circle")
                        .foregroundStyle(.cyan)
                }
                .buttonStyle(.plain)
                .disabled(droneManager.logDownloadingID != nil)
            }
        }
    }

    private func formatBytes(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f KB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / (1024 * 1024))
    }
}

// MARK: - Share Sheet

struct ShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
