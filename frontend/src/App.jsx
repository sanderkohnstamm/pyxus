import React from 'react';
import { Map as MapIcon, Plane, Video, Wrench, PanelRightClose, PanelRightOpen, AlertTriangle } from 'lucide-react';
import useWebSocket from './hooks/useWebSocket';
import useDroneStore from './store/droneStore';
import ConnectionBar from './components/ConnectionBar';
import MapView from './components/Map';
import Telemetry from './components/Telemetry';
import Controls from './components/Controls';
import MissionPanel from './components/MissionPanel';
import VideoFeed from './components/VideoFeed';
import ToolsPanel from './components/ToolsPanel';
import FlyOverlay from './components/FlyOverlay';

export default function App() {
  const { sendMessage, droneChangeDetected, dismissDroneChange, acceptDroneChange } = useWebSocket();
  const alerts = useDroneStore((s) => s.alerts);
  const activeTab = useDroneStore((s) => s.activeTab);
  const setActiveTab = useDroneStore((s) => s.setActiveTab);
  const theme = useDroneStore((s) => s.theme);
  const sidebarCollapsed = useDroneStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useDroneStore((s) => s.toggleSidebar);

  return (
    <div className={`h-full flex flex-col bg-gray-950 text-gray-100 ${theme === 'light' ? 'light' : ''}`}>
      {/* Top bar */}
      <ConnectionBar />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Map */}
        <div className="flex-1 relative">
          <MapView />
          {/* Fly controls overlay */}
          {activeTab === 'flying' && <FlyOverlay />}
        </div>

        {/* Sidebar collapse toggle */}
        <button
          onClick={toggleSidebar}
          className="self-center z-10 -mr-px flex items-center justify-center w-5 h-10 bg-gray-950/50 border border-gray-800/15 rounded-l-md text-gray-500 hover:text-gray-400 transition-colors backdrop-blur-xl"
        >
          {sidebarCollapsed ? <PanelRightOpen size={12} /> : <PanelRightClose size={12} />}
        </button>

        {/* Right: Panels */}
        <div className={`${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-96'} flex flex-col border-l border-gray-800/15 bg-gray-950/65 backdrop-blur-xl transition-all duration-200`}>
          {/* Tab bar */}
          <div className="flex border-b border-gray-800/25 shrink-0">
            {[
              { id: 'planning', label: 'Plan', icon: MapIcon },
              { id: 'flying', label: 'Fly', icon: Plane },
              { id: 'video', label: 'Video', icon: Video },
              { id: 'tools', label: 'Tools', icon: Wrench },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-cyan-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <tab.icon size={13} />
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-cyan-400 rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'planning' ? (
              <MissionPanel />
            ) : activeTab === 'flying' ? (
              <>
                <Telemetry />
                <Controls sendMessage={sendMessage} />
              </>
            ) : activeTab === 'video' ? (
              <VideoFeed />
            ) : (
              <ToolsPanel sendMessage={sendMessage} />
            )}
          </div>
        </div>
      </div>

      {/* Alerts overlay */}
      <div className="fixed top-12 left-4 z-[9999] flex flex-col gap-2 max-w-sm">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium shadow-xl backdrop-blur-xl border ${
              alert.type === 'error'
                ? 'bg-red-950/50 text-red-200/80 border-red-800/20'
                : alert.type === 'success'
                ? 'bg-emerald-950/50 text-emerald-200/80 border-emerald-800/20'
                : alert.type === 'warning'
                ? 'bg-amber-950/50 text-amber-200/80 border-amber-800/20'
                : 'bg-sky-950/50 text-sky-200/80 border-sky-800/20'
            }`}
          >
            {alert.message}
          </div>
        ))}
      </div>

      {/* Drone change detection modal */}
      {droneChangeDetected && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-amber-500/30 rounded-xl p-6 max-w-md shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle size={20} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-100">Different Vehicle Detected</h3>
                <p className="text-sm text-gray-400">A different vehicle has connected</p>
              </div>
            </div>

            <div className="bg-gray-800/50 rounded-lg p-3 mb-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Previous:</span>
                <span className="text-gray-300">{droneChangeDetected.old.platformType || 'Unknown'} ({droneChangeDetected.old.autopilot})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">New:</span>
                <span className="text-amber-300">{droneChangeDetected.new.platformType || 'Unknown'} ({droneChangeDetected.new.autopilot})</span>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              Reloading will clear the current mission plan, drone mission, and parameters. You can also keep the current session if this was expected.
            </p>

            <div className="flex gap-3">
              <button
                onClick={dismissDroneChange}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 transition-colors"
              >
                Keep Session
              </button>
              <button
                onClick={acceptDroneChange}
                className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors"
              >
                Reload Connection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
