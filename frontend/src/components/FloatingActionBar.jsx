import React, { useCallback, useEffect, useState, useRef } from 'react';
import {
  Shield, ShieldOff, ArrowUp, ArrowDown, Home,
  Play, Square, FastForward, Layers, X, ChevronDown,
  Keyboard, Gamepad2, Navigation, OctagonX,
} from 'lucide-react';
import useDroneStore, { INITIAL_TELEMETRY, EMPTY_ARRAY } from '../store/droneStore';
import { droneApi, fetchWithTimeout, executeBatchCommand } from '../utils/api';
import { getCommandConfirmation, isAirborne } from '../utils/commandSafety';
import { GlassPanel, GlassButton } from './ui/GlassPanel';
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

function ModeDropdown({ currentMode, useStandardModes, availableModes, staticModes, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const modes = useStandardModes
    ? availableModes.map((m) => ({ key: m.mode_index, label: m.mode_name + (m.advanced ? ' ★' : ''), value: m }))
    : staticModes.map((m) => ({ key: m, label: m, value: m }));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 bg-gray-800/60 text-gray-300 border border-white/[0.08] rounded-xl px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider font-mono hover:bg-gray-700/60 hover:border-white/[0.15] transition-colors backdrop-blur-sm"
      >
        {currentMode || '--'}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 right-0 w-44 max-h-64 overflow-y-auto backdrop-blur-xl bg-gray-900/90 border border-gray-700/30 rounded-xl shadow-2xl py-1 z-[100]">
          {modes.map((m) => {
            const isActive = m.label.replace(' ★', '') === currentMode;
            return (
              <button
                key={m.key}
                onClick={() => { onSelect(m.value); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors ${
                  isActive
                    ? 'text-white bg-white/[0.08] font-bold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FloatingActionBar() {
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const telemetry = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : INITIAL_TELEMETRY) || INITIAL_TELEMETRY;
  const missionStatus = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.missionStatus : 'idle') || 'idle';
  const availableModes = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.availableModes : EMPTY_ARRAY) || EMPTY_ARRAY;
  const backendStaticModes = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.staticModes : EMPTY_ARRAY) || EMPTY_ARRAY;
  const setDroneAvailableModes = useDroneStore((s) => s.setDroneAvailableModes);
  const addAlert = useDroneStore((s) => s.addAlert);
  const addGcsLog = useDroneStore((s) => s.addGcsLog);
  const takeoffAlt = useDroneStore((s) => s.takeoffAlt);
  const setShowPreFlightChecklist = useDroneStore((s) => s.setShowPreFlightChecklist);
  const setDroneMission = useDroneStore((s) => s.setDroneMission);
  const confirmDangerousCommands = useDroneStore((s) => s.confirmDangerousCommands);
  const showConfirmationDialog = useDroneStore((s) => s.showConfirmationDialog);
  const capabilities = telemetry.capabilities || null;
  const keyboardEnabled = useDroneStore((s) => s.keyboardEnabled);
  const setKeyboardEnabled = useDroneStore((s) => s.setKeyboardEnabled);
  const gamepadEnabled = useDroneStore((s) => s.gamepadEnabled);
  const setGamepadEnabled = useDroneStore((s) => s.setGamepadEnabled);

  // Fetch available modes when drone changes
  useEffect(() => {
    if (!activeDroneId) return;
    let cancelled = false;

    const fetchModes = async () => {
      try {
        const res = await fetchWithTimeout(droneApi(`/api/modes?drone_id=${activeDroneId}`));
        const data = await res.json();
        if (cancelled) return null;
        if (data.status === 'ok') {
          setDroneAvailableModes(activeDroneId, data.modes || [], data.static_modes || []);
          return data;
        }
        return data;
      } catch { return null; }
    };

    const t1 = setTimeout(async () => {
      const result = await fetchModes();
      if (cancelled) return;
      const got = result?.modes?.length || 0;
      const total = result?.total_modes || 0;
      if (total > 0 && got < total) {
        const t2 = setTimeout(() => { if (!cancelled) fetchModes(); }, 3000);
        cleanupTimers.push(t2);
      }
    }, 2000);

    const cleanupTimers = [t1];
    return () => { cancelled = true; cleanupTimers.forEach(clearTimeout); };
  }, [activeDroneId, setDroneAvailableModes]);

  const batteryRemaining = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.remaining : -1) ?? -1;
  const batteryCritThreshold = useDroneStore((s) => s.batteryCritThreshold);
  const isBatteryCritical = batteryRemaining >= 0 && batteryRemaining <= batteryCritThreshold;

  const heartbeatAge = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.heartbeat_age : -1) ?? -1;
  const isConnected = !!activeDroneId && heartbeatAge >= 0;

  const apiCall = useCallback(async (endpoint, body = {}, logMsg) => {
    const label = logMsg || endpoint;
    try {
      const res = await fetchWithTimeout(droneApi(`/api/${endpoint}`), {
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
  }, [addAlert, addGcsLog]);

  const missionApiCall = useCallback(async (endpoint) => {
    try {
      const res = await fetchWithTimeout(droneApi(`/api/mission/${endpoint}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || `Mission ${endpoint} failed`, 'error');
      } else if (endpoint === 'clear') {
        const droneId = useDroneStore.getState().activeDroneId;
        if (droneId) setDroneMission(droneId, []);
        addAlert('Mission cleared', 'success');
      }
    } catch (err) {
      addAlert(`Mission ${endpoint} failed: ${err.message}`, 'error');
    }
  }, [addAlert, setDroneMission]);

  const gatedApiCall = useCallback((command, callFn) => {
    if (!confirmDangerousCommands) { callFn(); return; }
    const confirmation = getCommandConfirmation(command, telemetry);
    if (!confirmation) { callFn(); return; }
    showConfirmationDialog({ ...confirmation, onConfirm: callFn });
  }, [confirmDangerousCommands, telemetry, showConfirmationDialog]);

  if (!isConnected) return null;

  const supportsTakeoff = capabilities?.supports_takeoff !== false;
  const isGroundOrSurface = capabilities?.category === 'ground' || capabilities?.category === 'surface';
  const landLabel = isGroundOrSurface ? 'Stop' : 'Land';
  const isFlying = isAirborne(telemetry);
  const hasMission = missionStatus !== 'idle';

  // Mode selector logic
  const useStandardModes = availableModes.length > 0;
  const baseModes = backendStaticModes.length > 0
    ? backendStaticModes
    : (telemetry.autopilot === 'ardupilot' ? ARDUPILOT_MODES : PX4_MODES);
  const staticModes = telemetry.mode && !baseModes.includes(telemetry.mode)
    ? [telemetry.mode, ...baseModes]
    : baseModes;

  const handleModeSelect = useCallback((entry) => {
    if (useStandardModes) {
      if (entry.standard_mode > 0) {
        gatedApiCall(`mode:${entry.mode_name}`, () =>
          apiCall('mode', { standard_mode: entry.standard_mode }, `Mode → ${entry.mode_name}`)
        );
      } else {
        gatedApiCall(`mode:${entry.mode_name}`, () =>
          apiCall('mode', { mode: entry.mode_name }, `Mode → ${entry.mode_name}`)
        );
      }
    } else {
      gatedApiCall(`mode:${entry}`, () =>
        apiCall('mode', { mode: entry }, `Mode → ${entry}`)
      );
    }
  }, [useStandardModes, apiCall, gatedApiCall]);

  return (
    <>
      {/* RTL critical banner */}
      {isBatteryCritical && telemetry.armed && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[90]">
          <button
            onClick={() => apiCall('rtl', {}, 'RTL')}
            className="flex items-center gap-2 px-4 py-2 bg-red-950/70 backdrop-blur-xl rounded-2xl border border-red-500/30 shadow-2xl animate-pulse hover:bg-red-900/60 transition-colors"
          >
            <Home size={14} className="text-red-400" />
            <span className="text-[11px] font-bold text-red-300 tracking-wide uppercase">RTL — Battery {batteryRemaining}%</span>
          </button>
        </div>
      )}

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2">
        {/* Mission controls */}
        {hasMission && (
          <GlassPanel className="flex items-center gap-1.5 px-3 py-2">
            <GlassButton color="emerald" onClick={() => missionApiCall('start')}>
              <Play size={10} className="inline -mt-0.5 mr-1" />Start
            </GlassButton>
            <GlassButton color="gray" onClick={() => missionApiCall('pause')}>
              <Square size={9} className="inline -mt-0.5 mr-1" />Pause
            </GlassButton>
            <GlassButton color="emerald" onClick={() => missionApiCall('resume')}>
              <FastForward size={10} className="inline -mt-0.5 mr-1" />Resume
            </GlassButton>
          </GlassPanel>
        )}

        {/* Flight action buttons */}
        <GlassPanel className="flex items-center gap-1.5 px-3 py-2">
          {/* Arm / Disarm */}
          <GlassButton
            color="emerald"
            onClick={() => {
              if (!telemetry.armed) {
                setShowPreFlightChecklist(true);
              } else {
                gatedApiCall('disarm', () => apiCall('disarm', {}, 'Disarm'));
              }
            }}
          >
            {telemetry.armed ? (
              <><ShieldOff size={10} className="inline -mt-0.5 mr-1" />Disarm</>
            ) : (
              <><Shield size={10} className="inline -mt-0.5 mr-1" />Arm</>
            )}
          </GlassButton>

          {/* Takeoff — only when not flying */}
          {supportsTakeoff && !isFlying && (
            <GlassButton color="amber" onClick={() => apiCall('takeoff', { alt: takeoffAlt }, `Takeoff ${takeoffAlt}m`)}>
              <ArrowUp size={10} className="inline -mt-0.5 mr-1" />Takeoff
            </GlassButton>
          )}

          {/* Land — only when flying */}
          {isFlying && (
            <GlassButton color="gray" onClick={() => apiCall('land', {}, landLabel)}>
              {isGroundOrSurface
                ? <Square size={9} className="inline -mt-0.5 mr-1" />
                : <ArrowDown size={10} className="inline -mt-0.5 mr-1" />
              }
              {landLabel}
            </GlassButton>
          )}

          {/* RTL */}
          <GlassButton
            color="red"
            onClick={() => gatedApiCall('rtl', () => apiCall('rtl', {}, 'RTL'))}
            className={isBatteryCritical ? 'animate-pulse' : ''}
          >
            <Home size={10} className="inline -mt-0.5 mr-1" />RTL
          </GlassButton>

          {/* Guided — quick access when flying */}
          {isFlying && telemetry.mode !== 'GUIDED' && (
            <GlassButton color="gray" onClick={() => gatedApiCall('mode:GUIDED', () => apiCall('mode', { mode: 'GUIDED' }, 'Mode → GUIDED'))}>
              <Navigation size={10} className="inline -mt-0.5 mr-1" />Guided
            </GlassButton>
          )}

          {/* Brake — when flying and not already braking */}
          {isFlying && telemetry.mode !== 'BRAKE' && telemetry.autopilot === 'ardupilot' && (
            <GlassButton color="amber" onClick={() => apiCall('mode', { mode: 'BRAKE' }, 'Mode → BRAKE')}>
              <OctagonX size={10} className="inline -mt-0.5 mr-1" />Brake
            </GlassButton>
          )}

          <div className="w-px h-5 bg-white/[0.08] mx-0.5" />

          {/* Mode selector */}
          <ModeDropdown
            currentMode={telemetry.mode}
            useStandardModes={useStandardModes}
            availableModes={availableModes}
            staticModes={staticModes}
            onSelect={handleModeSelect}
          />
        </GlassPanel>

        {/* Manual control indicators */}
        <GlassPanel className="flex items-center gap-1 px-2 py-2">
          <button
            onClick={() => setKeyboardEnabled(!keyboardEnabled)}
            className={`p-1.5 rounded-lg transition-colors ${
              keyboardEnabled ? 'bg-gray-500/25 text-gray-200' : 'text-gray-600 hover:text-gray-400'
            }`}
            title="Keyboard RC"
          >
            <Keyboard size={14} />
          </button>
          <button
            onClick={() => setGamepadEnabled(!gamepadEnabled)}
            className={`p-1.5 rounded-lg transition-colors ${
              gamepadEnabled ? 'bg-gray-500/25 text-gray-200' : 'text-gray-600 hover:text-gray-400'
            }`}
            title="Gamepad RC"
          >
            <Gamepad2 size={14} />
          </button>
        </GlassPanel>
      </div>

      <PreFlightChecklist />
      <BatchControlsOverlay />
    </>
  );
}

function BatchControlsOverlay() {
  const selectedDroneIds = useDroneStore((s) => s.selectedDroneIds);
  const drones = useDroneStore((s) => s.drones);
  const addAlert = useDroneStore((s) => s.addAlert);
  const clearDroneSelection = useDroneStore((s) => s.clearDroneSelection);
  const confirmDangerousCommands = useDroneStore((s) => s.confirmDangerousCommands);
  const showConfirmationDialog = useDroneStore((s) => s.showConfirmationDialog);
  const [running, setRunning] = React.useState(false);

  if (selectedDroneIds.length < 2) return null;

  const runBatch = async (endpoint) => {
    if (running) return;
    setRunning(true);
    await executeBatchCommand(selectedDroneIds, endpoint, {}, addAlert);
    setRunning(false);
  };

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[91]">
      <GlassPanel className="flex items-center gap-2 px-3 py-2">
        <Layers size={12} className="text-gray-400" />
        <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">
          Batch ({selectedDroneIds.length})
        </span>
        <div className="w-px h-4 bg-white/[0.06]" />
        <GlassButton color="emerald" onClick={() => runBatch('arm')} disabled={running}>Arm All</GlassButton>
        <GlassButton color="gray" onClick={() => {
          if (confirmDangerousCommands) {
            const anyAirborne = selectedDroneIds.some((id) => {
              const t = drones[id]?.telemetry;
              return t && isAirborne(t);
            });
            if (anyAirborne) {
              showConfirmationDialog({
                variant: 'danger',
                title: 'Disarm All While Airborne',
                message: 'One or more drones are airborne. Disarming will cause uncontrolled descent.',
                doubleConfirm: true,
                onConfirm: () => runBatch('disarm'),
              });
              return;
            }
          }
          runBatch('disarm');
        }} disabled={running}>Disarm All</GlassButton>
        <GlassButton color="gray" onClick={() => runBatch('land')} disabled={running}>Land All</GlassButton>
        <GlassButton color="red" onClick={() => runBatch('rtl')} disabled={running}>RTL All</GlassButton>
        <GlassButton color="gray" onClick={clearDroneSelection}>
          <X size={10} className="inline -mt-0.5 mr-0.5" />Exit
        </GlassButton>
      </GlassPanel>
    </div>
  );
}
