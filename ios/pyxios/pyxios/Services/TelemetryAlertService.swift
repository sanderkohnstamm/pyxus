//
//  TelemetryAlertService.swift
//  pyxios
//
//  Monitors telemetry against param thresholds and fires alerts with haptics.
//

import Foundation

enum AlertLevel {
    case warning, critical
}

struct TelemetryAlert: Identifiable {
    let id = UUID()
    let level: AlertLevel
    let message: String
}

@Observable
final class TelemetryAlertService {

    var activeAlerts: [TelemetryAlert] = []

    // MARK: - Private

    private var batteryLowFired = false
    private var batteryCritFired = false
    private var altitudeFired = false

    /// Check telemetry against param thresholds. Call after each telemetry update.
    func check(state: VehicleState, params: [DroneParam]) {
        var alerts: [TelemetryAlert] = []

        let lowVolt = paramValue(named: "BATT_LOW_VOLT", in: params)
        let crtVolt = paramValue(named: "BATT_CRT_VOLT", in: params)
        let fenceAlt = paramValue(named: "FENCE_ALT_MAX", in: params)

        let voltage = state.batteryVoltage

        // Battery critical
        if let crt = crtVolt, crt > 0, voltage > 0 {
            if voltage <= crt && !batteryCritFired {
                batteryCritFired = true
                HapticManager.shared.trigger(style: "error")
                alerts.append(TelemetryAlert(level: .critical, message: String(format: "BATTERY CRITICAL %.1fV", voltage)))
            } else if voltage > crt + 0.5 {
                batteryCritFired = false
            }
        }

        // Battery low
        if let low = lowVolt, low > 0, voltage > 0 {
            if voltage <= low && !batteryLowFired && !batteryCritFired {
                batteryLowFired = true
                HapticManager.shared.trigger(style: "warning")
                alerts.append(TelemetryAlert(level: .warning, message: String(format: "Battery Low %.1fV", voltage)))
            } else if voltage > low + 0.5 {
                batteryLowFired = false
            }
        }

        // Altitude fence
        if let maxAlt = fenceAlt, maxAlt > 0 {
            let alt = state.altitudeRelative
            if alt >= maxAlt && !altitudeFired {
                altitudeFired = true
                HapticManager.shared.trigger(style: "warning")
                alerts.append(TelemetryAlert(level: .warning, message: String(format: "Alt %.0fm ≥ fence %.0fm", alt, maxAlt)))
            } else if alt < maxAlt - 5 {
                altitudeFired = false
            }
        }

        // Only update if changed to avoid unnecessary redraws
        if !alerts.isEmpty {
            activeAlerts = alerts
        } else if batteryCritFired || batteryLowFired || altitudeFired {
            // Keep existing alerts while condition persists
        } else {
            if !activeAlerts.isEmpty { activeAlerts = [] }
        }
    }

    func reset() {
        activeAlerts = []
        batteryLowFired = false
        batteryCritFired = false
        altitudeFired = false
    }

    // MARK: - Helpers

    private func paramValue(named name: String, in params: [DroneParam]) -> Float? {
        params.first(where: { $0.name == name })?.floatValue
    }
}
