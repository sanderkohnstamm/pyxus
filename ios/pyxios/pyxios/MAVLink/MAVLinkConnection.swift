//
//  MAVLinkConnection.swift
//  pyxios
//
//  UDP socket for MAVLink v2 communication using Network.framework.
//  Supports both connecting to a remote endpoint and listening for incoming data.
//

import Foundation
import Network

/// Callback type for received MAVLink frames.
typealias MAVLinkFrameHandler = (MAVLinkFrame) -> Void

/// UDP-based MAVLink connection using NWConnection.
final class MAVLinkConnection: @unchecked Sendable {

    // MARK: - State

    enum State: Sendable {
        case idle
        case connecting
        case ready
        case failed(String)
    }

    private(set) var state: State = .idle
    private var connection: NWConnection?
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "mavlink.connection", qos: .userInitiated)
    private var parser = MAVLinkParser()
    private var frameBuilder = MAVLinkFrameBuilder()
    private var frameHandler: MAVLinkFrameHandler?
    private var stateHandler: ((State) -> Void)?

    // GCS heartbeat timer (1 Hz, required by ArduPilot)
    private var heartbeatTimer: DispatchSourceTimer?

    // MARK: - Connect

    /// Connect to a remote MAVLink endpoint (e.g. SITL on host:port).
    func connect(host: String, port: UInt16, onFrame: @escaping MAVLinkFrameHandler, onState: ((State) -> Void)? = nil) {
        disconnect()

        frameHandler = onFrame
        stateHandler = onState
        state = .connecting
        stateHandler?(state)

        let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port)!)
        let params = NWParameters.udp
        params.allowLocalEndpointReuse = true

        let conn = NWConnection(to: endpoint, using: params)
        connection = conn

        conn.stateUpdateHandler = { [weak self] nwState in
            guard let self else { return }
            switch nwState {
            case .ready:
                self.state = .ready
                self.stateHandler?(self.state)
                self.startReceiveLoop(conn)
                self.startHeartbeat()
            case .failed(let err):
                self.state = .failed(err.localizedDescription)
                self.stateHandler?(self.state)
            case .cancelled:
                self.state = .idle
                self.stateHandler?(self.state)
            default:
                break
            }
        }

        conn.start(queue: queue)
    }

    /// Listen on a UDP port for incoming MAVLink data (e.g. from a companion computer).
    func listen(port: UInt16, onFrame: @escaping MAVLinkFrameHandler, onState: ((State) -> Void)? = nil) {
        disconnect()

        frameHandler = onFrame
        stateHandler = onState
        state = .connecting
        stateHandler?(state)

        let params = NWParameters.udp
        params.allowLocalEndpointReuse = true

        do {
            let l = try NWListener(using: params, on: NWEndpoint.Port(rawValue: port)!)
            listener = l

            l.newConnectionHandler = { [weak self] newConn in
                guard let self else { return }
                // Accept first connection, replace any existing
                self.connection?.cancel()
                self.connection = newConn
                newConn.stateUpdateHandler = { [weak self] nwState in
                    if case .ready = nwState {
                        self?.state = .ready
                        self?.stateHandler?(self!.state)
                        self?.startReceiveLoop(newConn)
                        self?.startHeartbeat()
                    }
                }
                newConn.start(queue: self.queue)
            }

            l.stateUpdateHandler = { [weak self] listenerState in
                if case .failed(let err) = listenerState {
                    self?.state = .failed(err.localizedDescription)
                    self?.stateHandler?(self!.state)
                }
            }

            l.start(queue: queue)
        } catch {
            state = .failed(error.localizedDescription)
            stateHandler?(state)
        }
    }

    // MARK: - Disconnect

    func disconnect() {
        heartbeatTimer?.cancel()
        heartbeatTimer = nil
        connection?.cancel()
        connection = nil
        listener?.cancel()
        listener = nil
        parser.reset()
        state = .idle
    }

    // MARK: - Send

    /// Send raw data over the connection.
    func send(_ data: Data) {
        connection?.send(content: data, completion: .contentProcessed { _ in })
    }

    /// Build and send a MAVLink frame for a message.
    func sendMessage(id: UInt32, payload: [UInt8]) {
        let frame = frameBuilder.build(messageID: id, payload: payload)
        send(frame)
    }

    // MARK: - Receive Loop

    private func startReceiveLoop(_ conn: NWConnection) {
        conn.receiveMessage { [weak self] data, _, _, error in
            guard let self else { return }
            if let data, !data.isEmpty {
                let frames = self.parser.parse(data)
                for frame in frames {
                    self.frameHandler?(frame)
                }
            }
            // Continue receiving unless cancelled
            if conn.state == .ready {
                self.startReceiveLoop(conn)
            }
        }
    }

    // MARK: - GCS Heartbeat

    /// ArduPilot requires a GCS heartbeat at ≥1 Hz to stay in connected state.
    private func startHeartbeat() {
        heartbeatTimer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: 1.0)
        timer.setEventHandler { [weak self] in
            self?.sendGCSHeartbeat()
        }
        timer.resume()
        heartbeatTimer = timer
    }

    private func sendGCSHeartbeat() {
        var hb = MsgHeartbeat()
        hb.type = 6        // MAV_TYPE_GCS
        hb.autopilot = 8   // MAV_AUTOPILOT_INVALID
        hb.base_mode = 0
        hb.custom_mode = 0
        hb.system_status = 0
        hb.mavlink_version = 3
        sendMessage(id: MsgHeartbeat.id, payload: hb.encode())
    }
}
