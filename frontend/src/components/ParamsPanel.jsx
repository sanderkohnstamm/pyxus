import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { SlidersHorizontal, RefreshCw, Search, Check, X, Download, Shield, ChevronDown, ChevronUp } from 'lucide-react';
import useDroneStore, { EMPTY_OBJECT } from '../store/droneStore';
import { droneApi } from '../utils/api';

// Safety-critical parameter prefixes (must match backend CRITICAL_PARAM_PREFIXES)
const CRITICAL_PREFIXES = ['BATT_', 'FS_', 'ARMING_', 'MOT_', 'INS_'];

function isCriticalParam(name) {
  const upper = name.toUpperCase();
  return CRITICAL_PREFIXES.some((p) => upper.startsWith(p));
}

// Key safety parameters for ArduPilot and PX4
const SAFETY_PARAMS = {
  ardupilot: [
    { id: 'FS_THR_ENABLE', label: 'Throttle Failsafe', desc: '0=Disabled, 1=RTL, 2=Land' },
    { id: 'FS_THR_VALUE', label: 'Throttle FS PWM', desc: 'PWM below which FS triggers' },
    { id: 'FS_GCS_ENABLE', label: 'GCS Failsafe', desc: '0=Disabled, 1=RTL, 2=Land' },
    { id: 'FS_BATT_ENABLE', label: 'Battery Failsafe', desc: '0=Disabled, 1=Land, 2=RTL' },
    { id: 'FS_BATT_VOLTAGE', label: 'Battery FS Voltage', desc: 'Min voltage before FS' },
    { id: 'FS_BATT_MAH', label: 'Battery FS mAh', desc: 'Min remaining mAh' },
    { id: 'RTL_ALT', label: 'RTL Altitude', desc: 'Return altitude in cm' },
    { id: 'RTL_ALT_FINAL', label: 'RTL Final Altitude', desc: 'Loiter altitude after RTL in cm' },
    { id: 'FENCE_ENABLE', label: 'Fence Enable', desc: '0=Disabled, 1=Enabled' },
    { id: 'FENCE_TYPE', label: 'Fence Type', desc: '1=Alt, 2=Circle, 3=Both, 4=Polygon' },
    { id: 'FENCE_ALT_MAX', label: 'Fence Max Altitude', desc: 'Max altitude in meters' },
    { id: 'FENCE_RADIUS', label: 'Fence Radius', desc: 'Max radius in meters' },
    { id: 'FENCE_ACTION', label: 'Fence Action', desc: '0=Report, 1=RTL, 2=Land' },
    { id: 'ARMING_CHECK', label: 'Arming Checks', desc: '1=All, 0=Disabled' },
  ],
  px4: [
    { id: 'COM_DL_LOSS_T', label: 'Datalink Loss Timeout', desc: 'Seconds before link-loss FS' },
    { id: 'NAV_DLL_ACT', label: 'Datalink Loss Action', desc: '0=Disabled, 1=Loiter, 2=RTL, 3=Land' },
    { id: 'NAV_RCL_ACT', label: 'RC Loss Action', desc: '0=Disabled, 1=Loiter, 2=RTL, 3=Land' },
    { id: 'COM_LOW_BAT_ACT', label: 'Low Battery Action', desc: '0=None, 1=Warning, 2=RTL, 3=Land' },
    { id: 'BAT_LOW_THR', label: 'Low Battery Threshold', desc: 'Fraction (0-1) for low battery' },
    { id: 'BAT_CRIT_THR', label: 'Critical Battery Threshold', desc: 'Fraction (0-1) for critical' },
    { id: 'RTL_RETURN_ALT', label: 'RTL Return Altitude', desc: 'Altitude for RTL in meters' },
    { id: 'RTL_DESCEND_ALT', label: 'RTL Descend Altitude', desc: 'Descend altitude in meters' },
    { id: 'GF_ACTION', label: 'Geofence Action', desc: '0=None, 1=Warning, 2=Loiter, 3=RTL, 4=Land' },
    { id: 'GF_MAX_HOR_DIST', label: 'Geofence Max Horizontal', desc: 'Max horizontal distance in m' },
    { id: 'GF_MAX_VER_DIST', label: 'Geofence Max Vertical', desc: 'Max vertical distance in m' },
    { id: 'COM_ARM_WO_GPS', label: 'Arm Without GPS', desc: '0=Require GPS, 1=Allow' },
    { id: 'CBRK_IO_SAFETY', label: 'IO Safety Breaker', desc: '22027=Disable safety switch' },
  ],
};

function ParamRow({ name, param, meta, onSet, critical }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [expanded, setExpanded] = useState(false);

  const startEdit = (e) => {
    e.stopPropagation();
    setEditValue(String(param.value));
    setEditing(true);
  };

  const confirmEdit = () => {
    const val = parseFloat(editValue);
    if (!isNaN(val) && val !== param.value) {
      onSet(name, val);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') confirmEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  const hasDetails = meta && (meta.description || meta.range || meta.values || meta.bitmask);

  // Format value description if we have enum values
  const getValueLabel = () => {
    if (!meta?.values) return null;
    const intVal = Math.round(param.value);
    return meta.values[intVal] || meta.values[String(intVal)];
  };
  const valueLabel = getValueLabel();

  const handleRowClick = () => {
    if (!editing) {
      setExpanded(!expanded);
    }
  };

  return (
    <div className={`hover:bg-gray-800/40 group${critical ? ' border-l-2 border-amber-500/40 bg-amber-500/5' : ''}`}>
      <div
        className="flex items-center gap-2 px-3 py-1.5 cursor-pointer"
        onClick={handleRowClick}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-gray-300 truncate">
              {name}
            </span>
            {meta?.units && (
              <span className="text-[9px] text-gray-600">[{meta.units}]</span>
            )}
          </div>
          {meta?.displayName && (
            <div className="text-[9px] text-gray-600 truncate">{meta.displayName}</div>
          )}
        </div>
        {editing ? (
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="text-[9px] font-mono text-gray-600 tabular-nums" title="Current value">
              {Number.isInteger(param.value) ? param.value : param.value.toFixed(
                Math.abs(param.value) < 1 ? 6 : Math.abs(param.value) < 100 ? 4 : 2
              )}
            </span>
            <span className="text-gray-600 text-[9px]">&rarr;</span>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className="w-24 bg-gray-800 border border-cyan-500/50 rounded px-1.5 py-0.5 text-[11px] font-mono text-gray-200 text-right focus:outline-none"
            />
            <button onClick={confirmEdit} className="text-emerald-400 hover:text-emerald-300 p-0.5">
              <Check size={12} />
            </button>
            <button onClick={cancelEdit} className="text-red-400 hover:text-red-300 p-0.5">
              <X size={12} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              onClick={startEdit}
              className="text-[11px] font-mono text-cyan-300 cursor-pointer hover:text-cyan-200 tabular-nums"
              title="Click to edit"
            >
              {Number.isInteger(param.value) ? param.value : param.value.toFixed(
                Math.abs(param.value) < 1 ? 6 : Math.abs(param.value) < 100 ? 4 : 2
              )}
            </span>
            {valueLabel && (
              <span className="text-[9px] text-amber-400 truncate max-w-[80px]" title={valueLabel}>
                {valueLabel}
              </span>
            )}
            <ChevronDown size={10} className={`text-gray-600 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-2 text-[9px] text-gray-500 space-y-1 border-l-2 border-cyan-500/30 ml-3">
          {meta?.description ? (
            <div className="text-gray-400">{meta.description}</div>
          ) : (
            <div className="text-gray-600 italic">No description available</div>
          )}
          {meta?.range && (
            <div>Range: {meta.range.low ?? '?'} - {meta.range.high ?? '?'}{meta.increment ? ` (step ${meta.increment})` : ''}</div>
          )}
          {meta?.values && (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              {Object.entries(meta.values).map(([k, v]) => (
                <span key={k} className={String(param.value) === k || param.value == k ? 'text-cyan-400' : ''}>
                  {k}={v}
                </span>
              ))}
            </div>
          )}
          {meta?.bitmask && (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
              {Object.entries(meta.bitmask).map(([bit, label]) => {
                const isSet = (Math.floor(param.value) & (1 << parseInt(bit))) !== 0;
                return (
                  <span key={bit} className={isSet ? 'text-emerald-400' : ''}>
                    [{bit}]{label}
                  </span>
                );
              })}
            </div>
          )}
          {meta?.rebootRequired && (
            <div className="text-amber-500">⚠ Reboot required</div>
          )}
          <div className="text-gray-600 pt-1">
            Type: {param.type ?? 'unknown'} | Index: {param.index ?? '?'}
          </div>
        </div>
      )}
    </div>
  );
}

function SafetySection({ params, autopilot, onSet }) {
  const [expanded, setExpanded] = useState(true);
  const safetyDefs = autopilot === 'ardupilot' ? SAFETY_PARAMS.ardupilot : SAFETY_PARAMS.px4;

  // Only show params that exist in the loaded param set
  const available = safetyDefs.filter((s) => params[s.id] !== undefined);
  if (available.length === 0) return null;

  return (
    <div className="border-b border-gray-800/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-gray-800/30 transition-colors"
      >
        <Shield size={11} className="text-amber-500" />
        <span className="text-[10px] text-amber-400 uppercase tracking-wider font-semibold">Safety</span>
        <span className="text-[9px] text-gray-600 ml-1">({available.length})</span>
        {expanded ? (
          <ChevronUp size={10} className="text-gray-600 ml-auto" />
        ) : (
          <ChevronDown size={10} className="text-gray-600 ml-auto" />
        )}
      </button>

      {expanded && (
        <div className="divide-y divide-gray-800/30">
          {available.map((def) => {
            const param = params[def.id];
            return (
              <div key={def.id}>
                <div className="px-3 pt-1 pb-0">
                  <span className="text-[9px] text-gray-600 truncate">{def.desc}</span>
                </div>
                <ParamRow name={def.id} param={param} onSet={onSet} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ParamsPanel() {
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const params = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.params ?? EMPTY_OBJECT : EMPTY_OBJECT);
  const paramsTotal = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.paramsTotal : 0) || 0;
  const setDroneParams = useDroneStore((s) => s.setDroneParams);
  const addAlert = useDroneStore((s) => s.addAlert);
  const autopilot = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.autopilot : 'unknown') || 'unknown';
  const platformType = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.platform_type : 'Unknown') || 'Unknown';
  const paramMeta = useDroneStore((s) => s.paramMeta);
  const paramMetaLoading = useDroneStore((s) => s.paramMetaLoading);
  const fetchParamMeta = useDroneStore((s) => s.fetchParamMeta);

  const [search, setSearch] = useState('');
  const isConnected = !!activeDroneId;
  const paramCount = Object.keys(params).length;
  const paramsLoading = paramCount < paramsTotal && paramsTotal > 0;
  const metaCount = Object.keys(paramMeta).length;

  // Fetch parameter metadata when connected and platform type is known
  useEffect(() => {
    if (isConnected && platformType && platformType !== 'Unknown') {
      fetchParamMeta(platformType, autopilot);
    }
  }, [isConnected, platformType, autopilot, fetchParamMeta]);

  const fetchParams = useCallback(async () => {
    const droneId = useDroneStore.getState().activeDroneId;
    if (!droneId) return;
    try {
      const res = await fetch(droneApi('/api/params'));
      const data = await res.json();
      if (data.status === 'ok') {
        setDroneParams(droneId, data.params, data.total);
      }
    } catch {}
  }, [setDroneParams]);

  const requestRefresh = useCallback(async () => {
    if (!isConnected) return;
    try {
      await fetch(droneApi('/api/params/refresh'), { method: 'POST' });
      addAlert('Requesting parameters...', 'info');
    } catch (err) {
      addAlert('Failed to request params', 'error');
    }
  }, [isConnected, addAlert]);

  const sendParamSet = useCallback(async (paramId, value, confirm = false) => {
    const res = await fetch(droneApi('/api/params/set'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ param_id: paramId, value, confirm }),
    });
    return res.json();
  }, []);

  const handleSet = useCallback(async (paramId, value) => {
    try {
      const data = await sendParamSet(paramId, value);
      if (data.status === 'confirm_required') {
        // Show native confirmation dialog for safety-critical params
        const confirmed = window.confirm(
          `Safety Warning\n\n${data.warning}\n\nAre you sure you want to set ${paramId} = ${value}?`
        );
        if (confirmed) {
          const confirmData = await sendParamSet(paramId, value, true);
          if (confirmData.status === 'ok') {
            addAlert(`${paramId} = ${value} (confirmed)`, 'success');
            setTimeout(fetchParams, 500);
          } else {
            addAlert(confirmData.error || 'Failed to set param', 'error');
          }
        } else {
          addAlert(`${paramId} change cancelled`, 'info');
        }
      } else if (data.status === 'ok') {
        addAlert(`${paramId} = ${value}`, 'success');
        setTimeout(fetchParams, 500);
      } else {
        addAlert(data.error || 'Failed to set param', 'error');
      }
    } catch (err) {
      addAlert('Failed to set param', 'error');
    }
  }, [addAlert, fetchParams, sendParamSet]);

  // Poll params with visibility detection and adaptive interval
  useEffect(() => {
    if (!isConnected) return;

    let interval = null;
    const startPolling = () => {
      fetchParams();
      // Poll faster while loading, slower when loaded
      const pollInterval = paramsLoading ? 1000 : 5000;
      interval = setInterval(() => {
        // Only fetch if document is visible
        if (!document.hidden) {
          fetchParams();
        }
      }, pollInterval);
    };

    const handleVisibility = () => {
      if (!document.hidden && !interval) {
        startPolling();
      } else if (document.hidden && interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isConnected, fetchParams, paramsLoading]);

  const handleDownload = useCallback(() => {
    const entries = Object.entries(params).sort((a, b) => a[0].localeCompare(b[0]));
    const lines = entries.map(([name, p]) => `${name}\t${p.value}`);
    const content = lines.join('\n') + '\n';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `params_${new Date().toISOString().slice(0, 10)}.param`;
    a.click();
    URL.revokeObjectURL(url);
    addAlert(`Downloaded ${entries.length} parameters`, 'success');
  }, [params, addAlert]);

  const filtered = useMemo(() => {
    const entries = Object.entries(params);
    if (!search.trim()) return entries.sort((a, b) => a[0].localeCompare(b[0]));
    const q = search.toUpperCase();
    return entries
      .filter(([name]) => {
        // Search in param name
        if (name.toUpperCase().includes(q)) return true;
        // Search in metadata description and display name
        const meta = paramMeta[name];
        if (meta) {
          if (meta.displayName?.toUpperCase().includes(q)) return true;
          if (meta.description?.toUpperCase().includes(q)) return true;
        }
        return false;
      })
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [params, search, paramMeta]);

  if (!isConnected) {
    return (
      <div className="p-4">
        <div className="text-xs text-gray-600 italic text-center py-8">
          Connect to a vehicle to view parameters
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-800/50">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <SlidersHorizontal size={13} className="text-gray-500" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Parameters</span>
            <span className="text-[10px] text-gray-600 ml-1">
              ({paramCount}{paramsTotal > 0 ? `/${paramsTotal}` : ''})
            </span>
          </div>
          <div className="flex items-center gap-1">
            {paramCount > 0 && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all border bg-gray-800/60 text-gray-400 hover:text-gray-200 border-gray-700/50 hover:border-gray-600/50"
              >
                <Download size={10} />
              </button>
            )}
            <button
              onClick={requestRefresh}
              disabled={paramsLoading}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-all border ${
                paramsLoading
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                  : 'bg-gray-800/60 text-gray-400 hover:text-gray-200 border-gray-700/50 hover:border-gray-600/50'
              }`}
            >
              <RefreshCw size={10} className={paramsLoading ? 'animate-spin' : ''} />
              {paramsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parameters..."
            className="w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded-md pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Param list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Safety section */}
        {paramCount > 0 && (
          <SafetySection params={params} autopilot={autopilot} onSet={handleSet} />
        )}

        {paramCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-600">
            <SlidersHorizontal size={24} className="mb-2 opacity-40" />
            <div className="text-xs italic">No parameters loaded</div>
            <div className="text-[10px] italic mt-1 opacity-60">Click Refresh to fetch from vehicle</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-gray-600 italic text-center py-8">
            No parameters match "{search}"
          </div>
        ) : (
          <div className="divide-y divide-gray-800/30">
            {filtered.map(([name, param]) => (
              <ParamRow key={name} name={name} param={param} meta={paramMeta[name]} onSet={handleSet} critical={isCriticalParam(name)} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {paramCount > 0 && (
        <div className="px-3 py-2 border-t border-gray-800/50 text-[10px] text-gray-600 flex justify-between items-center">
          <span>{filtered.length} of {paramCount} parameters shown</span>
          {paramMetaLoading ? (
            <span className="text-amber-400">Loading descriptions...</span>
          ) : metaCount > 0 ? (
            <span className="text-emerald-400">{metaCount} descriptions</span>
          ) : autopilot === 'ardupilot' ? (
            <span className="text-gray-600">No metadata</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
