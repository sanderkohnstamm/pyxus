import React, { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { Map, NavigationControl, AttributionControl } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import useDroneStore from '../store/droneStore';
import { INITIAL_TELEMETRY, EMPTY_ARRAY } from '../store/droneStore';
import { createMapStyle } from './styles';
import { DRONE_COLORS, DRONE_STROKES, NAV_TYPES, MARKER_COLORS, TYPE_LABELS, generateArc, hexToRgba } from './constants';
import { toLngLat, fromLngLat, trailToCoords, circleToPolygon, emptyFC, feature, lineString, polygon, point } from './utils';
import { droneApi } from '../utils/api';
import { centroid, transformMission, haversineDistance, bearing } from '../utils/geo';
import { formatCoord } from '../utils/formatCoord';
import { Move, RotateCw, Maximize2, ArrowLeftRight, Grid3X3, Ruler, Zap } from 'lucide-react';

import CameraController from './CameraController';
import DroneTrails from './DroneTrails';
import DroneMarkerOverlay from './DroneMarkerOverlay';
import PlannedWaypointLayer from './PlannedWaypointLayer';
import FenceLayer from './FenceLayer';
import DroneMissionLayer from './DroneMissionLayer';
import ManipulationOverlay from './ManipulationOverlay';
import MapClickHandler from './MapClickHandler';
import FlyClickTarget from './FlyClickTarget';
import QuickMissionLayer from './QuickMissionLayer';
import MeasureOverlay from './MeasureOverlay';
import MapOverlays from './MapOverlays';

import MavLog from '../components/MavLog';
import VideoOverlay from '../components/VideoOverlay';
import ManualControlOverlay from '../components/ManualControlOverlay';
import PatternModal from '../components/PatternModal';
import DroneListOverlay from '../components/DroneListOverlay';

const mapStyle = createMapStyle();

export default function MapView() {
  const mapRef = useRef(null);
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
  const [contextMenu, setContextMenu] = useState(null);
  const [manipMode, setManipMode] = useState(null);

  // Stable color assignment
  const droneColorMap = useMemo(() => {
    const ids = Object.keys(drones);
    const map = {};
    let colorIdx = 1;
    for (const id of ids) {
      if (id === activeDroneId) {
        map[id] = 0;
      } else {
        map[id] = colorIdx % DRONE_COLORS.length;
        colorIdx++;
      }
    }
    return map;
  }, [drones, activeDroneId]);

  const activeDrone = activeDroneId ? drones[activeDroneId] : null;
  const activeTelemetry = activeDrone?.telemetry || INITIAL_TELEMETRY;
  const hasPosition = activeTelemetry.lat !== 0 && activeTelemetry.lon !== 0;
  const isPlanning = activeTab === 'planning';
  const isConnected = !!activeDroneId;

  const initialCenter = hasPosition ? [activeTelemetry.lon, activeTelemetry.lat] : [0, 0];
  const initialZoom = hasPosition ? 17 : 3;

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

  // Close context menu on click
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  return (
    <div className="w-full h-full relative">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: initialCenter[0],
          latitude: initialCenter[1],
          zoom: initialZoom,
          pitch: 0,
          bearing: 0,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        attributionControl={false}
        maxPitch={85}
        antialias={true}
      >
        <NavigationControl position="top-left" visualizePitch={true} />
        <AttributionControl compact={true} position="bottom-right" />

        <CameraController mapRef={mapRef} />
        <MapClickHandler mapRef={mapRef} />

        {/* Drone trails */}
        <DroneTrails droneColorMap={droneColorMap} />

        {/* Drone name labels + icons */}
        <DroneMarkerOverlay droneColorMap={droneColorMap} />

        {/* Planned waypoints + polyline + jump arrows */}
        <PlannedWaypointLayer onContextMenu={setContextMenu} />

        {/* Manipulation overlay (translate/rotate/scale) */}
        <ManipulationOverlay
          mode={manipMode}
          mapRef={mapRef}
          onComplete={() => setManipMode(null)}
          onCancel={() => setManipMode(null)}
        />

        {/* Drone mission from autopilot */}
        <DroneMissionLayer />

        {/* Fence layers (planned + drone) */}
        <FenceLayer />

        {/* Fly mode click target */}
        <FlyClickTarget />

        {/* Quick mission markers */}
        <QuickMissionLayer />

        {/* Measure overlay */}
        <MeasureOverlay />

      </Map>

      {/* Manual control overlay */}
      <ManualControlOverlay />

      {/* Multi-drone list overlay */}
      <DroneListOverlay droneColorMap={droneColorMap} />

      {/* Map overlay buttons (follow, add waypoints, measure, 2D/3D toggle) */}
      <MapOverlays mapRef={mapRef} />

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

// Quick mission bottom overlay bar
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

        const now = Date.now();
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
