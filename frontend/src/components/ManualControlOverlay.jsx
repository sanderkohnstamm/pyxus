import React, { useMemo } from 'react';
import { Gamepad2, Keyboard, Radio, ChevronDown, ChevronUp } from 'lucide-react';
import useDroneStore, { INITIAL_TELEMETRY } from '../store/droneStore';

const RC_CENTER = 1500;
const RC_MIN = 1000;
const RC_MAX = 2000;

// Modes that accept manual RC input
const MANUAL_MODES = [
  'STABILIZE', 'ALT_HOLD', 'ACRO', 'SPORT', 'LOITER', 'POSHOLD',  // ArduPilot
  'MANUAL', 'ALTCTL', 'POSCTL', 'STABILIZED', 'RATTITUDE',  // PX4
];

function StickVisualization({ x, y, label, size = 48 }) {
  // x and y are normalized -1 to 1
  const dotX = ((x + 1) / 2) * size;
  const dotY = ((y + 1) / 2) * size;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative bg-gray-900/80 rounded-full border border-gray-700/50"
        style={{ width: size, height: size }}
      >
        {/* Crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute w-full h-px bg-gray-700/50" />
          <div className="absolute h-full w-px bg-gray-700/50" />
        </div>
        {/* Stick position dot */}
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
  // value is 1000-2000, center at 1500
  const percent = ((value - RC_MIN) / (RC_MAX - RC_MIN)) * 100;
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
        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-600" />
        {/* Value bar */}
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

export default function ManualControlOverlay() {
  const keyboardEnabled = useDroneStore((s) => s.keyboardEnabled);
  const gamepadEnabled = useDroneStore((s) => s.gamepadEnabled);
  const manualControl = useDroneStore((s) => s.manualControl);
  const telemetry = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : null) || INITIAL_TELEMETRY;
  const keysPressed = useDroneStore((s) => s.keysPressed);
  const isConnected = !!useDroneStore((s) => s.activeDroneId);
  const collapsed = useDroneStore((s) => s.manualOverlayCollapsed);
  const toggleCollapsed = useDroneStore((s) => s.toggleManualOverlay);
  const isManualMode = MANUAL_MODES.includes(telemetry.mode);
  const isActive = keyboardEnabled || gamepadEnabled;
  const isSending = manualControl.active && (Date.now() - manualControl.lastUpdate < 200);

  // Normalize RC values to -1 to 1 for stick visualization
  const [roll, pitch, throttle, yaw] = manualControl.lastRc;
  const normalize = (v) => (v - RC_CENTER) / 500;

  // Left stick: throttle (Y) + yaw (X) - Mode 2 layout
  const leftX = normalize(yaw);
  const leftY = -normalize(throttle); // inverted so up = more throttle

  // Right stick: pitch (Y) + roll (X)
  const rightX = normalize(roll);
  const rightY = normalize(pitch);

  // Keyboard keys visualization
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

  if (!isConnected || !isActive) return null;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2">
      {/* Manual control status badge - always visible */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border backdrop-blur-md shadow-xl ${
        isSending
          ? 'bg-cyan-950/70 border-cyan-500/40'
          : isActive
          ? 'bg-gray-900/70 border-gray-700/40'
          : 'bg-gray-900/50 border-gray-800/30'
      }`}>
        <div className="flex items-center gap-1.5">
          {keyboardEnabled && <Keyboard size={12} className={isSending ? 'text-cyan-400' : 'text-gray-500'} />}
          {gamepadEnabled && <Gamepad2 size={12} className={isSending ? 'text-cyan-400' : 'text-gray-500'} />}
          <Radio size={10} className={isSending ? 'text-cyan-400 animate-pulse' : 'text-gray-600'} />
        </div>

        <div className="flex flex-col flex-1">
          <span className={`text-[10px] font-semibold uppercase tracking-wide ${
            isSending ? 'text-cyan-300' : 'text-gray-400'
          }`}>
            {isSending ? 'Sending RC' : 'Manual Control'}{' '}
            <span className="font-normal normal-case text-[9px] text-gray-500">
              ({keyboardEnabled ? 'Keyboard' : 'Controller'})
            </span>
          </span>
          <span className={`text-[9px] ${isManualMode ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
            {isManualMode ? `Mode: ${telemetry.mode}` : `${telemetry.mode} - Switch to manual mode`}
          </span>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapsed}
          className="p-1 -mr-1 rounded hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 transition-colors"
        >
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {/* Input visualization - collapsible */}
      {!collapsed && isSending && (
        <div className="bg-gray-900/70 backdrop-blur-md rounded-lg p-3 border border-gray-700/40 shadow-xl">
          {/* Sticks */}
          <div className="flex items-center gap-4 mb-3">
            <StickVisualization x={leftX} y={leftY} label="THR/YAW" />
            <StickVisualization x={rightX} y={rightY} label="ROLL/PITCH" />
          </div>

          {/* Channel bars */}
          <div className="space-y-1.5 min-w-[140px]">
            <ChannelBar value={roll} label="R" color="cyan" />
            <ChannelBar value={pitch} label="P" color="emerald" />
            <ChannelBar value={throttle} label="T" color="amber" />
            <ChannelBar value={yaw} label="Y" color="violet" />
          </div>

          {/* Active keys (keyboard mode) */}
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

      {/* Mode warning */}
      {!collapsed && isActive && !isManualMode && telemetry.armed && (
        <div className="bg-amber-950/70 backdrop-blur-md rounded-lg px-3 py-2 border border-amber-500/30 shadow-xl">
          <span className="text-[10px] text-amber-300">
            RC override may not work in {telemetry.mode} mode
          </span>
        </div>
      )}
    </div>
  );
}
