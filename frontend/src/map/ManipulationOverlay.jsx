import React, { useEffect, useState, useMemo } from 'react';
import { Source, Layer } from '@vis.gl/react-maplibre';
import useDroneStore from '../store/droneStore';
import { centroid, transformMission } from '../utils/geo';
import { emptyFC, feature, lineString } from './utils';

export default function ManipulationOverlay({ mode, mapRef, onComplete, onCancel }) {
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const setPlannedWaypoints = useDroneStore((s) => s.setPlannedWaypoints);
  const [startPos, setStartPos] = useState(null);
  const [previewWaypoints, setPreviewWaypoints] = useState([]);
  const [manipValue, setManipValue] = useState(null);

  const missionCenter = useMemo(() => {
    if (plannedWaypoints.length === 0) return null;
    return centroid(plannedWaypoints.map(w => ({ lat: w.lat, lon: w.lon })));
  }, [plannedWaypoints]);

  const mapInstance = mapRef?.current?.getMap?.();

  useEffect(() => {
    if (!mode || !missionCenter || !mapInstance) return;

    const canvas = mapInstance.getCanvas();

    if (mode === 'translate') canvas.style.cursor = 'move';
    else if (mode === 'rotate') canvas.style.cursor = 'crosshair';
    else if (mode === 'scale') canvas.style.cursor = 'nwse-resize';

    let localStartPos = null;

    const handleMouseDown = (e) => {
      const lngLat = mapInstance.unproject([e.offsetX, e.offsetY]);
      localStartPos = { lat: lngLat.lat, lng: lngLat.lng };
      setStartPos(localStartPos);
      mapInstance.dragPan.disable();
    };

    const handleMouseMove = (e) => {
      if (!localStartPos) return;
      const currentPos = mapInstance.unproject([e.offsetX, e.offsetY]);

      if (mode === 'translate') {
        const deltaLat = currentPos.lat - localStartPos.lat;
        const deltaLon = currentPos.lng - localStartPos.lng;
        const transformed = transformMission(plannedWaypoints, 'translate', { deltaLat, deltaLon });
        setPreviewWaypoints(transformed);
        setManipValue(`${(deltaLat * 111000).toFixed(0)}m, ${(deltaLon * 111000 * Math.cos(missionCenter.lat * Math.PI / 180)).toFixed(0)}m`);
      } else if (mode === 'rotate') {
        const dx = currentPos.lng - missionCenter.lon;
        const dy = currentPos.lat - missionCenter.lat;
        const currentAngle = Math.atan2(dx, dy) * 180 / Math.PI;

        const startDx = localStartPos.lng - missionCenter.lon;
        const startDy = localStartPos.lat - missionCenter.lat;
        const startAngle = Math.atan2(startDx, startDy) * 180 / Math.PI;

        const angle = currentAngle - startAngle;
        const transformed = transformMission(plannedWaypoints, 'rotate', { angle });
        setPreviewWaypoints(transformed);
        setManipValue(`${angle.toFixed(1)}\u00B0`);
      } else if (mode === 'scale') {
        const startDist = Math.sqrt(
          Math.pow(localStartPos.lat - missionCenter.lat, 2) +
          Math.pow(localStartPos.lng - missionCenter.lon, 2)
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
      mapInstance.dragPan.enable();
      if (previewWaypoints.length > 0) {
        setPlannedWaypoints(previewWaypoints);
      }
      localStartPos = null;
      setStartPos(null);
      setPreviewWaypoints([]);
      setManipValue(null);
      onComplete();
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        mapInstance.dragPan.enable();
        localStartPos = null;
        setStartPos(null);
        setPreviewWaypoints([]);
        setManipValue(null);
        onCancel();
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      canvas.style.cursor = '';
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      mapInstance.dragPan.enable();
    };
  }, [mode, mapInstance, plannedWaypoints, missionCenter, previewWaypoints, setPlannedWaypoints, onComplete, onCancel]);

  // Preview line GeoJSON
  const previewGeoJSON = useMemo(() => {
    const wps = previewWaypoints.filter(w => w.type !== 'roi');
    if (wps.length < 2) return emptyFC();
    const coords = wps.map(w => [w.lon, w.lat]);
    return { type: 'FeatureCollection', features: [feature(lineString(coords), {})] };
  }, [previewWaypoints]);

  if (!mode) return null;

  return (
    <>
      <Source id="manipulation-preview" type="geojson" data={previewGeoJSON}>
        <Layer
          id="manipulation-preview-line"
          type="line"
          paint={{
            'line-color': '#f59e0b',
            'line-width': 2,
            'line-opacity': 0.8,
            'line-dasharray': [1, 1],
          }}
        />
      </Source>

      {/* Mode indicator */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900/90 border border-gray-500/30 rounded-lg px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-300 font-medium">
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
