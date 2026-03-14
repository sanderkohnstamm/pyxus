const fenceSlice = (set, get) => ({
  // Planned fence (polygon vertices)
  plannedFence: [],

  // Geofence (circular)
  geofence: { lat: 0, lon: 0, radius: 200, enabled: false },

  // Mission fence violations (from validation)
  missionViolations: [],

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

  // Mission fence violations
  setMissionViolations: (violations) => set({ missionViolations: violations }),
});

export default fenceSlice;
