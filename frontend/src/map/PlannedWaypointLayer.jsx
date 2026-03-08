import React, { useMemo, useCallback, useState } from 'react';
import { Source, Layer, Marker, Popup } from '@vis.gl/react-maplibre';
import useDroneStore from '../store/droneStore';
import { NAV_TYPES, MARKER_COLORS, TYPE_LABELS, generateArc, hexToRgba } from './constants';
import { toLngLat, emptyFC, feature, lineString, point } from './utils';
import { formatCoord } from '../utils/formatCoord';

export default function PlannedWaypointLayer({ onContextMenu }) {
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const activeTab = useDroneStore((s) => s.activeTab);
  const updateWaypoint = useDroneStore((s) => s.updateWaypoint);
  const addJumpWaypoint = useDroneStore((s) => s.addJumpWaypoint);
  const patternConfig = useDroneStore((s) => s.patternConfig);
  const coordFormat = useDroneStore((s) => s.coordFormat);
  const setSelectedWaypointId = useDroneStore((s) => s.setSelectedWaypointId);
  const setPlanSubTab = useDroneStore((s) => s.setPlanSubTab);
  const setSidebarCollapsed = useDroneStore((s) => s.setSidebarCollapsed);
  const missionViolations = useDroneStore((s) => s.missionViolations);
  const is3DMode = useDroneStore((s) => s.is3DMode);

  const isPlanning = activeTab === 'planning';
  const plannedOpacity = isPlanning ? 1 : 0.3;

  const violatingIndices = useMemo(
    () => new Set(missionViolations.map((v) => v.waypointIndex)),
    [missionViolations]
  );

  // Connection line GeoJSON (with altitude as z-coordinate)
  const connectionGeoJSON = useMemo(() => {
    const navWps = plannedWaypoints.filter((w) => NAV_TYPES.has(w.type) && w.type !== 'roi');
    if (navWps.length < 2) return emptyFC();

    const coords = navWps.map((w) => [w.lon, w.lat, w.alt || 0]);
    return {
      type: 'FeatureCollection',
      features: [feature(lineString(coords), {})],
    };
  }, [plannedWaypoints]);

  // Jump arrows GeoJSON
  const jumpGeoJSON = useMemo(() => {
    const features = [];
    for (let i = 0; i < plannedWaypoints.length; i++) {
      const wp = plannedWaypoints[i];
      if (wp.type !== 'do_jump') continue;
      const targetIdx = (wp.param1 || wp.jumpTarget || 1) - 1;
      let sourceIdx = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (NAV_TYPES.has(plannedWaypoints[j].type) || (plannedWaypoints[j].lat && plannedWaypoints[j].lon)) {
          sourceIdx = j;
          break;
        }
      }
      if (sourceIdx >= 0 && targetIdx >= 0 && targetIdx < plannedWaypoints.length) {
        const source = plannedWaypoints[sourceIdx];
        const target = plannedWaypoints[targetIdx];
        if (source.lat && source.lon && target.lat && target.lon) {
          const arcPts = generateArc([source.lon, source.lat], [target.lon, target.lat]);
          const repeat = wp.param2 ?? wp.repeat ?? -1;
          features.push(feature(lineString(arcPts), { repeat, jumpIndex: i }));
        }
      }
    }
    return { type: 'FeatureCollection', features };
  }, [plannedWaypoints]);

  // Pattern preview GeoJSON
  const patternGeoJSON = useMemo(() => {
    const preview = patternConfig.preview;
    if (!preview || preview.length < 2) return emptyFC();
    const coords = preview.filter((w) => w.type !== 'roi').map((w) => [w.lon, w.lat]);
    return { type: 'FeatureCollection', features: [feature(lineString(coords), {})] };
  }, [patternConfig.preview]);

  return (
    <>
      {/* Altitude poles managed imperatively via useEffect above */}

      {/* Connection polyline */}
      <Source id="planned-connection" type="geojson" data={connectionGeoJSON}>
        <Layer
          id="planned-connection-line"
          type="line"
          paint={{
            'line-color': '#3b82f6',
            'line-width': 2,
            'line-opacity': 0.5 * plannedOpacity,
            'line-dasharray': [2, 1],
          }}
        />
      </Source>

      {/* Jump arrows */}
      <Source id="planned-jumps" type="geojson" data={jumpGeoJSON}>
        <Layer
          id="planned-jumps-line"
          type="line"
          paint={{
            'line-color': '#ec4899',
            'line-width': 2.5,
            'line-opacity': 0.8 * plannedOpacity,
            'line-dasharray': [1.5, 1],
          }}
        />
      </Source>

      {/* Pattern preview */}
      <Source id="pattern-preview" type="geojson" data={patternGeoJSON}>
        <Layer
          id="pattern-preview-line"
          type="line"
          paint={{
            'line-color': '#f59e0b',
            'line-width': 2,
            'line-opacity': 0.7,
            'line-dasharray': [1, 1],
          }}
        />
      </Source>

      {/* Waypoint markers (HTML Markers for drag support) */}
      {plannedWaypoints.map((wp, i) => {
        if (!MARKER_COLORS[wp.type]) return null;
        const config = MARKER_COLORS[wp.type];
        const hasViolation = violatingIndices.has(i);

        return (
          <Marker
            key={wp.id}
            longitude={wp.lon}
            latitude={wp.lat}
            anchor="center"
            draggable={isPlanning}
            onDragEnd={(e) => {
              const { lng, lat } = e.lngLat;
              updateWaypoint(wp.id, { lat, lon: lng });
            }}
            onClick={(e) => {
              e.originalEvent?.stopPropagation();
              if (isPlanning) {
                setPlanSubTab('mission');
                setSidebarCollapsed(false);
                setSelectedWaypointId(wp.id);
              }
            }}
            style={{ opacity: plannedOpacity }}
          >
            <div style={{ position: 'relative' }}>
              <div
                className="waypoint-marker"
                style={{
                  backgroundColor: config.bg,
                  borderColor: config.border,
                  boxShadow: `0 2px 8px ${config.bg}66`,
                }}
              >
                {i + 1}
              </div>
              {wp.alt > 0 && (
                <div style={{
                  position: 'absolute',
                  top: -16, left: '50%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  background: 'rgba(0,0,0,0.7)',
                  color: '#e2e8f0',
                  padding: '1px 4px',
                  borderRadius: '3px',
                  fontSize: '8px',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  pointerEvents: 'none',
                }}>
                  {Math.round(wp.alt)}m
                </div>
              )}
              {hasViolation && (
                <div style={{
                  position: 'absolute',
                  top: -4, left: -4, right: -4, bottom: -4,
                  border: '3px solid #ef4444',
                  borderRadius: '50%',
                  boxShadow: '0 0 8px rgba(239,68,68,0.6), inset 0 0 4px rgba(239,68,68,0.3)',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
          </Marker>
        );
      })}

      {/* Jump label markers */}
      {plannedWaypoints.map((wp, i) => {
        if (wp.type !== 'do_jump') return null;
        const targetIdx = (wp.param1 || wp.jumpTarget || 1) - 1;
        let sourceIdx = -1;
        for (let j = i - 1; j >= 0; j--) {
          if (NAV_TYPES.has(plannedWaypoints[j].type) || (plannedWaypoints[j].lat && plannedWaypoints[j].lon)) {
            sourceIdx = j;
            break;
          }
        }
        if (sourceIdx < 0 || targetIdx < 0 || targetIdx >= plannedWaypoints.length) return null;
        const source = plannedWaypoints[sourceIdx];
        const target = plannedWaypoints[targetIdx];
        if (!source.lat || !source.lon || !target.lat || !target.lon) return null;

        const midLat = (source.lat + target.lat) / 2;
        const midLon = (source.lon + target.lon) / 2;
        const repeat = wp.param2 ?? wp.repeat ?? -1;
        const repeatStr = repeat === -1 ? '\u221E' : repeat;

        return (
          <Marker
            key={`jump-label-${i}`}
            longitude={midLon}
            latitude={midLat}
            anchor="bottom"
            style={{ pointerEvents: 'none', opacity: plannedOpacity }}
          >
            <div style={{
              display: 'inline-block',
              whiteSpace: 'nowrap',
              background: 'rgba(236,72,153,0.85)',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '10px',
              fontSize: '9px',
              fontWeight: 700,
              fontFamily: 'monospace',
              border: '1px solid rgba(236,72,153,0.5)',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            }}>
              Jump &times;{repeatStr}
            </div>
          </Marker>
        );
      })}

      {/* Pattern bounds polygon */}
      <PatternBoundsLayer />
    </>
  );
}

// Pattern bounds polygon for lawnmower area selection
function PatternBoundsLayer() {
  const patternBounds = useDroneStore((s) => s.patternBounds);
  const patternDrawMode = useDroneStore((s) => s.patternDrawMode);
  const updatePatternBoundsVertex = useDroneStore((s) => s.updatePatternBoundsVertex);
  const removePatternBoundsVertex = useDroneStore((s) => s.removePatternBoundsVertex);

  const geojson = useMemo(() => {
    if (patternBounds.length === 0) return emptyFC();
    const coords = patternBounds.map((v) => [v.lon, v.lat]);
    if (coords.length >= 3) {
      const ring = [...coords, coords[0]];
      return {
        type: 'FeatureCollection',
        features: [
          feature({ type: 'Polygon', coordinates: [ring] }, {}),
          feature({ type: 'LineString', coordinates: ring }, {}),
        ],
      };
    }
    if (coords.length >= 2) {
      return {
        type: 'FeatureCollection',
        features: [feature({ type: 'LineString', coordinates: coords }, {})],
      };
    }
    return emptyFC();
  }, [patternBounds]);

  return (
    <>
      <Source id="pattern-bounds" type="geojson" data={geojson}>
        <Layer
          id="pattern-bounds-fill"
          type="fill"
          paint={{ 'fill-color': '#ec4899', 'fill-opacity': 0.15 }}
          filter={['==', '$type', 'Polygon']}
        />
        <Layer
          id="pattern-bounds-line"
          type="line"
          paint={{
            'line-color': '#ec4899',
            'line-width': 2,
            'line-opacity': 0.8,
            'line-dasharray': [2, 1],
          }}
        />
      </Source>

      {patternDrawMode && patternBounds.map((v, i) => (
        <Marker
          key={v.id}
          longitude={v.lon}
          latitude={v.lat}
          anchor="center"
          draggable={true}
          onDragEnd={(e) => {
            const { lng, lat } = e.lngLat;
            updatePatternBoundsVertex(v.id, { lat, lon: lng });
          }}
        >
          <div style={{
            width: 18, height: 18,
            background: '#ec4899',
            border: '2px solid white',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '9px', fontWeight: 'bold', color: 'white',
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          }}>
            {i + 1}
          </div>
        </Marker>
      ))}
    </>
  );
}
