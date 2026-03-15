import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Video, SlidersHorizontal, Activity, Compass, Cog, Zap, Radio, Gauge, Loader2, Check } from 'lucide-react';
import useDroneStore from '../../store/droneStore';
import { droneApi } from '../../utils/api';
import ParamsPanel from '../../components/ParamsPanel';
import MavlinkInspector from '../../components/MavlinkInspector';
import VideoControl from '../components/VideoControl';

function AccordionSection({ icon: Icon, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-800/30 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left active:bg-gray-800/20 transition-colors"
      >
        <Icon size={14} className="text-gray-400 shrink-0" />
        <span className="text-[12px] font-semibold text-gray-300 flex-1">{title}</span>
        {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-800/20">
          {children}
        </div>
      )}
    </div>
  );
}

function VideoSection() {
  const videoUrl = useDroneStore((s) => s.videoUrl);
  const setVideoUrl = useDroneStore((s) => s.setVideoUrl);

  return (
    <div className="space-y-2 pt-2">
      <label className="text-[11px] text-gray-400">RTSP Stream URL</label>
      <input
        type="url"
        value={videoUrl}
        onChange={(e) => setVideoUrl(e.target.value)}
        placeholder="rtsp://192.168.1.1:8554/stream"
        className="w-full bg-gray-900/50 border border-gray-700/30 rounded-lg px-3 py-2.5 text-[12px] font-mono text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-600/50"
      />
    </div>
  );
}

function MotorTestSection() {
  const addAlert = useDroneStore((s) => s.addAlert);
  const [motor, setMotor] = useState(1);
  const [throttle, setThrottle] = useState(5);
  const [duration, setDuration] = useState(2);
  const [allMotors, setAllMotors] = useState(false);
  const [running, setRunning] = useState(false);

  const testMotor = useCallback(async () => {
    try {
      setRunning(true);
      const res = await fetch(droneApi('/api/motor/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motor: allMotors ? 1 : motor, throttle, duration, all_motors: allMotors }),
      });
      const data = await res.json();
      if (data.status === 'error') addAlert(data.error || 'Motor test failed', 'error');
      else addAlert(allMotors ? `All motors: ${throttle}%` : `Motor ${motor}: ${throttle}%`, 'info');
      setTimeout(() => setRunning(false), duration * 1000);
    } catch (err) { addAlert(`Motor test failed: ${err.message}`, 'error'); setRunning(false); }
  }, [motor, throttle, duration, allMotors, addAlert]);

  const input = 'w-full bg-gray-900/50 border border-gray-700/30 rounded-lg px-3 py-2.5 text-[12px] font-mono focus:outline-none focus:border-gray-600/50';

  return (
    <div className="space-y-3 pt-2">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-[11px] text-gray-400">Motor #</label>
          <input type="number" value={motor} onChange={(e) => setMotor(parseInt(e.target.value) || 1)} min={1} max={12} className={input} disabled={allMotors} />
        </div>
        <div className="flex-1">
          <label className="text-[11px] text-gray-400">Throttle %</label>
          <input type="number" value={throttle} onChange={(e) => setThrottle(parseFloat(e.target.value) || 5)} min={0} max={100} className={input} />
        </div>
        <div className="flex-1">
          <label className="text-[11px] text-gray-400">Duration</label>
          <input type="number" value={duration} onChange={(e) => setDuration(parseFloat(e.target.value) || 2)} min={0.5} max={10} step={0.5} className={input} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-[11px] text-gray-400">
        <input type="checkbox" checked={allMotors} onChange={(e) => setAllMotors(e.target.checked)} className="rounded" />
        All motors simultaneously
      </label>
      <button onClick={testMotor} disabled={running} className="w-full py-2.5 rounded-xl border border-gray-700/30 bg-gray-900/60 text-[12px] font-semibold text-gray-300 active:scale-[0.98] disabled:opacity-40">
        {running ? 'Running…' : 'Test Motor'}
      </button>
    </div>
  );
}

function ServoTestSection() {
  const addAlert = useDroneStore((s) => s.addAlert);
  const [servo, setServo] = useState(1);
  const [pwm, setPwm] = useState(1500);

  const testServo = useCallback(async () => {
    try {
      const res = await fetch(droneApi('/api/servo/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servo, pwm }),
      });
      const data = await res.json();
      if (data.status === 'error') addAlert(data.error || 'Servo test failed', 'error');
      else addAlert(`Servo ${servo} → ${pwm}`, 'info');
    } catch (err) { addAlert(`Servo test failed: ${err.message}`, 'error'); }
  }, [servo, pwm, addAlert]);

  const input = 'w-full bg-gray-900/50 border border-gray-700/30 rounded-lg px-3 py-2.5 text-[12px] font-mono focus:outline-none focus:border-gray-600/50';

  return (
    <div className="space-y-3 pt-2">
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-[11px] text-gray-400">Servo #</label>
          <input type="number" value={servo} onChange={(e) => setServo(parseInt(e.target.value) || 1)} min={1} max={16} className={input} />
        </div>
        <div className="flex-1">
          <label className="text-[11px] text-gray-400">PWM</label>
          <input type="number" value={pwm} onChange={(e) => setPwm(parseInt(e.target.value) || 1500)} min={800} max={2200} step={50} className={input} />
        </div>
      </div>
      <button onClick={testServo} className="w-full py-2.5 rounded-xl border border-gray-700/30 bg-gray-900/60 text-[12px] font-semibold text-gray-300 active:scale-[0.98]">
        Test Servo
      </button>
    </div>
  );
}

function CalibrationSection() {
  const addAlert = useDroneStore((s) => s.addAlert);
  const calibrationStatus = useDroneStore((s) => s.calibrationStatus);
  const setCalibrationActive = useDroneStore((s) => s.setCalibrationActive);
  const clearCalibrationStatus = useDroneStore((s) => s.clearCalibrationStatus);
  const [localRunning, setLocalRunning] = useState(null);

  const startCalibration = useCallback(async (type) => {
    setLocalRunning(type);
    setCalibrationActive(true, type);
    try {
      const res = await fetch(droneApi('/api/calibrate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || `${type} calibration failed`, 'error');
        clearCalibrationStatus();
        setLocalRunning(null);
      } else {
        addAlert(`${type} calibration started`, 'info');
      }
    } catch (err) {
      addAlert(`Calibration failed: ${err.message}`, 'error');
      clearCalibrationStatus();
      setLocalRunning(null);
    }
  }, [addAlert, setCalibrationActive, clearCalibrationStatus]);

  const calibTypes = [
    { type: 'gyro', label: 'Gyro', icon: Gauge },
    { type: 'accel', label: 'Accelerometer', icon: Compass },
    { type: 'level', label: 'Level', icon: Radio },
    { type: 'compass', label: 'Compass', icon: Compass },
    { type: 'pressure', label: 'Baro', icon: Zap },
  ];

  const btn = 'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-700/30 bg-gray-900/60 text-[11px] font-semibold active:scale-95 transition-transform';

  return (
    <div className="space-y-3 pt-2">
      <div className="grid grid-cols-2 gap-2">
        {calibTypes.map(({ type, label }) => {
          const isRunning = localRunning === type && calibrationStatus.active;
          return (
            <button
              key={type}
              onClick={() => startCalibration(type)}
              disabled={calibrationStatus.active}
              className={`${btn} ${isRunning ? 'text-cyan-400 border-cyan-500/30' : 'text-gray-400'} disabled:opacity-40`}
            >
              {isRunning ? <Loader2 size={12} className="animate-spin" /> : null}
              {label}
            </button>
          );
        })}
      </div>
      {calibrationStatus.active && calibrationStatus.messages?.length > 0 && (
        <div className="max-h-24 overflow-y-auto space-y-0.5 bg-gray-900/30 rounded-lg p-2">
          {calibrationStatus.messages.slice(-5).map((msg, i) => (
            <div key={i} className="text-[10px] font-mono text-gray-400">{msg.text}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsSection() {
  const confirmDangerousCommands = useDroneStore((s) => s.confirmDangerousCommands);
  const setConfirmDangerousCommands = useDroneStore((s) => s.setConfirmDangerousCommands);
  const batteryWarnThreshold = useDroneStore((s) => s.batteryWarnThreshold);
  const batteryCritThreshold = useDroneStore((s) => s.batteryCritThreshold);
  const setBatteryWarnThreshold = useDroneStore((s) => s.setBatteryWarnThreshold);
  const setBatteryCritThreshold = useDroneStore((s) => s.setBatteryCritThreshold);

  const input = 'w-20 bg-gray-900/50 border border-gray-700/30 rounded-lg px-2.5 py-2 text-[12px] font-mono text-right focus:outline-none focus:border-gray-600/50';

  return (
    <div className="space-y-3 pt-2">
      <label className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400">Confirm dangerous commands</span>
        <input type="checkbox" checked={confirmDangerousCommands} onChange={(e) => setConfirmDangerousCommands(e.target.checked)} className="rounded" />
      </label>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400">Battery warning %</span>
        <input type="number" value={batteryWarnThreshold} onChange={(e) => setBatteryWarnThreshold(parseInt(e.target.value) || 30)} min={5} max={80} className={input} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-gray-400">Battery critical %</span>
        <input type="number" value={batteryCritThreshold} onChange={(e) => setBatteryCritThreshold(parseInt(e.target.value) || 15)} min={5} max={50} className={input} />
      </div>
    </div>
  );
}

export default function ToolsSheet() {
  return (
    <div className="space-y-3 pb-8">
      <AccordionSection icon={Video} title="Video" defaultOpen>
        <VideoSection />
        <div className="pt-3 border-t border-gray-800/20 mt-3">
          <VideoControl />
        </div>
      </AccordionSection>

      <AccordionSection icon={SlidersHorizontal} title="Parameters">
        <div className="pt-2"><ParamsPanel /></div>
      </AccordionSection>

      <AccordionSection icon={Activity} title="MAVLink Inspector">
        <div className="pt-2"><MavlinkInspector /></div>
      </AccordionSection>

      <AccordionSection icon={Zap} title="Motor Test">
        <MotorTestSection />
      </AccordionSection>

      <AccordionSection icon={Radio} title="Servo Test">
        <ServoTestSection />
      </AccordionSection>

      <AccordionSection icon={Compass} title="Calibration">
        <CalibrationSection />
      </AccordionSection>

      <AccordionSection icon={Cog} title="Settings">
        <SettingsSection />
      </AccordionSection>
    </div>
  );
}
