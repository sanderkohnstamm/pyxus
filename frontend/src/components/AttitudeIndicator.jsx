import React, { useMemo } from 'react';
import { Home } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import { INITIAL_TELEMETRY } from '../store/droneStore';

// Calculate bearing from point A to point B
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

function HorizonIndicator({ roll, pitch }) {
  // Clamp pitch for display (-90 to 90 degrees)
  const pitchClamped = Math.max(-45, Math.min(45, pitch));
  const pitchOffset = pitchClamped * 2; // 2px per degree

  return (
    <div className="relative w-full h-32 rounded-lg overflow-hidden border border-gray-700/50 bg-gray-900">
      {/* Sky and ground with roll/pitch transform */}
      <div
        className="absolute inset-0 origin-center"
        style={{
          transform: `rotate(${-roll}deg) translateY(${pitchOffset}px)`,
        }}
      >
        {/* Sky */}
        <div
          className="absolute w-[200%] h-[200%] left-[-50%] top-[-100%]"
          style={{
            background: 'linear-gradient(to bottom, #1e3a5f 0%, #3b82f6 50%, #60a5fa 100%)'
          }}
        />
        {/* Ground */}
        <div
          className="absolute w-[200%] h-[200%] left-[-50%] top-[50%]"
          style={{
            background: 'linear-gradient(to bottom, #92400e 0%, #78350f 50%, #451a03 100%)'
          }}
        />
        {/* Horizon line */}
        <div className="absolute w-[200%] left-[-50%] top-[50%] h-[2px] bg-white/80" style={{ transform: 'translateY(-1px)' }} />

        {/* Pitch ladder */}
        {[-30, -20, -10, 10, 20, 30].map(deg => (
          <div
            key={deg}
            className="absolute left-1/2 w-12 flex items-center justify-center"
            style={{
              top: `${50 - deg * 2}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <div className={`w-8 h-[1px] ${deg > 0 ? 'bg-cyan-400/60' : 'bg-amber-400/60'}`} />
            <span className="absolute -right-6 text-[8px] text-white/50">{deg > 0 ? '+' : ''}{deg}</span>
          </div>
        ))}
      </div>

      {/* Fixed aircraft symbol */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {/* Center dot */}
        <div className="w-2 h-2 rounded-full bg-yellow-400 border border-yellow-600" />
        {/* Wings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="absolute w-10 h-[3px] bg-yellow-400 -left-12 -top-[1px]" />
          <div className="absolute w-10 h-[3px] bg-yellow-400 left-2 -top-[1px]" />
          {/* Tail */}
          <div className="absolute w-[3px] h-4 bg-yellow-400 -left-[1px] top-1" />
        </div>
      </div>

      {/* Roll indicator arc at top */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2">
        <svg width="80" height="24" viewBox="0 0 80 24" className="opacity-60">
          {/* Arc */}
          <path
            d="M 10 20 A 35 35 0 0 1 70 20"
            fill="none"
            stroke="white"
            strokeWidth="1"
          />
          {/* Tick marks */}
          {[-60, -45, -30, -15, 0, 15, 30, 45, 60].map(deg => {
            const rad = (deg - 90) * Math.PI / 180;
            const r1 = 35;
            const r2 = deg % 30 === 0 ? 30 : 32;
            const x1 = 40 + r1 * Math.cos(rad);
            const y1 = 55 + r1 * Math.sin(rad);
            const x2 = 40 + r2 * Math.cos(rad);
            const y2 = 55 + r2 * Math.sin(rad);
            return (
              <line
                key={deg}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="white"
                strokeWidth={deg === 0 ? 2 : 1}
              />
            );
          })}
        </svg>
        {/* Roll pointer */}
        <div
          className="absolute top-[18px] left-1/2 origin-[0_37px]"
          style={{ transform: `translateX(-50%) rotate(${roll}deg)` }}
        >
          <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[8px] border-l-transparent border-r-transparent border-b-yellow-400" />
        </div>
      </div>

      {/* Values */}
      <div className="absolute bottom-1 left-2 text-[9px] font-mono text-white/70">
        R: {roll.toFixed(1)}°
      </div>
      <div className="absolute bottom-1 right-2 text-[9px] font-mono text-white/70">
        P: {pitch.toFixed(1)}°
      </div>
    </div>
  );
}

function CompassIndicator({ heading, homeBearing }) {
  const cardinals = [
    { deg: 0, label: 'N' },
    { deg: 45, label: 'NE' },
    { deg: 90, label: 'E' },
    { deg: 135, label: 'SE' },
    { deg: 180, label: 'S' },
    { deg: 225, label: 'SW' },
    { deg: 270, label: 'W' },
    { deg: 315, label: 'NW' },
  ];

  return (
    <div className="relative w-full h-32 rounded-lg overflow-hidden border border-gray-700/50 bg-gray-900">
      {/* Rotating compass rose */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ transform: `rotate(${-heading}deg)` }}
      >
        {/* Compass circle */}
        <div className="relative w-28 h-28">
          {/* Outer ring */}
          <div className="absolute inset-0 rounded-full border-2 border-gray-600" />

          {/* Tick marks */}
          {Array.from({ length: 36 }).map((_, i) => {
            const deg = i * 10;
            const isMajor = deg % 30 === 0;
            return (
              <div
                key={i}
                className="absolute top-0 left-1/2 origin-bottom"
                style={{
                  height: '50%',
                  transform: `translateX(-50%) rotate(${deg}deg)`,
                }}
              >
                <div
                  className={`w-[1px] ${isMajor ? 'h-3 bg-gray-400' : 'h-1.5 bg-gray-600'}`}
                />
              </div>
            );
          })}

          {/* Cardinal labels */}
          {cardinals.map(({ deg, label }) => (
            <div
              key={label}
              className="absolute top-1/2 left-1/2 origin-center"
              style={{
                transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-40px) rotate(${-deg + heading}deg)`,
              }}
            >
              <span className={`text-[10px] font-bold ${label === 'N' ? 'text-red-400' : 'text-gray-300'}`}>
                {label}
              </span>
            </div>
          ))}

          {/* North pointer on ring */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1"
            style={{ transform: `translateX(-50%) rotate(0deg)` }}
          >
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-red-500" />
          </div>

          {/* Home direction indicator */}
          {homeBearing !== null && (
            <div
              className="absolute top-1/2 left-1/2"
              style={{
                transform: `translate(-50%, -50%) rotate(${homeBearing}deg)`,
              }}
            >
              <div className="absolute -top-[52px] left-1/2 -translate-x-1/2">
                <Home size={14} className="text-emerald-400" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fixed heading pointer at top */}
      <div className="absolute top-1 left-1/2 -translate-x-1/2">
        <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[10px] border-l-transparent border-r-transparent border-t-cyan-400" />
      </div>

      {/* Heading readout */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-gray-800/80 px-2 py-0.5 rounded">
        <span className="text-sm font-mono font-bold text-white">{Math.round(heading)}°</span>
      </div>

      {/* Home bearing text */}
      {homeBearing !== null && (
        <div className="absolute bottom-1 right-2 flex items-center gap-1 text-[9px] text-emerald-400">
          <Home size={9} />
          <span className="font-mono">{Math.round(homeBearing)}°</span>
        </div>
      )}
    </div>
  );
}

export default function AttitudeIndicator() {
  const telemetry = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : INITIAL_TELEMETRY) || INITIAL_TELEMETRY;
  const homePosition = useDroneStore((s) => s.homePosition);

  const { roll, pitch, heading, lat, lon } = telemetry;

  // Calculate bearing to home
  const homeBearing = useMemo(() => {
    if (!homePosition || homePosition.lat === 0 || homePosition.lon === 0) return null;
    if (lat === 0 && lon === 0) return null;
    return calculateBearing(lat, lon, homePosition.lat, homePosition.lon);
  }, [lat, lon, homePosition]);

  // Convert roll from radians if needed (check typical values)
  const rollDeg = Math.abs(roll) > Math.PI ? roll : roll * 180 / Math.PI;
  const pitchDeg = Math.abs(pitch) > Math.PI ? pitch : pitch * 180 / Math.PI;
  const headingDeg = heading || 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-2 h-2 rounded-full bg-cyan-500" />
        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Attitude</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[9px] text-gray-500 mb-1 text-center">Horizon</div>
          <HorizonIndicator roll={rollDeg} pitch={pitchDeg} />
        </div>
        <div>
          <div className="text-[9px] text-gray-500 mb-1 text-center">Compass</div>
          <CompassIndicator heading={headingDeg} homeBearing={homeBearing} />
        </div>
      </div>
    </div>
  );
}
