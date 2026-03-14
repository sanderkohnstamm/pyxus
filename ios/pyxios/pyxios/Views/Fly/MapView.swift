//
//  MapView.swift
//  pyxios
//
//  MapKit view showing drone position, heading, home marker, and flight trail.
//

import SwiftUI
import MapKit

struct DroneMapView: View {
    let droneManager: DroneManager
    @State private var cameraPosition: MapCameraPosition = .automatic
    @State private var hasInitiallyFramed = false
    @State private var trail: [CLLocationCoordinate2D] = []
    @State private var lastTrailUpdate = Date.distantPast

    private var state: VehicleState { droneManager.state }

    var body: some View {
        Map(position: $cameraPosition) {
            // Drone marker
            if state.hasValidPosition {
                Annotation("Drone", coordinate: state.coordinate) {
                    droneMarker
                }

                // Flight trail
                if trail.count >= 2 {
                    MapPolyline(coordinates: trail)
                        .stroke(.cyan.opacity(0.5), lineWidth: 2)
                }
            }

            // Home marker
            if let home = state.homeCoordinate {
                Annotation("Home", coordinate: home) {
                    Image(systemName: "house.fill")
                        .font(.caption)
                        .foregroundStyle(.white)
                        .padding(4)
                        .background(.green)
                        .clipShape(Circle())
                }
            }
        }
        .mapStyle(.imagery(elevation: .flat))
        .mapControls { }
        .onChange(of: state.coordinate.latitude + state.coordinate.longitude) { _, _ in
            updateTrail()
            frameOnDroneIfNeeded()
        }
    }

    private var droneMarker: some View {
        Image(systemName: droneIcon)
            .font(.title2)
            .foregroundStyle(.cyan)
            .rotationEffect(.degrees(Double(state.heading)))
            .shadow(color: .black, radius: 2)
    }

    private var droneIcon: String {
        switch state.vehicleType {
        case .copter: return "arrow.up.circle.fill"
        case .plane: return "airplane"
        case .rover: return "car.fill"
        }
    }

    private func frameOnDroneIfNeeded() {
        guard state.hasValidPosition, !hasInitiallyFramed else { return }
        hasInitiallyFramed = true
        cameraPosition = .camera(MapCamera(
            centerCoordinate: state.coordinate,
            distance: 500,
            heading: 0,
            pitch: 0
        ))
    }

    private func updateTrail() {
        guard state.hasValidPosition else { return }
        // Throttle trail updates to every 0.5s
        let now = Date()
        guard now.timeIntervalSince(lastTrailUpdate) > 0.5 else { return }
        lastTrailUpdate = now
        trail.append(state.coordinate)
        // Keep last 500 points
        if trail.count > 500 {
            trail.removeFirst(trail.count - 500)
        }
    }
}
