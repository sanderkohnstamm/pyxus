import { create } from 'zustand';
import { transformMission } from '../utils/geo';

const MAX_TRAIL_POINTS = 500;
const MAX_BATTERY_SAMPLES = 300; // ~5 min at 1 sample/sec

const INITIAL_TELEMETRY = {
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

const useDroneStore = create((set, get) => ({
  // Connection
  connectionStatus: 'disconnected', // disconnected | connecting | connected
  connectionString: 'udpin:0.0.0.0:14550',
  connectionType: 'udp',

  // Tabs
  activeTab: 'planning', // planning | flying

  // Theme
  theme: localStorage.getItem('pyxus-theme') || 'dark', // dark | light
  colorScheme: localStorage.getItem('pyxus-color-scheme') || 'cyan', // cyan | emerald | violet | rose | amber | sky

  // Coordinate format
  coordFormat: localStorage.getItem('pyxus-coord-format') || 'latlon', // latlon | mgrs

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

  // Saved missions (multi-mission planning)
  savedMissions: JSON.parse(localStorage.getItem('pyxus-saved-missions') || '[]'),
  activeMissionId: null,

  // Drone mission (downloaded from vehicle, read-only)
  droneMission: [],

  // Drone fence (downloaded from vehicle)
  droneFence: [],

  // Add waypoint mode
  addWaypointMode: false,

  // Selected waypoint (for map → sidebar interaction)
  selectedWaypointId: null,

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
  paramMeta: {},    // name -> {description, range, values, units, etc.}
  paramMetaLoading: false,
  paramMetaPlatform: null, // platform we fetched metadata for

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

  // Zoom on connect trigger
  zoomToDrone: false,

  // Pattern generation
  patternConfig: {
    type: null,        // 'lawnmower' | 'spiral' | 'orbit' | 'perimeter'
    visible: false,    // Show pattern config modal
    preview: [],       // Preview waypoints before committing
  },
  patternBounds: [],     // Custom polygon vertices for pattern area [{lat, lon, id}, ...]
  patternDrawMode: false, // Whether we're drawing pattern bounds

  // Mission manipulation
  missionManipMode: null, // null | 'translate' | 'rotate' | 'scale'
  manipStartPos: null,    // {lat, lon} - mouse start position
  contextMenuPos: null,   // {lat, lon, x, y} - context menu position

  // Cameras and gimbals detected via MAVLink
  cameras: [],   // [{id, vendor, model, capabilities, ...}]
  gimbals: [],   // [{id, vendor, model, capabilities, ...}]
  activeCamera: null,

  // Hotkeys for flight commands
  commandHotkeys: JSON.parse(localStorage.getItem('pyxus-command-hotkeys') || '{}'),

  // Servo groups (for quick actuation buttons)
  // Each group: { id, name, servos: [{servo, openPwm, closePwm}], openHotkey, closeHotkey, state }
  servoGroups: JSON.parse(localStorage.getItem('pyxus-servo-groups') || '[]'),

  // Battery history for strip chart
  batteryHistory: [], // [{ts, voltage, current}]
  _lastBatterySampleTs: 0,

  // Battery warnings
  batteryWarnings: { low: false, critical: false },

  // Measure tool
  measureMode: false,
  measurePoints: [], // [{lat, lon}] max 2

  // Home position
  homePosition: null, // {lat, lon, alt}

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
  setColorScheme: (scheme) => {
    localStorage.setItem('pyxus-color-scheme', scheme);
    set({ colorScheme: scheme });
  },
  toggleCoordFormat: () => {
    const next = get().coordFormat === 'latlon' ? 'mgrs' : 'latlon';
    localStorage.setItem('pyxus-coord-format', next);
    set({ coordFormat: next });
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

    // Sample battery history (throttled to 1/sec)
    const now = Date.now();
    const { batteryHistory, _lastBatterySampleTs } = get();
    let newBatteryHistory = batteryHistory;
    if (data.voltage > 0 && now - _lastBatterySampleTs >= 1000) {
      newBatteryHistory = [...batteryHistory, { ts: now, voltage: data.voltage, current: data.current }];
      if (newBatteryHistory.length > MAX_BATTERY_SAMPLES) newBatteryHistory.shift();
    }

    set({
      telemetry: { ...data },
      trail: newTrail,
      missionStatus: data.mission_status || 'idle',
      batteryHistory: newBatteryHistory,
      _lastBatterySampleTs: newBatteryHistory !== batteryHistory ? now : _lastBatterySampleTs,
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

  // Selected waypoint
  setSelectedWaypointId: (id) => set({ selectedWaypointId: id }),

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

  // Multi-mission management
  saveMission: (name) => {
    const { plannedWaypoints, defaultAlt, defaultSpeed, savedMissions, activeMissionId } = get();
    const now = Date.now();

    if (activeMissionId) {
      // Update existing mission
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
      // Create new mission
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
    const { droneMission, savedMissions } = get();
    if (!droneMission.length) return null;

    const now = Date.now();
    const waypoints = droneMission.map((wp) => ({
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
  setParamMeta: (meta, platform) => set({ paramMeta: meta, paramMetaPlatform: platform }),
  fetchParamMeta: async (platformType, autopilot) => {
    const { paramMetaPlatform } = get();
    // Create a cache key combining autopilot and platform
    const cacheKey = `${autopilot}:${platformType}`;
    // Don't refetch if already loaded for this autopilot/platform
    if (paramMetaPlatform === cacheKey) return;

    let vehicle;

    if (autopilot === 'px4') {
      // PX4 uses a single metadata file for all vehicle types
      vehicle = 'px4';
    } else if (autopilot === 'ardupilot') {
      // Map platform type to ArduPilot vehicle type
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
      // Unknown autopilot, skip metadata fetch
      return;
    }

    // Use backend proxy to avoid CORS issues
    const url = `/api/params/metadata/${vehicle}`;

    set({ paramMetaLoading: true });

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      if (data.status !== 'ok' || !data.metadata) {
        throw new Error(data.error || 'No metadata');
      }

      // Parse the ArduPilot pdef format
      // It's a dict of param names -> {Description, Range, Values, Units, ...}
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

  // Zoom on connect
  triggerZoomToDrone: () => set({ zoomToDrone: true }),
  clearZoomToDrone: () => set({ zoomToDrone: false }),

  // Cameras and gimbals
  setCameras: (cameras) => set({ cameras }),
  setGimbals: (gimbals) => set({ gimbals }),
  setActiveCamera: (id) => set({ activeCamera: id }),

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

  // Battery warnings
  setBatteryWarnings: (warnings) => set((s) => ({
    batteryWarnings: { ...s.batteryWarnings, ...warnings }
  })),

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
      batteryHistory: [],
      _lastBatterySampleTs: 0,
      batteryWarnings: { low: false, critical: false },
    }),
}));

export default useDroneStore;
