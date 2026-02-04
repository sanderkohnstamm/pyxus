import React, { useEffect, useRef, useCallback } from 'react';
import {
  Gamepad2,
  MapPin,
  Download,
} from 'lucide-react';
import useDroneStore from '../store/droneStore';

const RC_CENTER = 1500;
const RC_OFFSET = 300;
const RC_MIN = 1000;
const RC_MAX = 2000;
const RC_SEND_RATE = 50; // 20Hz

const TYPE_LABELS = {
  waypoint: 'WP',
  takeoff: 'TO',
  loiter_unlim: 'LT',
  loiter_turns: 'LN',
  loiter_time: 'LD',
  roi: 'ROI',
  land: 'LND',
};

export default function Controls({ sendMessage }) {
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const telemetry = useDroneStore((s) => s.telemetry);
  const keyboardEnabled = useDroneStore((s) => s.keyboardEnabled);
  const setKeyboardEnabled = useDroneStore((s) => s.setKeyboardEnabled);
  const setKeyPressed = useDroneStore((s) => s.setKeyPressed);
  const addAlert = useDroneStore((s) => s.addAlert);
  const droneMission = useDroneStore((s) => s.droneMission);
  const setDroneMission = useDroneStore((s) => s.setDroneMission);

  const rcIntervalRef = useRef(null);
  const isConnected = connectionStatus === 'connected';

  const apiCall = useCallback(
    async (endpoint, body = {}) => {
      try {
        const res = await fetch(`/api/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.status === 'error') {
          addAlert(data.error || `${endpoint} failed`, 'error');
        }
      } catch (err) {
        addAlert(`${endpoint} failed: ${err.message}`, 'error');
      }
    },
    [addAlert]
  );

  const handleDownload = useCallback(async () => {
    try {
      const res = await fetch('/api/mission/download');
      const data = await res.json();
      if (data.status === 'ok' && data.waypoints) {
        setDroneMission(data.waypoints);
        addAlert(`Downloaded ${data.waypoints.length} mission items`, 'success');
      } else {
        addAlert('No mission on drone', 'info');
      }
    } catch (err) {
      addAlert(`Download failed: ${err.message}`, 'error');
    }
  }, [setDroneMission, addAlert]);

  // Keyboard event handlers
  useEffect(() => {
    if (!keyboardEnabled) return;

    const TRACKED_KEYS = ['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (TRACKED_KEYS.includes(key)) {
        e.preventDefault();
        setKeyPressed(key === ' ' ? 'space' : key, true);
      }
    };

    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (TRACKED_KEYS.includes(key)) {
        e.preventDefault();
        setKeyPressed(key === ' ' ? 'space' : key, false);

        if (key === ' ') {
          if (telemetry.armed) {
            apiCall('disarm');
          } else {
            apiCall('arm');
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [keyboardEnabled, setKeyPressed, telemetry.armed, apiCall]);

  // RC override send loop at 20Hz
  useEffect(() => {
    if (!keyboardEnabled || !isConnected) {
      if (rcIntervalRef.current) {
        clearInterval(rcIntervalRef.current);
        rcIntervalRef.current = null;
      }
      return;
    }

    rcIntervalRef.current = setInterval(() => {
      const keys = useDroneStore.getState().keysPressed;

      let roll = RC_CENTER;
      let pitch = RC_CENTER;
      let throttle = RC_CENTER;
      let yaw = RC_CENTER;

      // WASD controls
      if (keys.a) yaw -= RC_OFFSET;
      if (keys.d) yaw += RC_OFFSET;
      if (keys.w) pitch -= RC_OFFSET;
      if (keys.s) pitch += RC_OFFSET;
      if (keys.r) throttle += RC_OFFSET;
      if (keys.f) throttle -= RC_OFFSET;
      if (keys.q) roll -= RC_OFFSET;
      if (keys.e) roll += RC_OFFSET;

      // Arrow keys: up/down = throttle, left/right = roll (strafe)
      if (keys.arrowup) throttle += RC_OFFSET;
      if (keys.arrowdown) throttle -= RC_OFFSET;
      if (keys.arrowleft) yaw -= RC_OFFSET;
      if (keys.arrowright) yaw += RC_OFFSET;

      roll = Math.max(RC_MIN, Math.min(RC_MAX, roll));
      pitch = Math.max(RC_MIN, Math.min(RC_MAX, pitch));
      throttle = Math.max(RC_MIN, Math.min(RC_MAX, throttle));
      yaw = Math.max(RC_MIN, Math.min(RC_MAX, yaw));

      sendMessage({
        type: 'rc_override',
        channels: [roll, pitch, throttle, yaw],
      });
    }, RC_SEND_RATE);

    return () => {
      if (rcIntervalRef.current) {
        clearInterval(rcIntervalRef.current);
        rcIntervalRef.current = null;
      }
    };
  }, [keyboardEnabled, isConnected, sendMessage]);

  if (!isConnected) {
    return (
      <div className="p-4">
        <div className="text-xs text-gray-600 italic text-center py-8">
          Connect to a vehicle to access controls
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 space-y-3">
      {/* Drone mission (read-only) */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center gap-1.5 mb-2">
          <MapPin size={11} className="text-gray-600" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Drone Mission</span>
          {droneMission.length > 0 && (
            <span className="text-[10px] text-gray-600 ml-1">({droneMission.length})</span>
          )}
          <button
            onClick={handleDownload}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 transition-all"
          >
            <Download size={9} /> Download
          </button>
        </div>
        {droneMission.length === 0 ? (
          <div className="text-[10px] text-gray-600 italic text-center py-2">
            No mission on drone
          </div>
        ) : (
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {droneMission.map((wp, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1 rounded bg-gray-800/50 text-[10px]">
                <span className="font-bold text-emerald-400 w-4 text-center">{i + 1}</span>
                <span className="text-gray-500 w-6">{TYPE_LABELS[wp.item_type] || 'WP'}</span>
                <span className="font-mono text-gray-400 flex-1 truncate">
                  {wp.lat.toFixed(5)}, {wp.lon.toFixed(5)}
                </span>
                <span className="text-gray-500">{wp.alt}m</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Keyboard control */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gamepad2 size={13} className="text-gray-500" />
            <span className="text-xs text-gray-400">Keyboard Control</span>
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

        {keyboardEnabled && (
          <div className="mt-3 p-2.5 bg-gray-900/60 rounded-md text-[10px] text-gray-500 font-mono border border-gray-700/30">
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <span>W/S - Pitch</span>
              <span>A/D - Yaw</span>
              <span>Q/E - Roll</span>
              <span>R/F - Throttle</span>
              <span className="col-span-2 border-t border-gray-800/50 pt-0.5 mt-0.5">Arrow keys:</span>
              <span>Up/Down - Throttle</span>
              <span>Left/Right - Yaw</span>
              <span className="col-span-2 border-t border-gray-800/50 pt-0.5 mt-0.5">Space - Arm/Disarm</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
