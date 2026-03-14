import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, value) => { store[key] = String(value); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// Mock window for api.js module-level checks
Object.defineProperty(globalThis, 'window', {
  value: { location: { protocol: 'http:', host: 'localhost:5173' } },
  writable: true,
});

// Import store after mocks are in place
const { default: useDroneStore, INITIAL_TELEMETRY } = await import('../store/droneStore');

describe('droneStore', () => {
  beforeEach(() => {
    // Reset store to initial state between tests
    useDroneStore.setState({
      drones: {},
      activeDroneId: null,
      droneVisibility: {},
      plannedWaypoints: [],
      theme: 'dark',
      wsConnected: false,
      selectedDroneIds: [],
      batchCommandStatus: {},
      alerts: [],
      mavMessages: [],
    });
  });

  describe('initial state', () => {
    it('has expected default values', () => {
      const state = useDroneStore.getState();
      expect(state.drones).toEqual({});
      expect(state.activeDroneId).toBeNull();
      expect(state.plannedWaypoints).toEqual([]);
      expect(state.wsConnected).toBe(false);
      expect(state.alerts).toEqual([]);
      expect(state.mavMessages).toEqual([]);
    });

    it('INITIAL_TELEMETRY has expected fields', () => {
      expect(INITIAL_TELEMETRY.lat).toBe(0);
      expect(INITIAL_TELEMETRY.lon).toBe(0);
      expect(INITIAL_TELEMETRY.armed).toBe(false);
      expect(INITIAL_TELEMETRY.mode).toBe('');
      expect(INITIAL_TELEMETRY.remaining).toBe(-1);
    });
  });

  describe('addWaypoint', () => {
    it('adds a waypoint to plannedWaypoints', () => {
      useDroneStore.getState().addWaypoint(52.0, 4.0, 100);
      const { plannedWaypoints } = useDroneStore.getState();

      expect(plannedWaypoints).toHaveLength(1);
      expect(plannedWaypoints[0].lat).toBe(52.0);
      expect(plannedWaypoints[0].lon).toBe(4.0);
      expect(plannedWaypoints[0].alt).toBe(100);
      expect(plannedWaypoints[0].type).toBe('waypoint');
      expect(plannedWaypoints[0].id).toBeDefined();
    });

    it('uses defaultAlt when alt is not provided', () => {
      useDroneStore.setState({ defaultAlt: 75 });
      useDroneStore.getState().addWaypoint(10, 20);
      const { plannedWaypoints } = useDroneStore.getState();

      expect(plannedWaypoints[0].alt).toBe(75);
    });

    it('appends multiple waypoints in order', () => {
      const { addWaypoint } = useDroneStore.getState();
      addWaypoint(1, 1, 10);
      addWaypoint(2, 2, 20);
      addWaypoint(3, 3, 30);

      const { plannedWaypoints } = useDroneStore.getState();
      expect(plannedWaypoints).toHaveLength(3);
      expect(plannedWaypoints[0].lat).toBe(1);
      expect(plannedWaypoints[2].lat).toBe(3);
    });
  });

  describe('removeWaypoint', () => {
    it('removes a waypoint by id', () => {
      // Manually set waypoints with known distinct ids
      useDroneStore.setState({
        plannedWaypoints: [
          { lat: 10, lon: 20, alt: 30, id: 1001, type: 'waypoint', param1: 0, param2: 2, param3: 0, param4: 0 },
          { lat: 40, lon: 50, alt: 60, id: 1002, type: 'waypoint', param1: 0, param2: 2, param3: 0, param4: 0 },
        ],
      });

      useDroneStore.getState().removeWaypoint(1001);
      const { plannedWaypoints } = useDroneStore.getState();

      expect(plannedWaypoints).toHaveLength(1);
      expect(plannedWaypoints[0].lat).toBe(40);
    });

    it('does nothing if id does not exist', () => {
      useDroneStore.getState().addWaypoint(10, 20, 30);
      useDroneStore.getState().removeWaypoint(999999);

      expect(useDroneStore.getState().plannedWaypoints).toHaveLength(1);
    });
  });

  describe('clearWaypoints', () => {
    it('empties the plannedWaypoints array', () => {
      useDroneStore.getState().addWaypoint(1, 2, 3);
      useDroneStore.getState().addWaypoint(4, 5, 6);
      expect(useDroneStore.getState().plannedWaypoints).toHaveLength(2);

      useDroneStore.getState().clearWaypoints();
      expect(useDroneStore.getState().plannedWaypoints).toEqual([]);
    });
  });

  describe('setTheme', () => {
    it('updates the theme', () => {
      useDroneStore.getState().setTheme('light');
      expect(useDroneStore.getState().theme).toBe('light');
    });

    it('persists theme to localStorage', () => {
      useDroneStore.getState().setTheme('light');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('pyxus-theme', 'light');
    });
  });

  describe('registerDrone', () => {
    it('registers a new drone with initial state', () => {
      useDroneStore.getState().registerDrone('drone-1', 'TestDrone', 'udp:14550');
      const { drones, activeDroneId } = useDroneStore.getState();

      expect(drones['drone-1']).toBeDefined();
      expect(drones['drone-1'].name).toBe('TestDrone');
      expect(drones['drone-1'].connectionString).toBe('udp:14550');
      expect(drones['drone-1'].trail).toEqual([]);
      expect(drones['drone-1'].params).toEqual({});
      // Auto-selects first drone
      expect(activeDroneId).toBe('drone-1');
    });

    it('auto-selects first drone but keeps selection for subsequent drones', () => {
      useDroneStore.getState().registerDrone('drone-1', 'First', 'udp:14550');
      useDroneStore.getState().registerDrone('drone-2', 'Second', 'udp:14551');

      expect(useDroneStore.getState().activeDroneId).toBe('drone-1');
      expect(Object.keys(useDroneStore.getState().drones)).toHaveLength(2);
    });

    it('initializes drone visibility defaults', () => {
      useDroneStore.getState().registerDrone('drone-1', 'Test', 'udp:14550');
      const { droneVisibility } = useDroneStore.getState();

      expect(droneVisibility['drone-1']).toEqual({ trail: true, mission: true, fence: true });
    });
  });

  describe('removeDrone', () => {
    it('removes a drone from state', () => {
      useDroneStore.getState().registerDrone('drone-1', 'First', 'udp:14550');
      useDroneStore.getState().registerDrone('drone-2', 'Second', 'udp:14551');
      useDroneStore.getState().removeDrone('drone-1');

      const { drones, activeDroneId } = useDroneStore.getState();
      expect(drones['drone-1']).toBeUndefined();
      expect(Object.keys(drones)).toHaveLength(1);
      // Should auto-switch active to remaining drone
      expect(activeDroneId).toBe('drone-2');
    });

    it('sets activeDroneId to null when last drone is removed', () => {
      useDroneStore.getState().registerDrone('drone-1', 'Only', 'udp:14550');
      useDroneStore.getState().removeDrone('drone-1');

      expect(useDroneStore.getState().activeDroneId).toBeNull();
      expect(useDroneStore.getState().drones).toEqual({});
    });

    it('removes drone visibility entry', () => {
      useDroneStore.getState().registerDrone('drone-1', 'Test', 'udp:14550');
      useDroneStore.getState().removeDrone('drone-1');

      expect(useDroneStore.getState().droneVisibility['drone-1']).toBeUndefined();
    });
  });
});
