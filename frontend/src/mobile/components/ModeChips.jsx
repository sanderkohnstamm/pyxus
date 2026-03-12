import React, { useCallback } from 'react';
import useDroneStore, { INITIAL_TELEMETRY, EMPTY_ARRAY } from '../../store/droneStore';
import { droneApi } from '../../utils/api';

export default function ModeChips() {
  const telemetry = useDroneStore((s) =>
    s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : INITIAL_TELEMETRY
  ) || INITIAL_TELEMETRY;
  const availableModes = useDroneStore((s) =>
    s.activeDroneId ? s.drones[s.activeDroneId]?.availableModes : EMPTY_ARRAY
  ) || EMPTY_ARRAY;
  const backendStaticModes = useDroneStore((s) =>
    s.activeDroneId ? s.drones[s.activeDroneId]?.staticModes : EMPTY_ARRAY
  ) || EMPTY_ARRAY;
  const addAlert = useDroneStore((s) => s.addAlert);

  const useStandardModes = availableModes.length > 0;

  // Build mode list
  const modes = useStandardModes
    ? availableModes.map((m) => ({ id: String(m.standard_mode || m.mode_name), label: m.mode_name, standard_mode: m.standard_mode }))
    : (backendStaticModes.length > 0 ? backendStaticModes : ['STABILIZE', 'LOITER', 'GUIDED', 'AUTO', 'RTL', 'LAND'])
        .map((m) => ({ id: m, label: m }));

  const handleSelect = useCallback(async (mode) => {
    try {
      const body = mode.standard_mode > 0
        ? { standard_mode: mode.standard_mode }
        : { mode: mode.label };
      await fetch(droneApi('/api/mode'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      addAlert(`Mode change failed: ${err.message}`, 'error');
    }
  }, [addAlert]);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
      {modes.map((mode) => {
        const isActive = telemetry.mode === mode.label;
        return (
          <button
            key={mode.id}
            onClick={() => handleSelect(mode)}
            className={`shrink-0 px-3 py-2 rounded-xl text-[11px] font-semibold border transition-all active:scale-95 ${
              isActive
                ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                : 'bg-gray-900/60 border-gray-700/30 text-gray-400'
            }`}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
