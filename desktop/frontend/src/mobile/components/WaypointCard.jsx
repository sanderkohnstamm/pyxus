import React, { useRef, useCallback, useState } from 'react';
import { MapPin, ArrowUp, ArrowDown, Circle, RotateCw, Clock, Crosshair, Repeat, Grip, X } from 'lucide-react';
import useDroneStore from '../../store/droneStore';
import { formatCoord } from '../../utils/formatCoord';

const ITEM_TYPES = {
  waypoint: { label: 'WP', icon: MapPin, color: 'text-sky-400 bg-sky-500/10 border-sky-500/25' },
  takeoff: { label: 'TKO', icon: ArrowUp, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' },
  loiter_unlim: { label: 'LOI', icon: Circle, color: 'text-violet-400 bg-violet-500/10 border-violet-500/25' },
  loiter_turns: { label: 'LTR', icon: RotateCw, color: 'text-violet-400 bg-violet-500/10 border-violet-500/25' },
  loiter_time: { label: 'LTM', icon: Clock, color: 'text-violet-400 bg-violet-500/10 border-violet-500/25' },
  roi: { label: 'ROI', icon: Crosshair, color: 'text-amber-400 bg-amber-500/10 border-amber-500/25' },
  land: { label: 'LND', icon: ArrowDown, color: 'text-orange-400 bg-orange-500/10 border-orange-500/25' },
  do_jump: { label: 'JMP', icon: Repeat, color: 'text-pink-400 bg-pink-500/10 border-pink-500/25' },
  do_set_servo: { label: 'SRV', icon: Grip, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25' },
};

const SWIPE_THRESHOLD = -80;

export default function WaypointCard({ wp, index, onUpdate, onRemove }) {
  const coordFormat = useDroneStore((s) => s.coordFormat);
  const selectedWaypointId = useDroneStore((s) => s.selectedWaypointId);
  const setSelectedWaypointId = useDroneStore((s) => s.setSelectedWaypointId);

  const itemType = ITEM_TYPES[wp.type] || ITEM_TYPES.waypoint;
  const Icon = itemType.icon;
  const isSelected = selectedWaypointId === wp.id;

  // Swipe-to-delete state
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const touchStart = useRef({ x: 0, y: 0 });
  const cardRef = useRef(null);

  const onTouchStart = useCallback((e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setSwiping(false);
  }, []);

  const onTouchMove = useCallback((e) => {
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;
    // Only swipe horizontally if mostly horizontal movement
    if (!swiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      setSwiping(true);
    }
    if (swiping || Math.abs(dx) > 10) {
      setOffsetX(Math.min(0, dx)); // Only allow left swipe
    }
  }, [swiping]);

  const onTouchEnd = useCallback(() => {
    if (offsetX < SWIPE_THRESHOLD) {
      onRemove(wp.id);
    } else {
      setOffsetX(0);
    }
    setSwiping(false);
  }, [offsetX, onRemove, wp.id]);

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Delete background */}
      <div className="absolute inset-0 flex items-center justify-end px-4 bg-red-600/80 rounded-xl">
        <X size={18} className="text-white" />
      </div>

      {/* Card content */}
      <div
        ref={cardRef}
        className={`relative flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors ${itemType.color} ${
          isSelected ? 'ring-1 ring-cyan-400/50' : ''
        }`}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? 'none' : 'transform 0.2s ease-out',
          backgroundColor: 'rgb(var(--gray-950))',
        }}
        onClick={() => setSelectedWaypointId(isSelected ? null : wp.id)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Type badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Icon size={14} />
          <span className="text-[11px] font-bold">{index + 1}</span>
        </div>

        {/* Coordinates */}
        <span className="text-[11px] font-mono opacity-70 truncate flex-1">
          {wp.type === 'do_jump' ? `→ Item ${wp.param1 || 1}` :
           wp.type === 'do_set_servo' ? `Servo ${wp.param1}: ${wp.param2}µs` :
           formatCoord(wp.lat, wp.lon, coordFormat, 4)}
        </span>

        {/* Altitude */}
        <span className="text-[11px] font-mono opacity-60 shrink-0">
          {wp.alt}m
        </span>
      </div>

      {/* Expanded edit (when selected) */}
      {isSelected && (
        <div className="px-3 py-3 space-y-3 border-x border-b rounded-b-xl" style={{ borderColor: 'rgb(var(--gray-800) / 0.3)' }}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400">Altitude</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={wp.alt}
                onChange={(e) => onUpdate(wp.id, { alt: parseFloat(e.target.value) || 0 })}
                className="w-20 bg-gray-900/50 border border-gray-700/30 rounded-lg px-2 py-1.5 text-[12px] text-right font-mono focus:outline-none focus:border-gray-600/50"
                min={1} max={500} step={5}
              />
              <span className="text-[11px] text-gray-500">m</span>
            </div>
          </div>
          {wp.type === 'waypoint' && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Hold time</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={wp.param1}
                  onChange={(e) => onUpdate(wp.id, { param1: parseFloat(e.target.value) || 0 })}
                  className="w-20 bg-gray-900/50 border border-gray-700/30 rounded-lg px-2 py-1.5 text-[12px] text-right font-mono focus:outline-none focus:border-gray-600/50"
                  min={0} max={3600} step={1}
                />
                <span className="text-[11px] text-gray-500">s</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
