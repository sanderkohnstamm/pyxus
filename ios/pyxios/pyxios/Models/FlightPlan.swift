//
//  FlightPlan.swift
//  pyxios
//
//  Waypoint list model for mission planning with persistence.
//

import SwiftUI
import CoreLocation

struct Waypoint: Identifiable, Codable, Equatable {
    let id: UUID
    var latitude: Double
    var longitude: Double
    var altitude: Float = 10         // meters relative
    var speed: Float = 0             // 0 = default
    var loiterTime: Float = 0        // seconds, 0 = flythrough
    var loiterRadius: Float = 20     // meters
    var action: WaypointAction = .waypoint
    var cameraAction: CameraAction = .none
    var yawAngle: Float = 0          // degrees, 0 = auto (face next wp)
    var acceptRadius: Float = 1      // meters, how close counts as "reached"

    var coordinate: CLLocationCoordinate2D {
        get { CLLocationCoordinate2D(latitude: latitude, longitude: longitude) }
        set { latitude = newValue.latitude; longitude = newValue.longitude }
    }

    init(coordinate: CLLocationCoordinate2D, altitude: Float = 10) {
        self.id = UUID()
        self.latitude = coordinate.latitude
        self.longitude = coordinate.longitude
        self.altitude = altitude
    }

    enum WaypointAction: String, CaseIterable, Codable {
        case waypoint = "Waypoint"
        case takeoff = "Takeoff"
        case land = "Land"
        case loiter = "Loiter"
        case loiterTurns = "Loiter Turns"
        case returnToLaunch = "RTL"
        case speedChange = "Speed Change"
        case regionOfInterest = "ROI"

        var icon: String {
            switch self {
            case .waypoint: return "mappin"
            case .takeoff: return "arrow.up.circle"
            case .land: return "arrow.down.circle"
            case .loiter: return "arrow.triangle.capsulepath"
            case .loiterTurns: return "arrow.circlepath"
            case .returnToLaunch: return "house"
            case .speedChange: return "speedometer"
            case .regionOfInterest: return "eye"
            }
        }

        var markerColor: Color {
            switch self {
            case .waypoint: return .orange
            case .takeoff: return .green
            case .land: return .red
            case .loiter, .loiterTurns: return .purple
            case .returnToLaunch: return .blue
            case .speedChange: return .cyan
            case .regionOfInterest: return .yellow
            }
        }
    }

    enum CameraAction: String, CaseIterable, Codable {
        case none = "None"
        case photo = "Take Photo"
        case startVideo = "Start Video"
        case stopVideo = "Stop Video"
    }
}

@Observable
final class FlightPlan {
    var waypoints: [Waypoint] = []
    var name: String = "Untitled Mission"

    private static let storageDir: URL = {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = docs.appendingPathComponent("Missions", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    func addWaypoint(at coordinate: CLLocationCoordinate2D, altitude: Float = 10) {
        waypoints.append(Waypoint(coordinate: coordinate, altitude: altitude))
    }

    func removeWaypoint(at index: Int) {
        guard waypoints.indices.contains(index) else { return }
        waypoints.remove(at: index)
    }

    func moveWaypoint(fromOffsets source: IndexSet, toOffset destination: Int) {
        var items = waypoints
        items.move(fromOffsets: source, toOffset: destination)
        waypoints = items
    }

    func clear() {
        waypoints.removeAll()
    }

    // MARK: - Persistence

    func save(geofence: GeofenceData? = nil) {
        let file = Self.storageDir.appendingPathComponent(sanitizedName + ".json")
        let data = SavedMission(name: name, waypoints: waypoints, geofence: geofence)
        if let encoded = try? JSONEncoder().encode(data) {
            try? encoded.write(to: file)
        }
    }

    func load(from mission: SavedMission) {
        name = mission.name
        waypoints = mission.waypoints
    }

    static func savedMissions() -> [SavedMission] {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: storageDir, includingPropertiesForKeys: [.contentModificationDateKey],
            options: .skipsHiddenFiles
        ) else { return [] }

        return files
            .filter { $0.pathExtension == "json" }
            .compactMap { url -> SavedMission? in
                guard let data = try? Data(contentsOf: url),
                      let mission = try? JSONDecoder().decode(SavedMission.self, from: data)
                else { return nil }
                return mission
            }
            .sorted { $0.name < $1.name }
    }

    static func deleteMission(named name: String) {
        let safe = name.replacingOccurrences(of: "/", with: "_")
        let file = storageDir.appendingPathComponent(safe + ".json")
        try? FileManager.default.removeItem(at: file)
    }

    private var sanitizedName: String {
        name.replacingOccurrences(of: "/", with: "_")
    }
}

struct GeofenceData: Codable {
    let latitude: Double
    let longitude: Double
    let radius: Double
}

struct SavedMission: Codable, Identifiable {
    var id: String { name }
    let name: String
    let waypoints: [Waypoint]
    var geofence: GeofenceData?
}
