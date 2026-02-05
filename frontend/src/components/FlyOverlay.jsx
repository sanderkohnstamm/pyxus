import React, { useCallback } from 'react';
import {
  Shield,
  ShieldOff,
  ArrowUp,
  ArrowDown,
  Home,
  Play,
  Square,
} from 'lucide-react';
import useDroneStore from '../store/droneStore';

const ARDUPILOT_MODES = ['STABILIZE', 'ALT_HOLD', 'LOITER', 'GUIDED', 'AUTO', 'RTL', 'LAND', 'POSHOLD', 'ACRO'];
const PX4_MODES = ['MANUAL', 'ALTCTL', 'POSCTL', 'OFFBOARD', 'STABILIZED', 'AUTO_MISSION', 'AUTO_RTL', 'AUTO_LAND', 'AUTO_LOITER'];

const STATUS_COLORS = {
  idle: 'bg-gray-800/60 text-gray-500 border-gray-700/30',
  uploading: 'bg-amber-950/60 text-amber-400 border-amber-800/30',
  uploaded: 'bg-sky-950/60 text-sky-400 border-sky-800/30',
  running: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/30',
  paused: 'bg-orange-950/60 text-orange-400 border-orange-800/30',
  upload_failed: 'bg-red-950/60 text-red-400 border-red-800/30',
};

export default function FlyOverlay() {
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const telemetry = useDroneStore((s) => s.telemetry);
  const missionStatus = useDroneStore((s) => s.missionStatus);
  const addAlert = useDroneStore((s) => s.addAlert);
  const takeoffAlt = useDroneStore((s) => s.takeoffAlt);

  const isConnected = connectionStatus === 'connected';

  const apiCall = useCallback(
    async (endpoint, body = {}) => {
      try {
        const res = await fetch(`/api/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.status === 'error') {
          addAlert(data.error || `${endpoint} failed`, 'error');
        }
      } catch (err) {
        addAlert(`${endpoint} failed: ${err.message}`, 'error');
      }
    },
    [addAlert]
  );

  const missionApiCall = useCallback(
    async (endpoint) => {
      try {
        const res = await fetch(`/api/mission/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (data.status === 'error') {
          addAlert(data.error || `Mission ${endpoint} failed`, 'error');
        }
      } catch (err) {
        addAlert(`Mission ${endpoint} failed: ${err.message}`, 'error');
      }
    },
    [addAlert]
  );

  if (!isConnected) return null;

  const modes = telemetry.autopilot === 'ardupilot' ? ARDUPILOT_MODES : PX4_MODES;
  const btn = 'px-3 py-1.5 rounded text-[11px] font-medium transition-all border';

  return (
    <div className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-1.5 items-end">
      {/* Mission controls */}
      <div className="flex items-center gap-1 bg-gray-900/70 backdrop-blur-md rounded-lg px-2 py-1.5 border border-gray-700/30 shadow-2xl">
        <span
          className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide border ${
            STATUS_COLORS[missionStatus] || STATUS_COLORS.idle
          }`}
        >
          {missionStatus}
        </span>
        <div className="w-px h-4 bg-gray-700/30 mx-0.5" />
        <button
          onClick={() => missionApiCall('start')}
          className={`${btn} bg-gray-800/50 hover:bg-gray-700/50 border-gray-700/30 hover:border-gray-600/40 text-gray-300`}
        >
          <Play size={10} className="inline -mt-0.5 mr-1" />Start
        </button>
        <button
          onClick={() => missionApiCall('pause')}
          className={`${btn} bg-gray-800/50 hover:bg-gray-700/50 border-gray-700/30 hover:border-gray-600/40 text-gray-300`}
        >
          <Square size={9} className="inline -mt-0.5 mr-1" />Pause
        </button>
      </div>

      {/* Flight commands + mode */}
      <div className="flex items-center gap-1 bg-gray-900/70 backdrop-blur-md rounded-lg px-2 py-1.5 border border-gray-700/30 shadow-2xl">
        <button
          onClick={() => apiCall('arm')}
          className={`${btn} ${
            telemetry.armed
              ? 'bg-red-950/50 border-red-800/30 text-red-400'
              : 'bg-gray-800/50 hover:bg-red-950/40 border-gray-700/30 hover:border-red-800/30 text-gray-300 hover:text-red-300'
          }`}
        >
          <Shield size={10} className="inline -mt-0.5 mr-1" />Arm
        </button>
        <button
          onClick={() => apiCall('disarm')}
          className={`${btn} bg-gray-800/50 hover:bg-gray-700/50 border-gray-700/30 hover:border-gray-600/40 text-gray-300`}
        >
          <ShieldOff size={10} className="inline -mt-0.5 mr-1" />Disarm
        </button>

        <div className="w-px h-4 bg-gray-700/30 mx-0.5" />

        <button
          onClick={() => apiCall('takeoff', { alt: takeoffAlt })}
          className={`${btn} bg-gray-800/50 hover:bg-gray-700/50 border-gray-700/30 hover:border-gray-600/40 text-gray-300`}
        >
          <ArrowUp size={10} className="inline -mt-0.5 mr-1" />Takeoff
        </button>
        <button
          onClick={() => apiCall('land')}
          className={`${btn} bg-gray-800/50 hover:bg-gray-700/50 border-gray-700/30 hover:border-gray-600/40 text-gray-300`}
        >
          <ArrowDown size={10} className="inline -mt-0.5 mr-1" />Land
        </button>
        <button
          onClick={() => apiCall('rtl')}
          className={`${btn} bg-amber-950/40 hover:bg-amber-950/50 border-amber-900/25 hover:border-amber-800/35 text-amber-400`}
        >
          <Home size={10} className="inline -mt-0.5 mr-1" />RTL
        </button>

        <div className="w-px h-4 bg-gray-700/30 mx-0.5" />

        <select
          value={telemetry.mode}
          onChange={(e) => apiCall('mode', { mode: e.target.value })}
          className="bg-gray-800/60 text-gray-300 border border-gray-700/30 rounded px-2 py-1 text-[11px] font-medium focus:outline-none focus:border-gray-600/40 transition-colors"
        >
          {modes.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
