import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Gamepad2 } from 'lucide-react';
import useDroneStore from '../store/droneStore';

const BUTTON_NAMES = [
  'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT',
  'Back', 'Start', 'L3', 'R3',
  'D-Up', 'D-Down', 'D-Left', 'D-Right',
];

const AXIS_NAMES = ['Left X', 'Left Y', 'Right X', 'Right Y'];

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
  { value: 'mode:STABILIZE', label: 'Stabilize' },
  { value: 'mode:ALT_HOLD', label: 'Alt Hold' },
  { value: 'mode:LOITER', label: 'Loiter' },
  { value: 'mode:GUIDED', label: 'Guided' },
  { value: 'mode:AUTO', label: 'Auto' },
  { value: 'mode:RTL', label: 'RTL Mode' },
  { value: 'mode:LAND', label: 'Land Mode' },
  { value: 'mode:POSHOLD', label: 'PosHold' },
];

const AXIS_CHANNELS = [
  { value: 'none', label: 'None' },
  { value: 'roll', label: 'Roll' },
  { value: 'pitch', label: 'Pitch' },
  { value: 'throttle', label: 'Throttle' },
  { value: 'yaw', label: 'Yaw' },
];

const RC_CENTER = 1500;
const RC_RANGE = 500;
const RC_MIN = 1000;
const RC_MAX = 2000;
const SEND_RATE = 50; // 20Hz

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

export default function GamepadPanel({ sendMessage }) {
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const gamepadEnabled = useDroneStore((s) => s.gamepadEnabled);
  const setGamepadEnabled = useDroneStore((s) => s.setGamepadEnabled);
  const addAlert = useDroneStore((s) => s.addAlert);
  const isConnected = connectionStatus === 'connected';

  const [gamepads, setGamepads] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [config, setConfig] = useState(loadConfig);
  const [liveAxes, setLiveAxes] = useState([]);
  const [liveButtons, setLiveButtons] = useState([]);

  const prevButtonsRef = useRef({});
  const sendIntervalRef = useRef(null);
  const pollFrameRef = useRef(null);

  // Scan for gamepads
  const scanGamepads = useCallback(() => {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const connected = [];
    for (let i = 0; i < gps.length; i++) {
      if (gps[i]) connected.push({ index: i, id: gps[i].id });
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
        await fetch('/api/mode', {
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
      const armed = useDroneStore.getState().telemetry.armed;
      const ep = armed ? 'disarm' : 'arm';
      try {
        await fetch(`/api/${ep}`, {
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
        await fetch(`/api/${ep}`, {
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

  // RC override send loop
  useEffect(() => {
    if (!gamepadEnabled || !isConnected || !sendMessage) {
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
        sendIntervalRef.current = null;
      }
      return;
    }

    sendIntervalRef.current = setInterval(() => {
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gps[selectedIndex];
      if (!gp) return;

      let roll = RC_CENTER;
      let pitch = RC_CENTER;
      let throttle = RC_CENTER;
      let yaw = RC_CENTER;

      const channels = { roll, pitch, throttle, yaw };

      for (let i = 0; i < gp.axes.length; i++) {
        const mapping = config.axisMappings[i];
        if (!mapping || mapping.channel === 'none') continue;

        let val = gp.axes[i];
        const dz = mapping.deadzone || 0.1;
        if (Math.abs(val) < dz) val = 0;
        if (mapping.inverted) val = -val;

        const rc = RC_CENTER + Math.round(val * RC_RANGE);
        channels[mapping.channel] = Math.max(RC_MIN, Math.min(RC_MAX, rc));
      }

      sendMessage({
        type: 'rc_override',
        channels: [channels.roll, channels.pitch, channels.throttle, channels.yaw],
      });
    }, SEND_RATE);

    return () => {
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
        sendIntervalRef.current = null;
      }
    };
  }, [gamepadEnabled, isConnected, selectedIndex, config.axisMappings, sendMessage]);

  const inputCls = 'w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded-md px-2 py-1 text-[10px] focus:outline-none focus:border-cyan-500/50 transition-colors';

  return (
    <div className="p-4 space-y-3">
      {/* Gamepad detection */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center justify-between mb-2">
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

        {gamepads.length === 0 ? (
          <div className="text-[10px] text-gray-600 italic text-center py-2">
            No controller detected — press a button to connect
          </div>
        ) : (
          <select
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(parseInt(e.target.value))}
            className={inputCls}
          >
            {gamepads.map((gp) => (
              <option key={gp.index} value={gp.index}>
                {gp.id}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Live axes visualization */}
      {liveAxes.length > 0 && (
        <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Sticks</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Left stick */}
            <div className="flex flex-col items-center gap-1">
              <div className="relative w-16 h-16 bg-gray-900/60 rounded-full border border-gray-700/30">
                <div
                  className="absolute w-3 h-3 bg-cyan-400 rounded-full"
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
                <div
                  className="absolute w-3 h-3 bg-cyan-400 rounded-full"
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
        </div>
      )}

      {/* Axis mappings */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Axis Mapping</span>
        </div>
        <div className="space-y-1.5">
          {AXIS_NAMES.map((name, i) => {
            const mapping = config.axisMappings[i] || { channel: 'none', inverted: false, deadzone: 0.1 };
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-400 w-12 shrink-0">{name}</span>
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
