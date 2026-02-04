import React, { useState, useCallback } from 'react';
import { SlidersHorizontal, Cog, Gamepad2 } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import ParamsPanel from './ParamsPanel';
import GamepadPanel from './GamepadPanel';

function MotorServoPanel() {
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const addAlert = useDroneStore((s) => s.addAlert);
  const isConnected = connectionStatus === 'connected';

  // Motor test state
  const [motor, setMotor] = useState(1);
  const [throttle, setThrottle] = useState(5);
  const [duration, setDuration] = useState(2);
  const [allMotors, setAllMotors] = useState(false);
  const [motorRunning, setMotorRunning] = useState(false);

  // Servo test state
  const [servo, setServo] = useState(1);
  const [pwm, setPwm] = useState(1500);

  const testMotor = useCallback(async () => {
    try {
      setMotorRunning(true);
      const res = await fetch('/api/motor/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motor: allMotors ? 1 : motor,
          throttle,
          duration,
          all_motors: allMotors,
        }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Motor test failed', 'error');
      } else {
        addAlert(
          allMotors
            ? `All motors: ${throttle}% for ${duration}s`
            : `Motor ${motor}: ${throttle}% for ${duration}s`,
          'info'
        );
      }
      setTimeout(() => setMotorRunning(false), duration * 1000);
    } catch (err) {
      addAlert(`Motor test failed: ${err.message}`, 'error');
      setMotorRunning(false);
    }
  }, [motor, throttle, duration, allMotors, addAlert]);

  const testServo = useCallback(async () => {
    try {
      const res = await fetch('/api/servo/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servo, pwm }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Servo test failed', 'error');
      } else {
        addAlert(`Servo ${servo} set to ${pwm}`, 'info');
      }
    } catch (err) {
      addAlert(`Servo test failed: ${err.message}`, 'error');
    }
  }, [servo, pwm, addAlert]);

  if (!isConnected) {
    return (
      <div className="p-4">
        <div className="text-xs text-gray-600 italic text-center py-8">
          Connect to a vehicle to test motors & servos
        </div>
      </div>
    );
  }

  const inputCls = 'w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500/50 transition-colors';

  return (
    <div className="p-4 space-y-3">
      {/* Motor Test */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Cog size={11} className="text-gray-600" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Motor Test</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={allMotors}
                onChange={(e) => setAllMotors(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-cyan-500 focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-[11px] text-gray-400">All motors</span>
            </label>
          </div>

          {!allMotors && (
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Motor Number</label>
              <select
                value={motor}
                onChange={(e) => setMotor(parseInt(e.target.value))}
                className={inputCls}
              >
                {[1,2,3,4,5,6,7,8].map((n) => (
                  <option key={n} value={n}>Motor {n}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-500">Throttle</label>
              <span className="text-[10px] font-mono text-cyan-300">{throttle}%</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              value={throttle}
              onChange={(e) => setThrottle(parseInt(e.target.value))}
              className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Duration (seconds)</label>
            <input
              type="number"
              min={0.5}
              max={30}
              step={0.5}
              value={duration}
              onChange={(e) => setDuration(parseFloat(e.target.value) || 2)}
              className={inputCls}
            />
          </div>

          <button
            onClick={testMotor}
            disabled={motorRunning}
            className={`w-full py-2 rounded-md text-xs font-semibold transition-all border ${
              motorRunning
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 cursor-not-allowed'
                : 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20 hover:border-red-500/40 text-red-300'
            }`}
          >
            {motorRunning ? 'Running...' : 'Test Motor'}
          </button>
        </div>
      </div>

      {/* Servo Test */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Cog size={11} className="text-gray-600" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Servo Test</span>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Servo Output</label>
            <select
              value={servo}
              onChange={(e) => setServo(parseInt(e.target.value))}
              className={inputCls}
            >
              {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16].map((n) => (
                <option key={n} value={n}>Servo {n}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-500">PWM</label>
              <span className="text-[10px] font-mono text-cyan-300">{pwm}</span>
            </div>
            <input
              type="range"
              min={800}
              max={2200}
              value={pwm}
              onChange={(e) => setPwm(parseInt(e.target.value))}
              className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full"
            />
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
              <span>800</span>
              <span>1500</span>
              <span>2200</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => { setPwm(1000); }}
              className="py-1 rounded text-[10px] font-semibold bg-gray-800/60 text-gray-400 hover:text-gray-200 border border-gray-700/50 hover:border-gray-600/50 transition-all"
            >
              Min
            </button>
            <button
              onClick={() => { setPwm(1500); }}
              className="py-1 rounded text-[10px] font-semibold bg-gray-800/60 text-gray-400 hover:text-gray-200 border border-gray-700/50 hover:border-gray-600/50 transition-all"
            >
              Center
            </button>
            <button
              onClick={() => { setPwm(2000); }}
              className="py-1 rounded text-[10px] font-semibold bg-gray-800/60 text-gray-400 hover:text-gray-200 border border-gray-700/50 hover:border-gray-600/50 transition-all"
            >
              Max
            </button>
          </div>

          <button
            onClick={testServo}
            className="w-full py-2 rounded-md text-xs font-semibold transition-all border bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/20 hover:border-sky-500/40 text-sky-300"
          >
            Set Servo
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ToolsPanel({ sendMessage }) {
  const [subTab, setSubTab] = useState('motors');

  return (
    <div className="flex flex-col h-full">
      {/* Subtab toggle */}
      <div className="flex border-b border-gray-800/50 shrink-0">
        {[
          { id: 'motors', label: 'Motors', icon: Cog },
          { id: 'gamepad', label: 'Controller', icon: Gamepad2 },
          { id: 'params', label: 'Params', icon: SlidersHorizontal },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
              subTab === tab.id
                ? 'text-cyan-400 bg-cyan-500/5'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <tab.icon size={11} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {subTab === 'motors' ? (
          <MotorServoPanel />
        ) : subTab === 'gamepad' ? (
          <GamepadPanel sendMessage={sendMessage} />
        ) : (
          <ParamsPanel />
        )}
      </div>
    </div>
  );
}
