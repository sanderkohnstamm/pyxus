import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Gamepad2, Radio } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import { droneApi } from '../utils/api';

const BUTTON_NAMES = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT',
  'Back', 'Start', 'L3', 'R3',
  'D-Up', 'D-Down', 'D-Left', 'D-Right',
];

// Extended axis names for transmitters with more channels
const AXIS_NAMES = ['Axis 0', 'Axis 1', 'Axis 2', 'Axis 3', 'Axis 4', 'Axis 5', 'Axis 6', 'Axis 7'];

// Known transmitter/controller patterns for display names
const DEVICE_PATTERNS = [
  { match: /tx16s/i, name: 'RadioMaster TX16S', type: 'transmitter' },
  { match: /tx12/i, name: 'RadioMaster TX12', type: 'transmitter' },
  { match: /zorro/i, name: 'RadioMaster Zorro', type: 'transmitter' },
  { match: /boxer/i, name: 'RadioMaster Boxer', type: 'transmitter' },
  { match: /jumper.*t-?pro/i, name: 'Jumper T-Pro', type: 'transmitter' },
  { match: /jumper.*t-?lite/i, name: 'Jumper T-Lite', type: 'transmitter' },
  { match: /taranis/i, name: 'FrSky Taranis', type: 'transmitter' },
  { match: /qx7/i, name: 'FrSky QX7', type: 'transmitter' },
  { match: /horus/i, name: 'FrSky Horus', type: 'transmitter' },
  { match: /spektrum/i, name: 'Spektrum', type: 'transmitter' },
  { match: /flysky/i, name: 'FlySky', type: 'transmitter' },
  { match: /xbox/i, name: 'Xbox Controller', type: 'gamepad' },
  { match: /playstation|dualshock|dualsense/i, name: 'PlayStation Controller', type: 'gamepad' },
  { match: /nintendo|pro controller/i, name: 'Nintendo Controller', type: 'gamepad' },
  { match: /logitech/i, name: 'Logitech Controller', type: 'gamepad' },
];

function getDeviceInfo(rawId) {
  for (const pattern of DEVICE_PATTERNS) {
    if (pattern.match.test(rawId)) {
      return { name: pattern.name, type: pattern.type, raw: rawId };
    }
  }
  // Try to extract a cleaner name from the raw ID
  const cleanName = rawId.split('(')[0].trim().substring(0, 30);
  return { name: cleanName || rawId, type: 'unknown', raw: rawId };
}

const BUTTON_ACTIONS = [
  { value: 'none', label: 'None' },
  { value: 'arm', label: 'Arm' },
  { value: 'disarm', label: 'Disarm' },
  { value: 'toggle_arm', label: 'Toggle Arm' },
  { value: 'takeoff', label: 'Takeoff' },
  { value: 'land', label: 'Land' },
  { value: 'rtl', label: 'RTL' },
  { value: 'mission_start', label: 'Mission Start' },
  { value: 'mission_pause', label: 'Mission Pause' },
  // ArduPilot Copter modes
  { value: 'mode:STABILIZE', label: 'AP Copter: Stabilize' },
  { value: 'mode:ALT_HOLD', label: 'AP Copter: Alt Hold' },
  { value: 'mode:LOITER', label: 'AP Copter: Loiter' },
  { value: 'mode:POSHOLD', label: 'AP Copter: PosHold' },
  { value: 'mode:GUIDED', label: 'AP Copter: Guided' },
  { value: 'mode:AUTO', label: 'AP Copter: Auto' },
  { value: 'mode:RTL', label: 'AP Copter: RTL' },
  { value: 'mode:SMART_RTL', label: 'AP Copter: Smart RTL' },
  { value: 'mode:LAND', label: 'AP Copter: Land' },
  { value: 'mode:BRAKE', label: 'AP Copter: Brake' },
  { value: 'mode:ACRO', label: 'AP Copter: Acro' },
  { value: 'mode:SPORT', label: 'AP Copter: Sport' },
  { value: 'mode:CIRCLE', label: 'AP Copter: Circle' },
  { value: 'mode:AUTOTUNE', label: 'AP Copter: Autotune' },
  { value: 'mode:DRIFT', label: 'AP Copter: Drift' },
  // ArduPilot Plane modes
  { value: 'mode:MANUAL', label: 'AP Plane: Manual' },
  { value: 'mode:FBWA', label: 'AP Plane: FBWA' },
  { value: 'mode:FBWB', label: 'AP Plane: FBWB' },
  { value: 'mode:CRUISE', label: 'AP Plane: Cruise' },
  { value: 'mode:TRAINING', label: 'AP Plane: Training' },
  { value: 'mode:AUTO', label: 'AP Plane: Auto' },
  { value: 'mode:RTL', label: 'AP Plane: RTL' },
  { value: 'mode:LOITER', label: 'AP Plane: Loiter' },
  { value: 'mode:GUIDED', label: 'AP Plane: Guided' },
  { value: 'mode:CIRCLE', label: 'AP Plane: Circle' },
  { value: 'mode:TAKEOFF', label: 'AP Plane: Takeoff' },
  { value: 'mode:QSTABILIZE', label: 'AP Plane: QStabilize' },
  { value: 'mode:QHOVER', label: 'AP Plane: QHover' },
  { value: 'mode:QLOITER', label: 'AP Plane: QLoiter' },
  { value: 'mode:QLAND', label: 'AP Plane: QLand' },
  { value: 'mode:QRTL', label: 'AP Plane: QRTL' },
  // ArduPilot Rover modes
  { value: 'mode:MANUAL', label: 'AP Rover: Manual' },
  { value: 'mode:HOLD', label: 'AP Rover: Hold' },
  { value: 'mode:STEERING', label: 'AP Rover: Steering' },
  { value: 'mode:FOLLOW', label: 'AP Rover: Follow' },
  { value: 'mode:SIMPLE', label: 'AP Rover: Simple' },
  { value: 'mode:AUTO', label: 'AP Rover: Auto' },
  { value: 'mode:RTL', label: 'AP Rover: RTL' },
  { value: 'mode:GUIDED', label: 'AP Rover: Guided' },
  { value: 'mode:LOITER', label: 'AP Rover: Loiter' },
  { value: 'mode:SMART_RTL', label: 'AP Rover: Smart RTL' },
  // ArduPilot Sub modes
  { value: 'mode:STABILIZE', label: 'AP Sub: Stabilize' },
  { value: 'mode:ALT_HOLD', label: 'AP Sub: Alt Hold' },
  { value: 'mode:MANUAL', label: 'AP Sub: Manual' },
  { value: 'mode:AUTO', label: 'AP Sub: Auto' },
  { value: 'mode:GUIDED', label: 'AP Sub: Guided' },
  { value: 'mode:SURFACE', label: 'AP Sub: Surface' },
  { value: 'mode:POSHOLD', label: 'AP Sub: PosHold' },
  // PX4 modes
  { value: 'mode:MANUAL', label: 'PX4: Manual' },
  { value: 'mode:STABILIZED', label: 'PX4: Stabilized' },
  { value: 'mode:ALTCTL', label: 'PX4: Altitude' },
  { value: 'mode:POSCTL', label: 'PX4: Position' },
  { value: 'mode:OFFBOARD', label: 'PX4: Offboard' },
  { value: 'mode:AUTO_MISSION', label: 'PX4: Mission' },
  { value: 'mode:AUTO_RTL', label: 'PX4: RTL' },
  { value: 'mode:AUTO_LAND', label: 'PX4: Land' },
  { value: 'mode:AUTO_LOITER', label: 'PX4: Loiter' },
  { value: 'mode:AUTO_TAKEOFF', label: 'PX4: Takeoff' },
  { value: 'mode:ACRO', label: 'PX4: Acro' },
];

const AXIS_CHANNELS = [
  { value: 'none', label: 'None' },
  { value: 'roll', label: 'Roll' },
  { value: 'pitch', label: 'Pitch' },
  { value: 'throttle', label: 'Throttle' },
  { value: 'yaw', label: 'Yaw' },
];

const DEFAULT_CONFIG = {
  buttonMappings: {},
  axisMappings: {
    0: { channel: 'yaw', inverted: false, deadzone: 0.1 },
    1: { channel: 'throttle', inverted: true, deadzone: 0.1 },
    2: { channel: 'roll', inverted: false, deadzone: 0.1 },
    3: { channel: 'pitch', inverted: true, deadzone: 0.1 },
  },
};

function loadConfig() {
  try {
    const saved = localStorage.getItem('pyxus-gamepad-config');
    if (saved) return JSON.parse(saved);
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  localStorage.setItem('pyxus-gamepad-config', JSON.stringify(config));
  // Also persist to backend settings
  fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gamepad: config }),
  }).catch(() => {});
}

export default function GamepadPanel() {
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const gamepadEnabled = useDroneStore((s) => s.gamepadEnabled);
  const setGamepadEnabled = useDroneStore((s) => s.setGamepadEnabled);
  const addAlert = useDroneStore((s) => s.addAlert);
  const isConnected = !!activeDroneId;

  const [gamepads, setGamepads] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [config, setConfig] = useState(loadConfig);
  const [liveAxes, setLiveAxes] = useState([]);
  const [liveButtons, setLiveButtons] = useState([]);

  const prevButtonsRef = useRef({});
  const pollFrameRef = useRef(null);

  // Scan for gamepads/transmitters
  const scanGamepads = useCallback(() => {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const connected = [];
    for (let i = 0; i < gps.length; i++) {
      if (gps[i]) {
        const info = getDeviceInfo(gps[i].id);
        connected.push({
          index: i,
          id: gps[i].id,
          name: info.name,
          type: info.type,
          axisCount: gps[i].axes.length,
          buttonCount: gps[i].buttons.length,
        });
      }
    }
    setGamepads(connected);
  }, []);

  useEffect(() => {
    scanGamepads();
    const onConnect = () => scanGamepads();
    const onDisconnect = () => scanGamepads();
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, [scanGamepads]);

  // Save config on change
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  const updateButtonMapping = useCallback((btnIndex, action) => {
    setConfig((prev) => ({
      ...prev,
      buttonMappings: { ...prev.buttonMappings, [btnIndex]: action },
    }));
  }, []);

  const updateAxisMapping = useCallback((axisIndex, field, value) => {
    setConfig((prev) => ({
      ...prev,
      axisMappings: {
        ...prev.axisMappings,
        [axisIndex]: { ...(prev.axisMappings[axisIndex] || { channel: 'none', inverted: false, deadzone: 0.1 }), [field]: value },
      },
    }));
  }, []);

  // Execute button action
  const executeAction = useCallback(async (action) => {
    if (!action || action === 'none' || !isConnected) return;

    if (action.startsWith('mode:')) {
      const mode = action.slice(5);
      try {
        await fetch(droneApi('/api/mode'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
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
      const state = useDroneStore.getState();
      const droneId = state.activeDroneId;
      const armed = droneId ? state.drones[droneId]?.telemetry?.armed : false;
      const ep = armed ? 'disarm' : 'arm';
      try {
        await fetch(droneApi(`/api/${ep}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action === 'takeoff' ? { alt: 10 } : {}),
        });
      } catch {}
      return;
    }

    const ep = endpoints[action];
    if (ep) {
      try {
        await fetch(droneApi(`/api/${ep}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action === 'takeoff' ? { alt: 10 } : {}),
        });
      } catch {}
    }
  }, [isConnected]);

  // Polling loop for live display + button actions
  useEffect(() => {
    let running = true;
    const poll = () => {
      if (!running) return;
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gps[selectedIndex];
      if (gp) {
        // Live axes
        setLiveAxes(Array.from(gp.axes));
        // Live buttons
        setLiveButtons(Array.from(gp.buttons).map((b) => b.value));

        // Button press detection (edge trigger)
        if (gamepadEnabled && isConnected) {
          const prev = prevButtonsRef.current;
          for (let i = 0; i < gp.buttons.length; i++) {
            const pressed = gp.buttons[i].pressed;
            if (pressed && !prev[i]) {
              const action = config.buttonMappings[i];
              if (action && action !== 'none') {
                executeAction(action);
              }
            }
            prev[i] = pressed;
          }
        }
      } else {
        setLiveAxes([]);
        setLiveButtons([]);
      }
      pollFrameRef.current = requestAnimationFrame(poll);
    };
    poll();
    return () => {
      running = false;
      if (pollFrameRef.current) cancelAnimationFrame(pollFrameRef.current);
    };
  }, [selectedIndex, gamepadEnabled, isConnected, config.buttonMappings, executeAction]);

  // Note: RC override sending is handled globally in App.jsx
  // This panel only handles configuration and button actions

  const inputCls = 'w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded-md px-2 py-1 text-[10px] focus:outline-none focus:border-cyan-500/50 transition-colors';

  return (
    <div className="p-4 space-y-3">
      {/* Gamepad detection */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <Gamepad2 size={11} className="text-gray-600" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Controller</span>
          </div>
          <button
            onClick={() => setGamepadEnabled(!gamepadEnabled)}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              gamepadEnabled ? 'bg-cyan-600' : 'bg-gray-700'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                gamepadEnabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>
        <div className="text-[9px] text-gray-600 mb-2">Enabling controller will disable keyboard input</div>

        {gamepads.length === 0 ? (
          <div className="text-[10px] text-gray-600 italic text-center py-2">
            No controller detected — press a button to connect
          </div>
        ) : (
          <>
            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(parseInt(e.target.value))}
              className={inputCls}
            >
              {gamepads.map((gp) => (
                <option key={gp.index} value={gp.index}>
                  {gp.name}
                </option>
              ))}
            </select>
            {gamepads[selectedIndex] && (
              <div className="mt-2 flex items-center gap-2 text-[9px]">
                <span className={`px-1.5 py-0.5 rounded ${
                  gamepads[selectedIndex].type === 'transmitter'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                }`}>
                  <Radio size={8} className="inline mr-1" />
                  {gamepads[selectedIndex].type === 'transmitter' ? 'Transmitter' : 'Gamepad'}
                </span>
                <span className="text-gray-500">
                  {gamepads[selectedIndex].axisCount} axes, {gamepads[selectedIndex].buttonCount} buttons
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Live axes visualization */}
      {liveAxes.length > 0 && (
        <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Sticks</span>
            {gamepadEnabled && isConnected && (
              <span className="flex items-center gap-1 text-[9px] text-cyan-400">
                <Radio size={9} className="animate-pulse" />
                Sending RC
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Left stick */}
            <div className="flex flex-col items-center gap-1">
              <div className="relative w-16 h-16 bg-gray-900/60 rounded-full border border-gray-700/30">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="absolute w-full h-px bg-gray-700/40" />
                  <div className="absolute h-full w-px bg-gray-700/40" />
                </div>
                <div
                  className="absolute w-3 h-3 bg-cyan-400 rounded-full shadow-lg shadow-cyan-500/30 transition-all duration-75"
                  style={{
                    left: `${50 + (liveAxes[0] || 0) * 40}%`,
                    top: `${50 + (liveAxes[1] || 0) * 40}%`,
                    transform: 'translate(-50%,-50%)',
                  }}
                />
              </div>
              <span className="text-[9px] text-gray-600">Left</span>
            </div>
            {/* Right stick */}
            <div className="flex flex-col items-center gap-1">
              <div className="relative w-16 h-16 bg-gray-900/60 rounded-full border border-gray-700/30">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="absolute w-full h-px bg-gray-700/40" />
                  <div className="absolute h-full w-px bg-gray-700/40" />
                </div>
                <div
                  className="absolute w-3 h-3 bg-cyan-400 rounded-full shadow-lg shadow-cyan-500/30 transition-all duration-75"
                  style={{
                    left: `${50 + (liveAxes[2] || 0) * 40}%`,
                    top: `${50 + (liveAxes[3] || 0) * 40}%`,
                    transform: 'translate(-50%,-50%)',
                  }}
                />
              </div>
              <span className="text-[9px] text-gray-600">Right</span>
            </div>
          </div>
          {/* Additional axes for transmitters (switches, sliders) */}
          {liveAxes.length > 4 && (
            <div className="mt-3 pt-3 border-t border-gray-800/50 space-y-1.5">
              <span className="text-[9px] text-gray-600">Aux Channels</span>
              <div className="grid grid-cols-2 gap-2">
                {liveAxes.slice(4).map((val, i) => (
                  <div key={i + 4} className="flex items-center gap-1.5">
                    <span className="text-[9px] text-gray-500 w-6">Ch{i + 5}</span>
                    <div className="flex-1 h-1.5 bg-gray-800/80 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-400/70 transition-all"
                        style={{ width: `${((val + 1) / 2) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Axis mappings */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Axis Mapping</span>
        </div>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {liveAxes.map((_, i) => {
            const mapping = config.axisMappings[i] || { channel: 'none', inverted: false, deadzone: 0.1 };
            const axisValue = liveAxes[i] || 0;
            const isActive = Math.abs(axisValue) > (mapping.deadzone || 0.1);
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span className={`text-[10px] w-10 shrink-0 font-medium ${isActive ? 'text-cyan-300' : 'text-gray-500'}`}>
                  {AXIS_NAMES[i] || `Axis ${i}`}
                </span>
                <div className="w-8 h-1.5 bg-gray-800/80 rounded-full overflow-hidden shrink-0">
                  <div
                    className={`h-full transition-all ${isActive ? 'bg-cyan-400' : 'bg-gray-600'}`}
                    style={{ width: `${((axisValue + 1) / 2) * 100}%` }}
                  />
                </div>
                <select
                  value={mapping.channel}
                  onChange={(e) => updateAxisMapping(i, 'channel', e.target.value)}
                  className="flex-1 bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded px-1.5 py-1 text-[10px] focus:outline-none focus:border-cyan-500/50"
                >
                  {AXIS_CHANNELS.map((ch) => (
                    <option key={ch.value} value={ch.value}>{ch.label}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={mapping.inverted}
                    onChange={(e) => updateAxisMapping(i, 'inverted', e.target.checked)}
                    className="w-3 h-3 rounded border-gray-600 bg-gray-800 text-cyan-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-[9px] text-gray-500">Inv</span>
                </label>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9px] text-gray-600">DZ</span>
                  <input
                    type="range"
                    min={0}
                    max={0.4}
                    step={0.05}
                    value={mapping.deadzone}
                    onChange={(e) => updateAxisMapping(i, 'deadzone', parseFloat(e.target.value))}
                    className="w-10 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full"
                  />
                </div>
              </div>
            );
          })}
          {liveAxes.length === 0 && (
            <div className="text-[10px] text-gray-600 italic text-center py-2">
              Connect a controller to configure axes
            </div>
          )}
        </div>
      </div>

      {/* Button mappings */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Button Mapping</span>
        </div>
        <div className="space-y-1">
          {BUTTON_NAMES.map((name, i) => {
            const action = config.buttonMappings[i] || 'none';
            const isPressed = liveButtons[i] > 0.5;
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span
                  className={`text-[10px] w-10 shrink-0 font-medium ${
                    isPressed ? 'text-cyan-300' : 'text-gray-500'
                  }`}
                >
                  {name}
                </span>
                <div
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isPressed ? 'bg-cyan-400' : 'bg-gray-700'
                  }`}
                />
                <select
                  value={action}
                  onChange={(e) => updateButtonMapping(i, e.target.value)}
                  className="flex-1 bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-cyan-500/50"
                >
                  {BUTTON_ACTIONS.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={() => {
          setConfig({ ...DEFAULT_CONFIG });
          addAlert('Controller config reset to defaults', 'info');
        }}
        className="w-full py-1.5 rounded-md text-[10px] font-semibold text-gray-500 hover:text-gray-300 bg-gray-800/40 hover:bg-gray-800/60 border border-gray-700/40 transition-all"
      >
        Reset to Defaults
      </button>
    </div>
  );
}
