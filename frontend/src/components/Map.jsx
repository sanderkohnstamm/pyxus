import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Circle, Polygon } from 'react-leaflet';
import useDroneStore from '../store/droneStore';
import { INITIAL_TELEMETRY } from '../store/droneStore';
import MavLog from './MavLog';
import VideoOverlay from './VideoOverlay';
import ManualControlOverlay from './ManualControlOverlay';
import PatternModal from './PatternModal';
import DroneListOverlay from './DroneListOverlay';
import { Ruler } from 'lucide-react';
import { formatCoord } from '../utils/formatCoord';

// Map sub-modules
import {
  TILE_URL, TILE_ATTR, DRONE_COLORS, DRONE_STROKES,
  createDroneIcon, createDroneNameIcon, homeIcon, gcsIcon,
} from '../map/mapIcons';
import { GcsLocator, MapResizer, DroneFollower, MapClickHandler, AddModeCursor, MapBoundsTracker } from '../map/MapBehaviors';
import { MissionContextMenu, ManipulationOverlay } from '../map/MissionOverlays';
import { PlannedWaypointMarkers, FenceVertexMarkers } from '../map/PlannedMissionLayer';
import { DroneMissionMarkers, DroneFenceDisplay, PatternBoundsPolygon } from '../map/DroneMissionLayer';
import { ServoGroupButtons, MeasureOverlay, FlyClickTarget, QuickMissionMarkers, QuickMissionOverlay } from '../map/InteractiveTools';

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
        <MapBoundsTracker />

        {/* All drone trails + markers + non-active drone missions */}
        {Object.entries(drones).map(([droneId, drone]) => {
          const t = drone.telemetry || INITIAL_TELEMETRY;
          const isActive = droneId === activeDroneId;
          const dHasPos = t.lat !== 0 && t.lon !== 0;
          const dYawDeg = t.heading || (t.yaw * 180) / Math.PI;
          const cIdx = droneColorMap[droneId] ?? 0;
          const isLinkLost = drone.linkLost;
          const fillColor = isLinkLost ? '#ef4444' : DRONE_COLORS[cIdx];
          const strokeColor = isLinkLost ? '#f87171' : DRONE_STROKES[cIdx];
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
                        {isLinkLost && (
                          <div style={{color:'#f87171',fontWeight:700,fontSize:'10px',marginBottom:'4px'}}>
                            LAST KNOWN POSITION
                            {drone.linkLostSince && <span style={{fontWeight:400,color:'#fca5a5'}}> ({Math.round((Date.now() - drone.linkLostSince) / 1000)}s ago)</span>}
                          </div>
                        )}
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
