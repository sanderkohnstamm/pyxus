//
//  PythonRunner.swift
//  pyxios
//
//  Embeds CPython via python-apple-support and starts the FastAPI/uvicorn backend.
//  For now this is a stub that will be completed once python-apple-support is integrated.
//  In development mode, it can connect to an external backend instead.
//

import Foundation
import Observation

@Observable
final class PythonRunner: Sendable {
    private(set) var isReady = false
    private(set) var statusMessage = "Initializing…"

    /// Port the backend listens on
    let port: Int = 8000
    let host: String = "127.0.0.1"

    var baseURL: URL {
        URL(string: "http://\(host):\(port)")!
    }

    /// Start the Python backend.
    /// In development: polls an external backend until it responds.
    /// In production: will embed CPython and boot uvicorn in-process.
    func start() async {
        // --- Phase 1: Development mode ---
        // Connect to an external backend running on the Mac (via network).
        // The iOS simulator shares the host network, so localhost works.
        // On a real device, you'd need the Mac's IP or use Bonjour discovery.

        statusMessage = "Connecting to backend…"

        // Poll /health until the backend is up (max 30s)
        let healthURL = baseURL.appendingPathComponent("api/health")
        let startTime = Date()
        let timeout: TimeInterval = 30

        while Date().timeIntervalSince(startTime) < timeout {
            do {
                let (_, response) = try await URLSession.shared.data(from: healthURL)
                if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                    statusMessage = "Backend ready"
                    isReady = true
                    return
                }
            } catch {
                // Backend not up yet, keep polling
            }
            try? await Task.sleep(for: .milliseconds(500))
        }

        statusMessage = "Backend not reachable — start it manually"
        // Still mark as ready so the WebView can load (it'll show connection errors)
        isReady = true
    }

    // MARK: - Embedded Python (Phase 2 — not yet implemented)
    //
    // When python-apple-support is integrated:
    // 1. Set PYTHONHOME to the bundled Python.framework
    // 2. Set PYTHONPATH to include the bundled backend/ directory
    // 3. Call Py_Initialize()
    // 4. Run bootstrap.py which starts uvicorn
    // 5. Poll /health until ready
    //
    // func startEmbeddedPython() async { ... }
}
