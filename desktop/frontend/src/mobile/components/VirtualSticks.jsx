import React, { useRef, useCallback, useEffect, useState } from 'react';
import useDroneStore from '../../store/droneStore';

const STICK_SIZE = 120;     // Diameter in px
const KNOB_SIZE = 48;       // Knob diameter
const MAX_DEFLECTION = (STICK_SIZE - KNOB_SIZE) / 2;
const RC_CENTER = 1500;
const RC_RANGE = 500;
const RC_SEND_HZ = 20;
const INSET = 24;           // Distance from screen edge

/**
 * On-screen dual thumb sticks for manual RC control.
 * Left: Throttle (Y) + Yaw (X)
 * Right: Pitch (Y) + Roll (X)
 * Sends rc_override at 20Hz via the provided sendMessage callback.
 */
export default function VirtualSticks({ sendMessage }) {
  const updateManualControlRc = useDroneStore((s) => s.updateManualControlRc);

  // Track each stick's deflection: { x: -1..1, y: -1..1 }
  const leftStick = useRef({ x: 0, y: 0 });
  const rightStick = useRef({ x: 0, y: 0 });
  const [leftPos, setLeftPos] = useState({ x: 0, y: 0 });
  const [rightPos, setRightPos] = useState({ x: 0, y: 0 });
  const leftTouchId = useRef(null);
  const rightTouchId = useRef(null);
  const intervalRef = useRef(null);

  // Send RC override at fixed rate
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const l = leftStick.current;
      const r = rightStick.current;

      // Map sticks to RC channels:
      // Ch1=Roll (right X), Ch2=Pitch (right Y), Ch3=Throttle (left Y), Ch4=Yaw (left X)
      const channels = [
        Math.round(RC_CENTER + r.x * RC_RANGE),  // Roll
        Math.round(RC_CENTER - r.y * RC_RANGE),   // Pitch (inverted: push up = nose down)
        Math.round(RC_CENTER + l.y * RC_RANGE),   // Throttle (up = more)
        Math.round(RC_CENTER + l.x * RC_RANGE),   // Yaw
      ];

      if (sendMessage) {
        sendMessage({ type: 'rc_override', channels });
      }
      updateManualControlRc(channels);
    }, 1000 / RC_SEND_HZ);

    return () => clearInterval(intervalRef.current);
  }, [sendMessage, updateManualControlRc]);

  const handleTouchStart = useCallback((side, e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (side === 'left') {
      leftTouchId.current = touch.identifier;
      const dx = clamp((touch.clientX - centerX) / MAX_DEFLECTION, -1, 1);
      const dy = clamp(-(touch.clientY - centerY) / MAX_DEFLECTION, -1, 1);
      leftStick.current = { x: dx, y: dy };
      setLeftPos({ x: dx * MAX_DEFLECTION, y: -dy * MAX_DEFLECTION });
    } else {
      rightTouchId.current = touch.identifier;
      const dx = clamp((touch.clientX - centerX) / MAX_DEFLECTION, -1, 1);
      const dy = clamp(-(touch.clientY - centerY) / MAX_DEFLECTION, -1, 1);
      rightStick.current = { x: dx, y: dy };
      setRightPos({ x: dx * MAX_DEFLECTION, y: -dy * MAX_DEFLECTION });
    }
  }, []);

  const handleTouchMove = useCallback((side, e) => {
    e.preventDefault();
    const touchId = side === 'left' ? leftTouchId.current : rightTouchId.current;
    const touch = Array.from(e.changedTouches).find(t => t.identifier === touchId);
    if (!touch) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clamp((touch.clientX - centerX) / MAX_DEFLECTION, -1, 1);
    const dy = clamp(-(touch.clientY - centerY) / MAX_DEFLECTION, -1, 1);

    if (side === 'left') {
      leftStick.current = { x: dx, y: dy };
      setLeftPos({ x: dx * MAX_DEFLECTION, y: -dy * MAX_DEFLECTION });
    } else {
      rightStick.current = { x: dx, y: dy };
      setRightPos({ x: dx * MAX_DEFLECTION, y: -dy * MAX_DEFLECTION });
    }
  }, []);

  const handleTouchEnd = useCallback((side) => {
    if (side === 'left') {
      leftTouchId.current = null;
      leftStick.current = { x: 0, y: 0 };
      setLeftPos({ x: 0, y: 0 });
    } else {
      rightTouchId.current = null;
      rightStick.current = { x: 0, y: 0 };
      setRightPos({ x: 0, y: 0 });
    }
  }, []);

  const stickBase = `absolute rounded-full border-2 border-gray-500/30 bg-gray-900/40 backdrop-blur-sm`;
  const knobStyle = (pos) => ({
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    transform: `translate(${pos.x}px, ${pos.y}px)`,
    transition: pos.x === 0 && pos.y === 0 ? 'transform 0.15s ease-out' : 'none',
  });

  return (
    <>
      {/* Left stick: Throttle + Yaw */}
      <div
        className={stickBase}
        style={{
          width: STICK_SIZE, height: STICK_SIZE,
          left: INSET, bottom: `calc(env(safe-area-inset-bottom) + ${INSET}px)`,
        }}
        onTouchStart={(e) => handleTouchStart('left', e)}
        onTouchMove={(e) => handleTouchMove('left', e)}
        onTouchEnd={() => handleTouchEnd('left')}
        onTouchCancel={() => handleTouchEnd('left')}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="rounded-full bg-gray-400/40 border border-gray-400/30"
            style={knobStyle(leftPos)}
          />
        </div>
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-gray-500 font-medium">
          THR / YAW
        </span>
      </div>

      {/* Right stick: Pitch + Roll */}
      <div
        className={stickBase}
        style={{
          width: STICK_SIZE, height: STICK_SIZE,
          right: INSET, bottom: `calc(env(safe-area-inset-bottom) + ${INSET}px)`,
        }}
        onTouchStart={(e) => handleTouchStart('right', e)}
        onTouchMove={(e) => handleTouchMove('right', e)}
        onTouchEnd={() => handleTouchEnd('right')}
        onTouchCancel={() => handleTouchEnd('right')}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="rounded-full bg-gray-400/40 border border-gray-400/30"
            style={knobStyle(rightPos)}
          />
        </div>
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-gray-500 font-medium">
          PITCH / ROLL
        </span>
      </div>
    </>
  );
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
