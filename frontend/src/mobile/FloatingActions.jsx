import React, { useState, useCallback } from 'react';
import { OctagonX, Home, Shield, ShieldOff, ArrowUp, ArrowDown } from 'lucide-react';
import useDroneStore, { INITIAL_TELEMETRY } from '../store/droneStore';
import { droneApi } from '../utils/api';
import useEStopAction from '../hooks/useEStopAction';
import usePlatform from './hooks/usePlatform';

export default function FloatingActions() {
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const telemetry = useDroneStore((s) =>
    s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : INITIAL_TELEMETRY
  ) || INITIAL_TELEMETRY;
  const takeoffAlt = useDroneStore((s) => s.takeoffAlt);
  const addAlert = useDroneStore((s) => s.addAlert);
  const addGcsLog = useDroneStore((s) => s.addGcsLog);
  const setShowPreFlightChecklist = useDroneStore((s) => s.setShowPreFlightChecklist);
  const showConfirmationDialog = useDroneStore((s) => s.showConfirmationDialog);

  const { confirming: eStopConfirming, trigger: triggerEStop } = useEStopAction();
  const { triggerHaptic } = usePlatform();

  const isConnected = !!activeDroneId;
  const isArmed = telemetry.armed;
  const isAirborne = telemetry.alt > 1;

  const handleEStop = useCallback(() => {
    triggerHaptic('heavy');
    triggerEStop();
  }, [triggerEStop, triggerHaptic]);

  const handleRTL = useCallback(() => {
    triggerHaptic('medium');
    showConfirmationDialog({
      variant: 'warning',
      title: 'Return to Launch',
      message: 'Vehicle will return to launch position and land automatically.',
      doubleConfirm: false,
      onConfirm: async () => {
        try {
          await fetch(droneApi(`/api/rtl?drone_id=${activeDroneId}`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          addGcsLog('RTL command sent', 'info');
        } catch (err) {
          addAlert(`RTL failed: ${err.message}`, 'error');
        }
      },
    });
  }, [activeDroneId, showConfirmationDialog, addAlert, addGcsLog, triggerHaptic]);

  const handleArm = useCallback(() => {
    triggerHaptic('medium');
    if (!isArmed) {
      setShowPreFlightChecklist(true);
    } else {
      showConfirmationDialog({
        variant: 'warning',
        title: 'Disarm',
        message: isAirborne
          ? `Vehicle is at ${telemetry.alt.toFixed(1)}m altitude. Disarming will cause uncontrolled descent.`
          : 'Disarm motors?',
        doubleConfirm: isAirborne,
        onConfirm: async () => {
          try {
            await fetch(droneApi(`/api/disarm?drone_id=${activeDroneId}`), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            addGcsLog('Disarm command sent', 'info');
          } catch (err) {
            addAlert(`Disarm failed: ${err.message}`, 'error');
          }
        },
      });
    }
  }, [activeDroneId, isArmed, isAirborne, telemetry.alt, setShowPreFlightChecklist, showConfirmationDialog, addAlert, addGcsLog, triggerHaptic]);

  const handleTakeoff = useCallback(() => {
    triggerHaptic('medium');
    showConfirmationDialog({
      variant: 'warning',
      title: 'Takeoff',
      message: `Vehicle will take off to ${takeoffAlt}m altitude.`,
      doubleConfirm: false,
      onConfirm: async () => {
        try {
          const res = await fetch(droneApi(`/api/takeoff?drone_id=${activeDroneId}`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alt: takeoffAlt }),
          });
          const data = await res.json();
          if (data.status === 'error') addAlert(data.error || 'Takeoff failed', 'error');
          else addGcsLog(`Takeoff to ${takeoffAlt}m`, 'info');
        } catch (err) {
          addAlert(`Takeoff failed: ${err.message}`, 'error');
        }
      },
    });
  }, [activeDroneId, takeoffAlt, showConfirmationDialog, addAlert, addGcsLog, triggerHaptic]);

  const handleLand = useCallback(() => {
    triggerHaptic('medium');
    showConfirmationDialog({
      variant: 'warning',
      title: 'Land',
      message: 'Vehicle will land at current position.',
      doubleConfirm: false,
      onConfirm: async () => {
        try {
          const res = await fetch(droneApi(`/api/land?drone_id=${activeDroneId}`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const data = await res.json();
          if (data.status === 'error') addAlert(data.error || 'Land failed', 'error');
          else addGcsLog('Land command sent', 'info');
        } catch (err) {
          addAlert(`Land failed: ${err.message}`, 'error');
        }
      },
    });
  }, [activeDroneId, showConfirmationDialog, addAlert, addGcsLog, triggerHaptic]);

  if (!isConnected) return null;

  return (
    <div
      className="fixed left-5 z-[95] flex flex-col gap-3 items-center"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 80px)' }}
    >
      {/* E-Stop — only when armed */}
      {isArmed && (
        <button
          onClick={handleEStop}
          className={`w-[60px] h-[60px] rounded-2xl flex items-center justify-center shadow-2xl transition-all active:scale-95 ${
            eStopConfirming
              ? 'bg-red-500 border-2 border-red-300 animate-pulse'
              : 'bg-red-600/90 border-2 border-red-500/50'
          }`}
        >
          <OctagonX size={28} className="text-white" />
        </button>
      )}

      {/* RTL — only when armed */}
      {isArmed && (
        <button
          onClick={handleRTL}
          className="w-[52px] h-[52px] rounded-xl flex items-center justify-center shadow-2xl bg-amber-600/90 border-2 border-amber-500/50 active:scale-95 transition-transform"
        >
          <Home size={22} className="text-white" />
        </button>
      )}

      {/* Takeoff — when armed but on ground */}
      {isArmed && !isAirborne && (
        <button
          onClick={handleTakeoff}
          className="w-[52px] h-[52px] rounded-xl flex items-center justify-center shadow-2xl bg-emerald-600/90 border-2 border-emerald-500/50 active:scale-95 transition-transform"
        >
          <ArrowUp size={22} className="text-white" />
        </button>
      )}

      {/* Land — when armed and airborne */}
      {isArmed && isAirborne && (
        <button
          onClick={handleLand}
          className="w-[52px] h-[52px] rounded-xl flex items-center justify-center shadow-2xl bg-sky-600/90 border-2 border-sky-500/50 active:scale-95 transition-transform"
        >
          <ArrowDown size={22} className="text-white" />
        </button>
      )}

      {/* Arm / Disarm */}
      <button
        onClick={handleArm}
        className={`w-[52px] h-[52px] rounded-xl flex items-center justify-center shadow-2xl active:scale-95 transition-transform ${
          isArmed
            ? 'bg-gray-800/90 border-2 border-red-500/40'
            : 'bg-gray-800/90 border-2 border-gray-600/50'
        }`}
      >
        {isArmed
          ? <ShieldOff size={22} className="text-red-400" />
          : <Shield size={22} className="text-gray-300" />
        }
      </button>
    </div>
  );
}
