import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { X, Minimize2, Battery, Wifi, Keyboard, Gamepad2 } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import { formatCoord } from '../utils/formatCoord';
import { apiUrl } from '../utils/api';
import FlyOverlay from './FlyOverlay';

const RC_CENTER = 1500;

// Mini drone arrow icon that rotates with heading
function createMiniDroneIcon(heading) {
  return L.divIcon({
    html: `<svg width="20" height="20" viewBox="-10 -10 20 20" style="transform: rotate(${heading}deg)">
      <path d="M0,-8 L5,6 L0,3 L-5,6 Z" fill="#06b6d4" stroke="#22d3ee" stroke-width="1"/>
    </svg>`,
    className: 'mini-drone-arrow',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// Mini home icon
const miniHomeIcon = L.divIcon({
  html: `<div style="width:10px;height:10px;background:#10b981;border:2px solid #34d399;border-radius:50%"></div>`,
  className: '',
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

function TelemetryHUD({ telemetry, homePosition }) {
  const coordFormat = useDroneStore((s) => s.coordFormat);
  const { roll, pitch, heading, alt, alt_msl, groundspeed, airspeed, climb, voltage, remaining, lat, lon } = telemetry;

  const rollDeg = (roll * 180) / Math.PI;
  const pitchDeg = (pitch * 180) / Math.PI;

  // Home bearing
  let homeBearing = null;
  if (homePosition && lat && lon) {
    const dLon = ((homePosition.lon - lon) * Math.PI) / 180;
    const lat1r = (lat * Math.PI) / 180;
    const lat2r = (homePosition.lat * Math.PI) / 180;
    const yh = Math.sin(dLon) * Math.cos(lat2r);
    const xh = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
    homeBearing = ((Math.atan2(yh, xh) * 180) / Math.PI + 360) % 360;
  }

  const pitchPx = 3.5;
  const hdgPx = 3;

  return (
    <div className="absolute inset-0 pointer-events-none select-none">

      {/* Armed / Mode */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
        <span className={`px-2.5 py-0.5 text-xs font-bold tracking-wider border ${
          telemetry.armed
            ? 'border-red-500/50 text-red-400 bg-red-950/30'
            : 'border-gray-600/30 text-gray-500 bg-gray-950/20'
        }`}>
          {telemetry.armed ? 'ARMED' : 'DISARMED'}
        </span>
        <span className="px-2.5 py-0.5 text-xs font-bold tracking-wider border border-cyan-400/50 text-cyan-300 bg-cyan-950/30">
          {telemetry.mode || '---'}
        </span>
      </div>

      {/* Heading Tape */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2" style={{ width: 360, height: 52 }}>
        <svg width="360" height="36" viewBox="0 0 360 36">
          {Array.from({ length: 121 }, (_, i) => {
            const degOffset = i - 60;
            const deg = ((Math.floor(heading) + degOffset) % 360 + 360) % 360;
            const x = 180 + (degOffset - (heading % 1)) * hdgPx;
            const major = deg % 10 === 0;
            const cardinal = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[deg];
            if (!major && deg % 5 !== 0) return null;
            return (
              <g key={i}>
                <line x1={x} y1={36} x2={x} y2={major ? (cardinal ? 10 : 18) : 28}
                  stroke="#22d3ee" strokeWidth={cardinal ? 1.5 : 0.7} opacity={major ? 0.7 : 0.35} />
                {major && (
                  <text x={x} y={cardinal ? 8 : 15} textAnchor="middle" fill="#22d3ee"
                    fontSize={cardinal ? 12 : 9} opacity={cardinal ? 0.9 : 0.5}
                    style={{ fontFamily: 'monospace' }}>
                    {cardinal || deg}
                  </text>
                )}
              </g>
            );
          })}
          {homeBearing !== null && (() => {
            let d = homeBearing - heading;
            if (d > 180) d -= 360;
            if (d < -180) d += 360;
            if (Math.abs(d) > 60) return null;
            const hx = 180 + d * hdgPx;
            return <polygon points={`${hx - 4},36 ${hx + 4},36 ${hx},30`} fill="#34d399" opacity={0.7} />;
          })()}
          <polygon points="176,36 184,36 180,30" fill="#22d3ee" opacity={0.8} />
        </svg>
        <div className="absolute top-9 left-1/2 -translate-x-1/2 border border-cyan-400/50 bg-black/60 px-2.5 py-px">
          <span className="text-sm font-bold text-cyan-300 tabular-nums" style={{ fontFamily: 'monospace' }}>
            {String(Math.round(heading) % 360).padStart(3, '0')}&deg;
          </span>
        </div>
      </div>

      {/* Attitude Indicator */}
      <svg className="absolute top-1/2 left-1/2"
        style={{ transform: 'translate(-50%, -50%)', width: 380, height: 310 }}
        viewBox="0 0 380 310">
        <defs>
          <clipPath id="hudAtt"><rect x="40" y="25" width="300" height="240" rx="8" /></clipPath>
        </defs>

        {/* Pitch ladder + horizon, rotated by roll */}
        <g clipPath="url(#hudAtt)">
          <g transform={`rotate(${-rollDeg} 190 145)`}>
            {/* Sky tint */}
            <rect x="-200" y={-500 + 145 + pitchDeg * pitchPx} width="800" height="500" fill="#0c4a6e" opacity="0.15" />
            {/* Ground tint */}
            <rect x="-200" y={145 + pitchDeg * pitchPx} width="800" height="500" fill="#78350f" opacity="0.12" />
            {/* Horizon line */}
            <line x1="-100" y1={145 + pitchDeg * pitchPx} x2="500" y2={145 + pitchDeg * pitchPx}
              stroke="#22d3ee" strokeWidth="1.2" opacity="0.5" />

            {/* Pitch lines */}
            {[-40, -30, -20, -10, -5, 5, 10, 20, 30, 40].map(deg => {
              const py = 145 + pitchDeg * pitchPx - deg * pitchPx;
              const major = Math.abs(deg) % 10 === 0;
              const hw = major ? 55 : 25;
              return (
                <g key={deg}>
                  <line x1={190 - hw} y1={py} x2={190 - 10} y2={py}
                    stroke="#22d3ee" strokeWidth={major ? 1 : 0.6} opacity="0.45" />
                  <line x1={190 + 10} y1={py} x2={190 + hw} y2={py}
                    stroke="#22d3ee" strokeWidth={major ? 1 : 0.6} opacity="0.45" />
                  {major && <>
                    <text x={190 - hw - 5} y={py + 3.5} textAnchor="end" fill="#22d3ee"
                      fontSize="9" opacity="0.5" style={{ fontFamily: 'monospace' }}>{deg}</text>
                    <text x={190 + hw + 5} y={py + 3.5} textAnchor="start" fill="#22d3ee"
                      fontSize="9" opacity="0.5" style={{ fontFamily: 'monospace' }}>{deg}</text>
                  </>}
                </g>
              );
            })}
          </g>
        </g>

        {/* Roll arc ticks (fixed) */}
        {[-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].map(deg => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const r1 = 133, r2 = deg % 30 === 0 ? 143 : 139;
          return (
            <line key={deg}
              x1={190 + r1 * Math.cos(rad)} y1={145 + r1 * Math.sin(rad)}
              x2={190 + r2 * Math.cos(rad)} y2={145 + r2 * Math.sin(rad)}
              stroke="#22d3ee" strokeWidth={deg === 0 ? 1.5 : 0.7} opacity="0.45"
            />
          );
        })}

        {/* Roll pointer (rotates with aircraft) */}
        <g transform={`rotate(${rollDeg} 190 145)`}>
          <polygon points="186,16 194,16 190,9" fill="#22d3ee" opacity="0.75" />
        </g>

        {/* Fixed aircraft reference symbol */}
        <g stroke="#22d3ee" strokeWidth="2" opacity="0.85">
          <line x1="120" y1="145" x2="172" y2="145" />
          <line x1="120" y1="145" x2="120" y2="153" />
          <line x1="208" y1="145" x2="260" y2="145" />
          <line x1="260" y1="145" x2="260" y2="153" />
          <circle cx="190" cy="145" r="3" fill="#22d3ee" />
        </g>
      </svg>

      {/* Speed box (left of center) */}
      <div className="absolute top-1/2 -translate-y-1/2" style={{ right: 'calc(50% + 195px)' }}>
        <div className="flex items-center">
          <div className="border border-cyan-400/40 bg-black/50 px-3 py-1.5 text-right" style={{ minWidth: 76 }}>
            <div className="text-lg font-bold text-cyan-300 tabular-nums leading-tight">{groundspeed.toFixed(1)}</div>
            <div className="text-[8px] text-cyan-500/50 tracking-widest">GS m/s</div>
          </div>
          <div className="w-0 h-0 border-t-[7px] border-b-[7px] border-l-[7px] border-t-transparent border-b-transparent border-l-cyan-400/40" />
        </div>
        <div className="text-[9px] text-cyan-500/35 text-right mt-0.5">AS {airspeed.toFixed(1)}</div>
      </div>

      {/* Altitude box (right of center) */}
      <div className="absolute top-1/2 -translate-y-1/2" style={{ left: 'calc(50% + 195px)' }}>
        <div className="flex items-center">
          <div className="w-0 h-0 border-t-[7px] border-b-[7px] border-r-[7px] border-t-transparent border-b-transparent border-r-cyan-400/40" />
          <div className="border border-cyan-400/40 bg-black/50 px-3 py-1.5" style={{ minWidth: 76 }}>
            <div className="text-lg font-bold text-cyan-300 tabular-nums leading-tight">{alt.toFixed(1)}</div>
            <div className="text-[8px] text-cyan-500/50 tracking-widest">ALT m</div>
          </div>
        </div>
        <div className="text-[9px] mt-0.5 ml-3 tabular-nums flex items-center gap-1">
          <span className={climb >= 0 ? 'text-green-400/50' : 'text-red-400/50'}>
            {climb >= 0 ? '\u25B2' : '\u25BC'}{Math.abs(climb).toFixed(1)}
          </span>
          <span className="text-cyan-500/30">MSL {alt_msl.toFixed(0)}</span>
        </div>
      </div>

      {/* Bottom bar: coords / GPS / battery */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-5 text-[10px]">
        <span className="text-cyan-400/50 tabular-nums">{formatCoord(lat, lon, coordFormat, 6)}</span>
        <span className="flex items-center gap-1">
          <Wifi size={10} className={telemetry.fix_type >= 3 ? 'text-green-400/60' : 'text-amber-400/60'} />
          <span className="text-cyan-400/45">{telemetry.satellites} SAT</span>
        </span>
        <span className="flex items-center gap-1">
          <Battery size={10} className={remaining > 20 ? 'text-green-400/60' : 'text-red-400/60'} />
          <span className="text-cyan-400/45 tabular-nums">{voltage.toFixed(1)}V</span>
          {remaining >= 0 && <span className="text-cyan-400/35">{remaining}%</span>}
        </span>
      </div>
    </div>
  );
}

// Stick visualization for manual control
function StickViz({ x, y, label, size = 48 }) {
  const dotX = ((x + 1) / 2) * size;
  const dotY = ((y + 1) / 2) * size;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative bg-gray-900/80 rounded-full border border-gray-600/50"
        style={{ width: size, height: size }}
      >
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute w-full h-px bg-gray-600/50" />
          <div className="absolute h-full w-px bg-gray-600/50" />
        </div>
        <div
          className="absolute w-2.5 h-2.5 bg-cyan-400 rounded-full shadow-lg shadow-cyan-500/50 -translate-x-1/2 -translate-y-1/2 transition-all duration-75"
          style={{ left: dotX, top: dotY }}
        />
      </div>
      <span className="text-[8px] text-gray-500 font-medium">{label}</span>
    </div>
  );
}

// Manual control HUD overlay
function ManualControlHUD() {
  const keyboardEnabled = useDroneStore((s) => s.keyboardEnabled);
  const setKeyboardEnabled = useDroneStore((s) => s.setKeyboardEnabled);
  const gamepadEnabled = useDroneStore((s) => s.gamepadEnabled);
  const manualControl = useDroneStore((s) => s.manualControl);
  const keysPressed = useDroneStore((s) => s.keysPressed);

  const [roll, pitch, throttle, yaw] = manualControl.lastRc;
  const normalize = (v) => (v - RC_CENTER) / 500;

  const leftX = normalize(yaw);
  const leftY = -normalize(throttle);
  const rightX = normalize(roll);
  const rightY = normalize(pitch);

  const isActive = keyboardEnabled || gamepadEnabled;
  const hasInput = roll !== RC_CENTER || pitch !== RC_CENTER || throttle !== RC_CENTER || yaw !== RC_CENTER;

  // Active keys display
  const activeKeys = useMemo(() => {
    const keys = [];
    if (keysPressed.w) keys.push('W');
    if (keysPressed.a) keys.push('A');
    if (keysPressed.s) keys.push('S');
    if (keysPressed.d) keys.push('D');
    if (keysPressed.arrowup) keys.push('\u2191');
    if (keysPressed.arrowdown) keys.push('\u2193');
    if (keysPressed.arrowleft) keys.push('\u2190');
    if (keysPressed.arrowright) keys.push('\u2192');
    return keys;
  }, [keysPressed]);

  return (
    <div className="absolute bottom-4 left-4 pointer-events-auto">
      <div className="bg-gray-900/80 backdrop-blur-sm rounded-lg border border-gray-700/50 p-3">
        {/* Toggle buttons */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setKeyboardEnabled(!keyboardEnabled)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all ${
              keyboardEnabled
                ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                : 'bg-gray-800/60 text-gray-500 border border-gray-700/50 hover:text-gray-300'
            }`}
          >
            <Keyboard size={12} />
            <span>KB</span>
          </button>
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
            gamepadEnabled ? 'text-cyan-300' : 'text-gray-600'
          }`}>
            <Gamepad2 size={12} />
            <span>{gamepadEnabled ? 'ON' : 'OFF'}</span>
          </div>
          {isActive && hasInput && (
            <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
          )}
        </div>

        {/* Stick visualization - always show when any control is active */}
        {isActive && (
          <div className="flex items-center gap-4">
            <StickViz x={leftX} y={leftY} label="THR/YAW" />
            <StickViz x={rightX} y={rightY} label="ROLL/PITCH" />
          </div>
        )}

        {/* Active keys indicator */}
        {keyboardEnabled && activeKeys.length > 0 && (
          <div className="mt-2 flex items-center gap-1 justify-center">
            {activeKeys.map((k) => (
              <span key={k} className="px-1.5 py-0.5 bg-cyan-500/30 border border-cyan-500/50 rounded text-[9px] font-bold text-cyan-300">
                {k}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FullscreenVideo({ onClose }) {
  const videoUrl = useDroneStore((s) => s.videoUrl);
  const videoActive = useDroneStore((s) => s.videoActive);
  const telemetry = useDroneStore((s) => s.telemetry);
  const homePosition = useDroneStore((s) => s.homePosition);
  const trail = useDroneStore((s) => s.trail);

  const streamUrl = videoActive && videoUrl
    ? apiUrl(`/api/video/stream?url=${encodeURIComponent(videoUrl)}`)
    : null;

  const hasPosition = telemetry.lat !== 0 || telemetry.lon !== 0;

  // Create drone icon with current heading
  const droneIcon = useMemo(() => createMiniDroneIcon(telemetry.heading), [telemetry.heading]);

  // ESC key to exit
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Use portal to render at document body level (above everything)
  return createPortal(
    <div className="fixed inset-0 bg-black flex items-center justify-center" style={{ zIndex: 99999 }}>
      {/* Video feed - fullscreen background */}
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        {streamUrl ? (
          <img
            src={streamUrl}
            alt="Video feed"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 text-gray-600">
            <div className="text-6xl opacity-20">{'\uD83D\uDCF9'}</div>
            <span className="text-xl">No video feed</span>
            <span className="text-sm opacity-50">Configure video URL in settings</span>
          </div>
        )}
      </div>

      {/* HUD Overlay */}
      <TelemetryHUD telemetry={telemetry} homePosition={homePosition} />

      {/* Manual Control HUD - bottom left */}
      <ManualControlHUD />

      {/* Minimap - above flight controls */}
      <div className="absolute bottom-28 right-4 w-48 h-48 rounded-lg overflow-hidden border-2 border-gray-700/50 shadow-2xl pointer-events-auto">
        <MapContainer
          center={hasPosition ? [telemetry.lat, telemetry.lon] : [0, 0]}
          zoom={15}
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />

          {/* Trail */}
          {trail.length > 1 && (
            <Polyline positions={trail} pathOptions={{ color: '#06b6d4', weight: 2, opacity: 0.7 }} />
          )}

          {/* Home */}
          {homePosition && (
            <Marker position={[homePosition.lat, homePosition.lon]} icon={miniHomeIcon} />
          )}

          {/* Drone */}
          {hasPosition && (
            <Marker position={[telemetry.lat, telemetry.lon]} icon={droneIcon} />
          )}
        </MapContainer>
      </div>

      {/* Flight Controls - same as map view, bottom right */}
      <FlyOverlay />

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-lg bg-gray-900/70 text-gray-400 hover:text-white hover:bg-gray-800/80 transition-colors pointer-events-auto"
      >
        <X size={24} />
      </button>

      {/* Minimize hint */}
      <div className="absolute top-4 right-16 flex items-center gap-2 text-gray-500 text-xs">
        <Minimize2 size={12} />
        <span>Press ESC to exit</span>
      </div>
    </div>,
    document.body
  );
}
