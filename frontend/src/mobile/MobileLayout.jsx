import React from 'react';
import useDroneStore from '../store/droneStore';
import MapView from '../components/Map';
import FlyOverlay from '../components/FlyOverlay';
import StatusStrip from './StatusStrip';
import BottomSheet from './BottomSheet';
import MissionPanel from '../components/MissionPanel';
import Telemetry from '../components/Telemetry';
import AttitudeIndicator from '../components/AttitudeIndicator';
import BatteryChart from '../components/BatteryChart';
import ToolsPanel from '../components/ToolsPanel';

export default function MobileLayout() {
  const activeTab = useDroneStore((s) => s.activeTab);
  const setBottomSheetSnap = useDroneStore((s) => s.setBottomSheetSnap);

  return (
    <>
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <MapView />
        {activeTab === 'flying' && <FlyOverlay />}
      </div>

      {/* Status strip (top) */}
      <StatusStrip onTap={() => setBottomSheetSnap('half')} />

      {/* Bottom sheet */}
      <BottomSheet>
        {activeTab === 'planning' ? (
          <MissionPanel />
        ) : activeTab === 'flying' ? (
          <>
            <Telemetry />
            <BatteryChart />
            <div className="pb-4">
              <AttitudeIndicator />
            </div>
          </>
        ) : (
          <ToolsPanel />
        )}
      </BottomSheet>
    </>
  );
}
