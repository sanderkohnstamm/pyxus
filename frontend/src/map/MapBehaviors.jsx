import { useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import useDroneStore from '../store/droneStore';

// GCS location tracker — uses browser geolocation (CoreLocation on macOS)
export function GcsLocator() {
  const map = useMap();
  const gcsPosition = useDroneStore((s) => s.gcsPosition);
  const setGcsPosition = useDroneStore((s) => s.setGcsPosition);
  const gcsZoomed = useDroneStore((s) => s._gcsZoomed);
  const markGcsZoomed = useDroneStore((s) => s.markGcsZoomed);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let cancelled = false;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!cancelled) {
          setGcsPosition({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy });
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
    );
    return () => { cancelled = true; navigator.geolocation.clearWatch(watchId); };
  }, [setGcsPosition]);

  // Zoom to GCS on first fix — only if no drone is connected yet
  useEffect(() => {
    if (gcsZoomed || !gcsPosition || activeDroneId) return;
    markGcsZoomed();
    map.setView([gcsPosition.lat, gcsPosition.lon], 15, { animate: true });
  }, [gcsPosition, gcsZoomed, activeDroneId, markGcsZoomed, map]);

  return null;
}

// Invalidate map size when sidebar collapses/expands
export function MapResizer() {
  const map = useMap();
  const sidebarCollapsed = useDroneStore((s) => s.sidebarCollapsed);

  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(timer);
  }, [sidebarCollapsed, map]);

  return null;
}

// Component to follow active drone position
export function DroneFollower() {
  const map = useMap();
  const lat = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.lat : 0) || 0;
  const lon = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.lon : 0) || 0;
  const followDrone = useDroneStore((s) => s.followDrone);
  const setFollowDrone = useDroneStore((s) => s.setFollowDrone);
  const zoomToDrone = useDroneStore((s) => s.zoomToDrone);
  const clearZoomToDrone = useDroneStore((s) => s.clearZoomToDrone);

  useMapEvents({
    dragstart: () => setFollowDrone(false),
  });

  // Zoom to drone on connect trigger
  useEffect(() => {
    if (zoomToDrone && lat !== 0 && lon !== 0) {
      map.setView([lat, lon], 17, { animate: true });
      clearZoomToDrone();
    }
  }, [zoomToDrone, lat, lon, map, clearZoomToDrone]);

  useEffect(() => {
    if (followDrone && lat !== 0 && lon !== 0) {
      map.setView([lat, lon], map.getZoom(), { animate: true });
    }
  }, [lat, lon, followDrone, map]);

  return null;
}

// Click handler for adding waypoints/fence vertices + fly mode targeting
export function MapClickHandler() {
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

  useMapEvents({
    click: (e) => {
      // Quick mission mode (highest priority in fly mode)
      if (quickMissionMode) {
        addQuickMissionWaypoint(e.latlng.lat, e.latlng.lng);
        return;
      }
      // Measure mode
      if (measureMode) {
        addMeasurePoint(e.latlng.lat, e.latlng.lng);
        return;
      }
      // Pattern bounds drawing mode
      if (patternDrawMode) {
        addPatternBoundsVertex(e.latlng.lat, e.latlng.lng);
        return;
      }
      // Planning mode works offline
      if (activeTab === 'planning' && addWaypointMode) {
        if (planSubTab === 'fence') {
          addFenceVertex(e.latlng.lat, e.latlng.lng);
        } else {
          addWaypoint(e.latlng.lat, e.latlng.lng);
        }
      }
      // Flying mode requires connection
      else if (activeTab === 'flying' && activeDroneId) {
        setFlyClickTarget({ lat: e.latlng.lat, lon: e.latlng.lng });
      }
    },
  });

  return null;
}

// Set crosshair cursor when in add mode or measure mode
export function AddModeCursor() {
  const map = useMap();
  const addWaypointMode = useDroneStore((s) => s.addWaypointMode);
  const activeTab = useDroneStore((s) => s.activeTab);
  const measureMode = useDroneStore((s) => s.measureMode);
  const quickMissionMode = useDroneStore((s) => s.quickMissionMode);

  useEffect(() => {
    const container = map.getContainer();
    if (quickMissionMode || measureMode || (addWaypointMode && activeTab === 'planning')) {
      container.style.cursor = 'crosshair';
    } else {
      container.style.cursor = '';
    }
    return () => { container.style.cursor = ''; };
  }, [addWaypointMode, activeTab, measureMode, quickMissionMode, map]);

  return null;
}
