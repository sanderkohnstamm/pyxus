//
//  CachedTileOverlay.swift
//  pyxios
//
//  MKTileOverlay subclass that caches Esri satellite tiles to disk.
//  Checks disk first, then fetches + caches. 30-day expiry.
//

import MapKit

final class CachedTileOverlay: MKTileOverlay {

    private static let cacheDir: URL = {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let dir = caches.appendingPathComponent("tiles", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    private static let maxAge: TimeInterval = 30 * 24 * 3600  // 30 days

    override init(urlTemplate URLTemplate: String?) {
        super.init(urlTemplate: URLTemplate)
        self.canReplaceMapContent = false
    }

    convenience init() {
        self.init(urlTemplate: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}")
    }

    override func loadTile(at path: MKTileOverlayPath, result: @escaping (Data?, Error?) -> Void) {
        let fileURL = Self.tilePath(z: path.z, x: path.x, y: path.y)

        // Check disk cache
        if FileManager.default.fileExists(atPath: fileURL.path) {
            // Check expiry
            if let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
               let modified = attrs[.modificationDate] as? Date,
               Date().timeIntervalSince(modified) < Self.maxAge {
                if let data = try? Data(contentsOf: fileURL) {
                    result(data, nil)
                    return
                }
            }
        }

        // Fetch from network
        let url = self.url(forTilePath: path)
        URLSession.shared.dataTask(with: url) { data, response, error in
            if let data, let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                // Cache to disk
                let dir = fileURL.deletingLastPathComponent()
                try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
                try? data.write(to: fileURL)
                result(data, nil)
            } else {
                result(nil, error)
            }
        }.resume()
    }

    private static func tilePath(z: Int, x: Int, y: Int) -> URL {
        cacheDir
            .appendingPathComponent("\(z)", isDirectory: true)
            .appendingPathComponent("\(x)", isDirectory: true)
            .appendingPathComponent("\(y).jpg")
    }
}
