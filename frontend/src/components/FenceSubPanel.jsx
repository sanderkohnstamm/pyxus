import React, { useCallback } from 'react';
import { Upload, Trash2, X, Shield, Pentagon } from 'lucide-react';
import useDroneStore from '../store/droneStore';

export default function FenceSubPanel() {
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const geofence = useDroneStore((s) => s.geofence);
  const setGeofence = useDroneStore((s) => s.setGeofence);
  const telemetry = useDroneStore((s) => s.telemetry);
  const addAlert = useDroneStore((s) => s.addAlert);
  const plannedFence = useDroneStore((s) => s.plannedFence);
  const removeFenceVertex = useDroneStore((s) => s.removeFenceVertex);
  const clearPlannedFence = useDroneStore((s) => s.clearPlannedFence);
  const setDroneFence = useDroneStore((s) => s.setDroneFence);

  const isConnected = connectionStatus === 'connected';

  // Reload fence from drone
  const reloadDroneFence = useCallback(async () => {
    try {
      const res = await fetch('/api/fence/download');
      const data = await res.json();
      if (data.status === 'ok') {
        setDroneFence(data.fence_items || []);
      }
    } catch {}
  }, [setDroneFence]);

  const fenceApiCall = useCallback(
    async (endpoint, body = {}, clearPlannedOnSuccess = false) => {
      try {
        const res = await fetch(`/api/fence/${endpoint}`, {
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
    setDroneFence([]); // Clear local display
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
            Center: {geofence.lat ? `${geofence.lat.toFixed(5)}, ${geofence.lon.toFixed(5)}` : 'drone position'}
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
                  {v.lat.toFixed(5)}, {v.lon.toFixed(5)}
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
      </div>
    </div>
  );
}
