import useDroneStore from '../store/droneStore';

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

/**
 * Build an API URL with the active drone's drone_id query parameter appended.
 * Use this for all drone-scoped endpoints.
 */
export function droneApi(path) {
  const { activeDroneId } = useDroneStore.getState();
  if (!activeDroneId) return apiUrl(path);
  const sep = path.includes('?') ? '&' : '?';
  return apiUrl(`${path}${sep}drone_id=${activeDroneId}`);
}

export default { apiUrl, wsUrl, droneApi, API_BASE, WS_BASE };
