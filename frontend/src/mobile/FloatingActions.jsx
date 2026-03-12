import React, { useCallback } from 'react';
import { OctagonX, Home, Shield, ShieldOff } from 'lucide-react';
import useDroneStore, { INITIAL_TELEMETRY } from '../store/droneStore';
import { droneApi } from '../utils/api';
import useEStopAction from '../hooks/useEStopAction';
import usePlatform from './hooks/usePlatform';

export default function FloatingActions() {
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const telemetry = useDroneStore((s) =>
    s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : INITIAL_TELEMETRY
  ) || INITIAL_TELEMETRY;
  const addAlert = useDroneStore((s) => s.addAlert);
  const addGcsLog = useDroneStore((s) => s.addGcsLog);
  const setShowPreFlightChecklist = useDroneStore((s) => s.setShowPreFlightChecklist);
  const showConfirmationDialog = useDroneStore((s) => s.showConfirmationDialog);

  const { confirming: eStopConfirming, trigger: triggerEStop } = useEStopAction();
  const { triggerHaptic } = usePlatform();

  const isConnected = !!activeDroneId;
  const isArmed = telemetry.armed;

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
          await fetch(droneApi('/api/rtl'), {
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
  }, [showConfirmationDialog, addAlert, addGcsLog, triggerHaptic]);

  const handleArm = useCallback(() => {
    triggerHaptic('medium');
    if (!isArmed) {
      setShowPreFlightChecklist(true);
    } else {
      // Disarm
      showConfirmationDialog({
        variant: 'warning',
        title: 'Disarm',
        message: telemetry.alt > 1
          ? `Vehicle is at ${telemetry.alt.toFixed(1)}m altitude. Disarming will cause uncontrolled descent.`
          : 'Disarm motors?',
        doubleConfirm: telemetry.alt > 1,
        onConfirm: async () => {
          try {
            await fetch(droneApi('/api/disarm'), {
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
  }, [isArmed, telemetry.alt, setShowPreFlightChecklist, showConfirmationDialog, addAlert, addGcsLog, triggerHaptic]);

  if (!isConnected) return null;

  return (
    <div
      className="fixed left-5 z-[95] flex flex-col gap-3 items-center"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 100px)' }}
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
