import React, { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Upload,
  Trash2,
  X,
  MapPin,
  Circle,
  RotateCw,
  Clock,
  Crosshair,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Settings2,
  Shield,
  GripVertical,
  Download,
  Cloud,
  Save,
  FolderOpen,
} from 'lucide-react';
import useDroneStore from '../store/droneStore';
import FenceSubPanel from './FenceSubPanel';
import ElevationProfile from './ElevationProfile';
import WeatherPanel from './WeatherPanel';

const ITEM_TYPES = {
  waypoint: { label: 'Waypoint', icon: MapPin, color: 'sky' },
  takeoff: { label: 'Takeoff', icon: ArrowUp, color: 'emerald' },
  loiter_unlim: { label: 'Loiter', icon: Circle, color: 'violet' },
  loiter_turns: { label: 'Loiter Turns', icon: RotateCw, color: 'violet' },
  loiter_time: { label: 'Loiter Time', icon: Clock, color: 'violet' },
  roi: { label: 'ROI', icon: Crosshair, color: 'amber' },
  land: { label: 'Land', icon: ArrowDown, color: 'orange' },
};

const TYPE_COLORS = {
  sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  violet: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
};

const STATUS_COLORS = {
  idle: 'bg-gray-700/60 text-gray-400',
  uploading: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  uploaded: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  running: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  paused: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  upload_failed: 'bg-red-500/20 text-red-300 border-red-500/30',
};

function WaypointItem({ wp, index, onUpdate, onRemove }) {
  const itemType = ITEM_TYPES[wp.type] || ITEM_TYPES.waypoint;
  const colorClass = TYPE_COLORS[itemType.color];
  const [expanded, setExpanded] = React.useState(false);
  const Icon = itemType.icon;

  return (
    <div className={`rounded-lg border ${colorClass} overflow-hidden`}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <Icon size={13} className="shrink-0" />
        <span className="text-[10px] font-bold w-4 text-center">{index + 1}</span>

        {/* Type selector */}
        <select
          value={wp.type}
          onChange={(e) => onUpdate(wp.id, { type: e.target.value })}
          className="bg-transparent border-none text-[11px] font-medium focus:outline-none cursor-pointer pr-1 appearance-none"
          style={{ minWidth: 0 }}
        >
          {Object.entries(ITEM_TYPES).map(([key, val]) => (
            <option key={key} value={key} className="bg-gray-800 text-gray-200">
              {val.label}
            </option>
          ))}
        </select>

        <span className="font-mono text-[10px] opacity-70 truncate flex-1 text-right">
          {wp.lat.toFixed(5)}, {wp.lon.toFixed(5)}
        </span>

        <button
          onClick={() => setExpanded(!expanded)}
          className="opacity-50 hover:opacity-100 transition-opacity p-0.5"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        <button
          onClick={() => onRemove(wp.id)}
          className="opacity-40 hover:opacity-100 hover:text-red-400 transition-all p-0.5"
        >
          <X size={12} />
        </button>
      </div>

      {/* Expanded parameters */}
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-current/10 space-y-2">
          {/* Altitude */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] opacity-60">Altitude</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={wp.alt}
                onChange={(e) => onUpdate(wp.id, { alt: parseFloat(e.target.value) || 0 })}
                className="w-16 bg-gray-900/50 border border-current/20 rounded px-1.5 py-0.5 text-[11px] text-right font-mono focus:outline-none focus:border-current/50"
                min={1}
                max={500}
                step={5}
              />
              <span className="text-[10px] opacity-50">m</span>
            </div>
          </div>

          {/* Acceptance radius (waypoint) */}
          {wp.type === 'waypoint' && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] opacity-60">Accept radius</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={wp.param2}
                    onChange={(e) => onUpdate(wp.id, { param2: parseFloat(e.target.value) || 0 })}
                    className="w-16 bg-gray-900/50 border border-current/20 rounded px-1.5 py-0.5 text-[11px] text-right font-mono focus:outline-none focus:border-current/50"
                    min={0}
                    max={100}
                    step={1}
                  />
                  <span className="text-[10px] opacity-50">m</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] opacity-60">Hold time</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={wp.param1}
                    onChange={(e) => onUpdate(wp.id, { param1: parseFloat(e.target.value) || 0 })}
                    className="w-16 bg-gray-900/50 border border-current/20 rounded px-1.5 py-0.5 text-[11px] text-right font-mono focus:outline-none focus:border-current/50"
                    min={0}
                    max={3600}
                    step={1}
                  />
                  <span className="text-[10px] opacity-50">s</span>
                </div>
              </div>
            </>
          )}

          {/* Loiter radius (loiter types) */}
          {(wp.type === 'loiter_unlim' || wp.type === 'loiter_turns' || wp.type === 'loiter_time') && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] opacity-60">Radius</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={wp.param3}
                  onChange={(e) => onUpdate(wp.id, { param3: parseFloat(e.target.value) || 0 })}
                  className="w-16 bg-gray-900/50 border border-current/20 rounded px-1.5 py-0.5 text-[11px] text-right font-mono focus:outline-none focus:border-current/50"
                  step={5}
                />
                <span className="text-[10px] opacity-50">m</span>
              </div>
            </div>
          )}

          {/* Turns (loiter_turns) */}
          {wp.type === 'loiter_turns' && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] opacity-60">Turns</span>
              <input
                type="number"
                value={wp.param1}
                onChange={(e) => onUpdate(wp.id, { param1: parseFloat(e.target.value) || 0 })}
                className="w-16 bg-gray-900/50 border border-current/20 rounded px-1.5 py-0.5 text-[11px] text-right font-mono focus:outline-none focus:border-current/50"
                min={1}
                max={100}
                step={1}
              />
            </div>
          )}

          {/* Time (loiter_time) */}
          {wp.type === 'loiter_time' && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] opacity-60">Duration</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={wp.param1}
                  onChange={(e) => onUpdate(wp.id, { param1: parseFloat(e.target.value) || 0 })}
                  className="w-16 bg-gray-900/50 border border-current/20 rounded px-1.5 py-0.5 text-[11px] text-right font-mono focus:outline-none focus:border-current/50"
                  min={1}
                  max={3600}
                  step={1}
                />
                <span className="text-[10px] opacity-50">s</span>
              </div>
            </div>
          )}

          {/* Yaw (all types) */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] opacity-60">Yaw</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={wp.param4}
                onChange={(e) => onUpdate(wp.id, { param4: parseFloat(e.target.value) || 0 })}
                className="w-16 bg-gray-900/50 border border-current/20 rounded px-1.5 py-0.5 text-[11px] text-right font-mono focus:outline-none focus:border-current/50"
                min={0}
                max={360}
                step={5}
              />
              <span className="text-[10px] opacity-50">deg</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableWaypointItem({ wp, index, onUpdate, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: wp.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-1">
      <button
        {...attributes}
        {...listeners}
        className="mt-2.5 text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical size={12} />
      </button>
      <div className="flex-1 min-w-0">
        <WaypointItem wp={wp} index={index} onUpdate={onUpdate} onRemove={onRemove} />
      </div>
    </div>
  );
}

function MissionSubPanel() {
  const connectionStatus = useDroneStore((s) => s.connectionStatus);
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const missionStatus = useDroneStore((s) => s.missionStatus);
  const removeWaypoint = useDroneStore((s) => s.removeWaypoint);
  const updateWaypoint = useDroneStore((s) => s.updateWaypoint);
  const clearWaypoints = useDroneStore((s) => s.clearWaypoints);
  const setPlannedWaypoints = useDroneStore((s) => s.setPlannedWaypoints);
  const reorderWaypoints = useDroneStore((s) => s.reorderWaypoints);
  const defaultAlt = useDroneStore((s) => s.defaultAlt);
  const defaultSpeed = useDroneStore((s) => s.defaultSpeed);
  const setDefaultAlt = useDroneStore((s) => s.setDefaultAlt);
  const setDefaultSpeed = useDroneStore((s) => s.setDefaultSpeed);
  const addAlert = useDroneStore((s) => s.addAlert);
  const setDroneMission = useDroneStore((s) => s.setDroneMission);
  const importDroneMission = useDroneStore((s) => s.importDroneMission);

  const isConnected = connectionStatus === 'connected';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = plannedWaypoints.findIndex((w) => w.id === active.id);
      const newIndex = plannedWaypoints.findIndex((w) => w.id === over.id);
      reorderWaypoints(oldIndex, newIndex);
    }
  }, [plannedWaypoints, reorderWaypoints]);

  const apiCall = useCallback(
    async (endpoint, body = {}) => {
      try {
        const res = await fetch(`/api/mission/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.status === 'error') {
          addAlert(data.error || `Mission ${endpoint} failed`, 'error');
        } else {
          addAlert(`Mission ${endpoint} ok`, 'success');
        }
      } catch (err) {
        addAlert(`Mission ${endpoint} failed: ${err.message}`, 'error');
      }
    },
    [addAlert]
  );

  const handleUpload = useCallback(async () => {
    if (plannedWaypoints.length === 0) {
      addAlert('No waypoints to upload', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/mission/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waypoints: plannedWaypoints.map((w) => ({
            lat: w.lat,
            lon: w.lon,
            alt: w.alt,
            item_type: w.type,
            param1: w.param1,
            param2: w.param2,
            param3: w.param3,
            param4: w.param4,
          })),
        }),
      });
      const data = await res.json();
      if (data.status === 'error') {
        addAlert(data.error || 'Mission upload failed', 'error');
      } else {
        addAlert('Mission upload ok', 'success');
        // Auto-download to sync drone mission display
        try {
          const dlRes = await fetch('/api/mission/download');
          const dlData = await dlRes.json();
          if (dlData.status === 'ok' && dlData.waypoints) {
            setDroneMission(dlData.waypoints);
          }
        } catch {}
      }
    } catch (err) {
      addAlert(`Mission upload failed: ${err.message}`, 'error');
    }
  }, [plannedWaypoints, addAlert, setDroneMission]);

  const handleImport = useCallback(async () => {
    try {
      const res = await fetch('/api/mission/download');
      const data = await res.json();
      if (data.status === 'ok' && data.waypoints && data.waypoints.length > 0) {
        setDroneMission(data.waypoints);
        importDroneMission();
        addAlert(`Imported ${data.waypoints.length} waypoints from drone`, 'success');
      } else {
        addAlert('No mission on drone to import', 'warning');
      }
    } catch (err) {
      addAlert(`Import failed: ${err.message}`, 'error');
    }
  }, [setDroneMission, importDroneMission, addAlert]);

  const handleSaveToFile = useCallback(() => {
    if (plannedWaypoints.length === 0) {
      addAlert('No waypoints to save', 'warning');
      return;
    }

    const missionData = {
      version: 1,
      timestamp: new Date().toISOString(),
      waypoints: plannedWaypoints.map((w) => ({
        lat: w.lat,
        lon: w.lon,
        alt: w.alt,
        type: w.type,
        param1: w.param1,
        param2: w.param2,
        param3: w.param3,
        param4: w.param4,
      })),
      defaults: {
        alt: defaultAlt,
        speed: defaultSpeed,
      },
    };

    const blob = new Blob([JSON.stringify(missionData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mission_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addAlert(`Saved ${plannedWaypoints.length} waypoints to file`, 'success');
  }, [plannedWaypoints, defaultAlt, defaultSpeed, addAlert]);

  const handleLoadFromFile = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const missionData = JSON.parse(text);

        if (!missionData.waypoints || !Array.isArray(missionData.waypoints)) {
          addAlert('Invalid mission file format', 'error');
          return;
        }

        // Clear existing waypoints
        clearWaypoints();

        // Import waypoints
        const imported = missionData.waypoints.map((wp, index) => ({
          lat: wp.lat,
          lon: wp.lon,
          alt: wp.alt || 50,
          id: Date.now() + Math.random() * 10000 + index,
          type: wp.type || 'waypoint',
          param1: wp.param1 || 0,
          param2: wp.param2 || 2,
          param3: wp.param3 || 0,
          param4: wp.param4 || 0,
        }));

        setPlannedWaypoints(imported);

        // Restore defaults if available
        if (missionData.defaults) {
          if (missionData.defaults.alt) setDefaultAlt(missionData.defaults.alt);
          if (missionData.defaults.speed) setDefaultSpeed(missionData.defaults.speed);
        }

        addAlert(`Loaded ${imported.length} waypoints from file`, 'success');
      } catch (err) {
        addAlert(`Failed to load mission: ${err.message}`, 'error');
      }
    };

    input.click();
  }, [clearWaypoints, setPlannedWaypoints, setDefaultAlt, setDefaultSpeed, addAlert]);

  return (
    <>
      {/* Header with status */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <MapPin size={13} className="text-gray-500" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Mission Items</span>
          {plannedWaypoints.length > 0 && (
            <span className="text-[10px] text-gray-600 ml-1">({plannedWaypoints.length})</span>
          )}
        </div>
        <span
          className={`px-2 py-0.5 rounded-md text-[9px] font-semibold uppercase border ${
            STATUS_COLORS[missionStatus] || STATUS_COLORS.idle
          }`}
        >
          {missionStatus}
        </span>
      </div>

      {/* Default parameters */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50 mb-3">
        <div className="flex items-center gap-1.5 mb-2.5">
          <Settings2 size={11} className="text-gray-600" />
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Defaults</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Default altitude</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={defaultAlt}
                onChange={(e) => setDefaultAlt(e.target.value)}
                className="w-full bg-gray-800/80 text-gray-200 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs font-mono text-right focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                min={1}
                max={500}
                step={5}
              />
              <span className="text-[10px] text-gray-500">m</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Default speed</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={defaultSpeed}
                onChange={(e) => setDefaultSpeed(e.target.value)}
                className="w-full bg-gray-800/80 text-gray-200 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs font-mono text-right focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                min={0.5}
                max={30}
                step={0.5}
              />
              <span className="text-[10px] text-gray-500">m/s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Waypoint list with DnD */}
      <div className="flex-1 overflow-y-auto mb-3 space-y-1.5 min-h-0">
        {plannedWaypoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-600">
            <MapPin size={24} className="mb-2 opacity-40" />
            <div className="text-xs italic">Click "Add Waypoints" then click on the map</div>
            <div className="text-[10px] italic mt-1 opacity-60">
              Plan missions offline, upload when connected
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={plannedWaypoints.map((w) => w.id)}
              strategy={verticalListSortingStrategy}
            >
              {plannedWaypoints.map((wp, i) => (
                <SortableWaypointItem
                  key={wp.id}
                  wp={wp}
                  index={i}
                  onUpdate={updateWaypoint}
                  onRemove={removeWaypoint}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Action buttons */}
      <div className="space-y-2 pt-2 border-t border-gray-800/50">
        {/* Drone sync buttons (require connection) */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={handleUpload}
            disabled={plannedWaypoints.length === 0 || !isConnected}
            title={!isConnected ? 'Connect to drone first' : 'Upload mission to drone'}
            className="flex items-center justify-center gap-1.5 px-2 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 hover:border-cyan-500/40 rounded-md text-xs font-semibold text-cyan-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-cyan-500/10 disabled:hover:border-cyan-500/20"
          >
            <Upload size={12} /> Upload
          </button>
          <button
            onClick={handleImport}
            disabled={!isConnected}
            title={!isConnected ? 'Connect to drone first' : 'Import mission from drone'}
            className="flex items-center justify-center gap-1.5 px-2 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 rounded-md text-xs font-semibold text-emerald-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-emerald-500/10 disabled:hover:border-emerald-500/20"
          >
            <Download size={12} /> Import
          </button>
          <button
            onClick={() => {
              clearWaypoints();
              if (isConnected) {
                apiCall('clear');
              }
            }}
            disabled={plannedWaypoints.length === 0}
            title="Clear all waypoints"
            className="flex items-center justify-center gap-1.5 px-2 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 rounded-md text-xs font-semibold text-red-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-red-500/10 disabled:hover:border-red-500/20"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>

        {/* File operations (work offline) */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleSaveToFile}
            disabled={plannedWaypoints.length === 0}
            title="Save mission to file"
            className="flex items-center justify-center gap-1.5 px-2 py-2 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 hover:border-violet-500/40 rounded-md text-xs font-semibold text-violet-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-violet-500/10 disabled:hover:border-violet-500/20"
          >
            <Save size={12} /> Save
          </button>
          <button
            onClick={handleLoadFromFile}
            title="Load mission from file"
            className="flex items-center justify-center gap-1.5 px-2 py-2 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 hover:border-violet-500/40 rounded-md text-xs font-semibold text-violet-300 transition-all"
          >
            <FolderOpen size={12} /> Load
          </button>
        </div>
      </div>

      {/* Elevation profile */}
      <ElevationProfile />
    </>
  );
}

export default function MissionPanel() {
  const planSubTab = useDroneStore((s) => s.planSubTab);
  const setPlanSubTab = useDroneStore((s) => s.setPlanSubTab);

  return (
    <div className="p-4 flex flex-col min-h-0 h-full">
      {/* Subtab toggle */}
      <div className="flex gap-1 mb-3 bg-gray-800/40 rounded-lg p-1 border border-gray-800/50">
        <button
          onClick={() => setPlanSubTab('mission')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
            planSubTab === 'mission'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
              : 'text-gray-500 hover:text-gray-300 border border-transparent'
          }`}
        >
          <MapPin size={12} /> Mission
        </button>
        <button
          onClick={() => setPlanSubTab('fence')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
            planSubTab === 'fence'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
              : 'text-gray-500 hover:text-gray-300 border border-transparent'
          }`}
        >
          <Shield size={12} /> Fence
        </button>
        <button
          onClick={() => setPlanSubTab('weather')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
            planSubTab === 'weather'
              ? 'bg-violet-500/15 text-violet-300 border border-violet-500/30'
              : 'text-gray-500 hover:text-gray-300 border border-transparent'
          }`}
        >
          <Cloud size={12} /> Weather
        </button>
      </div>

      {/* Content */}
      {planSubTab === 'mission' ? <MissionSubPanel /> :
       planSubTab === 'fence' ? <FenceSubPanel /> :
       <WeatherPanel />}
    </div>
  );
}
