import React from 'react';
import { Heart, Battery, Satellite, Shield, ShieldOff } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import { INITIAL_TELEMETRY } from '../store/droneStore';

export default function StatusStrip({ onTap }) {
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const drones = useDroneStore((s) => s.drones);
  const activeDrone = activeDroneId ? drones[activeDroneId] : null;
  const tel = activeDrone?.telemetry || INITIAL_TELEMETRY;
  const linkLost = activeDrone?.linkLost || false;
  const wsConnected = useDroneStore((s) => s.wsConnected);

  const isConnected = !!activeDroneId;

  // Heartbeat color
  let heartColor = 'text-gray-600';
  let heartPulse = false;
  if (isConnected && tel.heartbeat_age >= 0) {
    if (tel.heartbeat_age <= 2) {
      heartColor = 'text-emerald-400';
      heartPulse = true;
    } else if (tel.heartbeat_age <= 5) {
      heartColor = 'text-amber-400';
    } else {
      heartColor = 'text-red-400';
    }
  }

  // Battery color
  let battColor = 'text-gray-500';
  if (tel.remaining >= 0) {
    if (tel.remaining > 30) battColor = 'text-emerald-400';
    else if (tel.remaining > 15) battColor = 'text-amber-400';
    else battColor = 'text-red-400';
  }

  return (
    <>
      <div
        onClick={onTap}
        className="fixed top-0 left-0 right-0 z-[100] flex items-center gap-3 px-4 h-[44px] bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/20"
        style={{ paddingTop: 'env(safe-area-inset-top)' , height: 'calc(44px + env(safe-area-inset-top))' }}
      >
        {/* Drone name + armed indicator */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isConnected ? (
            <>
              {tel.armed ? (
                <ShieldOff size={14} className="text-red-400 shrink-0" />
              ) : (
                <Shield size={14} className="text-gray-500 shrink-0" />
              )}
              <span className="text-sm font-semibold truncate">
                {activeDrone?.name || activeDroneId}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                tel.armed ? 'bg-red-500/20 text-red-300' : 'bg-gray-800/50 text-gray-400'
              }`}>
                {tel.mode || 'N/A'}
              </span>
            </>
          ) : (
            <span className="text-sm text-gray-500">
              {wsConnected ? 'No drone connected' : 'Connecting…'}
            </span>
          )}
        </div>

        {/* Right side: heartbeat, GPS, battery */}
        {isConnected && (
          <div className="flex items-center gap-3 shrink-0">
            {/* Heartbeat */}
            <Heart size={12} className={`${heartColor} ${heartPulse ? 'animate-pulse' : ''}`} />

            {/* GPS */}
            <div className="flex items-center gap-1">
              <Satellite size={12} className={tel.fix_type >= 3 ? 'text-emerald-400' : 'text-gray-500'} />
              <span className="text-[11px] text-gray-400">{tel.satellites || 0}</span>
            </div>

            {/* Battery */}
            <div className="flex items-center gap-1">
              <Battery size={12} className={battColor} />
              <span className={`text-[11px] font-medium ${battColor}`}>
                {tel.remaining >= 0 ? `${tel.remaining}%` : '--'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Link lost banner */}
      {linkLost && (
        <div
          className="fixed left-0 right-0 z-[99] flex items-center justify-center py-1.5 bg-red-600/90 backdrop-blur-sm animate-pulse"
          style={{ top: 'calc(44px + env(safe-area-inset-top))' }}
        >
          <span className="text-xs font-bold text-white tracking-wider">LINK LOST</span>
        </div>
      )}
    </>
  );
}
