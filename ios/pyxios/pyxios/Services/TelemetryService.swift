//
//  TelemetryService.swift
//  pyxios
//
//  Processes telemetry snapshots into VehicleState and tracks stream rates.
//

import Foundation
import CoreLocation

@Observable
final class TelemetryService {

    // MARK: - Published State

    var telemetryStreams: [TelemetryStream] = []
    var latestPayloads: [String: Data] = [:]

    // MARK: - Private

    private var streamBuffer: [String: TelemetryStream] = [:]
    private var streamFlushTimer: Timer?

    /// Reset all state (called on disconnect).
    func reset() {
        streamFlushTimer?.invalidate()
        streamFlushTimer = nil
        streamBuffer = [:]
        telemetryStreams = []
        latestPayloads = [:]
    }

    // MARK: - Stream Flush Timer

    func startStreamFlush() {
        streamFlushTimer?.invalidate()
        streamFlushTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.flushStreams()
        }
    }

    private func flushStreams() {
        telemetryStreams = streamBuffer.values.sorted { $0.name < $1.name }
    }

    // MARK: - Telemetry Processing

    /// Update VehicleState and stream rates from a telemetry snapshot.
    /// Returns status message if link is lost, nil otherwise.
    func updateTelemetry(from t: TelemetrySnapshot, state: inout VehicleState) -> String? {
        state.coordinate = CLLocationCoordinate2D(latitude: t.lat, longitude: t.lon)
        state.altitudeRelative = t.altRelative
        state.altitudeAMSL = t.altMSL
        state.heading = Float(t.heading)
        state.pitch = t.pitch * 180 / .pi
        state.roll = t.roll * 180 / .pi
        state.groundSpeed = t.groundSpeed
        state.verticalSpeed = t.climbRate
        state.batteryVoltage = t.batteryVoltage
        state.batteryCurrent = t.batteryCurrent
        state.batteryPercent = t.batteryRemaining >= 0 ? Float(t.batteryRemaining) : -1
        state.satellites = Int(t.satellites)
        state.gpsFixType = Int(t.gpsFixType)
        state.armed = t.armed
        state.flightMode = t.mode
        // MAV_STATE: 3=STANDBY (ground), 4=ACTIVE (flying), 5=CRITICAL, 6=EMERGENCY
        // Landed = on ground (standby or just armed but not yet in air)
        state.landed = t.systemStatus <= 3 || (!t.armed)
        state.missionSeq = Int(t.missionSeq)

        if t.homeLat != 0 || t.homeLon != 0 {
            state.homeCoordinate = CLLocationCoordinate2D(latitude: t.homeLat, longitude: t.homeLon)
        }

        // Distance to home
        if let home = state.homeCoordinate, state.hasValidPosition {
            let homeLoc = CLLocation(latitude: home.latitude, longitude: home.longitude)
            let droneLoc = CLLocation(latitude: t.lat, longitude: t.lon)
            state.distanceToHome = Float(droneLoc.distance(from: homeLoc))
        }

        // Autopilot type
        state.isArdupilot = t.isArdupilot

        // Vehicle type
        state.mavType = t.mavType
        switch t.mavType {
        case 1: state.vehicleType = .plane
        case 10, 11: state.vehicleType = .rover
        default: state.vehicleType = .copter
        }

        // Update stream rates
        for (name, info) in t.messageRates {
            let elapsed = Date().timeIntervalSince(info.firstSeen)
            let hz = elapsed > 1 ? Double(info.count) / elapsed : 0
            updateStreamRate(name: name, value: "\(hz > 0 ? String(format: "%.1f Hz", hz) : "—")")
        }

        // Store latest payloads for inspector
        latestPayloads = t.lastPayloads

        // Link status
        if t.linkLost {
            if state.linkLostSince == nil {
                state.linkLostSince = Date()
            }
            state.connectionState = .error("Link lost")
            return "Link lost"
        } else {
            state.linkLostSince = nil
        }

        return nil
    }

    private func updateStreamRate(name: String, value: String) {
        let now = Date()
        if var existing = streamBuffer[name] {
            existing.updateCount += 1
            existing.lastValue = value
            existing.lastUpdate = now
            let elapsed = now.timeIntervalSince(existing.firstUpdate)
            if elapsed > 1 {
                existing.hz = Double(existing.updateCount) / elapsed
            }
            streamBuffer[name] = existing
        } else {
            var stream = TelemetryStream(id: name, name: name)
            stream.lastValue = value
            stream.lastUpdate = now
            stream.firstUpdate = now
            stream.updateCount = 1
            streamBuffer[name] = stream
            flushStreams()
        }
    }
}
