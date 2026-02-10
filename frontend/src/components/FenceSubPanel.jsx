import React, { useCallback } from 'react';
import { Upload, Trash2, X, Shield, Pentagon, Download, FolderOpen } from 'lucide-react';
import useDroneStore, { INITIAL_TELEMETRY } from '../store/droneStore';
import { droneApi } from '../utils/api';
import { formatCoord } from '../utils/formatCoord';

// Parse KML polygon coordinates
function parseKmlPolygon(kmlText) {
  const coordinates = [];
  // Find coordinates within Polygon > outerBoundaryIs > LinearRing > coordinates
  const coordMatch = kmlText.match(/<coordinates[^>]*>([\s\S]*?)<\/coordinates>/i);
  if (coordMatch) {
    const coordString = coordMatch[1].trim();
    // KML format: lon,lat,alt lon,lat,alt ...
    const points = coordString.split(/\s+/).filter(p => p.trim());
    for (const point of points) {
      const parts = point.split(',');
      if (parts.length >= 2) {
        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lon)) {
          coordinates.push({ lat, lon });
        }
      }
    }
  }
  // Remove last point if it's same as first (KML closes polygons)
  if (coordinates.length > 1) {
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (Math.abs(first.lat - last.lat) < 0.0000001 && Math.abs(first.lon - last.lon) < 0.0000001) {
      coordinates.pop();
    }
  }
  return coordinates;
}

// Generate KML from polygon vertices
function generateKml(vertices, name = 'Geofence') {
  const coordString = vertices
    .map(v => `${v.lon},${v.lat},0`)
    .concat([`${vertices[0].lon},${vertices[0].lat},0`]) // Close polygon
    .join(' ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${name}</name>
    <Style id="fenceStyle">
      <LineStyle>
        <color>ff00ffff</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>4000ffff</color>
      </PolyStyle>
    </Style>
    <Placemark>
      <name>${name}</name>
      <styleUrl>#fenceStyle</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coordString}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;
}

export default function FenceSubPanel() {
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const geofence = useDroneStore((s) => s.geofence);
  const setGeofence = useDroneStore((s) => s.setGeofence);
  const telemetry = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : INITIAL_TELEMETRY) || INITIAL_TELEMETRY;
  const addAlert = useDroneStore((s) => s.addAlert);
  const plannedFence = useDroneStore((s) => s.plannedFence);
  const removeFenceVertex = useDroneStore((s) => s.removeFenceVertex);
  const clearPlannedFence = useDroneStore((s) => s.clearPlannedFence);
  const setDroneFence = useDroneStore((s) => s.setDroneFence);
  const coordFormat = useDroneStore((s) => s.coordFormat);

  const isConnected = !!activeDroneId;

  // Reload fence from drone
  const reloadDroneFence = useCallback(async () => {
    try {
      const droneId = useDroneStore.getState().activeDroneId;
      const res = await fetch(droneApi('/api/fence/download'));
      const data = await res.json();
      if (data.status === 'ok' && droneId) {
        setDroneFence(droneId, data.fence_items || []);
      }
    } catch {}
  }, [setDroneFence]);

  const fenceApiCall = useCallback(
    async (endpoint, body = {}, clearPlannedOnSuccess = false) => {
      try {
        const res = await fetch(droneApi(`/api/fence/${endpoint}`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.status === 'error') {
          addAlert(data.error || `Fence ${endpoint} failed`, 'error');
        } else {
          addAlert(`Fence ${endpoint} ok`, 'success');
          // Reload fence from drone after successful upload
          await reloadDroneFence();
          // Clear planned fence if requested
          if (clearPlannedOnSuccess) {
            clearPlannedFence();
          }
        }
      } catch (err) {
        addAlert(`Fence ${endpoint} failed: ${err.message}`, 'error');
      }
    },
    [addAlert, reloadDroneFence, clearPlannedFence]
  );

  const handleCircularFenceUpload = useCallback(async () => {
    const lat = geofence.lat || telemetry.lat;
    const lon = geofence.lon || telemetry.lon;
    if (lat === 0 && lon === 0) {
      addAlert('No position for geofence center', 'warning');
      return;
    }
    setGeofence({ lat, lon, enabled: true });
    await fenceApiCall('upload', { lat, lon, radius: geofence.radius });
  }, [geofence, telemetry, fenceApiCall, setGeofence, addAlert]);

  const handleCircularFenceClear = useCallback(async () => {
    setGeofence({ enabled: false });
    await fenceApiCall('clear');
    const droneId = useDroneStore.getState().activeDroneId;
    if (droneId) setDroneFence(droneId, []); // Clear local display
  }, [fenceApiCall, setGeofence, setDroneFence]);

  const handlePolygonFenceUpload = useCallback(async () => {
    if (plannedFence.length < 3) {
      addAlert('Need at least 3 vertices for polygon fence', 'warning');
      return;
    }
    await fenceApiCall('upload_polygon', {
      vertices: plannedFence.map((v) => ({ lat: v.lat, lon: v.lon })),
    }, true); // Clear planned fence on success
  }, [plannedFence, fenceApiCall, addAlert]);

  // Add fence vertices from store
  const addFenceVertex = useDroneStore((s) => s.addFenceVertex);

  // Import KML file
  const handleImportKml = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.kml,.kmz';

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const vertices = parseKmlPolygon(text);

        if (vertices.length < 3) {
          addAlert('KML must contain a polygon with at least 3 vertices', 'error');
          return;
        }

        // Clear existing and add new vertices
        clearPlannedFence();
        for (const v of vertices) {
          addFenceVertex(v.lat, v.lon);
        }

        addAlert(`Imported ${vertices.length} vertices from KML`, 'success');
      } catch (err) {
        addAlert(`Failed to import KML: ${err.message}`, 'error');
      }
    };

    input.click();
  }, [addAlert, clearPlannedFence, addFenceVertex]);

  // Export to KML file
  const handleExportKml = useCallback(() => {
    if (plannedFence.length < 3) {
      addAlert('Need at least 3 vertices to export', 'warning');
      return;
    }

    const kml = generateKml(plannedFence);
    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'geofence.kml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addAlert('Fence exported to KML', 'success');
  }, [plannedFence, addAlert]);

  return (
    <div className="space-y-3">
      {/* Circular fence */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Shield size={11} className="text-gray-600" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Circular Fence</span>
          {geofence.enabled && (
            <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-md font-semibold ml-auto">
              ACTIVE
            </span>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500">Radius</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={geofence.radius}
                onChange={(e) => setGeofence({ radius: parseFloat(e.target.value) || 200 })}
                className="w-20 bg-gray-800/80 text-gray-200 border border-gray-700/50 rounded-md px-2 py-1 text-xs font-mono text-right focus:outline-none focus:border-cyan-500/50"
                min={50}
                max={10000}
                step={50}
              />
              <span className="text-[10px] text-gray-500">m</span>
            </div>
          </div>
          <div className="text-[10px] text-gray-600 italic">
            Center: {geofence.lat ? formatCoord(geofence.lat, geofence.lon, coordFormat, 5) : 'drone position'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleCircularFenceUpload}
              disabled={!isConnected}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 rounded-md text-[11px] font-semibold text-amber-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Upload size={10} /> Set Fence
            </button>
            <button
              onClick={handleCircularFenceClear}
              disabled={!isConnected || !geofence.enabled}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 rounded-md text-[11px] font-semibold text-red-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Trash2 size={10} /> Clear
            </button>
          </div>
        </div>
      </div>

      {/* Polygon fence */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Pentagon size={11} className="text-gray-600" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Polygon Fence</span>
          {plannedFence.length > 0 && (
            <span className="text-[10px] text-gray-600 ml-auto">({plannedFence.length} vertices)</span>
          )}
        </div>

        {plannedFence.length === 0 ? (
          <div className="text-[10px] text-gray-600 italic py-3 text-center">
            Click "Add Fence Vertices" then click on the map
          </div>
        ) : (
          <div className="space-y-1 mb-2 max-h-32 overflow-y-auto">
            {plannedFence.map((v, i) => (
              <div key={v.id} className="flex items-center gap-2 px-2 py-1 rounded bg-amber-500/5 border border-amber-500/10">
                <span className="text-[10px] font-bold text-amber-400 w-4 text-center">{i + 1}</span>
                <span className="font-mono text-[10px] text-gray-400 flex-1 truncate">
                  {formatCoord(v.lat, v.lon, coordFormat, 5)}
                </span>
                <button
                  onClick={() => removeFenceVertex(v.id)}
                  className="opacity-40 hover:opacity-100 hover:text-red-400 transition-all p-0.5"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handlePolygonFenceUpload}
            disabled={!isConnected || plannedFence.length < 3}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/40 rounded-md text-[11px] font-semibold text-amber-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Upload size={10} /> Upload
          </button>
          <button
            onClick={clearPlannedFence}
            disabled={plannedFence.length === 0}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 rounded-md text-[11px] font-semibold text-red-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 size={10} /> Clear
          </button>
        </div>

        {/* KML Import/Export */}
        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-800/30">
          <button
            onClick={handleImportKml}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 hover:border-violet-500/40 rounded-md text-[11px] font-semibold text-violet-300 transition-all"
          >
            <FolderOpen size={10} /> Import KML
          </button>
          <button
            onClick={handleExportKml}
            disabled={plannedFence.length < 3}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 hover:border-violet-500/40 rounded-md text-[11px] font-semibold text-violet-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Download size={10} /> Export KML
          </button>
        </div>
      </div>
    </div>
  );
}
