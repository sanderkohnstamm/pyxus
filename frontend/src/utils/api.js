// API base URL - uses proxy in dev, direct URL in Electron production
const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:';
const API_BASE = isElectron ? 'http://localhost:8000' : '';
const WS_BASE = isElectron ? 'ws://localhost:8000' : '';

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

export function wsUrl(path) {
  // In browser with proxy, use relative ws path
  if (!isElectron && typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${path}`;
  }
  return `${WS_BASE}${path}`;
}

export default { apiUrl, wsUrl, API_BASE, WS_BASE };
