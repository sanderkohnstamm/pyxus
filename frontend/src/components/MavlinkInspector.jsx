import React, { useState, useEffect, useCallback } from 'react';
import { Radio, Trash2, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import useDroneStore from '../store/droneStore';

// Component ID to name mapping
const COMPONENT_NAMES = {
  0: 'ALL',
  1: 'AUTOPILOT',
  25: 'GPS',
  26: 'GPS2',
  100: 'CAMERA',
  154: 'GIMBAL',
  190: 'COMP_MANAGER',
  191: 'ONBOARD_COMP',
  240: 'MISSIONPLNR',
};

function getComponentName(compId) {
  return COMPONENT_NAMES[compId] || `COMP_${compId}`;
}

function MessageRow({ msg, expanded, onToggle }) {
  const hasData = msg.last_data && Object.keys(msg.last_data).length > 0;
  const isStale = msg.age > 5;

  return (
    <div className="border-b border-gray-800/50 last:border-b-0">
      <div
        className={`flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800/30 cursor-pointer ${
          isStale ? 'opacity-50' : ''
        }`}
        onClick={onToggle}
      >
        <button className="text-gray-600 hover:text-gray-400 p-0.5">
          {hasData ? (
            expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />
          ) : (
            <span className="w-[10px]" />
          )}
        </button>

        <span className="text-[10px] font-mono font-semibold text-cyan-400 w-[140px] truncate">
          {msg.msg_type}
        </span>

        <span className="text-[9px] font-mono text-gray-500 w-[60px]">
          {msg.src_system}:{msg.src_component}
        </span>

        <span className="text-[9px] text-gray-600 w-[70px]">
          {getComponentName(msg.src_component)}
        </span>

        <span
          className={`text-[10px] font-mono w-[50px] text-right ${
            msg.rate > 10 ? 'text-emerald-400' : msg.rate > 1 ? 'text-amber-400' : 'text-gray-500'
          }`}
        >
          {msg.rate > 0 ? `${msg.rate} Hz` : '-'}
        </span>

        <span className="text-[10px] font-mono text-gray-600 w-[60px] text-right">
          {msg.count.toLocaleString()}
        </span>

        <span
          className={`text-[9px] font-mono w-[45px] text-right ${
            msg.age < 1 ? 'text-emerald-400' : msg.age < 5 ? 'text-gray-400' : 'text-red-400'
          }`}
        >
          {msg.age >= 0 ? `${msg.age}s` : '-'}
        </span>
      </div>

      {expanded && hasData && (
        <div className="px-3 py-2 bg-gray-900/50 border-t border-gray-800/30">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(msg.last_data).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 overflow-hidden">
                <span className="text-[9px] text-gray-500 shrink-0">{key}:</span>
                <span className="text-[9px] font-mono text-gray-300 truncate">
                  {typeof value === 'number'
                    ? Number.isInteger(value)
                      ? value.toLocaleString()
                      : value.toFixed(4)
                    : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MavlinkInspector() {
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const isConnected = connectionStatus === 'connected';

  const [messages, setMessages] = useState([]);
  const [targetSystem, setTargetSystem] = useState(null);
  const [targetComponent, setTargetComponent] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});
  const [filter, setFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!isConnected) return;
    try {
      const res = await fetch('/api/mavlink/stats');
      const data = await res.json();
      if (data.status === 'ok') {
        setMessages(data.messages || []);
        setTargetSystem(data.target_system);
        setTargetComponent(data.target_component);
      }
    } catch (err) {
      console.error('Failed to fetch MAVLink stats:', err);
    }
  }, [isConnected]);

  const clearStats = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      await fetch('/api/mavlink/stats/clear', { method: 'POST' });
      setMessages([]);
    } catch (err) {
      console.error('Failed to clear stats:', err);
    }
    setLoading(false);
  }, [isConnected]);

  // Auto-refresh
  useEffect(() => {
    if (!isConnected || !autoRefresh) return;
    fetchStats();
    const interval = setInterval(fetchStats, 1000);
    return () => clearInterval(interval);
  }, [isConnected, autoRefresh, fetchStats]);

  const toggleRow = useCallback((key) => {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Filter messages
  const filteredMessages = messages.filter((msg) => {
    if (!filter) return true;
    const searchLower = filter.toLowerCase();
    return (
      msg.msg_type.toLowerCase().includes(searchLower) ||
      getComponentName(msg.src_component).toLowerCase().includes(searchLower)
    );
  });

  // Group by source
  const groupedMessages = filteredMessages.reduce((acc, msg) => {
    const key = `${msg.src_system}:${msg.src_component}`;
    if (!acc[key]) {
      acc[key] = {
        system: msg.src_system,
        component: msg.src_component,
        name: getComponentName(msg.src_component),
        messages: [],
        totalRate: 0,
      };
    }
    acc[key].messages.push(msg);
    acc[key].totalRate += msg.rate;
    return acc;
  }, {});

  if (!isConnected) {
    return (
      <div className="p-4">
        <div className="text-xs text-gray-600 italic text-center py-8">
          Connect to a vehicle to inspect MAVLink messages
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-gray-800/50 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio size={12} className="text-cyan-500" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
              MAVLink Inspector
            </span>
            {targetSystem && (
              <span className="text-[9px] text-gray-600">
                Target: {targetSystem}:{targetComponent}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium transition-all ${
                autoRefresh
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-gray-800/60 text-gray-500 border border-gray-700/50'
              }`}
            >
              <RefreshCw size={9} className={autoRefresh ? 'animate-spin' : ''} />
              {autoRefresh ? 'Live' : 'Paused'}
            </button>
            <button
              onClick={clearStats}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-medium bg-gray-800/60 text-gray-500 hover:text-red-400 border border-gray-700/50 transition-all"
            >
              <Trash2 size={9} /> Clear
            </button>
          </div>
        </div>

        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter messages..."
          className="w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded-md px-2.5 py-1.5 text-xs placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
        />

        {/* Column headers */}
        <div className="flex items-center gap-2 px-2 text-[8px] text-gray-600 uppercase tracking-wider">
          <span className="w-[14px]" />
          <span className="w-[140px]">Message</span>
          <span className="w-[60px]">Sys:Comp</span>
          <span className="w-[70px]">Component</span>
          <span className="w-[50px] text-right">Rate</span>
          <span className="w-[60px] text-right">Count</span>
          <span className="w-[45px] text-right">Age</span>
        </div>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {Object.entries(groupedMessages).length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-xs">
            {filter ? 'No messages match filter' : 'Waiting for messages...'}
          </div>
        ) : (
          Object.entries(groupedMessages).map(([key, group]) => (
            <div key={key} className="border-b border-gray-700/30">
              {/* Group header */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800/30">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-gray-400">
                    {group.name}
                  </span>
                  <span className="text-[9px] text-gray-600">
                    ({group.system}:{group.component})
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[9px]">
                  <span className="text-gray-500">
                    {group.messages.length} types
                  </span>
                  <span className="text-cyan-400 font-mono">
                    {group.totalRate.toFixed(1)} Hz total
                  </span>
                </div>
              </div>

              {/* Messages in group */}
              {group.messages
                .sort((a, b) => a.msg_type.localeCompare(b.msg_type))
                .map((msg) => {
                  const rowKey = `${msg.msg_type}:${msg.src_system}:${msg.src_component}`;
                  return (
                    <MessageRow
                      key={rowKey}
                      msg={msg}
                      expanded={expandedRows[rowKey]}
                      onToggle={() => toggleRow(rowKey)}
                    />
                  );
                })}
            </div>
          ))
        )}
      </div>

      {/* Footer stats */}
      <div className="px-3 py-2 border-t border-gray-800/50 bg-gray-900/30 shrink-0">
        <div className="flex items-center justify-between text-[9px] text-gray-500">
          <span>
            {filteredMessages.length} message types from{' '}
            {Object.keys(groupedMessages).length} sources
          </span>
          <span className="font-mono">
            Total:{' '}
            {filteredMessages.reduce((sum, m) => sum + m.rate, 0).toFixed(1)} Hz
          </span>
        </div>
      </div>
    </div>
  );
}
