import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Gamepad2,
  Keyboard,
  MapPin,
  Download,
  Radio,
} from 'lucide-react';
import useDroneStore, { INITIAL_TELEMETRY, EMPTY_ARRAY } from '../store/droneStore';
import { droneApi } from '../utils/api';
import { formatCoord } from '../utils/formatCoord';

const RC_CENTER = 1500;
const RC_OFFSET = 300;
const RC_MIN = 1000;
const RC_MAX = 2000;
const RC_SEND_RATE = 50; // 20Hz

// Modes that accept manual RC input
const MANUAL_MODES = [
  'STABILIZE', 'ALT_HOLD', 'ACRO', 'SPORT', 'LOITER', 'POSHOLD',  // ArduPilot
  'MANUAL', 'ALTCTL', 'POSCTL', 'STABILIZED', 'RATTITUDE',  // PX4
];

const TYPE_LABELS = {
  waypoint: 'WP',
  takeoff: 'TO',
  loiter_unlim: 'LT',
  loiter_turns: 'LN',
  loiter_time: 'LD',
  roi: 'ROI',
  land: 'LND',
};

export default function Controls({ sendMessage }) {
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const telemetry = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : INITIAL_TELEMETRY) || INITIAL_TELEMETRY;
  const keyboardEnabled = useDroneStore((s) => s.keyboardEnabled);
  const setKeyboardEnabled = useDroneStore((s) => s.setKeyboardEnabled);
  const setKeyPressed = useDroneStore((s) => s.setKeyPressed);
  const addAlert = useDroneStore((s) => s.addAlert);
  const droneMission = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.droneMission ?? EMPTY_ARRAY : EMPTY_ARRAY);
  const setDroneMission = useDroneStore((s) => s.setDroneMission);
  const coordFormat = useDroneStore((s) => s.coordFormat);
  const missionSeq = telemetry.mission_seq;
  const autopilot = telemetry.autopilot;

  // Convert mission_seq to 0-based index
  // ArduPilot: seq 0 = home, mission items start at seq 1 -> index = seq - 1
  // PX4: seq 0 = first mission item -> index = seq
  const isArdupilot = autopilot === 'ardupilot';
  const currentWaypointIndex = missionSeq >= 0 ? (isArdupilot ? missionSeq - 1 : missionSeq) : -1;
  const updateManualControlRc = useDroneStore((s) => s.updateManualControlRc);
  const setManualControlActive = useDroneStore((s) => s.setManualControlActive);
  const gamepadEnabled = useDroneStore((s) => s.gamepadEnabled);

  const rcIntervalRef = useRef(null);
  const isConnected = !!activeDroneId;

  const apiCall = useCallback(
    async (endpoint, body = {}) => {
      try {
        const res = await fetch(droneApi(`/api/${endpoint}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.status === 'error') {
          addAlert(data.error || `${endpoint} failed`, 'error');
        }
      } catch (err) {
        addAlert(`${endpoint} failed: ${err.message}`, 'error');
      }
    },
    [addAlert]
  );

  const handleDownload = useCallback(async () => {
    try {
      const res = await fetch(droneApi('/api/mission/download'));
      const data = await res.json();
      if (data.status === 'ok' && data.waypoints) {
        const droneId = useDroneStore.getState().activeDroneId;
        if (droneId) setDroneMission(droneId, data.waypoints);
        addAlert(`Downloaded ${data.waypoints.length} mission items`, 'success');
      } else {
        addAlert('No mission on drone', 'info');
      }
    } catch (err) {
      addAlert(`Download failed: ${err.message}`, 'error');
    }
  }, [setDroneMission, addAlert]);

  // Keyboard event handlers
  useEffect(() => {
    if (!keyboardEnabled) return;

    const TRACKED_KEYS = ['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

    const handleKeyDown = (e) => {
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
          if (telemetry.armed) {
            apiCall('disarm');
          } else {
            apiCall('arm');
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
  }, [keyboardEnabled, setKeyPressed, telemetry.armed, apiCall]);

  // Keyboard RC override send loop at 20Hz
  useEffect(() => {
    if (!keyboardEnabled) {
      if (rcIntervalRef.current) {
        clearInterval(rcIntervalRef.current);
        rcIntervalRef.current = null;
      }
      return;
    }

    rcIntervalRef.current = setInterval(() => {
      const keys = useDroneStore.getState().keysPressed;

      let roll = RC_CENTER;
      let pitch = RC_CENTER;
      let throttle = RC_CENTER;
      let yaw = RC_CENTER;

      // WASD controls: W/S = throttle, A/D = roll (strafe)
      if (keys.w) throttle += RC_OFFSET;
      if (keys.s) throttle -= RC_OFFSET;
      if (keys.a) roll -= RC_OFFSET;
      if (keys.d) roll += RC_OFFSET;
      if (keys.q) yaw -= RC_OFFSET;
      if (keys.e) yaw += RC_OFFSET;
      if (keys.r) throttle += RC_OFFSET;
      if (keys.f) throttle -= RC_OFFSET;

      // Arrow keys: up/down = pitch, left/right = yaw
      if (keys.arrowup) pitch -= RC_OFFSET;
      if (keys.arrowdown) pitch += RC_OFFSET;
      if (keys.arrowleft) yaw -= RC_OFFSET;
      if (keys.arrowright) yaw += RC_OFFSET;

      roll = Math.max(RC_MIN, Math.min(RC_MAX, roll));
      pitch = Math.max(RC_MIN, Math.min(RC_MAX, pitch));
      throttle = Math.max(RC_MIN, Math.min(RC_MAX, throttle));
      yaw = Math.max(RC_MIN, Math.min(RC_MAX, yaw));

      const channels = [roll, pitch, throttle, yaw];

      // Only send to drone if connected
      if (isConnected) {
        sendMessage({
          type: 'rc_override',
          channels,
        });
      }
      // Always update visualization
      updateManualControlRc(channels);
    }, RC_SEND_RATE);

    return () => {
      if (rcIntervalRef.current) {
        clearInterval(rcIntervalRef.current);
        rcIntervalRef.current = null;
      }
      setManualControlActive(false);
    };
  }, [keyboardEnabled, isConnected, sendMessage, updateManualControlRc, setManualControlActive]);

  // Note: Gamepad RC sending is handled globally in App.jsx

  if (!isConnected) {
    return (
      <div className="px-4 pb-4 space-y-3">
        <div className="text-xs text-gray-600 italic text-center py-2">
          Not connected - Input testing mode
        </div>

        {/* Manual Control Section */}
        <ManualControlSection
          keyboardEnabled={keyboardEnabled}
          setKeyboardEnabled={setKeyboardEnabled}
          gamepadEnabled={gamepadEnabled}
          isConnected={false}
        />
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 space-y-3">
      {/* Drone mission (read-only) */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin size={11} className="text-gray-600" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Drone Mission</span>
          {droneMission.length > 0 && (
            <span className="text-[10px] text-gray-600 ml-1">({droneMission.length})</span>
          )}
          <button
            onClick={handleDownload}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 transition-all"
          >
            <Download size={9} /> Download
          </button>
        </div>
        {droneMission.length === 0 ? (
          <div className="text-[10px] text-gray-600 italic text-center py-2">
            No mission on drone
          </div>
        ) : (
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {droneMission.map((wp, i) => {
              const isActive = i === currentWaypointIndex;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] transition-all ${
                    isActive
                      ? 'bg-cyan-500/20 border border-cyan-500/40'
                      : 'bg-gray-800/50'
                  }`}
                >
                  <span className={`font-bold w-4 text-center ${isActive ? 'text-cyan-400' : 'text-emerald-400'}`}>
                    {i + 1}
                  </span>
                  <span className="text-gray-500 w-6">{TYPE_LABELS[wp.item_type] || 'WP'}</span>
                  <span className={`font-mono flex-1 truncate ${isActive ? 'text-gray-200' : 'text-gray-400'}`}>
                    {formatCoord(wp.lat, wp.lon, coordFormat, 5)}
                  </span>
                  <span className={isActive ? 'text-gray-300' : 'text-gray-500'}>{wp.alt}m</span>
                  {isActive && (
                    <span className="text-cyan-400 text-[8px] font-semibold">ACTIVE</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Control Section */}
      <ManualControlSection
        keyboardEnabled={keyboardEnabled}
        setKeyboardEnabled={setKeyboardEnabled}
        gamepadEnabled={gamepadEnabled}
        isConnected={true}
        telemetry={telemetry}
      />
    </div>
  );
}

function KeyHint({ k, keyName, label, wide }) {
  const keysPressed = useDroneStore((s) => s.keysPressed);
  const active = keysPressed[keyName?.toLowerCase() || k.toLowerCase()];

  return (
    <div className={`flex flex-col items-center ${wide ? 'col-span-2' : ''}`}>
      <span
        className={`${wide ? 'px-3' : 'w-6'} py-1 rounded text-[10px] font-bold border transition-all ${
          active
            ? 'bg-cyan-500/30 border-cyan-500/50 text-cyan-300'
            : 'bg-gray-800/60 border-gray-700/50 text-gray-500'
        }`}
      >
        {k}
      </span>
      <span className="text-[8px] text-gray-600 mt-0.5">{label}</span>
    </div>
  );
}

function StickVisualization({ x, y, label, size = 56 }) {
  const dotX = ((x + 1) / 2) * size;
  const dotY = ((y + 1) / 2) * size;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative bg-gray-900/80 rounded-full border border-gray-700/50"
        style={{ width: size, height: size }}
      >
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute w-full h-px bg-gray-700/50" />
          <div className="absolute h-full w-px bg-gray-700/50" />
        </div>
        <div
          className="absolute w-3 h-3 bg-cyan-400 rounded-full shadow-lg shadow-cyan-500/30 -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
          style={{ left: dotX, top: dotY }}
        />
      </div>
      <span className="text-[9px] text-gray-500 font-medium">{label}</span>
    </div>
  );
}

function ChannelBar({ value, label, color = 'cyan' }) {
  const deviation = value - RC_CENTER;
  const deviationPercent = Math.abs(deviation) / 500 * 100;
  const isCenter = Math.abs(deviation) < 20;

  const colorClasses = {
    cyan: { bar: 'bg-cyan-500', text: 'text-cyan-400' },
    emerald: { bar: 'bg-emerald-500', text: 'text-emerald-400' },
    amber: { bar: 'bg-amber-500', text: 'text-amber-400' },
    violet: { bar: 'bg-violet-500', text: 'text-violet-400' },
  };
  const c = colorClasses[color] || colorClasses.cyan;

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] text-gray-500 w-4 font-medium">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-800/80 rounded-full relative overflow-hidden">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />
        <div
          className={`absolute top-0 bottom-0 rounded-full transition-all duration-75 ${c.bar}`}
          style={{
            left: deviation >= 0 ? '50%' : `${50 - deviationPercent}%`,
            width: `${deviationPercent}%`,
          }}
        />
      </div>
      <span className={`text-[9px] font-mono w-8 text-right ${isCenter ? 'text-gray-600' : c.text}`}>
        {value}
      </span>
    </div>
  );
}

function ManualControlSection({ keyboardEnabled, setKeyboardEnabled, gamepadEnabled, isConnected, telemetry }) {
  const manualControl = useDroneStore((s) => s.manualControl);
  const keysPressed = useDroneStore((s) => s.keysPressed);
  const setGamepadEnabled = useDroneStore((s) => s.setGamepadEnabled);

  const [roll, pitch, throttle, yaw] = manualControl.lastRc;
  const normalize = (v) => (v - RC_CENTER) / 500;

  const leftX = normalize(yaw);
  const leftY = -normalize(throttle);
  const rightX = normalize(roll);
  const rightY = normalize(pitch);

  const isActive = keyboardEnabled || gamepadEnabled;
  const hasInput = roll !== RC_CENTER || pitch !== RC_CENTER || throttle !== RC_CENTER || yaw !== RC_CENTER;

  const activeKeys = useMemo(() => {
    const keys = [];
    if (keysPressed.w) keys.push('W');
    if (keysPressed.a) keys.push('A');
    if (keysPressed.s) keys.push('S');
    if (keysPressed.d) keys.push('D');
    if (keysPressed.q) keys.push('Q');
    if (keysPressed.e) keys.push('E');
    if (keysPressed.r) keys.push('R');
    if (keysPressed.f) keys.push('F');
    if (keysPressed.arrowup) keys.push('\u2191');
    if (keysPressed.arrowdown) keys.push('\u2193');
    if (keysPressed.arrowleft) keys.push('\u2190');
    if (keysPressed.arrowright) keys.push('\u2192');
    if (keysPressed.space) keys.push('SPACE');
    return keys;
  }, [keysPressed]);

  return (
    <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Gamepad2 size={11} className="text-gray-600" />
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Manual Control</span>
        {isActive && hasInput && (
          <Radio size={10} className="text-cyan-400 animate-pulse ml-auto" />
        )}
      </div>
      <div className="text-[9px] text-gray-600 mb-3">Only one input source can be active at a time</div>

      {/* Keyboard toggle */}
      <div className={`flex items-center justify-between mb-2 px-2 py-1.5 rounded-md border transition-colors ${
        keyboardEnabled ? 'bg-cyan-950/30 border-cyan-800/30' : 'bg-gray-900/40 border-gray-800/30'
      }`}>
        <div className="flex items-center gap-2">
          <Keyboard size={12} className={keyboardEnabled ? 'text-cyan-400' : 'text-gray-600'} />
          <span className={`text-[11px] ${keyboardEnabled ? 'text-gray-300' : 'text-gray-400'}`}>Keyboard</span>
        </div>
        <button
          onClick={() => setKeyboardEnabled(!keyboardEnabled)}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            keyboardEnabled ? 'bg-cyan-600' : 'bg-gray-700'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
              keyboardEnabled ? 'translate-x-4' : ''
            }`}
          />
        </button>
      </div>

      {/* Controller toggle */}
      <div className={`flex items-center justify-between px-2 py-1.5 rounded-md border transition-colors ${
        gamepadEnabled ? 'bg-cyan-950/30 border-cyan-800/30' : 'bg-gray-900/40 border-gray-800/30'
      }`}>
        <div className="flex items-center gap-2">
          <Gamepad2 size={12} className={gamepadEnabled ? 'text-cyan-400' : 'text-gray-600'} />
          <span className={`text-[11px] ${gamepadEnabled ? 'text-gray-300' : 'text-gray-400'}`}>Controller</span>
        </div>
        <button
          onClick={() => setGamepadEnabled(!gamepadEnabled)}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            gamepadEnabled ? 'bg-cyan-600' : 'bg-gray-700'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
              gamepadEnabled ? 'translate-x-4' : ''
            }`}
          />
        </button>
      </div>

      {/* Mode warning - only when connected */}
      {isConnected && telemetry && (keyboardEnabled || gamepadEnabled) && !MANUAL_MODES.includes(telemetry.mode) && (
        <div className="mt-2 px-2 py-1.5 bg-amber-950/40 border border-amber-800/30 rounded-md">
          <span className="text-[10px] text-amber-400">
            Switch to {telemetry.autopilot === 'ardupilot' ? 'STABILIZE, ALT_HOLD, or LOITER' : 'MANUAL or ALTCTL'} for RC override
          </span>
        </div>
      )}

      {/* Input visualization */}
      {isActive && (
        <div className="mt-3 p-3 bg-gray-900/60 rounded-lg border border-gray-800/50">
          {/* Stick visualizations */}
          <div className="flex items-center justify-center gap-6 mb-3">
            <StickVisualization x={leftX} y={leftY} label="THR / YAW" />
            <StickVisualization x={rightX} y={rightY} label="ROLL / PITCH" />
          </div>

          {/* Channel bars */}
          <div className="space-y-1.5">
            <ChannelBar value={roll} label="R" color="cyan" />
            <ChannelBar value={pitch} label="P" color="emerald" />
            <ChannelBar value={throttle} label="T" color="amber" />
            <ChannelBar value={yaw} label="Y" color="violet" />
          </div>

          {/* Active keys */}
          {keyboardEnabled && activeKeys.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-800/50 flex flex-wrap gap-1">
              {activeKeys.map((key) => (
                <span
                  key={key}
                  className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 text-[9px] font-mono font-bold rounded border border-cyan-500/30"
                >
                  {key}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Key hints */}
      {keyboardEnabled && !hasInput && (
        <div className="mt-2 p-2 bg-gray-900/40 rounded-md border border-gray-800/30">
          <div className="grid grid-cols-4 gap-1 text-center mb-2">
            <div />
            <KeyHint k="W" label="Thr+" />
            <div />
            <KeyHint k="↑" keyName="arrowup" label="Pitch-" />

            <KeyHint k="A" label="Roll-" />
            <KeyHint k="S" label="Thr-" />
            <KeyHint k="D" label="Roll+" />
            <KeyHint k="↓" keyName="arrowdown" label="Pitch+" />
          </div>
          <div className="flex justify-center gap-1">
            <KeyHint k="Q" label="Yaw-" />
            <KeyHint k="E" label="Yaw+" />
            <KeyHint k="←" keyName="arrowleft" label="Yaw-" />
            <KeyHint k="→" keyName="arrowright" label="Yaw+" />
          </div>
          <div className="flex justify-center gap-1 mt-1">
            <KeyHint k="SPACE" keyName="space" label="Arm" wide />
          </div>
        </div>
      )}
    </div>
  );
}
