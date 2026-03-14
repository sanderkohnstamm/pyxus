import React, { useCallback } from 'react';
import { Upload, Download, Trash2, MapPin, Shield, Undo2 } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import { droneApi, fetchWithTimeout } from '../utils/api';
import { haversineDistance } from '../utils/geo';
import { GlassPanel, GlassButton } from './ui/GlassPanel';

export default function FloatingPlanBar() {
  const waypoints = useDroneStore((s) => s.plannedWaypoints);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const addWaypointMode = useDroneStore((s) => s.addWaypointMode);
  const toggleAddWaypointMode = useDroneStore((s) => s.toggleAddWaypointMode);
  const setPlannedWaypoints = useDroneStore((s) => s.setPlannedWaypoints);
  const clearWaypoints = useDroneStore((s) => s.clearWaypoints);
  const setDroneMission = useDroneStore((s) => s.setDroneMission);
  const addAlert = useDroneStore((s) => s.addAlert);
  const planSubTab = useDroneStore((s) => s.planSubTab);
  const setPlanSubTab = useDroneStore((s) => s.setPlanSubTab);

  // Compute total distance
  let totalDist = 0;
  for (let i = 1; i < waypoints.length; i++) {
    totalDist += haversineDistance(
      waypoints[i - 1].lat, waypoints[i - 1].lon,
      waypoints[i].lat, waypoints[i].lon
    );
  }

  const uploadMission = useCallback(async () => {
    if (!activeDroneId || waypoints.length === 0) return;
    try {
      const res = await fetchWithTimeout(droneApi('/api/mission/upload'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drone_id: activeDroneId,
          waypoints: waypoints.map((wp) => ({
            lat: wp.lat, lon: wp.lon, alt: wp.alt,
            speed: wp.speed, type: wp.type || 'waypoint',
            param1: wp.param1, param2: wp.param2, param3: wp.param3, param4: wp.param4,
          })),
        }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        addAlert('Mission uploaded', 'success');
        setDroneMission(activeDroneId, waypoints);
      } else {
        addAlert(data.error || 'Upload failed', 'error');
      }
    } catch (err) {
      addAlert(`Upload failed: ${err.message}`, 'error');
    }
  }, [activeDroneId, waypoints, addAlert, setDroneMission]);

  const downloadMission = useCallback(async () => {
    if (!activeDroneId) return;
    try {
      const res = await fetchWithTimeout(droneApi(`/api/mission/download?drone_id=${activeDroneId}`));
      const data = await res.json();
      if (data.status === 'ok' && data.waypoints) {
        addAlert(`Downloaded ${data.waypoints.length} waypoints`, 'success');
      } else {
        addAlert(data.error || 'Download failed', 'error');
      }
    } catch (err) {
      addAlert(`Download failed: ${err.message}`, 'error');
    }
  }, [activeDroneId, addAlert]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2">
      {/* Sub-tab toggle: Mission / Fence */}
      <GlassPanel className="flex items-center gap-1 px-2 py-1.5">
        <button
          onClick={() => setPlanSubTab('mission')}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors ${
            planSubTab === 'mission' ? 'text-gray-200 bg-white/[0.08]' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <MapPin size={10} className="inline -mt-0.5 mr-1" />Mission
        </button>
        <button
          onClick={() => setPlanSubTab('fence')}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider transition-colors ${
            planSubTab === 'fence' ? 'text-gray-200 bg-white/[0.08]' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          <Shield size={10} className="inline -mt-0.5 mr-1" />Fence
        </button>
      </GlassPanel>

      {/* Mission tools */}
      {planSubTab === 'mission' && (
        <GlassPanel className="flex items-center gap-1.5 px-3 py-2">
          {/* Add waypoint toggle */}
          <GlassButton
            color={addWaypointMode ? 'emerald' : 'gray'}
            onClick={toggleAddWaypointMode}
          >
            <MapPin size={10} className="inline -mt-0.5 mr-1" />
            {addWaypointMode ? 'Adding…' : 'Add'}
          </GlassButton>

          {/* Undo last */}
          {waypoints.length > 0 && (
            <GlassButton color="gray" onClick={() => setPlannedWaypoints(waypoints.slice(0, -1))}>
              <Undo2 size={10} className="inline -mt-0.5 mr-1" />Undo
            </GlassButton>
          )}

          {/* Waypoint count + distance */}
          <div className="px-2 py-0.5 text-[10px] font-mono text-gray-400">
            <span className="text-gray-200 font-semibold">{waypoints.length}</span> WP
            {totalDist > 0 && (
              <>
                <span className="mx-1.5 text-gray-600">|</span>
                <span className="text-gray-200">{totalDist >= 1000 ? `${(totalDist / 1000).toFixed(1)}km` : `${Math.round(totalDist)}m`}</span>
              </>
            )}
          </div>

          <div className="w-px h-5 bg-white/[0.08]" />

          {/* Upload */}
          <GlassButton color="emerald" onClick={uploadMission} disabled={waypoints.length === 0}>
            <Upload size={10} className="inline -mt-0.5 mr-1" />Upload
          </GlassButton>

          {/* Download */}
          {activeDroneId && (
            <GlassButton color="gray" onClick={downloadMission}>
              <Download size={10} className="inline -mt-0.5 mr-1" />Download
            </GlassButton>
          )}

          {/* Clear */}
          {waypoints.length > 0 && (
            <GlassButton color="red" onClick={clearWaypoints}>
              <Trash2 size={10} className="inline -mt-0.5 mr-1" />Clear
            </GlassButton>
          )}
        </GlassPanel>
      )}
    </div>
  );
}
