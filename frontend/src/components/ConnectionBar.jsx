import React, { useCallback, useEffect, useState } from 'react';
import { Wifi, WifiOff, Heart, Sun, Moon, Grid3X3, Plus, X } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import { INITIAL_TELEMETRY } from '../store/droneStore';
import { droneApi } from '../utils/api';

function HeartbeatIndicator({ age }) {
  if (age < 0) return null;

  let color, label;
  if (age <= 2) {
    color = 'text-emerald-400/80';
    label = 'LIVE';
  } else if (age <= 5) {
    color = 'text-amber-400/80';
    label = 'DELAYED';
  } else {
    color = 'text-red-400/80';
    label = 'LOST';
  }

  return (
    <div className={`flex items-center gap-1 ${color}`}>
      <Heart size={10} className={age <= 2 ? 'animate-pulse' : ''} />
      <span className="text-[10px] font-semibold tracking-wide">{label}</span>
    </div>
  );
}

export default function ConnectionBar() {
  const drones = useDroneStore((s) => s.drones);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const setActiveDrone = useDroneStore((s) => s.setActiveDrone);
  const registerDrone = useDroneStore((s) => s.registerDrone);
  const removeDrone = useDroneStore((s) => s.removeDrone);
  const addAlert = useDroneStore((s) => s.addAlert);
  const wsConnected = useDroneStore((s) => s.wsConnected);
  const theme = useDroneStore((s) => s.theme);
  const toggleTheme = useDroneStore((s) => s.toggleTheme);
  const coordFormat = useDroneStore((s) => s.coordFormat);
  const toggleCoordFormat = useDroneStore((s) => s.toggleCoordFormat);
  const setDefaultAlt = useDroneStore((s) => s.setDefaultAlt);
  const setDefaultSpeed = useDroneStore((s) => s.setDefaultSpeed);
  const setTakeoffAlt = useDroneStore((s) => s.setTakeoffAlt);
  const setVideoUrl = useDroneStore((s) => s.setVideoUrl);
  const triggerZoomToDrone = useDroneStore((s) => s.triggerZoomToDrone);

  const [showAddForm, setShowAddForm] = useState(false);
  const [connType, setConnType] = useState('udp');
  const [connString, setConnString] = useState('udpin:0.0.0.0:14550');
  const [droneName, setDroneName] = useState('');
  const [connecting, setConnecting] = useState(false);

  // Active drone telemetry
  const activeDrone = activeDroneId ? drones[activeDroneId] : null;
  const telemetry = activeDrone?.telemetry || INITIAL_TELEMETRY;

  // Load settings on mount + discover already-connected drones
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Load settings
      try {
        const settingsRes = await fetch('/api/settings');
        const settingsData = await settingsRes.json();
        if (!cancelled && settingsData.status === 'ok') {
          const s = settingsData.settings;
          if (s.connection) {
            if (s.connection.type) setConnType(s.connection.type);
            if (s.connection.string) setConnString(s.connection.string);
          }
          if (s.flight) {
            if (s.flight.default_alt) setDefaultAlt(s.flight.default_alt);
            if (s.flight.default_speed) setDefaultSpeed(s.flight.default_speed);
            if (s.flight.takeoff_alt) setTakeoffAlt(s.flight.takeoff_alt);
          }
          if (s.video?.url) setVideoUrl(s.video.url);
        }
      } catch {}

      // Discover already-connected drones (e.g., after page refresh)
      try {
        const res = await fetch('/api/drones');
        const data = await res.json();
        if (!cancelled && data.status === 'ok' && data.drones?.length > 0) {
          for (const d of data.drones) {
            registerDrone(d.drone_id, d.name, d.connection_string);
          }
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/drones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_string: connString,
          name: droneName || undefined,
        }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        registerDrone(data.drone_id, data.name, connString);
        addAlert(`Connected: ${data.name} (${data.autopilot})`, 'success');
        setShowAddForm(false);
        setDroneName('');
        setTimeout(() => triggerZoomToDrone(), 500);

        // Auto-download mission, fence, cameras for the new drone
        const droneId = data.drone_id;
        const [missionRes, fenceRes, camerasRes] = await Promise.all([
          fetch(droneApi('/api/mission/download').replace(`drone_id=${useDroneStore.getState().activeDroneId}`, `drone_id=${droneId}`)).catch(() => null),
          fetch(`/api/fence/download?drone_id=${droneId}`).catch(() => null),
          fetch(`/api/cameras?drone_id=${droneId}`).catch(() => null),
        ]);

        if (missionRes) {
          try {
            const missionData = await missionRes.json();
            if (missionData.status === 'ok' && missionData.waypoints?.length > 0) {
              useDroneStore.getState().setDroneMission(droneId, missionData.waypoints);
            }
          } catch {}
        }
        if (fenceRes) {
          try {
            const fenceData = await fenceRes.json();
            if (fenceData.status === 'ok' && fenceData.fence_items?.length > 0) {
              useDroneStore.getState().setDroneFence(droneId, fenceData.fence_items);
            }
          } catch {}
        }
        if (camerasRes) {
          try {
            const camerasData = await camerasRes.json();
            if (camerasData.status === 'ok') {
              useDroneStore.getState().setDroneCameras(droneId, camerasData.cameras || [], camerasData.gimbals || []);
            }
          } catch {}
        }
      } else {
        addAlert(data.error || 'Connection failed', 'error');
      }
    } catch (err) {
      addAlert('Connection failed: ' + err.message, 'error');
    }
    setConnecting(false);
  }, [connString, droneName, registerDrone, addAlert, triggerZoomToDrone]);

  const handleDisconnect = useCallback(async (droneId) => {
    try {
      await fetch(`/api/drones/${droneId}`, { method: 'DELETE' });
    } catch {}
    removeDrone(droneId);
    addAlert('Disconnected drone', 'info');
  }, [removeDrone, addAlert]);

  const handleTypeChange = (type) => {
    const presets = {
      udp: 'udpin:0.0.0.0:14550',
      tcp: 'tcp:127.0.0.1:5760',
      serial: '/dev/ttyUSB0',
    };
    setConnType(type);
    setConnString(presets[type] || '');
  };

  const hasDrones = Object.keys(drones).length > 0;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-950/70 border-b border-gray-800/20 backdrop-blur-xl shrink-0">
      {/* Logo */}
      <span className="text-[13px] font-bold text-cyan-400/90 tracking-[0.15em] mr-0.5">PYXUS</span>

      <div className="w-px h-4 bg-gray-700/25" />

      {/* Add connection button */}
      <button
        onClick={() => setShowAddForm(!showAddForm)}
        className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold transition-all border ${
          showAddForm
            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
            : 'bg-gray-900/60 text-gray-400 hover:text-gray-200 border-gray-800/40 hover:border-gray-700/40'
        }`}
      >
        <Plus size={11} />
        Add
      </button>

      {/* Add connection form (inline) */}
      {showAddForm && (
        <>
          <select
            value={connType}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="bg-gray-900/60 text-gray-400 border border-gray-800/40 rounded px-2 py-1 text-[11px] font-mono focus:outline-none focus:border-cyan-500/30 transition-colors"
          >
            <option value="udp">UDP</option>
            <option value="tcp">TCP</option>
            <option value="serial">Serial</option>
          </select>

          <input
            type="text"
            value={connString}
            onChange={(e) => setConnString(e.target.value)}
            placeholder="Connection string..."
            className="max-w-[200px] bg-gray-900/60 text-gray-300 border border-gray-800/40 rounded px-2.5 py-1 text-[11px] font-mono focus:outline-none focus:border-cyan-500/30 transition-colors placeholder:text-gray-700"
          />

          <input
            type="text"
            value={droneName}
            onChange={(e) => setDroneName(e.target.value)}
            placeholder="Name..."
            className="max-w-[100px] bg-gray-900/60 text-gray-300 border border-gray-800/40 rounded px-2.5 py-1 text-[11px] font-mono focus:outline-none focus:border-cyan-500/30 transition-colors placeholder:text-gray-700"
          />

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="px-3 py-1 rounded text-[11px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400/80 border border-cyan-500/20 transition-all disabled:opacity-50"
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        </>
      )}

      {/* Drone selector pills */}
      {hasDrones && (
        <>
          <div className="w-px h-4 bg-gray-700/25" />
          <div className="flex items-center gap-1">
            {Object.entries(drones).map(([id, drone]) => {
              const isActive = id === activeDroneId;
              const droneConnected = drone.telemetry?.heartbeat_age >= 0 && drone.telemetry?.heartbeat_age <= 5;
              return (
                <div key={id} className="flex items-center">
                  <button
                    onClick={() => setActiveDrone(id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-l text-[11px] font-semibold transition-all border-y border-l ${
                      isActive
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                        : 'bg-gray-900/40 text-gray-500 hover:text-gray-300 border-gray-800/30 hover:bg-gray-800/30'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      droneConnected
                        ? (drone.telemetry?.armed ? 'bg-red-500 animate-pulse' : 'bg-emerald-500')
                        : 'bg-gray-600'
                    }`} />
                    {drone.name}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDisconnect(id);
                    }}
                    className={`px-1 py-1 rounded-r text-[11px] transition-all border-y border-r ${
                      isActive
                        ? 'bg-cyan-500/10 text-cyan-500/60 hover:text-red-400 hover:bg-red-500/10 border-cyan-500/30'
                        : 'bg-gray-900/40 text-gray-700 hover:text-red-400 hover:bg-red-500/10 border-gray-800/30'
                    }`}
                  >
                    <X size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Status indicators */}
      <div className="flex items-center gap-1.5 ml-auto">
        {/* WebSocket */}
        <div className="flex items-center gap-1">
          {wsConnected ? (
            <Wifi size={10} className="text-emerald-400/60" />
          ) : (
            <WifiOff size={10} className="text-red-400/60" />
          )}
          <span className="text-[9px] text-gray-600 font-medium">WS</span>
        </div>

        {activeDrone && telemetry.heartbeat_age >= 0 && (
          <>
            <div className="w-px h-3.5 bg-gray-800/40" />

            <HeartbeatIndicator age={telemetry.heartbeat_age} />

            <div className="w-px h-3.5 bg-gray-800/40" />

            {/* Armed */}
            <div className="flex items-center gap-1">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  telemetry.armed ? 'bg-red-500/80 animate-pulse' : 'bg-emerald-500/70'
                }`}
              />
              <span className={`text-[10px] font-semibold tracking-wide ${
                telemetry.armed ? 'text-red-400/80' : 'text-emerald-400/70'
              }`}>
                {telemetry.armed ? 'ARMED' : 'SAFE'}
              </span>
            </div>

            <div className="w-px h-3.5 bg-gray-800/40" />

            {/* Mode */}
            <span className="text-[10px] text-cyan-400/70 font-bold tracking-wide font-mono">
              {telemetry.mode || '--'}
            </span>

            <div className="w-px h-3.5 bg-gray-800/40" />

            {/* Platform + Autopilot */}
            <span className="text-[10px] text-gray-500/70 font-medium">
              {telemetry.platform_type} <span className="text-gray-600/50">/ {telemetry.autopilot}</span>
            </span>
          </>
        )}

        <div className="w-px h-3.5 bg-gray-800/30" />

        {/* Coord format toggle */}
        <button
          onClick={toggleCoordFormat}
          className={`p-1 rounded hover:bg-gray-800/30 transition-colors ${
            coordFormat === 'mgrs' ? 'text-cyan-400/80' : 'text-gray-500/60 hover:text-gray-400'
          }`}
          title={coordFormat === 'mgrs' ? 'Switch to Lat/Lon' : 'Switch to MGRS'}
        >
          <Grid3X3 size={12} />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-1 rounded hover:bg-gray-800/30 transition-colors text-gray-500/60 hover:text-gray-400"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
        </button>
      </div>
    </div>
  );
}
