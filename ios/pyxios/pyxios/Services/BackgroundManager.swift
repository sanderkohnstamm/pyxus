//
//  BackgroundManager.swift
//  pyxios
//
//  Keeps the MAVSDK connection alive when the app is backgrounded during active flights.
//  Uses beginBackgroundTask to request extended execution time from iOS.
//

import UIKit

final class BackgroundManager: @unchecked Sendable {
    static let shared = BackgroundManager()

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
        beginBackgroundTask()
    }

    @objc private func appWillEnterForeground() {
        endBackgroundTask()
    }

    private func beginBackgroundTask() {
        guard backgroundTask == .invalid else { return }

        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "PyxusFlight") { [weak self] in
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
