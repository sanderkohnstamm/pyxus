import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { X, Minimize2, Battery, Wifi, Gauge, Mountain, ArrowUp, Home, Keyboard, Gamepad2 } from 'lucide-react';
import useDroneStore from '../store/droneStore';
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

function HorizonIndicator({ roll, pitch }) {
  // Clamp pitch for display
  const clampedPitch = Math.max(-45, Math.min(45, pitch));
  const pitchOffset = clampedPitch * 2; // 2px per degree

  return (
    <div className="relative w-48 h-48 rounded-full overflow-hidden border-2 border-gray-700/50 bg-gradient-to-b from-cyan-900/30 to-amber-900/30">
      {/* Sky/Ground - rotated */}
      <div
        className="absolute inset-0"
        style={{ transform: `rotate(${-roll}deg)` }}
      >
        {/* Sky */}
        <div
          className="absolute w-[200%] h-[200%] left-1/2 bg-gradient-to-b from-sky-600 to-sky-400"
          style={{
            transform: `translate(-50%, ${-50 + pitchOffset}%)`,
          }}
        />
        {/* Ground */}
        <div
          className="absolute w-[200%] h-[100%] left-1/2 bg-gradient-to-b from-amber-700 to-amber-900"
          style={{
            transform: `translate(-50%, ${50 + pitchOffset}%)`,
          }}
        />
        {/* Horizon line */}
        <div
          className="absolute w-[200%] h-0.5 left-1/2 bg-white/80"
          style={{
            transform: `translate(-50%, ${pitchOffset}px)`,
            top: '50%',
          }}
        />
        {/* Pitch lines */}
        {[-30, -20, -10, 10, 20, 30].map((deg) => (
          <div
            key={deg}
            className="absolute w-16 h-px left-1/2 bg-white/40"
            style={{
              transform: `translate(-50%, ${pitchOffset - deg * 2}px)`,
              top: '50%',
            }}
          />
        ))}
      </div>

      {/* Fixed aircraft reference */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative">
          {/* Wings */}
          <div className="absolute top-1/2 left-1/2 w-20 h-1 bg-yellow-400 -translate-x-1/2 -translate-y-1/2 rounded" />
          {/* Center dot */}
          <div className="w-3 h-3 bg-yellow-400 rounded-full border-2 border-yellow-300" />
        </div>
      </div>

      {/* Roll indicator at top */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2">
        <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-yellow-400" />
      </div>

      {/* Roll scale */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
        {[-60, -45, -30, -15, 0, 15, 30, 45, 60].map((deg) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const x1 = 50 + 44 * Math.cos(rad);
          const y1 = 50 + 44 * Math.sin(rad);
          const x2 = 50 + 48 * Math.cos(rad);
          const y2 = 50 + 48 * Math.sin(rad);
          return (
            <line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="white"
              strokeWidth={deg === 0 ? 2 : 1}
              opacity={0.6}
            />
          );
        })}
      </svg>
    </div>
  );
}

function CompassRose({ heading, homeHeading }) {
  return (
    <div className="relative w-32 h-32">
      {/* Rotating compass */}
      <div
        className="absolute inset-0 rounded-full border-2 border-gray-700/50 bg-gray-900/50"
        style={{ transform: `rotate(${-heading}deg)` }}
      >
        {/* Cardinal directions */}
        {[
          { dir: 'N', deg: 0, color: 'text-red-400' },
          { dir: 'E', deg: 90, color: 'text-gray-400' },
          { dir: 'S', deg: 180, color: 'text-gray-400' },
          { dir: 'W', deg: 270, color: 'text-gray-400' },
        ].map(({ dir, deg, color }) => {
          const rad = ((deg - 90) * Math.PI) / 180;
          const x = 50 + 38 * Math.cos(rad);
          const y = 50 + 38 * Math.sin(rad);
          return (
            <div
              key={dir}
              className={`absolute text-xs font-bold ${color}`}
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: `translate(-50%, -50%) rotate(${heading}deg)`,
              }}
            >
              {dir}
            </div>
          );
        })}

        {/* Degree marks */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
          {Array.from({ length: 36 }, (_, i) => i * 10).map((deg) => {
            const rad = ((deg - 90) * Math.PI) / 180;
            const x1 = 50 + 46 * Math.cos(rad);
            const y1 = 50 + 46 * Math.sin(rad);
            const x2 = 50 + 49 * Math.cos(rad);
            const y2 = 50 + 49 * Math.sin(rad);
            return (
              <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth={deg % 30 === 0 ? 2 : 1} opacity={0.4} />
            );
          })}
        </svg>

        {/* Home direction indicator */}
        {homeHeading !== null && (
          <div
            className="absolute w-4 h-4 text-green-400"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) rotate(${homeHeading}deg) translateY(-20px)`,
            }}
          >
            <Home size={14} />
          </div>
        )}
      </div>

      {/* Fixed heading indicator */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1">
        <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[7px] border-l-transparent border-r-transparent border-b-cyan-400" />
      </div>

      {/* Center heading display */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold text-white tabular-nums">{Math.round(heading)}°</span>
      </div>
    </div>
  );
}

function TelemetryHUD({ telemetry, homePosition }) {
  const { roll, pitch, heading, alt, alt_msl, groundspeed, airspeed, climb, voltage, remaining, lat, lon } = telemetry;

  // Calculate home bearing
  let homeHeading = null;
  if (homePosition && lat && lon) {
    const dLon = ((homePosition.lon - lon) * Math.PI) / 180;
    const lat1 = (lat * Math.PI) / 180;
    const lat2 = (homePosition.lat * Math.PI) / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    homeHeading = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  // Convert rad to deg for display
  const rollDeg = (roll * 180) / Math.PI;
  const pitchDeg = (pitch * 180) / Math.PI;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Top center - Mode and status */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
        <div className={`px-3 py-1 rounded text-sm font-bold ${telemetry.armed ? 'bg-red-500/80 text-white' : 'bg-gray-800/80 text-gray-400'}`}>
          {telemetry.armed ? 'ARMED' : 'DISARMED'}
        </div>
        <div className="px-3 py-1 rounded bg-cyan-500/80 text-white text-sm font-bold">
          {telemetry.mode || 'UNKNOWN'}
        </div>
      </div>

      {/* Left side - Attitude */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4">
        <HorizonIndicator roll={rollDeg} pitch={pitchDeg} />
        <CompassRose heading={heading} homeHeading={homeHeading} />
      </div>

      {/* Right side - Telemetry tape */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-3 bg-gray-900/70 backdrop-blur-sm rounded-lg p-3 border border-gray-700/30">
        {/* Altitude */}
        <div className="flex items-center gap-2">
          <Mountain size={14} className="text-cyan-400" />
          <div>
            <div className="text-2xl font-bold text-white tabular-nums">{alt.toFixed(1)}<span className="text-xs text-gray-400 ml-1">m AGL</span></div>
            <div className="text-xs text-gray-500">{alt_msl.toFixed(0)}m MSL</div>
          </div>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-2">
          <Gauge size={14} className="text-emerald-400" />
          <div>
            <div className="text-2xl font-bold text-white tabular-nums">{groundspeed.toFixed(1)}<span className="text-xs text-gray-400 ml-1">m/s</span></div>
            <div className="text-xs text-gray-500">Air: {airspeed.toFixed(1)} m/s</div>
          </div>
        </div>

        {/* Climb rate */}
        <div className="flex items-center gap-2">
          <ArrowUp size={14} className={climb >= 0 ? 'text-green-400' : 'text-red-400'} style={{ transform: climb < 0 ? 'rotate(180deg)' : undefined }} />
          <div className="text-xl font-bold text-white tabular-nums">
            {climb >= 0 ? '+' : ''}{climb.toFixed(1)}<span className="text-xs text-gray-400 ml-1">m/s</span>
          </div>
        </div>

        {/* Battery */}
        <div className="flex items-center gap-2">
          <Battery size={14} className={remaining > 20 ? 'text-emerald-400' : 'text-red-400'} />
          <div>
            <div className="text-xl font-bold text-white tabular-nums">{voltage.toFixed(1)}<span className="text-xs text-gray-400 ml-1">V</span></div>
            {remaining >= 0 && <div className="text-xs text-gray-500">{remaining}%</div>}
          </div>
        </div>
      </div>

      {/* Bottom left - Coordinates */}
      <div className="absolute bottom-4 left-4 bg-gray-900/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700/30">
        <div className="text-xs font-mono text-gray-400">
          <div>{lat.toFixed(6)}, {lon.toFixed(6)}</div>
        </div>
      </div>

      {/* Bottom center - GPS status */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-gray-900/70 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700/30">
        <Wifi size={12} className={telemetry.fix_type >= 3 ? 'text-emerald-400' : 'text-amber-400'} />
        <span className="text-xs text-gray-400">{telemetry.satellites} sats</span>
        <span className="text-xs text-gray-500">HDOP {telemetry.hdop.toFixed(1)}</span>
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
    if (keysPressed.arrowup) keys.push('↑');
    if (keysPressed.arrowdown) keys.push('↓');
    if (keysPressed.arrowleft) keys.push('←');
    if (keysPressed.arrowright) keys.push('→');
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
            <div className="text-6xl opacity-20">📹</div>
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
