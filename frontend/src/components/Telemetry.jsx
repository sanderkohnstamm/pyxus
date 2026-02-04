import React from 'react';
import { MapPin, Gauge, Battery, Satellite, Activity } from 'lucide-react';
import useDroneStore from '../store/droneStore';

function TelemetryRow({ label, value, unit = '' }) {
  return (
    <div className="flex justify-between items-baseline py-0.5">
      <span className="text-gray-500 text-[11px]">{label}</span>
      <span className="font-mono text-xs text-gray-200">
        {value}
        {unit && <span className="text-gray-500 ml-1 text-[10px]">{unit}</span>}
      </span>
    </div>
  );
}

function SectionHeader({ icon: Icon, label }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon size={11} className="text-gray-600" />
      <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</span>
    </div>
  );
}

function toDeg(rad) {
  return ((rad * 180) / Math.PI).toFixed(1);
}

const FIX_TYPES = {
  0: 'No GPS',
  1: 'No Fix',
  2: '2D',
  3: '3D',
  4: 'DGPS',
  5: 'RTK Float',
  6: 'RTK Fixed',
};

export default function Telemetry() {
  const t = useDroneStore((s) => s.telemetry);
  const connectionStatus = useDroneStore((s) => s.connectionStatus);

  if (connectionStatus !== 'connected') {
    return (
      <div className="p-4">
        <div className="text-xs text-gray-600 italic text-center py-8">
          Connect to a vehicle to see telemetry
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {/* Position + Speed combined */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <SectionHeader icon={MapPin} label="Position & Speed" />
        <TelemetryRow label="Lat" value={t.lat.toFixed(7)} />
        <TelemetryRow label="Lon" value={t.lon.toFixed(7)} />
        <TelemetryRow label="Alt (rel)" value={t.alt.toFixed(1)} unit="m" />
        <TelemetryRow label="Alt (MSL)" value={t.alt_msl.toFixed(1)} unit="m" />
        <div className="border-t border-gray-700/30 mt-1.5 pt-1.5" />
        <TelemetryRow label="Ground" value={t.groundspeed.toFixed(1)} unit="m/s" />
        <TelemetryRow label="Air" value={t.airspeed.toFixed(1)} unit="m/s" />
        <TelemetryRow label="Climb" value={t.climb.toFixed(1)} unit="m/s" />
        <TelemetryRow label="Heading" value={t.heading} unit="deg" />
      </div>

      {/* Battery + GPS compact row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
          <SectionHeader icon={Battery} label="Battery" />
          <TelemetryRow label="V" value={t.voltage.toFixed(1)} unit="V" />
          <TelemetryRow label="A" value={t.current.toFixed(1)} unit="A" />
          <TelemetryRow
            label="%"
            value={t.remaining >= 0 ? t.remaining : '--'}
          />
        </div>
        <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
          <SectionHeader icon={Satellite} label="GPS" />
          <TelemetryRow label="Fix" value={FIX_TYPES[t.fix_type] || t.fix_type} />
          <TelemetryRow label="Sats" value={t.satellites} />
          <TelemetryRow label="HDOP" value={t.hdop.toFixed(2)} />
        </div>
      </div>

      {/* Attitude */}
      <div className="bg-gray-800/40 rounded-lg p-3 border border-gray-800/50">
        <SectionHeader icon={Activity} label="Attitude" />
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-[10px] text-gray-500">Roll</div>
            <div className="font-mono text-xs text-gray-200">{toDeg(t.roll)}&deg;</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-gray-500">Pitch</div>
            <div className="font-mono text-xs text-gray-200">{toDeg(t.pitch)}&deg;</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-gray-500">Yaw</div>
            <div className="font-mono text-xs text-gray-200">{toDeg(t.yaw)}&deg;</div>
          </div>
        </div>
      </div>
    </div>
  );
}
