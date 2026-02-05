import { create } from 'zustand';

const MAX_TRAIL_POINTS = 500;

const INITIAL_TELEMETRY = {
  roll: 0, pitch: 0, yaw: 0,
  rollspeed: 0, pitchspeed: 0, yawspeed: 0,
  lat: 0, lon: 0, alt: 0, alt_msl: 0,
  airspeed: 0, groundspeed: 0, climb: 0, heading: 0,
  voltage: 0, current: 0, remaining: -1,
  fix_type: 0, satellites: 0, hdop: 99.99,
  armed: false, mode: '', system_status: 0, autopilot: 'unknown',
  platform_type: 'Unknown', heartbeat_age: -1,
};

const useDroneStore = create((set, get) => ({
  // Connection
  connectionStatus: 'disconnected', // disconnected | connecting | connected
  connectionString: 'udpin:0.0.0.0:14550',
  connectionType: 'udp',

  // Tabs
  activeTab: 'planning', // planning | flying

  // Theme
  theme: localStorage.getItem('pyxus-theme') || 'dark', // dark | light

  // Telemetry
  telemetry: { ...INITIAL_TELEMETRY },

  // Trail
  trail: [],

  // Planned mission (user-editable)
  plannedWaypoints: [],
  missionStatus: 'idle',
  defaultAlt: 50,
  defaultSpeed: 5,
  takeoffAlt: 10,

  // Drone mission (downloaded from vehicle, read-only)
  droneMission: [],

  // Drone fence (downloaded from vehicle)
  droneFence: [],

  // Add waypoint mode
  addWaypointMode: false,

  // Plan subtab
  planSubTab: 'mission', // 'mission' | 'fence'

  // Planned fence (polygon vertices)
  plannedFence: [],

  // Geofence (circular)
  geofence: { lat: 0, lon: 0, radius: 200, enabled: false },

  // Video
  videoUrl: '',
  videoActive: false,

  // Parameters
  params: {},       // name -> {value, type, index}
  paramsTotal: 0,
  paramsLoading: false,

  // Keyboard control
  keyboardEnabled: false,
  keysPressed: {},

  // Gamepad
  gamepadEnabled: false,

  // Manual control state (shared between keyboard/gamepad)
  manualControl: {
    active: false,        // true when any manual input is being sent
    source: null,         // 'keyboard' | 'gamepad' | null
    lastRc: [1500, 1500, 1500, 1500], // [roll, pitch, throttle, yaw]
    lastUpdate: 0,        // timestamp of last RC send
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
  flyClickTarget: null, // {lat, lon}

  // Drone identity (for change detection)
  droneIdentity: { sysid: null, autopilot: null, platformType: null },

  // Calibration
  calibrationStatus: {
    active: false,
    type: null,
    step: 0,        // For accel: 0-5 (6 positions)
    messages: [],   // Recent calibration messages
  },

  // Manual control overlay
  manualOverlayCollapsed: false,

  // WebSocket
  wsConnected: false,

  // Weather
  weather: {
    routeAnalysis: null,           // RouteWeather data from backend
    pointWeather: null,             // Single point weather
    platforms: {},                  // Available platform profiles
    currentPlatform: 'multirotor_medium',
    loading: false,
    lastUpdate: null,
    autoRefresh: true,              // Auto-fetch when waypoints change
    showWindVectors: true,          // Map visualization toggle
    showRiskOverlay: true,          // Map risk circles toggle
    forecastTime: null,             // ISO string for future missions
  },

  // Actions
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

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setConnectionString: (str) => set({ connectionString: str }),
  setConnectionType: (type) => {
    const presets = {
      udp: 'udpin:0.0.0.0:14550',
      tcp: 'tcp:127.0.0.1:5760',
      serial: '/dev/ttyUSB0',
    };
    set({ connectionType: type, connectionString: presets[type] || '' });
  },

  updateTelemetry: (data) => {
    const { trail } = get();
    const newTrail = [...trail];

    // Add to trail if we have valid coordinates
    if (data.lat !== 0 && data.lon !== 0) {
      const lastPoint = newTrail[newTrail.length - 1];
      if (!lastPoint || lastPoint[0] !== data.lat || lastPoint[1] !== data.lon) {
        newTrail.push([data.lat, data.lon]);
        if (newTrail.length > MAX_TRAIL_POINTS) {
          newTrail.shift();
        }
      }
    }

    set({
      telemetry: { ...data },
      trail: newTrail,
      missionStatus: data.mission_status || 'idle',
    });
  },

  setWsConnected: (connected) => set({ wsConnected: connected }),

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

  // Drone mission (downloaded)
  setDroneMission: (waypoints) => set({ droneMission: waypoints }),
  clearDroneMission: () => set({ droneMission: [] }),

  importDroneMission: () => {
    const { droneMission } = get();
    const imported = droneMission.map((wp) => ({
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

  // Drone fence (downloaded)
  setDroneFence: (items) => set({ droneFence: items }),

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

  // Parameters
  setParams: (params, total) => set({ params, paramsTotal: total }),
  setParamsLoading: (loading) => set({ paramsLoading: loading }),

  // Keyboard
  setKeyboardEnabled: (enabled) => set({ keyboardEnabled: enabled }),

  // Gamepad
  setGamepadEnabled: (enabled) => set({ gamepadEnabled: enabled }),
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
    const newMsgs = msgs.map((m) => ({ ...m, id: now + Math.random(), ts: now }));
    const combined = [...mavMessages, ...newMsgs].slice(-200);
    set({ mavMessages: combined });
  },
  setMavLogVisible: (visible) => set({ mavLogVisible: visible }),
  toggleMavLog: () => set((s) => ({ mavLogVisible: !s.mavLogVisible })),
  clearMavMessages: () => set({ mavMessages: [] }),

  // Video overlay
  toggleVideoOverlay: () => set((s) => ({ videoOverlayVisible: !s.videoOverlayVisible })),

  // Fly click target
  setFlyClickTarget: (target) => set({ flyClickTarget: target }),
  clearFlyClickTarget: () => set({ flyClickTarget: null }),

  // Drone identity
  setDroneIdentity: (identity) => set({ droneIdentity: identity }),
  checkDroneChange: (newIdentity) => {
    const { droneIdentity } = get();
    // If we had a previous identity and it changed
    if (droneIdentity.sysid !== null &&
        (droneIdentity.sysid !== newIdentity.sysid ||
         droneIdentity.autopilot !== newIdentity.autopilot ||
         droneIdentity.platformType !== newIdentity.platformType)) {
      return true; // Drone changed
    }
    return false;
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

  // Reset on disconnect
  resetState: () =>
    set({
      connectionStatus: 'disconnected',
      telemetry: { ...INITIAL_TELEMETRY },
      trail: [],
      missionStatus: 'idle',
      wsConnected: false,
      droneMission: [],
      droneFence: [],
      addWaypointMode: false,
      mavMessages: [],
      droneIdentity: { sysid: null, autopilot: null, platformType: null },
      calibrationStatus: { active: false, type: null, step: 0, messages: [] },
    }),
}));

export default useDroneStore;
