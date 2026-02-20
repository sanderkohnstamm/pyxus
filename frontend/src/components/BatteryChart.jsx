import React, { useMemo } from 'react';
import useDroneStore, { EMPTY_ARRAY, EMPTY_OBJECT } from '../store/droneStore';

const W = 340;
const H = 80;
const padL = 32;
const padR = 8;
const padT = 8;
const padB = 14;
const chartW = W - padL - padR;
const chartH = H - padT - padB;

export default function BatteryChart() {
  const batteryHistory = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.batteryHistory ?? EMPTY_ARRAY : EMPTY_ARRAY);
  const params = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.params ?? EMPTY_OBJECT : EMPTY_OBJECT);

  const chartData = useMemo(() => {
    if (batteryHistory.length < 2) return null;

    const voltages = batteryHistory.map((d) => d.voltage);
    const currents = batteryHistory.map((d) => d.current);
    const t0 = batteryHistory[0].ts;
    const tN = batteryHistory[batteryHistory.length - 1].ts;
    const elapsed = (tN - t0) / 1000;

    const vMin = Math.min(...voltages) - 0.2;
    const vMax = Math.max(...voltages) + 0.2;
    const vRange = vMax - vMin || 1;

    const cMax = Math.max(...currents, 1);
    const cMin = 0;
    const cRange = cMax - cMin || 1;

    const xScale = (ts) => padL + ((ts - t0) / (tN - t0 || 1)) * chartW;
    const yVolt = (v) => padT + chartH - ((v - vMin) / vRange) * chartH;
    const yCurr = (c) => padT + chartH - ((c - cMin) / cRange) * chartH;

    const voltagePath = batteryHistory
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.ts).toFixed(1)} ${yVolt(d.voltage).toFixed(1)}`)
      .join(' ');

    const currentPath = batteryHistory
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(d.ts).toFixed(1)} ${yCurr(d.current).toFixed(1)}`)
      .join(' ');

    const latestV = voltages[voltages.length - 1];
    const latestC = currents[currents.length - 1];

    // Y-axis ticks for voltage (2-3 ticks)
    const vStep = Math.ceil(vRange / 3 * 10) / 10 || 0.5;
    const vTicks = [];
    for (let v = Math.ceil(vMin / vStep) * vStep; v <= vMax; v += vStep) {
      vTicks.push(v);
    }

    return { voltagePath, currentPath, latestV, latestC, elapsed, vTicks, yVolt, vMin, vMax };
  }, [batteryHistory]);

  // Voltage threshold lines from drone params
  const lowVolt = params.BATT_LOW_VOLT?.value;
  const crtVolt = params.BATT_CRT_VOLT?.value;

  if (!chartData) return null;

  const { voltagePath, currentPath, latestV, latestC, elapsed, vTicks, yVolt, vMin, vMax } = chartData;

  const elapsedStr = elapsed < 60
    ? `${Math.round(elapsed)}s`
    : `${Math.floor(elapsed / 60)}:${String(Math.round(elapsed % 60)).padStart(2, '0')}`;

  return (
    <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50 mx-4 mb-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Battery</span>
        <span className="text-[9px] text-gray-600 ml-auto">{elapsedStr}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '80px' }}>
        {/* Grid lines */}
        {vTicks.map((v) => (
          <g key={v}>
            <line x1={padL} y1={yVolt(v)} x2={W - padR} y2={yVolt(v)} stroke="rgba(148,163,184,0.1)" strokeWidth="0.5" />
            <text x={padL - 3} y={yVolt(v) + 3} textAnchor="end" fill="rgba(148,163,184,0.35)" fontSize="6.5" fontFamily="monospace">
              {v.toFixed(1)}
            </text>
          </g>
        ))}

        {/* Voltage threshold lines from drone params */}
        {lowVolt > 0 && lowVolt >= vMin && lowVolt <= vMax && (
          <g>
            <line
              x1={padL} y1={yVolt(lowVolt)} x2={W - padR} y2={yVolt(lowVolt)}
              stroke="#f59e0b" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.7"
            />
            <text x={W - padR} y={yVolt(lowVolt) - 2} textAnchor="end" fill="#f59e0b" fontSize="5.5" fontFamily="monospace" opacity="0.7">
              WARN {lowVolt.toFixed(1)}V
            </text>
          </g>
        )}
        {crtVolt > 0 && crtVolt >= vMin && crtVolt <= vMax && (
          <g>
            <line
              x1={padL} y1={yVolt(crtVolt)} x2={W - padR} y2={yVolt(crtVolt)}
              stroke="#ef4444" strokeWidth="0.8" strokeDasharray="4 3" opacity="0.7"
            />
            <text x={W - padR} y={yVolt(crtVolt) - 2} textAnchor="end" fill="#ef4444" fontSize="5.5" fontFamily="monospace" opacity="0.7">
              CRIT {crtVolt.toFixed(1)}V
            </text>
          </g>
        )}

        {/* Current line */}
        <path d={currentPath} fill="none" stroke="#f59e0b" strokeWidth="1" opacity="0.6" />

        {/* Voltage line */}
        <path d={voltagePath} fill="none" stroke="#06b6d4" strokeWidth="1.5" />

        {/* Latest values */}
        <text x={W - padR} y={padT + 8} textAnchor="end" fill="#06b6d4" fontSize="8" fontFamily="monospace" fontWeight="bold">
          {latestV.toFixed(1)}V
        </text>
        <text x={W - padR} y={padT + 18} textAnchor="end" fill="#f59e0b" fontSize="7" fontFamily="monospace" opacity="0.8">
          {latestC.toFixed(1)}A
        </text>
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-1 text-[9px] text-gray-600 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-0.5 bg-cyan-500 rounded-full inline-block" />
          Voltage
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-0.5 bg-amber-500/60 rounded-full inline-block" />
          Current
        </span>
        {lowVolt > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0 border-t border-dashed border-amber-500 inline-block" />
            Warn
          </span>
        )}
        {crtVolt > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0 border-t border-dashed border-red-500 inline-block" />
            Crit
          </span>
        )}
      </div>
    </div>
  );
}
