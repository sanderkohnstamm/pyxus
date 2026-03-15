//
//  FollowMeService.swift
//  pyxios
//
//  Continuously sends FOLLOW_TARGET MAVLink messages using device GPS.
//  Supports PX4 (Follow Me mode) and ArduPilot (FOLLOW mode).
//

import Foundation
import CoreLocation

@Observable
final class FollowMeService: NSObject, CLLocationManagerDelegate {

    private(set) var isActive = false
    private(set) var deviceLocation: CLLocation?

    private var locationManager: CLLocationManager?
    private var timer: Timer?
    private weak var drone: MAVLinkDrone?

    override init() {
        super.init()
        setupLocationManager()
    }

    // MARK: - Public

    func update(drone: MAVLinkDrone?) {
        self.drone = drone
    }

    func start() {
        guard !isActive, let drone else { return }

        // Switch flight mode
        if drone.isArdupilot {
            drone.setMode("FOLLOW")
        } else {
            drone.setMode("AUTO_FOLLOW")
        }

        isActive = true

        // Start sending FOLLOW_TARGET at 2 Hz
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.sendUpdate()
        }
    }

    func stop() {
        guard isActive else { return }
        timer?.invalidate()
        timer = nil
        isActive = false

        // Switch to hold/loiter
        if let drone {
            if drone.isArdupilot {
                drone.setMode("LOITER")
            } else {
                drone.setMode("AUTO_LOITER")
            }
        }
    }

    func reset() {
        stop()
        deviceLocation = nil
    }

    // MARK: - Private

    private func setupLocationManager() {
        let mgr = CLLocationManager()
        mgr.delegate = self
        mgr.desiredAccuracy = kCLLocationAccuracyBest
        mgr.distanceFilter = 1  // update every meter
        mgr.requestWhenInUseAuthorization()
        mgr.startUpdatingLocation()
        locationManager = mgr
    }

    private func sendUpdate() {
        guard let drone, let loc = deviceLocation else { return }

        let settings = AppSettings.shared
        let alt = Float(loc.altitude) + settings.followMeHeight

        drone.sendFollowTarget(
            lat: loc.coordinate.latitude,
            lon: loc.coordinate.longitude,
            alt: alt
        )
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        deviceLocation = loc
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
        default:
            break
        }
    }
}
