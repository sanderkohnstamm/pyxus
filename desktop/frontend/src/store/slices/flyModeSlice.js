const flyModeSlice = (set, get) => ({
  // Fly click target
  flyClickTarget: null,

  // Quick mission mode
  quickMissionMode: false,
  quickMissionWaypoints: [],

  // Measure tool
  measureMode: false,
  measurePoints: [],

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
});

export default flyModeSlice;
