import { droneApi, fetchWithTimeout } from '../../utils/api';

const followMeSlice = (set, get) => ({
  // Follow-me state
  followMeActive: false,
  _followMeIntervalId: null,

  // Follow-me settings (persisted)
  followMeHeight: parseFloat(localStorage.getItem('pyxus-follow-me-height')) || 20,
  followMeDistance: parseFloat(localStorage.getItem('pyxus-follow-me-distance')) || 10,
  followMeAngle: parseFloat(localStorage.getItem('pyxus-follow-me-angle')) || 0,

  setFollowMeHeight: (v) => {
    localStorage.setItem('pyxus-follow-me-height', String(v));
    set({ followMeHeight: v });
  },
  setFollowMeDistance: (v) => {
    localStorage.setItem('pyxus-follow-me-distance', String(v));
    set({ followMeDistance: v });
  },
  setFollowMeAngle: (v) => {
    localStorage.setItem('pyxus-follow-me-angle', String(v));
    set({ followMeAngle: v });
  },

  startFollowMe: async () => {
    const { gcsPosition, activeDroneId, followMeHeight, followMeActive } = get();
    if (followMeActive) return;
    if (!gcsPosition || !activeDroneId) return;

    const alt = (gcsPosition.altitude || 0) + followMeHeight;
    try {
      const res = await fetchWithTimeout(droneApi(`/api/follow_me/start?drone_id=${activeDroneId}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: gcsPosition.lat, lon: gcsPosition.lon, alt }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        get().addAlert(data.error || 'Follow-me start failed', 'error');
        return;
      }
    } catch (err) {
      get().addAlert(`Follow-me start failed: ${err.message}`, 'error');
      return;
    }

    // Start 2Hz position update interval
    const intervalId = setInterval(() => {
      const { gcsPosition: pos, activeDroneId: droneId, followMeActive: active, followMeHeight: h } = get();
      if (!active || !pos || !droneId) return;
      const a = (pos.altitude || 0) + h;
      fetch(droneApi(`/api/follow_me/update?drone_id=${droneId}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: pos.lat, lon: pos.lon, alt: a }),
      }).catch(() => {});
    }, 500);

    set({ followMeActive: true, _followMeIntervalId: intervalId });
    get().addAlert('Follow-me started', 'success');
  },

  stopFollowMe: async () => {
    const { _followMeIntervalId, activeDroneId, followMeActive } = get();
    if (!followMeActive) return;

    if (_followMeIntervalId) clearInterval(_followMeIntervalId);
    set({ followMeActive: false, _followMeIntervalId: null });

    if (activeDroneId) {
      try {
        await fetchWithTimeout(droneApi(`/api/follow_me/stop?drone_id=${activeDroneId}`), {
          method: 'POST',
        });
      } catch {}
    }
    get().addAlert('Follow-me stopped', 'info');
  },

  // Called externally when drone disconnects or disarms to auto-stop
  _checkFollowMeSafety: () => {
    const { followMeActive, activeDroneId, drones } = get();
    if (!followMeActive) return;
    const drone = activeDroneId ? drones[activeDroneId] : null;
    const tel = drone?.telemetry;
    if (!tel || !tel.armed || tel.heartbeat_age < 0 || tel.heartbeat_age > 5) {
      get().stopFollowMe();
    }
  },
});

export default followMeSlice;
