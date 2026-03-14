const calibrationSlice = (set) => ({
  // Calibration
  calibrationStatus: {
    active: false,
    type: null,
    step: 0,
    messages: [],
  },

  // Calibration actions
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
});

export default calibrationSlice;
