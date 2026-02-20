import { create } from 'zustand';
import { transformMission } from '../utils/geo';

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
};

const useDroneStore = create((set, get) => ({
  // --- Multi-drone state ---
  drones: {},          // { [droneId]: INITIAL_DRONE_STATE }
  activeDroneId: null, // selected drone for sidebar/commands

  // Per-drone visibility on map: { [droneId]: { trail: true, mission: true, fence: true } }
  droneVisibility: {},

  // Tabs
  activeTab: 'planning', // planning | flying

  // Theme
  theme: localStorage.getItem('pyxus-theme') || 'dark', // dark | light
  colorScheme: localStorage.getItem('pyxus-color-scheme') || 'cyan',

  // Coordinate format
  coordFormat: localStorage.getItem('pyxus-coord-format') || 'latlon',

  // Planned mission (user-editable, global — not per-drone)
  plannedWaypoints: [],
  missionStatus: 'idle',
  defaultAlt: 50,
  defaultSpeed: 5,
  takeoffAlt: 10,

  // Saved missions (multi-mission planning)
  savedMissions: JSON.parse(localStorage.getItem('pyxus-saved-missions') || '[]'),
  activeMissionId: null,

  // Add waypoint mode
  addWaypointMode: false,

  // Selected waypoint (for map → sidebar interaction)
  selectedWaypointId: null,

  // Plan subtab
  planSubTab: 'mission',

  // Planned fence (polygon vertices)
  plannedFence: [],

  // Geofence (circular)
  geofence: { lat: 0, lon: 0, radius: 200, enabled: false },

  // Video
  videoUrl: '',
  videoActive: false,

  // Parameters metadata (global, cached per autopilot type)
  paramMeta: {},
  paramMetaLoading: false,
  paramMetaPlatform: null,

  // Keyboard control
  keyboardEnabled: false,
  keysPressed: {},

  // Gamepad
  gamepadEnabled: false,

  // Manual control state (shared between keyboard/gamepad)
  manualControl: {
    active: false,
    source: null,
    lastRc: [1500, 1500, 1500, 1500],
    lastUpdate: 0,
  },

  // Sidebar
  sidebarCollapsed: false,

  // Map
  followDrone: true,

  // Alerts
  alerts: [],

  // MAVLink message log
  mavMessages: [],
  mavLogVisible: false,

  // Video overlay
  videoOverlayVisible: false,

  // Fly click target
  flyClickTarget: null,

  // Quick mission mode
  quickMissionMode: false,
  quickMissionWaypoints: [],

  // Calibration
  calibrationStatus: {
    active: false,
    type: null,
    step: 0,
    messages: [],
  },

  // Manual control overlay
  manualOverlayCollapsed: false,

  // Zoom on connect trigger
  zoomToDrone: false,

  // Pattern generation
  patternConfig: {
    type: null,
    visible: false,
    preview: [],
  },
  patternBounds: [],
  patternDrawMode: false,

  // Mission manipulation
  missionManipMode: null,
  manipStartPos: null,
  contextMenuPos: null,

  // Hotkeys for flight commands
  commandHotkeys: JSON.parse(localStorage.getItem('pyxus-command-hotkeys') || '{}'),

  // Servo groups
  servoGroups: JSON.parse(localStorage.getItem('pyxus-servo-groups') || '[]'),

  // Battery warning thresholds (percentage-based, persisted)
  batteryWarnThreshold: parseInt(localStorage.getItem('pyxus-battery-warn') || '30', 10),
  batteryCritThreshold: parseInt(localStorage.getItem('pyxus-battery-crit') || '15', 10),

  // Battery warnings (legacy voltage-based, kept for compatibility)
  batteryWarnings: { low: false, critical: false },

  // Per-drone battery alert tracking: { [droneId]: { warn: bool, crit: bool } }
  _batteryAlertState: {},

  // Measure tool
  measureMode: false,
  measurePoints: [],

  // Home position
  homePosition: null,

  // GCS position (from browser geolocation)
  gcsPosition: null,
  _gcsZoomed: false,

  // Pre-flight checklist
  showPreFlightChecklist: false,

  // WebSocket
  wsConnected: false,

  // Connection history (persisted in localStorage)
  connectionHistory: JSON.parse(localStorage.getItem('pyxus-connection-history') || '[]'),

  // Weather
  weather: {
    routeAnalysis: null,
    pointWeather: null,
    platforms: {},
    currentPlatform: 'multirotor_medium',
    loading: false,
    lastUpdate: null,
    autoRefresh: true,
    showWindVectors: true,
    showRiskOverlay: true,
    forecastTime: null,
  },

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

  // === Actions ===
  setActiveTab: (tab) => set({ activeTab: tab, addWaypointMode: false }),

  setTheme: (theme) => {
    localStorage.setItem('pyxus-theme', theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('pyxus-theme', next);
    set({ theme: next });
  },
  setColorScheme: (scheme) => {
    localStorage.setItem('pyxus-color-scheme', scheme);
    set({ colorScheme: scheme });
  },
  toggleCoordFormat: () => {
    const next = get().coordFormat === 'latlon' ? 'mgrs' : 'latlon';
    localStorage.setItem('pyxus-coord-format', next);
    set({ coordFormat: next });
  },

  setWsConnected: (connected) => set({ wsConnected: connected }),

  // Pre-flight checklist
  setShowPreFlightChecklist: (show) => set({ showPreFlightChecklist: show }),

  // Planned mission waypoints
  addWaypoint: (lat, lon, alt) => {
    const { plannedWaypoints, defaultAlt } = get();
    set({
      plannedWaypoints: [
        ...plannedWaypoints,
        {
          lat, lon,
          alt: alt ?? defaultAlt,
          id: Date.now(),
          type: 'waypoint',
          param1: 0,
          param2: 2,
          param3: 0,
          param4: 0,
        },
      ],
    });
  },

  removeWaypoint: (id) => {
    const { plannedWaypoints } = get();
    set({ plannedWaypoints: plannedWaypoints.filter((w) => w.id !== id) });
  },

  updateWaypoint: (id, updates) => {
    const { plannedWaypoints } = get();
    set({
      plannedWaypoints: plannedWaypoints.map((w) => (w.id === id ? { ...w, ...updates } : w)),
    });
  },

  updateWaypointAlt: (id, alt) => {
    const { plannedWaypoints } = get();
    set({
      plannedWaypoints: plannedWaypoints.map((w) => (w.id === id ? { ...w, alt: parseFloat(alt) || 0 } : w)),
    });
  },

  addJumpWaypoint: (targetIndex, repeat = -1) => {
    const { plannedWaypoints } = get();
    set({
      plannedWaypoints: [
        ...plannedWaypoints,
        {
          lat: 0, lon: 0, alt: 0,
          id: Date.now(),
          type: 'do_jump',
          param1: targetIndex,
          param2: repeat,
          param3: 0,
          param4: 0,
        },
      ],
    });
  },

  clearWaypoints: () => set({ plannedWaypoints: [] }),

  setPlannedWaypoints: (waypoints) => set({ plannedWaypoints: waypoints }),

  reorderWaypoints: (fromIndex, toIndex) => {
    const { plannedWaypoints } = get();
    const updated = [...plannedWaypoints];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    set({ plannedWaypoints: updated });
  },

  setDefaultAlt: (alt) => set({ defaultAlt: parseFloat(alt) || 50 }),
  setDefaultSpeed: (speed) => set({ defaultSpeed: parseFloat(speed) || 5 }),
  setTakeoffAlt: (alt) => set({ takeoffAlt: parseFloat(alt) || 10 }),

  setMissionStatus: (status) => set({ missionStatus: status }),

  // Add waypoint mode
  setAddWaypointMode: (mode) => set({ addWaypointMode: mode }),
  toggleAddWaypointMode: () => set((s) => ({ addWaypointMode: !s.addWaypointMode })),

  // Selected waypoint
  setSelectedWaypointId: (id) => set({ selectedWaypointId: id }),

  // Drone mission helpers (use active drone)
  importDroneMission: () => {
    const { drones, activeDroneId } = get();
    const droneState = activeDroneId && drones[activeDroneId];
    if (!droneState) return;
    const imported = droneState.droneMission.map((wp) => ({
      lat: wp.lat,
      lon: wp.lon,
      alt: wp.alt,
      id: Date.now() + Math.random() * 10000,
      type: wp.item_type || 'waypoint',
      param1: wp.param1 || 0,
      param2: wp.param2 || 2,
      param3: wp.param3 || 0,
      param4: wp.param4 || 0,
    }));
    set({ plannedWaypoints: imported });
  },

  // Multi-mission management
  saveMission: (name) => {
    const { plannedWaypoints, defaultAlt, defaultSpeed, savedMissions, activeMissionId } = get();
    const now = Date.now();

    if (activeMissionId) {
      const updated = savedMissions.map(m => m.id === activeMissionId ? {
        ...m,
        name: name || m.name,
        waypoints: plannedWaypoints,
        defaults: { alt: defaultAlt, speed: defaultSpeed },
        updatedAt: now,
      } : m);
      localStorage.setItem('pyxus-saved-missions', JSON.stringify(updated));
      set({ savedMissions: updated });
    } else {
      const newMission = {
        id: now,
        name: name || `Mission ${savedMissions.length + 1}`,
        waypoints: plannedWaypoints,
        defaults: { alt: defaultAlt, speed: defaultSpeed },
        createdAt: now,
        updatedAt: now,
      };
      const updated = [...savedMissions, newMission];
      localStorage.setItem('pyxus-saved-missions', JSON.stringify(updated));
      set({ savedMissions: updated, activeMissionId: newMission.id });
    }
  },

  loadMission: (id) => {
    const { savedMissions } = get();
    const mission = savedMissions.find(m => m.id === id);
    if (mission) {
      const waypoints = mission.waypoints.map(wp => ({ ...wp, id: Date.now() + Math.random() * 10000 }));
      set({
        plannedWaypoints: waypoints,
        activeMissionId: id,
        defaultAlt: mission.defaults?.alt || 50,
        defaultSpeed: mission.defaults?.speed || 5,
      });
    }
  },

  deleteMission: (id) => {
    const { savedMissions, activeMissionId } = get();
    const updated = savedMissions.filter(m => m.id !== id);
    localStorage.setItem('pyxus-saved-missions', JSON.stringify(updated));
    set({
      savedMissions: updated,
      activeMissionId: activeMissionId === id ? null : activeMissionId,
    });
  },

  duplicateMission: (id) => {
    const { savedMissions } = get();
    const mission = savedMissions.find(m => m.id === id);
    if (mission) {
      const now = Date.now();
      const newMission = {
        ...mission,
        id: now,
        name: `${mission.name} (copy)`,
        createdAt: now,
        updatedAt: now,
      };
      const updated = [...savedMissions, newMission];
      localStorage.setItem('pyxus-saved-missions', JSON.stringify(updated));
      set({ savedMissions: updated });
    }
  },

  renameMission: (id, name) => {
    const { savedMissions } = get();
    const updated = savedMissions.map(m => m.id === id ? { ...m, name, updatedAt: Date.now() } : m);
    localStorage.setItem('pyxus-saved-missions', JSON.stringify(updated));
    set({ savedMissions: updated });
  },

  newMission: () => {
    set({ plannedWaypoints: [], activeMissionId: null });
  },

  importDroneAsMission: (name) => {
    const { drones, activeDroneId, savedMissions } = get();
    const droneState = activeDroneId && drones[activeDroneId];
    if (!droneState || !droneState.droneMission.length) return null;

    const now = Date.now();
    const waypoints = droneState.droneMission.map((wp) => ({
      lat: wp.lat,
      lon: wp.lon,
      alt: wp.alt,
      id: now + Math.random() * 10000,
      type: wp.item_type || 'waypoint',
      param1: wp.param1 || 0,
      param2: wp.param2 || 2,
      param3: wp.param3 || 0,
      param4: wp.param4 || 0,
    }));

    const newMission = {
      id: now,
      name: name || `Imported ${new Date().toLocaleTimeString()}`,
      waypoints,
      defaults: { alt: 50, speed: 5 },
      createdAt: now,
      updatedAt: now,
    };

    const updated = [...savedMissions, newMission];
    localStorage.setItem('pyxus-saved-missions', JSON.stringify(updated));
    set({ savedMissions: updated, plannedWaypoints: waypoints, activeMissionId: newMission.id });
    return newMission;
  },

  // Plan subtab
  setPlanSubTab: (tab) => set({ planSubTab: tab, addWaypointMode: false }),

  // Planned fence (polygon)
  addFenceVertex: (lat, lon) => {
    const { plannedFence } = get();
    set({
      plannedFence: [
        ...plannedFence,
        { id: Date.now(), lat, lon },
      ],
    });
  },
  removeFenceVertex: (id) => {
    const { plannedFence } = get();
    set({ plannedFence: plannedFence.filter((v) => v.id !== id) });
  },
  updateFenceVertex: (id, updates) => {
    const { plannedFence } = get();
    set({
      plannedFence: plannedFence.map((v) => (v.id === id ? { ...v, ...updates } : v)),
    });
  },
  clearPlannedFence: () => set({ plannedFence: [] }),

  // Geofence (circular)
  setGeofence: (updates) => {
    const { geofence } = get();
    set({ geofence: { ...geofence, ...updates } });
  },

  // Weather
  setWeatherRouteAnalysis: (analysis) => set((s) => ({
    weather: { ...s.weather, routeAnalysis: analysis, lastUpdate: Date.now() }
  })),

  setWeatherPointData: (point) => set((s) => ({
    weather: { ...s.weather, pointWeather: point }
  })),

  setWeatherPlatforms: (platforms, current) => set((s) => ({
    weather: { ...s.weather, platforms, currentPlatform: current }
  })),

  setWeatherPlatform: (platformId) => set((s) => ({
    weather: { ...s.weather, currentPlatform: platformId }
  })),

  setWeatherLoading: (loading) => set((s) => ({
    weather: { ...s.weather, loading }
  })),

  toggleWeatherAutoRefresh: () => set((s) => ({
    weather: { ...s.weather, autoRefresh: !s.weather.autoRefresh }
  })),

  toggleWeatherWindVectors: () => set((s) => ({
    weather: { ...s.weather, showWindVectors: !s.weather.showWindVectors }
  })),

  toggleWeatherRiskOverlay: () => set((s) => ({
    weather: { ...s.weather, showRiskOverlay: !s.weather.showRiskOverlay }
  })),

  setWeatherForecastTime: (time) => set((s) => ({
    weather: { ...s.weather, forecastTime: time }
  })),

  // Video
  setVideoUrl: (url) => set({ videoUrl: url }),
  setVideoActive: (active) => set({ videoActive: active }),

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
      const res = await fetch(url);
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

  // Keyboard (exclusive with gamepad)
  setKeyboardEnabled: (enabled) => set({
    keyboardEnabled: enabled,
    ...(enabled ? { gamepadEnabled: false } : {}),
  }),

  // Gamepad (exclusive with keyboard)
  setGamepadEnabled: (enabled) => set({
    gamepadEnabled: enabled,
    ...(enabled ? { keyboardEnabled: false, keysPressed: {} } : {}),
  }),
  setKeyPressed: (key, pressed) => {
    const { keysPressed } = get();
    set({ keysPressed: { ...keysPressed, [key.toLowerCase()]: pressed } });
  },

  // Manual control
  setManualControlActive: (active, source = null) => set((s) => ({
    manualControl: { ...s.manualControl, active, source: active ? source : null }
  })),
  updateManualControlRc: (channels) => set((s) => ({
    manualControl: { ...s.manualControl, lastRc: channels, lastUpdate: Date.now(), active: true }
  })),

  // Sidebar
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // Map
  setFollowDrone: (follow) => set({ followDrone: follow }),

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

  // Video overlay
  toggleVideoOverlay: () => set((s) => ({ videoOverlayVisible: !s.videoOverlayVisible })),

  // Fly click target
  setFlyClickTarget: (target) => set({ flyClickTarget: target }),
  clearFlyClickTarget: () => set({ flyClickTarget: null }),

  // Quick mission mode
  startQuickMission: (lat, lon) => {
    set({
      quickMissionMode: true,
      quickMissionWaypoints: [{ lat, lon, id: Date.now() }],
      flyClickTarget: null,
    });
  },
  addQuickMissionWaypoint: (lat, lon) => {
    const { quickMissionWaypoints } = get();
    set({
      quickMissionWaypoints: [...quickMissionWaypoints, { lat, lon, id: Date.now() }],
    });
  },
  removeLastQuickMissionWaypoint: () => {
    const { quickMissionWaypoints } = get();
    if (quickMissionWaypoints.length <= 1) return;
    set({ quickMissionWaypoints: quickMissionWaypoints.slice(0, -1) });
  },
  addQuickMissionJump: (targetIndex, repeat = -1) => {
    const { quickMissionWaypoints } = get();
    set({
      quickMissionWaypoints: [...quickMissionWaypoints, {
        id: Date.now(),
        type: 'do_jump',
        jumpTarget: targetIndex,
        repeat,
      }],
    });
  },
  cancelQuickMission: () => {
    set({ quickMissionMode: false, quickMissionWaypoints: [] });
  },

  // Calibration
  setCalibrationActive: (active, type = null) => set((s) => ({
    calibrationStatus: { ...s.calibrationStatus, active, type, step: 0, messages: active ? [] : s.calibrationStatus.messages }
  })),
  setCalibrationStep: (step) => set((s) => ({
    calibrationStatus: { ...s.calibrationStatus, step }
  })),
  addCalibrationMessage: (msg) => set((s) => ({
    calibrationStatus: {
      ...s.calibrationStatus,
      messages: [...s.calibrationStatus.messages.slice(-20), msg]
    }
  })),
  clearCalibrationStatus: () => set({
    calibrationStatus: { active: false, type: null, step: 0, messages: [] }
  }),

  // Manual control overlay
  toggleManualOverlay: () => set((s) => ({ manualOverlayCollapsed: !s.manualOverlayCollapsed })),

  // Zoom on connect
  triggerZoomToDrone: () => set({ zoomToDrone: true }),
  clearZoomToDrone: () => set({ zoomToDrone: false }),

  // Command hotkeys
  setCommandHotkey: (key, command) => {
    const { commandHotkeys } = get();
    const updated = { ...commandHotkeys, [key.toLowerCase()]: command };
    localStorage.setItem('pyxus-command-hotkeys', JSON.stringify(updated));
    set({ commandHotkeys: updated });
  },
  removeCommandHotkey: (key) => {
    const { commandHotkeys } = get();
    const updated = { ...commandHotkeys };
    delete updated[key.toLowerCase()];
    localStorage.setItem('pyxus-command-hotkeys', JSON.stringify(updated));
    set({ commandHotkeys: updated });
  },
  clearCommandHotkeys: () => {
    localStorage.removeItem('pyxus-command-hotkeys');
    set({ commandHotkeys: {} });
  },

  // Servo groups
  addServoGroup: (group) => {
    const { servoGroups } = get();
    const updated = [...servoGroups, { ...group, id: Date.now() }];
    localStorage.setItem('pyxus-servo-groups', JSON.stringify(updated));
    set({ servoGroups: updated });
  },
  updateServoGroup: (id, updates) => {
    const { servoGroups } = get();
    const updated = servoGroups.map(g => g.id === id ? { ...g, ...updates } : g);
    localStorage.setItem('pyxus-servo-groups', JSON.stringify(updated));
    set({ servoGroups: updated });
  },
  removeServoGroup: (id) => {
    const { servoGroups } = get();
    const updated = servoGroups.filter(g => g.id !== id);
    localStorage.setItem('pyxus-servo-groups', JSON.stringify(updated));
    set({ servoGroups: updated });
  },
  setServoGroupState: (id, state) => {
    const { servoGroups } = get();
    const updated = servoGroups.map(g => g.id === id ? { ...g, state } : g);
    localStorage.setItem('pyxus-servo-groups', JSON.stringify(updated));
    set({ servoGroups: updated });
  },

  // Battery warning thresholds
  setBatteryWarnThreshold: (val) => {
    const v = Math.max(0, Math.min(100, parseInt(val, 10) || 30));
    localStorage.setItem('pyxus-battery-warn', String(v));
    set({ batteryWarnThreshold: v });
  },
  setBatteryCritThreshold: (val) => {
    const v = Math.max(0, Math.min(100, parseInt(val, 10) || 15));
    localStorage.setItem('pyxus-battery-crit', String(v));
    set({ batteryCritThreshold: v });
  },

  // Battery warnings (legacy voltage-based)
  setBatteryWarnings: (warnings) => set((s) => ({
    batteryWarnings: { ...s.batteryWarnings, ...warnings }
  })),

  // Per-drone battery alert state
  setBatteryAlertState: (droneId, state) => set((s) => ({
    _batteryAlertState: {
      ...s._batteryAlertState,
      [droneId]: { ...(s._batteryAlertState[droneId] || {}), ...state },
    },
  })),
  clearBatteryAlertState: (droneId) => set((s) => {
    const { [droneId]: _, ...rest } = s._batteryAlertState;
    return { _batteryAlertState: rest };
  }),

  // Measure tool
  setMeasureMode: (enabled) => set({ measureMode: enabled, measurePoints: enabled ? [] : [] }),
  addMeasurePoint: (lat, lon) => {
    const { measurePoints } = get();
    if (measurePoints.length >= 2) {
      set({ measurePoints: [{ lat, lon }] });
    } else {
      set({ measurePoints: [...measurePoints, { lat, lon }] });
    }
  },
  clearMeasure: () => set({ measureMode: false, measurePoints: [] }),

  // Home position
  setHomePosition: (pos) => set({ homePosition: pos }),

  // GCS position
  setGcsPosition: (pos) => set({ gcsPosition: pos }),
  markGcsZoomed: () => set({ _gcsZoomed: true }),

  // Pattern generation
  setPatternConfig: (config) => set((s) => ({
    patternConfig: { ...s.patternConfig, ...config }
  })),

  applyPattern: (waypoints) => {
    const { plannedWaypoints } = get();
    const withIds = waypoints.map((w, i) => ({
      ...w,
      id: Date.now() + i,
      type: w.type || 'waypoint',
      param1: 0,
      param2: 2,
      param3: 0,
      param4: 0,
    }));
    set({ plannedWaypoints: [...plannedWaypoints, ...withIds] });
  },

  replaceWithPattern: (waypoints) => {
    const withIds = waypoints.map((w, i) => ({
      ...w,
      id: Date.now() + i,
      type: w.type || 'waypoint',
      param1: 0,
      param2: 2,
      param3: 0,
      param4: 0,
    }));
    set({ plannedWaypoints: withIds });
  },

  clearPatternPreview: () => set((s) => ({
    patternConfig: { ...s.patternConfig, preview: [] }
  })),

  // Pattern bounds drawing
  setPatternDrawMode: (enabled) => set({ patternDrawMode: enabled }),
  addPatternBoundsVertex: (lat, lon) => {
    const { patternBounds } = get();
    set({
      patternBounds: [
        ...patternBounds,
        { lat, lon, id: Date.now() },
      ],
    });
  },
  removePatternBoundsVertex: (id) => {
    const { patternBounds } = get();
    set({ patternBounds: patternBounds.filter((v) => v.id !== id) });
  },
  updatePatternBoundsVertex: (id, updates) => {
    const { patternBounds } = get();
    set({
      patternBounds: patternBounds.map((v) => (v.id === id ? { ...v, ...updates } : v)),
    });
  },
  clearPatternBounds: () => set({ patternBounds: [], patternDrawMode: false }),

  // Mission manipulation
  setMissionManipMode: (mode) => set({ missionManipMode: mode }),
  setManipStartPos: (pos) => set({ manipStartPos: pos }),
  setContextMenuPos: (pos) => set({ contextMenuPos: pos }),

  transformAllWaypoints: (transform, params) => {
    const { plannedWaypoints } = get();
    const transformed = transformMission(plannedWaypoints, transform, params);
    set({ plannedWaypoints: transformed });
  },

  reverseWaypoints: () => {
    const { plannedWaypoints } = get();
    set({ plannedWaypoints: [...plannedWaypoints].reverse() });
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
