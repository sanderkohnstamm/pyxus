import { useState, useEffect, useCallback } from 'react';

/**
 * Detect the current platform and provide safe area insets.
 *
 * Detection priority:
 * 1. window.__PYXIOS__ — injected by WKWebView (native iOS app)
 * 2. navigator.userAgent — fallback for mobile Safari / PWA
 * 3. Default to desktop
 */

function detectPlatform() {
  if (typeof window === 'undefined') return { isIOS: false, isMobile: false };

  // Native iOS app: WKWebView injects this at document start
  if (window.__PYXIOS__?.platform === 'ios') {
    return { isIOS: true, isMobile: true };
  }

  // Fallback: user agent sniffing for mobile browsers
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isMobile = isIOS || isAndroid || 'ontouchstart' in window;

  return { isIOS, isMobile };
}

const DEFAULT_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Hook that provides platform detection and safe area insets.
 *
 * Usage:
 *   const { isMobile, isIOS, safeAreaInsets, triggerHaptic } = usePlatform();
 */
export default function usePlatform() {
  const [platform] = useState(detectPlatform);
  const [safeAreaInsets, setSafeAreaInsets] = useState(() => {
    // Read initial insets from the native bridge if available
    return window.__PYXIOS__?.safeAreaInsets || DEFAULT_INSETS;
  });

  useEffect(() => {
    // Listen for safe area updates from the native side (e.g., on rotation)
    function handleSafeArea(e) {
      if (e.detail) setSafeAreaInsets(e.detail);
    }
    window.addEventListener('pyxios:safearea', handleSafeArea);
    return () => window.removeEventListener('pyxios:safearea', handleSafeArea);
  }, []);

  /**
   * Trigger native haptic feedback via the JS bridge.
   * No-op on non-iOS platforms.
   * @param {'light'|'medium'|'heavy'|'success'|'warning'|'error'} style
   */
  const triggerHaptic = useCallback((style = 'medium') => {
    if (window.webkit?.messageHandlers?.pyxios) {
      window.webkit.messageHandlers.pyxios.postMessage({
        action: 'haptic',
        style,
      });
    }
  }, []);

  return {
    isMobile: platform.isMobile,
    isIOS: platform.isIOS,
    safeAreaInsets,
    triggerHaptic,
  };
}

/**
 * Non-hook versions for use outside React components (e.g., in store logic).
 */
export function isMobile() {
  return detectPlatform().isMobile;
}

export function isIOS() {
  return detectPlatform().isIOS;
}
