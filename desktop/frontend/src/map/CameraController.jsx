import { useEffect } from 'react';
import { useMap } from '@vis.gl/react-maplibre';
import useDroneStore from '../store/droneStore';

export default function CameraController({ mapRef }) {
  const map = useMap();
  const lat = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.lat : 0) || 0;
  const lon = useDroneStore((s) => s.activeDroneId ? s.drones[s.activeDroneId]?.telemetry?.lon : 0) || 0;
  const followDrone = useDroneStore((s) => s.followDrone);
  const setFollowDrone = useDroneStore((s) => s.setFollowDrone);
  const zoomToDrone = useDroneStore((s) => s.zoomToDrone);
  const clearZoomToDrone = useDroneStore((s) => s.clearZoomToDrone);
  const sidebarCollapsed = useDroneStore((s) => s.sidebarCollapsed);
  const gcsPosition = useDroneStore((s) => s.gcsPosition);
  const setGcsPosition = useDroneStore((s) => s.setGcsPosition);
  const gcsZoomed = useDroneStore((s) => s._gcsZoomed);
  const markGcsZoomed = useDroneStore((s) => s.markGcsZoomed);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);

  const mapInstance = map?.current?.getMap?.() || mapRef?.current?.getMap?.();

  // Disable follow on user drag
  useEffect(() => {
    if (!mapInstance) return;
    const onDragStart = () => setFollowDrone(false);
    mapInstance.on('dragstart', onDragStart);
    return () => mapInstance.off('dragstart', onDragStart);
  }, [mapInstance, setFollowDrone]);

  // Zoom to drone on connect trigger
  useEffect(() => {
    if (!mapInstance || !zoomToDrone || lat === 0 || lon === 0) return;
    mapInstance.easeTo({ center: [lon, lat], zoom: 17, duration: 1000 });
    clearZoomToDrone();
  }, [mapInstance, zoomToDrone, lat, lon, clearZoomToDrone]);

  // Follow drone
  useEffect(() => {
    if (!mapInstance || !followDrone || lat === 0 || lon === 0) return;
    mapInstance.easeTo({ center: [lon, lat], duration: 500 });
  }, [mapInstance, lat, lon, followDrone]);

  // Resize on sidebar toggle
  useEffect(() => {
    if (!mapInstance) return;
    const timer = setTimeout(() => mapInstance.resize(), 250);
    return () => clearTimeout(timer);
  }, [mapInstance, sidebarCollapsed]);

  // GCS geolocation
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

  // Zoom to GCS on first fix (only if no drone connected)
  useEffect(() => {
    if (!mapInstance || gcsZoomed || !gcsPosition || activeDroneId) return;
    markGcsZoomed();
    mapInstance.flyTo({ center: [gcsPosition.lon, gcsPosition.lat], zoom: 15 });
  }, [mapInstance, gcsPosition, gcsZoomed, activeDroneId, markGcsZoomed]);

  return null;
}
