import React, { useCallback } from 'react';
import { Polyline, Marker, Popup, Circle, Polygon } from 'react-leaflet';
import L from 'leaflet';
import useDroneStore from '../store/droneStore';
import { EMPTY_ARRAY } from '../store/droneStore';
import { droneApi } from '../utils/api';
import { formatCoord } from '../utils/formatCoord';
import { TYPE_LABELS, createDroneMissionIcon } from './mapIcons';

// Drone mission markers with "Set as Current" in fly mode
export function DroneMissionMarkers() {
  const droneMission = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.droneMission ?? EMPTY_ARRAY : EMPTY_ARRAY);
  const activeTab = useDroneStore((s) => s.activeTab);
  const addAlert = useDroneStore((s) => s.addAlert);
  const missionSeq = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.mission_seq : -1) ?? -1;
  const autopilot = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.autopilot : 'unknown') || 'unknown';
  const coordFormat = useDroneStore((s) => s.coordFormat);

  const isFlying = activeTab === 'flying';
  const droneOpacity = isFlying ? 1 : 0.3;

  // Convert mission_seq to 0-based index
  // ArduPilot: seq 0 = home, mission items start at seq 1 -> index = seq - 1
  // PX4: seq 0 = first mission item -> index = seq
  const isArdupilot = autopilot === 'ardupilot';
  const currentWaypointIndex = missionSeq >= 0 ? (isArdupilot ? missionSeq - 1 : missionSeq) : -1;

  const droneNavPositions = droneMission
    .filter((w) => (w.item_type || 'waypoint') !== 'roi')
    .map((w) => [w.lat, w.lon]);

  const handleSetCurrent = useCallback(async (index) => {
    // Send 0-based index, backend will convert to correct seq based on autopilot type
    try {
      const res = await fetch(droneApi('/api/mission/set_current'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Failed to set current waypoint', 'error');
      } else {
        addAlert(`Current waypoint set to ${index + 1}`, 'success');
      }
    } catch (err) {
      addAlert('Set current failed: ' + err.message, 'error');
    }
  }, [addAlert]);

  return (
    <>
      {droneMission.map((wp, i) => (
        <Marker
          key={`dm-${i}`}
          position={[wp.lat, wp.lon]}
          icon={createDroneMissionIcon(i, wp.item_type || 'waypoint', i === currentWaypointIndex)}
          opacity={droneOpacity}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">Drone {TYPE_LABELS[wp.item_type] || 'Waypoint'} {i + 1}</div>
              <div>Alt: {wp.alt}m</div>
              <div className="text-xs opacity-70">{formatCoord(wp.lat, wp.lon, coordFormat, 6)}</div>
              {isFlying && (
                <button
                  onClick={() => handleSetCurrent(i)}
                  style={{
                    marginTop: '6px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: '#06b6d4',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  Set as Current
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}

      {droneNavPositions.length > 1 && (
        <Polyline
          positions={droneNavPositions}
          pathOptions={{ color: '#22c55e', weight: 2, opacity: 0.5 * droneOpacity, dashArray: '6 4' }}
        />
      )}
    </>
  );
}

// Drone fence downloaded from vehicle (read-only display)
export function DroneFenceDisplay() {
  const droneFence = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.droneFence ?? EMPTY_ARRAY : EMPTY_ARRAY);

  if (!droneFence || droneFence.length === 0) return null;

  // Separate circular and polygon fences
  // 5003 = MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION
  // 5001 = MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION
  const circularFences = droneFence.filter((f) => f.command === 5003);
  const polygonVertices = droneFence.filter((f) => f.command === 5001);

  const polygonPositions = polygonVertices.map((v) => [v.lat, v.lon]);

  return (
    <>
      {/* Circular fences */}
      {circularFences.map((fence, i) => (
        <Circle
          key={`drone-fence-circle-${i}`}
          center={[fence.lat, fence.lon]}
          radius={fence.param1} // param1 = radius
          pathOptions={{
            color: '#10b981', // emerald - different from planned (amber)
            weight: 2,
            opacity: 0.7,
            fillColor: '#10b981',
            fillOpacity: 0.08,
            dashArray: '8 4',
          }}
        />
      ))}

      {/* Polygon fence */}
      {polygonPositions.length >= 3 && (
        <Polygon
          positions={polygonPositions}
          pathOptions={{
            color: '#10b981',
            weight: 2,
            opacity: 0.7,
            fillColor: '#10b981',
            fillOpacity: 0.08,
            dashArray: '8 4',
          }}
        />
      )}
    </>
  );
}

// Pattern bounds polygon for lawnmower area selection
export function PatternBoundsPolygon() {
  const patternBounds = useDroneStore((s) => s.patternBounds);
  const patternDrawMode = useDroneStore((s) => s.patternDrawMode);
  const updatePatternBoundsVertex = useDroneStore((s) => s.updatePatternBoundsVertex);
  const removePatternBoundsVertex = useDroneStore((s) => s.removePatternBoundsVertex);

  const positions = patternBounds.map((v) => [v.lat, v.lon]);

  if (patternBounds.length === 0) return null;

  return (
    <>
      {positions.length >= 3 && (
        <Polygon
          positions={positions}
          pathOptions={{
            color: '#ec4899',
            weight: 2,
            opacity: 0.8,
            fillColor: '#ec4899',
            fillOpacity: 0.15,
            dashArray: '8 4',
          }}
        />
      )}
      {positions.length >= 2 && positions.length < 3 && (
        <Polyline
          positions={positions}
          pathOptions={{ color: '#ec4899', weight: 2, opacity: 0.8, dashArray: '8 4' }}
        />
      )}

      {patternDrawMode && patternBounds.map((v, i) => (
        <Marker
          key={v.id}
          position={[v.lat, v.lon]}
          icon={L.divIcon({
            className: 'pattern-vertex-marker',
            html: `<div style="
              width: 18px; height: 18px;
              background: #ec4899;
              border: 2px solid white;
              border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              font-size: 9px; font-weight: bold; color: white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">${i + 1}</div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          })}
          draggable={true}
          autoPan={false}
          eventHandlers={{
            dragend: (e) => {
              const pos = e.target.getLatLng();
              updatePatternBoundsVertex(v.id, { lat: pos.lat, lon: pos.lng });
            },
            contextmenu: (e) => {
              e.originalEvent.preventDefault();
              removePatternBoundsVertex(v.id);
            },
          }}
        />
      ))}
    </>
  );
}
