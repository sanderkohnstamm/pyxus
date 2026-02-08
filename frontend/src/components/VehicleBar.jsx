import React from 'react';
import useDroneStore from '../store/droneStore';

export default function VehicleBar() {
  const vehicles = useDroneStore((s) => s.vehicles);
  const activeVehicleId = useDroneStore((s) => s.activeVehicleId);
  const setActiveVehicle = useDroneStore((s) => s.setActiveVehicle);
  const addAlert = useDroneStore((s) => s.addAlert);

  const entries = Object.entries(vehicles);
  if (entries.length <= 1) return null;

  const handleSwitch = async (vid) => {
    if (vid === activeVehicleId) return;
    setActiveVehicle(vid);
    try {
      await fetch('/api/vehicles/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle_id: vid }),
      });
    } catch {}
    addAlert(`Switched to vehicle ${vid}`, 'info');
  };

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-950/50 border-b border-gray-800/15 overflow-x-auto">
      <span className="text-[9px] text-gray-600 font-semibold tracking-wider mr-1">VEHICLES</span>
      {entries.map(([vid, v]) => {
        const t = v.telemetry || {};
        const color = v.color || '#06b6d4';
        const isActive = vid === activeVehicleId;
        return (
          <button
            key={vid}
            onClick={() => handleSwitch(vid)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold transition-all border whitespace-nowrap ${
              isActive
                ? 'bg-gray-800/60 border-gray-600/40 text-gray-200'
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
            }`}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color, boxShadow: isActive ? `0 0 6px ${color}` : 'none' }}
            />
            <span>{t.platform_type || 'Vehicle'}</span>
            <span className="text-gray-600">#{vid}</span>
            {t.armed && (
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>
        );
      })}
    </div>
  );
}
