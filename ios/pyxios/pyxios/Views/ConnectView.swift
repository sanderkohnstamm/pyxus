//
//  ConnectView.swift
//  pyxios
//
//  Connection sheet supporting UDP (listen/connect) and TCP connections.
//

import SwiftUI
import Network

enum ConnectionType: String, CaseIterable {
    case udpListen = "UDP Listen"
    case udpConnect = "UDP Out"
    case tcpConnect = "TCP Out"

    var placeholder: String {
        switch self {
        case .udpListen: return "14550"
        case .udpConnect: return "192.168.1.100:14550"
        case .tcpConnect: return "192.168.1.100:5760"
        }
    }

    var hint: String {
        switch self {
        case .udpListen: return "Listen for incoming MAVLink on port"
        case .udpConnect: return "Connect to host:port via UDP"
        case .tcpConnect: return "Connect to host:port via TCP"
        }
    }

    var icon: String {
        switch self {
        case .udpListen: return "antenna.radiowaves.left.and.right"
        case .udpConnect: return "arrow.up.right.circle"
        case .tcpConnect: return "network"
        }
    }

    func buildAddress(from input: String) -> String {
        let trimmed = input.trimmingCharacters(in: .whitespaces)
        switch self {
        case .udpListen:
            let port = trimmed.isEmpty ? "14550" : trimmed
            return "udp://0.0.0.0:\(port)"
        case .udpConnect:
            if trimmed.hasPrefix("udp://") { return trimmed }
            return "udp://\(trimmed)"
        case .tcpConnect:
            if trimmed.hasPrefix("tcp://") { return trimmed }
            return "tcp://\(trimmed)"
        }
    }
}

struct ConnectSheet: View {
    let droneManager: DroneManager
    @Binding var isPresented: Bool
    @State private var connectionType: ConnectionType = .udpListen
    @State private var addressInput: String = "14550"

    private var isConnecting: Bool {
        if case .connecting = droneManager.state.connectionState { return true }
        return false
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Connection type picker
                    Picker("Type", selection: $connectionType) {
                        ForEach(ConnectionType.allCases, id: \.self) { type in
                            Text(type.rawValue).tag(type)
                        }
                    }
                    .pickerStyle(.segmented)

                    // Hint + own IP
                    VStack(spacing: 4) {
                        Text(connectionType.hint)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let ip = Self.wifiIPAddress() {
                            Text("This device: \(ip)")
                                .font(.system(.caption2, design: .monospaced))
                                .foregroundStyle(.tertiary)
                        }
                    }

                    // Address input
                    TextField(connectionType.placeholder, text: $addressInput)
                        .font(.system(.body, design: .monospaced))
                        .padding(12)
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .keyboardType(connectionType == .udpListen ? .numberPad : .URL)

                    // Connect button
                    Button {
                        let address = connectionType.buildAddress(from: addressInput)
                        droneManager.connect(address: address)
                    } label: {
                        Label("Connect", systemImage: "link")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.cyan)
                    .disabled(isConnecting || addressInput.isEmpty)

                    // Status feedback
                    if isConnecting {
                        HStack(spacing: 8) {
                            ProgressView()
                                .tint(.cyan)
                            Text("Connecting...")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if case .error(let msg) = droneManager.state.connectionState {
                        Text(msg)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }

                    if !droneManager.statusMessage.isEmpty && !isConnecting {
                        Text(droneManager.statusMessage)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    // Connection history
                    let history = AppSettings.shared.connectionHistory
                    if history.count > 1 {
                        Divider()
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Recent")
                                .font(.caption.bold())
                                .foregroundStyle(.secondary)
                            ForEach(history.prefix(5), id: \.self) { addr in
                                Button {
                                    applyHistoryAddress(addr)
                                } label: {
                                    HStack(spacing: 6) {
                                        Image(systemName: iconForAddress(addr))
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                        Text(addr)
                                            .font(.system(.caption, design: .monospaced))
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Connect")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        cancelConnection()
                    }
                }
            }
            .onChange(of: droneManager.state.connectionState) { _, newValue in
                if newValue.isConnected {
                    isPresented = false
                }
            }
            .onAppear {
                applyHistoryAddress(AppSettings.shared.lastConnectionAddress)
            }
        }
    }

    private func cancelConnection() {
        // If currently connecting, abort the attempt
        if isConnecting {
            droneManager.disconnect()
        }
        isPresented = false
    }

    private func applyHistoryAddress(_ addr: String) {
        if addr.hasPrefix("tcp://") {
            connectionType = .tcpConnect
            addressInput = String(addr.dropFirst(6))
        } else if addr.hasPrefix("udp://0.0.0.0:") {
            connectionType = .udpListen
            addressInput = String(addr.dropFirst("udp://0.0.0.0:".count))
        } else if addr.hasPrefix("udp://") {
            let hostPort = String(addr.dropFirst(6))
            if hostPort.hasPrefix(":") || hostPort.hasPrefix("0.0.0.0") {
                connectionType = .udpListen
                addressInput = hostPort.components(separatedBy: ":").last ?? "14550"
            } else {
                connectionType = .udpConnect
                addressInput = hostPort
            }
        } else {
            addressInput = addr
        }
    }

    private func iconForAddress(_ addr: String) -> String {
        if addr.hasPrefix("tcp://") { return "network" }
        if addr.contains("0.0.0.0") || addr.hasPrefix("udp://:") { return "antenna.radiowaves.left.and.right" }
        return "arrow.up.right.circle"
    }

    // MARK: - Get WiFi IP

    static func wifiIPAddress() -> String? {
        var address: String?
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return nil }
        defer { freeifaddrs(ifaddr) }

        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let iface = ptr.pointee
            let family = iface.ifa_addr.pointee.sa_family
            guard family == UInt8(AF_INET) else { continue }

            let name = String(cString: iface.ifa_name)
            // en0 is typically WiFi on iOS
            guard name == "en0" else { continue }

            var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(iface.ifa_addr, socklen_t(iface.ifa_addr.pointee.sa_len),
                           &hostname, socklen_t(hostname.count),
                           nil, 0, NI_NUMERICHOST) == 0 {
                address = String(cString: hostname)
            }
        }
        return address
    }
}
