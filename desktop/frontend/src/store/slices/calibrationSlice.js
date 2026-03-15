const calibrationSlice = (set) => ({
  // Calibration
  calibrationStatus: {
    active: false,
    type: null,
    step: 0,
    messages: [],
    compassPercent: 0,
    completed: null,  // null = running, true = success, false = failure
  },

  // Calibration actions
  setCalibrationActive: (active, type = null) => set((s) => ({
    calibrationStatus: {
      ...s.calibrationStatus,
      active,
      type,
      step: 0,
      messages: active ? [] : s.calibrationStatus.messages,
      compassPercent: 0,
      completed: null,
    }
  })),
  setCalibrationStep: (step) => set((s) => ({
    calibrationStatus: { ...s.calibrationStatus, step }
  })),
  setCompassPercent: (percent) => set((s) => ({
    calibrationStatus: { ...s.calibrationStatus, compassPercent: percent }
  })),
  setCalibrationCompleted: (success) => set((s) => ({
    calibrationStatus: { ...s.calibrationStatus, completed: success }
  })),
  addCalibrationMessage: (msg) => set((s) => ({
    calibrationStatus: {
      ...s.calibrationStatus,
      messages: [...s.calibrationStatus.messages.slice(-20), msg]
    }
  })),
  clearCalibrationStatus: () => set({
    calibrationStatus: { active: false, type: null, step: 0, messages: [], compassPercent: 0, completed: null }
  }),
});

export default calibrationSlice;
