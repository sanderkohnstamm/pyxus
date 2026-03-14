//
//  CachedTileInjector.swift
//  pyxios
//
//  Injects a CachedTileOverlay into the underlying MKMapView.
//  Provides offline satellite tile fallback.
//

import SwiftUI
import MapKit

/// A clear UIView that, once in the hierarchy, finds the nearest MKMapView
/// and adds a CachedTileOverlay for offline satellite tiles.
struct CachedTileInjectorView: UIViewRepresentable {

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        // Delay to let the Map view render first
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            guard let mapView = uiView.findMKMapView() else { return }
            // Only add once
            let alreadyAdded = mapView.overlays.contains(where: { $0 is CachedTileOverlay })
            if !alreadyAdded {
                let overlay = CachedTileOverlay()
                mapView.addOverlay(overlay, level: .aboveLabels)
                // Ensure we have a renderer delegate
                if mapView.delegate == nil || !(mapView.delegate is TileRendererDelegate) {
                    let delegate = TileRendererDelegate(originalDelegate: mapView.delegate)
                    mapView.delegate = delegate
                    // Store strong reference
                    objc_setAssociatedObject(mapView, &TileRendererDelegate.associatedKey, delegate, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
                }
            }
        }
    }
}

/// Delegate that provides tile overlay renderers while forwarding other calls.
private class TileRendererDelegate: NSObject, MKMapViewDelegate {
    static var associatedKey: UInt8 = 0
    weak var originalDelegate: MKMapViewDelegate?

    init(originalDelegate: MKMapViewDelegate?) {
        self.originalDelegate = originalDelegate
    }

    func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
        if let tileOverlay = overlay as? MKTileOverlay {
            return MKTileOverlayRenderer(overlay: tileOverlay)
        }
        return originalDelegate?.mapView?(mapView, rendererFor: overlay) ?? MKOverlayRenderer(overlay: overlay)
    }
}

private extension UIView {
    func findMKMapView() -> MKMapView? {
        if let mapView = self as? MKMapView { return mapView }
        // Search siblings and parent
        if let parent = superview {
            for sibling in parent.subviews {
                if let found = sibling.deepFindMKMapView() {
                    return found
                }
            }
            return parent.findMKMapView()
        }
        return nil
    }

    func deepFindMKMapView() -> MKMapView? {
        if let mapView = self as? MKMapView { return mapView }
        for child in subviews {
            if let found = child.deepFindMKMapView() {
                return found
            }
        }
        return nil
    }
}

extension View {
    /// Adds a cached tile overlay for offline satellite imagery.
    func cachedTileOverlay() -> some View {
        self.background(CachedTileInjectorView())
    }
}
