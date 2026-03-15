import L from 'leaflet';

// Navigation types that have map positions
export const NAV_TYPES = new Set(['waypoint', 'takeoff', 'loiter_unlim', 'loiter_turns', 'loiter_time', 'roi', 'land']);

// Color palette for multi-drone visualization
export const DRONE_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
// Lighter stroke variants for drone icons
export const DRONE_STROKES = ['#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#2dd4bf', '#fb923c'];

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

// Satellite imagery tiles
export const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const TILE_ATTR = 'Tiles &copy; Esri';

// Generate quadratic bezier arc between two points
export function generateArc(source, target, numPoints = 20) {
  const dx = target[1] - source[1];
  const dy = target[0] - source[0];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.000001) return [source, target];

  const midLat = (source[0] + target[0]) / 2;
  const midLon = (source[1] + target[1]) / 2;
  const offset = len * 0.25;
  const ctrlLat = midLat + (-dx / len) * offset;
  const ctrlLon = midLon + (dy / len) * offset;

  const points = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    points.push([
      (1 - t) * (1 - t) * source[0] + 2 * (1 - t) * t * ctrlLat + t * t * target[0],
      (1 - t) * (1 - t) * source[1] + 2 * (1 - t) * t * ctrlLon + t * t * target[1],
    ]);
  }
  return points;
}

// SVG arrow drone icon (active = cyan, inactive = gray)
export function createDroneIcon(yawDeg, fill = '#06b6d4', stroke = '#22d3ee') {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="-18 -18 36 36">
      <g transform="rotate(${yawDeg})">
        <path d="M0,-13 L12,10 L0,3 L-12,10 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>
      </g>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: 'drone-marker-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

// Name label icon for drones on the map
export function createDroneNameIcon(name, isActive, color) {
  const bg = color ? hexToRgba(color, 0.85) : (isActive ? 'rgba(6,182,212,0.85)' : 'rgba(100,116,139,0.75)');
  return L.divIcon({
    html: `<div style="white-space:nowrap;background:${bg};color:white;padding:2px 6px;border-radius:3px;font-size:9px;font-weight:600;font-family:monospace;text-align:center;pointer-events:none">${name}</div>`,
    className: 'drone-name-label',
    iconSize: null,
    iconAnchor: [-12, -10],
  });
}

// Utility: hex color to rgba string
export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Waypoint icon with type-based coloring
export function createWaypointIcon(index, type) {
  const config = MARKER_COLORS[type] || MARKER_COLORS.waypoint;
  return L.divIcon({
    html: `<div class="waypoint-marker" style="background-color:${config.bg};border-color:${config.border};box-shadow:0 2px 8px ${config.bg}66">${index + 1}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// Drone mission icon (dimmer, smaller; active = highlighted with glow)
export function createDroneMissionIcon(index, type, isActive = false) {
  const config = MARKER_COLORS[type] || MARKER_COLORS.waypoint;
  if (isActive) {
    // Active waypoint: larger with glow
    return L.divIcon({
      html: `<div class="drone-mission-marker drone-mission-active" style="background-color:${config.bg};border-color:#fff;box-shadow:0 0 10px ${config.bg},0 0 20px ${config.bg}88;width:26px;height:26px;border-width:3px">${index + 1}</div>`,
      className: '',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
  }
  return L.divIcon({
    html: `<div class="drone-mission-marker" style="background-color:${config.bg};border-color:${config.border}">${index + 1}</div>`,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// Fence vertex icon
export function createFenceVertexIcon(index) {
  return L.divIcon({
    html: `<div class="waypoint-marker" style="background-color:#f59e0b;border-color:#fbbf24;box-shadow:0 2px 8px #f59e0b66;width:22px;height:22px;font-size:9px">${index + 1}</div>`,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// Red violation ring icon for waypoints outside fence
export function createViolationRingIcon() {
  return L.divIcon({
    html: `<div style="width:36px;height:36px;border:3px solid #ef4444;border-radius:50%;box-shadow:0 0 8px rgba(239,68,68,0.6),inset 0 0 4px rgba(239,68,68,0.3);pointer-events:none"></div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

// Home position icon
export const homeIcon = L.divIcon({
  html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:#10b981;border:2px solid #34d399;border-radius:50%;box-shadow:0 2px 8px rgba(16,185,129,0.4)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  </div>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// GCS location icon
export const gcsIcon = L.divIcon({
  html: `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:#6366f1;border:2px solid #818cf8;border-radius:50%;box-shadow:0 2px 8px rgba(99,102,241,0.4)">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
      <line x1="8" y1="21" x2="16" y2="21"></line>
      <line x1="12" y1="17" x2="12" y2="21"></line>
    </svg>
  </div>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Target icon for fly mode click
export const flyTargetIcon = L.divIcon({
  html: '<div style="width:12px;height:12px;border:2px solid #f97316;border-radius:50%;background:rgba(249,115,22,0.3)"></div>',
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});
