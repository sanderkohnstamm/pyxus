import React, { useMemo } from 'react';
import { Polyline, Marker, Popup, Polygon } from 'react-leaflet';
import useDroneStore from '../store/droneStore';
import { formatCoord } from '../utils/formatCoord';
import { NAV_TYPES, MARKER_COLORS, TYPE_LABELS, createWaypointIcon, createFenceVertexIcon, createViolationRingIcon } from './mapIcons';
import { JumpArrows } from './MissionOverlays';

// Isolated component for planned waypoint markers - prevents telemetry re-renders from
// recreating marker DOM (which kills in-progress drags)
export function PlannedWaypointMarkers({ onContextMenu }) {
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

  const isPlanning = activeTab === 'plan';
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
export function FenceVertexMarkers() {
  const plannedFence = useDroneStore((s) => s.plannedFence);
  const activeTab = useDroneStore((s) => s.activeTab);
  const planSubTab = useDroneStore((s) => s.planSubTab);
  const updateFenceVertex = useDroneStore((s) => s.updateFenceVertex);
  const coordFormat = useDroneStore((s) => s.coordFormat);

  const isPlanning = activeTab === 'plan';
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
