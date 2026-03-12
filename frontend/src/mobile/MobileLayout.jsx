import React from 'react';
import useDroneStore from '../store/droneStore';
import MapView from '../components/Map';
import StatusStrip from './StatusStrip';
import FloatingActions from './FloatingActions';
import BottomSheet from './BottomSheet';
import PlanSheet from './sheets/PlanSheet';
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
      </div>

      {/* Status strip (top) */}
      <StatusStrip onTap={() => setBottomSheetSnap('half')} />

      {/* Floating action buttons (left edge) */}
      <FloatingActions />

      {/* Bottom sheet */}
      <BottomSheet>
        {activeTab === 'planning' ? (
          <PlanSheet />
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
