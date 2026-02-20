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
  const selectedDroneIds = useDroneStore((s) => s.selectedDroneIds);
  const toggleDroneSelection = useDroneStore((s) => s.toggleDroneSelection);
  const selectAllDrones = useDroneStore((s) => s.selectAllDrones);
  const clearDroneSelection = useDroneStore((s) => s.clearDroneSelection);

  const droneIds = Object.keys(drones);
  const isMultiSelect = selectedDroneIds.length > 0;
  const allSelected = droneIds.length > 0 && droneIds.every((id) => selectedDroneIds.includes(id));

  // Only show when 2+ drones connected
  if (droneIds.length < 2) return null;

  return (
    <div className="absolute top-[80px] left-3 z-[1000] bg-gray-900/80 backdrop-blur-md rounded-lg border border-gray-700/30 shadow-xl overflow-hidden"
         style={{ maxWidth: '240px' }}
    >
      <div className="px-2 py-1 border-b border-gray-700/30 flex items-center gap-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500 flex-1">
          Drones ({droneIds.length})
        </span>
        {isMultiSelect ? (
          <button
            onClick={clearDroneSelection}
            className="text-[9px] font-semibold text-gray-500 hover:text-gray-300 transition-colors px-1"
          >
            Clear
          </button>
        ) : (
          <button
            onClick={selectAllDrones}
            className="text-[9px] font-semibold text-gray-500 hover:text-cyan-400 transition-colors px-1"
            title="Select all for batch operations"
          >
            Select All
          </button>
        )}
      </div>
      <div className="flex flex-col">
        {droneIds.map((droneId) => {
          const drone = drones[droneId];
          const t = drone.telemetry || INITIAL_TELEMETRY;
          const isActive = droneId === activeDroneId;
          const isSelected = selectedDroneIds.includes(droneId);
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
              } ${isSelected ? 'border-l-2 border-l-cyan-400' : 'border-l-2 border-l-transparent'}`}
              onClick={(e) => {
                if (e.shiftKey) {
                  // Shift-click toggles batch selection
                  toggleDroneSelection(droneId);
                } else if (!isActive) {
                  setActiveDrone(droneId);
                }
              }}
            >
              {/* Selection checkbox */}
              <div
                className="flex-shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDroneSelection(droneId);
                }}
              >
                <div className={`w-3 h-3 rounded-sm border transition-colors flex items-center justify-center ${
                  isSelected
                    ? 'bg-cyan-500 border-cyan-400'
                    : 'border-gray-600 hover:border-gray-400'
                }`}>
                  {isSelected && (
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="2,6 5,9 10,3" />
                    </svg>
                  )}
                </div>
              </div>
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
      {/* Batch selection hint */}
      {!isMultiSelect && (
        <div className="px-2 py-0.5 border-t border-gray-700/30">
          <span className="text-[8px] text-gray-600 italic">Shift+click or checkbox to multi-select</span>
        </div>
      )}
      {isMultiSelect && (
        <div className="px-2 py-1 border-t border-gray-700/30 flex items-center gap-1.5">
          <span className="text-[9px] text-cyan-400 font-semibold">
            {selectedDroneIds.length} selected
          </span>
          {!allSelected && (
            <button
              onClick={selectAllDrones}
              className="text-[9px] text-gray-500 hover:text-cyan-400 transition-colors ml-auto"
            >
              All
            </button>
          )}
        </div>
      )}
    </div>
  );
}
