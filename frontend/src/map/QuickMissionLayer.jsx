import React, { useMemo } from 'react';
import { Source, Layer, Marker, Popup } from '@vis.gl/react-maplibre';
import useDroneStore from '../store/droneStore';
import { MARKER_COLORS, NAV_TYPES, generateArc } from './constants';
import { emptyFC, feature, lineString } from './utils';

export default function QuickMissionLayer() {
  const quickMissionMode = useDroneStore((s) => s.quickMissionMode);
  const quickMissionWaypoints = useDroneStore((s) => s.quickMissionWaypoints);
  const addQuickMissionJump = useDroneStore((s) => s.addQuickMissionJump);

  // Connection line GeoJSON
  const lineGeoJSON = useMemo(() => {
    if (!quickMissionMode) return emptyFC();
    const navWps = quickMissionWaypoints.filter(w => w.type !== 'do_jump');
    if (navWps.length < 2) return emptyFC();
    const coords = navWps.map(w => [w.lon, w.lat]);
    return { type: 'FeatureCollection', features: [feature(lineString(coords), {})] };
  }, [quickMissionMode, quickMissionWaypoints]);

  // Jump arrows GeoJSON
  const jumpGeoJSON = useMemo(() => {
    if (!quickMissionMode) return emptyFC();
    const wps = quickMissionWaypoints;
    const features = [];
    for (let i = 0; i < wps.length; i++) {
      const wp = wps[i];
      if (wp.type !== 'do_jump') continue;
      const targetIdx = (wp.jumpTarget || 1) - 1;
      let sourceIdx = -1;
      for (let j = i - 1; j >= 0; j--) {
        if (wps[j].type !== 'do_jump' && wps[j].lat && wps[j].lon) {
          sourceIdx = j;
          break;
        }
      }
      if (sourceIdx >= 0 && targetIdx >= 0 && targetIdx < wps.length) {
        const source = wps[sourceIdx];
        const target = wps[targetIdx];
        if (source.lat && source.lon && target.lat && target.lon) {
          const arcPts = generateArc([source.lon, source.lat], [target.lon, target.lat]);
          features.push(feature(lineString(arcPts), {}));
        }
      }
    }
    return { type: 'FeatureCollection', features };
  }, [quickMissionMode, quickMissionWaypoints]);

  if (!quickMissionMode || quickMissionWaypoints.length === 0) return null;

  return (
    <>
      {/* Connection line */}
      <Source id="quick-mission-line" type="geojson" data={lineGeoJSON}>
        <Layer
          id="quick-mission-line-layer"
          type="line"
          paint={{
            'line-color': '#8b5cf6',
            'line-width': 2.5,
            'line-opacity': 0.8,
            'line-dasharray': [1.5, 0.75],
          }}
        />
      </Source>

      {/* Jump arrows */}
      <Source id="quick-mission-jumps" type="geojson" data={jumpGeoJSON}>
        <Layer
          id="quick-mission-jumps-layer"
          type="line"
          paint={{
            'line-color': '#ec4899',
            'line-width': 2.5,
            'line-opacity': 0.8,
            'line-dasharray': [1.5, 1],
          }}
        />
      </Source>

      {/* Waypoint markers */}
      {quickMissionWaypoints.map((wp, i) => {
        if (wp.type === 'do_jump') return null;
        const config = MARKER_COLORS.waypoint;
        return (
          <Marker
            key={wp.id}
            longitude={wp.lon}
            latitude={wp.lat}
            anchor="center"
          >
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
          </Marker>
        );
      })}
    </>
  );
}
