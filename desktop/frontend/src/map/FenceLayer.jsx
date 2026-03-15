import React, { useMemo } from 'react';
import { Source, Layer, Marker, Popup } from '@vis.gl/react-maplibre';
import useDroneStore from '../store/droneStore';
import { EMPTY_ARRAY } from '../store/droneStore';
import { DRONE_COLORS } from './constants';
import { circleToPolygon, emptyFC, feature, polygon, lineString } from './utils';
import { formatCoord } from '../utils/formatCoord';

export default function FenceLayer() {
  const plannedFence = useDroneStore((s) => s.plannedFence);
  const activeTab = useDroneStore((s) => s.activeTab);
  const planSubTab = useDroneStore((s) => s.planSubTab);
  const updateFenceVertex = useDroneStore((s) => s.updateFenceVertex);
  const coordFormat = useDroneStore((s) => s.coordFormat);
  const geofence = useDroneStore((s) => s.geofence);
  const droneFence = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.droneFence ?? EMPTY_ARRAY : EMPTY_ARRAY);
  const gcsPosition = useDroneStore((s) => s.gcsPosition);
  const drones = useDroneStore((s) => s.drones);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const droneVisibility = useDroneStore((s) => s.droneVisibility);

  const isPlanning = activeTab === 'plan';
  const plannedOpacity = isPlanning ? 1 : 0.3;

  // Planned fence polygon GeoJSON
  const plannedFenceGeoJSON = useMemo(() => {
    if (plannedFence.length < 3) return emptyFC();
    const coords = plannedFence.map((v) => [v.lon, v.lat]);
    const ring = [...coords, coords[0]];
    return {
      type: 'FeatureCollection',
      features: [feature(polygon(ring), {})],
    };
  }, [plannedFence]);

  // Geofence circle GeoJSON
  const geofenceGeoJSON = useMemo(() => {
    if (!geofence.enabled || geofence.lat === 0 || geofence.lon === 0) return emptyFC();
    const ring = circleToPolygon(geofence.lon, geofence.lat, geofence.radius);
    return {
      type: 'FeatureCollection',
      features: [feature(polygon(ring), {})],
    };
  }, [geofence]);

  // Drone fence GeoJSON (active drone)
  const droneFenceGeoJSON = useMemo(() => {
    if (!droneFence || droneFence.length === 0) return emptyFC();

    const features = [];
    const circularFences = droneFence.filter((f) => f.command === 5003);
    const polygonVertices = droneFence.filter((f) => f.command === 5001);

    for (const fence of circularFences) {
      const ring = circleToPolygon(fence.lon, fence.lat, fence.param1);
      features.push(feature(polygon(ring), { color: '#10b981' }));
    }

    if (polygonVertices.length >= 3) {
      const coords = polygonVertices.map((v) => [v.lon, v.lat]);
      const ring = [...coords, coords[0]];
      features.push(feature(polygon(ring), { color: '#10b981' }));
    }

    return { type: 'FeatureCollection', features };
  }, [droneFence]);

  // Non-active drone fences
  const nonActiveFenceGeoJSON = useMemo(() => {
    const features = [];
    for (const [droneId, drone] of Object.entries(drones)) {
      if (droneId === activeDroneId) continue;
      const vis = droneVisibility[droneId] || { fence: true };
      if (!vis.fence || !drone.droneFence?.length) continue;

      const cIdx = Object.keys(drones).indexOf(droneId) % DRONE_COLORS.length;
      const color = DRONE_COLORS[cIdx];

      const circles = drone.droneFence.filter((f) => f.command === 5003);
      const polys = drone.droneFence.filter((f) => f.command === 5001);

      for (const fence of circles) {
        const ring = circleToPolygon(fence.lon, fence.lat, fence.param1);
        features.push(feature(polygon(ring), { color, opacity: 0.3 }));
      }

      if (polys.length >= 3) {
        const coords = polys.map((v) => [v.lon, v.lat]);
        const ring = [...coords, coords[0]];
        features.push(feature(polygon(ring), { color, opacity: 0.3 }));
      }
    }
    return { type: 'FeatureCollection', features };
  }, [drones, activeDroneId, droneVisibility]);

  // GCS accuracy circle
  const gcsCircleGeoJSON = useMemo(() => {
    if (!gcsPosition || gcsPosition.lat === 0 || gcsPosition.lon === 0 || !gcsPosition.accuracy) return emptyFC();
    const ring = circleToPolygon(gcsPosition.lon, gcsPosition.lat, gcsPosition.accuracy);
    return { type: 'FeatureCollection', features: [feature(polygon(ring), {})] };
  }, [gcsPosition]);

  return (
    <>
      {/* Planned fence polygon */}
      <Source id="planned-fence" type="geojson" data={plannedFenceGeoJSON}>
        <Layer
          id="planned-fence-fill"
          type="fill"
          paint={{ 'fill-color': '#f59e0b', 'fill-opacity': 0.08 * plannedOpacity }}
        />
        <Layer
          id="planned-fence-line"
          type="line"
          paint={{
            'line-color': '#f59e0b',
            'line-width': 2,
            'line-opacity': 0.7 * plannedOpacity,
            'line-dasharray': [1.5, 1],
          }}
        />
      </Source>

      {/* Geofence circle */}
      <Source id="geofence-circle" type="geojson" data={geofenceGeoJSON}>
        <Layer
          id="geofence-circle-fill"
          type="fill"
          paint={{ 'fill-color': '#f59e0b', 'fill-opacity': 0.05 }}
        />
        <Layer
          id="geofence-circle-line"
          type="line"
          paint={{
            'line-color': '#f59e0b',
            'line-width': 2,
            'line-opacity': 0.6,
            'line-dasharray': [1.5, 1],
          }}
        />
      </Source>

      {/* Active drone fence */}
      <Source id="drone-fence" type="geojson" data={droneFenceGeoJSON}>
        <Layer
          id="drone-fence-fill"
          type="fill"
          paint={{ 'fill-color': '#10b981', 'fill-opacity': 0.08 }}
        />
        <Layer
          id="drone-fence-line"
          type="line"
          paint={{
            'line-color': '#10b981',
            'line-width': 2,
            'line-opacity': 0.7,
            'line-dasharray': [2, 1],
          }}
        />
      </Source>

      {/* Non-active drone fences */}
      <Source id="non-active-fences" type="geojson" data={nonActiveFenceGeoJSON}>
        <Layer
          id="non-active-fences-fill"
          type="fill"
          paint={{
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.05,
          }}
        />
        <Layer
          id="non-active-fences-line"
          type="line"
          paint={{
            'line-color': ['get', 'color'],
            'line-width': 1.5,
            'line-opacity': ['coalesce', ['get', 'opacity'], 0.3],
            'line-dasharray': [2, 1],
          }}
        />
      </Source>

      {/* GCS accuracy circle */}
      <Source id="gcs-accuracy" type="geojson" data={gcsCircleGeoJSON}>
        <Layer
          id="gcs-accuracy-fill"
          type="fill"
          paint={{ 'fill-color': '#6366f1', 'fill-opacity': 0.08 }}
        />
        <Layer
          id="gcs-accuracy-line"
          type="line"
          paint={{
            'line-color': '#6366f1',
            'line-width': 1,
            'line-opacity': 0.3,
          }}
        />
      </Source>

      {/* Fence vertex markers (for planning) */}
      {isPlanning && planSubTab === 'fence' && plannedFence.map((v, i) => (
        <Marker
          key={v.id}
          longitude={v.lon}
          latitude={v.lat}
          anchor="center"
          draggable={true}
          onDragEnd={(e) => {
            const { lng, lat } = e.lngLat;
            updateFenceVertex(v.id, { lat, lon: lng });
          }}
        >
          <div
            className="waypoint-marker"
            style={{
              backgroundColor: '#f59e0b',
              borderColor: '#fbbf24',
              boxShadow: '0 2px 8px #f59e0b66',
              width: 22,
              height: 22,
              fontSize: '9px',
            }}
          >
            {i + 1}
          </div>
        </Marker>
      ))}
    </>
  );
}
