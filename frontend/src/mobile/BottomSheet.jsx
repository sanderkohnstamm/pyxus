import React, { useRef, useCallback, useEffect } from 'react';
import { Map as MapIcon, Plane, Wrench } from 'lucide-react';
import useDroneStore from '../store/droneStore';
import { INITIAL_TELEMETRY } from '../store/droneStore';

// Snap points as fraction of viewport height
const SNAP_POINTS = {
  peek: 0.10,   // ~80pt on iPhone
  half: 0.50,
  full: 0.92,
};

// Spring animation helper
function animateTo(element, targetY, duration = 300) {
  const start = parseFloat(element.style.transform?.match(/translateY\((.+)px\)/)?.[1] || '0');
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = start + (targetY - start) * ease;
    element.style.transform = `translateY(${current}px)`;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export default function BottomSheet({ children }) {
  const sheetRef = useRef(null);
  const dragState = useRef({ dragging: false, startY: 0, startTranslate: 0 });
  const bottomSheetSnap = useDroneStore((s) => s.bottomSheetSnap);
  const setBottomSheetSnap = useDroneStore((s) => s.setBottomSheetSnap);
  const activeTab = useDroneStore((s) => s.activeTab);
  const setActiveTab = useDroneStore((s) => s.setActiveTab);

  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const activeDrone = activeDroneId ? useDroneStore.getState().drones[activeDroneId] : null;
  const tel = activeDrone?.telemetry || INITIAL_TELEMETRY;

  // Calculate translateY for a snap point (from bottom of screen)
  const getTranslateY = useCallback((snap) => {
    const vh = window.innerHeight;
    const fraction = SNAP_POINTS[snap] || SNAP_POINTS.peek;
    // Sheet top = vh - (fraction * vh)
    return vh * (1 - fraction);
  }, []);

  // Set initial position and update on snap change
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const targetY = getTranslateY(bottomSheetSnap);
    animateTo(el, targetY);
  }, [bottomSheetSnap, getTranslateY]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const el = sheetRef.current;
      if (!el) return;
      const targetY = getTranslateY(bottomSheetSnap);
      el.style.transform = `translateY(${targetY}px)`;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [bottomSheetSnap, getTranslateY]);

  // Touch handlers for drag
  const onTouchStart = useCallback((e) => {
    const el = sheetRef.current;
    if (!el) return;
    const currentY = parseFloat(el.style.transform?.match(/translateY\((.+)px\)/)?.[1] || '0');
    dragState.current = { dragging: true, startY: e.touches[0].clientY, startTranslate: currentY };
    el.style.transition = 'none';
  }, []);

  const onTouchMove = useCallback((e) => {
    if (!dragState.current.dragging) return;
    const el = sheetRef.current;
    if (!el) return;
    const deltaY = e.touches[0].clientY - dragState.current.startY;
    const newY = dragState.current.startTranslate + deltaY;
    // Clamp: don't go above full or below screen
    const minY = getTranslateY('full');
    const maxY = window.innerHeight;
    el.style.transform = `translateY(${Math.max(minY, Math.min(maxY, newY))}px)`;
  }, [getTranslateY]);

  const onTouchEnd = useCallback(() => {
    if (!dragState.current.dragging) return;
    dragState.current.dragging = false;
    const el = sheetRef.current;
    if (!el) return;

    const currentY = parseFloat(el.style.transform?.match(/translateY\((.+)px\)/)?.[1] || '0');
    const vh = window.innerHeight;

    // Find nearest snap point
    let nearest = 'peek';
    let minDist = Infinity;
    for (const [snap, fraction] of Object.entries(SNAP_POINTS)) {
      const snapY = vh * (1 - fraction);
      const dist = Math.abs(currentY - snapY);
      if (dist < minDist) {
        minDist = dist;
        nearest = snap;
      }
    }

    setBottomSheetSnap(nearest);
    animateTo(el, getTranslateY(nearest));
  }, [getTranslateY, setBottomSheetSnap]);

  // Peek summary line
  const summaryParts = [];
  if (tel.mode) summaryParts.push(tel.mode);
  if (tel.alt) summaryParts.push(`Alt: ${tel.alt.toFixed(0)}m`);
  if (tel.groundspeed) summaryParts.push(`GS: ${tel.groundspeed.toFixed(1)}m/s`);
  if (tel.remaining >= 0) summaryParts.push(`Batt: ${tel.remaining}%`);
  const summary = summaryParts.join(' | ') || 'No telemetry';

  const tabs = [
    { id: 'planning', label: 'Plan', icon: MapIcon },
    { id: 'flying', label: 'Fly', icon: Plane },
    { id: 'tools', label: 'Tools', icon: Wrench },
  ];

  return (
    <div
      ref={sheetRef}
      className="fixed left-0 right-0 z-[90] bg-gray-950/95 backdrop-blur-2xl rounded-t-2xl border-t border-gray-800/30 shadow-2xl"
      style={{
        height: '95vh',
        transform: `translateY(${window.innerHeight * (1 - SNAP_POINTS.peek)}px)`,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Grab handle + peek summary */}
      <div
        className="flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="w-10 h-1 rounded-full bg-gray-600/60 mb-2" />
        {bottomSheetSnap === 'peek' && (
          <p className="text-xs text-gray-400 px-4 truncate max-w-full">{summary}</p>
        )}
      </div>

      {/* Tab pills — visible at half and full */}
      {bottomSheetSnap !== 'peek' && (
        <div className="flex mx-4 mb-3 p-1 bg-gray-900/60 rounded-xl">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-gray-800/80 text-cyan-400'
                  : 'text-gray-500'
              }`}
            >
              <tab.icon size={13} />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content area */}
      <div
        className="flex-1 overflow-y-auto px-4"
        style={{
          maxHeight: bottomSheetSnap === 'peek' ? '0px' : 'calc(100% - 100px)',
          opacity: bottomSheetSnap === 'peek' ? 0 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {children}
      </div>
    </div>
  );
}
