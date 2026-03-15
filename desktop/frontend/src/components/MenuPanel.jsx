import React from 'react';
import { Monitor, Video, Map as MapIcon, Wrench } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import useWebSocket from '../hooks/useWebSocket';
import { GlassPanel } from './ui/GlassPanel';
import Telemetry from './Telemetry';
import Controls from './Controls';
import MissionPanel from './MissionPanel';
import ToolsPanel from './ToolsPanel';
import SettingsPanel from './SettingsPanel';
import AttitudeIndicator from './AttitudeIndicator';
import BatteryChart from './BatteryChart';
import ErrorBoundary from './ErrorBoundary';

const TABS = [
  { id: 'command', label: 'Command', icon: Monitor },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'plan', label: 'Plan', icon: MapIcon },
  { id: 'tools', label: 'Tools', icon: Wrench },
];

export default function MenuPanel() {
  const { sendMessage } = useWebSocket();
  const menuTab = useDroneStore((s) => s.menuTab);
  const setMenuTab = useDroneStore((s) => s.setMenuTab);

  return (
    <GlassPanel className="fixed top-16 right-3 bottom-3 w-[340px] z-[95] flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-white/[0.06] shrink-0 px-2 pt-2 gap-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMenuTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider transition-all rounded-t-lg ${
              menuTab === tab.id
                ? 'text-gray-200 bg-white/[0.06]'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
            }`}
          >
            <tab.icon size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <ErrorBoundary name="MenuContent">
          {menuTab === 'command' || menuTab === 'video' ? (
            <>
              <Telemetry />
              <BatteryChart />
              <div className="px-4 pb-4">
                <AttitudeIndicator />
              </div>
              <Controls />
            </>
          ) : menuTab === 'plan' ? (
            <MissionPanel />
          ) : (
            <>
              <ToolsPanel sendMessage={sendMessage} />
              <SettingsPanel />
            </>
          )}
        </ErrorBoundary>
      </div>
    </GlassPanel>
  );
}
