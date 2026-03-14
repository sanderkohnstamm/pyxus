import React, { useCallback, useState } from 'react';
import { Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import useDroneStore from '../store/droneStore';
import { droneApi } from '../utils/api';
import { haversineDistance, bearing } from '../utils/geo';
import { formatCoord } from '../utils/formatCoord';
import { Zap } from 'lucide-react';
import { createWaypointIcon, flyTargetIcon } from './mapIcons';
import { JumpArrows } from './MissionOverlays';

// Servo group quick action buttons
export function ServoGroupButtons() {
  const servoGroups = useDroneStore((s) => s.servoGroups);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const addAlert = useDroneStore((s) => s.addAlert);
  const [groupStates, setGroupStates] = React.useState({});

  if (!activeDroneId || servoGroups.length === 0) return null;

  const toggleGroup = async (group) => {
    const currentState = groupStates[group.id] || 'closed';
    const isOpen = currentState === 'open';
    const pwm = isOpen ? group.closePwm : group.openPwm;

    try {
      await fetch(droneApi('/api/servo/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servo: group.servo, pwm }),
      });
      setGroupStates(prev => ({ ...prev, [group.id]: isOpen ? 'closed' : 'open' }));
      addAlert(`${group.name}: ${isOpen ? 'Closed' : 'Opened'}`, 'info');
    } catch (err) {
      addAlert(`Servo command failed: ${err.message}`, 'error');
    }
  };

  return (
    <div className="absolute top-12 right-3 z-[1000] flex flex-col gap-1.5">
      {servoGroups.map((group) => {
        const isOpen = groupStates[group.id] === 'open';
        return (
          <button
            key={group.id}
            onClick={() => toggleGroup(group)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all border backdrop-blur-md shadow-lg ${
              isOpen
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                : 'bg-gray-900/60 text-gray-400 hover:text-gray-200 border-gray-700/40'
            }`}
          >
            {group.name}
            {group.hotkey && (
              <span className="ml-1.5 text-[9px] opacity-60">({group.hotkey.toUpperCase()})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Measure overlay: line + distance/bearing label
export function MeasureOverlay() {
  const measurePoints = useDroneStore((s) => s.measurePoints);

  if (measurePoints.length === 0) return null;

  const dotIcon = (color = '#f97316') => L.divIcon({
    html: `<div style="width:10px;height:10px;background:${color};border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    className: '',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });

  return (
    <>
      {measurePoints.map((p, i) => (
        <Marker key={`measure-${i}`} position={[p.lat, p.lon]} icon={dotIcon()} />
      ))}

      {measurePoints.length === 2 && (() => {
        const [a, b] = measurePoints;
        const dist = haversineDistance(a.lat, a.lon, b.lat, b.lon);
        const brng = bearing(a.lat, a.lon, b.lat, b.lon);
        const midLat = (a.lat + b.lat) / 2;
        const midLon = (a.lon + b.lon) / 2;
        const distStr = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`;

        const labelIcon = L.divIcon({
          html: `<div style="display:inline-block;white-space:nowrap;background:rgba(15,23,42,0.85);color:#fb923c;padding:3px 7px;border-radius:4px;font-size:11px;font-weight:600;font-family:monospace;border:1px solid rgba(249,115,22,0.4);box-shadow:0 2px 8px rgba(0,0,0,0.3)">${distStr} | ${brng.toFixed(0)}&deg;</div>`,
          className: '',
          iconSize: [0, 0],
          iconAnchor: [0, -8],
        });

        return (
          <>
            <Polyline
              positions={[[a.lat, a.lon], [b.lat, b.lon]]}
              pathOptions={{ color: '#f97316', weight: 2.5, opacity: 0.9, dashArray: '6 4' }}
            />
            <Marker position={[midLat, midLon]} icon={labelIcon} />
          </>
        );
      })()}
    </>
  );
}

// Fly mode click target marker with Go To / Look At / Set Home
export function FlyClickTarget() {
  const flyClickTarget = useDroneStore((s) => s.flyClickTarget);
  const clearFlyClickTarget = useDroneStore((s) => s.clearFlyClickTarget);
  const setHomePosition = useDroneStore((s) => s.setHomePosition);
  const startQuickMission = useDroneStore((s) => s.startQuickMission);
  const alt = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.alt : 0) || 0;
  const addAlert = useDroneStore((s) => s.addAlert);
  const addGcsLog = useDroneStore((s) => s.addGcsLog);

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
    const altMsl = useDroneStore.getState().telemetry.alt_msl || 0;
    if (!target) return;

    // Try to get ground elevation from Open-Meteo API
    let alt = altMsl; // Default fallback
    try {
      const elevRes = await fetch(
        `https://api.open-meteo.com/v1/elevation?latitude=${target.lat}&longitude=${target.lon}`
      );
      const elevData = await elevRes.json();
      if (elevData.elevation && elevData.elevation[0] !== undefined) {
        alt = elevData.elevation[0];
      } else if (currentHome && currentHome.alt) {
        // Fall back to current home altitude
        alt = currentHome.alt;
      }
    } catch {
      // If terrain fetch fails, use current home alt or alt_msl
      if (currentHome && currentHome.alt) {
        alt = currentHome.alt;
      }
    }

    try {
      const res = await fetch(droneApi('/api/home/set'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: target.lat, lon: target.lon, alt }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Set Home failed', 'error');
        addGcsLog(`Set Home: ${data.error || 'failed'}`, 'error');
      } else {
        setHomePosition({ lat: target.lat, lon: target.lon, alt });
        addAlert(`Home position set (alt: ${alt.toFixed(1)}m)`, 'success');
        addGcsLog(`Home set at ${alt.toFixed(1)}m MSL`, 'info');
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
    <Marker position={[flyClickTarget.lat, flyClickTarget.lon]} icon={flyTargetIcon}>
      <Popup eventHandlers={{ remove: clearFlyClickTarget }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px' }}>
          <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px', textAlign: 'center' }}>
            {formatCoord(flyClickTarget.lat, flyClickTarget.lon, useDroneStore.getState().coordFormat, 6)}
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={handleGoto} style={{ ...btnStyle, background: '#06b6d4' }}>
              Go To
            </button>
            <button onClick={handleRoi} style={{ ...btnStyle, background: '#f59e0b' }}>
              Look At
            </button>
          </div>
          <button onClick={handleSetHome} style={{ ...btnStyle, background: '#10b981' }}>
            Set Home/Return
          </button>
          <button onClick={handleQuickMission} style={{ ...btnStyle, background: '#8b5cf6' }}>
            Quick Mission
          </button>
        </div>
      </Popup>
    </Marker>
  );
}

// Quick mission waypoint markers (fly mode fast mission)
export function QuickMissionMarkers() {
  const quickMissionMode = useDroneStore((s) => s.quickMissionMode);
  const quickMissionWaypoints = useDroneStore((s) => s.quickMissionWaypoints);
  const addQuickMissionJump = useDroneStore((s) => s.addQuickMissionJump);

  if (!quickMissionMode || quickMissionWaypoints.length === 0) return null;

  // Only position-based entries for markers / polyline
  const navWaypoints = quickMissionWaypoints.filter(w => w.type !== 'do_jump');
  const positions = navWaypoints.map(w => [w.lat, w.lon]);

  // Build full list with positions for JumpArrows (map 1-based index to the full array)
  const jumpArrowData = quickMissionWaypoints.map(wp => {
    if (wp.type === 'do_jump') {
      return { ...wp, param1: wp.jumpTarget, param2: wp.repeat };
    }
    return { ...wp, type: wp.type || 'waypoint' };
  });

  return (
    <>
      {quickMissionWaypoints.map((wp, i) => {
        if (wp.type === 'do_jump') return null;
        return (
          <Marker
            key={wp.id}
            position={[wp.lat, wp.lon]}
            icon={createWaypointIcon(i, 'waypoint')}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">Quick WP {i + 1}</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    addQuickMissionJump(i + 1);
                  }}
                  style={{
                    marginTop: '4px',
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
              </div>
            </Popup>
          </Marker>
        );
      })}
      {positions.length > 1 && (
        <Polyline
          positions={positions}
          pathOptions={{ color: '#8b5cf6', weight: 2.5, opacity: 0.8, dashArray: '6 3' }}
        />
      )}
      <JumpArrows waypoints={jumpArrowData} />
    </>
  );
}

// Quick mission bottom overlay bar (send / undo / cancel)
export function QuickMissionOverlay() {
  const quickMissionMode = useDroneStore((s) => s.quickMissionMode);
  const quickMissionWaypoints = useDroneStore((s) => s.quickMissionWaypoints);
  const cancelQuickMission = useDroneStore((s) => s.cancelQuickMission);
  const removeLastQuickMissionWaypoint = useDroneStore((s) => s.removeLastQuickMissionWaypoint);
  const alt = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.alt : 0) || 0;
  const addAlert = useDroneStore((s) => s.addAlert);
  const addGcsLog = useDroneStore((s) => s.addGcsLog);
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    const store = useDroneStore.getState();
    const wps = store.quickMissionWaypoints;
    const activeDrone = store.activeDroneId ? store.drones[store.activeDroneId] : null;
    const currentAlt = activeDrone?.telemetry?.alt || 0;
    if (wps.length === 0) return;

    setSending(true);
    const waypoints = wps.map(wp => {
      if (wp.type === 'do_jump') {
        return {
          lat: 0, lon: 0, alt: 0,
          item_type: 'do_jump',
          param1: wp.jumpTarget,
          param2: wp.repeat ?? -1,
        };
      }
      return {
        lat: wp.lat,
        lon: wp.lon,
        alt: currentAlt,
        item_type: 'waypoint',
      };
    });

    try {
      const res = await fetch(droneApi('/api/mission/upload'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waypoints }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Quick mission upload failed', 'error');
        addGcsLog(`Quick mission: ${data.error || 'upload failed'}`, 'error');
      } else {
        addAlert(`Quick mission uploaded (${wps.length} pts)`, 'success');
        addGcsLog(`Quick mission uploaded: ${wps.length} pts at ${currentAlt.toFixed(0)}m`, 'info');

        // Save as mission in savedMissions
        const now = Date.now();
        const navCount = wps.filter(w => w.type !== 'do_jump').length;
        const missionWaypoints = wps.map((wp, i) => {
          if (wp.type === 'do_jump') {
            return {
              lat: 0, lon: 0, alt: 0,
              id: now + i, type: 'do_jump',
              param1: wp.jumpTarget, param2: wp.repeat ?? -1, param3: 0, param4: 0,
            };
          }
          return {
            lat: wp.lat, lon: wp.lon, alt: currentAlt,
            id: now + i, type: 'waypoint',
            param1: 0, param2: 2, param3: 0, param4: 0,
          };
        });
        const newMission = {
          id: now,
          name: `Quick ${new Date().toLocaleTimeString('en-GB', { hour12: false })}`,
          waypoints: missionWaypoints,
          defaults: { alt: currentAlt, speed: store.defaultSpeed },
          createdAt: now,
          updatedAt: now,
        };
        const updated = [...store.savedMissions, newMission];
        localStorage.setItem('pyxus-saved-missions', JSON.stringify(updated));
        useDroneStore.setState({ savedMissions: updated });

        // Download mission from drone to sync display
        try {
          const dlRes = await fetch(droneApi('/api/mission/download'));
          const dlData = await dlRes.json();
          if (dlData.status === 'ok' && store.activeDroneId) {
            useDroneStore.getState().setDroneMission(store.activeDroneId, dlData.waypoints || []);
          }
        } catch {}

        store.cancelQuickMission();
      }
    } catch (err) {
      addAlert('Quick mission failed: ' + err.message, 'error');
      addGcsLog(`Quick mission: ${err.message}`, 'error');
    }
    setSending(false);
  }, [addAlert, addGcsLog]);

  if (!quickMissionMode) return null;

  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[1001] bg-gray-900/80 backdrop-blur-md rounded-lg border border-violet-500/30 shadow-2xl px-4 py-2.5 flex items-center gap-3">
      <Zap size={14} className="text-violet-400" />
      <span className="text-violet-300 text-xs font-semibold">Quick Mission</span>
      <span className="text-gray-400 text-xs tabular-nums">
        {quickMissionWaypoints.filter(w => w.type !== 'do_jump').length} pts
        {quickMissionWaypoints.some(w => w.type === 'do_jump') && (
          <span className="text-pink-400"> +{quickMissionWaypoints.filter(w => w.type === 'do_jump').length} jump</span>
        )}
        <span> @ {alt.toFixed(0)}m</span>
      </span>
      <div className="w-px h-4 bg-gray-700/30" />
      <div className="flex items-center gap-1.5">
        <button
          onClick={removeLastQuickMissionWaypoint}
          disabled={quickMissionWaypoints.length <= 1}
          className="px-2 py-1 rounded text-[10px] font-medium bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 border border-gray-700/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          Undo
        </button>
        <button
          onClick={handleSend}
          disabled={sending}
          className="px-3 py-1 rounded text-[10px] font-semibold bg-violet-600/80 hover:bg-violet-500/80 text-white border border-violet-500/30 transition-all disabled:opacity-50"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
        <button
          onClick={cancelQuickMission}
          className="px-2 py-1 rounded text-[10px] font-medium bg-red-950/50 hover:bg-red-900/50 text-red-400 border border-red-800/30 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
