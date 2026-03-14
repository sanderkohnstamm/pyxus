import useDroneStore from '../store/droneStore';

/**
 * Fetch with an AbortController timeout. Rejects with an AbortError if the
 * request takes longer than `timeoutMs` milliseconds.
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

// API base URL - uses proxy in dev, direct URL in Electron/iOS production
const isElectron = typeof window !== 'undefined' && window.location.protocol === 'file:';
const isIOSApp = typeof window !== 'undefined' && window.__PYXIOS__?.platform === 'ios';
const useDirectURL = isElectron || isIOSApp;
const API_BASE = useDirectURL ? 'http://127.0.0.1:8000' : '';
const WS_BASE = useDirectURL ? 'ws://127.0.0.1:8000' : '';

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

export function wsUrl(path) {
  // In browser with proxy, use relative ws path
  if (!useDirectURL && typeof window !== 'undefined') {
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

/**
 * Build an API URL for a specific drone (not necessarily the active one).
 */
export function droneApiFor(path, droneId) {
  if (!droneId) return apiUrl(path);
  const sep = path.includes('?') ? '&' : '?';
  return apiUrl(`${path}${sep}drone_id=${droneId}`);
}

/**
 * Execute the same command against multiple drones sequentially.
 * Updates batchCommandStatus in the store as each completes.
 * @param {string[]} droneIds - drone IDs to send the command to
 * @param {string} endpoint - API endpoint (e.g. 'arm', 'disarm', 'rtl', 'land')
 * @param {object} body - request body for POST
 * @param {function} addAlert - store alert function
 * @returns {Promise<object>} - { [droneId]: 'success'|'error' }
 */
export async function executeBatchCommand(droneIds, endpoint, body = {}, addAlert) {
  const store = useDroneStore.getState();
  const drones = store.drones;

  // Initialize all to pending
  const initialStatus = {};
  for (const id of droneIds) initialStatus[id] = 'pending';
  store.setBatchCommandStatus(initialStatus);

  const results = {};

  for (const droneId of droneIds) {
    const droneName = drones[droneId]?.name || droneId;
    try {
      const res = await fetchWithTimeout(droneApiFor(`/api/${endpoint}`, droneId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.status === 'error') {
        results[droneId] = 'error';
        useDroneStore.getState().updateBatchCommandStatus(droneId, 'error');
        if (addAlert) addAlert(`${endpoint} failed on ${droneName}: ${data.error || 'unknown'}`, 'error');
      } else {
        results[droneId] = 'success';
        useDroneStore.getState().updateBatchCommandStatus(droneId, 'success');
      }
    } catch (err) {
      results[droneId] = 'error';
      useDroneStore.getState().updateBatchCommandStatus(droneId, 'error');
      if (addAlert) addAlert(`${endpoint} failed on ${droneName}: ${err.message}`, 'error');
    }
  }

  const successCount = Object.values(results).filter((r) => r === 'success').length;
  if (addAlert && droneIds.length > 1) {
    addAlert(`Batch ${endpoint}: ${successCount}/${droneIds.length} succeeded`, successCount === droneIds.length ? 'success' : 'warning');
  }

  return results;
}

export default { apiUrl, wsUrl, droneApi, droneApiFor, executeBatchCommand, fetchWithTimeout, API_BASE, WS_BASE, isIOSApp };
