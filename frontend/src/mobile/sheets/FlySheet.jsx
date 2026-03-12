import React from 'react';
import { Gamepad2 } from 'lucide-react';
import useDroneStore from '../../store/droneStore';
import AttitudeIndicator from '../../components/AttitudeIndicator';
import BatteryChart from '../../components/BatteryChart';
import TelemetryCompact from '../components/TelemetryCompact';
import ModeChips from '../components/ModeChips';
import MissionControlBar from '../components/MissionControlBar';

export default function FlySheet() {
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const virtualSticksEnabled = useDroneStore((s) => s.virtualSticksEnabled);
  const setVirtualSticksEnabled = useDroneStore((s) => s.setVirtualSticksEnabled);

  if (!activeDroneId) {
    return (
      <div className="text-center py-8 text-gray-600 text-[12px]">
        Connect a drone to see flight data
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      {/* Mode selector */}
      <ModeChips />

      {/* Telemetry grid */}
      <TelemetryCompact />

      {/* Attitude indicator */}
      <AttitudeIndicator />

      {/* Battery sparkline */}
      <BatteryChart />

      {/* Mission controls */}
      <MissionControlBar />

      {/* Virtual sticks toggle */}
      <button
        onClick={() => setVirtualSticksEnabled(!virtualSticksEnabled)}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-[12px] font-semibold transition-all active:scale-[0.98] ${
          virtualSticksEnabled
            ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
            : 'bg-gray-900/60 border-gray-700/30 text-gray-400'
        }`}
      >
        <Gamepad2 size={14} />
        {virtualSticksEnabled ? 'Manual Control Active' : 'Enable Manual Control'}
      </button>
    </div>
  );
}
