import React from 'react';
import useDroneStore, { INITIAL_TELEMETRY } from '../../store/droneStore';

function TelemetryItem({ label, value, unit, warn }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-[11px] text-gray-500">{label}</span>
      <span className={`text-[13px] font-mono font-medium ${warn ? 'text-amber-400' : 'text-gray-200'}`}>
        {value}<span className="text-[10px] text-gray-500 ml-0.5">{unit}</span>
      </span>
    </div>
  );
}

export default function TelemetryCompact() {
  const telemetry = useDroneStore((s) =>
    s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry : INITIAL_TELEMETRY
  ) || INITIAL_TELEMETRY;

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-0 px-1">
      <TelemetryItem label="Altitude" value={telemetry.alt?.toFixed(1) || '0.0'} unit="m" />
      <TelemetryItem label="Alt MSL" value={telemetry.alt_msl?.toFixed(1) || '0.0'} unit="m" />
      <TelemetryItem label="Ground Speed" value={telemetry.groundspeed?.toFixed(1) || '0.0'} unit="m/s" />
      <TelemetryItem label="Air Speed" value={telemetry.airspeed?.toFixed(1) || '0.0'} unit="m/s" />
      <TelemetryItem label="Climb Rate" value={telemetry.climb?.toFixed(1) || '0.0'} unit="m/s" />
      <TelemetryItem label="Heading" value={telemetry.heading?.toFixed(0) || '0'} unit="°" />
      <TelemetryItem label="Voltage" value={telemetry.voltage?.toFixed(1) || '0.0'} unit="V" />
      <TelemetryItem
        label="Battery"
        value={telemetry.remaining >= 0 ? telemetry.remaining : '--'}
        unit="%"
        warn={telemetry.remaining >= 0 && telemetry.remaining <= 30}
      />
    </div>
  );
}
