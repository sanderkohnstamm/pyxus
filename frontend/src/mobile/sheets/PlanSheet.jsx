import React, { useCallback } from 'react';
import { Upload, Download, Trash2, Plus, MapPin } from 'lucide-react';
import useDroneStore from '../../store/droneStore';
import { droneApi } from '../../utils/api';
import { validateMissionAgainstFence } from '../../utils/geo';
import WaypointCard from '../components/WaypointCard';
import MissionBar from '../components/MissionBar';

export default function PlanSheet() {
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const removeWaypoint = useDroneStore((s) => s.removeWaypoint);
  const updateWaypoint = useDroneStore((s) => s.updateWaypoint);
  const clearWaypoints = useDroneStore((s) => s.clearWaypoints);
  const defaultAlt = useDroneStore((s) => s.defaultAlt);
  const setDefaultAlt = useDroneStore((s) => s.setDefaultAlt);
  const defaultSpeed = useDroneStore((s) => s.defaultSpeed);
  const setDefaultSpeed = useDroneStore((s) => s.setDefaultSpeed);
  const addAlert = useDroneStore((s) => s.addAlert);
  const setDroneMission = useDroneStore((s) => s.setDroneMission);
  const addWaypointMode = useDroneStore((s) => s.addWaypointMode);
  const toggleAddWaypointMode = useDroneStore((s) => s.toggleAddWaypointMode);
  const geofence = useDroneStore((s) => s.geofence);
  const plannedFence = useDroneStore((s) => s.plannedFence);
  const setMissionViolations = useDroneStore((s) => s.setMissionViolations);
  const importDroneMission = useDroneStore((s) => s.importDroneMission);
  const importDroneAsMission = useDroneStore((s) => s.importDroneAsMission);

  const isConnected = !!activeDroneId;

  const handleUpload = useCallback(async () => {
    if (plannedWaypoints.length === 0) {
      addAlert('No waypoints to upload', 'warning');
      return;
    }
    const result = validateMissionAgainstFence(plannedWaypoints, geofence, plannedFence);
    if (!result.valid) {
      setMissionViolations(result.violations);
      addAlert(`${result.violations.length} waypoint(s) outside fence`, 'warning');
      return;
    }
    setMissionViolations([]);
    try {
      const body = {
        waypoints: plannedWaypoints.map((w) => ({
          lat: w.lat, lon: w.lon, alt: w.alt,
          item_type: w.type,
          param1: w.param1 || 0, param2: w.param2 || 0,
          param3: w.param3 || 0, param4: w.param4 || 0,
        })),
      };
      const res = await fetch(droneApi('/api/mission/upload'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        addAlert(`Mission uploaded: ${plannedWaypoints.length} items`, 'success');
        if (activeDroneId) setDroneMission(activeDroneId, plannedWaypoints);
      } else {
        addAlert(data.error || 'Upload failed', 'error');
      }
    } catch (err) {
      addAlert(`Upload failed: ${err.message}`, 'error');
    }
  }, [plannedWaypoints, geofence, plannedFence, activeDroneId, addAlert, setDroneMission, setMissionViolations]);

  const handleDownload = useCallback(async () => {
    try {
      const res = await fetch(droneApi('/api/mission/download'));
      const data = await res.json();
      if (data.status === 'ok' && data.waypoints?.length > 0) {
        if (activeDroneId) setDroneMission(activeDroneId, data.waypoints);
        const newMission = importDroneAsMission();
        if (newMission) {
          addAlert(`Imported ${data.waypoints.length} waypoints as "${newMission.name}"`, 'success');
        } else {
          importDroneMission();
          addAlert(`Imported ${data.waypoints.length} waypoints`, 'success');
        }
      } else {
        addAlert('No mission on drone', 'warning');
      }
    } catch (err) {
      addAlert(`Download failed: ${err.message}`, 'error');
    }
  }, [activeDroneId, setDroneMission, importDroneAsMission, importDroneMission, addAlert]);

  const btn = 'flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-gray-700/30 bg-gray-900/60 text-[11px] font-medium active:scale-95 transition-transform';

  return (
    <div className="space-y-4 pb-8">
      {/* Save/Load bar */}
      <MissionBar />

      {/* Default altitude & speed */}
      <div className="flex gap-3">
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[11px] text-gray-400 shrink-0">Alt</span>
          <input
            type="number"
            value={defaultAlt}
            onChange={(e) => setDefaultAlt(parseFloat(e.target.value) || 50)}
            className="flex-1 bg-gray-900/50 border border-gray-700/30 rounded-lg px-2.5 py-2 text-[12px] font-mono focus:outline-none focus:border-gray-600/50"
            min={1} max={500} step={5}
          />
          <span className="text-[11px] text-gray-500">m</span>
        </div>
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[11px] text-gray-400 shrink-0">Spd</span>
          <input
            type="number"
            value={defaultSpeed}
            onChange={(e) => setDefaultSpeed(parseFloat(e.target.value) || 5)}
            className="flex-1 bg-gray-900/50 border border-gray-700/30 rounded-lg px-2.5 py-2 text-[12px] font-mono focus:outline-none focus:border-gray-600/50"
            min={0.5} max={30} step={0.5}
          />
          <span className="text-[11px] text-gray-500">m/s</span>
        </div>
      </div>

      {/* Add waypoint toggle */}
      <button
        onClick={toggleAddWaypointMode}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-[12px] font-semibold transition-all active:scale-[0.98] ${
          addWaypointMode
            ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
            : 'bg-gray-900/60 border-gray-700/30 text-gray-400'
        }`}
      >
        <MapPin size={14} />
        {addWaypointMode ? 'Tap map to add waypoints' : 'Add Waypoints'}
      </button>

      {/* Waypoint list */}
      {plannedWaypoints.length > 0 ? (
        <div className="space-y-2">
          {plannedWaypoints.map((wp, i) => (
            <WaypointCard
              key={wp.id}
              wp={wp}
              index={i}
              onUpdate={updateWaypoint}
              onRemove={removeWaypoint}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-600 text-[12px]">
          No waypoints — tap the map to add
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleUpload}
          disabled={!isConnected || plannedWaypoints.length === 0}
          className={`${btn} flex-1 text-cyan-400 disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          <Upload size={13} /> Upload
        </button>
        <button
          onClick={handleDownload}
          disabled={!isConnected}
          className={`${btn} flex-1 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          <Download size={13} /> Download
        </button>
        <button
          onClick={clearWaypoints}
          disabled={plannedWaypoints.length === 0}
          className={`${btn} text-red-400 disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
