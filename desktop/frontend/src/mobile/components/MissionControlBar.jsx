import React, { useCallback } from 'react';
import { Play, Pause, FastForward, Trash2 } from 'lucide-react';
import useDroneStore, { EMPTY_ARRAY } from '../../store/droneStore';
import { droneApi } from '../../utils/api';

const STATUS_COLORS = {
  idle: 'text-gray-500',
  uploading: 'text-amber-400',
  uploaded: 'text-sky-400',
  running: 'text-emerald-400',
  paused: 'text-orange-400',
  upload_failed: 'text-red-400',
};

export default function MissionControlBar() {
  const missionStatus = useDroneStore((s) =>
    s.activeDroneId ? s.drones[s.activeDroneId]?.missionStatus : 'idle'
  ) || 'idle';
  const addAlert = useDroneStore((s) => s.addAlert);
  const setDroneMission = useDroneStore((s) => s.setDroneMission);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);

  const missionCall = useCallback(async (endpoint) => {
    try {
      const res = await fetch(droneApi(`/api/mission/${endpoint}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || `Mission ${endpoint} failed`, 'error');
      } else if (endpoint === 'clear' && activeDroneId) {
        setDroneMission(activeDroneId, []);
        addAlert('Mission cleared', 'success');
      }
    } catch (err) {
      addAlert(`Mission ${endpoint} failed: ${err.message}`, 'error');
    }
  }, [addAlert, setDroneMission, activeDroneId]);

  const btn = 'flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl border border-gray-700/30 bg-gray-900/60 text-[11px] font-semibold active:scale-95 transition-transform';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Mission</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[missionStatus] || STATUS_COLORS.idle}`}>
          {missionStatus}
        </span>
      </div>
      <div className="flex gap-2">
        <button onClick={() => missionCall('start')} className={`${btn} text-emerald-400`}>
          <Play size={13} /> Start
        </button>
        <button onClick={() => missionCall('pause')} className={`${btn} text-gray-300`}>
          <Pause size={13} /> Pause
        </button>
        <button onClick={() => missionCall('resume')} className={`${btn} text-cyan-400`}>
          <FastForward size={13} /> Resume
        </button>
        <button onClick={() => missionCall('clear')} className={`${btn} text-red-400`}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
