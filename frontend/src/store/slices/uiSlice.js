const uiSlice = (set, get) => ({
  // Theme
  theme: localStorage.getItem('pyxus-theme') || 'dark', // dark | light
  colorScheme: localStorage.getItem('pyxus-color-scheme') || 'cyan',

  // Coordinate format
  coordFormat: localStorage.getItem('pyxus-coord-format') || 'latlon',

  // Sound
  soundEnabled: localStorage.getItem('pyxus-sound-enabled') !== 'false', // default true

  // Tabs
  activeTab: 'planning', // planning | flying

  // Plan subtab
  planSubTab: 'mission',

  // Sidebar
  sidebarCollapsed: false,

  // Map
  followDrone: true,

  // MAVLink message log
  mavLogVisible: false,

  // Video overlay
  videoOverlayVisible: false,

  // Mobile: bottom sheet snap state
  bottomSheetSnap: 'peek', // 'peek' | 'half' | 'full'

  // Mobile: virtual sticks for manual RC
  virtualSticksEnabled: false,

  // Mobile: native video player state
  videoPlayerState: 'hidden', // 'hidden' | 'pip' | 'fullscreen'

  // Pre-flight checklist
  showPreFlightChecklist: false,

  // Dangerous command confirmation
  confirmDangerousCommands: localStorage.getItem('pyxus-confirm-dangerous') !== 'false',
  confirmationDialog: null, // { variant, title, message, onConfirm, doubleConfirm }

  // Manual control overlay
  manualOverlayCollapsed: false,

  // Zoom on connect trigger
  zoomToDrone: false,

  // Home position
  homePosition: null,

  // GCS position (from browser geolocation)
  gcsPosition: null,
  _gcsZoomed: false,

  // Map bounds (for offline tile caching)
  mapBounds: null,

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
  toggleSound: () => {
    const next = !get().soundEnabled;
    localStorage.setItem('pyxus-sound-enabled', String(next));
    set({ soundEnabled: next });
  },

  // Plan subtab
  setPlanSubTab: (tab) => set({ planSubTab: tab, addWaypointMode: false }),

  // Pre-flight checklist
  setShowPreFlightChecklist: (show) => set({ showPreFlightChecklist: show }),

  // Dangerous command confirmation
  setConfirmDangerousCommands: (enabled) => {
    localStorage.setItem('pyxus-confirm-dangerous', String(enabled));
    set({ confirmDangerousCommands: enabled });
  },
  showConfirmationDialog: (dialog) => set({ confirmationDialog: dialog }),
  hideConfirmationDialog: () => set({ confirmationDialog: null }),

  // Sidebar
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // Map
  setFollowDrone: (follow) => set({ followDrone: follow }),

  // Video overlay
  toggleVideoOverlay: () => set((s) => ({ videoOverlayVisible: !s.videoOverlayVisible })),

  // Mobile bottom sheet
  setBottomSheetSnap: (snap) => set({ bottomSheetSnap: snap }),
  setVirtualSticksEnabled: (enabled) => set({ virtualSticksEnabled: enabled }),
  setVideoPlayerState: (state) => set({ videoPlayerState: state }),

  // Manual control overlay
  toggleManualOverlay: () => set((s) => ({ manualOverlayCollapsed: !s.manualOverlayCollapsed })),

  // Zoom on connect
  triggerZoomToDrone: () => set({ zoomToDrone: true }),
  clearZoomToDrone: () => set({ zoomToDrone: false }),

  // Home position
  setHomePosition: (pos) => set({ homePosition: pos }),

  // GCS position
  setGcsPosition: (pos) => set({ gcsPosition: pos }),
  markGcsZoomed: () => set({ _gcsZoomed: true }),

  // Map bounds
  setMapBounds: (bounds) => set({ mapBounds: bounds }),
});

export default uiSlice;
