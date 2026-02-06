import React, { useState, useCallback, useEffect } from 'react';
import { SlidersHorizontal, Cog, Gamepad2, Compass, Keyboard, Zap, Plus, X, Trash2, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import ParamsPanel from './ParamsPanel';
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

// Merged Controls Panel with Hotkeys and Servo Groups
function ControlsPanel({ sendMessage }) {
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const addAlert = useDroneStore((s) => s.addAlert);
  const isConnected = connectionStatus === 'connected';

  // Hotkeys state
  const commandHotkeys = useDroneStore((s) => s.commandHotkeys);
  const setCommandHotkey = useDroneStore((s) => s.setCommandHotkey);
  const removeCommandHotkey = useDroneStore((s) => s.removeCommandHotkey);
  const clearCommandHotkeys = useDroneStore((s) => s.clearCommandHotkeys);

  // Servo groups state
  const servoGroups = useDroneStore((s) => s.servoGroups);
  const addServoGroup = useDroneStore((s) => s.addServoGroup);
  const removeServoGroup = useDroneStore((s) => s.removeServoGroup);

  // Hotkey recording
  const [recording, setRecording] = useState(null); // null | 'command' | 'servoOpen' | 'servoClose'
  const [selectedCommand, setSelectedCommand] = useState('arm');
  const [recordedKey, setRecordedKey] = useState('');

  // Servo group form
  const [servoName, setServoName] = useState('');
  const [servoList, setServoList] = useState([{ servo: 9, openPwm: 2000, closePwm: 1000 }]);
  const [openHotkey, setOpenHotkey] = useState('');
  const [closeHotkey, setCloseHotkey] = useState('');

  // Collapsible sections
  const [hotkeysExpanded, setHotkeysExpanded] = useState(true);
  const [servosExpanded, setServosExpanded] = useState(true);
  const [gamepadExpanded, setGamepadExpanded] = useState(true);

  // Gamepad state
  const gamepadEnabled = useDroneStore((s) => s.gamepadEnabled);
  const setGamepadEnabled = useDroneStore((s) => s.setGamepadEnabled);
  const keyboardEnabled = useDroneStore((s) => s.keyboardEnabled);
  const setKeyboardEnabled = useDroneStore((s) => s.setKeyboardEnabled);
  const [gamepads, setGamepads] = useState([]);

  // Scan for gamepads
  useEffect(() => {
    const scanGamepads = () => {
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      const connected = [];
      for (let i = 0; i < gps.length; i++) {
        if (gps[i]) {
          connected.push({
            index: i,
            id: gps[i].id,
            name: gps[i].id.split('(')[0].trim().substring(0, 25) || gps[i].id,
          });
        }
      }
      setGamepads(connected);
    };
    scanGamepads();
    const onConnect = () => scanGamepads();
    const onDisconnect = () => scanGamepads();
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, []);

  // Key recording effect
  useEffect(() => {
    if (!recording) return;

    const handleKeyDown = (e) => {
      e.preventDefault();
      const key = e.key.toLowerCase();

      if (recording === 'command') {
        setRecordedKey(key);
      } else if (recording === 'servoOpen') {
        setOpenHotkey(key);
      } else if (recording === 'servoClose') {
        setCloseHotkey(key);
      }
      setRecording(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recording]);

  const handleAddHotkey = () => {
    if (recordedKey && selectedCommand) {
      setCommandHotkey(recordedKey, selectedCommand);
      addAlert(`Hotkey '${recordedKey.toUpperCase()}' → ${selectedCommand}`, 'info');
      setRecordedKey('');
    }
  };

  const addServoToList = () => {
    setServoList([...servoList, { servo: 9, openPwm: 2000, closePwm: 1000 }]);
  };

  const updateServoInList = (index, field, value) => {
    const updated = [...servoList];
    updated[index] = { ...updated[index], [field]: parseInt(value) || 0 };
    setServoList(updated);
  };

  const removeServoFromList = (index) => {
    if (servoList.length > 1) {
      setServoList(servoList.filter((_, i) => i !== index));
    }
  };

  const handleAddServoGroup = () => {
    if (!servoName.trim()) {
      addAlert('Enter a name for the servo group', 'warning');
      return;
    }
    addServoGroup({
      name: servoName.trim(),
      servos: servoList,
      openHotkey: openHotkey || null,
      closeHotkey: closeHotkey || null,
      state: 'closed',
    });
    addAlert(`Servo group "${servoName}" added`, 'success');
    setServoName('');
    setServoList([{ servo: 9, openPwm: 2000, closePwm: 1000 }]);
    setOpenHotkey('');
    setCloseHotkey('');
  };

  const inputCls = 'w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-cyan-500/50 transition-colors';

  return (
    <div className="p-4 space-y-3">
      <div className="text-[10px] text-gray-600 mb-2">
        Configure keyboard hotkeys for commands and servo groups. Hotkeys work globally when connected.
      </div>

      {/* Command Hotkeys Section */}
      <div className="bg-gray-800/40 rounded-lg border border-gray-800/50 overflow-hidden">
        <button
          onClick={() => setHotkeysExpanded(!hotkeysExpanded)}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-800/20 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <Keyboard size={11} className="text-cyan-500" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Command Hotkeys</span>
            <span className="text-[9px] text-gray-600">({Object.keys(commandHotkeys).length})</span>
          </div>
          {hotkeysExpanded ? <ChevronUp size={12} className="text-gray-500" /> : <ChevronDown size={12} className="text-gray-500" />}
        </button>

        {hotkeysExpanded && (
          <div className="p-3 pt-0 space-y-2">
            {/* Add new hotkey */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[9px] text-gray-500 block mb-1">Command</label>
                <select value={selectedCommand} onChange={(e) => setSelectedCommand(e.target.value)} className={inputCls}>
                  {COMMAND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="w-16">
                <label className="text-[9px] text-gray-500 block mb-1">Key</label>
                <input
                  type="text"
                  value={recordedKey ? recordedKey.toUpperCase() : ''}
                  readOnly
                  placeholder={recording === 'command' ? '...' : ''}
                  onClick={() => setRecording('command')}
                  className={`${inputCls} cursor-pointer text-center ${recording === 'command' ? 'border-cyan-500/50 bg-cyan-500/10' : ''}`}
                />
              </div>
              <button
                onClick={handleAddHotkey}
                disabled={!recordedKey}
                className="px-3 py-1.5 rounded-md text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-300 disabled:opacity-30"
              >
                Add
              </button>
            </div>

            {/* Active hotkeys */}
            {Object.keys(commandHotkeys).length > 0 && (
              <div className="space-y-1 pt-1">
                {Object.entries(commandHotkeys).map(([key, command]) => (
                  <div key={key} className="flex items-center justify-between px-2 py-1 bg-gray-900/40 rounded">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-300 text-[9px] font-mono font-bold rounded">
                        {key.toUpperCase()}
                      </span>
                      <span className="text-[9px] text-gray-400">
                        {COMMAND_OPTIONS.find(c => c.value === command)?.label || command}
                      </span>
                    </div>
                    <button onClick={() => removeCommandHotkey(key)} className="p-0.5 text-gray-600 hover:text-red-400">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Servo Groups Section */}
      <div className="bg-gray-800/40 rounded-lg border border-gray-800/50 overflow-hidden">
        <button
          onClick={() => setServosExpanded(!servosExpanded)}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-800/20 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <Zap size={11} className="text-amber-500" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Servo Groups</span>
            <span className="text-[9px] text-gray-600">({servoGroups.length})</span>
          </div>
          {servosExpanded ? <ChevronUp size={12} className="text-gray-500" /> : <ChevronDown size={12} className="text-gray-500" />}
        </button>

        {servosExpanded && (
          <div className="p-3 pt-0 space-y-3">
            {/* Add new group */}
            <div className="space-y-2 p-2 bg-gray-900/30 rounded-md border border-gray-800/30">
              <div>
                <label className="text-[9px] text-gray-500 block mb-1">Group Name</label>
                <input
                  type="text"
                  value={servoName}
                  onChange={(e) => setServoName(e.target.value)}
                  placeholder="e.g., Gripper, Payload"
                  className={inputCls}
                />
              </div>

              {/* Servos list */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[9px] text-gray-500">Servos</label>
                  <button onClick={addServoToList} className="text-[9px] text-cyan-400 hover:text-cyan-300">+ Add Servo</button>
                </div>
                {servoList.map((s, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <select
                      value={s.servo}
                      onChange={(e) => updateServoInList(i, 'servo', e.target.value)}
                      className="w-16 bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded px-1.5 py-1 text-[10px]"
                    >
                      {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16].map((n) => (
                        <option key={n} value={n}>S{n}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={s.openPwm}
                      onChange={(e) => updateServoInList(i, 'openPwm', e.target.value)}
                      className="w-16 bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded px-1.5 py-1 text-[10px]"
                      placeholder="Open"
                    />
                    <input
                      type="number"
                      value={s.closePwm}
                      onChange={(e) => updateServoInList(i, 'closePwm', e.target.value)}
                      className="w-16 bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded px-1.5 py-1 text-[10px]"
                      placeholder="Close"
                    />
                    {servoList.length > 1 && (
                      <button onClick={() => removeServoFromList(i)} className="p-1 text-gray-600 hover:text-red-400">
                        <X size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Hotkeys */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-gray-500 block mb-1">Open Hotkey</label>
                  <input
                    type="text"
                    value={openHotkey ? openHotkey.toUpperCase() : ''}
                    readOnly
                    placeholder={recording === 'servoOpen' ? '...' : 'Click'}
                    onClick={() => setRecording('servoOpen')}
                    className={`${inputCls} cursor-pointer text-center ${recording === 'servoOpen' ? 'border-emerald-500/50 bg-emerald-500/10' : ''}`}
                  />
                </div>
                <div>
                  <label className="text-[9px] text-gray-500 block mb-1">Close Hotkey</label>
                  <input
                    type="text"
                    value={closeHotkey ? closeHotkey.toUpperCase() : ''}
                    readOnly
                    placeholder={recording === 'servoClose' ? '...' : 'Click'}
                    onClick={() => setRecording('servoClose')}
                    className={`${inputCls} cursor-pointer text-center ${recording === 'servoClose' ? 'border-red-500/50 bg-red-500/10' : ''}`}
                  />
                </div>
              </div>

              <button
                onClick={handleAddServoGroup}
                className="w-full py-1.5 rounded-md text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300"
              >
                Add Servo Group
              </button>
            </div>

            {/* Existing groups */}
            {servoGroups.length > 0 && (
              <div className="space-y-1.5">
                {servoGroups.map((group) => (
                  <div key={group.id} className="flex items-center justify-between px-2 py-1.5 bg-gray-900/40 rounded">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-semibold text-gray-300">{group.name}</span>
                      <span className="text-[9px] text-gray-500">
                        {group.servos ? group.servos.map(s => `S${s.servo}`).join(', ') : `S${group.servo}`}
                      </span>
                      {group.openHotkey && (
                        <span className="px-1 py-0.5 bg-emerald-500/20 text-emerald-300 text-[8px] font-mono rounded">
                          {group.openHotkey.toUpperCase()}=Open
                        </span>
                      )}
                      {group.closeHotkey && (
                        <span className="px-1 py-0.5 bg-red-500/20 text-red-300 text-[8px] font-mono rounded">
                          {group.closeHotkey.toUpperCase()}=Close
                        </span>
                      )}
                    </div>
                    <button onClick={() => removeServoGroup(group.id)} className="p-1 text-gray-600 hover:text-red-400">
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Devices Section */}
      <div className="bg-gray-800/40 rounded-lg border border-gray-800/50 overflow-hidden">
        <button
          onClick={() => setGamepadExpanded(!gamepadExpanded)}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-800/20 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <Gamepad2 size={11} className="text-violet-500" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Input Devices</span>
          </div>
          {gamepadExpanded ? <ChevronUp size={12} className="text-gray-500" /> : <ChevronDown size={12} className="text-gray-500" />}
        </button>

        {gamepadExpanded && (
          <div className="p-3 pt-0 space-y-3">
            {/* Keyboard control */}
            <div className="flex items-center justify-between p-2 bg-gray-900/30 rounded-md border border-gray-800/30">
              <div className="flex items-center gap-2">
                <Keyboard size={12} className="text-cyan-500" />
                <div>
                  <div className="text-[10px] text-gray-300 font-medium">Keyboard Control</div>
                  <div className="text-[9px] text-gray-500">WASD/Arrows for RC override</div>
                </div>
              </div>
              <button
                onClick={() => setKeyboardEnabled(!keyboardEnabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  keyboardEnabled ? 'bg-cyan-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    keyboardEnabled ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {/* Gamepad control */}
            <div className="p-2 bg-gray-900/30 rounded-md border border-gray-800/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gamepad2 size={12} className="text-violet-500" />
                  <div>
                    <div className="text-[10px] text-gray-300 font-medium">Gamepad / Transmitter</div>
                    <div className="text-[9px] text-gray-500">
                      {gamepads.length > 0 ? gamepads[0].name : 'No controller detected'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setGamepadEnabled(!gamepadEnabled)}
                  disabled={gamepads.length === 0}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    gamepadEnabled ? 'bg-violet-600' : 'bg-gray-700'
                  } ${gamepads.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      gamepadEnabled ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
              {(keyboardEnabled || gamepadEnabled) && isConnected && (
                <div className="flex items-center gap-1.5 text-[9px] text-cyan-400 pt-1">
                  <Radio size={9} className="animate-pulse" />
                  <span>RC Override Active</span>
                </div>
              )}
            </div>

            <div className="text-[9px] text-gray-600 text-center">
              For advanced gamepad config, use Tools → Motors → Gamepad tab
            </div>
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

  const [motor, setMotor] = useState(1);
  const [throttle, setThrottle] = useState(5);
  const [duration, setDuration] = useState(2);
  const [allMotors, setAllMotors] = useState(false);
  const [motorRunning, setMotorRunning] = useState(false);

  const [servo, setServo] = useState(1);
  const [pwm, setPwm] = useState(1500);

  const testMotor = useCallback(async () => {
    try {
      setMotorRunning(true);
      const res = await fetch('/api/motor/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motor: allMotors ? 1 : motor, throttle, duration, all_motors: allMotors }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Motor test failed', 'error');
      } else {
        addAlert(allMotors ? `All motors: ${throttle}% for ${duration}s` : `Motor ${motor}: ${throttle}% for ${duration}s`, 'info');
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
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={allMotors}
              onChange={(e) => setAllMotors(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-cyan-500 focus:ring-0"
            />
            <span className="text-[11px] text-gray-400">All motors</span>
          </label>

          {!allMotors && (
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">Motor Number</label>
              <select value={motor} onChange={(e) => setMotor(parseInt(e.target.value))} className={inputCls}>
                {[1,2,3,4,5,6,7,8].map((n) => (<option key={n} value={n}>Motor {n}</option>))}
              </select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-500">Throttle</label>
              <span className="text-[10px] font-mono text-cyan-300">{throttle}%</span>
            </div>
            <input
              type="range" min={1} max={100} value={throttle}
              onChange={(e) => setThrottle(parseInt(e.target.value))}
              className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Duration (seconds)</label>
            <input type="number" min={0.5} max={30} step={0.5} value={duration} onChange={(e) => setDuration(parseFloat(e.target.value) || 2)} className={inputCls} />
          </div>

          <button
            onClick={testMotor}
            disabled={motorRunning}
            className={`w-full py-2 rounded-md text-xs font-semibold transition-all border ${
              motorRunning ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 cursor-not-allowed' : 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20 hover:border-red-500/40 text-red-300'
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
            <select value={servo} onChange={(e) => setServo(parseInt(e.target.value))} className={inputCls}>
              {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16].map((n) => (<option key={n} value={n}>Servo {n}</option>))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-500">PWM</label>
              <span className="text-[10px] font-mono text-cyan-300">{pwm}</span>
            </div>
            <input
              type="range" min={800} max={2200} value={pwm}
              onChange={(e) => setPwm(parseInt(e.target.value))}
              className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full"
            />
            <div className="flex justify-between text-[9px] text-gray-600 mt-0.5"><span>800</span><span>1500</span><span>2200</span></div>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {[{ v: 1000, l: 'Min' }, { v: 1500, l: 'Center' }, { v: 2000, l: 'Max' }].map((p) => (
              <button key={p.v} onClick={() => setPwm(p.v)} className="py-1 rounded text-[10px] font-semibold bg-gray-800/60 text-gray-400 hover:text-gray-200 border border-gray-700/50">{p.l}</button>
            ))}
          </div>

          <button onClick={testServo} className="w-full py-2 rounded-md text-xs font-semibold transition-all border bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/20 hover:border-sky-500/40 text-sky-300">
            Set Servo
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ToolsPanel({ sendMessage }) {
  const [subTab, setSubTab] = useState('controls');

  const tabs = [
    { id: 'controls', label: 'Controls', icon: Keyboard },
    { id: 'motors', label: 'Motors', icon: Cog },
    { id: 'calibration', label: 'Calibrate', icon: Compass },
    { id: 'params', label: 'Params', icon: SlidersHorizontal },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-gray-800/50 shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`flex items-center justify-center gap-1 px-3 py-2 text-[9px] font-semibold uppercase tracking-wider transition-colors whitespace-nowrap ${
              subTab === tab.id ? 'text-cyan-400 bg-cyan-500/5' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <tab.icon size={10} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {subTab === 'controls' ? (
          <ControlsPanel sendMessage={sendMessage} />
        ) : subTab === 'motors' ? (
          <MotorServoPanel />
        ) : subTab === 'calibration' ? (
          <CalibrationPanel />
        ) : (
          <ParamsPanel />
        )}
      </div>
    </div>
  );
}
