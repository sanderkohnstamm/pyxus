import React, { useState, useCallback, useEffect } from 'react';
import { Compass, Activity, ArrowDownToLine, Gauge, Loader2, X, Check, ChevronRight } from 'lucide-react';
import useDroneStore from '../store/droneStore';

// Accel calibration positions (ArduPilot order)
const ACCEL_POSITIONS = [
  { id: 'level', label: 'Level', icon: '⬜', description: 'Place vehicle level on a flat surface' },
  { id: 'left', label: 'Left Side', icon: '◀️', description: 'Roll to left side (left wing down)' },
  { id: 'right', label: 'Right Side', icon: '▶️', description: 'Roll to right side (right wing down)' },
  { id: 'nose_down', label: 'Nose Down', icon: '⬇️', description: 'Pitch forward (nose pointing down)' },
  { id: 'nose_up', label: 'Nose Up', icon: '⬆️', description: 'Pitch backward (nose pointing up)' },
  { id: 'back', label: 'On Back', icon: '🔄', description: 'Flip upside down (belly up)' },
];

const CALIBRATIONS = [
  {
    id: 'gyro',
    label: 'Gyroscope',
    icon: Activity,
    color: 'cyan',
    description: 'Keep the vehicle completely still on a flat surface.',
    duration: '~5s',
    hasSteps: false,
  },
  {
    id: 'accel',
    label: 'Accelerometer',
    icon: ArrowDownToLine,
    color: 'emerald',
    description: 'Follow the 6-position calibration sequence. Place the vehicle in each orientation when prompted.',
    duration: '~60s',
    hasSteps: true,
  },
  {
    id: 'level',
    label: 'Level Horizon',
    icon: ArrowDownToLine,
    color: 'sky',
    description: 'Place the vehicle level on a flat surface. Calibrates the level position for the accelerometer.',
    duration: '~5s',
    hasSteps: false,
  },
  {
    id: 'compass',
    label: 'Compass',
    icon: Compass,
    color: 'amber',
    description: 'Rotate the vehicle around all axes. Watch the progress bar or MAVLink log.',
    duration: '~30s',
    hasSteps: false,
  },
  {
    id: 'pressure',
    label: 'Barometer',
    icon: Gauge,
    color: 'violet',
    description: 'Keep the vehicle still. Calibrates the barometric pressure sensor.',
    duration: '~5s',
    hasSteps: false,
  },
];

const COLOR_CLASSES = {
  cyan: {
    btn: 'bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/20 hover:border-cyan-500/40 text-cyan-300',
    active: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
    icon: 'text-cyan-500',
    step: 'bg-cyan-500',
  },
  emerald: {
    btn: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 hover:border-emerald-500/40 text-emerald-300',
    active: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
    icon: 'text-emerald-500',
    step: 'bg-emerald-500',
  },
  sky: {
    btn: 'bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/20 hover:border-sky-500/40 text-sky-300',
    active: 'bg-sky-500/20 border-sky-500/40 text-sky-300',
    icon: 'text-sky-500',
    step: 'bg-sky-500',
  },
  amber: {
    btn: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20 hover:border-amber-500/40 text-amber-300',
    active: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
    icon: 'text-amber-500',
    step: 'bg-amber-500',
  },
  violet: {
    btn: 'bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/20 hover:border-violet-500/40 text-violet-300',
    active: 'bg-violet-500/20 border-violet-500/40 text-violet-300',
    icon: 'text-violet-500',
    step: 'bg-violet-500',
  },
};

export default function CalibrationPanel() {
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const addAlert = useDroneStore((s) => s.addAlert);
  const calibrationStatus = useDroneStore((s) => s.calibrationStatus);
  const setCalibrationActive = useDroneStore((s) => s.setCalibrationActive);
  const clearCalibrationStatus = useDroneStore((s) => s.clearCalibrationStatus);
  const isConnected = connectionStatus === 'connected';

  const [localRunning, setLocalRunning] = useState(null);

  // Sync local running state with store
  useEffect(() => {
    if (calibrationStatus.active) {
      setLocalRunning(calibrationStatus.type);
    }
  }, [calibrationStatus.active, calibrationStatus.type]);

  const startCalibration = useCallback(async (type) => {
    setLocalRunning(type);
    setCalibrationActive(true, type);

    try {
      const res = await fetch('/api/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Calibration failed to start', 'error');
        setLocalRunning(null);
        clearCalibrationStatus();
      } else {
        addAlert(`${type} calibration started`, 'info');
        // Auto-clear running state after a timeout (as fallback)
        const timeouts = { gyro: 15000, accel: 120000, level: 15000, compass: 90000, pressure: 15000 };
        setTimeout(() => {
          setLocalRunning((r) => {
            if (r === type) {
              clearCalibrationStatus();
              return null;
            }
            return r;
          });
        }, timeouts[type] || 60000);
      }
    } catch (err) {
      addAlert(`Calibration failed: ${err.message}`, 'error');
      setLocalRunning(null);
      clearCalibrationStatus();
    }
  }, [addAlert, setCalibrationActive, clearCalibrationStatus]);

  const cancelCalibration = useCallback(async () => {
    try {
      // Send cancel command (all zeros cancels calibration)
      await fetch('/api/calibrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cancel' }),
      });
      addAlert('Calibration cancelled', 'info');
    } catch {
      // Ignore errors on cancel
    }
    setLocalRunning(null);
    clearCalibrationStatus();
  }, [addAlert, clearCalibrationStatus]);

  if (!isConnected) {
    return (
      <div className="p-4">
        <div className="text-xs text-gray-600 italic text-center py-8">
          Connect to a vehicle to calibrate sensors
        </div>
      </div>
    );
  }

  const running = localRunning;
  const currentStep = calibrationStatus.step;

  return (
    <div className="p-4 space-y-2">
      <div className="text-[10px] text-gray-600 mb-3">
        Ensure the vehicle is disarmed before calibrating.
      </div>

      {CALIBRATIONS.map((cal) => {
        const colors = COLOR_CLASSES[cal.color];
        const isRunning = running === cal.id;
        const Icon = cal.icon;

        return (
          <div
            key={cal.id}
            className={`bg-gray-800/40 rounded-lg p-3 border transition-all ${
              isRunning ? 'border-' + cal.color + '-500/40' : 'border-gray-800/50'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Icon size={13} className={colors.icon} />
              <span className="text-xs font-semibold text-gray-300">{cal.label}</span>
              <span className="text-[9px] text-gray-600 ml-auto">{cal.duration}</span>
            </div>

            {/* Description (hide when running this calibration) */}
            {!isRunning && (
              <p className="text-[10px] text-gray-500 mb-2.5 leading-relaxed">
                {cal.description}
              </p>
            )}

            {/* Accel calibration step indicator */}
            {isRunning && cal.id === 'accel' && (
              <div className="mb-3">
                {/* Step progress */}
                <div className="flex gap-1 mb-3">
                  {ACCEL_POSITIONS.map((pos, i) => (
                    <div
                      key={pos.id}
                      className={`flex-1 h-1.5 rounded-full transition-all ${
                        i < currentStep
                          ? 'bg-emerald-500'
                          : i === currentStep
                          ? 'bg-emerald-400 animate-pulse'
                          : 'bg-gray-700'
                      }`}
                    />
                  ))}
                </div>

                {/* Current position instruction */}
                <div className="bg-emerald-950/50 border border-emerald-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">{ACCEL_POSITIONS[currentStep]?.icon}</span>
                    <div>
                      <div className="text-sm font-semibold text-emerald-300">
                        Step {currentStep + 1}/6: {ACCEL_POSITIONS[currentStep]?.label}
                      </div>
                      <div className="text-[10px] text-emerald-400/70">
                        {ACCEL_POSITIONS[currentStep]?.description}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Position guide */}
                <div className="grid grid-cols-6 gap-1 mt-2">
                  {ACCEL_POSITIONS.map((pos, i) => (
                    <div
                      key={pos.id}
                      className={`text-center py-1 rounded text-[9px] transition-all ${
                        i < currentStep
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : i === currentStep
                          ? 'bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-500/50'
                          : 'bg-gray-800/50 text-gray-600'
                      }`}
                    >
                      {i < currentStep ? <Check size={10} className="mx-auto" /> : pos.icon}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Running indicator for non-accel calibrations */}
            {isRunning && cal.id !== 'accel' && (
              <div className="mb-3 bg-gray-900/50 border border-gray-700/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <Loader2 size={14} className="animate-spin text-cyan-400" />
                  <span>Calibrating... Follow vehicle LEDs or MAVLink log</span>
                </div>
              </div>
            )}

            {/* Recent calibration messages */}
            {isRunning && calibrationStatus.messages.length > 0 && (
              <div className="mb-3 max-h-20 overflow-y-auto bg-gray-900/30 rounded border border-gray-800/30 p-2">
                {calibrationStatus.messages.slice(-5).map((msg, i) => (
                  <div key={i} className="text-[9px] text-gray-400 font-mono truncate">
                    {msg.text}
                  </div>
                ))}
              </div>
            )}

            {/* Buttons */}
            {isRunning ? (
              <button
                onClick={cancelCalibration}
                className="w-full py-2 rounded-md text-xs font-semibold transition-all border bg-red-500/10 hover:bg-red-500/20 border-red-500/20 hover:border-red-500/40 text-red-300 flex items-center justify-center gap-1.5"
              >
                <X size={12} />
                Cancel Calibration
              </button>
            ) : (
              <button
                onClick={() => startCalibration(cal.id)}
                disabled={running !== null}
                className={`w-full py-2 rounded-md text-xs font-semibold transition-all border ${
                  running !== null
                    ? 'opacity-30 cursor-not-allowed ' + colors.btn
                    : colors.btn
                }`}
              >
                Start {cal.label} Calibration
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
