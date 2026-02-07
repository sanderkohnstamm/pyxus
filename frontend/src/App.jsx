import React, { useEffect, useCallback, useRef } from 'react';
import { Map as MapIcon, Plane, Wrench, PanelRightClose, PanelRightOpen, AlertTriangle } from 'lucide-react';
import useWebSocket from './hooks/useWebSocket';
import useDroneStore from './store/droneStore';

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

// Execute gamepad button action
async function executeGamepadAction(action, addAlert) {
  if (!action || action === 'none') return;

  if (action.startsWith('mode:')) {
    const mode = action.slice(5);
    try {
      await fetch('/api/mode', {
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
    const armed = useDroneStore.getState().telemetry.armed;
    const ep = armed ? 'disarm' : 'arm';
    try {
      await fetch(`/api/${ep}`, {
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
      await fetch(`/api/${ep}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'takeoff' ? { alt: 10 } : {}),
      });
      addAlert(`Command: ${action}`, 'info');
    } catch {}
  }
}
import ConnectionBar from './components/ConnectionBar';
import MapView from './components/Map';
import Telemetry from './components/Telemetry';
import Controls from './components/Controls';
import MissionPanel from './components/MissionPanel';
import ToolsPanel from './components/ToolsPanel';
import FlyOverlay from './components/FlyOverlay';
import AttitudeIndicator from './components/AttitudeIndicator';
import BatteryMonitor from './components/BatteryMonitor';
import BatteryChart from './components/BatteryChart';

export default function App() {
  const { sendMessage, droneChangeDetected, dismissDroneChange, acceptDroneChange } = useWebSocket();
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const commandHotkeys = useDroneStore((s) => s.commandHotkeys);
  const servoGroups = useDroneStore((s) => s.servoGroups);
  const setServoGroupState = useDroneStore((s) => s.setServoGroupState);
  const addAlertStore = useDroneStore((s) => s.addAlert);
  const telemetry = useDroneStore((s) => s.telemetry);
  const homePosition = useDroneStore((s) => s.homePosition);
  const setHomePosition = useDroneStore((s) => s.setHomePosition);
  const isConnected = connectionStatus === 'connected';

  // Set home position from first valid GPS position
  useEffect(() => {
    if (isConnected && !homePosition && telemetry.lat !== 0 && telemetry.lon !== 0) {
      setHomePosition({ lat: telemetry.lat, lon: telemetry.lon, alt: telemetry.alt_msl });
    }
  }, [isConnected, homePosition, telemetry.lat, telemetry.lon, telemetry.alt_msl, setHomePosition]);

  // Execute command helper
  const executeCommand = useCallback(async (command) => {
    if (!isConnected) return;
    try {
      if (command.startsWith('mode:')) {
        const mode = command.slice(5);
        await fetch('/api/mode', {
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
          await fetch(`/api/${ep}`, {
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

  // Actuate servo group
  const actuateServoGroup = useCallback(async (group, action) => {
    if (!isConnected) return;
    const servos = group.servos || [{ servo: group.servo, openPwm: group.openPwm, closePwm: group.closePwm }];
    try {
      for (const s of servos) {
        const pwm = action === 'open' ? s.openPwm : s.closePwm;
        await fetch('/api/servo/test', {
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
      // Don't trigger if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

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
        // Legacy single hotkey (toggle)
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

  // Gamepad RC override + button handling - runs globally regardless of active tab
  const gamepadEnabled = useDroneStore((s) => s.gamepadEnabled);
  const updateManualControlRc = useDroneStore((s) => s.updateManualControlRc);
  const gamepadIntervalRef = useRef(null);
  const gamepadConfigRef = useRef(loadGamepadConfig());
  const prevButtonsRef = useRef({});

  // Reload config when gamepad is toggled (user may have changed settings)
  useEffect(() => {
    gamepadConfigRef.current = loadGamepadConfig();
    prevButtonsRef.current = {}; // Reset button state on config reload
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
      // Find first connected gamepad
      let gp = null;
      for (let i = 0; i < gps.length; i++) {
        if (gps[i]) {
          gp = gps[i];
          break;
        }
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

      // Only send to drone if connected
      if (isConnected) {
        sendMessage({
          type: 'rc_override',
          channels: rcChannels,
        });
      }
      // Always update visualization
      updateManualControlRc(rcChannels);

      // Button press detection (edge trigger) - only when connected
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

  const alerts = useDroneStore((s) => s.alerts);
  const activeTab = useDroneStore((s) => s.activeTab);
  const setActiveTab = useDroneStore((s) => s.setActiveTab);
  const theme = useDroneStore((s) => s.theme);
  const colorScheme = useDroneStore((s) => s.colorScheme);
  const sidebarCollapsed = useDroneStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useDroneStore((s) => s.toggleSidebar);

  // Build class string with theme and color scheme
  const themeClass = theme === 'light' ? 'light' : '';
  const schemeClass = colorScheme !== 'cyan' ? `scheme-${colorScheme}` : '';

  return (
    <div className={`h-full flex flex-col bg-gray-950 text-gray-100 ${themeClass} ${schemeClass}`}>
      {/* Top bar */}
      <ConnectionBar />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Map */}
        <div className="flex-1 relative">
          <MapView />
          {/* Fly controls overlay */}
          {activeTab === 'flying' && <FlyOverlay />}
        </div>

        {/* Sidebar collapse toggle */}
        <button
          onClick={toggleSidebar}
          className="self-center z-10 -mr-px flex items-center justify-center w-5 h-10 bg-gray-950/50 border border-gray-800/15 rounded-l-md text-gray-500 hover:text-gray-400 transition-colors backdrop-blur-xl"
        >
          {sidebarCollapsed ? <PanelRightOpen size={12} /> : <PanelRightClose size={12} />}
        </button>

        {/* Right: Panels */}
        <div className={`${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-96'} flex flex-col border-l border-gray-800/10 bg-gray-950/15 backdrop-blur-xl transition-all duration-200`}>
          {/* Tab bar */}
          <div className="flex border-b border-gray-800/25 shrink-0">
            {[
              { id: 'planning', label: 'Plan', icon: MapIcon },
              { id: 'flying', label: 'Fly', icon: Plane },
              { id: 'tools', label: 'Tools', icon: Wrench },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-cyan-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <tab.icon size={13} />
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-cyan-400 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'planning' ? (
              <MissionPanel />
            ) : activeTab === 'flying' ? (
              <>
                <Telemetry />
                <BatteryChart />
                <div className="px-4 pb-4">
                  <AttitudeIndicator />
                </div>
                <Controls sendMessage={sendMessage} />
              </>
            ) : (
              <ToolsPanel sendMessage={sendMessage} />
            )}
          </div>
        </div>
      </div>

      {/* Alerts overlay */}
      <div className="fixed top-12 left-4 z-[9999] flex flex-col gap-2 max-w-sm">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-xl backdrop-blur-xl border ${
              alert.type === 'error'
                ? 'bg-red-950/50 text-red-200/80 border-red-800/20'
                : alert.type === 'success'
                ? 'bg-emerald-950/50 text-emerald-200/80 border-emerald-800/20'
                : alert.type === 'warning'
                ? 'bg-amber-950/50 text-amber-200/80 border-amber-800/20'
                : 'bg-sky-950/50 text-sky-200/80 border-sky-800/20'
            }`}
          >
            {alert.message}
          </div>
        ))}
      </div>

      {/* Battery monitor (headless) */}
      <BatteryMonitor />

      {/* Drone change detection modal */}
      {droneChangeDetected && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-amber-500/30 rounded-xl p-6 max-w-md shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle size={20} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-100">Different Vehicle Detected</h3>
                <p className="text-sm text-gray-400">A different vehicle has connected</p>
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-3 mb-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Previous:</span>
                <span className="text-gray-300">{droneChangeDetected.old.platformType || 'Unknown'} ({droneChangeDetected.old.autopilot})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">New:</span>
                <span className="text-amber-300">{droneChangeDetected.new.platformType || 'Unknown'} ({droneChangeDetected.new.autopilot})</span>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              Reloading will clear the current mission plan, drone mission, and parameters. You can also keep the current session if this was expected.
            </p>

            <div className="flex gap-3">
              <button
                onClick={dismissDroneChange}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
              >
                Keep Session
              </button>
              <button
                onClick={acceptDroneChange}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors"
              >
                Reload Connection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
