import React from 'react';
import { Circle, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import useDroneStore from '../store/droneStore';

const RISK_COLORS = {
  safe: '#10b981',
  caution: '#f59e0b',
  warning: '#f97316',
  abort: '#ef4444',
};

// Wind vector arrow component
function WindVector({ lat, lon, speed, direction, risk }) {
  const color = RISK_COLORS[risk] || RISK_COLORS.safe;
  const length = Math.min(speed * 3, 30); // Scale arrow length

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${length + 10}" height="${length + 10}" viewBox="0 0 ${length + 10} ${length + 10}">
      <g transform="translate(${(length + 10) / 2}, ${(length + 10) / 2}) rotate(${direction})">
        <line x1="0" y1="0" x2="0" y2="${-length}" stroke="${color}" stroke-width="2" />
        <polygon points="0,${-length} -3,${-length + 6} 3,${-length + 6}" fill="${color}" />
      </g>
    </svg>
  `;

  const icon = L.divIcon({
    html: svg,
    className: 'wind-vector-icon',
    iconSize: [length + 10, length + 10],
    iconAnchor: [(length + 10) / 2, (length + 10) / 2],
  });

  return (
    <Marker position={[lat, lon]} icon={icon}>
      <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
        <div className="text-xs">
          <div className="font-semibold">{speed.toFixed(1)} m/s</div>
          <div className="text-[10px] opacity-70">{direction}°</div>
        </div>
      </Tooltip>
    </Marker>
  );
}

export default function WeatherMapLayer() {
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const weather = useDroneStore((s) => s.weather);
  const activeTab = useDroneStore((s) => s.activeTab);

  const analysis = weather.routeAnalysis;
  const showWindVectors = weather.showWindVectors;
  const showRiskOverlay = weather.showRiskOverlay;

  if (!analysis || activeTab !== 'planning') return null;

  return (
    <>
      {/* Risk overlay circles */}
      {showRiskOverlay && analysis.waypoint_weather.map((wp, i) => {
        const waypoint = plannedWaypoints.filter((w) => w.type !== 'roi')[i];
        if (!waypoint) return null;

        const color = RISK_COLORS[wp.risk_level] || RISK_COLORS.safe;
        const radius = 50 + wp.risk_score; // Risk-based radius

        return (
          <Circle
            key={`risk-${i}`}
            center={[waypoint.lat, waypoint.lon]}
            radius={radius}
            pathOptions={{
              color,
              weight: 2,
              opacity: 0.6,
              fillColor: color,
              fillOpacity: 0.15,
            }}
          />
        );
      })}

      {/* Wind vectors */}
      {showWindVectors && analysis.waypoint_weather.map((wp, i) => {
        const waypoint = plannedWaypoints.filter((w) => w.type !== 'roi')[i];
        if (!waypoint) return null;

        return (
          <WindVector
            key={`wind-${i}`}
            lat={waypoint.lat}
            lon={waypoint.lon}
            speed={wp.weather.wind_speed}
            direction={wp.weather.wind_direction}
            risk={wp.risk_level}
          />
        );
      })}
    </>
  );
}
