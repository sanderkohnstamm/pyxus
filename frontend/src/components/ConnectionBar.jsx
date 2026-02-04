import React, { useCallback, useEffect } from 'react';
import { Wifi, WifiOff, Plug, Unplug, Heart, Sun, Moon } from 'lucide-react';
import useDroneStore from '../store/droneStore';

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
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const connectionString = useDroneStore((s) => s.connectionString);
  const connectionType = useDroneStore((s) => s.connectionType);
  const setConnectionString = useDroneStore((s) => s.setConnectionString);
  const setConnectionType = useDroneStore((s) => s.setConnectionType);
  const setConnectionStatus = useDroneStore((s) => s.setConnectionStatus);
  const addAlert = useDroneStore((s) => s.addAlert);
  const resetState = useDroneStore((s) => s.resetState);
  const wsConnected = useDroneStore((s) => s.wsConnected);
  const telemetry = useDroneStore((s) => s.telemetry);
  const theme = useDroneStore((s) => s.theme);
  const toggleTheme = useDroneStore((s) => s.toggleTheme);

  const setDroneMission = useDroneStore((s) => s.setDroneMission);
  const setDroneFence = useDroneStore((s) => s.setDroneFence);

  // Check backend connection status on mount (handles page refresh)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        if (cancelled) return;
        if (data.status === 'connected') {
          setConnectionStatus('connected');

          // Auto-download mission and fence
          try {
            const missionRes = await fetch('/api/mission/download');
            const missionData = await missionRes.json();
            if (!cancelled && missionData.status === 'ok' && missionData.waypoints?.length > 0) {
              setDroneMission(missionData.waypoints);
            }
          } catch {}

          try {
            const fenceRes = await fetch('/api/fence/download');
            const fenceData = await fenceRes.json();
            if (!cancelled && fenceData.status === 'ok' && fenceData.fence_items?.length > 0) {
              setDroneFence(fenceData.fence_items);
            }
          } catch {}
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = useCallback(async () => {
    if (connectionStatus === 'connected') {
      try {
        await fetch('/api/disconnect', { method: 'POST' });
      } catch {}
      resetState();
      addAlert('Disconnected from vehicle', 'info');
      return;
    }

    setConnectionStatus('connecting');
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_string: connectionString }),
      });
      const data = await res.json();
      if (data.status === 'connected') {
        setConnectionStatus('connected');
        addAlert(`Connected (${data.autopilot})`, 'success');

        // Auto-download mission and fence from drone
        try {
          const missionRes = await fetch('/api/mission/download');
          const missionData = await missionRes.json();
          if (missionData.status === 'ok' && missionData.waypoints && missionData.waypoints.length > 0) {
            setDroneMission(missionData.waypoints);
            addAlert(`Downloaded ${missionData.waypoints.length} mission items from drone`, 'info');
          }
        } catch {}

        try {
          const fenceRes = await fetch('/api/fence/download');
          const fenceData = await fenceRes.json();
          if (fenceData.status === 'ok' && fenceData.fence_items && fenceData.fence_items.length > 0) {
            setDroneFence(fenceData.fence_items);
            addAlert(`Downloaded ${fenceData.fence_items.length} fence items from drone`, 'info');
          }
        } catch {}
      } else {
        setConnectionStatus('disconnected');
        addAlert(data.error || 'Connection failed', 'error');
      }
    } catch (err) {
      setConnectionStatus('disconnected');
      addAlert('Connection failed: ' + err.message, 'error');
    }
  }, [connectionStatus, connectionString, setConnectionStatus, addAlert, resetState, setDroneMission, setDroneFence]);

  const isConnected = connectionStatus === 'connected';
  const isConnecting = connectionStatus === 'connecting';

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 bg-gray-950/70 border-b border-gray-800/20 backdrop-blur-xl shrink-0">
      {/* Logo */}
      <span className="text-[13px] font-bold text-cyan-400/90 tracking-[0.15em] mr-0.5">PYXUS</span>

      <div className="w-px h-4 bg-gray-700/25" />

      {/* Connection type */}
      <select
        value={connectionType}
        onChange={(e) => setConnectionType(e.target.value)}
        disabled={isConnected || isConnecting}
        className="bg-gray-900/60 text-gray-400 border border-gray-800/40 rounded px-2 py-1 text-[11px] font-mono focus:outline-none focus:border-cyan-500/30 disabled:opacity-30 transition-colors"
      >
        <option value="udp">UDP</option>
        <option value="tcp">TCP</option>
        <option value="serial">Serial</option>
      </select>

      {/* Connection string */}
      <input
        type="text"
        value={connectionString}
        onChange={(e) => setConnectionString(e.target.value)}
        disabled={isConnected || isConnecting}
        placeholder="Connection string..."
        className="flex-1 max-w-[260px] bg-gray-900/60 text-gray-300 border border-gray-800/40 rounded px-2.5 py-1 text-[11px] font-mono focus:outline-none focus:border-cyan-500/30 disabled:opacity-30 transition-colors placeholder:text-gray-700"
      />

      {/* Connect button */}
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className={`flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold transition-all ${
          isConnected
            ? 'bg-red-500/15 hover:bg-red-500/25 text-red-400/80 border border-red-500/20'
            : isConnecting
            ? 'bg-amber-500/15 text-amber-400/70 border border-amber-500/20 cursor-wait'
            : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-400/80 border border-cyan-500/20'
        }`}
      >
        {isConnected ? (
          <>
            <Unplug size={11} /> Disconnect
          </>
        ) : isConnecting ? (
          'Connecting...'
        ) : (
          <>
            <Plug size={11} /> Connect
          </>
        )}
      </button>

      {/* Status indicators */}
      <div className="flex items-center gap-2 ml-auto">
        {/* WebSocket */}
        <div className="flex items-center gap-1">
          {wsConnected ? (
            <Wifi size={10} className="text-emerald-400/60" />
          ) : (
            <WifiOff size={10} className="text-red-400/60" />
          )}
          <span className="text-[9px] text-gray-600 font-medium">WS</span>
        </div>

        {isConnected && (
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

            {/* Platform + Autopilot combined */}
            <span className="text-[10px] text-gray-500/70 font-medium">
              {telemetry.platform_type} <span className="text-gray-600/50">/ {telemetry.autopilot}</span>
            </span>
          </>
        )}

        <div className="w-px h-3.5 bg-gray-800/40" />

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-1 rounded hover:bg-gray-800/30 transition-colors text-gray-500/60 hover:text-gray-400"
        >
          {theme === 'dark' ? <Sun size={12} /> : <Moon size={12} />}
        </button>
      </div>
    </div>
  );
}
