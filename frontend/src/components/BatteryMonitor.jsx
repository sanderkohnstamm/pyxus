import { useEffect, useRef } from 'react';
import useDroneStore from '../store/droneStore';
import { INITIAL_TELEMETRY, EMPTY_OBJECT } from '../store/droneStore';

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
  const voltage = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.voltage : 0) || 0;
  const remaining = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.remaining : -1) ?? -1;
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const params = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.params ?? EMPTY_OBJECT : EMPTY_OBJECT);
  const batteryWarnings = useDroneStore((s) => s.batteryWarnings);
  const setBatteryWarnings = useDroneStore((s) => s.setBatteryWarnings);
  const addAlert = useDroneStore((s) => s.addAlert);
  const prevVoltageRef = useRef(0);

  useEffect(() => {
    // Reset warnings on disconnect
    if (!activeDroneId) {
      if (batteryWarnings.low || batteryWarnings.critical) {
        setBatteryWarnings({ low: false, critical: false });
      }
      return;
    }

    // Skip if no valid data
    if (voltage <= 0 || remaining === -1) return;

    const lowVolt = params.BATT_LOW_VOLT?.value;
    const crtVolt = params.BATT_CRT_VOLT?.value;

    // Reset warnings if voltage rises back above thresholds (new battery)
    if (batteryWarnings.critical && crtVolt && voltage > crtVolt + 0.5) {
      setBatteryWarnings({ critical: false });
    }
    if (batteryWarnings.low && lowVolt && voltage > lowVolt + 0.5) {
      setBatteryWarnings({ low: false });
    }

    // Critical voltage check
    if (crtVolt && crtVolt > 0 && voltage <= crtVolt && !batteryWarnings.critical) {
      setBatteryWarnings({ critical: true });
      addAlert(`CRITICAL: Battery ${voltage.toFixed(1)}V (threshold: ${crtVolt}V)`, 'error');
      playBeep(800, 0.3);
      setTimeout(() => playBeep(800, 0.3), 400);
    }
    // Low voltage check
    else if (lowVolt && lowVolt > 0 && voltage <= lowVolt && !batteryWarnings.low) {
      setBatteryWarnings({ low: true });
      addAlert(`Low Battery: ${voltage.toFixed(1)}V (threshold: ${lowVolt}V)`, 'warning');
      playBeep(600, 0.2);
    }

    prevVoltageRef.current = voltage;
  }, [voltage, remaining, activeDroneId, params, batteryWarnings, setBatteryWarnings, addAlert]);

  return null;
}
