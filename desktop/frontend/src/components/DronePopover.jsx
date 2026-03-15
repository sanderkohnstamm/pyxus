import React, { useCallback, useEffect, useState } from 'react';
import { Plus, X, AlertTriangle } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import { GlassPanel, GlassButton } from './ui/GlassPanel';
import ConnectionModal from './ConnectionModal';

function isListenAddress(connString) {
  if (!connString) return false;
  const s = connString.replace(/^udp:\/\//, '');
  return /^(0\.0\.0\.0[:/]|:|^\d+$)/.test(s);
}

export default function DronePopover() {
  const drones = useDroneStore((s) => s.drones);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const setActiveDrone = useDroneStore((s) => s.setActiveDrone);
  const registerDrone = useDroneStore((s) => s.registerDrone);
  const removeDrone = useDroneStore((s) => s.removeDrone);
  const addAlert = useDroneStore((s) => s.addAlert);
  const closeDronePopover = useDroneStore((s) => s.closeDronePopover);
  const triggerZoomToDrone = useDroneStore((s) => s.triggerZoomToDrone);
  const setHomePosition = useDroneStore((s) => s.setHomePosition);
  const addToConnectionHistory = useDroneStore((s) => s.addToConnectionHistory);

  const [showModal, setShowModal] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = useCallback(async (connString, droneName, connType) => {
    const existing = Object.values(drones);
    if (existing.some((d) => d.connectionString === connString)) {
      addAlert('Already connected with this connection string', 'warning');
      return;
    }
    if (droneName && existing.some((d) => d.name === droneName)) {
      addAlert(`Name "${droneName}" is already in use`, 'warning');
      return;
    }

    setConnecting(true);
    try {
      const res = await fetch('/api/drones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_string: connString, name: droneName || undefined }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        registerDrone(data.drone_id, data.name, connString);
        addToConnectionHistory(data.name, connString, connType);
        addAlert(`Connected: ${data.name} (${data.autopilot})`, 'success');
        setShowModal(false);
        setTimeout(() => triggerZoomToDrone(), 500);

        const droneId = data.drone_id;
        const [missionRes, fenceRes, camerasRes] = await Promise.all([
          fetch(`/api/mission/download?drone_id=${droneId}`).catch(() => null),
          fetch(`/api/fence/download?drone_id=${droneId}`).catch(() => null),
          fetch(`/api/cameras?drone_id=${droneId}`).catch(() => null),
        ]);

        if (missionRes) {
          try {
            const missionData = await missionRes.json();
            if (missionData.status === 'ok' && missionData.waypoints?.length > 0) {
              useDroneStore.getState().setDroneMission(droneId, missionData.waypoints);
            }
          } catch {}
        }
        if (fenceRes) {
          try {
            const fenceData = await fenceRes.json();
            if (fenceData.status === 'ok' && fenceData.fence_items?.length > 0) {
              useDroneStore.getState().setDroneFence(droneId, fenceData.fence_items);
            }
          } catch {}
        }
        if (camerasRes) {
          try {
            const camerasData = await camerasRes.json();
            if (camerasData.status === 'ok') {
              useDroneStore.getState().setDroneCameras(droneId, camerasData.cameras || [], camerasData.gimbals || []);
            }
          } catch {}
        }
      } else {
        addAlert(data.error || 'Connection failed', 'error');
      }
    } catch (err) {
      addAlert('Connection failed: ' + err.message, 'error');
    }
    setConnecting(false);
  }, [drones, registerDrone, addAlert, triggerZoomToDrone, addToConnectionHistory]);

  const handleDisconnect = useCallback(async (droneId) => {
    try {
      await fetch(`/api/drones/${droneId}`, { method: 'DELETE' });
    } catch {}
    removeDrone(droneId);
    addAlert('Disconnected drone', 'info');
  }, [removeDrone, addAlert]);

  const handleReconnect = useCallback(async (drone) => {
    await handleDisconnect(drone.id);
    handleConnect(drone.connectionString, drone.name);
  }, [handleDisconnect, handleConnect]);

  const droneEntries = Object.entries(drones);

  return (
    <>
      <GlassPanel className="fixed top-14 left-3 z-[105] w-72 p-3 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Drones</span>
          <button onClick={closeDronePopover} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={14} />
          </button>
        </div>

        {droneEntries.length === 0 && (
          <div className="text-[11px] text-gray-600 italic text-center py-3">No drones connected</div>
        )}

        {droneEntries.map(([id, drone]) => {
          const isActive = id === activeDroneId;
          const connected = drone.telemetry?.heartbeat_age >= 0 && drone.telemetry?.heartbeat_age <= 5;
          return (
            <div
              key={id}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border transition-all cursor-pointer ${
                isActive
                  ? 'bg-gray-800/60 border-white/[0.1]'
                  : 'bg-gray-900/30 border-transparent hover:bg-gray-800/40'
              }`}
              onClick={() => {
                if (!isActive) {
                  setActiveDrone(id);
                  setHomePosition(null);
                  triggerZoomToDrone();
                }
              }}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                drone.linkLost ? 'bg-red-500 animate-pulse' :
                connected ? (drone.telemetry?.armed ? 'bg-red-500 animate-pulse' : 'bg-emerald-500') : 'bg-gray-600'
              }`} />
              <span className="text-[11px] font-medium text-gray-200 flex-1">{drone.name || id}</span>

              {drone.linkLost && !isListenAddress(drone.connectionString) && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleReconnect({ id, name: drone.name, connectionString: drone.connectionString }); }}
                  className="px-2 py-0.5 rounded text-[9px] font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition-colors"
                >
                  Reconnect
                </button>
              )}

              {isActive && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDisconnect(id); }}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                  title="Disconnect"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}

        <GlassButton color="gray" className="w-full flex items-center justify-center gap-1.5" onClick={() => setShowModal(true)}>
          <Plus size={12} />
          Add Drone
        </GlassButton>
      </GlassPanel>

      <ConnectionModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onConnect={handleConnect}
        connecting={connecting}
      />
    </>
  );
}
