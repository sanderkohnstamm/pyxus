import React, { useMemo } from 'react';
import { Source, Layer, Marker } from '@vis.gl/react-maplibre';
import useDroneStore from '../store/droneStore';
import { haversineDistance, bearing } from '../utils/geo';
import { emptyFC, feature, lineString } from './utils';

export default function MeasureOverlay() {
  const measurePoints = useDroneStore((s) => s.measurePoints);

  const lineGeoJSON = useMemo(() => {
    if (measurePoints.length < 2) return emptyFC();
    const [a, b] = measurePoints;
    const coords = [[a.lon, a.lat], [b.lon, b.lat]];
    return { type: 'FeatureCollection', features: [feature(lineString(coords), {})] };
  }, [measurePoints]);

  if (measurePoints.length === 0) return null;

  const hasTwoPoints = measurePoints.length === 2;
  let distStr = '';
  let brng = 0;
  let midLat = 0;
  let midLon = 0;

  if (hasTwoPoints) {
    const [a, b] = measurePoints;
    const dist = haversineDistance(a.lat, a.lon, b.lat, b.lon);
    brng = bearing(a.lat, a.lon, b.lat, b.lon);
    midLat = (a.lat + b.lat) / 2;
    midLon = (a.lon + b.lon) / 2;
    distStr = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`;
  }

  return (
    <>
      {/* Measure line */}
      <Source id="measure-line" type="geojson" data={lineGeoJSON}>
        <Layer
          id="measure-line-layer"
          type="line"
          paint={{
            'line-color': '#f97316',
            'line-width': 2.5,
            'line-opacity': 0.9,
            'line-dasharray': [1.5, 1],
          }}
        />
      </Source>

      {/* Point markers */}
      {measurePoints.map((p, i) => (
        <Marker
          key={`measure-${i}`}
          longitude={p.lon}
          latitude={p.lat}
          anchor="center"
        >
          <div style={{
            width: 10, height: 10,
            background: '#f97316',
            border: '2px solid white',
            borderRadius: '50%',
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }} />
        </Marker>
      ))}

      {/* Distance label */}
      {hasTwoPoints && (
        <Marker
          longitude={midLon}
          latitude={midLat}
          anchor="bottom"
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            display: 'inline-block',
            whiteSpace: 'nowrap',
            background: 'rgba(15,23,42,0.85)',
            color: '#fb923c',
            padding: '3px 7px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: 'monospace',
            border: '1px solid rgba(249,115,22,0.4)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}>
            {distStr} | {brng.toFixed(0)}&deg;
          </div>
        </Marker>
      )}
    </>
  );
}
