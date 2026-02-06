import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Circle, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import useDroneStore from '../store/droneStore';
import MavLog from './MavLog';
import VideoOverlay from './VideoOverlay';
import WeatherMapLayer from './WeatherMapLayer';
import ManualControlOverlay from './ManualControlOverlay';
import PatternModal from './PatternModal';
import { Move, RotateCw, Maximize2, ArrowLeftRight, Grid3X3 } from 'lucide-react';
import { centroid, transformMission } from '../utils/geo';

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

// SVG arrow drone icon
function createDroneIcon(yawDeg) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="-18 -18 36 36">
      <g transform="rotate(${yawDeg})">
        <path d="M0,-13 L12,10 L0,3 L-12,10 Z" fill="#06b6d4" stroke="#22d3ee" stroke-width="1.5" stroke-linejoin="round"/>
      </g>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: 'drone-marker-icon',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
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

// Drone mission icon (dimmer, smaller)
function createDroneMissionIcon(index, type) {
  const config = MARKER_COLORS[type] || MARKER_COLORS.waypoint;
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

// Component to follow drone position
function DroneFollower() {
  const map = useMap();
  const lat = useDroneStore((s) => s.telemetry.lat);
  const lon = useDroneStore((s) => s.telemetry.lon);
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
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const addWaypointMode = useDroneStore((s) => s.addWaypointMode);
  const activeTab = useDroneStore((s) => s.activeTab);
  const planSubTab = useDroneStore((s) => s.planSubTab);
  const setFlyClickTarget = useDroneStore((s) => s.setFlyClickTarget);

  useMapEvents({
    click: (e) => {
      // Planning mode works offline
      if (activeTab === 'planning' && addWaypointMode) {
        if (planSubTab === 'fence') {
          addFenceVertex(e.latlng.lat, e.latlng.lng);
        } else {
          addWaypoint(e.latlng.lat, e.latlng.lng);
        }
      }
      // Flying mode requires connection
      else if (activeTab === 'flying' && connectionStatus === 'connected') {
        setFlyClickTarget({ lat: e.latlng.lat, lon: e.latlng.lng });
      }
    },
  });

  return null;
}

// Set crosshair cursor when in add mode
function AddModeCursor() {
  const map = useMap();
  const addWaypointMode = useDroneStore((s) => s.addWaypointMode);
  const activeTab = useDroneStore((s) => s.activeTab);

  useEffect(() => {
    const container = map.getContainer();
    if (addWaypointMode && activeTab === 'planning') {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = '';
    }
    return () => { container.style.cursor = ''; };
  }, [addWaypointMode, activeTab, map]);

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

// Isolated component for planned waypoint markers - prevents telemetry re-renders from
// recreating marker DOM (which kills in-progress drags)
function PlannedWaypointMarkers({ onContextMenu }) {
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const activeTab = useDroneStore((s) => s.activeTab);
  const updateWaypoint = useDroneStore((s) => s.updateWaypoint);
  const patternConfig = useDroneStore((s) => s.patternConfig);

  const isPlanning = activeTab === 'planning';
  const plannedOpacity = isPlanning ? 1 : 0.3;

  const plannedNavPositions = plannedWaypoints
    .filter((w) => w.type !== 'roi')
    .map((w) => [w.lat, w.lon]);

  // Pattern preview positions
  const previewPositions = patternConfig.preview
    .filter((w) => w.type !== 'roi')
    .map((w) => [w.lat, w.lon]);

  // Memoize icons so they only change when waypoints change
  const icons = useMemo(
    () => plannedWaypoints.map((wp, i) => createWaypointIcon(i, wp.type)),
    [plannedWaypoints]
  );

  return (
    <>
      {plannedWaypoints.map((wp, i) => (
        <Marker
          key={wp.id}
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
          }}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">{TYPE_LABELS[wp.type] || 'Waypoint'} {i + 1}</div>
              <div>Alt: {wp.alt}m</div>
              <div className="text-xs opacity-70">{wp.lat.toFixed(6)}, {wp.lon.toFixed(6)}</div>
            </div>
          </Popup>
        </Marker>
      ))}

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
              <div className="text-xs opacity-70">{v.lat.toFixed(6)}, {v.lon.toFixed(6)}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

// Drone mission markers with "Start From Here" in fly mode
function DroneMissionMarkers() {
  const droneMission = useDroneStore((s) => s.droneMission);
  const activeTab = useDroneStore((s) => s.activeTab);
  const addAlert = useDroneStore((s) => s.addAlert);

  const isFlying = activeTab === 'flying';
  const droneOpacity = isFlying ? 1 : 0.3;

  const droneNavPositions = droneMission
    .filter((w) => (w.item_type || 'waypoint') !== 'roi')
    .map((w) => [w.lat, w.lon]);

  const handleStartFrom = useCallback(async (index) => {
    const seq = index + 1; // seq 0 is home
    try {
      const setRes = await fetch('/api/mission/set_current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seq }),
      });
      const setData = await setRes.json();
      if (setData.status === 'error') {
        addAlert(setData.error || 'Failed to set waypoint', 'error');
        return;
      }
      const startRes = await fetch('/api/mission/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const startData = await startRes.json();
      if (startData.status === 'error') {
        addAlert(startData.error || 'Mission start failed', 'error');
      } else {
        addAlert(`Mission starting from WP ${index + 1}`, 'success');
      }
    } catch (err) {
      addAlert('Start from here failed: ' + err.message, 'error');
    }
  }, [addAlert]);

  return (
    <>
      {droneMission.map((wp, i) => (
        <Marker
          key={`dm-${i}`}
          position={[wp.lat, wp.lon]}
          icon={createDroneMissionIcon(i, wp.item_type || 'waypoint')}
          opacity={droneOpacity}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">Drone {TYPE_LABELS[wp.item_type] || 'Waypoint'} {i + 1}</div>
              <div>Alt: {wp.alt}m</div>
              <div className="text-xs opacity-70">{wp.lat.toFixed(6)}, {wp.lon.toFixed(6)}</div>
              {isFlying && (
                <button
                  onClick={() => handleStartFrom(i)}
                  style={{
                    marginTop: '6px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  Start From Here
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
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const addAlert = useDroneStore((s) => s.addAlert);
  const isConnected = connectionStatus === 'connected';
  const [groupStates, setGroupStates] = React.useState({});

  if (!isConnected || servoGroups.length === 0) return null;

  const toggleGroup = async (group) => {
    const currentState = groupStates[group.id] || 'closed';
    const isOpen = currentState === 'open';
    const pwm = isOpen ? group.closePwm : group.openPwm;

    try {
      await fetch('/api/servo/test', {
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

// Fly mode click target marker with Go To / Look At / Set Home
function FlyClickTarget() {
  const flyClickTarget = useDroneStore((s) => s.flyClickTarget);
  const clearFlyClickTarget = useDroneStore((s) => s.clearFlyClickTarget);
  const setHomePosition = useDroneStore((s) => s.setHomePosition);
  const alt = useDroneStore((s) => s.telemetry.alt);
  const addAlert = useDroneStore((s) => s.addAlert);

  const handleGoto = useCallback(async () => {
    const target = useDroneStore.getState().flyClickTarget;
    if (!target) return;
    try {
      const res = await fetch('/api/goto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: target.lat, lon: target.lon, alt }),
      });
      const data = await res.json();
      if (data.status === 'error') addAlert(data.error || 'Go To failed', 'error');
      else addAlert('Going to location', 'success');
    } catch (err) {
      addAlert('Go To failed: ' + err.message, 'error');
    }
    clearFlyClickTarget();
  }, [alt, addAlert, clearFlyClickTarget]);

  const handleRoi = useCallback(async () => {
    const target = useDroneStore.getState().flyClickTarget;
    if (!target) return;
    try {
      const res = await fetch('/api/roi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: target.lat, lon: target.lon }),
      });
      const data = await res.json();
      if (data.status === 'error') addAlert(data.error || 'Look At failed', 'error');
      else addAlert('Looking at location', 'success');
    } catch (err) {
      addAlert('Look At failed: ' + err.message, 'error');
    }
    clearFlyClickTarget();
  }, [addAlert, clearFlyClickTarget]);

  const handleSetHome = useCallback(async () => {
    const target = useDroneStore.getState().flyClickTarget;
    const altMsl = useDroneStore.getState().telemetry.alt_msl || 0;
    if (!target) return;
    try {
      const res = await fetch('/api/home/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: target.lat, lon: target.lon, alt: altMsl }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Set Home failed', 'error');
      } else {
        setHomePosition({ lat: target.lat, lon: target.lon, alt: altMsl });
        addAlert(`Home position set (alt: ${altMsl.toFixed(1)}m MSL)`, 'success');
      }
    } catch (err) {
      addAlert('Set Home failed: ' + err.message, 'error');
    }
    clearFlyClickTarget();
  }, [addAlert, clearFlyClickTarget, setHomePosition]);

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
            {flyClickTarget.lat.toFixed(6)}, {flyClickTarget.lon.toFixed(6)}
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
        </div>
      </Popup>
    </Marker>
  );
}

export default function MapView() {
  const lat = useDroneStore((s) => s.telemetry.lat);
  const lon = useDroneStore((s) => s.telemetry.lon);
  const alt = useDroneStore((s) => s.telemetry.alt);
  const groundspeed = useDroneStore((s) => s.telemetry.groundspeed);
  const yaw = useDroneStore((s) => s.telemetry.yaw);
  const heading = useDroneStore((s) => s.telemetry.heading);
  const trail = useDroneStore((s) => s.trail);
  const geofence = useDroneStore((s) => s.geofence);
  const followDrone = useDroneStore((s) => s.followDrone);
  const setFollowDrone = useDroneStore((s) => s.setFollowDrone);
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const activeTab = useDroneStore((s) => s.activeTab);
  const addWaypointMode = useDroneStore((s) => s.addWaypointMode);
  const toggleAddWaypointMode = useDroneStore((s) => s.toggleAddWaypointMode);
  const planSubTab = useDroneStore((s) => s.planSubTab);
  const homePosition = useDroneStore((s) => s.homePosition);
  const setPatternConfig = useDroneStore((s) => s.setPatternConfig);
  const reverseWaypoints = useDroneStore((s) => s.reverseWaypoints);

  // Context menu and manipulation state
  const [contextMenu, setContextMenu] = useState(null);
  const [manipMode, setManipMode] = useState(null);

  const hasPosition = lat !== 0 && lon !== 0;
  const hasHome = homePosition && homePosition.lat !== 0 && homePosition.lon !== 0;
  const yawDeg = heading || (yaw * 180) / Math.PI;

  const droneIcon = useMemo(() => createDroneIcon(yawDeg), [yawDeg]);

  const isPlanning = activeTab === 'planning';
  const isConnected = connectionStatus === 'connected';

  const center = hasPosition ? [lat, lon] : [0, 0];
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
        <MapClickHandler />
        <AddModeCursor />

        {/* Trail */}
        {trail.length > 1 && (
          <Polyline
            positions={trail}
            pathOptions={{ color: '#06b6d4', weight: 2, opacity: 0.6 }}
          />
        )}

        {/* Drone marker - zIndexOffset ensures it's on top of all other markers */}
        {hasPosition && (
          <Marker position={[lat, lon]} icon={droneIcon} zIndexOffset={1000}>
            <Popup>
              <div className="text-xs font-mono space-y-0.5">
                <div className="font-semibold text-[11px] mb-1" style={{color:'#06b6d4'}}>Vehicle</div>
                <div><span style={{color:'#94a3b8'}}>ALT</span> <span style={{color:'#e2e8f0'}}>{alt.toFixed(1)}m</span></div>
                <div><span style={{color:'#94a3b8'}}>GS</span> <span style={{color:'#e2e8f0'}}>{groundspeed.toFixed(1)} m/s</span></div>
                <div><span style={{color:'#94a3b8'}}>HDG</span> <span style={{color:'#e2e8f0'}}>{Math.round(yawDeg)}&deg;</span></div>
                <div style={{borderTop:'1px solid rgba(100,116,139,0.3)',marginTop:'4px',paddingTop:'4px',fontSize:'9px',color:'#64748b'}}>{lat.toFixed(6)}, {lon.toFixed(6)}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Home position marker */}
        {hasHome && (
          <Marker position={[homePosition.lat, homePosition.lon]} icon={homeIcon}>
            <Popup>
              <div className="text-xs font-mono space-y-0.5">
                <div className="font-semibold text-[11px] mb-1" style={{color:'#10b981'}}>Home / Return</div>
                <div style={{fontSize:'9px',color:'#64748b'}}>{homePosition.lat.toFixed(6)}, {homePosition.lon.toFixed(6)}</div>
              </div>
            </Popup>
          </Marker>
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

        {/* Geofence circle */}
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

        {/* Fence vertex markers + polygon (isolated from telemetry re-renders) */}
        <FenceVertexMarkers />

        {/* Fly mode click target */}
        <FlyClickTarget />

        {/* Weather map overlay */}
        <WeatherMapLayer />
      </MapContainer>

      {/* Manual control overlay */}
      <ManualControlOverlay />

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
      {isConnected && (
        <div className="absolute bottom-3 left-3 z-[1000] flex items-end gap-1.5">
          <MavLog />
          <VideoOverlay />
        </div>
      )}

      {/* Servo group quick buttons */}
      <ServoGroupButtons />

      {/* Mission context menu */}
      <MissionContextMenu
        position={contextMenu}
        onClose={() => setContextMenu(null)}
        onAction={handleContextAction}
      />

      {/* Pattern generation modal */}
      <PatternModal />
    </div>
  );
}
