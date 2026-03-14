import React, { useEffect, useMemo, useState } from 'react';
import { Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import useDroneStore from '../store/droneStore';
import { Move, RotateCw, Maximize2, ArrowLeftRight, Grid3X3 } from 'lucide-react';
import { centroid, transformMission } from '../utils/geo';
import { generateArc, NAV_TYPES } from './mapIcons';

// Mission context menu component
export function MissionContextMenu({ position, onClose, onAction }) {
  if (!position) return null;

  const menuItems = [
    { label: 'Move Mission', icon: Move, action: 'translate' },
    { label: 'Rotate Mission', icon: RotateCw, action: 'rotate' },
    { label: 'Scale Mission', icon: Maximize2, action: 'scale' },
    { label: 'Reverse Order', icon: ArrowLeftRight, action: 'reverse' },
    { label: 'Generate Pattern...', icon: Grid3X3, action: 'pattern' },
  ];

  return (
    <div
      className="fixed z-[2000] bg-gray-900 border border-gray-700/50 rounded-lg shadow-xl py-1 min-w-[160px]"
      style={{ left: position.x, top: position.y }}
    >
      {menuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.action}
            onClick={() => {
              onAction(item.action);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <Icon size={12} className="text-gray-500" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// Mission manipulation overlay
export function ManipulationOverlay({ mode, onComplete, onCancel }) {
  const map = useMap();
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const setPlannedWaypoints = useDroneStore((s) => s.setPlannedWaypoints);
  const [startPos, setStartPos] = useState(null);
  const [previewWaypoints, setPreviewWaypoints] = useState([]);
  const [manipValue, setManipValue] = useState(null);

  // Calculate mission center
  const missionCenter = useMemo(() => {
    if (plannedWaypoints.length === 0) return null;
    return centroid(plannedWaypoints.map(w => ({ lat: w.lat, lon: w.lon })));
  }, [plannedWaypoints]);

  useEffect(() => {
    if (!mode || !missionCenter) return;

    const container = map.getContainer();

    if (mode === 'translate') {
      container.style.cursor = 'move';
    } else if (mode === 'rotate') {
      container.style.cursor = 'crosshair';
    } else if (mode === 'scale') {
      container.style.cursor = 'nwse-resize';
    }

    const handleMouseDown = (e) => {
      const latlng = map.mouseEventToLatLng(e);
      setStartPos(latlng);
    };

    const handleMouseMove = (e) => {
      if (!startPos) return;

      const currentPos = map.mouseEventToLatLng(e);

      if (mode === 'translate') {
        const deltaLat = currentPos.lat - startPos.lat;
        const deltaLon = currentPos.lng - startPos.lng;
        const transformed = transformMission(plannedWaypoints, 'translate', { deltaLat, deltaLon });
        setPreviewWaypoints(transformed);
        setManipValue(`${(deltaLat * 111000).toFixed(0)}m, ${(deltaLon * 111000 * Math.cos(missionCenter.lat * Math.PI / 180)).toFixed(0)}m`);
      } else if (mode === 'rotate') {
        // Calculate angle from center to current position
        const dx = currentPos.lng - missionCenter.lon;
        const dy = currentPos.lat - missionCenter.lat;
        const currentAngle = Math.atan2(dx, dy) * 180 / Math.PI;

        const startDx = startPos.lng - missionCenter.lon;
        const startDy = startPos.lat - missionCenter.lat;
        const startAngle = Math.atan2(startDx, startDy) * 180 / Math.PI;

        const angle = currentAngle - startAngle;
        const transformed = transformMission(plannedWaypoints, 'rotate', { angle });
        setPreviewWaypoints(transformed);
        setManipValue(`${angle.toFixed(1)}\u00b0`);
      } else if (mode === 'scale') {
        // Calculate scale factor based on distance from center
        const startDist = Math.sqrt(
          Math.pow(startPos.lat - missionCenter.lat, 2) +
          Math.pow(startPos.lng - missionCenter.lon, 2)
        );
        const currentDist = Math.sqrt(
          Math.pow(currentPos.lat - missionCenter.lat, 2) +
          Math.pow(currentPos.lng - missionCenter.lon, 2)
        );
        const factor = startDist > 0.00001 ? currentDist / startDist : 1;
        const transformed = transformMission(plannedWaypoints, 'scale', { factor });
        setPreviewWaypoints(transformed);
        setManipValue(`${(factor * 100).toFixed(0)}%`);
      }
    };

    const handleMouseUp = () => {
      if (previewWaypoints.length > 0) {
        setPlannedWaypoints(previewWaypoints);
      }
      setStartPos(null);
      setPreviewWaypoints([]);
      setManipValue(null);
      onComplete();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setStartPos(null);
        setPreviewWaypoints([]);
        setManipValue(null);
        onCancel();
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      container.style.cursor = '';
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode, map, startPos, plannedWaypoints, missionCenter, previewWaypoints, setPlannedWaypoints, onComplete, onCancel]);

  if (!mode) return null;

  const previewPositions = previewWaypoints
    .filter(w => w.type !== 'roi')
    .map(w => [w.lat, w.lon]);

  return (
    <>
      {/* Preview polyline */}
      {previewPositions.length > 1 && (
        <Polyline
          positions={previewPositions}
          pathOptions={{ color: '#f59e0b', weight: 2, opacity: 0.8, dashArray: '4 4' }}
        />
      )}

      {/* Mode indicator */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900/90 border border-gray-500/30 rounded-lg px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-300 font-medium">
            {mode === 'translate' && 'Move Mode'}
            {mode === 'rotate' && 'Rotate Mode'}
            {mode === 'scale' && 'Scale Mode'}
          </span>
          {manipValue && (
            <span className="text-gray-400 font-mono">{manipValue}</span>
          )}
          <span className="text-gray-500 text-xs ml-2">Click and drag | Esc to cancel</span>
        </div>
      </div>
    </>
  );
}

// Jump arrow visualization for do_jump waypoints
export function JumpArrows({ waypoints, opacity = 1 }) {
  const connections = useMemo(() => {
    const result = [];
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (wp.type !== 'do_jump') continue;
      const targetIdx = (wp.param1 || wp.jumpTarget || 1) - 1; // 0-based
      // Find last positioned wp before this jump
      let sourceIdx = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (NAV_TYPES.has(waypoints[j].type) || (waypoints[j].lat && waypoints[j].lon)) {
          sourceIdx = j;
          break;
        }
      }
      if (sourceIdx >= 0 && targetIdx >= 0 && targetIdx < waypoints.length) {
        const target = waypoints[targetIdx];
        const source = waypoints[sourceIdx];
        if (source.lat && source.lon && target.lat && target.lon) {
          result.push({
            source: [source.lat, source.lon],
            target: [target.lat, target.lon],
            repeat: wp.param2 ?? wp.repeat ?? -1,
            key: `jump-${i}`,
          });
        }
      }
    }
    return result;
  }, [waypoints]);

  if (connections.length === 0) return null;

  return (
    <>
      {connections.map(conn => {
        const arcPts = generateArc(conn.source, conn.target);
        const mid = arcPts[Math.floor(arcPts.length / 2)];
        const repeatStr = conn.repeat === -1 ? '\u221E' : conn.repeat;
        const labelIcon = L.divIcon({
          html: `<div style="display:inline-block;white-space:nowrap;background:rgba(236,72,153,0.85);color:white;padding:2px 6px;border-radius:10px;font-size:9px;font-weight:700;font-family:monospace;border:1px solid rgba(236,72,153,0.5);box-shadow:0 2px 6px rgba(0,0,0,0.3)">Jump \u00d7${repeatStr}</div>`,
          className: '',
          iconSize: [0, 0],
          iconAnchor: [0, 8],
        });
        return (
          <React.Fragment key={conn.key}>
            <Polyline
              positions={arcPts}
              pathOptions={{ color: '#ec4899', weight: 2.5, opacity: 0.8 * opacity, dashArray: '6 4' }}
            />
            <Marker position={mid} icon={labelIcon} interactive={false} />
          </React.Fragment>
        );
      })}
    </>
  );
}
