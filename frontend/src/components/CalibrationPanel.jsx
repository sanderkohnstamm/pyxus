import React, { useState, useCallback } from 'react';
import { Compass, Activity, ArrowDownToLine, Gauge, Loader2 } from 'lucide-react';
import useDroneStore from '../store/droneStore';

const CALIBRATIONS = [
  {
    id: 'gyro',
    label: 'Gyroscope',
    icon: Activity,
    color: 'cyan',
    description: 'Keep the vehicle completely still on a flat surface.',
    duration: '~5s',
  },
  {
    id: 'accel',
    label: 'Accelerometer',
    icon: ArrowDownToLine,
    color: 'emerald',
    description: 'Place the vehicle on each of its 6 sides when prompted. Follow STATUSTEXT messages for instructions.',
    duration: '~60s',
  },
  {
    id: 'level',
    label: 'Level Horizon',
    icon: ArrowDownToLine,
    color: 'sky',
    description: 'Place the vehicle level on a flat surface. Calibrates the level position for the accelerometer.',
    duration: '~5s',
  },
  {
    id: 'compass',
    label: 'Compass',
    icon: Compass,
    color: 'amber',
    description: 'Rotate the vehicle around all axes. Follow STATUSTEXT messages for progress.',
    duration: '~30s',
  },
  {
    id: 'pressure',
    label: 'Barometer',
    icon: Gauge,
    color: 'violet',
    description: 'Keep the vehicle still. Calibrates the barometric pressure sensor.',
    duration: '~5s',
  },
];

const COLOR_CLASSES = {
  cyan: {
    btn: 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/20 hover:border-cyan-500/40 text-cyan-300',
    active: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
    icon: 'text-cyan-500',
  },
  emerald: {
    btn: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 hover:border-emerald-500/40 text-emerald-300',
    active: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
    icon: 'text-emerald-500',
  },
  sky: {
    btn: 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/20 hover:border-sky-500/40 text-sky-300',
    active: 'bg-sky-500/20 border-sky-500/40 text-sky-300',
    icon: 'text-sky-500',
  },
  amber: {
    btn: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 hover:border-amber-500/40 text-amber-300',
    active: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
    icon: 'text-amber-500',
  },
  violet: {
    btn: 'bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/20 hover:border-violet-500/40 text-violet-300',
    active: 'bg-violet-500/20 border-violet-500/40 text-violet-300',
    icon: 'text-violet-500',
  },
};

export default function CalibrationPanel() {
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const addAlert = useDroneStore((s) => s.addAlert);
  const isConnected = connectionStatus === 'connected';
  const [running, setRunning] = useState(null);

  const startCalibration = useCallback(async (type) => {
    setRunning(type);
    try {
      const res = await fetch('/api/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Calibration failed', 'error');
        setRunning(null);
      } else {
        addAlert(`${type} calibration started — check MAVLink log for progress`, 'info');
        // Auto-clear running state after a timeout
        const timeouts = { gyro: 10000, accel: 90000, level: 10000, compass: 60000, pressure: 10000 };
        setTimeout(() => setRunning((r) => r === type ? null : r), timeouts[type] || 30000);
      }
    } catch (err) {
      addAlert(`Calibration failed: ${err.message}`, 'error');
      setRunning(null);
    }
  }, [addAlert]);

  if (!isConnected) {
    return (
      <div className="p-4">
        <div className="text-xs text-gray-600 italic text-center py-8">
          Connect to a vehicle to calibrate sensors
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <div className="text-[10px] text-gray-600 mb-3">
        Ensure the vehicle is disarmed before calibrating. Watch the MAVLink log for progress messages.
      </div>

      {CALIBRATIONS.map((cal) => {
        const colors = COLOR_CLASSES[cal.color];
        const isRunning = running === cal.id;
        const Icon = cal.icon;

        return (
          <div
            key={cal.id}
            className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Icon size={13} className={colors.icon} />
              <span className="text-xs font-semibold text-gray-300">{cal.label}</span>
              <span className="text-[9px] text-gray-600 ml-auto">{cal.duration}</span>
            </div>
            <p className="text-[10px] text-gray-500 mb-2.5 leading-relaxed">
              {cal.description}
            </p>
            <button
              onClick={() => startCalibration(cal.id)}
              disabled={running !== null}
              className={`w-full py-2 rounded-md text-xs font-semibold transition-all border ${
                isRunning
                  ? colors.active
                  : running !== null
                  ? 'opacity-30 cursor-not-allowed ' + colors.btn
                  : colors.btn
              }`}
            >
              {isRunning ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  Calibrating...
                </span>
              ) : (
                `Start ${cal.label} Calibration`
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
