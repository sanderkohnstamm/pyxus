//
//  MapView.swift
//  pyxios
//
//  MapKit view showing drone position, heading, home marker, flight trail,
//  and optional mission waypoint overlay.
//

import SwiftUI
import MapKit

struct DroneMapView: View {
    let droneManager: DroneManager
    @Binding var followMode: Bool
    let missionWaypoints: [Waypoint]
    var activeMissionSeq: Int = -1
    var onMapTap: ((CLLocationCoordinate2D) -> Void)?
    var onWaypointTap: ((Int) -> Void)?

    @State private var cameraPosition: MapCameraPosition = .automatic
    @State private var hasInitiallyFramed = false
    @State private var trail: [CLLocationCoordinate2D] = []
    @State private var lastTrailUpdate = Date.distantPast
    @State private var isProgrammaticMove = false
    @State private var viewSize: CGSize = .zero
    @State private var droneScreenPoint: CGPoint?
    @State private var droneOffScreen = false
    @State private var offScreenAngle: Angle = .zero

    private let settings = AppSettings.shared
    private var state: VehicleState { droneManager.state }

    private var mapStyle: MapStyle {
        switch settings.mapType {
        case .satellite: return .imagery(elevation: .flat)
        case .standard: return .standard(elevation: .flat)
        case .hybrid: return .hybrid(elevation: .flat)
        }
    }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                MapReader { proxy in
                    Map(position: $cameraPosition) {
                        // Flight trail
                        if state.hasValidPosition && settings.showTrail && trail.count >= 2 {
                            MapPolyline(coordinates: trail)
                                .stroke(.cyan.opacity(0.5), lineWidth: 2)
                        }

                        // Home marker (below drone)
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

                        // Drone marker (on top)
                        if state.hasValidPosition {
                            Annotation("", coordinate: state.coordinate) {
                                droneMarker
                            }
                            .annotationTitles(.hidden)
                        }

                        // Mission waypoints overlay
                        if !missionWaypoints.isEmpty {
                            MapPolyline(coordinates: missionWaypoints.map(\.coordinate))
                                .stroke(.orange.opacity(0.8), lineWidth: 2)

                            ForEach(Array(missionWaypoints.enumerated()), id: \.element.id) { idx, wp in
                                let isActive = (idx + 1) == activeMissionSeq  // mission seq is 1-based (seq 0 = home)
                                Annotation("", coordinate: wp.coordinate) {
                                    ZStack {
                                        if isActive {
                                            Circle()
                                                .stroke(.cyan, lineWidth: 2)
                                                .frame(width: 34, height: 34)
                                        }
                                        Circle()
                                            .fill(isActive ? Color.cyan : wp.action.markerColor)
                                            .frame(width: 24, height: 24)
                                        Text("\(idx + 1)")
                                            .font(.system(size: 10, weight: .bold))
                                            .foregroundStyle(.white)
                                    }
                                    .onTapGesture {
                                        onWaypointTap?(idx)
                                    }
                                }
                            }
                        }
                    }
                    .mapStyle(mapStyle)
                    .mapControls { }
                    .cachedTileOverlay()
                    .onTapGesture { screenPoint in
                        if let coordinate = proxy.convert(screenPoint, from: .local) {
                            onMapTap?(coordinate)
                        }
                    }
                    .onMapCameraChange(frequency: .continuous) { context in
                        // Manual pan disables follow mode (but not programmatic camera updates)
                        if followMode && hasInitiallyFramed && !isProgrammaticMove {
                            followMode = false
                        }
                        isProgrammaticMove = false

                        // Update edge-sticking
                        if state.hasValidPosition {
                            if let pt = proxy.convert(state.coordinate, to: .local) {
                                updateEdgeIndicator(screenPoint: pt, viewSize: geo.size)
                            } else {
                                droneOffScreen = true
                            }
                        }
                    }
                    .onChange(of: state.coordinate.latitude + state.coordinate.longitude) { _, _ in
                        updateTrail()
                        if followMode {
                            updateFollowCamera()
                        } else {
                            frameOnDroneIfNeeded()
                        }
                    }
                }

                // Edge-sticking chevron indicator
                if droneOffScreen && !followMode && state.hasValidPosition {
                    edgeChevron
                }
            }
            .onAppear { viewSize = geo.size }
            .onChange(of: geo.size) { _, newSize in viewSize = newSize }
        }
    }

    // MARK: - Edge Chevron

    private var edgeChevron: some View {
        let margin: CGFloat = 40
        let clampedX = min(max(droneScreenPoint?.x ?? viewSize.width / 2, margin), viewSize.width - margin)
        let clampedY = min(max(droneScreenPoint?.y ?? viewSize.height / 2, margin), viewSize.height - margin)

        return Image(systemName: "arrowtriangle.up.fill")
            .font(.title3)
            .foregroundStyle(.cyan)
            .rotationEffect(offScreenAngle)
            .shadow(color: .black, radius: 3)
            .position(x: clampedX, y: clampedY)
    }

    private func updateEdgeIndicator(screenPoint: CGPoint, viewSize: CGSize) {
        droneScreenPoint = screenPoint
        let inset: CGFloat = 20
        let isInside = screenPoint.x >= inset && screenPoint.x <= viewSize.width - inset
            && screenPoint.y >= inset && screenPoint.y <= viewSize.height - inset

        if isInside {
            droneOffScreen = false
        } else {
            droneOffScreen = true
            let centerX = viewSize.width / 2
            let centerY = viewSize.height / 2
            let dx = screenPoint.x - centerX
            let dy = screenPoint.y - centerY
            offScreenAngle = Angle(radians: atan2(Double(dy), Double(dx)) - .pi / 2)
        }
    }

    // MARK: - Drone Marker

    private var droneMarker: some View {
        Triangle()
            .fill(.cyan)
            .frame(width: 14, height: 18)
            .rotationEffect(.degrees(Double(state.heading)))
            .shadow(color: .black.opacity(0.6), radius: 3)
            .shadow(color: .cyan.opacity(0.4), radius: 6)
    }

    private func frameOnDroneIfNeeded() {
        guard state.hasValidPosition, !hasInitiallyFramed else { return }
        hasInitiallyFramed = true
        isProgrammaticMove = true
        cameraPosition = .camera(MapCamera(
            centerCoordinate: state.coordinate,
            distance: 500,
            heading: 0,
            pitch: 0
        ))
    }

    private func updateFollowCamera() {
        guard state.hasValidPosition else { return }
        if !hasInitiallyFramed { hasInitiallyFramed = true }
        isProgrammaticMove = true
        cameraPosition = .camera(MapCamera(
            centerCoordinate: state.coordinate,
            distance: 500,
            heading: 0,
            pitch: 0
        ))
    }

    private func updateTrail() {
        guard state.hasValidPosition else { return }
        let now = Date()
        guard now.timeIntervalSince(lastTrailUpdate) > 0.5 else { return }
        lastTrailUpdate = now
        trail.append(state.coordinate)
        if trail.count > 500 {
            trail.removeFirst(trail.count - 500)
        }
    }
}

// MARK: - Triangle Shape

struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}
