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
      const res = await fetch(droneApiFor(`/api/${endpoint}`, droneId), {
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

export default { apiUrl, wsUrl, droneApi, droneApiFor, executeBatchCommand, API_BASE, WS_BASE };
