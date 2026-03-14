import { useEffect } from 'react';
import { useMap } from '@vis.gl/react-maplibre';
import useDroneStore from '../store/droneStore';

export default function MapClickHandler({ mapRef }) {
  const map = useMap();
  const addWaypoint = useDroneStore((s) => s.addWaypoint);
  const addFenceVertex = useDroneStore((s) => s.addFenceVertex);
  const addPatternBoundsVertex = useDroneStore((s) => s.addPatternBoundsVertex);
  const patternDrawMode = useDroneStore((s) => s.patternDrawMode);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const addWaypointMode = useDroneStore((s) => s.addWaypointMode);
  const activeTab = useDroneStore((s) => s.activeTab);
  const planSubTab = useDroneStore((s) => s.planSubTab);
  const setFlyClickTarget = useDroneStore((s) => s.setFlyClickTarget);
  const measureMode = useDroneStore((s) => s.measureMode);
  const addMeasurePoint = useDroneStore((s) => s.addMeasurePoint);
  const quickMissionMode = useDroneStore((s) => s.quickMissionMode);
  const addQuickMissionWaypoint = useDroneStore((s) => s.addQuickMissionWaypoint);

  const mapInstance = map?.current?.getMap?.() || mapRef?.current?.getMap?.();

  // Map click handler
  useEffect(() => {
    if (!mapInstance) return;

    const handleClick = (e) => {
      const { lng, lat } = e.lngLat;

      if (quickMissionMode) {
        addQuickMissionWaypoint(lat, lng);
        return;
      }
      if (measureMode) {
        addMeasurePoint(lat, lng);
        return;
      }
      if (patternDrawMode) {
        addPatternBoundsVertex(lat, lng);
        return;
      }
      if (activeTab === 'plan' && addWaypointMode) {
        if (planSubTab === 'fence') {
          addFenceVertex(lat, lng);
        } else {
          addWaypoint(lat, lng);
        }
      } else if (activeTab === 'command' && activeDroneId) {
        setFlyClickTarget({ lat, lon: lng });
      }
    };

    mapInstance.on('click', handleClick);
    return () => mapInstance.off('click', handleClick);
  }, [mapInstance, quickMissionMode, measureMode, patternDrawMode, activeTab, addWaypointMode, planSubTab, activeDroneId,
      addQuickMissionWaypoint, addMeasurePoint, addPatternBoundsVertex, addFenceVertex, addWaypoint, setFlyClickTarget]);

  // Cursor style
  useEffect(() => {
    if (!mapInstance) return;
    const canvas = mapInstance.getCanvas();
    if (quickMissionMode || measureMode || (addWaypointMode && activeTab === 'plan')) {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = '';
    }
    return () => { canvas.style.cursor = ''; };
  }, [mapInstance, addWaypointMode, activeTab, measureMode, quickMissionMode]);

  return null;
}
