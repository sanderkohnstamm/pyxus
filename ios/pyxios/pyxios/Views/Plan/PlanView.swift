//
//  PlanView.swift
//  pyxios
//
//  Mission planning: toggle add-mode to place waypoints, free map pan otherwise.
//  Shows drone position, geofence planning, and mission download.
//

import SwiftUI
import MapKit

enum GeofenceType: String, CaseIterable {
    case circle = "Circle"
    case polygon = "Polygon"
}

struct PlanView: View {
    let droneManager: DroneManager
    @State private var flightPlan = FlightPlan()
    @State private var selectedWaypointID: UUID?
    @State private var showWaypointList = false
    @State private var showSaveSheet = false
    @State private var showLoadSheet = false
    @State private var isAddMode = true  // starts in add mode
    @State private var mapCameraPosition: MapCameraPosition = .automatic
    @State private var isGeofenceMode = false
    @State private var geofenceCenter: CLLocationCoordinate2D?
    @State private var geofenceRadius: Double = 200
    @State private var geofenceType: GeofenceType = .circle
    @State private var polygonVertices: [CLLocationCoordinate2D] = []

    var body: some View {
        NavigationStack {
            ZStack {
                mapContent

                // Placeholder
                if flightPlan.waypoints.isEmpty && isAddMode && !isGeofenceMode {
                    VStack {
                        Spacer()
                        Text("Tap map to add waypoints")
                            .font(.callout)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(.black.opacity(0.6))
                            .clipShape(Capsule())
                            .padding(.bottom, 80)
                    }
                    .allowsHitTesting(false)
                }

                if isGeofenceMode && geofenceType == .circle && geofenceCenter == nil {
                    VStack {
                        Spacer()
                        Text("Tap map to set geofence center")
                            .font(.callout)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(.red.opacity(0.6))
                            .clipShape(Capsule())
                            .padding(.bottom, 80)
                    }
                    .allowsHitTesting(false)
                }

                if isGeofenceMode && geofenceType == .polygon && polygonVertices.isEmpty {
                    VStack {
                        Spacer()
                        Text("Tap map to add polygon vertices")
                            .font(.callout)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(.red.opacity(0.6))
                            .clipShape(Capsule())
                            .padding(.bottom, 80)
                    }
                    .allowsHitTesting(false)
                }

                // Bottom toolbar
                VStack {
                    Spacer()
                    VStack(spacing: 8) {
                        // Geofence radius slider (circle mode)
                        if geofenceCenter != nil && geofenceType == .circle {
                            HStack(spacing: 8) {
                                Text("\(Int(geofenceRadius))m")
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(.white)
                                    .frame(width: 50)
                                Slider(value: $geofenceRadius, in: 50...2000, step: 10)
                                    .tint(.red)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .background(.ultraThinMaterial)
                            .clipShape(Capsule())
                        }

                        // Geofence type picker + polygon controls
                        if isGeofenceMode {
                            HStack(spacing: 12) {
                                Picker("Type", selection: $geofenceType) {
                                    ForEach(GeofenceType.allCases, id: \.self) { type in
                                        Text(type.rawValue).tag(type)
                                    }
                                }
                                .pickerStyle(.segmented)
                                .frame(width: 180)

                                if geofenceType == .polygon && polygonVertices.count >= 3 {
                                    Button {
                                        // Polygon is auto-closed in rendering
                                    } label: {
                                        Text("\(polygonVertices.count) pts")
                                            .font(.system(.caption, design: .monospaced))
                                            .foregroundStyle(.white)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 6)
                                            .background(.red.opacity(0.5))
                                            .clipShape(Capsule())
                                    }
                                }

                                if geofenceType == .polygon && !polygonVertices.isEmpty {
                                    Button {
                                        polygonVertices.removeLast()
                                    } label: {
                                        Image(systemName: "arrow.uturn.backward")
                                            .foregroundStyle(.white)
                                            .padding(6)
                                            .background(.ultraThinMaterial)
                                            .clipShape(Circle())
                                    }
                                }

                                Spacer()
                            }
                            .padding(.horizontal, 16)
                        }

                        bottomBar
                    }
                }

                // Inline waypoint editor
                if let selectedID = selectedWaypointID,
                   let idx = flightPlan.waypoints.firstIndex(where: { $0.id == selectedID }) {
                    VStack {
                        Spacer()
                        WaypointEditor(waypoint: $flightPlan.waypoints[idx], index: idx) {
                            flightPlan.removeWaypoint(at: idx)
                            selectedWaypointID = nil
                        } onDismiss: {
                            selectedWaypointID = nil
                        }
                        .padding()
                        .background(.ultraThinMaterial)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .padding(.horizontal)
                        .padding(.bottom, 60)
                    }
                }
            }
            .navigationTitle("Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button("Save Mission", systemImage: "square.and.arrow.down") {
                            showSaveSheet = true
                        }
                        Button("Load Mission", systemImage: "folder") {
                            showLoadSheet = true
                        }
                        Divider()
                        if droneManager.state.connectionState.isConnected {
                            Button("Upload to Drone", systemImage: "arrow.up.doc") {
                                droneManager.uploadMission(waypoints: flightPlan.waypoints) { _ in }
                            }
                            .disabled(flightPlan.waypoints.isEmpty)

                            Button("Download from Drone", systemImage: "arrow.down.doc") {
                                droneManager.downloadMission { waypoints in
                                    if let waypoints {
                                        flightPlan.waypoints = waypoints
                                    }
                                }
                            }
                        }
                        Divider()
                        Button("Clear All", systemImage: "trash", role: .destructive) {
                            selectedWaypointID = nil
                            flightPlan.clear()
                            geofenceCenter = nil
                            polygonVertices = []
                        }
                        .disabled(flightPlan.waypoints.isEmpty && geofenceCenter == nil && polygonVertices.isEmpty)
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .sheet(isPresented: $showWaypointList) {
                WaypointListView(flightPlan: flightPlan, selectedWaypointID: $selectedWaypointID)
                    .presentationDetents([.medium, .large])
            }
            .sheet(isPresented: $showSaveSheet) {
                SaveMissionSheet(flightPlan: flightPlan, geofenceCenter: geofenceCenter, geofenceRadius: geofenceRadius, polygonVertices: polygonVertices)
                    .presentationDetents([.height(200)])
            }
            .sheet(isPresented: $showLoadSheet) {
                LoadMissionSheet(flightPlan: flightPlan, onLoadGeofence: { mission in
                    if let geo = mission.geofence {
                        geofenceCenter = CLLocationCoordinate2D(latitude: geo.latitude, longitude: geo.longitude)
                        geofenceRadius = geo.radius
                        geofenceType = .circle
                    }
                    if let poly = mission.polygonGeofence, !poly.vertices.isEmpty {
                        polygonVertices = poly.vertices.map { CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude) }
                        geofenceType = .polygon
                    }
                })
                    .presentationDetents([.medium])
            }
            .onAppear {
                let coord = droneManager.state.coordinate
                if droneManager.state.hasValidPosition {
                    mapCameraPosition = .camera(MapCamera(
                        centerCoordinate: coord,
                        distance: 500,
                        heading: 0,
                        pitch: 0
                    ))
                }
            }
        }
    }

    // MARK: - Map

    private var mapContent: some View {
        MapReader { proxy in
            Map(position: $mapCameraPosition) {
                ForEach(Array(flightPlan.waypoints.enumerated()), id: \.element.id) { idx, wp in
                    Annotation("", coordinate: wp.coordinate) {
                        waypointMarker(wp: wp, index: idx)
                    }
                }

                if flightPlan.waypoints.count >= 2 {
                    MapPolyline(coordinates: flightPlan.waypoints.map(\.coordinate))
                        .stroke(.orange.opacity(0.7), lineWidth: 2)
                }

                // Drone position marker
                if droneManager.state.hasValidPosition {
                    Annotation("Drone", coordinate: droneManager.state.coordinate) {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title3)
                            .foregroundStyle(.cyan)
                            .rotationEffect(.degrees(Double(droneManager.state.heading)))
                            .shadow(color: .black, radius: 2)
                    }
                }

                // Circle geofence
                if let center = geofenceCenter, geofenceType == .circle {
                    MapCircle(center: center, radius: geofenceRadius)
                        .stroke(.red, lineWidth: 2)
                        .foregroundStyle(.red.opacity(0.1))
                }

                // Polygon geofence
                if geofenceType == .polygon && polygonVertices.count >= 3 {
                    let closed = polygonVertices + [polygonVertices[0]]
                    MapPolyline(coordinates: closed)
                        .stroke(.red, lineWidth: 2)
                    MapPolygon(coordinates: polygonVertices)
                        .foregroundStyle(.red.opacity(0.1))
                }

                // Polygon vertices
                if geofenceType == .polygon {
                    ForEach(Array(polygonVertices.enumerated()), id: \.offset) { idx, vertex in
                        Annotation("", coordinate: vertex) {
                            Circle()
                                .fill(.red)
                                .frame(width: 12, height: 12)
                                .overlay(
                                    Text("\(idx + 1)")
                                        .font(.system(size: 7, weight: .bold))
                                        .foregroundStyle(.white)
                                )
                        }
                    }
                }
            }
            .mapStyle(.imagery(elevation: .flat))
            .mapControls { }
            .cachedTileOverlay()
            .onTapGesture { screenPoint in
                if let coordinate = proxy.convert(screenPoint, from: .local) {
                    if isGeofenceMode {
                        if geofenceType == .circle {
                            geofenceCenter = coordinate
                        } else {
                            polygonVertices.append(coordinate)
                        }
                    } else if isAddMode {
                        flightPlan.addWaypoint(at: coordinate)
                        selectedWaypointID = flightPlan.waypoints.last?.id
                    }
                }
            }
        }
    }

    private func waypointMarker(wp: Waypoint, index: Int) -> some View {
        ZStack {
            Circle()
                .fill(wp.id == selectedWaypointID ? Color.white : wp.action.markerColor)
                .frame(width: 32, height: 32)
            if wp.action == .waypoint || wp.action == .loiter || wp.action == .loiterTurns {
                Text("\(index + 1)")
                    .font(.caption2.bold())
                    .foregroundStyle(wp.id == selectedWaypointID ? .black : .white)
            } else {
                Image(systemName: wp.action.icon)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(wp.id == selectedWaypointID ? .black : .white)
            }
        }
        .onTapGesture {
            selectedWaypointID = (selectedWaypointID == wp.id) ? nil : wp.id
        }
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        HStack(spacing: 12) {
            // Add mode toggle
            Button {
                isAddMode.toggle()
                if isAddMode {
                    isGeofenceMode = false
                    selectedWaypointID = nil
                }
            } label: {
                HStack(spacing: 5) {
                    Image(systemName: isAddMode ? "plus.circle.fill" : "plus.circle")
                        .font(.body)
                    if isAddMode {
                        Text("Adding")
                            .font(.caption.bold())
                    }
                }
                .foregroundStyle(isAddMode ? .white : .white.opacity(0.7))
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(isAddMode ? Color.orange : Color.clear)
                .background(.ultraThinMaterial)
                .clipShape(Capsule())
            }

            // Geofence toggle
            Button {
                isGeofenceMode.toggle()
                if isGeofenceMode {
                    isAddMode = false
                }
            } label: {
                Image(systemName: isGeofenceMode ? "circle.circle.fill" : "circle.circle")
                    .font(.body)
                    .foregroundStyle(isGeofenceMode ? .red : .white.opacity(0.7))
                    .padding(10)
                    .background(isGeofenceMode ? Color.red.opacity(0.2) : Color.clear)
                    .background(.ultraThinMaterial)
                    .clipShape(Circle())
            }

            // Waypoint list
            if !flightPlan.waypoints.isEmpty {
                Button {
                    showWaypointList = true
                } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "list.number")
                        Text("\(flightPlan.waypoints.count)")
                            .font(.system(.caption, design: .monospaced))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
                }
            }

            Spacer()

            // Total distance
            let dist = totalDistance()
            if dist > 0 {
                Text(String(format: "%.0fm", dist))
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.7))
            }

            // Undo last waypoint
            if !flightPlan.waypoints.isEmpty {
                Button {
                    if selectedWaypointID == flightPlan.waypoints.last?.id {
                        selectedWaypointID = nil
                    }
                    flightPlan.waypoints.removeLast()
                } label: {
                    Image(systemName: "arrow.uturn.backward")
                        .foregroundStyle(.white)
                        .padding(10)
                        .background(.ultraThinMaterial)
                        .clipShape(Circle())
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
    }

    // MARK: - Helpers

    private func totalDistance() -> Double {
        guard flightPlan.waypoints.count >= 2 else { return 0 }
        var total: Double = 0
        for i in 1..<flightPlan.waypoints.count {
            let a = CLLocation(latitude: flightPlan.waypoints[i-1].latitude, longitude: flightPlan.waypoints[i-1].longitude)
            let b = CLLocation(latitude: flightPlan.waypoints[i].latitude, longitude: flightPlan.waypoints[i].longitude)
            total += a.distance(from: b)
        }
        return total
    }
}

// MARK: - Waypoint List

struct WaypointListView: View {
    let flightPlan: FlightPlan
    @Binding var selectedWaypointID: UUID?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                ForEach(Array(flightPlan.waypoints.enumerated()), id: \.element.id) { idx, wp in
                    Button {
                        selectedWaypointID = wp.id
                        dismiss()
                    } label: {
                        HStack(spacing: 12) {
                            ZStack {
                                Circle()
                                    .fill(wp.action.markerColor)
                                    .frame(width: 28, height: 28)
                                if wp.action == .waypoint {
                                    Text("\(idx + 1)")
                                        .font(.caption2.bold())
                                        .foregroundStyle(.white)
                                } else {
                                    Image(systemName: wp.action.icon)
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundStyle(.white)
                                }
                            }

                            VStack(alignment: .leading, spacing: 2) {
                                Text(wp.action.rawValue)
                                    .font(.subheadline.bold())
                                Text(String(format: "%.5f, %.5f", wp.latitude, wp.longitude))
                                    .font(.system(.caption2, design: .monospaced))
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            VStack(alignment: .trailing, spacing: 2) {
                                Text("\(Int(wp.altitude))m")
                                    .font(.system(.caption, design: .monospaced))
                                if wp.speed > 0 {
                                    Text("\(Int(wp.speed))m/s")
                                        .font(.system(.caption2, design: .monospaced))
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .tint(.primary)
                }
                .onMove { from, to in
                    flightPlan.moveWaypoint(fromOffsets: from, toOffset: to)
                }
                .onDelete { indices in
                    for i in indices.sorted().reversed() {
                        if flightPlan.waypoints[i].id == selectedWaypointID {
                            selectedWaypointID = nil
                        }
                        flightPlan.removeWaypoint(at: i)
                    }
                }
            }
            .navigationTitle("Waypoints (\(flightPlan.waypoints.count))")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    EditButton()
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Save Mission

struct SaveMissionSheet: View {
    let flightPlan: FlightPlan
    var geofenceCenter: CLLocationCoordinate2D?
    var geofenceRadius: Double = 200
    var polygonVertices: [CLLocationCoordinate2D] = []
    @Environment(\.dismiss) private var dismiss
    @State private var missionName: String = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                TextField("Mission name", text: $missionName)
                    .font(.system(.body, design: .monospaced))
                    .padding(12)
                    .background(Color(.systemGray6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Button {
                    flightPlan.name = missionName.isEmpty ? "Untitled" : missionName
                    let circleGeo: GeofenceData? = geofenceCenter.map {
                        GeofenceData(latitude: $0.latitude, longitude: $0.longitude, radius: geofenceRadius)
                    }
                    let polyGeo: PolygonGeofenceData? = polygonVertices.count >= 3
                        ? PolygonGeofenceData(vertices: polygonVertices.map { PolygonGeofenceVertex(latitude: $0.latitude, longitude: $0.longitude) })
                        : nil
                    flightPlan.save(geofence: circleGeo, polygonGeofence: polyGeo)
                    dismiss()
                } label: {
                    Label("Save", systemImage: "square.and.arrow.down")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .tint(.cyan)
                .disabled(flightPlan.waypoints.isEmpty)
            }
            .padding()
            .navigationTitle("Save Mission")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                missionName = flightPlan.name
            }
        }
    }
}

// MARK: - Load Mission

struct LoadMissionSheet: View {
    let flightPlan: FlightPlan
    var onLoadGeofence: ((SavedMission) -> Void)?
    @Environment(\.dismiss) private var dismiss
    @State private var missions: [SavedMission] = []

    var body: some View {
        NavigationStack {
            Group {
                if missions.isEmpty {
                    ContentUnavailableView("No Saved Missions", systemImage: "map",
                                           description: Text("Save a mission first"))
                } else {
                    List {
                        ForEach(missions) { mission in
                            Button {
                                flightPlan.load(from: mission)
                                onLoadGeofence?(mission)
                                dismiss()
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(mission.name)
                                            .font(.body.bold())
                                        Text("\(mission.waypoints.count) waypoints")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .tint(.primary)
                        }
                        .onDelete { indices in
                            for i in indices.sorted().reversed() {
                                FlightPlan.deleteMission(named: missions[i].name)
                                missions.remove(at: i)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Load Mission")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear {
                missions = FlightPlan.savedMissions()
            }
        }
    }
}
