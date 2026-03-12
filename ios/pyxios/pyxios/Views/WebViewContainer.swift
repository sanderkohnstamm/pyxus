//
//  WebViewContainer.swift
//  pyxios
//
//  WKWebView that loads the React frontend from the local backend.
//  Provides a JS bridge for native capabilities (haptics, safe area insets).
//

import SwiftUI
@preconcurrency import WebKit

struct WebViewContainer: UIViewRepresentable {
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()

        // Allow inline media playback (needed for video PiP later)
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // JS bridge: expose native functions to the React frontend
        let contentController = config.userContentController
        contentController.add(context.coordinator, name: "pyxios")

        // Inject platform info so the frontend can detect iOS
        let platformScript = WKUserScript(
            source: """
                window.__PYXIOS__ = {
                    platform: 'ios',
                    safeAreaInsets: {
                        top: \(Self.safeAreaInsets.top),
                        bottom: \(Self.safeAreaInsets.bottom),
                        left: \(Self.safeAreaInsets.left),
                        right: \(Self.safeAreaInsets.right)
                    }
                };
                """,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        contentController.addUserScript(platformScript)

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black

        // Disable bounce scrolling (the React app handles its own scrolling)
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // Allow inspecting in Safari dev tools during development
        #if DEBUG
        webView.isInspectable = true
        #endif

        // Load the frontend from the local backend
        let url = URL(string: "http://127.0.0.1:8000")!
        webView.load(URLRequest(url: url))

        context.coordinator.webView = webView
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Update safe area insets when they change (e.g., rotation)
        let insets = Self.safeAreaInsets
        webView.evaluateJavaScript("""
            if (window.__PYXIOS__) {
                window.__PYXIOS__.safeAreaInsets = {
                    top: \(insets.top),
                    bottom: \(insets.bottom),
                    left: \(insets.left),
                    right: \(insets.right)
                };
                window.dispatchEvent(new CustomEvent('pyxios:safearea', {
                    detail: window.__PYXIOS__.safeAreaInsets
                }));
            }
            """)
    }

    /// Get current safe area insets from the key window
    private static var safeAreaInsets: UIEdgeInsets {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?
            .keyWindow?
            .safeAreaInsets ?? .zero
    }

    // MARK: - Coordinator (JS Bridge Handler)

    class Coordinator: NSObject, WKScriptMessageHandler {
        weak var webView: WKWebView?

        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard let body = message.body as? [String: Any],
                  let action = body["action"] as? String else { return }

            switch action {
            case "haptic":
                let style = body["style"] as? String ?? "medium"
                HapticManager.shared.trigger(style: style)

            case "getSafeArea":
                // Send safe area insets back to JS
                let insets = WebViewContainer.safeAreaInsets
                let js = """
                    window.dispatchEvent(new CustomEvent('pyxios:safearea', {
                        detail: {
                            top: \(insets.top),
                            bottom: \(insets.bottom),
                            left: \(insets.left),
                            right: \(insets.right)
                        }
                    }));
                    """
                webView?.evaluateJavaScript(js)

            // Video player bridge
            case "videoPlay":
                if let url = body["url"] as? String {
                    DispatchQueue.main.async {
                        VideoPlayerManager.shared.play(urlString: url)
                    }
                }
            case "videoStop":
                DispatchQueue.main.async {
                    VideoPlayerManager.shared.stop()
                }
            case "videoFullscreen":
                DispatchQueue.main.async {
                    VideoPlayerManager.shared.enterFullscreen()
                }
            case "videoExitFullscreen":
                DispatchQueue.main.async {
                    VideoPlayerManager.shared.exitFullscreen()
                }

            // Telemetry HUD update (sent from React at ~1Hz)
            case "hudUpdate":
                if let data = body["data"] as? [String: Any] {
                    DispatchQueue.main.async {
                        TelemetryHUD.shared.update(from: data)
                    }
                }

            default:
                break
            }
        }
    }
}
