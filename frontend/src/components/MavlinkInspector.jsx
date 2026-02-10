import React, { useState, useEffect, useCallback } from 'react';
import { Radio, Trash2, ChevronDown, ChevronRight, RefreshCw, Cpu, Camera, Box, Target } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import { droneApi } from '../utils/api';

// Component ID to name mapping (fallback)
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

// Component card for discovered components
function ComponentCard({ comp }) {
  const getCategoryIcon = () => {
    if (comp.category === 'vehicle') return <Cpu size={12} />;
    if (comp.type_name === 'Camera') return <Camera size={12} />;
    return <Box size={12} />;
  };

  const getCategoryColor = () => {
    if (comp.is_target) return 'border-cyan-500/50 bg-cyan-500/10';
    if (comp.category === 'vehicle') return 'border-emerald-500/30 bg-emerald-500/5';
    if (comp.category === 'peripheral') return 'border-amber-500/30 bg-amber-500/5';
    return 'border-gray-700/50 bg-gray-800/30';
  };

  const getTextColor = () => {
    if (comp.is_target) return 'text-cyan-300';
    if (comp.category === 'vehicle') return 'text-emerald-300';
    if (comp.category === 'peripheral') return 'text-amber-300';
    return 'text-gray-400';
  };

  return (
    <div className={`rounded-lg border p-2.5 ${getCategoryColor()} ${!comp.active ? 'opacity-40' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={getTextColor()}>{getCategoryIcon()}</span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] font-semibold ${getTextColor()}`}>
                {comp.type_name}
              </span>
              {comp.is_target && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[8px] font-semibold">
                  <Target size={8} /> TARGET
                </span>
              )}
            </div>
            <div className="text-[9px] text-gray-500">
              System {comp.src_system}, Component {comp.src_component}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-[10px] font-mono ${comp.active ? 'text-emerald-400' : 'text-red-400'}`}>
            {comp.active ? 'Active' : 'Stale'}
          </div>
          <div className="text-[9px] text-gray-600">
            {comp.autopilot !== 'none' && comp.autopilot !== 'unknown' && comp.autopilot}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-3 text-[9px] text-gray-500">
        <span>{comp.heartbeat_count.toLocaleString()} heartbeats</span>
        <span>Last: {comp.age}s ago</span>
      </div>
    </div>
  );
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
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const isConnected = !!activeDroneId;

  const [activeTab, setActiveTab] = useState('components');
  const [components, setComponents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [targetSystem, setTargetSystem] = useState(null);
  const [targetComponent, setTargetComponent] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});
  const [filter, setFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!isConnected) return;
    try {
      // Fetch both components and messages
      const [compRes, msgRes] = await Promise.all([
        fetch(droneApi('/api/mavlink/components')),
        fetch(droneApi('/api/mavlink/stats')),
      ]);
      const compData = await compRes.json();
      const msgData = await msgRes.json();

      if (compData.status === 'ok') {
        setComponents(compData.components || []);
        setTargetSystem(compData.target_system);
        setTargetComponent(compData.target_component);
      }
      if (msgData.status === 'ok') {
        setMessages(msgData.messages || []);
      }
    } catch (err) {
      console.error('Failed to fetch MAVLink data:', err);
    }
  }, [isConnected]);

  const clearStats = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      await fetch(droneApi('/api/mavlink/stats/clear'), { method: 'POST' });
      setMessages([]);
    } catch (err) {
      console.error('Failed to clear stats:', err);
    }
    setLoading(false);
  }, [isConnected]);

  // Auto-refresh
  useEffect(() => {
    if (!isConnected || !autoRefresh) return;
    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, [isConnected, autoRefresh, fetchData]);

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

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-800/40 rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab('components')}
            className={`flex-1 px-3 py-1.5 rounded text-[10px] font-semibold transition-all ${
              activeTab === 'components'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Components ({components.length})
          </button>
          <button
            onClick={() => setActiveTab('messages')}
            className={`flex-1 px-3 py-1.5 rounded text-[10px] font-semibold transition-all ${
              activeTab === 'messages'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Messages ({messages.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeTab === 'components' ? (
          <div className="p-3 space-y-2">
            {components.length === 0 ? (
              <div className="text-center py-8 text-gray-600 text-xs">
                Waiting for heartbeats...
              </div>
            ) : (
              <>
                {/* Target info */}
                <div className="text-[10px] text-gray-500 mb-2">
                  Connected to system {targetSystem}, component {targetComponent}
                </div>
                {components.map((comp) => (
                  <ComponentCard
                    key={`${comp.src_system}:${comp.src_component}`}
                    comp={comp}
                  />
                ))}
              </>
            )}
          </div>
        ) : (
          <>
            {/* Filter and column headers */}
            <div className="p-3 space-y-2 border-b border-gray-800/50">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter messages..."
                className="w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded-md px-2.5 py-1.5 text-xs placeholder-gray-600 focus:outline-none focus:border-cyan-500/50"
              />
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
          </>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-3 py-2 border-t border-gray-800/50 bg-gray-900/30 shrink-0">
        <div className="flex items-center justify-between text-[9px] text-gray-500">
          <span>
            {components.filter(c => c.active).length}/{components.length} active components
          </span>
          <span className="font-mono">
            Total: {messages.reduce((sum, m) => sum + m.rate, 0).toFixed(1)} Hz
          </span>
        </div>
      </div>
    </div>
  );
}
