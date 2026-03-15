const patternSlice = (set, get) => ({
  // Pattern generation
  patternConfig: {
    type: null,
    visible: false,
    preview: [],
  },
  patternBounds: [],
  patternDrawMode: false,

  // Pattern config
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
});

export default patternSlice;
