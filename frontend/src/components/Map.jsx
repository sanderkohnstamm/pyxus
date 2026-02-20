import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Circle, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import useDroneStore from '../store/droneStore';
import { INITIAL_TELEMETRY, EMPTY_ARRAY } from '../store/droneStore';
import { droneApi } from '../utils/api';
import MavLog from './MavLog';
import VideoOverlay from './VideoOverlay';
import WeatherMapLayer from './WeatherMapLayer';
import ManualControlOverlay from './ManualControlOverlay';
import PatternModal from './PatternModal';
import DroneListOverlay from './DroneListOverlay';
import { Move, RotateCw, Maximize2, ArrowLeftRight, Grid3X3, Ruler, Zap } from 'lucide-react';
import { centroid, transformMission, haversineDistance, bearing } from '../utils/geo';
import { formatCoord } from '../utils/formatCoord';

// Navigation types that have map positions
const NAV_TYPES = new Set(['waypoint', 'takeoff', 'loiter_unlim', 'loiter_turns', 'loiter_time', 'roi', 'land']);

// Color palette for multi-drone visualization
const DRONE_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
// Lighter stroke variants for drone icons
const DRONE_STROKES = ['#22d3ee', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#2dd4bf', '#fb923c'];

// Generate quadratic bezier arc between two points
function generateArc(source, target, numPoints = 20) {
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

// Satellite imagery tiles
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTR = 'Tiles &copy; Esri';

// Waypoint type config for map markers
const MARKER_COLORS = {
  waypoint: { bg: '#0ea5e9', border: '#38bdf8', label: 'WP' },
  takeoff: { bg: '#10b981', border: '#34d399', label: 'TO' },
  loiter_unlim: { bg: '#8b5cf6', border: '#a78bfa', label: 'LT' },
  loiter_turns: { bg: '#8b5cf6', border: '#a78bfa', label: 'LN' },
  loiter_time: { bg: '#8b5cf6', border: '#a78bfa', label: 'LD' },
  roi: { bg: '#f59e0b', border: '#fbbf24', label: 'ROI' },
  land: { bg: '#f97316', border: '#fb923c', label: 'LND' },
};

// SVG arrow drone icon (active = cyan, inactive = gray)
function createDroneIcon(yawDeg, fill = '#06b6d4', stroke = '#22d3ee') {
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
function createDroneNameIcon(name, isActive, color) {
  const bg = color ? hexToRgba(color, 0.85) : (isActive ? 'rgba(6,182,212,0.85)' : 'rgba(100,116,139,0.75)');
  return L.divIcon({
    html: `<div style="white-space:nowrap;background:${bg};color:white;padding:2px 6px;border-radius:3px;font-size:9px;font-weight:600;font-family:monospace;text-align:center;pointer-events:none">${name}</div>`,
    className: 'drone-name-label',
    iconSize: null,
    iconAnchor: [-12, -10],
  });
}

// Utility: hex color to rgba string
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Waypoint icon with type-based coloring
function createWaypointIcon(index, type) {
  const config = MARKER_COLORS[type] || MARKER_COLORS.waypoint;
  return L.divIcon({
    html: `<div class="waypoint-marker" style="background-color:${config.bg};border-color:${config.border};box-shadow:0 2px 8px ${config.bg}66">${index + 1}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// Drone mission icon (dimmer, smaller; active = highlighted with glow)
function createDroneMissionIcon(index, type, isActive = false) {
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
function createFenceVertexIcon(index) {
  return L.divIcon({
    html: `<div class="waypoint-marker" style="background-color:#f59e0b;border-color:#fbbf24;box-shadow:0 2px 8px #f59e0b66;width:22px;height:22px;font-size:9px">${index + 1}</div>`,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// Home position icon
const homeIcon = L.divIcon({
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
const gcsIcon = L.divIcon({
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

// GCS location tracker — uses browser geolocation (CoreLocation on macOS)
function GcsLocator() {
  const map = useMap();
  const gcsPosition = useDroneStore((s) => s.gcsPosition);
  const setGcsPosition = useDroneStore((s) => s.setGcsPosition);
  const gcsZoomed = useDroneStore((s) => s._gcsZoomed);
  const markGcsZoomed = useDroneStore((s) => s.markGcsZoomed);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let cancelled = false;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!cancelled) {
          setGcsPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy });
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
    );
    return () => { cancelled = true; navigator.geolocation.clearWatch(watchId); };
  }, [setGcsPosition]);

  // Zoom to GCS on first fix — only if no drone is connected yet
  useEffect(() => {
    if (gcsZoomed || !gcsPosition || activeDroneId) return;
    markGcsZoomed();
    map.setView([gcsPosition.lat, gcsPosition.lon], 15, { animate: true });
  }, [gcsPosition, gcsZoomed, activeDroneId, markGcsZoomed, map]);

  return null;
}

// Invalidate map size when sidebar collapses/expands
function MapResizer() {
  const map = useMap();
  const sidebarCollapsed = useDroneStore((s) => s.sidebarCollapsed);

  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(timer);
  }, [sidebarCollapsed, map]);

  return null;
}

// Component to follow active drone position
function DroneFollower() {
  const map = useMap();
  const lat = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.lat : 0) || 0;
  const lon = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.lon : 0) || 0;
  const followDrone = useDroneStore((s) => s.followDrone);
  const setFollowDrone = useDroneStore((s) => s.setFollowDrone);
  const zoomToDrone = useDroneStore((s) => s.zoomToDrone);
  const clearZoomToDrone = useDroneStore((s) => s.clearZoomToDrone);

  useMapEvents({
    dragstart: () => setFollowDrone(false),
  });

  // Zoom to drone on connect trigger
  useEffect(() => {
    if (zoomToDrone && lat !== 0 && lon !== 0) {
      map.setView([lat, lon], 17, { animate: true });
      clearZoomToDrone();
    }
  }, [zoomToDrone, lat, lon, map, clearZoomToDrone]);

  useEffect(() => {
    if (followDrone && lat !== 0 && lon !== 0) {
      map.setView([lat, lon], map.getZoom(), { animate: true });
    }
  }, [lat, lon, followDrone, map]);

  return null;
}

// Click handler for adding waypoints/fence vertices + fly mode targeting
function MapClickHandler() {
  const addWaypoint = useDroneStore((s) => s.addWaypoint);
  const addFenceVertex = useDroneStore((s) => s.addFenceVertex);
  const addPatternBoundsVertex = useDroneStore((s) => s.addPatternBoundsVertex);
  const patternDrawMode = useDroneStore((s) => s.patternDrawMode);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const addWaypointMode = useDroneStore((s) => s.addWaypointMode);
  const activeTab = useDroneStore((s) => s.activeTab);
  const planSubTab = useDroneStore((s) => s.planSubTab);
  const setFlyClickTarget = useDroneStore((s) => s.setFlyClickTarget);
  const measureMode = useDroneStore((s) => s.measureMode);
  const addMeasurePoint = useDroneStore((s) => s.addMeasurePoint);
  const quickMissionMode = useDroneStore((s) => s.quickMissionMode);
  const addQuickMissionWaypoint = useDroneStore((s) => s.addQuickMissionWaypoint);

  useMapEvents({
    click: (e) => {
      // Quick mission mode (highest priority in fly mode)
      if (quickMissionMode) {
        addQuickMissionWaypoint(e.latlng.lat, e.latlng.lng);
        return;
      }
      // Measure mode
      if (measureMode) {
        addMeasurePoint(e.latlng.lat, e.latlng.lng);
        return;
      }
      // Pattern bounds drawing mode
      if (patternDrawMode) {
        addPatternBoundsVertex(e.latlng.lat, e.latlng.lng);
        return;
      }
      // Planning mode works offline
      if (activeTab === 'planning' && addWaypointMode) {
        if (planSubTab === 'fence') {
          addFenceVertex(e.latlng.lat, e.latlng.lng);
        } else {
          addWaypoint(e.latlng.lat, e.latlng.lng);
        }
      }
      // Flying mode requires connection
      else if (activeTab === 'flying' && activeDroneId) {
        setFlyClickTarget({ lat: e.latlng.lat, lon: e.latlng.lng });
      }
    },
  });

  return null;
}

// Set crosshair cursor when in add mode or measure mode
function AddModeCursor() {
  const map = useMap();
  const addWaypointMode = useDroneStore((s) => s.addWaypointMode);
  const activeTab = useDroneStore((s) => s.activeTab);
  const measureMode = useDroneStore((s) => s.measureMode);
  const quickMissionMode = useDroneStore((s) => s.quickMissionMode);

  useEffect(() => {
    const container = map.getContainer();
    if (quickMissionMode || measureMode || (addWaypointMode && activeTab === 'planning')) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = '';
    }
    return () => { container.style.cursor = ''; };
  }, [addWaypointMode, activeTab, measureMode, quickMissionMode, map]);

  return null;
}

const TYPE_LABELS = {
  waypoint: 'Waypoint',
  takeoff: 'Takeoff',
  loiter_unlim: 'Loiter',
  loiter_turns: 'Loiter Turns',
  loiter_time: 'Loiter Time',
  roi: 'ROI',
  land: 'Land',
};

// Mission context menu component
function MissionContextMenu({ position, onClose, onAction }) {
  if (!position) return null;

  const menuItems = [
    { label: 'Move Mission', icon: Move, action: 'translate' },
    { label: 'Rotate Mission', icon: RotateCw, action: 'rotate' },
    { label: 'Scale Mission', icon: Maximize2, action: 'scale' },
    { label: 'Reverse Order', icon: ArrowLeftRight, action: 'reverse' },
    { label: 'Generate Pattern...', icon: Grid3X3, action: 'pattern' },
  ];

  return (
    <div
      className="fixed z-[2000] bg-gray-900 border border-gray-700/50 rounded-lg shadow-xl py-1 min-w-[160px]"
      style={{ left: position.x, top: position.y }}
    >
      {menuItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.action}
            onClick={() => {
              onAction(item.action);
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <Icon size={12} className="text-gray-500" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// Mission manipulation overlay
function ManipulationOverlay({ mode, onComplete, onCancel }) {
  const map = useMap();
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const setPlannedWaypoints = useDroneStore((s) => s.setPlannedWaypoints);
  const [startPos, setStartPos] = useState(null);
  const [previewWaypoints, setPreviewWaypoints] = useState([]);
  const [manipValue, setManipValue] = useState(null);

  // Calculate mission center
  const missionCenter = useMemo(() => {
    if (plannedWaypoints.length === 0) return null;
    return centroid(plannedWaypoints.map(w => ({ lat: w.lat, lon: w.lon })));
  }, [plannedWaypoints]);

  useEffect(() => {
    if (!mode || !missionCenter) return;

    const container = map.getContainer();

    if (mode === 'translate') {
      container.style.cursor = 'move';
    } else if (mode === 'rotate') {
      container.style.cursor = 'crosshair';
    } else if (mode === 'scale') {
      container.style.cursor = 'nwse-resize';
    }

    const handleMouseDown = (e) => {
      const latlng = map.mouseEventToLatLng(e);
      setStartPos(latlng);
    };

    const handleMouseMove = (e) => {
      if (!startPos) return;

      const currentPos = map.mouseEventToLatLng(e);

      if (mode === 'translate') {
        const deltaLat = currentPos.lat - startPos.lat;
        const deltaLon = currentPos.lng - startPos.lng;
        const transformed = transformMission(plannedWaypoints, 'translate', { deltaLat, deltaLon });
        setPreviewWaypoints(transformed);
        setManipValue(`${(deltaLat * 111000).toFixed(0)}m, ${(deltaLon * 111000 * Math.cos(missionCenter.lat * Math.PI / 180)).toFixed(0)}m`);
      } else if (mode === 'rotate') {
        // Calculate angle from center to current position
        const dx = currentPos.lng - missionCenter.lon;
        const dy = currentPos.lat - missionCenter.lat;
        const currentAngle = Math.atan2(dx, dy) * 180 / Math.PI;

        const startDx = startPos.lng - missionCenter.lon;
        const startDy = startPos.lat - missionCenter.lat;
        const startAngle = Math.atan2(startDx, startDy) * 180 / Math.PI;

        const angle = currentAngle - startAngle;
        const transformed = transformMission(plannedWaypoints, 'rotate', { angle });
        setPreviewWaypoints(transformed);
        setManipValue(`${angle.toFixed(1)}°`);
      } else if (mode === 'scale') {
        // Calculate scale factor based on distance from center
        const startDist = Math.sqrt(
          Math.pow(startPos.lat - missionCenter.lat, 2) +
          Math.pow(startPos.lng - missionCenter.lon, 2)
        );
        const currentDist = Math.sqrt(
          Math.pow(currentPos.lat - missionCenter.lat, 2) +
          Math.pow(currentPos.lng - missionCenter.lon, 2)
        );
        const factor = startDist > 0.00001 ? currentDist / startDist : 1;
        const transformed = transformMission(plannedWaypoints, 'scale', { factor });
        setPreviewWaypoints(transformed);
        setManipValue(`${(factor * 100).toFixed(0)}%`);
      }
    };

    const handleMouseUp = () => {
      if (previewWaypoints.length > 0) {
        setPlannedWaypoints(previewWaypoints);
      }
      setStartPos(null);
      setPreviewWaypoints([]);
      setManipValue(null);
      onComplete();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setStartPos(null);
        setPreviewWaypoints([]);
        setManipValue(null);
        onCancel();
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      container.style.cursor = '';
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mode, map, startPos, plannedWaypoints, missionCenter, previewWaypoints, setPlannedWaypoints, onComplete, onCancel]);

  if (!mode) return null;

  const previewPositions = previewWaypoints
    .filter(w => w.type !== 'roi')
    .map(w => [w.lat, w.lon]);

  return (
    <>
      {/* Preview polyline */}
      {previewPositions.length > 1 && (
        <Polyline
          positions={previewPositions}
          pathOptions={{ color: '#f59e0b', weight: 2, opacity: 0.8, dashArray: '4 4' }}
        />
      )}

      {/* Mode indicator */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900/90 border border-cyan-500/30 rounded-lg px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-cyan-300 font-medium">
            {mode === 'translate' && 'Move Mode'}
            {mode === 'rotate' && 'Rotate Mode'}
            {mode === 'scale' && 'Scale Mode'}
          </span>
          {manipValue && (
            <span className="text-gray-400 font-mono">{manipValue}</span>
          )}
          <span className="text-gray-500 text-xs ml-2">Click and drag | Esc to cancel</span>
        </div>
      </div>
    </>
  );
}

// Jump arrow visualization for do_jump waypoints
function JumpArrows({ waypoints, opacity = 1 }) {
  const connections = useMemo(() => {
    const result = [];
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (wp.type !== 'do_jump') continue;
      const targetIdx = (wp.param1 || wp.jumpTarget || 1) - 1; // 0-based
      // Find last positioned wp before this jump
      let sourceIdx = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (NAV_TYPES.has(waypoints[j].type) || (waypoints[j].lat && waypoints[j].lon)) {
          sourceIdx = j;
          break;
        }
      }
      if (sourceIdx >= 0 && targetIdx >= 0 && targetIdx < waypoints.length) {
        const target = waypoints[targetIdx];
        const source = waypoints[sourceIdx];
        if (source.lat && source.lon && target.lat && target.lon) {
          result.push({
            source: [source.lat, source.lon],
            target: [target.lat, target.lon],
            repeat: wp.param2 ?? wp.repeat ?? -1,
            key: `jump-${i}`,
          });
        }
      }
    }
    return result;
  }, [waypoints]);

  if (connections.length === 0) return null;

  return (
    <>
      {connections.map(conn => {
        const arcPts = generateArc(conn.source, conn.target);
        const mid = arcPts[Math.floor(arcPts.length / 2)];
        const repeatStr = conn.repeat === -1 ? '\u221E' : conn.repeat;
        const labelIcon = L.divIcon({
          html: `<div style="display:inline-block;white-space:nowrap;background:rgba(236,72,153,0.85);color:white;padding:2px 6px;border-radius:10px;font-size:9px;font-weight:700;font-family:monospace;border:1px solid rgba(236,72,153,0.5);box-shadow:0 2px 6px rgba(0,0,0,0.3)">Jump \u00d7${repeatStr}</div>`,
          className: '',
          iconSize: [0, 0],
          iconAnchor: [0, 8],
        });
        return (
          <React.Fragment key={conn.key}>
            <Polyline
              positions={arcPts}
              pathOptions={{ color: '#ec4899', weight: 2.5, opacity: 0.8 * opacity, dashArray: '6 4' }}
            />
            <Marker position={mid} icon={labelIcon} interactive={false} />
          </React.Fragment>
        );
      })}
    </>
  );
}

// Red violation ring icon for waypoints outside fence
function createViolationRingIcon() {
  return L.divIcon({
    html: `<div style="width:36px;height:36px;border:3px solid #ef4444;border-radius:50%;box-shadow:0 0 8px rgba(239,68,68,0.6),inset 0 0 4px rgba(239,68,68,0.3);pointer-events:none"></div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

// Isolated component for planned waypoint markers - prevents telemetry re-renders from
// recreating marker DOM (which kills in-progress drags)
function PlannedWaypointMarkers({ onContextMenu }) {
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const activeTab = useDroneStore((s) => s.activeTab);
  const updateWaypoint = useDroneStore((s) => s.updateWaypoint);
  const addJumpWaypoint = useDroneStore((s) => s.addJumpWaypoint);
  const patternConfig = useDroneStore((s) => s.patternConfig);
  const coordFormat = useDroneStore((s) => s.coordFormat);
  const setSelectedWaypointId = useDroneStore((s) => s.setSelectedWaypointId);
  const setPlanSubTab = useDroneStore((s) => s.setPlanSubTab);
  const setSidebarCollapsed = useDroneStore((s) => s.setSidebarCollapsed);
  const addWaypointMode = useDroneStore((s) => s.addWaypointMode);
  const missionViolations = useDroneStore((s) => s.missionViolations);

  const isPlanning = activeTab === 'planning';
  const plannedOpacity = isPlanning ? 1 : 0.3;

  const plannedNavPositions = plannedWaypoints
    .filter((w) => NAV_TYPES.has(w.type) && w.type !== 'roi')
    .map((w) => [w.lat, w.lon]);

  // Pattern preview positions
  const previewPositions = patternConfig.preview
    .filter((w) => w.type !== 'roi')
    .map((w) => [w.lat, w.lon]);

  // Build a set of violating waypoint indices for fast lookup
  const violatingIndices = useMemo(
    () => new Set(missionViolations.map((v) => v.waypointIndex)),
    [missionViolations]
  );

  // Memoize icons so they only change when waypoints change
  const icons = useMemo(
    () => plannedWaypoints.map((wp, i) => createWaypointIcon(i, wp.type)),
    [plannedWaypoints]
  );

  const violationIcon = useMemo(() => createViolationRingIcon(), []);

  return (
    <>
      {plannedWaypoints.map((wp, i) => {
        // Skip non-positioned waypoints (do_jump, do_set_servo)
        if (!MARKER_COLORS[wp.type]) return null;
        const hasViolation = violatingIndices.has(i);
        return (
          <React.Fragment key={wp.id}>
            <Marker
              position={[wp.lat, wp.lon]}
              icon={icons[i]}
              draggable={isPlanning}
              autoPan={false}
              opacity={plannedOpacity}
              eventHandlers={{
                dragend: (e) => {
                  const pos = e.target.getLatLng();
                  updateWaypoint(wp.id, { lat: pos.lat, lon: pos.lng });
                },
                click: () => {
                  if (isPlanning) {
                    setPlanSubTab('mission');
                    setSidebarCollapsed(false);
                    setSelectedWaypointId(wp.id);
                  }
                },
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{TYPE_LABELS[wp.type] || 'Waypoint'} {i + 1}</div>
                  <div>Alt: {wp.alt}m</div>
                  <div className="text-xs opacity-70">{formatCoord(wp.lat, wp.lon, coordFormat, 6)}</div>
                  {hasViolation && (
                    <div style={{ color: '#ef4444', fontSize: '10px', fontWeight: 600, marginTop: '4px' }}>
                      Outside fence boundary
                    </div>
                  )}
                  {isPlanning && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addJumpWaypoint(i + 1);
                      }}
                      style={{
                        marginTop: '6px',
                        padding: '4px 10px',
                        fontSize: '10px',
                        fontWeight: 600,
                        background: '#ec4899',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        width: '100%',
                      }}
                    >
                      Add Jump to WP {i + 1}
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
            {/* Red violation ring overlay */}
            {hasViolation && (
              <Marker
                position={[wp.lat, wp.lon]}
                icon={violationIcon}
                interactive={false}
                opacity={plannedOpacity}
              />
            )}
          </React.Fragment>
        );
      })}

      {plannedNavPositions.length > 1 && (
        <Polyline
          positions={plannedNavPositions}
          pathOptions={{ color: '#3b82f6', weight: 2, opacity: 0.5 * plannedOpacity, dashArray: '8 4' }}
          eventHandlers={{
            contextmenu: (e) => {
              if (isPlanning && onContextMenu) {
                e.originalEvent.preventDefault();
                onContextMenu({
                  lat: e.latlng.lat,
                  lon: e.latlng.lng,
                  x: e.originalEvent.clientX,
                  y: e.originalEvent.clientY,
                });
              }
            },
          }}
        />
      )}

      {/* Jump arrows */}
      <JumpArrows waypoints={plannedWaypoints} opacity={plannedOpacity} />

      {/* Pattern preview */}
      {previewPositions.length > 1 && (
        <Polyline
          positions={previewPositions}
          pathOptions={{ color: '#f59e0b', weight: 2, opacity: 0.7, dashArray: '4 4' }}
        />
      )}
    </>
  );
}

// Isolated component for fence vertex markers
function FenceVertexMarkers() {
  const plannedFence = useDroneStore((s) => s.plannedFence);
  const activeTab = useDroneStore((s) => s.activeTab);
  const planSubTab = useDroneStore((s) => s.planSubTab);
  const updateFenceVertex = useDroneStore((s) => s.updateFenceVertex);
  const coordFormat = useDroneStore((s) => s.coordFormat);

  const isPlanning = activeTab === 'planning';
  const plannedOpacity = isPlanning ? 1 : 0.3;
  const fencePositions = plannedFence.map((v) => [v.lat, v.lon]);

  const icons = useMemo(
    () => plannedFence.map((_, i) => createFenceVertexIcon(i)),
    [plannedFence]
  );

  return (
    <>
      {fencePositions.length >= 3 && (
        <Polygon
          positions={fencePositions}
          pathOptions={{
            color: '#f59e0b',
            weight: 2,
            opacity: 0.7 * plannedOpacity,
            fillColor: '#f59e0b',
            fillOpacity: 0.08,
            dashArray: '6 4',
          }}
        />
      )}

      {isPlanning && planSubTab === 'fence' && plannedFence.map((v, i) => (
        <Marker
          key={v.id}
          position={[v.lat, v.lon]}
          icon={icons[i]}
          draggable={true}
          autoPan={false}
          eventHandlers={{
            dragend: (e) => {
              const pos = e.target.getLatLng();
              updateFenceVertex(v.id, { lat: pos.lat, lon: pos.lng });
            },
          }}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">Fence Vertex {i + 1}</div>
              <div className="text-xs opacity-70">{formatCoord(v.lat, v.lon, coordFormat, 6)}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

// Drone fence downloaded from vehicle (read-only display)
function DroneFenceDisplay() {
  const droneFence = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.droneFence ?? EMPTY_ARRAY : EMPTY_ARRAY);

  if (!droneFence || droneFence.length === 0) return null;

  // Separate circular and polygon fences
  // 5003 = MAV_CMD_NAV_FENCE_CIRCLE_INCLUSION
  // 5001 = MAV_CMD_NAV_FENCE_POLYGON_VERTEX_INCLUSION
  const circularFences = droneFence.filter((f) => f.command === 5003);
  const polygonVertices = droneFence.filter((f) => f.command === 5001);

  const polygonPositions = polygonVertices.map((v) => [v.lat, v.lon]);

  return (
    <>
      {/* Circular fences */}
      {circularFences.map((fence, i) => (
        <Circle
          key={`drone-fence-circle-${i}`}
          center={[fence.lat, fence.lon]}
          radius={fence.param1} // param1 = radius
          pathOptions={{
            color: '#10b981', // emerald - different from planned (amber)
            weight: 2,
            opacity: 0.7,
            fillColor: '#10b981',
            fillOpacity: 0.08,
            dashArray: '8 4',
          }}
        />
      ))}

      {/* Polygon fence */}
      {polygonPositions.length >= 3 && (
        <Polygon
          positions={polygonPositions}
          pathOptions={{
            color: '#10b981',
            weight: 2,
            opacity: 0.7,
            fillColor: '#10b981',
            fillOpacity: 0.08,
            dashArray: '8 4',
          }}
        />
      )}
    </>
  );
}

// Pattern bounds polygon for lawnmower area selection
function PatternBoundsPolygon() {
  const patternBounds = useDroneStore((s) => s.patternBounds);
  const patternDrawMode = useDroneStore((s) => s.patternDrawMode);
  const updatePatternBoundsVertex = useDroneStore((s) => s.updatePatternBoundsVertex);
  const removePatternBoundsVertex = useDroneStore((s) => s.removePatternBoundsVertex);

  const positions = patternBounds.map((v) => [v.lat, v.lon]);

  if (patternBounds.length === 0) return null;

  return (
    <>
      {positions.length >= 3 && (
        <Polygon
          positions={positions}
          pathOptions={{
            color: '#ec4899',
            weight: 2,
            opacity: 0.8,
            fillColor: '#ec4899',
            fillOpacity: 0.15,
            dashArray: '8 4',
          }}
        />
      )}
      {positions.length >= 2 && positions.length < 3 && (
        <Polyline
          positions={positions}
          pathOptions={{ color: '#ec4899', weight: 2, opacity: 0.8, dashArray: '8 4' }}
        />
      )}

      {patternDrawMode && patternBounds.map((v, i) => (
        <Marker
          key={v.id}
          position={[v.lat, v.lon]}
          icon={L.divIcon({
            className: 'pattern-vertex-marker',
            html: `<div style="
              width: 18px; height: 18px;
              background: #ec4899;
              border: 2px solid white;
              border-radius: 50%;
              display: flex; align-items: center; justify-content: center;
              font-size: 9px; font-weight: bold; color: white;
              box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ">${i + 1}</div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          })}
          draggable={true}
          autoPan={false}
          eventHandlers={{
            dragend: (e) => {
              const pos = e.target.getLatLng();
              updatePatternBoundsVertex(v.id, { lat: pos.lat, lon: pos.lng });
            },
            contextmenu: (e) => {
              e.originalEvent.preventDefault();
              removePatternBoundsVertex(v.id);
            },
          }}
        />
      ))}
    </>
  );
}

// Drone mission markers with "Start From Here" in fly mode
function DroneMissionMarkers() {
  const droneMission = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.droneMission ?? EMPTY_ARRAY : EMPTY_ARRAY);
  const activeTab = useDroneStore((s) => s.activeTab);
  const addAlert = useDroneStore((s) => s.addAlert);
  const missionSeq = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.mission_seq : -1) ?? -1;
  const autopilot = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.autopilot : 'unknown') || 'unknown';
  const coordFormat = useDroneStore((s) => s.coordFormat);

  const isFlying = activeTab === 'flying';
  const droneOpacity = isFlying ? 1 : 0.3;

  // Convert mission_seq to 0-based index
  // ArduPilot: seq 0 = home, mission items start at seq 1 -> index = seq - 1
  // PX4: seq 0 = first mission item -> index = seq
  const isArdupilot = autopilot === 'ardupilot';
  const currentWaypointIndex = missionSeq >= 0 ? (isArdupilot ? missionSeq - 1 : missionSeq) : -1;

  const droneNavPositions = droneMission
    .filter((w) => (w.item_type || 'waypoint') !== 'roi')
    .map((w) => [w.lat, w.lon]);

  const handleSetCurrent = useCallback(async (index) => {
    // Send 0-based index, backend will convert to correct seq based on autopilot type
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
      {droneMission.map((wp, i) => (
        <Marker
          key={`dm-${i}`}
          position={[wp.lat, wp.lon]}
          icon={createDroneMissionIcon(i, wp.item_type || 'waypoint', i === currentWaypointIndex)}
          opacity={droneOpacity}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">Drone {TYPE_LABELS[wp.item_type] || 'Waypoint'} {i + 1}</div>
              <div>Alt: {wp.alt}m</div>
              <div className="text-xs opacity-70">{formatCoord(wp.lat, wp.lon, coordFormat, 6)}</div>
              {isFlying && (
                <button
                  onClick={() => handleSetCurrent(i)}
                  style={{
                    marginTop: '6px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: '#06b6d4',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  Set as Current
                </button>
              )}
            </div>
          </Popup>
        </Marker>
      ))}

      {droneNavPositions.length > 1 && (
        <Polyline
          positions={droneNavPositions}
          pathOptions={{ color: '#22c55e', weight: 2, opacity: 0.5 * droneOpacity, dashArray: '6 4' }}
        />
      )}
    </>
  );
}

// Servo group quick action buttons
function ServoGroupButtons() {
  const servoGroups = useDroneStore((s) => s.servoGroups);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const addAlert = useDroneStore((s) => s.addAlert);
  const [groupStates, setGroupStates] = React.useState({});

  if (!activeDroneId || servoGroups.length === 0) return null;

  const toggleGroup = async (group) => {
    const currentState = groupStates[group.id] || 'closed';
    const isOpen = currentState === 'open';
    const pwm = isOpen ? group.closePwm : group.openPwm;

    try {
      await fetch(droneApi('/api/servo/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servo: group.servo, pwm }),
      });
      setGroupStates(prev => ({ ...prev, [group.id]: isOpen ? 'closed' : 'open' }));
      addAlert(`${group.name}: ${isOpen ? 'Closed' : 'Opened'}`, 'info');
    } catch (err) {
      addAlert(`Servo command failed: ${err.message}`, 'error');
    }
  };

  return (
    <div className="absolute top-12 right-3 z-[1000] flex flex-col gap-1.5">
      {servoGroups.map((group) => {
        const isOpen = groupStates[group.id] === 'open';
        return (
          <button
            key={group.id}
            onClick={() => toggleGroup(group)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all border backdrop-blur-md shadow-lg ${
              isOpen
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : 'bg-gray-900/60 text-gray-400 hover:text-gray-200 border-gray-700/40'
            }`}
          >
            {group.name}
            {group.hotkey && (
              <span className="ml-1.5 text-[9px] opacity-60">({group.hotkey.toUpperCase()})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Target icon for fly mode click
const flyTargetIcon = L.divIcon({
  html: '<div style="width:12px;height:12px;border:2px solid #f97316;border-radius:50%;background:rgba(249,115,22,0.3)"></div>',
  className: '',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

// Measure overlay: line + distance/bearing label
function MeasureOverlay() {
  const measurePoints = useDroneStore((s) => s.measurePoints);

  if (measurePoints.length === 0) return null;

  const dotIcon = (color = '#f97316') => L.divIcon({
    html: `<div style="width:10px;height:10px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    className: '',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });

  return (
    <>
      {measurePoints.map((p, i) => (
        <Marker key={`measure-${i}`} position={[p.lat, p.lon]} icon={dotIcon()} />
      ))}

      {measurePoints.length === 2 && (() => {
        const [a, b] = measurePoints;
        const dist = haversineDistance(a.lat, a.lon, b.lat, b.lon);
        const brng = bearing(a.lat, a.lon, b.lat, b.lon);
        const midLat = (a.lat + b.lat) / 2;
        const midLon = (a.lon + b.lon) / 2;
        const distStr = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`;

        const labelIcon = L.divIcon({
          html: `<div style="display:inline-block;white-space:nowrap;background:rgba(15,23,42,0.85);color:#fb923c;padding:3px 7px;border-radius:4px;font-size:11px;font-weight:600;font-family:monospace;border:1px solid rgba(249,115,22,0.4);box-shadow:0 2px 8px rgba(0,0,0,0.3)">${distStr} | ${brng.toFixed(0)}&deg;</div>`,
          className: '',
          iconSize: [0, 0],
          iconAnchor: [0, -8],
        });

        return (
          <>
            <Polyline
              positions={[[a.lat, a.lon], [b.lat, b.lon]]}
              pathOptions={{ color: '#f97316', weight: 2.5, opacity: 0.9, dashArray: '6 4' }}
            />
            <Marker position={[midLat, midLon]} icon={labelIcon} />
          </>
        );
      })()}
    </>
  );
}

// Fly mode click target marker with Go To / Look At / Set Home
function FlyClickTarget() {
  const flyClickTarget = useDroneStore((s) => s.flyClickTarget);
  const clearFlyClickTarget = useDroneStore((s) => s.clearFlyClickTarget);
  const setHomePosition = useDroneStore((s) => s.setHomePosition);
  const startQuickMission = useDroneStore((s) => s.startQuickMission);
  const alt = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.alt : 0) || 0;
  const addAlert = useDroneStore((s) => s.addAlert);
  const addGcsLog = useDroneStore((s) => s.addGcsLog);

  const handleGoto = useCallback(async () => {
    const target = useDroneStore.getState().flyClickTarget;
    if (!target) return;
    try {
      const res = await fetch(droneApi('/api/goto'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: target.lat, lon: target.lon, alt }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Go To failed', 'error');
        addGcsLog(`Go To: ${data.error || 'failed'}`, 'error');
      } else {
        addAlert('Going to location', 'success');
        addGcsLog(`Go To location at ${alt.toFixed(0)}m`, 'info');
      }
    } catch (err) {
      addAlert('Go To failed: ' + err.message, 'error');
      addGcsLog(`Go To: ${err.message}`, 'error');
    }
    clearFlyClickTarget();
  }, [alt, addAlert, addGcsLog, clearFlyClickTarget]);

  const handleRoi = useCallback(async () => {
    const target = useDroneStore.getState().flyClickTarget;
    if (!target) return;
    try {
      const res = await fetch(droneApi('/api/roi'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: target.lat, lon: target.lon }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Look At failed', 'error');
        addGcsLog(`Look At: ${data.error || 'failed'}`, 'error');
      } else {
        addAlert('Looking at location', 'success');
        addGcsLog('Look At (ROI) set', 'info');
      }
    } catch (err) {
      addAlert('Look At failed: ' + err.message, 'error');
      addGcsLog(`Look At: ${err.message}`, 'error');
    }
    clearFlyClickTarget();
  }, [addAlert, addGcsLog, clearFlyClickTarget]);

  const handleSetHome = useCallback(async () => {
    const target = useDroneStore.getState().flyClickTarget;
    const currentHome = useDroneStore.getState().homePosition;
    const altMsl = useDroneStore.getState().telemetry.alt_msl || 0;
    if (!target) return;

    // Try to get ground elevation from Open-Meteo API
    let alt = altMsl; // Default fallback
    try {
      const elevRes = await fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${target.lat}&longitude=${target.lon}`
      );
      const elevData = await elevRes.json();
      if (elevData.elevation && elevData.elevation[0] !== undefined) {
        alt = elevData.elevation[0];
      } else if (currentHome && currentHome.alt) {
        // Fall back to current home altitude
        alt = currentHome.alt;
      }
    } catch {
      // If terrain fetch fails, use current home alt or alt_msl
      if (currentHome && currentHome.alt) {
        alt = currentHome.alt;
      }
    }

    try {
      const res = await fetch(droneApi('/api/home/set'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: target.lat, lon: target.lon, alt }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Set Home failed', 'error');
        addGcsLog(`Set Home: ${data.error || 'failed'}`, 'error');
      } else {
        setHomePosition({ lat: target.lat, lon: target.lon, alt });
        addAlert(`Home position set (alt: ${alt.toFixed(1)}m)`, 'success');
        addGcsLog(`Home set at ${alt.toFixed(1)}m MSL`, 'info');
      }
    } catch (err) {
      addAlert('Set Home failed: ' + err.message, 'error');
      addGcsLog(`Set Home: ${err.message}`, 'error');
    }
    clearFlyClickTarget();
  }, [addAlert, addGcsLog, clearFlyClickTarget, setHomePosition]);

  const handleQuickMission = useCallback(() => {
    const target = useDroneStore.getState().flyClickTarget;
    if (!target) return;
    startQuickMission(target.lat, target.lon);
    addGcsLog('Quick Mission mode started', 'info');
  }, [startQuickMission, addGcsLog]);

  if (!flyClickTarget) return null;

  const btnStyle = {
    flex: 1,
    padding: '6px 8px',
    fontSize: '10px',
    fontWeight: 600,
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    textAlign: 'center',
  };

  return (
    <Marker position={[flyClickTarget.lat, flyClickTarget.lon]} icon={flyTargetIcon}>
      <Popup eventHandlers={{ remove: clearFlyClickTarget }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px' }}>
          <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px', textAlign: 'center' }}>
            {formatCoord(flyClickTarget.lat, flyClickTarget.lon, useDroneStore.getState().coordFormat, 6)}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={handleGoto} style={{ ...btnStyle, background: '#06b6d4' }}>
              Go To
            </button>
            <button onClick={handleRoi} style={{ ...btnStyle, background: '#f59e0b' }}>
              Look At
            </button>
          </div>
          <button onClick={handleSetHome} style={{ ...btnStyle, background: '#10b981' }}>
            Set Home/Return
          </button>
          <button onClick={handleQuickMission} style={{ ...btnStyle, background: '#8b5cf6' }}>
            Quick Mission
          </button>
        </div>
      </Popup>
    </Marker>
  );
}

// Quick mission waypoint markers (fly mode fast mission)
function QuickMissionMarkers() {
  const quickMissionMode = useDroneStore((s) => s.quickMissionMode);
  const quickMissionWaypoints = useDroneStore((s) => s.quickMissionWaypoints);
  const addQuickMissionJump = useDroneStore((s) => s.addQuickMissionJump);

  if (!quickMissionMode || quickMissionWaypoints.length === 0) return null;

  // Only position-based entries for markers / polyline
  const navWaypoints = quickMissionWaypoints.filter(w => w.type !== 'do_jump');
  const positions = navWaypoints.map(w => [w.lat, w.lon]);

  // Build full list with positions for JumpArrows (map 1-based index to the full array)
  const jumpArrowData = quickMissionWaypoints.map(wp => {
    if (wp.type === 'do_jump') {
      return { ...wp, param1: wp.jumpTarget, param2: wp.repeat };
    }
    return { ...wp, type: wp.type || 'waypoint' };
  });

  return (
    <>
      {quickMissionWaypoints.map((wp, i) => {
        if (wp.type === 'do_jump') return null;
        return (
          <Marker
            key={wp.id}
            position={[wp.lat, wp.lon]}
            icon={createWaypointIcon(i, 'waypoint')}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">Quick WP {i + 1}</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    addQuickMissionJump(i + 1);
                  }}
                  style={{
                    marginTop: '4px',
                    padding: '4px 10px',
                    fontSize: '10px',
                    fontWeight: 600,
                    background: '#ec4899',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  Add Jump to WP {i + 1}
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
      {positions.length > 1 && (
        <Polyline
          positions={positions}
          pathOptions={{ color: '#8b5cf6', weight: 2.5, opacity: 0.8, dashArray: '6 3' }}
        />
      )}
      <JumpArrows waypoints={jumpArrowData} />
    </>
  );
}

// Quick mission bottom overlay bar (send / undo / cancel)
function QuickMissionOverlay() {
  const quickMissionMode = useDroneStore((s) => s.quickMissionMode);
  const quickMissionWaypoints = useDroneStore((s) => s.quickMissionWaypoints);
  const cancelQuickMission = useDroneStore((s) => s.cancelQuickMission);
  const removeLastQuickMissionWaypoint = useDroneStore((s) => s.removeLastQuickMissionWaypoint);
  const alt = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.alt : 0) || 0;
  const addAlert = useDroneStore((s) => s.addAlert);
  const addGcsLog = useDroneStore((s) => s.addGcsLog);
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    const store = useDroneStore.getState();
    const wps = store.quickMissionWaypoints;
    const activeDrone = store.activeDroneId ? store.drones[store.activeDroneId] : null;
    const currentAlt = activeDrone?.telemetry?.alt || 0;
    if (wps.length === 0) return;

    setSending(true);
    const waypoints = wps.map(wp => {
      if (wp.type === 'do_jump') {
        return {
          lat: 0, lon: 0, alt: 0,
          item_type: 'do_jump',
          param1: wp.jumpTarget,
          param2: wp.repeat ?? -1,
        };
      }
      return {
        lat: wp.lat,
        lon: wp.lon,
        alt: currentAlt,
        item_type: 'waypoint',
      };
    });

    try {
      const res = await fetch(droneApi('/api/mission/upload'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Quick mission upload failed', 'error');
        addGcsLog(`Quick mission: ${data.error || 'upload failed'}`, 'error');
      } else {
        addAlert(`Quick mission uploaded (${wps.length} pts)`, 'success');
        addGcsLog(`Quick mission uploaded: ${wps.length} pts at ${currentAlt.toFixed(0)}m`, 'info');

        // Save as mission in savedMissions
        const now = Date.now();
        const navCount = wps.filter(w => w.type !== 'do_jump').length;
        const missionWaypoints = wps.map((wp, i) => {
          if (wp.type === 'do_jump') {
            return {
              lat: 0, lon: 0, alt: 0,
              id: now + i, type: 'do_jump',
              param1: wp.jumpTarget, param2: wp.repeat ?? -1, param3: 0, param4: 0,
            };
          }
          return {
            lat: wp.lat, lon: wp.lon, alt: currentAlt,
            id: now + i, type: 'waypoint',
            param1: 0, param2: 2, param3: 0, param4: 0,
          };
        });
        const newMission = {
          id: now,
          name: `Quick ${new Date().toLocaleTimeString('en-GB', { hour12: false })}`,
          waypoints: missionWaypoints,
          defaults: { alt: currentAlt, speed: store.defaultSpeed },
          createdAt: now,
          updatedAt: now,
        };
        const updated = [...store.savedMissions, newMission];
        localStorage.setItem('pyxus-saved-missions', JSON.stringify(updated));
        useDroneStore.setState({ savedMissions: updated });

        // Download mission from drone to sync display
        try {
          const dlRes = await fetch(droneApi('/api/mission/download'));
          const dlData = await dlRes.json();
          if (dlData.status === 'ok' && store.activeDroneId) {
            useDroneStore.getState().setDroneMission(store.activeDroneId, dlData.waypoints || []);
          }
        } catch {}

        store.cancelQuickMission();
      }
    } catch (err) {
      addAlert('Quick mission failed: ' + err.message, 'error');
      addGcsLog(`Quick mission: ${err.message}`, 'error');
    }
    setSending(false);
  }, [addAlert, addGcsLog]);

  if (!quickMissionMode) return null;

  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[1001] bg-gray-900/80 backdrop-blur-md rounded-lg border border-violet-500/30 shadow-2xl px-4 py-2.5 flex items-center gap-3">
      <Zap size={14} className="text-violet-400" />
      <span className="text-violet-300 text-xs font-semibold">Quick Mission</span>
      <span className="text-gray-400 text-xs tabular-nums">
        {quickMissionWaypoints.filter(w => w.type !== 'do_jump').length} pts
        {quickMissionWaypoints.some(w => w.type === 'do_jump') && (
          <span className="text-pink-400"> +{quickMissionWaypoints.filter(w => w.type === 'do_jump').length} jump</span>
        )}
        <span> @ {alt.toFixed(0)}m</span>
      </span>
      <div className="w-px h-4 bg-gray-700/30" />
      <div className="flex items-center gap-1.5">
        <button
          onClick={removeLastQuickMissionWaypoint}
          disabled={quickMissionWaypoints.length <= 1}
          className="px-2 py-1 rounded text-[10px] font-medium bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 border border-gray-700/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          Undo
        </button>
        <button
          onClick={handleSend}
          disabled={sending}
          className="px-3 py-1 rounded text-[10px] font-semibold bg-violet-600/80 hover:bg-violet-500/80 text-white border border-violet-500/30 transition-all disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
        <button
          onClick={cancelQuickMission}
          className="px-2 py-1 rounded text-[10px] font-medium bg-red-950/50 hover:bg-red-900/50 text-red-400 border border-red-800/30 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function MapView() {
  const drones = useDroneStore((s) => s.drones);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const setActiveDrone = useDroneStore((s) => s.setActiveDrone);
  const droneVisibility = useDroneStore((s) => s.droneVisibility);
  const geofence = useDroneStore((s) => s.geofence);
  const followDrone = useDroneStore((s) => s.followDrone);
  const setFollowDrone = useDroneStore((s) => s.setFollowDrone);
  const activeTab = useDroneStore((s) => s.activeTab);
  const addWaypointMode = useDroneStore((s) => s.addWaypointMode);
  const toggleAddWaypointMode = useDroneStore((s) => s.toggleAddWaypointMode);
  const planSubTab = useDroneStore((s) => s.planSubTab);
  const homePosition = useDroneStore((s) => s.homePosition);
  const gcsPosition = useDroneStore((s) => s.gcsPosition);
  const setPatternConfig = useDroneStore((s) => s.setPatternConfig);
  const reverseWaypoints = useDroneStore((s) => s.reverseWaypoints);
  const measureMode = useDroneStore((s) => s.measureMode);
  const setMeasureMode = useDroneStore((s) => s.setMeasureMode);
  const clearMeasure = useDroneStore((s) => s.clearMeasure);
  const coordFormat = useDroneStore((s) => s.coordFormat);

  // Context menu and manipulation state
  const [contextMenu, setContextMenu] = useState(null);
  const [manipMode, setManipMode] = useState(null);

  // Stable color assignment: map droneId -> palette index (active drone always gets cyan = index 0)
  const droneColorMap = useMemo(() => {
    const ids = Object.keys(drones);
    const map = {};
    let colorIdx = 1; // start at 1 because 0 is reserved for active
    for (const id of ids) {
      if (id === activeDroneId) {
        map[id] = 0; // active always cyan
      } else {
        map[id] = colorIdx % DRONE_COLORS.length;
        colorIdx++;
      }
    }
    return map;
  }, [drones, activeDroneId]);

  // Active drone telemetry
  const activeDrone = activeDroneId ? drones[activeDroneId] : null;
  const activeTelemetry = activeDrone?.telemetry || INITIAL_TELEMETRY;
  const hasPosition = activeTelemetry.lat !== 0 && activeTelemetry.lon !== 0;
  const hasHome = homePosition && homePosition.lat !== 0 && homePosition.lon !== 0;
  const hasGcs = gcsPosition && gcsPosition.lat !== 0 && gcsPosition.lon !== 0;

  const isPlanning = activeTab === 'planning';
  const isConnected = !!activeDroneId;

  const center = hasPosition ? [activeTelemetry.lat, activeTelemetry.lon] : [0, 0];
  const zoom = hasPosition ? 17 : 3;

  // Handle context menu actions
  const handleContextAction = useCallback((action) => {
    switch (action) {
      case 'translate':
      case 'rotate':
      case 'scale':
        setManipMode(action);
        break;
      case 'reverse':
        reverseWaypoints();
        break;
      case 'pattern':
        setPatternConfig({ visible: true });
        break;
    }
  }, [reverseWaypoints, setPatternConfig]);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full"
        zoomControl={true}
        attributionControl={true}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} maxZoom={19} />

        <MapResizer />
        <DroneFollower />
        <GcsLocator />
        <MapClickHandler />
        <AddModeCursor />

        {/* All drone trails + markers + non-active drone missions */}
        {Object.entries(drones).map(([droneId, drone]) => {
          const t = drone.telemetry || INITIAL_TELEMETRY;
          const isActive = droneId === activeDroneId;
          const dHasPos = t.lat !== 0 && t.lon !== 0;
          const dYawDeg = t.heading || (t.yaw * 180) / Math.PI;
          const cIdx = droneColorMap[droneId] ?? 0;
          const fillColor = DRONE_COLORS[cIdx];
          const strokeColor = DRONE_STROKES[cIdx];
          const vis = droneVisibility[droneId] || { trail: true, mission: true, fence: true };

          // Non-active drone mission polyline
          const nonActiveMission = !isActive && vis.mission && drone.droneMission?.length > 1;
          const missionNavPositions = nonActiveMission
            ? drone.droneMission.filter(w => (w.item_type || 'waypoint') !== 'roi').map(w => [w.lat, w.lon])
            : [];

          // Non-active drone fence
          const nonActiveFence = !isActive && vis.fence && drone.droneFence?.length > 0;

          return (
            <React.Fragment key={droneId}>
              {/* Trail (respect visibility toggle) */}
              {vis.trail && drone.trail.length > 1 && (
                <Polyline
                  positions={drone.trail}
                  pathOptions={{ color: fillColor, weight: 2, opacity: isActive ? 0.6 : 0.4 }}
                />
              )}

              {/* Non-active drone mission (semi-transparent polyline in drone color) */}
              {nonActiveMission && missionNavPositions.length > 1 && (
                <Polyline
                  positions={missionNavPositions}
                  pathOptions={{ color: fillColor, weight: 2, opacity: 0.35, dashArray: '6 4' }}
                />
              )}

              {/* Non-active drone fence */}
              {nonActiveFence && (() => {
                const circularFences = drone.droneFence.filter(f => f.command === 5003);
                const polyVerts = drone.droneFence.filter(f => f.command === 5001);
                const polyPositions = polyVerts.map(v => [v.lat, v.lon]);
                return (
                  <>
                    {circularFences.map((fence, i) => (
                      <Circle
                        key={`naf-circle-${droneId}-${i}`}
                        center={[fence.lat, fence.lon]}
                        radius={fence.param1}
                        pathOptions={{ color: fillColor, weight: 1.5, opacity: 0.3, fillColor: fillColor, fillOpacity: 0.05, dashArray: '8 4' }}
                      />
                    ))}
                    {polyPositions.length >= 3 && (
                      <Polygon
                        positions={polyPositions}
                        pathOptions={{ color: fillColor, weight: 1.5, opacity: 0.3, fillColor: fillColor, fillOpacity: 0.05, dashArray: '8 4' }}
                      />
                    )}
                  </>
                );
              })()}

              {/* Drone marker */}
              {dHasPos && (
                <>
                  <Marker
                    position={[t.lat, t.lon]}
                    icon={createDroneIcon(dYawDeg, fillColor, strokeColor)}
                    zIndexOffset={isActive ? 1000 : 500}
                    eventHandlers={{
                      click: () => { if (!isActive) setActiveDrone(droneId); },
                    }}
                  >
                    <Popup>
                      <div className="text-xs font-mono space-y-0.5">
                        <div className="font-semibold text-[11px] mb-1" style={{color: fillColor}}>{drone.name}</div>
                        <div><span style={{color:'#94a3b8'}}>ALT</span> <span style={{color:'#e2e8f0'}}>{t.alt.toFixed(1)}m</span></div>
                        <div><span style={{color:'#94a3b8'}}>GS</span> <span style={{color:'#e2e8f0'}}>{t.groundspeed.toFixed(1)} m/s</span></div>
                        <div><span style={{color:'#94a3b8'}}>HDG</span> <span style={{color:'#e2e8f0'}}>{Math.round(dYawDeg)}&deg;</span></div>
                        <div style={{borderTop:'1px solid rgba(100,116,139,0.3)',marginTop:'4px',paddingTop:'4px',fontSize:'9px',color:'#64748b'}}>{formatCoord(t.lat, t.lon, coordFormat, 6)}</div>
                      </div>
                    </Popup>
                  </Marker>
                  {/* Name label */}
                  <Marker
                    position={[t.lat, t.lon]}
                    icon={createDroneNameIcon(drone.name, isActive, fillColor)}
                    interactive={false}
                  />
                </>
              )}
            </React.Fragment>
          );
        })}

        {/* Home position marker */}
        {hasHome && (
          <Marker position={[homePosition.lat, homePosition.lon]} icon={homeIcon}>
            <Popup>
              <div className="text-xs font-mono space-y-0.5">
                <div className="font-semibold text-[11px] mb-1" style={{color:'#10b981'}}>Home / Return</div>
                <div style={{fontSize:'9px',color:'#64748b'}}>{formatCoord(homePosition.lat, homePosition.lon, coordFormat, 6)}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* GCS location marker */}
        {hasGcs && (
          <>
            <Circle
              center={[gcsPosition.lat, gcsPosition.lon]}
              radius={gcsPosition.accuracy || 0}
              pathOptions={{ color: '#6366f1', weight: 1, opacity: 0.3, fillColor: '#6366f1', fillOpacity: 0.08 }}
            />
            <Marker position={[gcsPosition.lat, gcsPosition.lon]} icon={gcsIcon}>
              <Popup>
                <div className="text-xs font-mono space-y-0.5">
                  <div className="font-semibold text-[11px] mb-1" style={{color:'#6366f1'}}>GCS Location</div>
                  <div style={{fontSize:'9px',color:'#64748b'}}>{formatCoord(gcsPosition.lat, gcsPosition.lon, coordFormat, 6)}</div>
                  {gcsPosition.accuracy && <div style={{fontSize:'9px',color:'#64748b'}}>Accuracy: {Math.round(gcsPosition.accuracy)}m</div>}
                </div>
              </Popup>
            </Marker>
          </>
        )}

        {/* Planned waypoint markers + polyline (isolated from telemetry re-renders) */}
        <PlannedWaypointMarkers onContextMenu={setContextMenu} />

        {/* Mission manipulation overlay */}
        <ManipulationOverlay
          mode={manipMode}
          onComplete={() => setManipMode(null)}
          onCancel={() => setManipMode(null)}
        />

        {/* Drone mission markers + polyline (with Start From Here in fly mode) */}
        <DroneMissionMarkers />

        {/* Geofence circle (from local UI) */}
        {geofence.enabled && geofence.lat !== 0 && geofence.lon !== 0 && (
          <Circle
            center={[geofence.lat, geofence.lon]}
            radius={geofence.radius}
            pathOptions={{
              color: '#f59e0b',
              weight: 2,
              opacity: 0.6,
              fillColor: '#f59e0b',
              fillOpacity: 0.05,
              dashArray: '6 4',
            }}
          />
        )}

        {/* Drone fence downloaded from vehicle */}
        <DroneFenceDisplay />

        {/* Fence vertex markers + polygon (for planning, isolated from telemetry re-renders) */}
        <FenceVertexMarkers />

        {/* Pattern bounds polygon for lawnmower area drawing */}
        <PatternBoundsPolygon />

        {/* Fly mode click target */}
        <FlyClickTarget />

        {/* Quick mission markers */}
        <QuickMissionMarkers />

        {/* Measure overlay */}
        <MeasureOverlay />

        {/* Weather map overlay */}
        <WeatherMapLayer />
      </MapContainer>

      {/* Manual control overlay */}
      <ManualControlOverlay />

      {/* Multi-drone list overlay (top-left, below zoom controls) */}
      <DroneListOverlay droneColorMap={droneColorMap} />

      {/* Follow button */}
      <button
        onClick={() => setFollowDrone(!followDrone)}
        className={`absolute top-3 right-3 z-[1000] px-3 py-1.5 rounded-md text-xs font-semibold transition-all border backdrop-blur-md ${
          followDrone
            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
            : 'bg-gray-900/60 text-gray-400 hover:text-gray-200 border-gray-700/40'
        }`}
      >
        {followDrone ? 'Following' : 'Follow'}
      </button>

      {/* Add waypoints toggle button */}
      {isPlanning && (
        <button
          onClick={toggleAddWaypointMode}
          className={`absolute bottom-3 right-3 z-[1000] px-3 py-1.5 rounded-md text-xs font-semibold transition-all border backdrop-blur-md ${
            addWaypointMode
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 shadow-lg shadow-cyan-500/10'
              : 'bg-gray-900/60 text-gray-400 hover:text-gray-200 border-gray-700/40'
          }`}
        >
          {addWaypointMode
            ? (planSubTab === 'fence' ? 'Adding Fence Vertices...' : 'Adding Waypoints...')
            : (planSubTab === 'fence' ? 'Add Fence Vertices' : 'Add Waypoints')
          }
        </button>
      )}

      {/* Bottom-left overlays */}
      <div className="absolute bottom-3 left-3 z-[1000] flex items-end gap-1.5">
        {isConnected && <MavLog />}
        <button
          onClick={() => {
            if (measureMode) clearMeasure();
            else setMeasureMode(true);
          }}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all border backdrop-blur-md ${
            measureMode
              ? 'bg-orange-500/20 text-orange-300 border-orange-500/30 shadow-lg shadow-orange-500/10'
              : 'bg-gray-900/60 text-gray-400 hover:text-gray-200 border-gray-700/40'
          }`}
          title="Measure distance & bearing"
        >
          <Ruler size={14} />
        </button>
        {isConnected && <VideoOverlay />}
      </div>

      {/* Servo group quick buttons */}
      <ServoGroupButtons />

      {/* Mission context menu */}
      <MissionContextMenu
        position={contextMenu}
        onClose={() => setContextMenu(null)}
        onAction={handleContextAction}
      />

      {/* Quick mission overlay */}
      <QuickMissionOverlay />

      {/* Pattern generation modal */}
      <PatternModal />
    </div>
  );
}
