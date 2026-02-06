import React, { useState, useCallback, useEffect } from 'react';
import { SlidersHorizontal, Cog, Gamepad2, Compass, Keyboard, Zap, Plus, X, Trash2 } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import ParamsPanel from './ParamsPanel';
import GamepadPanel from './GamepadPanel';
import CalibrationPanel from './CalibrationPanel';

const COMMAND_OPTIONS = [
  { value: 'arm', label: 'Arm' },
  { value: 'disarm', label: 'Disarm' },
  { value: 'takeoff', label: 'Takeoff' },
  { value: 'land', label: 'Land' },
  { value: 'rtl', label: 'RTL' },
  { value: 'mission_start', label: 'Mission Start' },
  { value: 'mission_pause', label: 'Mission Pause' },
  { value: 'mode:STABILIZE', label: 'Mode: Stabilize' },
  { value: 'mode:ALT_HOLD', label: 'Mode: Alt Hold' },
  { value: 'mode:LOITER', label: 'Mode: Loiter' },
  { value: 'mode:GUIDED', label: 'Mode: Guided' },
  { value: 'mode:AUTO', label: 'Mode: Auto' },
  { value: 'mode:RTL', label: 'Mode: RTL' },
  { value: 'mode:LAND', label: 'Mode: Land' },
];

function HotkeysPanel() {
  const commandHotkeys = useDroneStore((s) => s.commandHotkeys);
  const setCommandHotkey = useDroneStore((s) => s.setCommandHotkey);
  const removeCommandHotkey = useDroneStore((s) => s.removeCommandHotkey);
  const clearCommandHotkeys = useDroneStore((s) => s.clearCommandHotkeys);
  const addAlert = useDroneStore((s) => s.addAlert);
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const isConnected = connectionStatus === 'connected';

  const [recording, setRecording] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState('arm');
  const [recordedKey, setRecordedKey] = useState('');

  // Global hotkey listener
  useEffect(() => {
    if (!isConnected) return;

    const handleKeyDown = (e) => {
      // Don't trigger if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      const key = e.key.toLowerCase();

      // If recording, capture the key
      if (recording) {
        e.preventDefault();
        setRecordedKey(key);
        setRecording(false);
        return;
      }

      // Check if key has a command mapped
      const command = commandHotkeys[key];
      if (command) {
        e.preventDefault();
        executeCommand(command);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnected, recording, commandHotkeys]); // eslint-disable-line

  const executeCommand = async (command) => {
    if (!isConnected) return;

    try {
      if (command.startsWith('mode:')) {
        const mode = command.slice(5);
        await fetch('/api/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        });
        addAlert(`Mode: ${mode}`, 'info');
      } else {
        const endpoints = {
          arm: 'arm',
          disarm: 'disarm',
          takeoff: 'takeoff',
          land: 'land',
          rtl: 'rtl',
          mission_start: 'mission/start',
          mission_pause: 'mission/pause',
        };
        const ep = endpoints[command];
        if (ep) {
          await fetch(`/api/${ep}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(command === 'takeoff' ? { alt: 10 } : {}),
          });
          addAlert(`Command: ${command}`, 'info');
        }
      }
    } catch (err) {
      addAlert(`Command failed: ${err.message}`, 'error');
    }
  };

  const handleAddHotkey = () => {
    if (recordedKey && selectedCommand) {
      setCommandHotkey(recordedKey, selectedCommand);
      addAlert(`Hotkey '${recordedKey.toUpperCase()}' assigned to ${selectedCommand}`, 'info');
      setRecordedKey('');
    }
  };

  const inputCls = 'w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500/50 transition-colors';

  return (
    <div className="p-4 space-y-3">
      <div className="text-[10px] text-gray-600 mb-2">
        Assign keyboard hotkeys to flight commands. Press the key when not typing to trigger.
      </div>

      {/* Add new hotkey */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Plus size={11} className="text-gray-600" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Add Hotkey</span>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Command</label>
            <select
              value={selectedCommand}
              onChange={(e) => setSelectedCommand(e.target.value)}
              className={inputCls}
            >
              {COMMAND_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Key</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={recordedKey ? recordedKey.toUpperCase() : ''}
                readOnly
                placeholder={recording ? 'Press a key...' : 'Click Record'}
                className={`${inputCls} ${recording ? 'border-cyan-500/50 bg-cyan-500/10' : ''}`}
              />
              <button
                onClick={() => setRecording(!recording)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all border ${
                  recording
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-gray-800/60 text-gray-400 border-gray-700/50 hover:text-gray-200'
                }`}
              >
                {recording ? 'Recording...' : 'Record'}
              </button>
            </div>
          </div>

          <button
            onClick={handleAddHotkey}
            disabled={!recordedKey}
            className="w-full py-2 rounded-md text-xs font-semibold transition-all border bg-cyan-500/10 hover:bg-cyan-500/20 border-cyan-500/20 hover:border-cyan-500/40 text-cyan-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Add Hotkey
          </button>
        </div>
      </div>

      {/* Current hotkeys */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <Keyboard size={11} className="text-gray-600" />
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Active Hotkeys</span>
          </div>
          {Object.keys(commandHotkeys).length > 0 && (
            <button
              onClick={() => {
                clearCommandHotkeys();
                addAlert('All hotkeys cleared', 'info');
              }}
              className="text-[9px] text-red-400 hover:text-red-300"
            >
              Clear All
            </button>
          )}
        </div>

        {Object.keys(commandHotkeys).length === 0 ? (
          <div className="text-[10px] text-gray-600 italic text-center py-2">
            No hotkeys configured
          </div>
        ) : (
          <div className="space-y-1">
            {Object.entries(commandHotkeys).map(([key, command]) => (
              <div key={key} className="flex items-center justify-between px-2 py-1.5 bg-gray-900/40 rounded-md">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-300 text-[10px] font-mono font-bold rounded border border-cyan-500/30">
                    {key.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {COMMAND_OPTIONS.find(c => c.value === command)?.label || command}
                  </span>
                </div>
                <button
                  onClick={() => removeCommandHotkey(key)}
                  className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ServoGroupsPanel() {
  const servoGroups = useDroneStore((s) => s.servoGroups);
  const addServoGroup = useDroneStore((s) => s.addServoGroup);
  const removeServoGroup = useDroneStore((s) => s.removeServoGroup);
  const addAlert = useDroneStore((s) => s.addAlert);
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const isConnected = connectionStatus === 'connected';

  const [name, setName] = useState('');
  const [servo, setServo] = useState(9);
  const [openPwm, setOpenPwm] = useState(2000);
  const [closePwm, setClosePwm] = useState(1000);
  const [hotkey, setHotkey] = useState('');
  const [recordingHotkey, setRecordingHotkey] = useState(false);

  // Record hotkey
  useEffect(() => {
    if (!recordingHotkey) return;

    const handleKeyDown = (e) => {
      e.preventDefault();
      setHotkey(e.key.toLowerCase());
      setRecordingHotkey(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recordingHotkey]);

  // Listen for servo group hotkeys
  useEffect(() => {
    if (!isConnected) return;

    const handleKeyDown = async (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

      const key = e.key.toLowerCase();
      const group = servoGroups.find(g => g.hotkey === key);
      if (group) {
        e.preventDefault();
        // Toggle between open and close
        const isOpen = group.state === 'open';
        const pwm = isOpen ? group.closePwm : group.openPwm;
        try {
          await fetch('/api/servo/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ servo: group.servo, pwm }),
          });
          // Update state (this won't persist, but UI will show toggle)
          addAlert(`${group.name}: ${isOpen ? 'Closed' : 'Opened'}`, 'info');
        } catch {}
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConnected, servoGroups, addAlert]);

  const handleAdd = () => {
    if (!name.trim()) {
      addAlert('Enter a name for the servo group', 'warning');
      return;
    }
    addServoGroup({
      name: name.trim(),
      servo,
      openPwm,
      closePwm,
      hotkey: hotkey || null,
      state: 'closed',
    });
    addAlert(`Servo group "${name}" added`, 'success');
    setName('');
    setHotkey('');
  };

  const inputCls = 'w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500/50 transition-colors';

  return (
    <div className="p-4 space-y-3">
      <div className="text-[10px] text-gray-600 mb-2">
        Create servo groups for quick actuation (e.g., gripper, payload release). Groups appear as buttons on the map.
      </div>

      {/* Add new group */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Plus size={11} className="text-gray-600" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Add Servo Group</span>
        </div>

        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Gripper, Drop"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Servo</label>
              <select value={servo} onChange={(e) => setServo(parseInt(e.target.value))} className={inputCls}>
                {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16].map((n) => (
                  <option key={n} value={n}>Servo {n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Hotkey (optional)</label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={hotkey ? hotkey.toUpperCase() : ''}
                  readOnly
                  placeholder={recordingHotkey ? 'Press...' : ''}
                  className={`${inputCls} ${recordingHotkey ? 'border-cyan-500/50' : ''}`}
                />
                <button
                  onClick={() => setRecordingHotkey(!recordingHotkey)}
                  className="px-2 text-[9px] bg-gray-800/60 text-gray-400 border border-gray-700/50 rounded hover:text-gray-200"
                >
                  {recordingHotkey ? '...' : 'Set'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Open PWM</label>
              <input
                type="number"
                value={openPwm}
                onChange={(e) => setOpenPwm(parseInt(e.target.value) || 2000)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Close PWM</label>
              <input
                type="number"
                value={closePwm}
                onChange={(e) => setClosePwm(parseInt(e.target.value) || 1000)}
                className={inputCls}
              />
            </div>
          </div>

          <button
            onClick={handleAdd}
            className="w-full py-2 rounded-md text-xs font-semibold transition-all border bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 hover:border-emerald-500/40 text-emerald-300"
          >
            Add Group
          </button>
        </div>
      </div>

      {/* Existing groups */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Zap size={11} className="text-gray-600" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Servo Groups</span>
        </div>

        {servoGroups.length === 0 ? (
          <div className="text-[10px] text-gray-600 italic text-center py-2">
            No servo groups configured
          </div>
        ) : (
          <div className="space-y-1.5">
            {servoGroups.map((group) => (
              <div key={group.id} className="flex items-center justify-between px-2 py-1.5 bg-gray-900/40 rounded-md">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-gray-300">{group.name}</span>
                  <span className="text-[9px] text-gray-500">S{group.servo}</span>
                  {group.hotkey && (
                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 text-[9px] font-mono rounded border border-amber-500/30">
                      {group.hotkey.toUpperCase()}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeServoGroup(group.id)}
                  className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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

  const tabs = [
    { id: 'motors', label: 'Motors', icon: Cog },
    { id: 'gamepad', label: 'Control', icon: Gamepad2 },
    { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard },
    { id: 'servos', label: 'Servos', icon: Zap },
    { id: 'calibration', label: 'Cal', icon: Compass },
    { id: 'params', label: 'Params', icon: SlidersHorizontal },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Subtab toggle */}
      <div className="flex border-b border-gray-800/50 shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`flex items-center justify-center gap-1 px-2 py-2 text-[9px] font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
              subTab === tab.id
                ? 'text-cyan-400 bg-cyan-500/5'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <tab.icon size={10} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {subTab === 'motors' ? (
          <MotorServoPanel />
        ) : subTab === 'gamepad' ? (
          <GamepadPanel sendMessage={sendMessage} />
        ) : subTab === 'hotkeys' ? (
          <HotkeysPanel />
        ) : subTab === 'servos' ? (
          <ServoGroupsPanel />
        ) : subTab === 'calibration' ? (
          <CalibrationPanel />
        ) : (
          <ParamsPanel />
        )}
      </div>
    </div>
  );
}
