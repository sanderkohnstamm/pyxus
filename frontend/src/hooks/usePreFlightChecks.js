import { useMemo } from 'react';
import useDroneStore, { INITIAL_TELEMETRY } from '../store/droneStore';

const STATUS = { green: 'green', amber: 'amber', red: 'red' };

const FIX_LABELS = {
  0: 'No GPS', 1: 'No Fix', 2: '2D Fix', 3: '3D Fix',
  4: 'DGPS', 5: 'RTK Float', 6: 'RTK Fixed',
};

/**
 * Returns pre-flight check items and overall pass/fail.
 * Reusable between desktop PreFlightChecklist and mobile FloatingActions.
 */
export default function usePreFlightChecks() {
  const telemetry = useDroneStore((s) =>
    s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : INITIAL_TELEMETRY
  ) || INITIAL_TELEMETRY;
  const batteryCritThreshold = useDroneStore((s) => s.batteryCritThreshold);

  const checks = useMemo(() => {
    const fixType = telemetry.fix_type || 0;
    const sats = telemetry.satellites || 0;
    const remaining = telemetry.remaining;
    const voltage = telemetry.voltage || 0;
    const connected = telemetry.heartbeat_age >= 0 && telemetry.heartbeat_age < 5;

    return [
      {
        id: 'gps', label: 'GPS Fix',
        status: fixType >= 3 ? STATUS.green : fixType === 2 ? STATUS.amber : STATUS.red,
        detail: FIX_LABELS[fixType] || `Type ${fixType}`,
      },
      {
        id: 'sats', label: 'Satellites',
        status: sats >= 8 ? STATUS.green : sats >= 5 ? STATUS.amber : STATUS.red,
        detail: `${sats} sats`,
      },
      {
        id: 'battery', label: 'Battery',
        status:
          remaining < 0 ? STATUS.amber
            : remaining > batteryCritThreshold ? STATUS.green
            : remaining > batteryCritThreshold * 0.5 ? STATUS.amber
            : STATUS.red,
        detail: remaining >= 0 ? `${remaining}%` : 'N/A',
      },
      {
        id: 'voltage', label: 'Voltage',
        status: voltage > 0 ? STATUS.green : STATUS.red,
        detail: voltage > 0 ? `${voltage.toFixed(1)}V` : 'No data',
      },
      {
        id: 'heartbeat', label: 'Heartbeat',
        status: connected ? STATUS.green : STATUS.red,
        detail: connected ? 'Connected' : 'Lost',
      },
    ];
  }, [telemetry, batteryCritThreshold]);

  const allPass = useMemo(() => checks.every((c) => c.status === STATUS.green), [checks]);

  return { checks, allPass };
}

export { STATUS };
