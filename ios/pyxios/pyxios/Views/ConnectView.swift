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
                VStack(spacing: 20) {
                    // Header icon
                    Image(systemName: "antenna.radiowaves.left.and.right")
                        .font(.system(size: 36))
                        .foregroundStyle(.cyan.gradient)
                        .padding(.top, 8)

                    // Connection type cards
                    HStack(spacing: 10) {
                        ForEach(ConnectionType.allCases, id: \.self) { type in
                            Button {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    connectionType = type
                                    addressInput = ""
                                }
                            } label: {
                                VStack(spacing: 6) {
                                    Image(systemName: type.icon)
                                        .font(.title3)
                                    Text(type.rawValue)
                                        .font(.system(size: 11, weight: .medium))
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(connectionType == type
                                    ? AnyShapeStyle(.cyan.opacity(0.15))
                                    : AnyShapeStyle(Color(.systemGray6)))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .strokeBorder(connectionType == type ? .cyan.opacity(0.5) : .clear, lineWidth: 1.5)
                                )
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                            .foregroundStyle(connectionType == type ? .cyan : .secondary)
                        }
                    }

                    // Info row
                    VStack(spacing: 4) {
                        Text(connectionType.hint)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let ip = Self.wifiIPAddress() {
                            HStack(spacing: 4) {
                                Image(systemName: "wifi")
                                    .font(.system(size: 9))
                                Text(ip)
                                    .font(.system(.caption2, design: .monospaced))
                            }
                            .foregroundStyle(.tertiary)
                        }
                    }

                    // Address input
                    HStack(spacing: 10) {
                        Image(systemName: connectionType.icon)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(width: 20)

                        TextField(connectionType.placeholder, text: $addressInput)
                            .font(.system(.body, design: .monospaced))
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                            .keyboardType(connectionType == .udpListen ? .numberPad : .URL)
                    }
                    .padding(12)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                    // Connect button
                    Button {
                        let address = connectionType.buildAddress(from: addressInput)
                        droneManager.connect(address: address)
                    } label: {
                        HStack(spacing: 8) {
                            if isConnecting {
                                ProgressView()
                                    .tint(.white)
                                    .controlSize(.small)
                                Text("Connecting...")
                            } else {
                                Image(systemName: "link")
                                Text("Connect")
                            }
                        }
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(isConnecting || addressInput.isEmpty
                                    ? AnyShapeStyle(Color.gray.opacity(0.3))
                                    : AnyShapeStyle(Color.cyan.gradient))
                        )
                    }
                    .disabled(isConnecting || addressInput.isEmpty)

                    // Error / status
                    if case .error(let msg) = droneManager.state.connectionState {
                        HStack(spacing: 6) {
                            Image(systemName: "exclamationmark.circle.fill")
                                .font(.caption)
                            Text(msg)
                                .font(.caption)
                        }
                        .foregroundStyle(.red)
                    }

                    if !droneManager.statusMessage.isEmpty && !isConnecting {
                        Text(droneManager.statusMessage)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    // Connection history
                    let history = AppSettings.shared.connectionHistory
                    if !history.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("Recent Connections")
                                    .font(.caption.bold())
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }

                            ForEach(history.prefix(5), id: \.self) { addr in
                                Button {
                                    applyHistoryAddress(addr)
                                } label: {
                                    HStack(spacing: 8) {
                                        Image(systemName: iconForAddress(addr))
                                            .font(.caption2)
                                            .foregroundStyle(.cyan.opacity(0.7))
                                            .frame(width: 16)
                                        Text(addr)
                                            .font(.system(.caption, design: .monospaced))
                                            .foregroundStyle(.primary)
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .font(.system(size: 9))
                                            .foregroundStyle(.tertiary)
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 10)
                                    .background(Color(.systemGray6))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                }
                            }
                        }
                        .padding(.top, 4)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
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
