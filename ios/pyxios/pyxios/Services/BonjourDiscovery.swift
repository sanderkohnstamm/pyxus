//
//  BonjourDiscovery.swift
//  pyxios
//
//  mDNS browser for auto-discovering MAVLink endpoints on the local network.
//

import Foundation
import Network

@Observable
final class BonjourDiscovery {
    struct DiscoveredService: Identifiable, Codable {
        let id: String
        let name: String
        let host: String
        let port: Int
        let type: String  // "udp" or "tcp"
    }

    var services: [DiscoveredService] = []
    var isSearching = false

    private var browser: NWBrowser?

    func startBrowsing() {
        guard !isSearching else { return }
        isSearching = true
        services = []

        // Browse for MAVLink services advertised via mDNS
        // Common service type for MAVLink: _mavlink._udp
        let params = NWParameters()
        let browser = NWBrowser(for: .bonjour(type: "_mavlink._udp", domain: nil), using: params)

        browser.stateUpdateHandler = { [weak self] state in
            DispatchQueue.main.async {
                switch state {
                case .failed:
                    self?.isSearching = false
                case .cancelled:
                    self?.isSearching = false
                default:
                    break
                }
            }
        }

        browser.browseResultsChangedHandler = { [weak self] results, _ in
            DispatchQueue.main.async {
                self?.services = results.compactMap { result in
                    guard case .service(let name, let type, let domain, _) = result.endpoint else {
                        return nil
                    }
                    return DiscoveredService(
                        id: "\(name).\(type).\(domain)",
                        name: name,
                        host: name,  // Will be resolved when connecting
                        port: 14550, // Default MAVLink port
                        type: "udp"
                    )
                }
            }
        }

        browser.start(queue: .main)
        self.browser = browser

        // Auto-stop after 10 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { [weak self] in
            self?.stopBrowsing()
        }
    }

    func stopBrowsing() {
        browser?.cancel()
        browser = nil
        isSearching = false
    }
}
