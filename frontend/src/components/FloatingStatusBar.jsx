import React, { useMemo } from 'react';
import { Menu, Wifi, WifiOff } from 'lucide-react';
import useDroneStore, { INITIAL_TELEMETRY } from '../store/droneStore';

const FIX_TYPES = { 0: 'No GPS', 1: 'No Fix', 2: '2D', 3: '3D', 4: 'DGPS', 5: 'RTK F', 6: 'RTK' };

function StatusDot({ color, pulse }) {
  return <span className={`w-2 h-2 rounded-full ${color} ${pulse ? 'animate-pulse' : ''} shrink-0`} />;
}

function Chip({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-medium ${className}`}>
      {children}
    </span>
  );
}

function Divider() {
  return <div className="w-px h-4 bg-gray-600/30 shrink-0" />;
}

export default function FloatingStatusBar() {
  const drones = useDroneStore((s) => s.drones);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const wsConnected = useDroneStore((s) => s.wsConnected);
  const toggleMenu = useDroneStore((s) => s.toggleMenu);
  const toggleDronePopover = useDroneStore((s) => s.toggleDronePopover);

  const activeDrone = activeDroneId ? drones[activeDroneId] : null;
  const telemetry = activeDrone?.telemetry || INITIAL_TELEMETRY;
  const hasActiveDrone = !!activeDroneId;
  const heartbeatAge = telemetry.heartbeat_age;
  const hasHeartbeat = heartbeatAge >= 0;
  const isLive = heartbeatAge >= 0 && heartbeatAge <= 2;
  const isDelayed = heartbeatAge > 2 && heartbeatAge <= 5;
  const isLost = heartbeatAge > 5;

  const battPct = telemetry.remaining;
  const battLow = battPct >= 0 && battPct <= 20;
  const battCrit = battPct >= 0 && battPct <= 10;

  // Link-lost drones
  const lostDrones = useMemo(() => {
    const lost = [];
    for (const [id, d] of Object.entries(drones)) {
      if (d.linkLost) lost.push({ id, name: d.name || id });
    }
    return lost;
  }, [drones]);

  return (
    <div className="fixed top-3 left-3 right-3 z-[100] flex items-center gap-2">
      {/* Main status bar */}
      <div
        className="flex-1 flex items-center gap-1.5 px-3 py-1.5 backdrop-blur-xl bg-gray-900/80 border border-gray-700/25 rounded-xl shadow-xl cursor-pointer min-w-0"
        onClick={toggleDronePopover}
      >
        {/* Connection indicator */}
        {wsConnected ? (
          <Wifi size={11} className="text-gray-500 shrink-0" />
        ) : (
          <WifiOff size={11} className="text-red-400/70 shrink-0" />
        )}

        {hasActiveDrone ? (
          <>
            {/* Heartbeat */}
            {!hasHeartbeat && <StatusDot color="bg-gray-500" />}
            {isLive && <StatusDot color="bg-emerald-500" pulse />}
            {isDelayed && <StatusDot color="bg-amber-500" />}
            {isLost && <StatusDot color="bg-red-500" />}

            {/* Drone name */}
            <span className="text-[11px] font-semibold text-gray-200 truncate">
              {activeDrone?.name || 'Drone'}
            </span>

            {!hasHeartbeat ? (
              <span className="text-[10px] text-gray-500 italic">Connecting…</span>
            ) : (
              <>
                <Divider />

                {/* Armed state */}
                {telemetry.armed ? (
                  <span className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-[9px] font-bold text-red-300 uppercase tracking-wider animate-pulse shrink-0">
                    ARMED
                  </span>
                ) : (
                  <span className="text-[9px] font-bold text-emerald-400/70 uppercase tracking-wider shrink-0">SAFE</span>
                )}

                {/* Mode */}
                <span className="px-1.5 py-0.5 rounded bg-gray-800/60 text-[9px] font-bold text-gray-300 uppercase tracking-wider font-mono shrink-0">
                  {telemetry.mode || '--'}
                </span>

                <Divider />

                {/* Telemetry values — desktop */}
                <div className="hidden md:flex items-center gap-1 min-w-0">
                  <Chip className="text-gray-400">
                    ALT <span className="text-gray-200">{telemetry.alt.toFixed(0)}</span><span className="text-gray-600 text-[8px]">m</span>
                  </Chip>
                  <Chip className="text-gray-400">
                    GS <span className="text-gray-200">{telemetry.groundspeed.toFixed(1)}</span><span className="text-gray-600 text-[8px]">m/s</span>
                  </Chip>
                  <Chip className="text-gray-400">
                    VS <span className="text-gray-200">{telemetry.climb >= 0 ? '+' : ''}{telemetry.climb.toFixed(1)}</span><span className="text-gray-600 text-[8px]">m/s</span>
                  </Chip>
                  <Chip className="text-gray-400">
                    HDG <span className="text-gray-200">{telemetry.heading}&deg;</span>
                  </Chip>

                  <Divider />

                  {/* Battery */}
                  <Chip className={battCrit ? 'text-red-400 animate-pulse' : battLow ? 'text-amber-400' : 'text-gray-400'}>
                    BAT{' '}
                    <span className={battCrit ? 'text-red-300' : battLow ? 'text-amber-300' : 'text-gray-200'}>
                      {battPct >= 0 ? `${battPct}%` : '--'}
                    </span>
                  </Chip>
                  {telemetry.voltage > 0 && (
                    <Chip className={battCrit ? 'text-red-400' : 'text-gray-500'}>
                      <span className="text-gray-300">{telemetry.voltage.toFixed(1)}</span><span className="text-gray-600 text-[8px]">V</span>
                    </Chip>
                  )}
                  {telemetry.current > 0 && (
                    <Chip className="text-gray-500">
                      <span className="text-gray-300">{telemetry.current.toFixed(1)}</span><span className="text-gray-600 text-[8px]">A</span>
                    </Chip>
                  )}

                  <Divider />

                  {/* GPS */}
                  <Chip className={telemetry.fix_type >= 3 ? 'text-gray-400' : 'text-amber-400'}>
                    {FIX_TYPES[telemetry.fix_type] || telemetry.fix_type}
                  </Chip>
                  <Chip className="text-gray-400">
                    <span className="text-gray-200">{telemetry.satellites}</span><span className="text-gray-600 text-[8px]">sat</span>
                  </Chip>
                </div>

                {/* Mobile: compact telemetry */}
                <div className="flex md:hidden items-center gap-1 min-w-0">
                  <Chip className="text-gray-400">
                    <span className="text-gray-200">{telemetry.alt.toFixed(0)}</span><span className="text-gray-600 text-[8px]">m</span>
                  </Chip>
                  <Chip className={battLow ? 'text-red-400' : 'text-gray-400'}>
                    <span className={battLow ? 'text-red-300' : 'text-gray-200'}>{battPct >= 0 ? `${battPct}%` : '--'}</span>
                  </Chip>
                </div>
              </>
            )}
          </>
        ) : (
          <span className="text-[11px] text-gray-500">No drone connected</span>
        )}

        {/* Platform info (desktop only, when connected) */}
        {hasActiveDrone && hasHeartbeat && telemetry.platform_type && (
          <span className="hidden lg:inline text-[9px] text-gray-600 font-mono ml-auto shrink-0">
            {telemetry.platform_type} / {telemetry.autopilot === 'ardupilot' ? 'AP' : 'PX4'}
          </span>
        )}
      </div>

      {/* Link-lost banner */}
      {lostDrones.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 backdrop-blur-xl bg-red-950/70 border border-red-500/25 rounded-xl shadow-xl animate-pulse">
          <span className="text-[10px] font-bold text-red-300 tracking-wide">LINK LOST</span>
          {lostDrones.map((d) => (
            <span key={d.id} className="text-[10px] text-red-200/70">{d.name}</span>
          ))}
        </div>
      )}

      {/* Hamburger */}
      <div
        className="flex items-center justify-center w-9 h-9 backdrop-blur-xl bg-gray-900/80 border border-gray-700/25 rounded-xl shadow-xl cursor-pointer hover:bg-gray-800/80 transition-colors shrink-0"
        onClick={toggleMenu}
      >
        <Menu size={16} className="text-gray-400" />
      </div>
    </div>
  );
}
