import React, { useCallback, useEffect, useState } from 'react';
import {
  Shield,
  ShieldOff,
  ArrowUp,
  ArrowDown,
  Home,
  Play,
  Square,
  Trash2,
  FastForward,
  Layers,
  Check,
  X,
  Loader2,
} from 'lucide-react';
import useDroneStore, { INITIAL_TELEMETRY } from '../store/droneStore';
import { droneApi, executeBatchCommand } from '../utils/api';
import PreFlightChecklist from './PreFlightChecklist';

const ARDUPILOT_MODES = [
  'STABILIZE', 'ALT_HOLD', 'LOITER', 'POSHOLD', 'GUIDED', 'AUTO',
  'RTL', 'SMART_RTL', 'LAND', 'BRAKE',
  'ACRO', 'SPORT', 'DRIFT',
  'CIRCLE', 'AUTOTUNE', 'FLIP', 'THROW',
  'GUIDED_NOGPS', 'AVOID_ADSB',
];
const PX4_MODES = [
  'MANUAL', 'STABILIZED', 'ALTCTL', 'POSCTL', 'ACRO', 'RATTITUDE',
  'OFFBOARD',
  'AUTO_MISSION', 'AUTO_LOITER', 'AUTO_RTL', 'AUTO_LAND',
  'AUTO_TAKEOFF', 'AUTO_FOLLOW',
];

const STATUS_COLORS = {
  idle: 'bg-gray-800/60 text-gray-500 border-gray-700/30',
  uploading: 'bg-amber-950/60 text-amber-400 border-amber-800/30',
  uploaded: 'bg-sky-950/60 text-sky-400 border-sky-800/30',
  running: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/30',
  paused: 'bg-orange-950/60 text-orange-400 border-orange-800/30',
  upload_failed: 'bg-red-950/60 text-red-400 border-red-800/30',
};

export default function FlyOverlay() {
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const telemetry = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : INITIAL_TELEMETRY) || INITIAL_TELEMETRY;
  const missionStatus = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.missionStatus : 'idle') || 'idle';
  const availableModes = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.availableModes : []) || [];
  const backendStaticModes = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.staticModes : []) || [];
  const setDroneAvailableModes = useDroneStore((s) => s.setDroneAvailableModes);
  const addAlert = useDroneStore((s) => s.addAlert);
  const addGcsLog = useDroneStore((s) => s.addGcsLog);
  const takeoffAlt = useDroneStore((s) => s.takeoffAlt);
  const setShowPreFlightChecklist = useDroneStore((s) => s.setShowPreFlightChecklist);
  const setDroneMission = useDroneStore((s) => s.setDroneMission);
  const capabilities = telemetry.capabilities || null;

  // Fetch available modes when drone changes, with delay and retry
  // The vehicle needs time to respond to AVAILABLE_MODES requests after connection
  useEffect(() => {
    if (!activeDroneId) return;
    let cancelled = false;

    const fetchModes = async () => {
      try {
        const res = await fetch(droneApi(`/api/modes?drone_id=${activeDroneId}`));
        const data = await res.json();
        if (cancelled) return null;
        if (data.status === 'ok') {
          setDroneAvailableModes(
            activeDroneId,
            data.modes || [],
            data.static_modes || [],
          );
          return data;
        }
        return data;
      } catch {
        return null;
      }
    };

    // Initial fetch after 2s delay (let the vehicle respond to mode request)
    const t1 = setTimeout(async () => {
      const result = await fetchModes();
      if (cancelled) return;
      // Retry after 3 more seconds if standard modes incomplete
      const got = result?.modes?.length || 0;
      const total = result?.total_modes || 0;
      if (total > 0 && got < total) {
        const t2 = setTimeout(() => { if (!cancelled) fetchModes(); }, 3000);
        cleanupTimers.push(t2);
      }
    }, 2000);

    const cleanupTimers = [t1];
    return () => {
      cancelled = true;
      cleanupTimers.forEach(clearTimeout);
    };
  }, [activeDroneId, setDroneAvailableModes]);

  const isConnected = !!activeDroneId;

  const apiCall = useCallback(
    async (endpoint, body = {}, logMsg) => {
      const label = logMsg || endpoint;
      try {
        const res = await fetch(droneApi(`/api/${endpoint}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.status === 'error') {
          addAlert(data.error || `${endpoint} failed`, 'error');
          addGcsLog(`${label}: ${data.error || 'failed'}`, 'error');
        } else {
          addGcsLog(`${label} command sent`, 'info');
        }
      } catch (err) {
        addAlert(`${endpoint} failed: ${err.message}`, 'error');
        addGcsLog(`${label}: ${err.message}`, 'error');
      }
    },
    [addAlert, addGcsLog]
  );

  const missionApiCall = useCallback(
    async (endpoint) => {
      try {
        const res = await fetch(droneApi(`/api/mission/${endpoint}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (data.status === 'error') {
          addAlert(data.error || `Mission ${endpoint} failed`, 'error');
          addGcsLog(`Mission ${endpoint}: ${data.error || 'failed'}`, 'error');
        } else if (endpoint === 'clear') {
          const droneId = useDroneStore.getState().activeDroneId;
          if (droneId) setDroneMission(droneId, []);
          addAlert('Mission cleared from drone', 'success');
          addGcsLog('Mission cleared from drone', 'info');
        } else {
          addGcsLog(`Mission ${endpoint} command sent`, 'info');
        }
      } catch (err) {
        addAlert(`Mission ${endpoint} failed: ${err.message}`, 'error');
        addGcsLog(`Mission ${endpoint}: ${err.message}`, 'error');
      }
    },
    [addAlert, addGcsLog, setDroneMission]
  );

  // Battery critical threshold check for RTL banner
  const batteryRemaining = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.remaining : -1) ?? -1;
  const batteryCritThreshold = useDroneStore((s) => s.batteryCritThreshold);
  const isBatteryCritical = batteryRemaining >= 0 && batteryRemaining <= batteryCritThreshold;

  if (!isConnected) return null;

  const useStandardModes = availableModes.length > 0;
  // Use backend-provided static modes (vehicle-type-aware), fallback to hardcoded
  const baseModes = backendStaticModes.length > 0
    ? backendStaticModes
    : (telemetry.autopilot === 'ardupilot' ? ARDUPILOT_MODES : PX4_MODES);
  // Ensure current mode is always in the list so the dropdown shows it correctly
  const staticModes = telemetry.mode && !baseModes.includes(telemetry.mode)
    ? [telemetry.mode, ...baseModes]
    : baseModes;
  const btn = 'px-3 py-1.5 rounded text-[11px] font-medium transition-all border';

  // Vehicle capability flags
  const supportsTakeoff = capabilities?.supports_takeoff !== false;
  const hasAltitude = capabilities?.has_altitude !== false;
  const isGroundOrSurface = capabilities?.category === 'ground' || capabilities?.category === 'surface';
  const landLabel = isGroundOrSurface ? 'Stop' : 'Land';

  const handleModeChange = useCallback((e) => {
    const val = e.target.value;
    if (useStandardModes) {
      const entry = availableModes.find((m) => String(m.standard_mode) === val);
      if (entry && entry.standard_mode > 0) {
        apiCall('mode', { standard_mode: entry.standard_mode }, `Mode → ${entry.mode_name}`);
      } else if (entry) {
        apiCall('mode', { mode: entry.mode_name }, `Mode → ${entry.mode_name}`);
      }
    } else {
      apiCall('mode', { mode: val }, `Mode → ${val}`);
    }
  }, [useStandardModes, availableModes, apiCall]);

  return (
    <div className="absolute bottom-4 right-4 z-[1000] flex flex-col gap-1.5 items-end">
      {/* RTL Suggested banner */}
      {isBatteryCritical && telemetry.armed && (
        <button
          onClick={() => apiCall('rtl', {}, 'RTL')}
          className="flex items-center gap-2 px-4 py-2 bg-red-950/70 backdrop-blur-md rounded-lg border border-red-700/50 shadow-2xl animate-pulse cursor-pointer hover:bg-red-900/70 transition-colors"
        >
          <Home size={14} className="text-red-400" />
          <span className="text-[12px] font-bold text-red-300 tracking-wide uppercase">RTL Suggested -- Battery {batteryRemaining}%</span>
        </button>
      )}

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
        <button
          onClick={() => missionApiCall('resume')}
          className={`${btn} bg-emerald-950/40 hover:bg-emerald-950/50 border-emerald-900/25 hover:border-emerald-800/35 text-emerald-400`}
          title="Continue mission from current waypoint"
        >
          <FastForward size={10} className="inline -mt-0.5 mr-1" />Continue
        </button>
        <button
          onClick={() => missionApiCall('clear')}
          className={`${btn} bg-red-950/40 hover:bg-red-950/50 border-red-900/25 hover:border-red-800/35 text-red-400`}
          title="Clear mission from drone"
        >
          <Trash2 size={9} className="inline -mt-0.5 mr-1" />Clear
        </button>
      </div>

      {/* Flight commands + mode */}
      <div className="flex items-center gap-1 bg-gray-900/70 backdrop-blur-md rounded-lg px-2 py-1.5 border border-gray-700/30 shadow-2xl">
        <button
          onClick={() => {
            if (!telemetry.armed) {
              setShowPreFlightChecklist(true);
            } else {
              apiCall('arm', {}, 'Arm');
            }
          }}
          className={`${btn} ${
            telemetry.armed
              ? 'bg-red-950/50 border-red-800/30 text-red-400'
              : 'bg-gray-800/50 hover:bg-red-950/40 border-gray-700/30 hover:border-red-800/30 text-gray-300 hover:text-red-300'
          }`}
        >
          <Shield size={10} className="inline -mt-0.5 mr-1" />Arm
        </button>
        <button
          onClick={() => apiCall('disarm', {}, 'Disarm')}
          className={`${btn} bg-gray-800/50 hover:bg-gray-700/50 border-gray-700/30 hover:border-gray-600/40 text-gray-300`}
        >
          <ShieldOff size={10} className="inline -mt-0.5 mr-1" />Disarm
        </button>

        <div className="w-px h-4 bg-gray-700/30 mx-0.5" />

        {supportsTakeoff && (
          <button
            onClick={() => apiCall('takeoff', { alt: takeoffAlt }, `Takeoff ${takeoffAlt}m`)}
            className={`${btn} bg-gray-800/50 hover:bg-gray-700/50 border-gray-700/30 hover:border-gray-600/40 text-gray-300`}
          >
            <ArrowUp size={10} className="inline -mt-0.5 mr-1" />Takeoff
          </button>
        )}
        <button
          onClick={() => apiCall('land', {}, landLabel)}
          className={`${btn} bg-gray-800/50 hover:bg-gray-700/50 border-gray-700/30 hover:border-gray-600/40 text-gray-300`}
        >
          {isGroundOrSurface
            ? <Square size={9} className="inline -mt-0.5 mr-1" />
            : <ArrowDown size={10} className="inline -mt-0.5 mr-1" />
          }{landLabel}
        </button>
        <button
          onClick={() => apiCall('rtl', {}, 'RTL')}
          className={`${btn} ${
            isBatteryCritical
              ? 'bg-red-950/60 hover:bg-red-900/60 border-red-700/50 hover:border-red-600/50 text-red-300 animate-pulse'
              : 'bg-amber-950/40 hover:bg-amber-950/50 border-amber-900/25 hover:border-amber-800/35 text-amber-400'
          }`}
        >
          <Home size={10} className="inline -mt-0.5 mr-1" />RTL
        </button>

        <div className="w-px h-4 bg-gray-700/30 mx-0.5" />

        <select
          value={useStandardModes
            ? (availableModes.find((m) => m.mode_name === telemetry.mode)?.standard_mode ?? '')
            : telemetry.mode
          }
          onChange={handleModeChange}
          className="bg-gray-800/60 text-gray-300 border border-gray-700/30 rounded px-2 py-1 text-[11px] font-medium focus:outline-none focus:border-gray-600/40 transition-colors"
        >
          {useStandardModes ? (
            availableModes.map((m) => (
              <option key={m.mode_index} value={m.standard_mode}>
                {m.mode_name}{m.advanced ? ' ★' : ''}
              </option>
            ))
          ) : (
            staticModes.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))
          )}
        </select>
      </div>

      <PreFlightChecklist />

      {/* Batch controls overlay */}
      <BatchControlsBar />
    </div>
  );
}


// --- Batch Controls Bar ---

function BatchStatusDot({ status }) {
  if (status === 'pending') return <Loader2 size={10} className="text-gray-400 animate-spin" />;
  if (status === 'success') return <Check size={10} className="text-emerald-400" />;
  if (status === 'error') return <X size={10} className="text-red-400" />;
  return null;
}

function BatchControlsBar() {
  const selectedDroneIds = useDroneStore((s) => s.selectedDroneIds);
  const drones = useDroneStore((s) => s.drones);
  const batchCommandStatus = useDroneStore((s) => s.batchCommandStatus);
  const addAlert = useDroneStore((s) => s.addAlert);
  const addGcsLog = useDroneStore((s) => s.addGcsLog);
  const clearDroneSelection = useDroneStore((s) => s.clearDroneSelection);
  const [running, setRunning] = useState(false);

  if (selectedDroneIds.length < 2) return null;

  const btn = 'px-3 py-1.5 rounded text-[11px] font-medium transition-all border';

  const runBatch = async (endpoint, label) => {
    if (running) return;
    setRunning(true);
    addGcsLog(`Batch ${label}: sending to ${selectedDroneIds.length} drones`, 'info');
    await executeBatchCommand(selectedDroneIds, endpoint, {}, addAlert);
    addGcsLog(`Batch ${label}: complete`, 'info');
    setRunning(false);
  };

  const hasStatus = Object.keys(batchCommandStatus).length > 0;

  return (
    <div className="flex flex-col gap-1 items-end">
      {/* Batch mode indicator + per-drone status */}
      <div className="flex items-center gap-1.5 bg-gray-900/70 backdrop-blur-md rounded-lg px-2.5 py-1.5 border border-cyan-500/30 shadow-2xl">
        <Layers size={11} className="text-cyan-400" />
        <span className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">
          Batch Mode
        </span>
        <span className="text-[10px] text-gray-400">
          {selectedDroneIds.length} drones
        </span>
        <div className="w-px h-3.5 bg-gray-700/30 mx-0.5" />
        {/* Per-drone mini status */}
        {selectedDroneIds.map((id) => {
          const drone = drones[id];
          const status = batchCommandStatus[id];
          return (
            <div key={id} className="flex items-center gap-0.5" title={drone?.name || id}>
              <span className="text-[9px] text-gray-500 truncate" style={{ maxWidth: '50px' }}>
                {drone?.name || id}
              </span>
              {hasStatus && <BatchStatusDot status={status} />}
            </div>
          );
        })}
      </div>

      {/* Batch action buttons */}
      <div className="flex items-center gap-1 bg-gray-900/70 backdrop-blur-md rounded-lg px-2 py-1.5 border border-gray-700/30 shadow-2xl">
        <button
          onClick={() => runBatch('arm', 'Arm')}
          disabled={running}
          className={`${btn} bg-gray-800/50 hover:bg-red-950/40 border-gray-700/30 hover:border-red-800/30 text-gray-300 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <Shield size={10} className="inline -mt-0.5 mr-1" />Arm All
        </button>
        <button
          onClick={() => runBatch('disarm', 'Disarm')}
          disabled={running}
          className={`${btn} bg-gray-800/50 hover:bg-gray-700/50 border-gray-700/30 hover:border-gray-600/40 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <ShieldOff size={10} className="inline -mt-0.5 mr-1" />Disarm All
        </button>

        <div className="w-px h-4 bg-gray-700/30 mx-0.5" />

        <button
          onClick={() => runBatch('land', 'Land')}
          disabled={running}
          className={`${btn} bg-gray-800/50 hover:bg-gray-700/50 border-gray-700/30 hover:border-gray-600/40 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <ArrowDown size={10} className="inline -mt-0.5 mr-1" />Land All
        </button>
        <button
          onClick={() => runBatch('rtl', 'RTL')}
          disabled={running}
          className={`${btn} bg-amber-950/40 hover:bg-amber-950/50 border-amber-900/25 hover:border-amber-800/35 text-amber-400 disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <Home size={10} className="inline -mt-0.5 mr-1" />RTL All
        </button>

        <div className="w-px h-4 bg-gray-700/30 mx-0.5" />

        <button
          onClick={clearDroneSelection}
          className={`${btn} bg-gray-800/50 hover:bg-gray-700/50 border-gray-700/30 hover:border-gray-600/40 text-gray-500 hover:text-gray-300`}
          title="Exit batch mode"
        >
          <X size={10} className="inline -mt-0.5 mr-1" />Exit
        </button>
      </div>
    </div>
  );
}
