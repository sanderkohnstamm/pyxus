import React, { useCallback } from 'react';
import { Marker, Popup } from '@vis.gl/react-maplibre';
import useDroneStore from '../store/droneStore';
import { formatCoord } from '../utils/formatCoord';
import { droneApi } from '../utils/api';

export default function FlyClickTarget() {
  const flyClickTarget = useDroneStore((s) => s.flyClickTarget);
  const clearFlyClickTarget = useDroneStore((s) => s.clearFlyClickTarget);
  const setHomePosition = useDroneStore((s) => s.setHomePosition);
  const startQuickMission = useDroneStore((s) => s.startQuickMission);
  const alt = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.alt : 0) || 0;
  const addAlert = useDroneStore((s) => s.addAlert);
  const addGcsLog = useDroneStore((s) => s.addGcsLog);
  const coordFormat = useDroneStore((s) => s.coordFormat);

  const handleGoto = useCallback(async () => {
    const target = useDroneStore.getState().flyClickTarget;
    if (!target) return;
    try {
      const res = await fetch(droneApi('/api/goto'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: target.lat, lon: target.lon, alt }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Go To failed', 'error');
        addGcsLog(`Go To: ${data.error || 'failed'}`, 'error');
      } else {
        addAlert('Going to location', 'success');
        addGcsLog(`Go To location at ${alt.toFixed(0)}m`, 'info');
      }
    } catch (err) {
      addAlert('Go To failed: ' + err.message, 'error');
      addGcsLog(`Go To: ${err.message}`, 'error');
    }
    clearFlyClickTarget();
  }, [alt, addAlert, addGcsLog, clearFlyClickTarget]);

  const handleRoi = useCallback(async () => {
    const target = useDroneStore.getState().flyClickTarget;
    if (!target) return;
    try {
      const res = await fetch(droneApi('/api/roi'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: target.lat, lon: target.lon }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Look At failed', 'error');
        addGcsLog(`Look At: ${data.error || 'failed'}`, 'error');
      } else {
        addAlert('Looking at location', 'success');
        addGcsLog('Look At (ROI) set', 'info');
      }
    } catch (err) {
      addAlert('Look At failed: ' + err.message, 'error');
      addGcsLog(`Look At: ${err.message}`, 'error');
    }
    clearFlyClickTarget();
  }, [addAlert, addGcsLog, clearFlyClickTarget]);

  const handleSetHome = useCallback(async () => {
    const target = useDroneStore.getState().flyClickTarget;
    const currentHome = useDroneStore.getState().homePosition;
    const altMsl = useDroneStore.getState().activeDroneId
      ? useDroneStore.getState().drones[useDroneStore.getState().activeDroneId]?.telemetry?.alt_msl || 0
      : 0;
    if (!target) return;

    let homeAlt = altMsl;
    try {
      const elevRes = await fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${target.lat}&longitude=${target.lon}`
      );
      const elevData = await elevRes.json();
      if (elevData.elevation && elevData.elevation[0] !== undefined) {
        homeAlt = elevData.elevation[0];
      } else if (currentHome && currentHome.alt) {
        homeAlt = currentHome.alt;
      }
    } catch {
      if (currentHome && currentHome.alt) homeAlt = currentHome.alt;
    }

    try {
      const res = await fetch(droneApi('/api/home/set'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: target.lat, lon: target.lon, alt: homeAlt }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Set Home failed', 'error');
        addGcsLog(`Set Home: ${data.error || 'failed'}`, 'error');
      } else {
        setHomePosition({ lat: target.lat, lon: target.lon, alt: homeAlt });
        addAlert(`Home position set (alt: ${homeAlt.toFixed(1)}m)`, 'success');
        addGcsLog(`Home set at ${homeAlt.toFixed(1)}m MSL`, 'info');
      }
    } catch (err) {
      addAlert('Set Home failed: ' + err.message, 'error');
      addGcsLog(`Set Home: ${err.message}`, 'error');
    }
    clearFlyClickTarget();
  }, [addAlert, addGcsLog, clearFlyClickTarget, setHomePosition]);

  const handleQuickMission = useCallback(() => {
    const target = useDroneStore.getState().flyClickTarget;
    if (!target) return;
    startQuickMission(target.lat, target.lon);
    addGcsLog('Quick Mission mode started', 'info');
  }, [startQuickMission, addGcsLog]);

  if (!flyClickTarget) return null;

  const btnStyle = {
    flex: 1,
    padding: '6px 8px',
    fontSize: '10px',
    fontWeight: 600,
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    textAlign: 'center',
  };

  return (
    <>
      <Marker
        longitude={flyClickTarget.lon}
        latitude={flyClickTarget.lat}
        anchor="center"
      >
        <div style={{
          width: 12, height: 12,
          border: '2px solid #f97316',
          borderRadius: '50%',
          background: 'rgba(249,115,22,0.3)',
        }} />
      </Marker>
      <Popup
        longitude={flyClickTarget.lon}
        latitude={flyClickTarget.lat}
        anchor="bottom"
        onClose={clearFlyClickTarget}
        closeButton={true}
        maxWidth="200px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px' }}>
          <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px', textAlign: 'center' }}>
            {formatCoord(flyClickTarget.lat, flyClickTarget.lon, coordFormat, 6)}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={handleGoto} style={{ ...btnStyle, background: '#06b6d4' }}>Go To</button>
            <button onClick={handleRoi} style={{ ...btnStyle, background: '#f59e0b' }}>Look At</button>
          </div>
          <button onClick={handleSetHome} style={{ ...btnStyle, background: '#10b981' }}>Set Home/Return</button>
          <button onClick={handleQuickMission} style={{ ...btnStyle, background: '#8b5cf6' }}>Quick Mission</button>
        </div>
      </Popup>
    </>
  );
}
