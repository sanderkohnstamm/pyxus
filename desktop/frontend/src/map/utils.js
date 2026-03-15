// Coordinate order convention:
// Store uses {lat, lon} (latitude first)
// MapLibre/GeoJSON uses [lon, lat] (longitude first)
// Always convert at the render boundary using these helpers.

/**
 * Convert store {lat, lon} to MapLibre [lon, lat]
 */
export function toLngLat(pos) {
  return [pos.lon, pos.lat];
}

/**
 * Convert MapLibre LngLat to store {lat, lon}
 */
export function fromLngLat(lngLat) {
  if (Array.isArray(lngLat)) return { lat: lngLat[1], lon: lngLat[0] };
  return { lat: lngLat.lat, lon: lngLat.lng };
}

/**
 * Convert trail array [[lat,lon],...] to GeoJSON [[lon,lat],...]
 */
export function trailToCoords(trail) {
  return trail.map(([lat, lon]) => [lon, lat]);
}

/**
 * Generate a polygon approximation of a circle for GeoJSON
 * @param {number} lon - Center longitude
 * @param {number} lat - Center latitude
 * @param {number} radiusMeters - Radius in meters
 * @param {number} points - Number of vertices (default 64)
 * @returns {Array} Array of [lon, lat] coordinate pairs forming a closed ring
 */
export function circleToPolygon(lon, lat, radiusMeters, points = 64) {
  const coords = [];
  const earthRadius = 6371000;
  const latRad = (lat * Math.PI) / 180;

  for (let i = 0; i <= points; i++) {
    const angle = (i * 2 * Math.PI) / points;
    const dLat = (radiusMeters / earthRadius) * Math.cos(angle);
    const dLon = (radiusMeters / (earthRadius * Math.cos(latRad))) * Math.sin(angle);
    coords.push([
      lon + (dLon * 180) / Math.PI,
      lat + (dLat * 180) / Math.PI,
    ]);
  }
  return coords;
}

/**
 * Create an empty GeoJSON FeatureCollection
 */
export function emptyFC() {
  return { type: 'FeatureCollection', features: [] };
}

/**
 * Create a GeoJSON Feature with geometry and optional properties
 */
export function feature(geometry, properties = {}) {
  return { type: 'Feature', geometry, properties };
}

/**
 * Create a GeoJSON LineString geometry from coordinate pairs
 */
export function lineString(coords) {
  return { type: 'LineString', coordinates: coords };
}

/**
 * Create a GeoJSON Polygon geometry from a single ring of coordinates
 */
export function polygon(ring) {
  return { type: 'Polygon', coordinates: [ring] };
}

/**
 * Create a GeoJSON Point geometry
 */
export function point(coord) {
  return { type: 'Point', coordinates: coord };
}
