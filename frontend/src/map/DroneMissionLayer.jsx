import React, { useMemo, useCallback } from 'react';
import { Source, Layer, Marker, Popup } from '@vis.gl/react-maplibre';
import useDroneStore from '../store/droneStore';
import { EMPTY_ARRAY } from '../store/droneStore';
import { MARKER_COLORS, TYPE_LABELS, DRONE_COLORS } from './constants';
import { emptyFC, feature, lineString } from './utils';
import { formatCoord } from '../utils/formatCoord';
import { droneApi } from '../utils/api';

export default function DroneMissionLayer() {
  const droneMission = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.droneMission ?? EMPTY_ARRAY : EMPTY_ARRAY);
  const activeTab = useDroneStore((s) => s.activeTab);
  const addAlert = useDroneStore((s) => s.addAlert);
  const missionSeq = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.mission_seq : -1) ?? -1;
  const autopilot = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.autopilot : 'unknown') || 'unknown';
  const coordFormat = useDroneStore((s) => s.coordFormat);
  const drones = useDroneStore((s) => s.drones);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const droneVisibility = useDroneStore((s) => s.droneVisibility);

  const isFlying = activeTab === 'flying';
  const droneOpacity = isFlying ? 1 : 0.3;

  const isArdupilot = autopilot === 'ardupilot';
  const currentWaypointIndex = missionSeq >= 0 ? (isArdupilot ? missionSeq - 1 : missionSeq) : -1;

  // Active drone mission connection line (with altitude)
  const missionLineGeoJSON = useMemo(() => {
    const navWps = droneMission.filter((w) => (w.item_type || 'waypoint') !== 'roi');
    if (navWps.length < 2) return emptyFC();
    const coords = navWps.map((w) => [w.lon, w.lat, w.alt || 0]);
    return { type: 'FeatureCollection', features: [feature(lineString(coords), {})] };
  }, [droneMission]);

  // Non-active drone mission lines
  const nonActiveMissionGeoJSON = useMemo(() => {
    const features = [];
    for (const [droneId, drone] of Object.entries(drones)) {
      if (droneId === activeDroneId) continue;
      const vis = droneVisibility[droneId] || { mission: true };
      if (!vis.mission || !drone.droneMission?.length || drone.droneMission.length < 2) continue;

      const droneIds = Object.keys(drones);
      const cIdx = droneIds.indexOf(droneId) % DRONE_COLORS.length;
      const color = DRONE_COLORS[cIdx];

      const navWps = drone.droneMission.filter((w) => (w.item_type || 'waypoint') !== 'roi');
      if (navWps.length < 2) continue;
      const coords = navWps.map((w) => [w.lon, w.lat]);
      features.push(feature(lineString(coords), { color }));
    }
    return { type: 'FeatureCollection', features };
  }, [drones, activeDroneId, droneVisibility]);

  const handleSetCurrent = useCallback(async (index) => {
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
      {/* Mission altitude poles managed imperatively via useEffect above */}

      {/* Active drone mission line */}
      <Source id="drone-mission-line" type="geojson" data={missionLineGeoJSON}>
        <Layer
          id="drone-mission-line-layer"
          type="line"
          paint={{
            'line-color': '#22c55e',
            'line-width': 2,
            'line-opacity': 0.5 * droneOpacity,
            'line-dasharray': [1.5, 1],
          }}
        />
      </Source>

      {/* Non-active drone mission lines */}
      <Source id="non-active-missions" type="geojson" data={nonActiveMissionGeoJSON}>
        <Layer
          id="non-active-missions-line"
          type="line"
          paint={{
            'line-color': ['get', 'color'],
            'line-width': 2,
            'line-opacity': 0.35,
            'line-dasharray': [1.5, 1],
          }}
        />
      </Source>

      {/* Active drone mission waypoint markers */}
      {droneMission.map((wp, i) => {
        const config = MARKER_COLORS[wp.item_type] || MARKER_COLORS.waypoint;
        const isCurrent = i === currentWaypointIndex;

        return (
          <Marker
            key={`dm-${i}`}
            longitude={wp.lon}
            latitude={wp.lat}
            anchor="center"
            style={{ opacity: droneOpacity }}
          >
            <div
              className={`drone-mission-marker ${isCurrent ? 'drone-mission-active' : ''}`}
              style={{
                backgroundColor: config.bg,
                borderColor: isCurrent ? '#fff' : config.border,
                boxShadow: isCurrent ? `0 0 10px ${config.bg}, 0 0 20px ${config.bg}88` : undefined,
                width: isCurrent ? 26 : 22,
                height: isCurrent ? 26 : 22,
                borderWidth: isCurrent ? 3 : 2,
              }}
            >
              {i + 1}
            </div>
          </Marker>
        );
      })}
    </>
  );
}
