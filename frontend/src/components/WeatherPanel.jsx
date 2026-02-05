import React from 'react';
import { Cloud, Wind, Thermometer, Droplets, Eye, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import useWeather from '../hooks/useWeather';

const RISK_COLORS = {
  safe: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', icon: CheckCircle },
  caution: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', icon: AlertTriangle },
  warning: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-300', icon: AlertTriangle },
  abort: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-300', icon: XCircle },
};

export default function WeatherPanel() {
  const weather = useDroneStore((s) => s.weather);
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const { fetchRouteWeather, selectPlatform } = useWeather();

  const analysis = weather.routeAnalysis;
  const platforms = weather.platforms;

  if (plannedWaypoints.length < 2) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Cloud size={13} className="text-gray-500" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Weather</span>
        </div>
        <div className="text-center text-gray-600 text-xs italic py-8">
          Add at least 2 waypoints to see weather impact
        </div>
      </div>
    );
  }

  const riskConfig = RISK_COLORS[analysis?.route_risk_level || 'safe'];
  const RiskIcon = riskConfig.icon;

  return (
    <div className="p-4 flex flex-col min-h-0 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Cloud size={13} className="text-gray-500" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Weather Impact</span>
        </div>
        <button
          onClick={fetchRouteWeather}
          disabled={weather.loading}
          className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold"
        >
          {weather.loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Platform selector */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50 mb-3">
        <label className="text-[10px] text-gray-500 block mb-1.5">Platform Type</label>
        <select
          value={weather.currentPlatform}
          onChange={(e) => selectPlatform(e.target.value)}
          className="w-full bg-gray-800/80 text-gray-200 border border-gray-700/50 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-cyan-500/50"
          disabled={Object.keys(platforms).length === 0}
        >
          {Object.entries(platforms).map(([id, p]) => (
            <option key={id} value={id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Loading state */}
      {weather.loading && (
        <div className="bg-gray-800/40 rounded-lg p-4 border border-gray-800/50 mb-3 text-center">
          <div className="text-sm text-gray-400">Fetching weather data...</div>
        </div>
      )}

      {/* No analysis yet */}
      {!weather.loading && !analysis && (
        <div className="bg-gray-800/40 rounded-lg p-4 border border-gray-800/50 mb-3 text-center">
          <div className="text-sm text-gray-400 mb-2">No weather data yet</div>
          <button
            onClick={fetchRouteWeather}
            className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-md text-xs font-semibold text-cyan-300 transition-all"
          >
            Fetch Weather
          </button>
        </div>
      )}

      {!weather.loading && analysis && (
        <>
          {/* Overall route risk */}
          <div className={`rounded-lg p-3 border ${riskConfig.border} ${riskConfig.bg} mb-3`}>
            <div className="flex items-center gap-2 mb-2">
              <RiskIcon size={16} className={riskConfig.text} />
              <span className={`text-sm font-bold uppercase ${riskConfig.text}`}>
                {analysis.route_risk_level}
              </span>
              <span className="ml-auto text-[10px] text-gray-500">
                Risk Score: {Math.round(analysis.route_risk_score)}
              </span>
            </div>

            {/* Summary metrics */}
            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-current/10">
              <div>
                <div className="text-[9px] text-gray-500 uppercase">Energy Penalty</div>
                <div className={`text-sm font-mono font-bold ${riskConfig.text}`}>
                  +{analysis.total_energy_penalty.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-[9px] text-gray-500 uppercase">Critical Segs</div>
                <div className={`text-sm font-mono font-bold ${riskConfig.text}`}>
                  {analysis.critical_segments.length}
                </div>
              </div>
            </div>
          </div>

          {/* Critical segments */}
          {analysis.critical_segments.length > 0 && (
            <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50 mb-3">
              <div className="text-[10px] text-gray-500 uppercase mb-2">Critical Segments</div>
              <div className="space-y-2">
                {analysis.critical_segments.map((seg, i) => (
                  <div key={i} className="text-xs">
                    <div className="font-semibold text-orange-300">WP {seg.waypoint_index + 1}</div>
                    {seg.violations.map((v, j) => (
                      <div key={j} className="text-red-400 text-[10px] ml-2">• {v}</div>
                    ))}
                    {seg.warnings.map((w, j) => (
                      <div key={j} className="text-amber-400 text-[10px] ml-2">• {w}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Waypoint weather details */}
          <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
            <div className="text-[10px] text-gray-500 uppercase mb-2">Waypoint Weather</div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {analysis.waypoint_weather.map((wp, i) => (
                <div key={i} className="bg-gray-900/50 rounded p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-gray-300">WP {i + 1}</span>
                    <span className={`text-[9px] font-bold uppercase ${RISK_COLORS[wp.risk_level].text}`}>
                      {wp.risk_level}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-[9px]">
                    <div className="flex items-center gap-1">
                      <Wind size={10} className="text-gray-500" />
                      <span className="text-gray-400">{wp.weather.wind_speed.toFixed(1)} m/s</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Thermometer size={10} className="text-gray-500" />
                      <span className="text-gray-400">{wp.weather.temperature.toFixed(1)}°C</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Droplets size={10} className="text-gray-500" />
                      <span className="text-gray-400">{wp.weather.precipitation.toFixed(1)} mm/h</span>
                    </div>
                  </div>
                  {wp.energy_penalty > 10 && (
                    <div className="mt-1 text-[9px] text-amber-400">
                      Energy penalty: +{wp.energy_penalty.toFixed(1)}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
