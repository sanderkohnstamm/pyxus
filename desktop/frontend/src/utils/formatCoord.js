import { forward as toMGRS } from 'mgrs';

export function formatCoord(lat, lon, format = 'latlon', precision = 6) {
  if (format === 'mgrs') {
    try {
      return toMGRS([lon, lat], 5); // 5 = 1m precision
    } catch {
      return `${lat.toFixed(precision)}, ${lon.toFixed(precision)}`;
    }
  }
  return `${lat.toFixed(precision)}, ${lon.toFixed(precision)}`;
}
