// Pattern generation algorithms
import { destinationPoint, bearing, haversineDistance, getBounds, centroid } from './geo';

/**
 * Generate lawnmower/survey pattern that fills a polygon
 * @param {Array<{lat, lon}>} polygon - Polygon vertices
 * @param {number} spacing - Lane spacing in meters
 * @param {number} angle - Pattern angle in degrees (0=N-S, 90=E-W)
 * @param {number} altitude - Flight altitude
 * @param {number} overshoot - Add overshoot at turns (default 0 for polygon)
 * @returns {Array<{lat, lon, alt, type}>}
 */
export function lawnmowerPattern(polygon, spacing, angle, altitude, overshoot = 0) {
  // Handle both polygon array and bounds object
  let vertices;
  if (Array.isArray(polygon)) {
    vertices = polygon;
  } else if (polygon.north !== undefined) {
    // Convert bounds to polygon
    vertices = [
      { lat: polygon.north, lon: polygon.west },
      { lat: polygon.north, lon: polygon.east },
      { lat: polygon.south, lon: polygon.east },
      { lat: polygon.south, lon: polygon.west },
    ];
  } else {
    return [];
  }

  if (vertices.length < 3) return [];

  const waypoints = [];
  const bounds = getBounds(vertices);
  const center = centroid(vertices);

  // Calculate dimensions
  const height = haversineDistance(bounds.south, center.lon, bounds.north, center.lon);
  const width = haversineDistance(center.lat, bounds.west, center.lat, bounds.east);

  // Effective coverage area (diagonal for angled patterns)
  const diagonal = Math.sqrt(width * width + height * height);
  const coverDist = diagonal + 50; // Extra margin

  // Number of lanes
  const numLanes = Math.ceil(coverDist / spacing) + 2;
  const startOffset = -(numLanes - 1) * spacing / 2;

  // Normalized angle (0-180)
  const normAngle = angle % 180;

  for (let i = 0; i < numLanes; i++) {
    const laneOffset = startOffset + i * spacing;
    const perpAngle = (normAngle + 90) % 360;

    // Lane center point
    const laneCenter = destinationPoint(center.lat, center.lon, perpAngle, laneOffset);

    // Create a long line through the lane center
    const halfLen = coverDist;
    const lineStart = destinationPoint(laneCenter.lat, laneCenter.lon, normAngle + 180, halfLen);
    const lineEnd = destinationPoint(laneCenter.lat, laneCenter.lon, normAngle, halfLen);

    // Find intersections with polygon
    const intersections = linePolygonIntersections(lineStart, lineEnd, vertices);

    if (intersections.length >= 2) {
      // Sort intersections along the line direction
      intersections.sort((a, b) => {
        const distA = haversineDistance(lineStart.lat, lineStart.lon, a.lat, a.lon);
        const distB = haversineDistance(lineStart.lat, lineStart.lon, b.lat, b.lon);
        return distA - distB;
      });

      // Take pairs of intersections (entry/exit points)
      for (let j = 0; j < intersections.length - 1; j += 2) {
        let p1 = intersections[j];
        let p2 = intersections[j + 1];

        // Add overshoot if specified
        if (overshoot > 0) {
          p1 = destinationPoint(p1.lat, p1.lon, normAngle + 180, overshoot);
          p2 = destinationPoint(p2.lat, p2.lon, normAngle, overshoot);
        }

        // Alternate direction for serpentine pattern
        if (i % 2 === 0) {
          waypoints.push({ lat: p1.lat, lon: p1.lon, alt: altitude, type: 'waypoint' });
          waypoints.push({ lat: p2.lat, lon: p2.lon, alt: altitude, type: 'waypoint' });
        } else {
          waypoints.push({ lat: p2.lat, lon: p2.lon, alt: altitude, type: 'waypoint' });
          waypoints.push({ lat: p1.lat, lon: p1.lon, alt: altitude, type: 'waypoint' });
        }
      }
    }
  }

  return waypoints;
}

/**
 * Find intersections between a line segment and a polygon
 */
function linePolygonIntersections(lineStart, lineEnd, polygon) {
  const intersections = [];

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];

    const intersection = lineSegmentIntersection(
      lineStart.lat, lineStart.lon,
      lineEnd.lat, lineEnd.lon,
      p1.lat, p1.lon,
      p2.lat, p2.lon
    );

    if (intersection) {
      intersections.push(intersection);
    }
  }

  return intersections;
}

/**
 * Find intersection point of two line segments
 */
function lineSegmentIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null; // Parallel

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      lat: x1 + t * (x2 - x1),
      lon: y1 + t * (y2 - y1),
    };
  }
  return null;
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
