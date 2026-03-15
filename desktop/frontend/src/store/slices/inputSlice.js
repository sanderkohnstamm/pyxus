const inputSlice = (set, get) => ({
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

  // Hotkeys for flight commands
  commandHotkeys: JSON.parse(localStorage.getItem('pyxus-command-hotkeys') || '{}'),

  // Servo groups
  servoGroups: JSON.parse(localStorage.getItem('pyxus-servo-groups') || '[]'),

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
});

export default inputSlice;
