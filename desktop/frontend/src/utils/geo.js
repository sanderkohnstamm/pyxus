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
 * Check if a point is inside a circle (haversine-based)
 * @param {number} lat - Point latitude
 * @param {number} lon - Point longitude
 * @param {number} centerLat - Circle center latitude
 * @param {number} centerLon - Circle center longitude
 * @param {number} radiusMeters - Circle radius in meters
 * @returns {boolean}
 */
export function pointInCircle(lat, lon, centerLat, centerLon, radiusMeters) {
  return haversineDistance(lat, lon, centerLat, centerLon) <= radiusMeters;
}

/**
 * Check if a point is inside a polygon (ray casting algorithm)
 * @param {number} lat - Point latitude
 * @param {number} lon - Point longitude
 * @param {Array<{lat, lon}>} polygonVertices - Polygon vertices
 * @returns {boolean}
 */
export function pointInPolygon(lat, lon, polygonVertices) {
  if (!polygonVertices || polygonVertices.length < 3) return false;

  let inside = false;
  const n = polygonVertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = polygonVertices[i].lat;
    const xi = polygonVertices[i].lon;
    const yj = polygonVertices[j].lat;
    const xj = polygonVertices[j].lon;

    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Check if two line segments (p1-p2 and p3-p4) intersect
 * @returns {boolean}
 */
function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = direction(p3, p4, p1);
  const d2 = direction(p3, p4, p2);
  const d3 = direction(p1, p2, p3);
  const d4 = direction(p1, p2, p4);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;

  return false;
}

function direction(pi, pj, pk) {
  return (pk.lon - pi.lon) * (pj.lat - pi.lat) - (pk.lat - pi.lat) * (pj.lon - pi.lon);
}

function onSegment(pi, pj, pk) {
  return Math.min(pi.lon, pj.lon) <= pk.lon && pk.lon <= Math.max(pi.lon, pj.lon) &&
         Math.min(pi.lat, pj.lat) <= pk.lat && pk.lat <= Math.max(pi.lat, pj.lat);
}

/**
 * Check if a polygon self-intersects (any non-adjacent edges cross)
 * @param {Array<{lat, lon}>} vertices - Polygon vertices
 * @returns {boolean}
 */
export function polygonSelfIntersects(vertices) {
  if (!vertices || vertices.length < 4) return false;

  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const nextI = (i + 1) % n;
    for (let j = i + 2; j < n; j++) {
      const nextJ = (j + 1) % n;
      // Skip adjacent edges (they share a vertex)
      if (nextJ === i) continue;
      if (segmentsIntersect(vertices[i], vertices[nextI], vertices[j], vertices[nextJ])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Validate mission waypoints against geofence (circle) and polygon fence
 * @param {Array} waypoints - Mission waypoints with lat, lon, type
 * @param {{lat, lon, radius, enabled}} geofence - Circular geofence
 * @param {Array<{lat, lon}>} fenceVertices - Polygon fence vertices
 * @returns {{valid: boolean, violations: Array<{waypointIndex: number, type: string}>}}
 */
export function validateMissionAgainstFence(waypoints, geofence, fenceVertices) {
  const violations = [];
  const NAV_TYPES = new Set(['waypoint', 'takeoff', 'loiter_unlim', 'loiter_turns', 'loiter_time', 'roi', 'land']);

  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    // Only check waypoints that have a map position
    if (!NAV_TYPES.has(wp.type)) continue;
    if (wp.lat === 0 && wp.lon === 0) continue;

    // Check circular geofence
    if (geofence && geofence.enabled && geofence.lat !== 0 && geofence.lon !== 0) {
      if (!pointInCircle(wp.lat, wp.lon, geofence.lat, geofence.lon, geofence.radius)) {
        violations.push({ waypointIndex: i, type: 'outside_circle' });
        continue; // Only report one violation per waypoint
      }
    }

    // Check polygon fence
    if (fenceVertices && fenceVertices.length >= 3) {
      if (!pointInPolygon(wp.lat, wp.lon, fenceVertices)) {
        violations.push({ waypointIndex: i, type: 'outside_polygon' });
      }
    }
  }

  return { valid: violations.length === 0, violations };
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
