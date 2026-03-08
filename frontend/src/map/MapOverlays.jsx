import React from 'react';
import { Ruler, Box, Square } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import { enableTerrain, disableTerrain } from './styles';
import MavLog from '../components/MavLog';
import VideoOverlay from '../components/VideoOverlay';

export default function MapOverlays({ mapRef }) {
  const followDrone = useDroneStore((s) => s.followDrone);
  const setFollowDrone = useDroneStore((s) => s.setFollowDrone);
  const activeTab = useDroneStore((s) => s.activeTab);
  const addWaypointMode = useDroneStore((s) => s.addWaypointMode);
  const toggleAddWaypointMode = useDroneStore((s) => s.toggleAddWaypointMode);
  const planSubTab = useDroneStore((s) => s.planSubTab);
  const measureMode = useDroneStore((s) => s.measureMode);
  const setMeasureMode = useDroneStore((s) => s.setMeasureMode);
  const clearMeasure = useDroneStore((s) => s.clearMeasure);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const is3DMode = useDroneStore((s) => s.is3DMode);
  const setIs3DMode = useDroneStore((s) => s.setIs3DMode);

  const isPlanning = activeTab === 'planning';
  const isConnected = !!activeDroneId;

  const toggle3D = () => {
    const mapInstance = mapRef?.current?.getMap?.();
    if (!mapInstance) return;

    const newMode = !is3DMode;
    setIs3DMode(newMode);

    if (newMode) {
      enableTerrain(mapInstance);
      mapInstance.easeTo({ pitch: 45, duration: 500 });
    } else {
      disableTerrain(mapInstance);
      mapInstance.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    }
  };

  return (
    <>
      {/* Follow button */}
      <button
        onClick={() => setFollowDrone(!followDrone)}
        className={`absolute top-3 right-3 z-[1000] px-3 py-1.5 rounded-md text-xs font-semibold transition-all border backdrop-blur-md ${
          followDrone
            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
            : 'bg-gray-900/60 text-gray-400 hover:text-gray-200 border-gray-700/40'
        }`}
      >
        {followDrone ? 'Following' : 'Follow'}
      </button>

      {/* Add waypoints toggle */}
      {isPlanning && (
        <button
          onClick={toggleAddWaypointMode}
          className={`absolute bottom-3 right-3 z-[1000] px-3 py-1.5 rounded-md text-xs font-semibold transition-all border backdrop-blur-md ${
            addWaypointMode
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30 shadow-lg shadow-cyan-500/10'
              : 'bg-gray-900/60 text-gray-400 hover:text-gray-200 border-gray-700/40'
          }`}
        >
          {addWaypointMode
            ? (planSubTab === 'fence' ? 'Adding Fence Vertices...' : 'Adding Waypoints...')
            : (planSubTab === 'fence' ? 'Add Fence Vertices' : 'Add Waypoints')
          }
        </button>
      )}

      {/* Bottom-left overlays */}
      <div className="absolute bottom-3 left-3 z-[1000] flex items-end gap-1.5">
        {isConnected && <MavLog />}
        <button
          onClick={() => {
            if (measureMode) clearMeasure();
            else setMeasureMode(true);
          }}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all border backdrop-blur-md ${
            measureMode
              ? 'bg-orange-500/20 text-orange-300 border-orange-500/30 shadow-lg shadow-orange-500/10'
              : 'bg-gray-900/60 text-gray-400 hover:text-gray-200 border-gray-700/40'
          }`}
          title="Measure distance & bearing"
        >
          <Ruler size={14} />
        </button>

        {/* 2D/3D toggle */}
        <button
          onClick={toggle3D}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all border backdrop-blur-md ${
            is3DMode
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
              : 'bg-gray-900/60 text-gray-400 hover:text-gray-200 border-gray-700/40'
          }`}
          title={is3DMode ? 'Switch to 2D' : 'Switch to 3D'}
        >
          {is3DMode ? <Box size={14} /> : <Square size={14} />}
        </button>

        {isConnected && <VideoOverlay />}
      </div>
    </>
  );
}
