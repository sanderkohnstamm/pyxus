//
//  PythonRunner.swift
//  pyxios
//
//  Embeds CPython via python-apple-support and starts the FastAPI/uvicorn backend.
//  In development mode, it polls an external backend instead.
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
    /// Tries embedded CPython first; falls back to polling an external backend.
    func start() async {
        let bundle = Bundle.main
        let resourcePath = bundle.resourcePath ?? ""

        // Check if we have bundled Python resources (production build)
        let hasBundledBackend = FileManager.default.fileExists(
            atPath: resourcePath + "/backend/main.py"
        )

        if hasBundledBackend {
            await startEmbedded(resourcePath: resourcePath)
        } else {
            await pollExternalBackend()
        }
    }

    // MARK: - Embedded CPython

    private func startEmbedded(resourcePath: String) async {
        statusMessage = "Starting Python…"

        // Run CPython initialization + uvicorn on a background queue
        // so it doesn't block the main/actor thread.
        DispatchQueue.global(qos: .userInitiated).async {
            self.initializePython(resourcePath: resourcePath)
            self.runBootstrap(resourcePath: resourcePath)
        }

        // Poll /health until uvicorn is serving
        await pollHealth()
    }

    private func initializePython(resourcePath: String) {
        let pythonHome = resourcePath + "/python"
        let sitePackages = resourcePath + "/site-packages"
        let backendDir = resourcePath + "/backend"
        let frontendDir = resourcePath + "/frontend-dist"

        // Environment variables consumed by main.py / bootstrap.py
        setenv("PYTHONHOME", pythonHome, 1)
        setenv("PYTHONPATH", "\(sitePackages):\(backendDir)", 1)
        setenv("PYTHONDONTWRITEBYTECODE", "1", 1)
        setenv("PYXUS_DATA_DIR", backendDir, 1)
        setenv("PYXUS_FRONTEND_DIR", frontendDir, 1)

        Py_Initialize()
    }

    private func runBootstrap(resourcePath: String) {
        let bootstrapPath = resourcePath + "/backend/bootstrap.py"

        // Read and execute bootstrap.py — this blocks (uvicorn.run is blocking)
        guard let script = try? String(contentsOfFile: bootstrapPath, encoding: .utf8) else {
            DispatchQueue.main.async {
                self.statusMessage = "Failed to read bootstrap.py"
            }
            return
        }

        PyRun_SimpleString(script)
    }

    // MARK: - Development mode (external backend)

    private func pollExternalBackend() async {
        statusMessage = "Connecting to backend…"
        await pollHealth()
    }

    // MARK: - Health polling

    private func pollHealth() async {
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

        statusMessage = "Backend not reachable"
        // Still mark as ready so the WebView can load (it'll show connection errors)
        isReady = true
    }
}
