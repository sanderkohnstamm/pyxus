import { create } from 'zustand';
import { fetchWithTimeout } from '../utils/api';

import missionSlice from './slices/missionSlice';
import fenceSlice from './slices/fenceSlice';
import uiSlice from './slices/uiSlice';
import inputSlice from './slices/inputSlice';
import videoSlice from './slices/videoSlice';
import batterySlice from './slices/batterySlice';
import patternSlice from './slices/patternSlice';
import flyModeSlice from './slices/flyModeSlice';
import calibrationSlice from './slices/calibrationSlice';
import followMeSlice from './slices/followMeSlice';

const MAX_TRAIL_POINTS = 500;
const MAX_BATTERY_SAMPLES = 300; // ~5 min at 1 sample/sec

// Stable empty references for Zustand selectors (avoid new [] / {} each render)
export const EMPTY_ARRAY = [];
export const EMPTY_OBJECT = {};

export const INITIAL_TELEMETRY = {
  roll: 0, pitch: 0, yaw: 0,
  rollspeed: 0, pitchspeed: 0, yawspeed: 0,
  lat: 0, lon: 0, alt: 0, alt_msl: 0,
  airspeed: 0, groundspeed: 0, climb: 0, heading: 0,
  voltage: 0, current: 0, remaining: -1,
  fix_type: 0, satellites: 0, hdop: 99.99,
  armed: false, mode: '', system_status: 0, autopilot: 'unknown',
  platform_type: 'Unknown', heartbeat_age: -1,
  mission_seq: -1,
};

const INITIAL_DRONE_STATE = {
  name: '',
  connectionString: '',
  telemetry: { ...INITIAL_TELEMETRY },
  trail: [],
  missionStatus: 'idle',
  droneMission: [],
  droneFence: [],
  batteryHistory: [],
  _lastBatterySampleTs: 0,
  cameras: [],
  gimbals: [],
  params: {},
  paramsTotal: 0,
  availableModes: [],
  staticModes: [],
  linkLost: false,
  linkLostSince: null,
  lastKnownPosition: null,
};

const useDroneStore = create((set, get) => ({
  // === Compose domain slices ===
  ...missionSlice(set, get),
  ...fenceSlice(set, get),
  ...uiSlice(set, get),
  ...inputSlice(set, get),
  ...videoSlice(set, get),
  ...batterySlice(set, get),
  ...patternSlice(set, get),
  ...flyModeSlice(set, get),
  ...calibrationSlice(set, get),
  ...followMeSlice(set, get),

  // === Multi-drone state ===
  drones: {},          // { [droneId]: INITIAL_DRONE_STATE }
  activeDroneId: null, // selected drone for sidebar/commands

  // Per-drone visibility on map: { [droneId]: { trail: true, mission: true, fence: true } }
  droneVisibility: {},

  // Alerts
  alerts: [],

  // MAVLink message log
  mavMessages: [],

  // Parameters metadata (global, cached per autopilot type)
  paramMeta: {},
  paramMetaLoading: false,
  paramMetaPlatform: null,

  // WebSocket
  wsConnected: false,

  // Connection history (persisted in localStorage)
  connectionHistory: JSON.parse(localStorage.getItem('pyxus-connection-history') || '[]'),

  // Batch (multi-drone) operations
  selectedDroneIds: [],       // drone IDs selected for batch ops (empty = single-drone mode)
  batchCommandStatus: {},     // { [droneId]: 'pending'|'success'|'error' }

  // === Selectors / Getters ===

  getDroneCapabilities: (droneId) => {
    const droneState = get().drones[droneId];
    return droneState?.telemetry?.capabilities || null;
  },

  // === Multi-drone actions ===

  registerDrone: (droneId, name, connectionString) => {
    const { drones, activeDroneId, droneVisibility } = get();
    const newDrones = {
      ...drones,
      [droneId]: { ...INITIAL_DRONE_STATE, name, connectionString },
    };
    // Auto-select if first drone
    const newActive = activeDroneId || droneId;
    // Initialize visibility defaults (all visible)
    const newVisibility = {
      ...droneVisibility,
      [droneId]: droneVisibility[droneId] || { trail: true, mission: true, fence: true },
    };
    set({ drones: newDrones, activeDroneId: newActive, droneVisibility: newVisibility });
  },

  removeDrone: (droneId) => {
    const { drones, activeDroneId, droneVisibility } = get();
    const { [droneId]: _, ...rest } = drones;
    const { [droneId]: _v, ...restVisibility } = droneVisibility;
    let newActive = activeDroneId;
    if (activeDroneId === droneId) {
      const ids = Object.keys(rest);
      newActive = ids.length > 0 ? ids[0] : null;
    }
    set({ drones: rest, activeDroneId: newActive, droneVisibility: restVisibility });
  },

  setActiveDrone: (droneId) => set({ activeDroneId: droneId }),

  // Batch selection actions
  toggleDroneSelection: (droneId) => {
    const { selectedDroneIds } = get();
    if (selectedDroneIds.includes(droneId)) {
      set({ selectedDroneIds: selectedDroneIds.filter((id) => id !== droneId) });
    } else {
      set({ selectedDroneIds: [...selectedDroneIds, droneId] });
    }
  },
  selectAllDrones: () => {
    const { drones } = get();
    set({ selectedDroneIds: Object.keys(drones) });
  },
  clearDroneSelection: () => set({ selectedDroneIds: [], batchCommandStatus: {} }),
  setBatchCommandStatus: (status) => set({ batchCommandStatus: status }),
  updateBatchCommandStatus: (droneId, status) => set((s) => ({
    batchCommandStatus: { ...s.batchCommandStatus, [droneId]: status },
  })),

  toggleDroneVisibility: (droneId, field) => {
    const { droneVisibility } = get();
    const current = droneVisibility[droneId] || { trail: true, mission: true, fence: true };
    set({
      droneVisibility: {
        ...droneVisibility,
        [droneId]: { ...current, [field]: !current[field] },
      },
    });
  },

  addToConnectionHistory: (name, connectionString, type) => {
    const { connectionHistory } = get();
    const filtered = connectionHistory.filter((e) => e.connectionString !== connectionString);
    const updated = [{ name, connectionString, type, lastUsed: Date.now() }, ...filtered];
    localStorage.setItem('pyxus-connection-history', JSON.stringify(updated));
    set({ connectionHistory: updated });
  },

  removeFromConnectionHistory: (connectionString) => {
    const { connectionHistory } = get();
    const updated = connectionHistory.filter((e) => e.connectionString !== connectionString);
    localStorage.setItem('pyxus-connection-history', JSON.stringify(updated));
    set({ connectionHistory: updated });
  },

  updateDroneTelemetry: (droneId, data) => {
    const { drones } = get();
    const droneState = drones[droneId];
    if (!droneState) return;

    const newTrail = [...droneState.trail];
    // Use lat/lon from delta if present, otherwise from existing telemetry
    const lat = data.lat !== undefined ? data.lat : droneState.telemetry.lat;
    const lon = data.lon !== undefined ? data.lon : droneState.telemetry.lon;
    if (lat && lat !== 0 && lon && lon !== 0) {
      const lastPoint = newTrail[newTrail.length - 1];
      if (!lastPoint || lastPoint[0] !== lat || lastPoint[1] !== lon) {
        newTrail.push([lat, lon]);
        if (newTrail.length > MAX_TRAIL_POINTS) {
          newTrail.shift();
        }
      }
    }

    // Battery history sampling (resolve from delta or existing telemetry)
    const now = Date.now();
    let newBatteryHistory = droneState.batteryHistory;
    let newLastTs = droneState._lastBatterySampleTs;
    const voltage = data.voltage !== undefined ? data.voltage : droneState.telemetry.voltage;
    const current = data.current !== undefined ? data.current : droneState.telemetry.current;
    if (voltage > 0 && now - droneState._lastBatterySampleTs >= 1000) {
      newBatteryHistory = [...droneState.batteryHistory, { ts: now, voltage, current }];
      if (newBatteryHistory.length > MAX_BATTERY_SAMPLES) newBatteryHistory.shift();
      newLastTs = now;
    }

    set({
      drones: {
        ...drones,
        [droneId]: {
          ...droneState,
          telemetry: { ...droneState.telemetry, ...data },
          trail: newTrail,
          missionStatus: data.mission_status !== undefined ? data.mission_status : droneState.missionStatus,
          batteryHistory: newBatteryHistory,
          _lastBatterySampleTs: newLastTs,
        },
      },
    });

    // Auto-stop follow-me if drone disarms or link degrades
    if (droneId === get().activeDroneId) {
      get()._checkFollowMeSafety?.();
    }
  },

  setDroneMission: (droneId, waypoints) => {
    const { drones } = get();
    const droneState = drones[droneId];
    if (!droneState) return;
    set({
      drones: { ...drones, [droneId]: { ...droneState, droneMission: waypoints } },
    });
  },

  setDroneFence: (droneId, items) => {
    const { drones } = get();
    const droneState = drones[droneId];
    if (!droneState) return;
    set({
      drones: { ...drones, [droneId]: { ...droneState, droneFence: items } },
    });
  },

  setDroneCameras: (droneId, cameras, gimbals) => {
    const { drones } = get();
    const droneState = drones[droneId];
    if (!droneState) return;
    set({
      drones: { ...drones, [droneId]: { ...droneState, cameras: cameras || [], gimbals: gimbals || [] } },
    });
  },

  setDroneParams: (droneId, params, total) => {
    const { drones } = get();
    const droneState = drones[droneId];
    if (!droneState) return;
    set({
      drones: { ...drones, [droneId]: { ...droneState, params, paramsTotal: total } },
    });
  },

  setDroneAvailableModes: (droneId, modes, staticModes) => {
    const { drones } = get();
    const droneState = drones[droneId];
    if (!droneState) return;
    const updates = { availableModes: modes };
    if (staticModes) updates.staticModes = staticModes;
    set({
      drones: { ...drones, [droneId]: { ...droneState, ...updates } },
    });
  },

  setDroneLinkStatus: (droneId, lost, lastTelemetry) => {
    const { drones } = get();
    const droneState = drones[droneId];
    if (!droneState) return;
    const updates = { linkLost: lost };
    if (lost) {
      updates.linkLostSince = Date.now();
      if (lastTelemetry && lastTelemetry.lat && lastTelemetry.lon) {
        updates.lastKnownPosition = { lat: lastTelemetry.lat, lon: lastTelemetry.lon, alt: lastTelemetry.alt };
      }
    } else {
      updates.linkLostSince = null;
    }
    set({
      drones: { ...drones, [droneId]: { ...droneState, ...updates } },
    });
  },

  setWsConnected: (connected) => set({ wsConnected: connected }),

  // MAVLink message log
  addMavMessages: (msgs) => {
    const { mavMessages } = get();
    const now = Date.now();
    const newMsgs = msgs.map((m) => ({ ...m, id: now + Math.random(), ts: now, source: 'mav' }));
    const combined = [...mavMessages, ...newMsgs].slice(-200);
    set({ mavMessages: combined });
  },
  setMavLogVisible: (visible) => set({ mavLogVisible: visible }),
  toggleMavLog: () => set((s) => ({ mavLogVisible: !s.mavLogVisible })),
  clearMavMessages: () => set({ mavMessages: [] }),

  // GCS action log
  addGcsLog: (text, level = 'info') => {
    const severityMap = { info: 6, warn: 4, error: 3, success: 5 };
    const { mavMessages } = get();
    const now = Date.now();
    const msg = {
      id: now + Math.random(),
      ts: now,
      severity: severityMap[level] || 6,
      text,
      source: 'gcs',
    };
    const combined = [...mavMessages, msg].slice(-200);
    set({ mavMessages: combined });
  },

  // Parameters metadata
  setParamMeta: (meta, platform) => set({ paramMeta: meta, paramMetaPlatform: platform }),
  fetchParamMeta: async (platformType, autopilot) => {
    const { paramMetaPlatform } = get();
    const cacheKey = `${autopilot}:${platformType}`;
    if (paramMetaPlatform === cacheKey) return;

    let vehicle;

    if (autopilot === 'px4') {
      vehicle = 'px4';
    } else if (autopilot === 'ardupilot') {
      const vehicleMap = {
        'Quadrotor': 'ArduCopter',
        'Hexarotor': 'ArduCopter',
        'Octorotor': 'ArduCopter',
        'Tricopter': 'ArduCopter',
        'Coaxial': 'ArduCopter',
        'Helicopter': 'ArduCopter',
        'Fixed Wing': 'ArduPlane',
        'Ground Rover': 'Rover',
        'Surface Boat': 'Rover',
        'Submarine': 'ArduSub',
        'Antenna Tracker': 'AntennaTracker',
      };
      vehicle = vehicleMap[platformType] || 'ArduCopter';
    } else {
      return;
    }

    const url = `/api/params/metadata/${vehicle}`;
    set({ paramMetaLoading: true });

    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      if (data.status !== 'ok' || !data.metadata) {
        throw new Error(data.error || 'No metadata');
      }

      const meta = {};
      for (const [name, info] of Object.entries(data.metadata)) {
        if (typeof info === 'object' && info.Description) {
          meta[name] = {
            description: info.Description,
            displayName: info.DisplayName,
            range: info.Range,
            values: info.Values,
            units: info.Units,
            increment: info.Increment,
            rebootRequired: info.RebootRequired,
            bitmask: info.Bitmask,
          };
        }
      }

      set({ paramMeta: meta, paramMetaPlatform: cacheKey, paramMetaLoading: false });
    } catch (err) {
      console.warn('Failed to fetch parameter metadata:', err);
      set({ paramMetaLoading: false });
    }
  },

  // Alerts
  addAlert: (message, type = 'info') => {
    const id = Date.now();
    const { alerts } = get();
    set({ alerts: [...alerts.slice(-4), { id, message, type }] });
    setTimeout(() => {
      const { alerts: current } = get();
      set({ alerts: current.filter((a) => a.id !== id) });
    }, 5000);
  },
}));

export default useDroneStore;
