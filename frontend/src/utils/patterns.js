// Pattern generation algorithms
import { destinationPoint, bearing, haversineDistance, getBounds } from './geo';

/**
 * Generate lawnmower/survey pattern
 * @param {object} bounds - {north, south, east, west} in degrees
 * @param {number} spacing - Lane spacing in meters
 * @param {number} angle - Pattern angle in degrees (0=N-S, 90=E-W)
 * @param {number} altitude - Flight altitude
 * @param {number} overshoot - Add overshoot at turns (default 10m)
 * @returns {Array<{lat, lon, alt, type}>}
 */
export function lawnmowerPattern(bounds, spacing, angle, altitude, overshoot = 10) {
  const waypoints = [];

  // Calculate center of bounds
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLon = (bounds.east + bounds.west) / 2;

  // Calculate dimensions
  const height = haversineDistance(bounds.south, centerLon, bounds.north, centerLon);
  const width = haversineDistance(centerLat, bounds.west, centerLat, bounds.east);

  // Effective coverage area (diagonal for angled patterns)
  const diagonal = Math.sqrt(width * width + height * height);
  const coverDist = diagonal + overshoot * 2;

  // Number of lanes
  const numLanes = Math.ceil(coverDist / spacing);
  const startOffset = -(numLanes - 1) * spacing / 2;

  // Normalized angle (0-180, since 180-360 is same pattern reversed)
  const normAngle = angle % 180;

  for (let i = 0; i < numLanes; i++) {
    // Offset from center for this lane (perpendicular to flight direction)
    const laneOffset = startOffset + i * spacing;

    // Calculate lane start and end points
    // Flight direction is along the angle, offset is perpendicular
    const perpAngle = (normAngle + 90) % 360;

    // Lane center point
    const laneCenter = destinationPoint(centerLat, centerLon, perpAngle, laneOffset);

    // Start and end of lane (along the flight direction)
    const halfLen = coverDist / 2 + overshoot;
    const startPoint = destinationPoint(laneCenter.lat, laneCenter.lon, normAngle + 180, halfLen);
    const endPoint = destinationPoint(laneCenter.lat, laneCenter.lon, normAngle, halfLen);

    // Clip to bounds with some margin
    const clippedStart = clipToBounds(startPoint, bounds, overshoot);
    const clippedEnd = clipToBounds(endPoint, bounds, overshoot);

    if (clippedStart && clippedEnd) {
      // Alternate direction for serpentine pattern
      if (i % 2 === 0) {
        waypoints.push({ ...clippedStart, alt: altitude, type: 'waypoint' });
        waypoints.push({ ...clippedEnd, alt: altitude, type: 'waypoint' });
      } else {
        waypoints.push({ ...clippedEnd, alt: altitude, type: 'waypoint' });
        waypoints.push({ ...clippedStart, alt: altitude, type: 'waypoint' });
      }
    }
  }

  return waypoints;
}

/**
 * Helper to clip a point to bounds with margin
 */
function clipToBounds(point, bounds, margin) {
  // Simple approach: just ensure point is within expanded bounds
  const expandedBounds = {
    north: bounds.north + margin / 111000,
    south: bounds.south - margin / 111000,
    east: bounds.east + margin / (111000 * Math.cos(point.lat * Math.PI / 180)),
    west: bounds.west - margin / (111000 * Math.cos(point.lat * Math.PI / 180)),
  };

  return {
    lat: Math.max(expandedBounds.south, Math.min(expandedBounds.north, point.lat)),
    lon: Math.max(expandedBounds.west, Math.min(expandedBounds.east, point.lon)),
  };
}

/**
 * Generate spiral pattern (inward or outward)
 * @param {object} center - {lat, lon}
 * @param {number} startRadius - Starting radius in meters
 * @param {number} endRadius - Ending radius in meters
 * @param {number} spacing - Radial spacing between loops
 * @param {number} pointsPerLoop - Points per 360° loop
 * @param {number} altitude
 * @returns {Array<{lat, lon, alt, type}>}
 */
export function spiralPattern(center, startRadius, endRadius, spacing, pointsPerLoop, altitude) {
  const waypoints = [];

  const inward = startRadius > endRadius;
  const minR = Math.min(startRadius, endRadius);
  const maxR = Math.max(startRadius, endRadius);
  const totalLoops = (maxR - minR) / spacing;
  const totalPoints = Math.ceil(totalLoops * pointsPerLoop);

  for (let i = 0; i <= totalPoints; i++) {
    const progress = i / totalPoints;
    const currentRadius = inward
      ? startRadius - progress * (startRadius - endRadius)
      : startRadius + progress * (endRadius - startRadius);

    // Angle increases linearly
    const angleDeg = (i / pointsPerLoop) * 360;

    const point = destinationPoint(center.lat, center.lon, angleDeg % 360, currentRadius);
    waypoints.push({
      lat: point.lat,
      lon: point.lon,
      alt: altitude,
      type: 'waypoint',
    });
  }

  return waypoints;
}

/**
 * Generate orbit/circle pattern
 * @param {object} center - {lat, lon}
 * @param {number} radius - Orbit radius in meters
 * @param {number} points - Number of waypoints around circle
 * @param {number} altitude
 * @param {boolean} clockwise - Direction of orbit
 * @returns {Array<{lat, lon, alt, type}>}
 */
export function orbitPattern(center, radius, points, altitude, clockwise = true) {
  const waypoints = [];
  const angleStep = 360 / points;

  for (let i = 0; i < points; i++) {
    const angleDeg = clockwise ? i * angleStep : 360 - i * angleStep;
    const point = destinationPoint(center.lat, center.lon, angleDeg, radius);
    waypoints.push({
      lat: point.lat,
      lon: point.lon,
      alt: altitude,
      type: 'waypoint',
    });
  }

  // Close the loop by returning to start
  if (points > 0) {
    const firstPoint = waypoints[0];
    waypoints.push({
      lat: firstPoint.lat,
      lon: firstPoint.lon,
      alt: altitude,
      type: 'waypoint',
    });
  }

  return waypoints;
}

/**
 * Generate perimeter pattern (follow polygon boundary)
 * @param {Array<{lat, lon}>} vertices - Polygon vertices
 * @param {number} altitude
 * @param {number} inset - Optional inset from boundary (meters)
 * @returns {Array<{lat, lon, alt, type}>}
 */
export function perimeterPattern(vertices, altitude, inset = 0) {
  if (!vertices || vertices.length < 3) return [];

  let points = [...vertices];

  // If inset is specified, offset the polygon inward
  if (inset > 0) {
    points = insetPolygon(vertices, inset);
  }

  const waypoints = points.map(v => ({
    lat: v.lat,
    lon: v.lon,
    alt: altitude,
    type: 'waypoint',
  }));

  // Close the loop
  if (waypoints.length > 0) {
    waypoints.push({
      lat: waypoints[0].lat,
      lon: waypoints[0].lon,
      alt: altitude,
      type: 'waypoint',
    });
  }

  return waypoints;
}

/**
 * Simple polygon inset (shrink polygon by distance)
 * Note: This is a simplified implementation - complex polygons may have issues
 */
function insetPolygon(vertices, distance) {
  if (vertices.length < 3) return vertices;

  const n = vertices.length;
  const result = [];

  for (let i = 0; i < n; i++) {
    const prev = vertices[(i - 1 + n) % n];
    const curr = vertices[i];
    const next = vertices[(i + 1) % n];

    // Get bearings to adjacent vertices
    const bearingToPrev = bearing(curr.lat, curr.lon, prev.lat, prev.lon);
    const bearingToNext = bearing(curr.lat, curr.lon, next.lat, next.lon);

    // Inward direction is perpendicular to the bisector
    // Average the two bearings (handling wrap-around)
    let bisector = (bearingToPrev + bearingToNext) / 2;

    // Determine which side is "inside" based on polygon winding
    // Assuming clockwise winding, inside is to the right of edges
    const diff = ((bearingToNext - bearingToPrev + 360) % 360);
    if (diff > 180) {
      bisector = (bisector + 180) % 360;
    }

    // Perpendicular to bisector (90° rotation)
    const inwardBearing = (bisector + 90) % 360;

    // Move vertex inward
    const newPoint = destinationPoint(curr.lat, curr.lon, inwardBearing, distance);
    result.push(newPoint);
  }

  return result;
}

/**
 * Create bounds from a rectangular selection on map
 * @param {object} corner1 - {lat, lon} first corner
 * @param {object} corner2 - {lat, lon} opposite corner
 * @returns {{north, south, east, west}}
 */
export function boundsFromCorners(corner1, corner2) {
  return {
    north: Math.max(corner1.lat, corner2.lat),
    south: Math.min(corner1.lat, corner2.lat),
    east: Math.max(corner1.lon, corner2.lon),
    west: Math.min(corner1.lon, corner2.lon),
  };
}

/**
 * Create bounds from current map view
 * @param {object} mapBounds - Leaflet bounds object with getNorth/getSouth/etc
 * @returns {{north, south, east, west}}
 */
export function boundsFromMapView(mapBounds) {
  return {
    north: mapBounds.getNorth(),
    south: mapBounds.getSouth(),
    east: mapBounds.getEast(),
    west: mapBounds.getWest(),
  };
}
