import { useEffect, useRef } from 'react';
import { useMap, Source, Layer } from '@vis.gl/react-maplibre';
import useDroneStore from '../store/droneStore';
import { INITIAL_TELEMETRY } from '../store/droneStore';
import { DRONE_COLORS } from './constants';
import { trailToCoords, emptyFC, feature, lineString } from './utils';

export default function DroneTrails({ droneColorMap }) {
  const drones = useDroneStore((s) => s.drones);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const droneVisibility = useDroneStore((s) => s.droneVisibility);

  // Build GeoJSON with all trails as separate features
  const geojson = {
    type: 'FeatureCollection',
    features: Object.entries(drones).flatMap(([droneId, drone]) => {
      const vis = droneVisibility[droneId] || { trail: true };
      if (!vis.trail || drone.trail.length < 2) return [];

      const cIdx = droneColorMap[droneId] ?? 0;
      const color = DRONE_COLORS[cIdx];
      const isActive = droneId === activeDroneId;
      const coords = trailToCoords(drone.trail);

      return [feature(lineString(coords), { color, opacity: isActive ? 0.6 : 0.4 })];
    }),
  };

  return (
    <Source id="drone-trails" type="geojson" data={geojson}>
      <Layer
        id="drone-trails-line"
        type="line"
        paint={{
          'line-color': ['get', 'color'],
          'line-width': 2,
          'line-opacity': ['get', 'opacity'],
        }}
      />
    </Source>
  );
}
