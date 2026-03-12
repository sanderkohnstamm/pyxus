//
//  BackgroundManager.swift
//  pyxios
//
//  Keeps the Python backend alive when the app is backgrounded during active flights.
//  Uses beginBackgroundTask to request extended execution time from iOS.
//

import UIKit

@Observable
final class BackgroundManager {
    static let shared = BackgroundManager()

    var isInBackground = false
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid

    private init() {
        setupNotifications()
    }

    private func setupNotifications() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appDidEnterBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appWillEnterForeground),
            name: UIApplication.willEnterForegroundNotification,
            object: nil
        )
    }

    @objc private func appDidEnterBackground() {
        isInBackground = true
        beginBackgroundTask()
    }

    @objc private func appWillEnterForeground() {
        isInBackground = false
        endBackgroundTask()
    }

    private func beginBackgroundTask() {
        guard backgroundTask == .invalid else { return }

        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "PyxusBackend") { [weak self] in
            // System is about to kill our background time — clean up
            self?.endBackgroundTask()
        }
    }

    private func endBackgroundTask() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        endBackgroundTask()
    }
}
