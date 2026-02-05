import React, { useEffect, useState, useMemo } from 'react';
import useDroneStore from '../store/droneStore';

// Haversine distance in meters
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Interpolate points along the path for smoother ground profile
function samplePath(waypoints, maxSpacing = 100) {
  const points = [{ lat: waypoints[0].lat, lon: waypoints[0].lon, dist: 0, wpIndex: 0 }];
  let totalDist = 0;

  for (let i = 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    const segDist = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
    const steps = Math.max(1, Math.ceil(segDist / maxSpacing));

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const lat = prev.lat + (curr.lat - prev.lat) * t;
      const lon = prev.lon + (curr.lon - prev.lon) * t;
      totalDist += segDist / steps;
      points.push({
        lat,
        lon,
        dist: totalDist,
        wpIndex: s === steps ? i : null,
      });
    }
  }

  return points;
}

// Fetch ground elevation from Open-Meteo
async function fetchElevation(points) {
  const batchSize = 100;
  const elevations = [];

  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    const lats = batch.map((p) => p.lat.toFixed(6)).join(',');
    const lons = batch.map((p) => p.lon.toFixed(6)).join(',');

    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`
      );
      const data = await res.json();
      if (data.elevation) {
        elevations.push(...data.elevation);
      } else {
        elevations.push(...batch.map(() => 0));
      }
    } catch {
      elevations.push(...batch.map(() => 0));
    }
  }

  return elevations;
}

export default function ElevationProfile() {
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const [groundData, setGroundData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Filter navigable waypoints (not ROI)
  const navWaypoints = useMemo(
    () => plannedWaypoints.filter((w) => w.type !== 'roi'),
    [plannedWaypoints]
  );

  // Sample path points
  const pathPoints = useMemo(() => {
    if (navWaypoints.length < 2) return null;
    return samplePath(navWaypoints);
  }, [navWaypoints]);

  // Fetch elevation when path changes
  useEffect(() => {
    if (!pathPoints || pathPoints.length < 2) {
      setGroundData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetchElevation(pathPoints).then((elevations) => {
      if (!cancelled) {
        setGroundData(
          pathPoints.map((p, i) => ({
            ...p,
            ground: elevations[i] || 0,
          }))
        );
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [pathPoints]);

  if (navWaypoints.length < 2) return null;
  if (loading) {
    return (
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50 mt-3">
        <div className="text-[10px] text-gray-500 text-center py-4">Loading elevation data...</div>
      </div>
    );
  }
  if (!groundData) return null;

  // Build chart data
  const totalDist = groundData[groundData.length - 1].dist;
  const wpPoints = [];
  for (let i = 0; i < navWaypoints.length; i++) {
    const gd = groundData.find((d) => d.wpIndex === i) || groundData[i === 0 ? 0 : groundData.length - 1];
    wpPoints.push({
      dist: gd.dist,
      altMsl: gd.ground + navWaypoints[i].alt,
      altRel: navWaypoints[i].alt,
      ground: gd.ground,
      index: i,
    });
  }

  const allHeights = [
    ...groundData.map((d) => d.ground),
    ...wpPoints.map((w) => w.altMsl),
  ];
  const minH = Math.min(...allHeights) - 10;
  const maxH = Math.max(...allHeights) + 20;
  const rangeH = maxH - minH || 1;

  // SVG dimensions
  const W = 340;
  const H = 120;
  const padL = 35;
  const padR = 10;
  const padT = 10;
  const padB = 20;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const x = (dist) => padL + (dist / totalDist) * chartW;
  const y = (h) => padT + chartH - ((h - minH) / rangeH) * chartH;

  // Ground profile polygon
  const groundPath =
    `M ${x(0)} ${y(groundData[0].ground)} ` +
    groundData.map((d) => `L ${x(d.dist)} ${y(d.ground)}`).join(' ') +
    ` L ${x(totalDist)} ${padT + chartH} L ${x(0)} ${padT + chartH} Z`;

  // Waypoint altitude line
  const wpLine = wpPoints.map((w, i) => `${i === 0 ? 'M' : 'L'} ${x(w.dist)} ${y(w.altMsl)}`).join(' ');

  // Y-axis labels (3-4 ticks)
  const yTicks = [];
  const step = Math.ceil(rangeH / 4 / 10) * 10 || 10;
  for (let h = Math.ceil(minH / step) * step; h <= maxH; h += step) {
    yTicks.push(h);
  }

  return (
    <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50 mt-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Elevation Profile</span>
        <span className="text-[9px] text-gray-600 ml-auto">{Math.round(totalDist)}m total</span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: '120px' }}
      >
        {/* Grid lines */}
        {yTicks.map((h) => (
          <g key={h}>
            <line
              x1={padL}
              y1={y(h)}
              x2={W - padR}
              y2={y(h)}
              stroke="rgba(148,163,184,0.1)"
              strokeWidth="0.5"
            />
            <text
              x={padL - 3}
              y={y(h) + 3}
              textAnchor="end"
              fill="rgba(148,163,184,0.4)"
              fontSize="7"
              fontFamily="monospace"
            >
              {h}m
            </text>
          </g>
        ))}

        {/* Ground fill */}
        <path d={groundPath} fill="rgba(139,92,246,0.15)" stroke="none" />
        {/* Ground line */}
        <polyline
          points={groundData.map((d) => `${x(d.dist)},${y(d.ground)}`).join(' ')}
          fill="none"
          stroke="rgba(139,92,246,0.5)"
          strokeWidth="1"
        />

        {/* Waypoint altitude line */}
        <path d={wpLine} fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinejoin="round" />

        {/* Waypoint dots + labels */}
        {wpPoints.map((w) => (
          <g key={w.index}>
            {/* Vertical line from ground to waypoint */}
            <line
              x1={x(w.dist)}
              y1={y(w.ground)}
              x2={x(w.dist)}
              y2={y(w.altMsl)}
              stroke="rgba(6,182,212,0.2)"
              strokeWidth="0.5"
              strokeDasharray="2 2"
            />
            <circle cx={x(w.dist)} cy={y(w.altMsl)} r="3" fill="#06b6d4" />
            <text
              x={x(w.dist)}
              y={y(w.altMsl) - 5}
              textAnchor="middle"
              fill="rgba(6,182,212,0.8)"
              fontSize="7"
              fontFamily="monospace"
            >
              {w.index + 1}
            </text>
          </g>
        ))}

        {/* X axis label */}
        <text
          x={W / 2}
          y={H - 2}
          textAnchor="middle"
          fill="rgba(148,163,184,0.3)"
          fontSize="7"
          fontFamily="monospace"
        >
          distance
        </text>
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-1.5 text-[9px] text-gray-600">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-0.5 bg-cyan-500 rounded-full inline-block" />
          Flight altitude (MSL)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-0.5 bg-violet-500/50 rounded-full inline-block" />
          Ground
        </span>
      </div>
    </div>
  );
}
