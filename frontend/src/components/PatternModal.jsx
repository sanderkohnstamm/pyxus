import React, { useState, useCallback, useEffect } from 'react';
import { X, Grid3X3, Circle, Target, Square, RotateCw } from 'lucide-react';
import useDroneStore, { INITIAL_TELEMETRY } from '../store/droneStore';
import {
  lawnmowerPattern,
  spiralPattern,
  orbitPattern,
  perimeterPattern,
  boundsFromCorners,
} from '../utils/patterns';
import { getBounds, centroid } from '../utils/geo';

const TABS = [
  { id: 'lawnmower', label: 'Lawnmower', icon: Grid3X3 },
  { id: 'spiral', label: 'Spiral', icon: Target },
  { id: 'orbit', label: 'Orbit', icon: Circle },
  { id: 'perimeter', label: 'Perimeter', icon: Square },
];

export default function PatternModal() {
  const patternConfig = useDroneStore((s) => s.patternConfig);
  const setPatternConfig = useDroneStore((s) => s.setPatternConfig);
  const applyPattern = useDroneStore((s) => s.applyPattern);
  const replaceWithPattern = useDroneStore((s) => s.replaceWithPattern);
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const plannedFence = useDroneStore((s) => s.plannedFence);
  const patternBounds = useDroneStore((s) => s.patternBounds);
  const patternDrawMode = useDroneStore((s) => s.patternDrawMode);
  const setPatternDrawMode = useDroneStore((s) => s.setPatternDrawMode);
  const clearPatternBounds = useDroneStore((s) => s.clearPatternBounds);
  const defaultAlt = useDroneStore((s) => s.defaultAlt);
  const telemetry = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : null) || INITIAL_TELEMETRY;

  const [activeTab, setActiveTab] = useState('lawnmower');
  const [replaceMode, setReplaceMode] = useState(true);

  // Lawnmower config
  const [lawnmowerSpacing, setLawnmowerSpacing] = useState(20);
  const [lawnmowerAngle, setLawnmowerAngle] = useState(0);
  const [lawnmowerOvershoot, setLawnmowerOvershoot] = useState(10);
  const [lawnmowerAlt, setLawnmowerAlt] = useState(defaultAlt);
  const [lawnmowerWidth, setLawnmowerWidth] = useState(200);  // meters
  const [lawnmowerHeight, setLawnmowerHeight] = useState(200); // meters
  const [lawnmowerUseCustomSize, setLawnmowerUseCustomSize] = useState(false);

  // Spiral config
  const [spiralStartRadius, setSpiralStartRadius] = useState(100);
  const [spiralEndRadius, setSpiralEndRadius] = useState(10);
  const [spiralSpacing, setSpiralSpacing] = useState(15);
  const [spiralPointsPerLoop, setSpiralPointsPerLoop] = useState(12);
  const [spiralAlt, setSpiralAlt] = useState(defaultAlt);

  // Orbit config
  const [orbitRadius, setOrbitRadius] = useState(50);
  const [orbitPoints, setOrbitPoints] = useState(8);
  const [orbitClockwise, setOrbitClockwise] = useState(true);
  const [orbitAlt, setOrbitAlt] = useState(defaultAlt);

  // Perimeter config
  const [perimeterInset, setPerimeterInset] = useState(0);
  const [perimeterAlt, setPerimeterAlt] = useState(defaultAlt);

  // Determine available center point (from waypoints, fence, or drone position)
  const getCenter = useCallback(() => {
    if (plannedWaypoints.length > 0) {
      return centroid(plannedWaypoints.map(w => ({ lat: w.lat, lon: w.lon })));
    }
    if (plannedFence.length > 0) {
      return centroid(plannedFence.map(v => ({ lat: v.lat, lon: v.lon })));
    }
    if (telemetry.lat !== 0 && telemetry.lon !== 0) {
      return { lat: telemetry.lat, lon: telemetry.lon };
    }
    return null;
  }, [plannedWaypoints, plannedFence, telemetry]);

  // Get bounds for lawnmower (from drawn polygon, fence, waypoints, or custom size)
  const getPatternBounds = useCallback(() => {
    // Priority 1: Custom drawn polygon for pattern
    if (patternBounds.length >= 3) {
      return getBounds(patternBounds);
    }
    // Priority 2: Custom size mode with width/height
    if (lawnmowerUseCustomSize) {
      const center = getCenter();
      if (center) {
        const latDelta = (lawnmowerHeight / 2) / 111000;
        const lonDelta = (lawnmowerWidth / 2) / (111000 * Math.cos(center.lat * Math.PI / 180));
        return {
          north: center.lat + latDelta,
          south: center.lat - latDelta,
          east: center.lon + lonDelta,
          west: center.lon - lonDelta,
        };
      }
    }
    // Priority 3: Use fence if available
    if (plannedFence.length >= 3) {
      return getBounds(plannedFence);
    }
    // Priority 4: Use waypoints bounds
    if (plannedWaypoints.length >= 2) {
      return getBounds(plannedWaypoints);
    }
    // Default: use custom size around center
    const center = getCenter();
    if (center) {
      const latDelta = (lawnmowerHeight / 2) / 111000;
      const lonDelta = (lawnmowerWidth / 2) / (111000 * Math.cos(center.lat * Math.PI / 180));
      return {
        north: center.lat + latDelta,
        south: center.lat - latDelta,
        east: center.lon + lonDelta,
        west: center.lon - lonDelta,
      };
    }
    return null;
  }, [patternBounds, plannedFence, plannedWaypoints, getCenter, lawnmowerUseCustomSize, lawnmowerWidth, lawnmowerHeight]);

  // Get polygon for lawnmower (actual vertices, not just bounds)
  const getPolygonVertices = useCallback(() => {
    // Priority 1: Custom drawn polygon
    if (patternBounds.length >= 3) {
      return patternBounds;
    }
    // Priority 2: Use fence polygon
    if (plannedFence.length >= 3) {
      return plannedFence;
    }
    // Priority 3: Create rectangle from custom size or default
    const center = getCenter();
    if (center) {
      const width = lawnmowerWidth;
      const height = lawnmowerHeight;
      const latDelta = (height / 2) / 111000;
      const lonDelta = (width / 2) / (111000 * Math.cos(center.lat * Math.PI / 180));
      return [
        { lat: center.lat + latDelta, lon: center.lon - lonDelta },
        { lat: center.lat + latDelta, lon: center.lon + lonDelta },
        { lat: center.lat - latDelta, lon: center.lon + lonDelta },
        { lat: center.lat - latDelta, lon: center.lon - lonDelta },
      ];
    }
    return null;
  }, [patternBounds, plannedFence, getCenter, lawnmowerWidth, lawnmowerHeight]);

  const generatePreview = useCallback(() => {
    let waypoints = [];

    switch (activeTab) {
      case 'lawnmower': {
        const polygon = getPolygonVertices();
        if (polygon && polygon.length >= 3) {
          waypoints = lawnmowerPattern(
            polygon,
            lawnmowerSpacing,
            lawnmowerAngle,
            lawnmowerAlt,
            lawnmowerOvershoot
          );
        }
        break;
      }
      case 'spiral': {
        const center = getCenter();
        if (center) {
          waypoints = spiralPattern(
            center,
            spiralStartRadius,
            spiralEndRadius,
            spiralSpacing,
            spiralPointsPerLoop,
            spiralAlt
          );
        }
        break;
      }
      case 'orbit': {
        const center = getCenter();
        if (center) {
          waypoints = orbitPattern(center, orbitRadius, orbitPoints, orbitAlt, orbitClockwise);
        }
        break;
      }
      case 'perimeter': {
        if (plannedFence.length >= 3) {
          waypoints = perimeterPattern(plannedFence, perimeterAlt, perimeterInset);
        }
        break;
      }
    }

    setPatternConfig({ preview: waypoints });
  }, [
    activeTab,
    getPolygonVertices,
    getCenter,
    lawnmowerSpacing,
    lawnmowerAngle,
    lawnmowerAlt,
    lawnmowerOvershoot,
    spiralStartRadius,
    spiralEndRadius,
    spiralSpacing,
    spiralPointsPerLoop,
    spiralAlt,
    orbitRadius,
    orbitPoints,
    orbitAlt,
    orbitClockwise,
    plannedFence,
    perimeterAlt,
    perimeterInset,
    setPatternConfig,
  ]);

  // Auto-generate preview when config changes
  useEffect(() => {
    if (patternConfig.visible) {
      generatePreview();
    }
  }, [
    patternConfig.visible,
    activeTab,
    lawnmowerSpacing,
    lawnmowerAngle,
    lawnmowerAlt,
    lawnmowerWidth,
    lawnmowerHeight,
    lawnmowerUseCustomSize,
    patternBounds,
    spiralStartRadius,
    spiralEndRadius,
    spiralSpacing,
    spiralPointsPerLoop,
    spiralAlt,
    orbitRadius,
    orbitPoints,
    orbitAlt,
    orbitClockwise,
    perimeterAlt,
    perimeterInset,
  ]);

  const handleGenerate = useCallback(() => {
    const waypoints = patternConfig.preview;
    if (waypoints.length === 0) return;

    if (replaceMode) {
      replaceWithPattern(waypoints);
    } else {
      applyPattern(waypoints);
    }

    setPatternConfig({ visible: false, preview: [] });
    clearPatternBounds();
  }, [patternConfig.preview, replaceMode, replaceWithPattern, applyPattern, setPatternConfig, clearPatternBounds]);

  const handleClose = useCallback(() => {
    setPatternConfig({ visible: false, preview: [] });
    clearPatternBounds();
  }, [setPatternConfig, clearPatternBounds]);

  if (!patternConfig.visible) return null;

  const center = getCenter();
  const bounds = getPatternBounds();
  const hasCenter = center !== null;
  const hasBounds = bounds !== null;
  const hasFence = plannedFence.length >= 3;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-start p-4 pointer-events-none">
      <div className="bg-gray-900/90 backdrop-blur-md border border-gray-700/50 rounded-xl shadow-2xl w-[300px] max-h-[85vh] flex flex-col pointer-events-auto ml-2">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Grid3X3 size={16} className="text-cyan-400" />
            <span className="text-sm font-semibold text-gray-200">Generate Pattern</span>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isDisabled =
              (tab.id === 'lawnmower' && !hasBounds) ||
              (tab.id === 'spiral' && !hasCenter) ||
              (tab.id === 'orbit' && !hasCenter) ||
              (tab.id === 'perimeter' && !hasFence);

            return (
              <button
                key={tab.id}
                onClick={() => !isDisabled && setActiveTab(tab.id)}
                disabled={isDisabled}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-[11px] font-medium transition-all
                  ${isActive
                    ? 'text-cyan-300 border-b-2 border-cyan-400 bg-cyan-500/5'
                    : isDisabled
                      ? 'text-gray-600 cursor-not-allowed'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
              >
                <Icon size={12} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Lawnmower config */}
          {activeTab === 'lawnmower' && (
            <>
              <div className="text-[10px] text-gray-500 mb-3">
                Creates a serpentine survey pattern. {hasFence ? 'Using fence bounds.' : 'Set custom size below.'}
              </div>
              <div className="space-y-3">
                {/* Draw area on map */}
                <div className="p-2 bg-gray-800/50 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">Survey Area</span>
                    {patternBounds.length > 0 && (
                      <span className="text-[9px] text-pink-400">{patternBounds.length} vertices</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPatternDrawMode(!patternDrawMode)}
                      className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium transition-all ${
                        patternDrawMode
                          ? 'bg-pink-500/20 text-pink-300 border border-pink-500/30'
                          : 'bg-gray-700/50 text-gray-400 hover:text-gray-200 border border-gray-600/30'
                      }`}
                    >
                      {patternDrawMode ? '✓ Drawing...' : 'Draw Area'}
                    </button>
                    {patternBounds.length > 0 && (
                      <button
                        onClick={clearPatternBounds}
                        className="px-2 py-1.5 rounded text-[10px] font-medium bg-gray-700/50 text-gray-400 hover:text-red-400 border border-gray-600/30 transition-all"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {patternDrawMode && (
                    <div className="text-[9px] text-gray-500 italic">
                      Click on the map to add vertices. Right-click a vertex to remove it.
                    </div>
                  )}
                </div>

                {/* Size controls (only if no drawn area) */}
                {patternBounds.length === 0 && (
                <div className="p-2 bg-gray-800/50 rounded-lg space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={lawnmowerUseCustomSize}
                      onChange={(e) => setLawnmowerUseCustomSize(e.target.checked)}
                      className="w-3 h-3 rounded accent-cyan-500"
                    />
                    <span className="text-[10px] text-gray-400">Custom size</span>
                  </label>
                  {(lawnmowerUseCustomSize || (!hasFence && plannedWaypoints.length < 2)) && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-gray-500 block mb-0.5">Width</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={lawnmowerWidth}
                            onChange={(e) => setLawnmowerWidth(Number(e.target.value) || 100)}
                            className="w-full bg-gray-900/60 text-gray-200 border border-gray-700/50 rounded px-2 py-1 text-[11px] font-mono focus:outline-none focus:border-cyan-500/50"
                            min={10}
                            max={5000}
                          />
                          <span className="text-[9px] text-gray-500">m</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-500 block mb-0.5">Height</label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={lawnmowerHeight}
                            onChange={(e) => setLawnmowerHeight(Number(e.target.value) || 100)}
                            className="w-full bg-gray-900/60 text-gray-200 border border-gray-700/50 rounded px-2 py-1 text-[11px] font-mono focus:outline-none focus:border-cyan-500/50"
                            min={10}
                            max={5000}
                          />
                          <span className="text-[9px] text-gray-500">m</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                )}
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Lane Spacing</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={5}
                      max={100}
                      value={lawnmowerSpacing}
                      onChange={(e) => setLawnmowerSpacing(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-xs text-gray-300 w-12 text-right">{lawnmowerSpacing}m</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Pattern Angle</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={180}
                      value={lawnmowerAngle}
                      onChange={(e) => setLawnmowerAngle(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-xs text-gray-300 w-12 text-right">{lawnmowerAngle}°</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Turn Overshoot</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={50}
                      value={lawnmowerOvershoot}
                      onChange={(e) => setLawnmowerOvershoot(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-xs text-gray-300 w-12 text-right">{lawnmowerOvershoot}m</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Altitude</label>
                  <input
                    type="number"
                    value={lawnmowerAlt}
                    onChange={(e) => setLawnmowerAlt(Number(e.target.value))}
                    className="w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500/50"
                    min={1}
                    max={500}
                  />
                </div>
              </div>
            </>
          )}

          {/* Spiral config */}
          {activeTab === 'spiral' && (
            <>
              <div className="text-[10px] text-gray-500 mb-3">
                Creates a spiral pattern around the mission/drone center.
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Start Radius</label>
                    <input
                      type="number"
                      value={spiralStartRadius}
                      onChange={(e) => setSpiralStartRadius(Number(e.target.value))}
                      className="w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500/50"
                      min={1}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">End Radius</label>
                    <input
                      type="number"
                      value={spiralEndRadius}
                      onChange={(e) => setSpiralEndRadius(Number(e.target.value))}
                      className="w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500/50"
                      min={1}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Loop Spacing</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={5}
                      max={50}
                      value={spiralSpacing}
                      onChange={(e) => setSpiralSpacing(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-xs text-gray-300 w-12 text-right">{spiralSpacing}m</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Points Per Loop</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={4}
                      max={24}
                      value={spiralPointsPerLoop}
                      onChange={(e) => setSpiralPointsPerLoop(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-xs text-gray-300 w-12 text-right">{spiralPointsPerLoop}</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Altitude</label>
                  <input
                    type="number"
                    value={spiralAlt}
                    onChange={(e) => setSpiralAlt(Number(e.target.value))}
                    className="w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500/50"
                    min={1}
                    max={500}
                  />
                </div>
              </div>
            </>
          )}

          {/* Orbit config */}
          {activeTab === 'orbit' && (
            <>
              <div className="text-[10px] text-gray-500 mb-3">
                Creates a circular orbit around the mission/drone center.
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Radius</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={10}
                      max={500}
                      value={orbitRadius}
                      onChange={(e) => setOrbitRadius(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-xs text-gray-300 w-16 text-right">{orbitRadius}m</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Waypoints</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={4}
                      max={24}
                      value={orbitPoints}
                      onChange={(e) => setOrbitPoints(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <span className="text-xs text-gray-300 w-12 text-right">{orbitPoints}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Direction</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setOrbitClockwise(true)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
                        orbitClockwise
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'bg-gray-800/60 text-gray-500 border border-gray-700/50'
                      }`}
                    >
                      <RotateCw size={10} /> CW
                    </button>
                    <button
                      onClick={() => setOrbitClockwise(false)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
                        !orbitClockwise
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'bg-gray-800/60 text-gray-500 border border-gray-700/50'
                      }`}
                    >
                      <RotateCw size={10} className="scale-x-[-1]" /> CCW
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Altitude</label>
                  <input
                    type="number"
                    value={orbitAlt}
                    onChange={(e) => setOrbitAlt(Number(e.target.value))}
                    className="w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500/50"
                    min={1}
                    max={500}
                  />
                </div>
              </div>
            </>
          )}

          {/* Perimeter config */}
          {activeTab === 'perimeter' && (
            <>
              <div className="text-[10px] text-gray-500 mb-3">
                Creates a flight path following the fence boundary.
              </div>
              {!hasFence ? (
                <div className="text-center py-8 text-gray-600">
                  <Square size={24} className="mx-auto mb-2 opacity-40" />
                  <div className="text-xs">Draw a fence first to use perimeter pattern</div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Inset from Boundary</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={50}
                        value={perimeterInset}
                        onChange={(e) => setPerimeterInset(Number(e.target.value))}
                        className="flex-1 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                      <span className="text-xs text-gray-300 w-12 text-right">{perimeterInset}m</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 block mb-1">Altitude</label>
                    <input
                      type="number"
                      value={perimeterAlt}
                      onChange={(e) => setPerimeterAlt(Number(e.target.value))}
                      className="w-full bg-gray-800/60 text-gray-200 border border-gray-700/50 rounded px-2 py-1.5 text-xs font-mono focus:outline-none focus:border-cyan-500/50"
                      min={1}
                      max={500}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Preview info */}
          {patternConfig.preview.length > 0 && (
            <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-700/30">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-gray-500">Preview</span>
                <span className="text-cyan-300 font-medium">
                  {patternConfig.preview.length} waypoints
                </span>
              </div>
            </div>
          )}

          {/* Replace vs Append toggle */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-[10px] text-gray-400">Mode</span>
            <div className="flex gap-2">
              <button
                onClick={() => setReplaceMode(true)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                  replaceMode
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'bg-gray-800/60 text-gray-500 border border-gray-700/50'
                }`}
              >
                Replace
              </button>
              <button
                onClick={() => setReplaceMode(false)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                  !replaceMode
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'bg-gray-800/60 text-gray-500 border border-gray-700/50'
                }`}
              >
                Append
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-gray-800">
          <button
            onClick={handleClose}
            className="flex-1 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700/50 rounded-md text-xs font-medium text-gray-400 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={patternConfig.preview.length === 0}
            className="flex-1 px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 rounded-md text-xs font-semibold text-cyan-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
