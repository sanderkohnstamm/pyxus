import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { SlidersHorizontal, RefreshCw, Search, Check, X } from 'lucide-react';
import useDroneStore from '../store/droneStore';

function ParamRow({ name, param, onSet }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const startEdit = () => {
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

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800/40 group">
      <span className="text-[11px] font-mono text-gray-300 truncate flex-1 min-w-0">
        {name}
      </span>
      {editing ? (
        <div className="flex items-center gap-1 shrink-0">
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
        <span
          onClick={startEdit}
          className="text-[11px] font-mono text-cyan-300 cursor-pointer hover:text-cyan-200 tabular-nums shrink-0"
          title="Click to edit"
        >
          {Number.isInteger(param.value) ? param.value : param.value.toFixed(
            Math.abs(param.value) < 1 ? 6 : Math.abs(param.value) < 100 ? 4 : 2
          )}
        </span>
      )}
    </div>
  );
}

export default function ParamsPanel() {
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const params = useDroneStore((s) => s.params);
  const paramsTotal = useDroneStore((s) => s.paramsTotal);
  const paramsLoading = useDroneStore((s) => s.paramsLoading);
  const setParams = useDroneStore((s) => s.setParams);
  const setParamsLoading = useDroneStore((s) => s.setParamsLoading);
  const addAlert = useDroneStore((s) => s.addAlert);

  const [search, setSearch] = useState('');
  const isConnected = connectionStatus === 'connected';
  const paramCount = Object.keys(params).length;

  const fetchParams = useCallback(async () => {
    try {
      const res = await fetch('/api/params');
      const data = await res.json();
      if (data.status === 'ok') {
        setParams(data.params, data.total);
      }
    } catch {}
  }, [setParams]);

  const requestRefresh = useCallback(async () => {
    if (!isConnected) return;
    setParamsLoading(true);
    try {
      await fetch('/api/params/refresh', { method: 'POST' });
      addAlert('Requesting parameters...', 'info');
    } catch (err) {
      addAlert('Failed to request params', 'error');
    }
  }, [isConnected, setParamsLoading, addAlert]);

  const handleSet = useCallback(async (paramId, value) => {
    try {
      const res = await fetch('/api/params/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ param_id: paramId, value }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        addAlert(`${paramId} = ${value}`, 'success');
        // Refresh after a short delay to get updated value
        setTimeout(fetchParams, 500);
      } else {
        addAlert(data.error || 'Failed to set param', 'error');
      }
    } catch (err) {
      addAlert('Failed to set param', 'error');
    }
  }, [addAlert, fetchParams]);

  // Poll params periodically when loading
  useEffect(() => {
    if (!isConnected) return;
    fetchParams();
    const interval = setInterval(fetchParams, 2000);
    return () => clearInterval(interval);
  }, [isConnected, fetchParams]);

  // Stop loading indicator when all params received
  useEffect(() => {
    if (paramsLoading && paramsTotal > 0 && paramCount >= paramsTotal) {
      setParamsLoading(false);
    }
  }, [paramsLoading, paramsTotal, paramCount, setParamsLoading]);

  const filtered = useMemo(() => {
    const entries = Object.entries(params);
    if (!search.trim()) return entries.sort((a, b) => a[0].localeCompare(b[0]));
    const q = search.toUpperCase();
    return entries
      .filter(([name]) => name.toUpperCase().includes(q))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [params, search]);

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
              <ParamRow key={name} name={name} param={param} onSet={handleSet} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {paramCount > 0 && (
        <div className="px-3 py-2 border-t border-gray-800/50 text-[10px] text-gray-600">
          {filtered.length} of {paramCount} parameters shown
        </div>
      )}
    </div>
  );
}
