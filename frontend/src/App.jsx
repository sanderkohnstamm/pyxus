import React, { useEffect, useCallback, useRef } from 'react';
import useWebSocket from './hooks/useWebSocket';
import useDroneStore from './store/droneStore';
import { INITIAL_TELEMETRY } from './store/droneStore';
import { droneApi, fetchWithTimeout, apiUrl } from './utils/api';
import { getCommandConfirmation } from './utils/commandSafety';

const RC_CENTER = 1500;
const RC_MIN = 1000;
const RC_MAX = 2000;
const RC_RANGE = 500;
const RC_SEND_RATE = 50; // 20Hz

// Load gamepad config from localStorage
function loadGamepadConfig() {
  try {
    const saved = localStorage.getItem('pyxus-gamepad-config');
    if (saved) return JSON.parse(saved);
  } catch {}
  return {
    buttonMappings: {},
    axisMappings: {
      0: { channel: 'yaw', inverted: false, deadzone: 0.1 },
      1: { channel: 'throttle', inverted: true, deadzone: 0.1 },
      2: { channel: 'roll', inverted: false, deadzone: 0.1 },
      3: { channel: 'pitch', inverted: true, deadzone: 0.1 },
    },
  };
}

// Direct gamepad action execution (no confirmation)
async function executeGamepadActionDirect(action, addAlert) {
  if (!action || action === 'none') return;

  if (action.startsWith('mode:')) {
    const mode = action.slice(5);
    try {
      await fetchWithTimeout(droneApi('/api/mode'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      addAlert(`Mode: ${mode}`, 'info');
    } catch {}
    return;
  }

  const endpoints = {
    arm: 'arm',
    disarm: 'disarm',
    takeoff: 'takeoff',
    land: 'land',
    rtl: 'rtl',
    mission_start: 'mission/start',
    mission_pause: 'mission/pause',
  };

  if (action === 'toggle_arm') {
    const store = useDroneStore.getState();
    const activeDrone = store.activeDroneId ? store.drones[store.activeDroneId] : null;
    const armed = activeDrone?.telemetry?.armed || false;
    const ep = armed ? 'disarm' : 'arm';
    try {
      await fetchWithTimeout(droneApi(`/api/${ep}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      addAlert(`${ep === 'arm' ? 'Armed' : 'Disarmed'}`, 'info');
    } catch {}
    return;
  }

  const ep = endpoints[action];
  if (ep) {
    try {
      await fetchWithTimeout(droneApi(`/api/${ep}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'takeoff' ? { alt: 10 } : {}),
      });
      addAlert(`Command: ${action}`, 'info');
    } catch {}
  }
}

// Gated gamepad action execution (with confirmation dialog if needed)
function executeGamepadAction(action, addAlert) {
  if (!action || action === 'none') return;

  const store = useDroneStore.getState();
  if (store.confirmDangerousCommands) {
    const activeDrone = store.activeDroneId ? store.drones[store.activeDroneId] : null;
    const tel = activeDrone?.telemetry || INITIAL_TELEMETRY;

    let command = action;
    if (action === 'toggle_arm') {
      command = tel.armed ? 'disarm' : 'arm';
    }

    const confirmation = getCommandConfirmation(command, tel);
    if (confirmation) {
      store.showConfirmationDialog({ ...confirmation, onConfirm: () => executeGamepadActionDirect(action, addAlert) });
      return;
    }
  }
  executeGamepadActionDirect(action, addAlert);
}

import MapView from './components/Map';
import FloatingStatusBar from './components/FloatingStatusBar';
import DronePopover from './components/DronePopover';
import MenuPanel from './components/MenuPanel';
import FloatingActionBar from './components/FloatingActionBar';
import FloatingPlanBar from './components/FloatingPlanBar';
import BatteryMonitor from './components/BatteryMonitor';
import ConnectionMonitor from './components/ConnectionMonitor';
import ConfirmationDialog from './components/ConfirmationDialog';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  const { sendMessage } = useWebSocket();
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const commandHotkeys = useDroneStore((s) => s.commandHotkeys);
  const servoGroups = useDroneStore((s) => s.servoGroups);
  const setServoGroupState = useDroneStore((s) => s.setServoGroupState);
  const addAlertStore = useDroneStore((s) => s.addAlert);
  const telemetry = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : INITIAL_TELEMETRY) || INITIAL_TELEMETRY;
  const homePosition = useDroneStore((s) => s.homePosition);
  const setHomePosition = useDroneStore((s) => s.setHomePosition);
  const heartbeatAge = telemetry.heartbeat_age;
  const isConnected = !!activeDroneId && heartbeatAge >= 0;

  // UI state
  const activeTab = useDroneStore((s) => s.activeTab);
  const menuOpen = useDroneStore((s) => s.menuOpen);
  const closeMenu = useDroneStore((s) => s.closeMenu);
  const dronePopoverOpen = useDroneStore((s) => s.dronePopoverOpen);
  const closeDronePopover = useDroneStore((s) => s.closeDronePopover);
  const alerts = useDroneStore((s) => s.alerts);
  const theme = useDroneStore((s) => s.theme);
  const colorScheme = useDroneStore((s) => s.colorScheme);

  // Video state
  const videoUrl = useDroneStore((s) => s.videoUrl);
  const videoActive = useDroneStore((s) => s.videoActive);
  const streamUrl = videoActive && videoUrl
    ? apiUrl(`/api/video/stream?url=${encodeURIComponent(videoUrl)}`)
    : null;

  // Bootstrap: load settings + discover already-connected drones
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settingsRes = await fetch('/api/settings');
        const settingsData = await settingsRes.json();
        if (!cancelled && settingsData.status === 'ok') {
          const s = settingsData.settings;
          const store = useDroneStore.getState();
          if (s.flight) {
            if (s.flight.default_alt) store.setDefaultAlt(s.flight.default_alt);
            if (s.flight.default_speed) store.setDefaultSpeed(s.flight.default_speed);
            if (s.flight.takeoff_alt) store.setTakeoffAlt(s.flight.takeoff_alt);
          }
          if (s.video?.url) store.setVideoUrl(s.video.url);
        }
      } catch {}
      try {
        const res = await fetch('/api/drones');
        const data = await res.json();
        if (!cancelled && data.status === 'ok' && data.drones?.length > 0) {
          const store = useDroneStore.getState();
          for (const d of data.drones) {
            store.registerDrone(d.drone_id, d.name, d.connection_string);
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Update home position from vehicle's HOME_POSITION message
  useEffect(() => {
    if (isConnected && telemetry.home_lat && telemetry.home_lon &&
        telemetry.home_lat !== 0 && telemetry.home_lon !== 0) {
      if (!homePosition ||
          homePosition.lat !== telemetry.home_lat ||
          homePosition.lon !== telemetry.home_lon) {
        setHomePosition({ lat: telemetry.home_lat, lon: telemetry.home_lon, alt: telemetry.home_alt || 0 });
      }
    }
  }, [isConnected, telemetry.home_lat, telemetry.home_lon, telemetry.home_alt, homePosition, setHomePosition]);

  // Direct command execution (no confirmation)
  const executeCommandDirect = useCallback(async (command) => {
    if (!isConnected) return;
    try {
      if (command.startsWith('mode:')) {
        const mode = command.slice(5);
        await fetchWithTimeout(droneApi('/api/mode'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        addAlertStore(`Mode: ${mode}`, 'info');
      } else {
        const endpoints = {
          arm: 'arm', disarm: 'disarm', takeoff: 'takeoff', land: 'land',
          rtl: 'rtl', mission_start: 'mission/start', mission_pause: 'mission/pause',
        };
        const ep = endpoints[command];
        if (ep) {
          await fetchWithTimeout(droneApi(`/api/${ep}`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(command === 'takeoff' ? { alt: 10 } : {}),
          });
          addAlertStore(`Command: ${command}`, 'info');
        }
      }
    } catch (err) {
      addAlertStore(`Command failed: ${err.message}`, 'error');
    }
  }, [isConnected, addAlertStore]);

  // Gated command execution (with confirmation dialog if needed)
  const executeCommand = useCallback((command) => {
    if (!isConnected) return;
    const store = useDroneStore.getState();
    if (store.confirmDangerousCommands) {
      const activeDrone = store.activeDroneId ? store.drones[store.activeDroneId] : null;
      const tel = activeDrone?.telemetry || INITIAL_TELEMETRY;
      const confirmation = getCommandConfirmation(command, tel);
      if (confirmation) {
        store.showConfirmationDialog({ ...confirmation, onConfirm: () => executeCommandDirect(command) });
        return;
      }
    }
    executeCommandDirect(command);
  }, [isConnected, executeCommandDirect]);

  // Actuate servo group
  const actuateServoGroup = useCallback(async (group, action) => {
    if (!isConnected) return;
    const servos = group.servos || [{ servo: group.servo, openPwm: group.openPwm, closePwm: group.closePwm }];
    try {
      for (const s of servos) {
        const pwm = action === 'open' ? s.openPwm : s.closePwm;
        await fetchWithTimeout(droneApi('/api/servo/test'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ servo: s.servo, pwm }),
        });
      }
      setServoGroupState(group.id, action === 'open' ? 'open' : 'closed');
      addAlertStore(`${group.name}: ${action === 'open' ? 'Opened' : 'Closed'}`, 'info');
    } catch (err) {
      addAlertStore(`Servo command failed: ${err.message}`, 'error');
    }
  }, [isConnected, setServoGroupState, addAlertStore]);

  // Global hotkey listener
  useEffect(() => {
    if (!isConnected) return;

    const handleKeyDown = (e) => {
      // Shift+Escape: Emergency Stop — works even in inputs
      if (e.shiftKey && e.key === 'Escape') {
        e.preventDefault();
        const store = useDroneStore.getState();
        store.showConfirmationDialog({
          title: 'EMERGENCY STOP',
          message: 'This will immediately kill all motors. The vehicle will fall from the sky. Continue?',
          variant: 'danger',
          doubleConfirm: false,
          onConfirm: async () => {
            try {
              await fetchWithTimeout(droneApi('/api/force_disarm'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              }, 5000);
            } catch {}
            store.addGcsLog('EMERGENCY STOP — force disarm sent', 'error');
            store.addAlert('EMERGENCY STOP — force disarm sent', 'error');
          },
        });
        return;
      }

      // Don't trigger if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      // Escape closes menu
      if (e.key === 'Escape') {
        const store = useDroneStore.getState();
        if (store.menuOpen) { store.closeMenu(); e.preventDefault(); return; }
        if (store.dronePopoverOpen) { store.closeDronePopover(); e.preventDefault(); return; }
      }

      const key = e.key.toLowerCase();

      // Check command hotkeys
      const command = commandHotkeys[key];
      if (command) {
        e.preventDefault();
        executeCommand(command);
        return;
      }

      // Check servo group hotkeys
      for (const group of servoGroups) {
        if (group.openHotkey === key) {
          e.preventDefault();
          actuateServoGroup(group, 'open');
          return;
        }
        if (group.closeHotkey === key) {
          e.preventDefault();
          actuateServoGroup(group, 'close');
          return;
        }
        if (group.hotkey === key) {
          e.preventDefault();
          const newAction = group.state === 'open' ? 'close' : 'open';
          actuateServoGroup(group, newAction);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnected, commandHotkeys, servoGroups, executeCommand, actuateServoGroup]);

  // Gamepad RC override + button handling
  const gamepadEnabled = useDroneStore((s) => s.gamepadEnabled);
  const updateManualControlRc = useDroneStore((s) => s.updateManualControlRc);
  const gamepadIntervalRef = useRef(null);
  const gamepadConfigRef = useRef(loadGamepadConfig());
  const prevButtonsRef = useRef({});

  useEffect(() => {
    gamepadConfigRef.current = loadGamepadConfig();
    prevButtonsRef.current = {};
  }, [gamepadEnabled]);

  useEffect(() => {
    if (!gamepadEnabled) {
      if (gamepadIntervalRef.current) {
        clearInterval(gamepadIntervalRef.current);
        gamepadIntervalRef.current = null;
      }
      return;
    }

    gamepadIntervalRef.current = setInterval(() => {
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      let gp = null;
      for (let i = 0; i < gps.length; i++) {
        if (gps[i]) { gp = gps[i]; break; }
      }
      if (!gp) return;

      const config = gamepadConfigRef.current;
      const channels = { roll: RC_CENTER, pitch: RC_CENTER, throttle: RC_CENTER, yaw: RC_CENTER };

      for (let i = 0; i < gp.axes.length; i++) {
        const mapping = config.axisMappings?.[i];
        if (!mapping || mapping.channel === 'none') continue;
        let val = gp.axes[i];
        const dz = mapping.deadzone || 0.1;
        if (Math.abs(val) < dz) val = 0;
        if (mapping.inverted) val = -val;
        const rc = RC_CENTER + Math.round(val * RC_RANGE);
        channels[mapping.channel] = Math.max(RC_MIN, Math.min(RC_MAX, rc));
      }

      const rcChannels = [channels.roll, channels.pitch, channels.throttle, channels.yaw];

      if (isConnected) {
        sendMessage({ type: 'rc_override', channels: rcChannels });
      }
      updateManualControlRc(rcChannels);

      if (isConnected && config.buttonMappings) {
        const prev = prevButtonsRef.current;
        for (let i = 0; i < gp.buttons.length; i++) {
          const pressed = gp.buttons[i].pressed;
          if (pressed && !prev[i]) {
            const action = config.buttonMappings[i];
            if (action && action !== 'none') {
              executeGamepadAction(action, addAlertStore);
            }
          }
          prev[i] = pressed;
        }
      }
    }, RC_SEND_RATE);

    return () => {
      if (gamepadIntervalRef.current) {
        clearInterval(gamepadIntervalRef.current);
        gamepadIntervalRef.current = null;
      }
    };
  }, [gamepadEnabled, isConnected, sendMessage, updateManualControlRc, addAlertStore]);

  // Keyboard RC override — runs globally so it works even when menu is closed
  const keyboardEnabled = useDroneStore((s) => s.keyboardEnabled);
  const setKeyPressed = useDroneStore((s) => s.setKeyPressed);
  const setManualControlActive = useDroneStore((s) => s.setManualControlActive);
  const keyboardRcRef = useRef(null);

  useEffect(() => {
    if (!keyboardEnabled) return;

    const TRACKED_KEYS = ['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (TRACKED_KEYS.includes(key)) {
        e.preventDefault();
        setKeyPressed(key === ' ' ? 'space' : key, true);
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (TRACKED_KEYS.includes(key)) {
        e.preventDefault();
        setKeyPressed(key === ' ' ? 'space' : key, false);

        if (key === ' ') {
          const store = useDroneStore.getState();
          const activeDrone = store.activeDroneId ? store.drones[store.activeDroneId] : null;
          const tel = activeDrone?.telemetry || INITIAL_TELEMETRY;
          if (tel.armed) {
            if (store.confirmDangerousCommands) {
              const confirmation = getCommandConfirmation('disarm', tel);
              if (confirmation) {
                store.showConfirmationDialog({ ...confirmation, onConfirm: () => executeCommandDirect('disarm') });
                return;
              }
            }
            executeCommandDirect('disarm');
          } else {
            store.setShowPreFlightChecklist(true);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [keyboardEnabled, setKeyPressed, executeCommandDirect]);

  // Keyboard RC send loop at 20Hz
  useEffect(() => {
    if (!keyboardEnabled) {
      if (keyboardRcRef.current) {
        clearInterval(keyboardRcRef.current);
        keyboardRcRef.current = null;
      }
      return;
    }

    const RC_OFFSET = 300;
    keyboardRcRef.current = setInterval(() => {
      const keys = useDroneStore.getState().keysPressed;

      let roll = RC_CENTER, pitch = RC_CENTER, throttle = RC_CENTER, yaw = RC_CENTER;
      if (keys.w) throttle += RC_OFFSET;
      if (keys.s) throttle -= RC_OFFSET;
      if (keys.a) roll -= RC_OFFSET;
      if (keys.d) roll += RC_OFFSET;
      if (keys.q) yaw -= RC_OFFSET;
      if (keys.e) yaw += RC_OFFSET;
      if (keys.r) throttle += RC_OFFSET;
      if (keys.f) throttle -= RC_OFFSET;
      if (keys.arrowup) pitch -= RC_OFFSET;
      if (keys.arrowdown) pitch += RC_OFFSET;
      if (keys.arrowleft) yaw -= RC_OFFSET;
      if (keys.arrowright) yaw += RC_OFFSET;

      roll = Math.max(RC_MIN, Math.min(RC_MAX, roll));
      pitch = Math.max(RC_MIN, Math.min(RC_MAX, pitch));
      throttle = Math.max(RC_MIN, Math.min(RC_MAX, throttle));
      yaw = Math.max(RC_MIN, Math.min(RC_MAX, yaw));

      const channels = [roll, pitch, throttle, yaw];
      if (isConnected) {
        sendMessage({ type: 'rc_override', channels });
      }
      updateManualControlRc(channels);
    }, RC_SEND_RATE);

    return () => {
      if (keyboardRcRef.current) {
        clearInterval(keyboardRcRef.current);
        keyboardRcRef.current = null;
      }
      setManualControlActive(false);
    };
  }, [keyboardEnabled, isConnected, sendMessage, updateManualControlRc, setManualControlActive]);

  // Build class string with theme and color scheme
  const themeClass = theme === 'light' ? 'light' : '';
  const schemeClass = colorScheme !== 'cyan' ? `scheme-${colorScheme}` : '';

  // Determine which floating bar to show based on active view
  const showCommandBar = (activeTab === 'command' || activeTab === 'video') && isConnected && !menuOpen;
  const showPlanBar = activeTab === 'plan' && !menuOpen;

  return (
    <div className={`h-full relative bg-gray-950 text-gray-100 ${themeClass} ${schemeClass}`}>
      {/* Full-screen background — map or video */}
      <div className="absolute inset-0 z-0">
        {activeTab === 'video' ? (
          <div className="w-full h-full bg-black flex items-center justify-center">
            {streamUrl ? (
              <img src={streamUrl} alt="Video feed" className="w-full h-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-3 text-gray-600">
                <span className="text-4xl opacity-20">&#x1F4F9;</span>
                <span className="text-sm">No video feed</span>
                <span className="text-xs opacity-50">Configure video URL in Tools</span>
              </div>
            )}
          </div>
        ) : (
          <ErrorBoundary name="MapView">
            <MapView />
          </ErrorBoundary>
        )}
      </div>

      {/* Floating UI layer */}
      <FloatingStatusBar />

      {/* Drone popover */}
      {dronePopoverOpen && (
        <>
          <div className="fixed inset-0 z-[104]" onClick={closeDronePopover} />
          <DronePopover />
        </>
      )}

      {/* Menu panel with backdrop */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-[93]" onClick={closeMenu} />
          <MenuPanel />
        </>
      )}

      {/* Floating action bar — command and video views */}
      {showCommandBar && <FloatingActionBar />}

      {/* Floating plan bar — plan view */}
      {showPlanBar && <FloatingPlanBar />}

      {/* Alerts overlay */}
      <div className="fixed top-16 left-[140px] z-[101] flex flex-col gap-2 max-w-sm">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl backdrop-blur-xl border ${
              alert.type === 'error'
                ? 'bg-red-950/50 text-red-200/80 border-red-800/20'
                : alert.type === 'success'
                ? 'bg-emerald-950/50 text-emerald-200/80 border-emerald-800/20'
                : alert.type === 'warning'
                ? 'bg-amber-950/50 text-amber-200/80 border-amber-800/20'
                : 'bg-gray-900/50 text-gray-200/80 border-gray-700/20'
            }`}
          >
            {alert.message}
          </div>
        ))}
      </div>

      {/* Headless monitors */}
      <BatteryMonitor />
      <ConnectionMonitor />
      <ConfirmationDialog />
    </div>
  );
}
