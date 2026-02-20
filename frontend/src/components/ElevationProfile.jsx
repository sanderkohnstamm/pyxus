import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import useDroneStore from '../store/droneStore';
import { apiUrl } from '../utils/api';

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

// Fetch ground elevation via backend proxy (with server-side caching)
async function fetchElevation(points) {
  const batchSize = 100;
  const elevations = [];

  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    const locations = batch.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join('|');

    try {
      const res = await fetch(
        apiUrl(`/api/terrain/elevation?locations=${encodeURIComponent(locations)}`)
      );
      const data = await res.json();
      if (data.elevations) {
        elevations.push(...data.elevations.map((e) => e.elevation ?? 0));
      } else {
        elevations.push(...batch.map(() => 0));
      }
    } catch {
      elevations.push(...batch.map(() => 0));
    }
  }

  return elevations;
}

// Minimum clearance threshold (meters AGL)
const MIN_CLEARANCE_M = 10;

export default function ElevationProfile() {
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const updateWaypoint = useDroneStore((s) => s.updateWaypoint);
  const setTerrainElevations = useDroneStore((s) => s.setTerrainElevations);
  const [groundData, setGroundData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(null); // { index, id, ground, startAlt }
  const [dragAlt, setDragAlt] = useState(null); // Preview altitude during drag
  const svgRef = useRef(null);
  const debounceRef = useRef(null);

  // Filter navigable waypoints (not ROI or do_ commands)
  const navWaypoints = useMemo(
    () => plannedWaypoints.filter((w) => w.type !== 'roi' && !w.type.startsWith('do_')),
    [plannedWaypoints]
  );

  // Sample path points
  const pathPoints = useMemo(() => {
    if (navWaypoints.length < 2) return null;
    return samplePath(navWaypoints);
  }, [navWaypoints]);

  // Fetch elevation when path changes (debounced 500ms)
  useEffect(() => {
    if (!pathPoints || pathPoints.length < 2) {
      setGroundData(null);
      setTerrainElevations([]);
      return;
    }

    let cancelled = false;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setLoading(true);

      fetchElevation(pathPoints).then((elevations) => {
        if (!cancelled) {
          const data = pathPoints.map((p, i) => ({
            ...p,
            ground: elevations[i] || 0,
          }));
          setGroundData(data);
          setTerrainElevations(
            data.map((d) => ({ lat: d.lat, lon: d.lon, elevation: d.ground }))
          );
          setLoading(false);
        }
      });
    }, 500);

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pathPoints, setTerrainElevations]);

  // SVG dimensions
  const W = 340;
  const H = 140;
  const padL = 35;
  const padR = 10;
  const padT = 10;
  const padB = 20;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Memoize chart calculations
  const chartData = useMemo(() => {
    if (!groundData || navWaypoints.length < 2) return null;

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
        id: navWaypoints[i].id,
      });
    }

    const allHeights = [
      ...groundData.map((d) => d.ground),
      ...wpPoints.map((w) => w.altMsl),
    ];
    const minH = Math.min(...allHeights) - 10;
    const maxH = Math.max(...allHeights) + 20;
    const rangeH = maxH - minH || 1;

    // Compute min clearance per segment (between consecutive waypoints)
    // For each sampled ground point, interpolate mission altitude along route
    const clearanceWarnings = [];
    for (let wi = 0; wi < wpPoints.length - 1; wi++) {
      const wp1 = wpPoints[wi];
      const wp2 = wpPoints[wi + 1];
      let segMinClearance = Infinity;

      for (const gd of groundData) {
        if (gd.dist < wp1.dist || gd.dist > wp2.dist) continue;
        // Linear interpolation of mission altitude along segment
        const t = wp2.dist === wp1.dist ? 0 : (gd.dist - wp1.dist) / (wp2.dist - wp1.dist);
        const missionAlt = wp1.altMsl + t * (wp2.altMsl - wp1.altMsl);
        const clearance = missionAlt - gd.ground;
        segMinClearance = Math.min(segMinClearance, clearance);
      }

      if (segMinClearance < MIN_CLEARANCE_M) {
        clearanceWarnings.push({
          segIndex: wi,
          minClearance: segMinClearance,
          startDist: wp1.dist,
          endDist: wp2.dist,
        });
      }
    }

    return { totalDist, wpPoints, minH, maxH, rangeH, clearanceWarnings };
  }, [groundData, navWaypoints]);

  const x = useCallback((dist) => chartData ? padL + (dist / chartData.totalDist) * chartW : 0, [chartData]);
  const y = useCallback((h) => chartData ? padT + chartH - ((h - chartData.minH) / chartData.rangeH) * chartH : 0, [chartData]);

  // Apply drag preview to wpPoints for smooth rendering
  const displayWpPoints = useMemo(() => {
    if (!chartData) return [];
    if (!dragging || dragAlt === null) return chartData.wpPoints;
    return chartData.wpPoints.map(w =>
      w.index === dragging.index
        ? { ...w, altMsl: w.ground + dragAlt, altRel: dragAlt }
        : w
    );
  }, [chartData, dragging, dragAlt]);

  // Convert Y position back to altitude
  const yToAlt = useCallback((yPos, groundElev) => {
    if (!chartData) return 0;
    const h = chartData.minH + ((padT + chartH - yPos) / chartH) * chartData.rangeH;
    return Math.max(1, Math.round(h - groundElev));
  }, [chartData]);

  // Drag handlers - use local state during drag, commit on mouseup
  const handleMouseDown = useCallback((e, wpIndex, wpId, ground, currentAlt) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging({ index: wpIndex, id: wpId, ground });
    setDragAlt(currentAlt);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !svgRef.current) return;

    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const svgY = ((e.clientY - rect.top) / rect.height) * H;
    const newAlt = Math.max(1, Math.min(500, yToAlt(svgY, dragging.ground)));
    setDragAlt(newAlt);
  }, [dragging, yToAlt]);

  const handleMouseUp = useCallback(() => {
    if (dragging && dragAlt !== null) {
      updateWaypoint(dragging.id, { alt: dragAlt });
    }
    setDragging(null);
    setDragAlt(null);
  }, [dragging, dragAlt, updateWaypoint]);

  // Global mouse events for drag
  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  if (navWaypoints.length < 2) return null;
  if (loading) {
    return (
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50 mt-3">
        <div className="text-[10px] text-gray-500 text-center py-4">Loading terrain data...</div>
      </div>
    );
  }
  if (!groundData || !chartData) return null;

  const { totalDist, minH, maxH, rangeH, clearanceWarnings } = chartData;
  const distLabel = totalDist >= 1000 ? `${(totalDist / 1000).toFixed(1)}km` : `${Math.round(totalDist)}m`;
  const hasWarnings = clearanceWarnings.length > 0;

  // Ground profile polygon
  const groundPath =
    `M ${x(0)} ${y(groundData[0].ground)} ` +
    groundData.map((d) => `L ${x(d.dist)} ${y(d.ground)}`).join(' ') +
    ` L ${x(totalDist)} ${padT + chartH} L ${x(0)} ${padT + chartH} Z`;

  // Waypoint altitude line (uses displayWpPoints for smooth drag preview)
  const wpLine = displayWpPoints.map((w, i) => `${i === 0 ? 'M' : 'L'} ${x(w.dist)} ${y(w.altMsl)}`).join(' ');

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
        {hasWarnings && (
          <span className="text-[9px] text-red-400 font-semibold">TERRAIN WARNING</span>
        )}
        <span className="text-[9px] text-gray-600 ml-auto">{distLabel} total</span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: '140px', cursor: dragging ? 'ns-resize' : 'default' }}
      >
        {/* Grid lines */}
        {yTicks.map((h) => (
          <g key={h}>
            <line x1={padL} y1={y(h)} x2={W - padR} y2={y(h)} stroke="rgba(148,163,184,0.1)" strokeWidth="0.5" />
            <text x={padL - 3} y={y(h) + 3} textAnchor="end" fill="rgba(148,163,184,0.4)" fontSize="7" fontFamily="monospace">{h}m</text>
          </g>
        ))}

        {/* Clearance warning zones (red highlighted areas) */}
        {clearanceWarnings.map((warn, wi) => {
          // Find ground data points in the warning segment
          const segPoints = groundData.filter((d) => d.dist >= warn.startDist && d.dist <= warn.endDist);
          if (segPoints.length < 2) return null;

          // Find the corresponding wpPoints for this segment
          const wp1 = displayWpPoints[warn.segIndex];
          const wp2 = displayWpPoints[warn.segIndex + 1];
          if (!wp1 || !wp2) return null;

          // Build a filled polygon between terrain and flight path for this segment
          const topLine = segPoints.map((d) => {
            const t = wp2.dist === wp1.dist ? 0 : (d.dist - wp1.dist) / (wp2.dist - wp1.dist);
            const missionAlt = wp1.altMsl + t * (wp2.altMsl - wp1.altMsl);
            return `${x(d.dist)},${y(missionAlt)}`;
          });
          const bottomLine = [...segPoints].reverse().map((d) => `${x(d.dist)},${y(d.ground)}`);

          return (
            <polygon
              key={`warn-${wi}`}
              points={[...topLine, ...bottomLine].join(' ')}
              fill="rgba(239,68,68,0.2)"
              stroke="rgba(239,68,68,0.5)"
              strokeWidth="0.5"
              strokeDasharray="3 2"
            />
          );
        })}

        {/* Ground fill (brown/earth color) */}
        <path d={groundPath} fill="rgba(160,120,60,0.2)" stroke="none" />
        {/* Ground line */}
        <polyline points={groundData.map((d) => `${x(d.dist)},${y(d.ground)}`).join(' ')} fill="none" stroke="rgba(160,120,60,0.6)" strokeWidth="1" />

        {/* Waypoint altitude line */}
        <path d={wpLine} fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeLinejoin="round" />

        {/* Waypoint dots + labels (draggable) */}
        {displayWpPoints.map((w) => {
          const lowClearance = w.altRel < MIN_CLEARANCE_M;
          return (
            <g key={w.index}>
              {/* Vertical line from ground to waypoint */}
              <line
                x1={x(w.dist)} y1={y(w.ground)} x2={x(w.dist)} y2={y(w.altMsl)}
                stroke={lowClearance ? 'rgba(239,68,68,0.4)' : 'rgba(6,182,212,0.2)'}
                strokeWidth="0.5"
                strokeDasharray="2 2"
              />
              {/* Draggable circle */}
              <circle
                cx={x(w.dist)}
                cy={y(w.altMsl)}
                r={dragging?.index === w.index ? 5 : 4}
                fill={lowClearance ? '#ef4444' : (dragging?.index === w.index ? '#22d3ee' : '#06b6d4')}
                stroke={dragging?.index === w.index ? '#fff' : 'none'}
                strokeWidth="1"
                style={{ cursor: 'ns-resize' }}
                onMouseDown={(e) => handleMouseDown(e, w.index, w.id, w.ground, w.altRel)}
              />
              {/* Index label */}
              <text
                x={x(w.dist)} y={y(w.altMsl) - 7}
                textAnchor="middle"
                fill={lowClearance ? 'rgba(239,68,68,0.9)' : 'rgba(6,182,212,0.8)'}
                fontSize="7" fontFamily="monospace"
              >
                {w.index + 1}
              </text>
              {/* Altitude label (show when dragging) */}
              {dragging?.index === w.index && (
                <text x={x(w.dist) + 8} y={y(w.altMsl) + 3} textAnchor="start" fill="#22d3ee" fontSize="8" fontFamily="monospace" fontWeight="bold">{w.altRel}m</text>
              )}
            </g>
          );
        })}

        {/* X axis label */}
        <text x={W / 2} y={H - 2} textAnchor="middle" fill="rgba(148,163,184,0.3)" fontSize="7" fontFamily="monospace">distance</text>
      </svg>

      {/* Legend + clearance warning */}
      <div className="flex items-center gap-3 mt-1.5 text-[9px] text-gray-600 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-0.5 bg-cyan-500 rounded-full inline-block" />
          Flight (MSL)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-0.5 rounded-full inline-block" style={{ backgroundColor: 'rgba(160,120,60,0.7)' }} />
          Terrain
        </span>
        {hasWarnings && (
          <span className="flex items-center gap-1 text-red-400">
            <span className="w-2.5 h-2 bg-red-500/30 border border-red-500/50 rounded-sm inline-block" />
            &lt;{MIN_CLEARANCE_M}m AGL
          </span>
        )}
        <span className="text-gray-500 ml-auto">Drag to adjust</span>
      </div>
    </div>
  );
}
