import { useCallback, useEffect } from 'react';
import useDroneStore from '../store/droneStore';

export default function useWeather() {
  const plannedWaypoints = useDroneStore((s) => s.plannedWaypoints);
  const weather = useDroneStore((s) => s.weather);
  const setWeatherRouteAnalysis = useDroneStore((s) => s.setWeatherRouteAnalysis);
  const setWeatherLoading = useDroneStore((s) => s.setWeatherLoading);
  const setWeatherPlatforms = useDroneStore((s) => s.setWeatherPlatforms);
  const setWeatherPlatform = useDroneStore((s) => s.setWeatherPlatform);

  // Fetch platforms on mount
  useEffect(() => {
    fetchPlatforms();
  }, []);

  // Auto-refresh route weather when waypoints change
  useEffect(() => {
    if (weather.autoRefresh && plannedWaypoints.length >= 2) {
      fetchRouteWeather();
    }
  }, [plannedWaypoints, weather.autoRefresh, weather.forecastTime]);

  const fetchPlatforms = useCallback(async () => {
    try {
      const res = await fetch('/api/weather/platforms');
      const data = await res.json();
      if (data.status === 'ok') {
        setWeatherPlatforms(data.platforms, data.current_platform);
      }
    } catch (err) {
      console.error('Failed to fetch platforms:', err);
    }
  }, [setWeatherPlatforms]);

  const selectPlatform = useCallback(async (platformId) => {
    try {
      const res = await fetch('/api/weather/platform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform_id: platformId }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setWeatherPlatform(platformId);
        // Re-fetch route weather with new platform
        if (plannedWaypoints.length >= 2) {
          fetchRouteWeather();
        }
      }
    } catch (err) {
      console.error('Failed to set platform:', err);
    }
  }, [plannedWaypoints, setWeatherPlatform]);

  const fetchRouteWeather = useCallback(async () => {
    if (plannedWaypoints.length < 2) return;

    console.log('[Weather] Fetching weather for', plannedWaypoints.length, 'waypoints');
    setWeatherLoading(true);
    try {
      const res = await fetch('/api/weather/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waypoints: plannedWaypoints
            .filter((w) => w.type !== 'roi')
            .map((w) => ({ lat: w.lat, lon: w.lon })),
          mission_start_time: weather.forecastTime,
        }),
      });
      const data = await res.json();
      console.log('[Weather] API response:', data);
      if (data.status === 'ok') {
        setWeatherRouteAnalysis(data.route_analysis);
        console.log('[Weather] Analysis loaded successfully');
      } else {
        console.error('[Weather] API returned error:', data.error || 'Unknown error');
      }
    } catch (err) {
      console.error('[Weather] Failed to fetch route weather:', err);
      console.error('[Weather] Make sure backend is running at http://localhost:8000');
    } finally {
      setWeatherLoading(false);
    }
  }, [plannedWaypoints, weather.forecastTime, setWeatherLoading, setWeatherRouteAnalysis]);

  return {
    fetchRouteWeather,
    selectPlatform,
    fetchPlatforms,
  };
}
