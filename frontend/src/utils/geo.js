// Geodetic utility functions
// All angles in degrees, distances in meters

const R = 6371000; // Earth radius in meters
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/**
 * Haversine distance between two points (meters)
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Bearing from point A to B (degrees, 0=North, clockwise)
 */
export function bearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * DEG2RAD;
  const y = Math.sin(dLon) * Math.cos(lat2 * DEG2RAD);
  const x = Math.cos(lat1 * DEG2RAD) * Math.sin(lat2 * DEG2RAD) -
            Math.sin(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * RAD2DEG;
  return (brng + 360) % 360;
}

/**
 * Destination point given start, bearing (degrees), distance (meters)
 */
export function destinationPoint(lat, lon, bearingDeg, distanceM) {
  const brng = bearingDeg * DEG2RAD;
  const latRad = lat * DEG2RAD;
  const lonRad = lon * DEG2RAD;
  const d = distanceM / R;

  const lat2 = Math.asin(
    Math.sin(latRad) * Math.cos(d) +
    Math.cos(latRad) * Math.sin(d) * Math.cos(brng)
  );
  const lon2 = lonRad + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(latRad),
    Math.cos(d) - Math.sin(latRad) * Math.sin(lat2)
  );

  return {
    lat: lat2 * RAD2DEG,
    lon: lon2 * RAD2DEG,
  };
}

/**
 * Midpoint between two coordinates
 */
export function midpoint(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * DEG2RAD;
  const lat1Rad = lat1 * DEG2RAD;
  const lat2Rad = lat2 * DEG2RAD;
  const lon1Rad = lon1 * DEG2RAD;

  const Bx = Math.cos(lat2Rad) * Math.cos(dLon);
  const By = Math.cos(lat2Rad) * Math.sin(dLon);

  const lat3 = Math.atan2(
    Math.sin(lat1Rad) + Math.sin(lat2Rad),
    Math.sqrt((Math.cos(lat1Rad) + Bx) * (Math.cos(lat1Rad) + Bx) + By * By)
  );
  const lon3 = lon1Rad + Math.atan2(By, Math.cos(lat1Rad) + Bx);

  return {
    lat: lat3 * RAD2DEG,
    lon: lon3 * RAD2DEG,
  };
}

/**
 * Center (centroid) of a set of coordinates
 * @param {Array<{lat, lon}>} points
 */
export function centroid(points) {
  if (!points || points.length === 0) return { lat: 0, lon: 0 };
  if (points.length === 1) return { lat: points[0].lat, lon: points[0].lon };

  let x = 0, y = 0, z = 0;
  for (const p of points) {
    const latRad = p.lat * DEG2RAD;
    const lonRad = p.lon * DEG2RAD;
    x += Math.cos(latRad) * Math.cos(lonRad);
    y += Math.cos(latRad) * Math.sin(lonRad);
    z += Math.sin(latRad);
  }
  const n = points.length;
  x /= n;
  y /= n;
  z /= n;

  const lon = Math.atan2(y, x);
  const hyp = Math.sqrt(x * x + y * y);
  const lat = Math.atan2(z, hyp);

  return {
    lat: lat * RAD2DEG,
    lon: lon * RAD2DEG,
  };
}

/**
 * Rotate point around center by angle (degrees, clockwise)
 */
export function rotatePoint(lat, lon, centerLat, centerLon, angleDeg) {
  // Distance and bearing from center to point
  const dist = haversineDistance(centerLat, centerLon, lat, lon);
  const brng = bearing(centerLat, centerLon, lat, lon);
  // Rotate bearing
  const newBrng = (brng + angleDeg + 360) % 360;
  // Get new point
  return destinationPoint(centerLat, centerLon, newBrng, dist);
}

/**
 * Translate point by delta lat/lon (simple offset, not geodetically accurate for large distances)
 */
export function translatePoint(lat, lon, deltaLat, deltaLon) {
  return {
    lat: lat + deltaLat,
    lon: lon + deltaLon,
  };
}

/**
 * Scale point from center by factor
 */
export function scalePoint(lat, lon, centerLat, centerLon, factor) {
  const dist = haversineDistance(centerLat, centerLon, lat, lon);
  const brng = bearing(centerLat, centerLon, lat, lon);
  const newDist = dist * factor;
  return destinationPoint(centerLat, centerLon, brng, newDist);
}

/**
 * Get bounding box of waypoints
 * @param {Array<{lat, lon}>} waypoints
 * @returns {{north, south, east, west}}
 */
export function getBounds(waypoints) {
  if (!waypoints || waypoints.length === 0) {
    return { north: 0, south: 0, east: 0, west: 0 };
  }
  let north = -90, south = 90, east = -180, west = 180;
  for (const wp of waypoints) {
    if (wp.lat > north) north = wp.lat;
    if (wp.lat < south) south = wp.lat;
    if (wp.lon > east) east = wp.lon;
    if (wp.lon < west) west = wp.lon;
  }
  return { north, south, east, west };
}

/**
 * Transform an entire mission
 * @param {Array} waypoints - Array of waypoints with lat/lon
 * @param {string} transform - 'translate' | 'rotate' | 'scale'
 * @param {object} params - Transform parameters
 * @returns {Array} - Transformed waypoints
 */
export function transformMission(waypoints, transform, params) {
  if (!waypoints || waypoints.length === 0) return waypoints;

  const center = centroid(waypoints.map(w => ({ lat: w.lat, lon: w.lon })));

  switch (transform) {
    case 'translate':
      return waypoints.map(w => ({
        ...w,
        lat: w.lat + params.deltaLat,
        lon: w.lon + params.deltaLon,
      }));
    case 'rotate':
      return waypoints.map(w => {
        const rotated = rotatePoint(w.lat, w.lon, center.lat, center.lon, params.angle);
        return { ...w, ...rotated };
      });
    case 'scale':
      return waypoints.map(w => {
        const scaled = scalePoint(w.lat, w.lon, center.lat, center.lon, params.factor);
        return { ...w, ...scaled };
      });
    case 'reverse':
      return [...waypoints].reverse();
    default:
      return waypoints;
  }
}
