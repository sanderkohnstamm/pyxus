import React from 'react';
import useDroneStore from '../store/droneStore';
import MapView from '../components/Map';
import StatusStrip from './StatusStrip';
import FloatingActions from './FloatingActions';
import BottomSheet from './BottomSheet';
import PlanSheet from './sheets/PlanSheet';
import FlySheet from './sheets/FlySheet';
import ToolsSheet from './sheets/ToolsSheet';
import VirtualSticks from './components/VirtualSticks';

export default function MobileLayout({ sendMessage }) {
  const activeTab = useDroneStore((s) => s.activeTab);
  const setBottomSheetSnap = useDroneStore((s) => s.setBottomSheetSnap);
  const virtualSticksEnabled = useDroneStore((s) => s.virtualSticksEnabled);

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

      {/* Virtual sticks overlay (when manual control active) */}
      {virtualSticksEnabled && (
        <VirtualSticks sendMessage={sendMessage} />
      )}

      {/* Bottom sheet */}
      <BottomSheet>
        {activeTab === 'planning' ? (
          <PlanSheet />
        ) : activeTab === 'flying' ? (
          <FlySheet />
        ) : (
          <ToolsSheet />
        )}
      </BottomSheet>
    </>
  );
}
