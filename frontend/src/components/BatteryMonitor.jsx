import { useEffect } from 'react';
import useDroneStore, { EMPTY_OBJECT } from '../store/droneStore';

function playBeep(frequency = 800, duration = 0.3) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = frequency;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    setTimeout(() => ctx.close(), (duration + 0.1) * 1000);
  } catch {}
}

export default function BatteryMonitor() {
  const soundEnabled = useDroneStore((s) => s.soundEnabled);
  const drones = useDroneStore((s) => s.drones);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const batteryWarnThreshold = useDroneStore((s) => s.batteryWarnThreshold);
  const batteryCritThreshold = useDroneStore((s) => s.batteryCritThreshold);
  const alertState = useDroneStore((s) => s._batteryAlertState);
  const setBatteryAlertState = useDroneStore((s) => s.setBatteryAlertState);
  const clearBatteryAlertState = useDroneStore((s) => s.clearBatteryAlertState);
  const addAlert = useDroneStore((s) => s.addAlert);

  // Also keep legacy voltage-based warnings for the active drone
  const params = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.params ?? EMPTY_OBJECT : EMPTY_OBJECT);
  const batteryWarnings = useDroneStore((s) => s.batteryWarnings);
  const setBatteryWarnings = useDroneStore((s) => s.setBatteryWarnings);
  const voltage = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.voltage : 0) || 0;
  const remaining = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.remaining : -1) ?? -1;

  // Legacy voltage-based warnings for active drone (BATT_LOW_VOLT / BATT_CRT_VOLT params)
  useEffect(() => {
    if (!activeDroneId) {
      if (batteryWarnings.low || batteryWarnings.critical) {
        setBatteryWarnings({ low: false, critical: false });
      }
      return;
    }
    if (voltage <= 0 || remaining === -1) return;

    const lowVolt = params.BATT_LOW_VOLT?.value;
    const crtVolt = params.BATT_CRT_VOLT?.value;

    if (batteryWarnings.critical && crtVolt && voltage > crtVolt + 0.5) {
      setBatteryWarnings({ critical: false });
    }
    if (batteryWarnings.low && lowVolt && voltage > lowVolt + 0.5) {
      setBatteryWarnings({ low: false });
    }

    if (crtVolt && crtVolt > 0 && voltage <= crtVolt && !batteryWarnings.critical) {
      setBatteryWarnings({ critical: true });
      addAlert(`CRITICAL: Battery ${voltage.toFixed(1)}V (threshold: ${crtVolt}V)`, 'error');
      if (soundEnabled) {
        playBeep(800, 0.3);
        setTimeout(() => playBeep(800, 0.3), 400);
      }
    } else if (lowVolt && lowVolt > 0 && voltage <= lowVolt && !batteryWarnings.low) {
      setBatteryWarnings({ low: true });
      addAlert(`Low Battery: ${voltage.toFixed(1)}V (threshold: ${lowVolt}V)`, 'warning');
      if (soundEnabled) playBeep(600, 0.2);
    }
  }, [voltage, remaining, activeDroneId, params, batteryWarnings, setBatteryWarnings, addAlert, soundEnabled]);

  // Percentage-based warnings for ALL connected drones
  useEffect(() => {
    const droneIds = Object.keys(drones);
    if (droneIds.length === 0) return;

    for (const droneId of droneIds) {
      const drone = drones[droneId];
      const pct = drone?.telemetry?.remaining ?? -1;
      if (pct < 0) continue; // no data yet

      const state = alertState[droneId] || { warn: false, crit: false };
      const name = drone.name || droneId;

      // Reset alerts if battery goes back above thresholds (e.g., new battery)
      if (state.crit && pct > batteryCritThreshold + 2) {
        setBatteryAlertState(droneId, { crit: false });
      }
      if (state.warn && pct > batteryWarnThreshold + 2) {
        setBatteryAlertState(droneId, { warn: false });
      }

      // Critical check
      if (pct <= batteryCritThreshold && !state.crit) {
        setBatteryAlertState(droneId, { crit: true });
        addAlert(`CRITICAL: ${name} battery at ${pct}% (threshold: ${batteryCritThreshold}%)`, 'error');
        if (soundEnabled) {
          playBeep(800, 0.3);
          setTimeout(() => playBeep(800, 0.3), 400);
        }
      }
      // Warn check (only if not already critical)
      else if (pct <= batteryWarnThreshold && !state.warn && !state.crit) {
        setBatteryAlertState(droneId, { warn: true });
        addAlert(`Low Battery: ${name} at ${pct}% (threshold: ${batteryWarnThreshold}%)`, 'warning');
        if (soundEnabled) playBeep(600, 0.2);
      }
    }

    // Clean up alert state for removed drones
    for (const droneId of Object.keys(alertState)) {
      if (!drones[droneId]) {
        clearBatteryAlertState(droneId);
      }
    }
  }, [drones, batteryWarnThreshold, batteryCritThreshold, alertState, setBatteryAlertState, clearBatteryAlertState, addAlert, soundEnabled]);

  return null;
}
