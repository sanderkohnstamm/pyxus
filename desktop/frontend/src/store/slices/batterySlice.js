const batterySlice = (set, get) => ({
  // Battery warning thresholds (percentage-based, persisted)
  batteryWarnThreshold: parseInt(localStorage.getItem('pyxus-battery-warn') || '30', 10),
  batteryCritThreshold: parseInt(localStorage.getItem('pyxus-battery-crit') || '15', 10),

  // Battery warnings (legacy voltage-based, kept for compatibility)
  batteryWarnings: { low: false, critical: false },

  // Per-drone battery alert tracking: { [droneId]: { warn: bool, crit: bool } }
  _batteryAlertState: {},

  // Altitude fence warning state
  altitudeWarnings: { exceeded: false },

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

  // Altitude warnings
  setAltitudeWarnings: (warnings) => set((s) => ({
    altitudeWarnings: { ...s.altitudeWarnings, ...warnings }
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
});

export default batterySlice;
