import { transformMission } from '../../utils/geo';

const missionSlice = (set, get) => ({
  // Planned mission (user-editable, global — not per-drone)
  plannedWaypoints: [],
  missionStatus: 'idle',
  defaultAlt: 50,
  defaultSpeed: 5,
  takeoffAlt: 10,

  // Terrain elevation data for mission waypoints (from backend proxy)
  terrainElevations: [],  // [{lat, lon, elevation}] parallel to sampled path points

  // Saved missions (multi-mission planning)
  savedMissions: JSON.parse(localStorage.getItem('pyxus-saved-missions') || '[]'),
  activeMissionId: null,

  // Add waypoint mode
  addWaypointMode: false,

  // Selected waypoint (for map -> sidebar interaction)
  selectedWaypointId: null,

  // Mission manipulation
  missionManipMode: null,
  manipStartPos: null,
  contextMenuPos: null,

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

  // Terrain elevations
  setTerrainElevations: (elevations) => set({ terrainElevations: elevations }),

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
});

export default missionSlice;
