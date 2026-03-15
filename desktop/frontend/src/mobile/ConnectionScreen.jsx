import React, { useState, useCallback, useEffect } from 'react';
import { Plane, Wifi, Clock, Trash2, ChevronRight, Loader2, Radio } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import { droneApi } from '../utils/api';

export default function ConnectionScreen() {
  const connectionHistory = useDroneStore((s) => s.connectionHistory);
  const removeFromConnectionHistory = useDroneStore((s) => s.removeFromConnectionHistory);
  const addToConnectionHistory = useDroneStore((s) => s.addToConnectionHistory);
  const registerDrone = useDroneStore((s) => s.registerDrone);
  const addAlert = useDroneStore((s) => s.addAlert);
  const drones = useDroneStore((s) => s.drones);
  const setDefaultAlt = useDroneStore((s) => s.setDefaultAlt);
  const setDefaultSpeed = useDroneStore((s) => s.setDefaultSpeed);
  const setTakeoffAlt = useDroneStore((s) => s.setTakeoffAlt);
  const setVideoUrl = useDroneStore((s) => s.setVideoUrl);

  const [connString, setConnString] = useState('udp:0.0.0.0:14550');
  const [droneName, setDroneName] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [swipedEntry, setSwipedEntry] = useState(null);

  // Load settings on mount + discover already-connected drones
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settingsRes = await fetch(droneApi('/api/settings'));
        const settingsData = await settingsRes.json();
        if (!cancelled && settingsData.status === 'ok') {
          const s = settingsData.settings;
          if (s.flight) {
            if (s.flight.default_alt) setDefaultAlt(s.flight.default_alt);
            if (s.flight.default_speed) setDefaultSpeed(s.flight.default_speed);
            if (s.flight.takeoff_alt) setTakeoffAlt(s.flight.takeoff_alt);
          }
          if (s.video?.url) setVideoUrl(s.video.url);
        }
      } catch {}

      try {
        const res = await fetch(droneApi('/api/drones'));
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

  const handleConnect = useCallback(async (cs, name) => {
    const existing = Object.values(drones);
    if (existing.some((d) => d.connectionString === cs)) {
      addAlert('Already connected with this connection string', 'warning');
      return;
    }

    setConnecting(true);
    try {
      const res = await fetch(droneApi('/api/drones'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_string: cs, name: name || undefined }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        registerDrone(data.drone_id, data.name, cs);
        addToConnectionHistory(data.name, cs, cs.startsWith('udp') ? 'udp' : 'tcp');
      } else {
        addAlert(data.error || 'Connection failed', 'error');
      }
    } catch (err) {
      addAlert(`Connection failed: ${err.message}`, 'error');
    } finally {
      setConnecting(false);
    }
  }, [drones, registerDrone, addToConnectionHistory, addAlert]);

  const input = 'w-full bg-gray-900/50 border border-gray-700/30 rounded-xl px-4 py-3 text-[13px] font-mono text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-600/50';

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header area */}
      <div
        className="flex flex-col items-center justify-center pt-16 pb-8"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 48px)' }}
      >
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4">
          <Plane size={32} className="text-cyan-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Pyxus</h1>
        <p className="text-sm text-gray-500 mt-1">Ground Control Station</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-8">
        {/* Manual connection */}
        <div className="space-y-3 mb-8">
          <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Connect</h2>
          <input
            type="text"
            value={connString}
            onChange={(e) => setConnString(e.target.value)}
            placeholder="udp:0.0.0.0:14550"
            className={input}
          />
          <input
            type="text"
            value={droneName}
            onChange={(e) => setDroneName(e.target.value)}
            placeholder="Drone name (optional)"
            className={input}
          />
          <button
            onClick={() => handleConnect(connString, droneName)}
            disabled={connecting || !connString.trim()}
            className="w-full py-3.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-[13px] font-semibold active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {connecting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Connecting…
              </>
            ) : (
              <>
                <Wifi size={14} />
                Connect
              </>
            )}
          </button>
        </div>

        {/* Connection history */}
        {connectionHistory.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Recent</h2>
            {connectionHistory.map((entry) => (
              <div
                key={entry.connectionString}
                className="relative overflow-hidden rounded-xl"
              >
                {/* Delete background */}
                <div className="absolute inset-y-0 right-0 w-20 bg-red-600/80 flex items-center justify-center rounded-r-xl">
                  <Trash2 size={16} className="text-white" />
                </div>

                {/* Entry card */}
                <div
                  className="relative bg-gray-900/60 border border-gray-800/30 rounded-xl px-4 py-3.5 flex items-center gap-3 active:bg-gray-800/40 transition-all"
                  style={{
                    transform: swipedEntry === entry.connectionString ? 'translateX(-80px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease-out',
                  }}
                  onClick={() => {
                    if (swipedEntry === entry.connectionString) {
                      removeFromConnectionHistory(entry.connectionString);
                      setSwipedEntry(null);
                    } else {
                      handleConnect(entry.connectionString, entry.name);
                    }
                  }}
                  onTouchStart={(e) => {
                    e.currentTarget._startX = e.touches[0].clientX;
                  }}
                  onTouchMove={(e) => {
                    const dx = e.touches[0].clientX - e.currentTarget._startX;
                    if (dx < -40) setSwipedEntry(entry.connectionString);
                    else if (dx > 20) setSwipedEntry(null);
                  }}
                >
                  <div className="w-10 h-10 rounded-lg bg-gray-800/60 flex items-center justify-center shrink-0">
                    <Radio size={16} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-200 truncate">
                      {entry.name || 'Unnamed'}
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono truncate">
                      {entry.connectionString}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-gray-600">
                      {entry.type?.toUpperCase() || 'UDP'}
                    </span>
                    <ChevronRight size={14} className="text-gray-600" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
