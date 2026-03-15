// Color palette for multi-drone visualization
export const DRONE_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
export const DRONE_STROKES = ['#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#2dd4bf', '#fb923c'];

// Navigation types that have map positions
export const NAV_TYPES = new Set(['waypoint', 'takeoff', 'loiter_unlim', 'loiter_turns', 'loiter_time', 'roi', 'land']);

// Waypoint type config for map markers
export const MARKER_COLORS = {
  waypoint: { bg: '#0ea5e9', border: '#38bdf8', label: 'WP' },
  takeoff: { bg: '#10b981', border: '#34d399', label: 'TO' },
  loiter_unlim: { bg: '#8b5cf6', border: '#a78bfa', label: 'LT' },
  loiter_turns: { bg: '#8b5cf6', border: '#a78bfa', label: 'LN' },
  loiter_time: { bg: '#8b5cf6', border: '#a78bfa', label: 'LD' },
  roi: { bg: '#f59e0b', border: '#fbbf24', label: 'ROI' },
  land: { bg: '#f97316', border: '#fb923c', label: 'LND' },
};

export const TYPE_LABELS = {
  waypoint: 'Waypoint',
  takeoff: 'Takeoff',
  loiter_unlim: 'Loiter',
  loiter_turns: 'Loiter Turns',
  loiter_time: 'Loiter Time',
  roi: 'ROI',
  land: 'Land',
};

// Generate quadratic bezier arc between two points (lon/lat order for GeoJSON)
// source/target: [lon, lat]
export function generateArc(source, target, numPoints = 20) {
  const dx = target[0] - source[0];
  const dy = target[1] - source[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.000001) return [source, target];

  const midLon = (source[0] + target[0]) / 2;
  const midLat = (source[1] + target[1]) / 2;
  const offset = len * 0.25;
  const ctrlLon = midLon + (-dy / len) * offset;
  const ctrlLat = midLat + (dx / len) * offset;

  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    points.push([
      (1 - t) * (1 - t) * source[0] + 2 * (1 - t) * t * ctrlLon + t * t * target[0],
      (1 - t) * (1 - t) * source[1] + 2 * (1 - t) * t * ctrlLat + t * t * target[1],
    ]);
  }
  return points;
}

// Hex color to rgba string
export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
