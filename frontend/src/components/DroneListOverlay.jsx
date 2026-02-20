import React from 'react';
import useDroneStore from '../store/droneStore';
import { INITIAL_TELEMETRY } from '../store/droneStore';

// Same palette used in Map.jsx — keep in sync
const DRONE_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

// Inline SVG toggle icons (10x10) — small, no external dependency needed
function TrailIcon({ active, onClick }) {
  return (
    <button
      onClick={onClick}
      title="Toggle trail"
      className={`p-0.5 rounded transition-colors ${active ? 'text-gray-200' : 'text-gray-600'}`}
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="2,14 5,8 9,11 14,2" />
      </svg>
    </button>
  );
}

function MissionIcon({ active, onClick }) {
  return (
    <button
      onClick={onClick}
      title="Toggle mission"
      className={`p-0.5 rounded transition-colors ${active ? 'text-gray-200' : 'text-gray-600'}`}
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="4" cy="4" r="2" />
        <circle cx="12" cy="12" r="2" />
        <line x1="6" y1="4" x2="12" y2="4" />
        <line x1="12" y1="4" x2="12" y2="10" />
      </svg>
    </button>
  );
}

function FenceIcon({ active, onClick }) {
  return (
    <button
      onClick={onClick}
      title="Toggle fence"
      className={`p-0.5 rounded transition-colors ${active ? 'text-gray-200' : 'text-gray-600'}`}
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="12" height="12" strokeDasharray="3 2" />
      </svg>
    </button>
  );
}

export default function DroneListOverlay({ droneColorMap }) {
  const drones = useDroneStore((s) => s.drones);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const setActiveDrone = useDroneStore((s) => s.setActiveDrone);
  const droneVisibility = useDroneStore((s) => s.droneVisibility);
  const toggleDroneVisibility = useDroneStore((s) => s.toggleDroneVisibility);

  const droneIds = Object.keys(drones);

  // Only show when 2+ drones connected
  if (droneIds.length < 2) return null;

  return (
    <div className="absolute top-[80px] left-3 z-[1000] bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/30 shadow-xl overflow-hidden"
         style={{ maxWidth: '220px' }}
    >
      <div className="px-2 py-1 border-b border-gray-700/30">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">
          Drones ({droneIds.length})
        </span>
      </div>
      <div className="flex flex-col">
        {droneIds.map((droneId) => {
          const drone = drones[droneId];
          const t = drone.telemetry || INITIAL_TELEMETRY;
          const isActive = droneId === activeDroneId;
          const cIdx = droneColorMap?.[droneId] ?? 0;
          const color = DRONE_COLORS[cIdx];
          const vis = droneVisibility[droneId] || { trail: true, mission: true, fence: true };
          const batteryStr = t.remaining >= 0 ? `${t.remaining}%` : '--';

          return (
            <div
              key={droneId}
              className={`flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-colors ${
                isActive
                  ? 'bg-gray-800/60'
                  : 'hover:bg-gray-800/40'
              }`}
              onClick={() => { if (!isActive) setActiveDrone(droneId); }}
            >
              {/* Color dot */}
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              {/* Name */}
              <span className={`text-[10px] font-semibold truncate flex-1 min-w-0 ${
                isActive ? 'text-gray-100' : 'text-gray-400'
              }`}>
                {drone.name || droneId}
              </span>
              {/* Battery */}
              <span className={`text-[9px] tabular-nums flex-shrink-0 ${
                t.remaining >= 0 && t.remaining <= 20 ? 'text-red-400'
                  : t.remaining >= 0 && t.remaining <= 40 ? 'text-amber-400'
                  : 'text-gray-500'
              }`}>
                {batteryStr}
              </span>
              {/* Mode */}
              <span className="text-[9px] text-gray-500 truncate flex-shrink-0" style={{ maxWidth: '48px' }}>
                {t.mode || '--'}
              </span>
              {/* Visibility toggles */}
              <div className="flex items-center gap-0 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <TrailIcon active={vis.trail} onClick={() => toggleDroneVisibility(droneId, 'trail')} />
                <MissionIcon active={vis.mission} onClick={() => toggleDroneVisibility(droneId, 'mission')} />
                <FenceIcon active={vis.fence} onClick={() => toggleDroneVisibility(droneId, 'fence')} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
