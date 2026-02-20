import React, { useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Satellite,
  Battery,
  Zap,
  Heart,
  Shield,
  ShieldCheck,
  Navigation,
} from 'lucide-react';
import useDroneStore, { INITIAL_TELEMETRY } from '../store/droneStore';
import { droneApi } from '../utils/api';

const STATUS = { green: 'green', amber: 'amber', red: 'red' };

function getStatusIcon(status) {
  switch (status) {
    case STATUS.green:
      return <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />;
    case STATUS.amber:
      return <AlertTriangle size={13} className="text-amber-400 shrink-0" />;
    case STATUS.red:
    default:
      return <XCircle size={13} className="text-red-400 shrink-0" />;
  }
}

function getStatusBg(status) {
  switch (status) {
    case STATUS.green:
      return 'bg-emerald-500/8 border-emerald-500/20';
    case STATUS.amber:
      return 'bg-amber-500/8 border-amber-500/20';
    case STATUS.red:
    default:
      return 'bg-red-500/8 border-red-500/20';
  }
}

function CheckItem({ icon: Icon, label, status, detail }) {
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${getStatusBg(status)}`}>
      <Icon size={13} className="text-gray-400 shrink-0" />
      <span className="text-[11px] text-gray-300 font-medium flex-1">{label}</span>
      {detail && (
        <span className="text-[10px] text-gray-500 font-mono mr-1">{detail}</span>
      )}
      {getStatusIcon(status)}
    </div>
  );
}

export default function PreFlightChecklist() {
  const show = useDroneStore((s) => s.showPreFlightChecklist);
  const setShow = useDroneStore((s) => s.setShowPreFlightChecklist);
  const telemetry = useDroneStore((s) =>
    s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : INITIAL_TELEMETRY
  ) || INITIAL_TELEMETRY;
  const batteryCritThreshold = useDroneStore((s) => s.batteryCritThreshold);
  const addAlert = useDroneStore((s) => s.addAlert);
  const addGcsLog = useDroneStore((s) => s.addGcsLog);

  const checks = useMemo(() => {
    const fixType = telemetry.fix_type || 0;
    const sats = telemetry.satellites || 0;
    const remaining = telemetry.remaining;
    const voltage = telemetry.voltage || 0;
    const connected = telemetry.heartbeat_age >= 0 && telemetry.heartbeat_age < 5;

    const FIX_LABELS = { 0: 'No GPS', 1: 'No Fix', 2: '2D Fix', 3: '3D Fix', 4: 'DGPS', 5: 'RTK Float', 6: 'RTK Fixed' };

    return [
      {
        id: 'gps',
        icon: Navigation,
        label: 'GPS Fix',
        status: fixType >= 3 ? STATUS.green : fixType === 2 ? STATUS.amber : STATUS.red,
        detail: FIX_LABELS[fixType] || `Type ${fixType}`,
      },
      {
        id: 'sats',
        icon: Satellite,
        label: 'Satellites',
        status: sats >= 8 ? STATUS.green : sats >= 5 ? STATUS.amber : STATUS.red,
        detail: `${sats} sats`,
      },
      {
        id: 'battery',
        icon: Battery,
        label: 'Battery',
        status:
          remaining < 0
            ? STATUS.amber
            : remaining > batteryCritThreshold
              ? STATUS.green
              : remaining > batteryCritThreshold * 0.5
                ? STATUS.amber
                : STATUS.red,
        detail: remaining >= 0 ? `${remaining}%` : 'N/A',
      },
      {
        id: 'voltage',
        icon: Zap,
        label: 'Voltage',
        status: voltage > 0 ? STATUS.green : STATUS.red,
        detail: voltage > 0 ? `${voltage.toFixed(1)}V` : 'No data',
      },
      {
        id: 'heartbeat',
        icon: Heart,
        label: 'Heartbeat',
        status: connected ? STATUS.green : STATUS.red,
        detail: connected ? 'Connected' : 'Lost',
      },
      {
        id: 'armed',
        icon: Shield,
        label: 'Armed Status',
        status: STATUS.green,
        detail: telemetry.armed ? 'ARMED' : 'DISARMED',
      },
    ];
  }, [telemetry, batteryCritThreshold]);

  // All checks pass if no reds and no ambers (armed status is always green/informational)
  const allPass = useMemo(() => {
    return checks
      .filter((c) => c.id !== 'armed')
      .every((c) => c.status === STATUS.green);
  }, [checks]);

  const handleArm = useCallback(async () => {
    try {
      const res = await fetch(droneApi('/api/arm'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Arm failed', 'error');
        addGcsLog?.(`Arm: ${data.error || 'failed'}`, 'error');
      } else {
        addGcsLog?.('Arm command sent', 'info');
      }
    } catch (err) {
      addAlert(`Arm failed: ${err.message}`, 'error');
      addGcsLog?.(`Arm: ${err.message}`, 'error');
    }
    setShow(false);
  }, [addAlert, addGcsLog, setShow]);

  const handleClose = useCallback(() => {
    setShow(false);
  }, [setShow]);

  // Close on Escape
  React.useEffect(() => {
    if (!show) return;
    const handler = (e) => {
      if (e.key === 'Escape') setShow(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [show, setShow]);

  if (!show) return null;

  const portalRoot = document.getElementById('root') || document.body;

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center pointer-events-none">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="bg-gray-900/95 backdrop-blur-md border border-gray-700/50 rounded-xl shadow-2xl w-[320px] flex flex-col pointer-events-auto relative">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-cyan-400" />
            <span className="text-[12px] font-bold text-gray-200 tracking-wide">Pre-Flight Checklist</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-gray-800/50 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Check items */}
        <div className="px-3 py-3 space-y-1.5">
          {checks.map((check) => (
            <CheckItem
              key={check.id}
              icon={check.icon}
              label={check.label}
              status={check.status}
              detail={check.detail}
            />
          ))}
        </div>

        {/* Summary */}
        <div className="px-3 pb-2">
          {allPass ? (
            <div className="text-[10px] text-emerald-400/80 text-center font-medium">
              All checks passed
            </div>
          ) : (
            <div className="text-[10px] text-amber-400/80 text-center font-medium">
              Some checks have warnings or failures
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex gap-2 px-3 pb-3 pt-1">
          <button
            onClick={handleClose}
            className="flex-1 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700/50 rounded-lg text-[11px] font-medium text-gray-400 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleArm}
            className="px-3 py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 rounded-lg text-[11px] font-semibold text-amber-400 transition-all"
          >
            Arm Anyway
          </button>
          <button
            onClick={handleArm}
            disabled={!allPass}
            className="flex-1 px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 rounded-lg text-[11px] font-semibold text-emerald-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Arm
          </button>
        </div>
      </div>
    </div>,
    portalRoot,
  );
}
