import React, { useMemo } from 'react';
import { Source, Layer, Marker } from '@vis.gl/react-maplibre';
import useDroneStore from '../store/droneStore';
import { circleToPolygon, emptyFC, feature, polygon } from './utils';

const RISK_COLORS = {
  safe: '#10b981',
  caution: '#f59e0b',
  warning: '#f97316',
  abort: '#ef4444',
};

export default function WeatherLayer() {
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const weather = useDroneStore((s) => s.weather);
  const activeTab = useDroneStore((s) => s.activeTab);

  const analysis = weather.routeAnalysis;
  const showWindVectors = weather.showWindVectors;
  const showRiskOverlay = weather.showRiskOverlay;

  // Risk overlay circles as polygon approximations
  const riskGeoJSON = useMemo(() => {
    if (!analysis || activeTab !== 'planning' || !showRiskOverlay) return emptyFC();

    const features = [];
    const navWps = plannedWaypoints.filter((w) => w.type !== 'roi');
    analysis.waypoint_weather.forEach((wp, i) => {
      const waypoint = navWps[i];
      if (!waypoint) return;

      const color = RISK_COLORS[wp.risk_level] || RISK_COLORS.safe;
      const radius = 50 + wp.risk_score;
      const ring = circleToPolygon(waypoint.lon, waypoint.lat, radius);
      features.push(feature(polygon(ring), { color, opacity: 0.6, fillOpacity: 0.15 }));
    });

    return { type: 'FeatureCollection', features };
  }, [analysis, activeTab, showRiskOverlay, plannedWaypoints]);

  if (!analysis || activeTab !== 'planning') return null;

  const navWps = plannedWaypoints.filter((w) => w.type !== 'roi');

  return (
    <>
      {/* Risk circles */}
      <Source id="weather-risk" type="geojson" data={riskGeoJSON}>
        <Layer
          id="weather-risk-fill"
          type="fill"
          paint={{
            'fill-color': ['get', 'color'],
            'fill-opacity': ['get', 'fillOpacity'],
          }}
        />
        <Layer
          id="weather-risk-line"
          type="line"
          paint={{
            'line-color': ['get', 'color'],
            'line-width': 2,
            'line-opacity': ['get', 'opacity'],
          }}
        />
      </Source>

      {/* Wind vector arrows (HTML Markers) */}
      {showWindVectors && analysis.waypoint_weather.map((wp, i) => {
        const waypoint = navWps[i];
        if (!waypoint) return null;

        const color = RISK_COLORS[wp.risk_level] || RISK_COLORS.safe;
        const speed = wp.weather.wind_speed;
        const direction = wp.weather.wind_direction;
        const length = Math.min(speed * 3, 30);

        return (
          <Marker
            key={`wind-${i}`}
            longitude={waypoint.lon}
            latitude={waypoint.lat}
            anchor="center"
            style={{ pointerEvents: 'none' }}
          >
            <svg
              width={length + 10}
              height={length + 10}
              viewBox={`0 0 ${length + 10} ${length + 10}`}
            >
              <g transform={`translate(${(length + 10) / 2}, ${(length + 10) / 2}) rotate(${direction})`}>
                <line x1="0" y1="0" x2="0" y2={-length} stroke={color} strokeWidth="2" />
                <polygon points={`0,${-length} -3,${-length + 6} 3,${-length + 6}`} fill={color} />
              </g>
            </svg>
          </Marker>
        );
      })}
    </>
  );
}
