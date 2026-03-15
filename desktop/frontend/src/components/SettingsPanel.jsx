import React from 'react';
import useDroneStore from '../store/droneStore';

function SettingRow({ label, children }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.04]">
      <span className="text-[11px] text-gray-400">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ enabled, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-9 h-5 rounded-full transition-colors ${enabled ? 'bg-emerald-600' : 'bg-gray-700'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${enabled ? 'translate-x-4' : ''}`} />
    </button>
  );
}

export default function SettingsPanel() {
  const confirmDangerousCommands = useDroneStore((s) => s.confirmDangerousCommands);
  const setConfirmDangerousCommands = useDroneStore((s) => s.setConfirmDangerousCommands);
  const defaultAlt = useDroneStore((s) => s.defaultAlt);
  const setDefaultAlt = useDroneStore((s) => s.setDefaultAlt);
  const defaultSpeed = useDroneStore((s) => s.defaultSpeed);
  const setDefaultSpeed = useDroneStore((s) => s.setDefaultSpeed);
  const takeoffAlt = useDroneStore((s) => s.takeoffAlt);
  const setTakeoffAlt = useDroneStore((s) => s.setTakeoffAlt);
  const followMeHeight = useDroneStore((s) => s.followMeHeight);
  const setFollowMeHeight = useDroneStore((s) => s.setFollowMeHeight);
  const followMeDistance = useDroneStore((s) => s.followMeDistance);
  const setFollowMeDistance = useDroneStore((s) => s.setFollowMeDistance);
  const followMeAngle = useDroneStore((s) => s.followMeAngle);
  const setFollowMeAngle = useDroneStore((s) => s.setFollowMeAngle);

  return (
    <div className="p-4 space-y-4">
      {/* Safety */}
      <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Safety</div>
        <div className="bg-gray-800/30 rounded-xl p-3 border border-white/[0.04]">
          <SettingRow label="Confirm Dangerous Commands">
            <Toggle enabled={confirmDangerousCommands} onToggle={() => setConfirmDangerousCommands(!confirmDangerousCommands)} />
          </SettingRow>
        </div>
      </div>

      {/* Flight Defaults */}
      <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Flight Defaults</div>
        <div className="bg-gray-800/30 rounded-xl p-3 border border-white/[0.04] space-y-0">
          <SettingRow label="Default Alt (m)">
            <input
              type="number"
              value={defaultAlt}
              onChange={(e) => setDefaultAlt(Number(e.target.value))}
              className="w-16 bg-gray-800/60 border border-white/[0.06] rounded-lg px-2 py-1 text-[10px] text-gray-300 text-right focus:outline-none focus:border-white/[0.15]"
            />
          </SettingRow>
          <SettingRow label="Default Speed (m/s)">
            <input
              type="number"
              value={defaultSpeed}
              onChange={(e) => setDefaultSpeed(Number(e.target.value))}
              className="w-16 bg-gray-800/60 border border-white/[0.06] rounded-lg px-2 py-1 text-[10px] text-gray-300 text-right focus:outline-none focus:border-white/[0.15]"
            />
          </SettingRow>
          <SettingRow label="Takeoff Alt (m)">
            <input
              type="number"
              value={takeoffAlt}
              onChange={(e) => setTakeoffAlt(Number(e.target.value))}
              className="w-16 bg-gray-800/60 border border-white/[0.06] rounded-lg px-2 py-1 text-[10px] text-gray-300 text-right focus:outline-none focus:border-white/[0.15]"
            />
          </SettingRow>
        </div>
      </div>

      {/* Follow Me */}
      <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Follow Me</div>
        <div className="bg-gray-800/30 rounded-xl p-3 border border-white/[0.04] space-y-0">
          <SettingRow label="Height (m)">
            <input
              type="number"
              value={followMeHeight}
              onChange={(e) => setFollowMeHeight(Number(e.target.value))}
              className="w-16 bg-gray-800/60 border border-white/[0.06] rounded-lg px-2 py-1 text-[10px] text-gray-300 text-right focus:outline-none focus:border-white/[0.15]"
            />
          </SettingRow>
          <SettingRow label="Distance (m)">
            <input
              type="number"
              value={followMeDistance}
              onChange={(e) => setFollowMeDistance(Number(e.target.value))}
              className="w-16 bg-gray-800/60 border border-white/[0.06] rounded-lg px-2 py-1 text-[10px] text-gray-300 text-right focus:outline-none focus:border-white/[0.15]"
            />
          </SettingRow>
          <SettingRow label="Angle (°)">
            <input
              type="number"
              value={followMeAngle}
              onChange={(e) => setFollowMeAngle(Number(e.target.value))}
              className="w-16 bg-gray-800/60 border border-white/[0.06] rounded-lg px-2 py-1 text-[10px] text-gray-300 text-right focus:outline-none focus:border-white/[0.15]"
            />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}
