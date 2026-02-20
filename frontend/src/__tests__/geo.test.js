import { describe, it, expect } from 'vitest';
import {
  haversineDistance,
  bearing,
  destinationPoint,
  midpoint,
  centroid,
  rotatePoint,
  translatePoint,
  scalePoint,
  pointInCircle,
  pointInPolygon,
  polygonSelfIntersects,
  validateMissionAgainstFence,
  getBounds,
  transformMission,
} from '../utils/geo.js';

// ---------------------------------------------------------------------------
// haversineDistance
// ---------------------------------------------------------------------------
describe('haversineDistance', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistance(52.0, 4.0, 52.0, 4.0)).toBeCloseTo(0, 1);
  });

  it('computes London–Paris distance within 1% of known value', () => {
    // London (51.5074, -0.1278) -> Paris (48.8566, 2.3522) ≈ 343.5 km
    const d = haversineDistance(51.5074, -0.1278, 48.8566, 2.3522);
    expect(d).toBeGreaterThan(340_000);
    expect(d).toBeLessThan(347_000);
  });

  it('computes short distance (≈111 km for 1° latitude)', () => {
    // 1 degree of latitude ≈ 111.32 km
    const d = haversineDistance(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('handles antipodal points (~half circumference)', () => {
    // North pole to south pole ≈ 20,015 km
    const d = haversineDistance(90, 0, -90, 0);
    expect(d).toBeGreaterThan(20_000_000);
    expect(d).toBeLessThan(20_100_000);
  });

  it('is symmetric', () => {
    const d1 = haversineDistance(52.0, 4.0, 48.0, 2.0);
    const d2 = haversineDistance(48.0, 2.0, 52.0, 4.0);
    expect(d1).toBeCloseTo(d2, 6);
  });
});

// ---------------------------------------------------------------------------
// bearing
// ---------------------------------------------------------------------------
describe('bearing', () => {
  it('returns ~0° (north) when going straight north', () => {
    const b = bearing(0, 0, 1, 0);
    expect(b).toBeCloseTo(0, 0);
  });

  it('returns ~90° (east) when going straight east on equator', () => {
    const b = bearing(0, 0, 0, 1);
    expect(b).toBeCloseTo(90, 0);
  });

  it('returns ~180° (south) when going straight south', () => {
    const b = bearing(1, 0, 0, 0);
    expect(b).toBeCloseTo(180, 0);
  });

  it('returns ~270° (west) when going straight west on equator', () => {
    const b = bearing(0, 0, 0, -1);
    expect(b).toBeCloseTo(270, 0);
  });

  it('returns NE bearing (~45°) for diagonal', () => {
    // This is approximate because of spherical geometry
    const b = bearing(0, 0, 1, 1);
    expect(b).toBeGreaterThan(40);
    expect(b).toBeLessThan(50);
  });

  it('always returns value in [0, 360)', () => {
    const cases = [
      [10, 20, -10, -20],
      [-50, 170, 50, -170],
      [0, 0, 0, 180],
    ];
    for (const [lat1, lon1, lat2, lon2] of cases) {
      const b = bearing(lat1, lon1, lat2, lon2);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(360);
    }
  });
});

// ---------------------------------------------------------------------------
// destinationPoint
// ---------------------------------------------------------------------------
describe('destinationPoint', () => {
  it('1 km north from equator/meridian', () => {
    const p = destinationPoint(0, 0, 0, 1000);
    expect(p.lat).toBeGreaterThan(0);
    expect(p.lat).toBeCloseTo(0.009, 2); // ~0.009 degrees
    expect(p.lon).toBeCloseTo(0, 4);
  });

  it('round-trip: go and come back', () => {
    const start = { lat: 52.3676, lon: 4.9041 }; // Amsterdam
    const dist = 5000; // 5 km
    const brng = 45; // NE
    const dest = destinationPoint(start.lat, start.lon, brng, dist);
    // Now compute bearing back and go the same distance
    const returnBrng = bearing(dest.lat, dest.lon, start.lat, start.lon);
    const returned = destinationPoint(dest.lat, dest.lon, returnBrng, dist);
    expect(returned.lat).toBeCloseTo(start.lat, 3);
    expect(returned.lon).toBeCloseTo(start.lon, 3);
  });

  it('0 distance returns same point', () => {
    const p = destinationPoint(45.0, 10.0, 123, 0);
    expect(p.lat).toBeCloseTo(45.0, 6);
    expect(p.lon).toBeCloseTo(10.0, 6);
  });
});

// ---------------------------------------------------------------------------
// midpoint
// ---------------------------------------------------------------------------
describe('midpoint', () => {
  it('midpoint of identical points is the same point', () => {
    const m = midpoint(52.0, 4.0, 52.0, 4.0);
    expect(m.lat).toBeCloseTo(52.0, 6);
    expect(m.lon).toBeCloseTo(4.0, 6);
  });

  it('midpoint is equidistant from both ends', () => {
    const m = midpoint(40.0, -74.0, 48.0, 2.0); // NYC area -> Paris area
    const d1 = haversineDistance(40.0, -74.0, m.lat, m.lon);
    const d2 = haversineDistance(48.0, 2.0, m.lat, m.lon);
    expect(d1).toBeCloseTo(d2, -2); // within 100m
  });

  it('midpoint on equator is correct', () => {
    const m = midpoint(0, 0, 0, 2);
    expect(m.lat).toBeCloseTo(0, 4);
    expect(m.lon).toBeCloseTo(1, 4);
  });
});

// ---------------------------------------------------------------------------
// centroid
// ---------------------------------------------------------------------------
describe('centroid', () => {
  it('returns (0,0) for empty array', () => {
    const c = centroid([]);
    expect(c.lat).toBe(0);
    expect(c.lon).toBe(0);
  });

  it('returns the point itself for single point', () => {
    const c = centroid([{ lat: 42.0, lon: 12.0 }]);
    expect(c.lat).toBe(42.0);
    expect(c.lon).toBe(12.0);
  });

  it('returns (0,0) for null input', () => {
    const c = centroid(null);
    expect(c.lat).toBe(0);
    expect(c.lon).toBe(0);
  });

  it('centroid of symmetric square is at center', () => {
    const points = [
      { lat: 1, lon: 1 },
      { lat: 1, lon: -1 },
      { lat: -1, lon: 1 },
      { lat: -1, lon: -1 },
    ];
    const c = centroid(points);
    expect(c.lat).toBeCloseTo(0, 2);
    expect(c.lon).toBeCloseTo(0, 2);
  });
});

// ---------------------------------------------------------------------------
// rotatePoint
// ---------------------------------------------------------------------------
describe('rotatePoint', () => {
  it('rotation by 0° returns same point', () => {
    const p = rotatePoint(52.0, 4.0, 52.0, 3.5, 0);
    expect(p.lat).toBeCloseTo(52.0, 3);
    expect(p.lon).toBeCloseTo(4.0, 3);
  });

  it('rotation by 360° returns same point', () => {
    const p = rotatePoint(52.0, 4.0, 52.0, 3.5, 360);
    expect(p.lat).toBeCloseTo(52.0, 3);
    expect(p.lon).toBeCloseTo(4.0, 3);
  });

  it('rotation preserves distance from center', () => {
    const center = { lat: 52.0, lon: 4.0 };
    const point = { lat: 52.01, lon: 4.01 };
    const dBefore = haversineDistance(center.lat, center.lon, point.lat, point.lon);
    const rotated = rotatePoint(point.lat, point.lon, center.lat, center.lon, 90);
    const dAfter = haversineDistance(center.lat, center.lon, rotated.lat, rotated.lon);
    expect(dAfter).toBeCloseTo(dBefore, -1); // within 10m
  });
});

// ---------------------------------------------------------------------------
// translatePoint
// ---------------------------------------------------------------------------
describe('translatePoint', () => {
  it('translates by given delta', () => {
    const p = translatePoint(10, 20, 0.5, -0.5);
    expect(p.lat).toBe(10.5);
    expect(p.lon).toBe(19.5);
  });

  it('zero delta returns same point', () => {
    const p = translatePoint(10, 20, 0, 0);
    expect(p.lat).toBe(10);
    expect(p.lon).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// scalePoint
// ---------------------------------------------------------------------------
describe('scalePoint', () => {
  it('scale by 1 returns same point', () => {
    const p = scalePoint(52.01, 4.01, 52.0, 4.0, 1);
    expect(p.lat).toBeCloseTo(52.01, 3);
    expect(p.lon).toBeCloseTo(4.01, 3);
  });

  it('scale by 2 doubles distance from center', () => {
    const center = { lat: 52.0, lon: 4.0 };
    const point = { lat: 52.01, lon: 4.0 };
    const dBefore = haversineDistance(center.lat, center.lon, point.lat, point.lon);
    const scaled = scalePoint(point.lat, point.lon, center.lat, center.lon, 2);
    const dAfter = haversineDistance(center.lat, center.lon, scaled.lat, scaled.lon);
    expect(dAfter).toBeCloseTo(dBefore * 2, -1);
  });
});

// ---------------------------------------------------------------------------
// pointInCircle
// ---------------------------------------------------------------------------
describe('pointInCircle', () => {
  it('center is inside circle', () => {
    expect(pointInCircle(0, 0, 0, 0, 1000)).toBe(true);
  });

  it('point just inside radius', () => {
    // 100m north of center, radius 200m
    const p = destinationPoint(0, 0, 0, 100);
    expect(pointInCircle(p.lat, p.lon, 0, 0, 200)).toBe(true);
  });

  it('point outside radius', () => {
    // 300m north of center, radius 200m
    const p = destinationPoint(0, 0, 0, 300);
    expect(pointInCircle(p.lat, p.lon, 0, 0, 200)).toBe(false);
  });

  it('point exactly on boundary is inside', () => {
    // Exactly 200m north of center, radius 200m (<=)
    const p = destinationPoint(0, 0, 0, 200);
    expect(pointInCircle(p.lat, p.lon, 0, 0, 200)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// pointInPolygon
// ---------------------------------------------------------------------------
describe('pointInPolygon', () => {
  const square = [
    { lat: 1, lon: 1 },
    { lat: 1, lon: -1 },
    { lat: -1, lon: -1 },
    { lat: -1, lon: 1 },
  ];

  it('center of square is inside', () => {
    expect(pointInPolygon(0, 0, square)).toBe(true);
  });

  it('point outside square is outside', () => {
    expect(pointInPolygon(2, 2, square)).toBe(false);
  });

  it('returns false for fewer than 3 vertices', () => {
    expect(pointInPolygon(0, 0, [{ lat: 0, lon: 0 }, { lat: 1, lon: 1 }])).toBe(false);
  });

  it('returns false for null vertices', () => {
    expect(pointInPolygon(0, 0, null)).toBe(false);
  });

  it('point inside triangle', () => {
    const triangle = [
      { lat: 0, lon: 0 },
      { lat: 2, lon: 0 },
      { lat: 1, lon: 2 },
    ];
    expect(pointInPolygon(1, 0.5, triangle)).toBe(true);
  });

  it('point outside triangle', () => {
    const triangle = [
      { lat: 0, lon: 0 },
      { lat: 2, lon: 0 },
      { lat: 1, lon: 2 },
    ];
    expect(pointInPolygon(0, 2, triangle)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// polygonSelfIntersects
// ---------------------------------------------------------------------------
describe('polygonSelfIntersects', () => {
  it('convex square does not self-intersect', () => {
    const square = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 },
      { lat: 1, lon: 1 },
      { lat: 1, lon: 0 },
    ];
    expect(polygonSelfIntersects(square)).toBe(false);
  });

  it('bowtie (figure-eight) polygon self-intersects', () => {
    const bowtie = [
      { lat: 0, lon: 0 },
      { lat: 1, lon: 1 },
      { lat: 0, lon: 1 },
      { lat: 1, lon: 0 },
    ];
    expect(polygonSelfIntersects(bowtie)).toBe(true);
  });

  it('returns false for fewer than 4 vertices', () => {
    const tri = [
      { lat: 0, lon: 0 },
      { lat: 1, lon: 0 },
      { lat: 0, lon: 1 },
    ];
    expect(polygonSelfIntersects(tri)).toBe(false);
  });

  it('returns false for null input', () => {
    expect(polygonSelfIntersects(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateMissionAgainstFence
// ---------------------------------------------------------------------------
describe('validateMissionAgainstFence', () => {
  const geofence = { lat: 0, lon: 0, radius: 1000, enabled: true };
  const polygon = [
    { lat: 0.01, lon: 0.01 },
    { lat: 0.01, lon: -0.01 },
    { lat: -0.01, lon: -0.01 },
    { lat: -0.01, lon: 0.01 },
  ];

  it('waypoints inside circle are valid', () => {
    const wps = [{ lat: 0.001, lon: 0.001, type: 'waypoint' }];
    const result = validateMissionAgainstFence(wps, geofence, null);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('waypoint outside circle produces violation', () => {
    const wps = [{ lat: 1, lon: 1, type: 'waypoint' }];
    const result = validateMissionAgainstFence(wps, geofence, null);
    expect(result.valid).toBe(false);
    expect(result.violations[0].type).toBe('outside_circle');
  });

  it('waypoint outside polygon produces violation', () => {
    const wps = [{ lat: 1, lon: 1, type: 'waypoint' }];
    const result = validateMissionAgainstFence(wps, null, polygon);
    expect(result.valid).toBe(false);
    expect(result.violations[0].type).toBe('outside_polygon');
  });

  it('non-nav types are ignored', () => {
    const wps = [{ lat: 1, lon: 1, type: 'do_change_speed' }];
    const result = validateMissionAgainstFence(wps, geofence, polygon);
    expect(result.valid).toBe(true);
  });

  it('waypoints at (0,0) are skipped', () => {
    const wps = [{ lat: 0, lon: 0, type: 'waypoint' }];
    const result = validateMissionAgainstFence(wps, geofence, polygon);
    expect(result.valid).toBe(true);
  });

  it('disabled geofence is not checked', () => {
    const disabled = { lat: 0, lon: 0, radius: 100, enabled: false };
    const wps = [{ lat: 5, lon: 5, type: 'waypoint' }];
    const result = validateMissionAgainstFence(wps, disabled, null);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getBounds
// ---------------------------------------------------------------------------
describe('getBounds', () => {
  it('returns zeros for empty array', () => {
    const b = getBounds([]);
    expect(b.north).toBe(0);
    expect(b.south).toBe(0);
    expect(b.east).toBe(0);
    expect(b.west).toBe(0);
  });

  it('returns zeros for null', () => {
    const b = getBounds(null);
    expect(b.north).toBe(0);
  });

  it('single point returns that point as bounds', () => {
    const b = getBounds([{ lat: 10, lon: 20 }]);
    expect(b.north).toBe(10);
    expect(b.south).toBe(10);
    expect(b.east).toBe(20);
    expect(b.west).toBe(20);
  });

  it('computes correct bounding box', () => {
    const points = [
      { lat: 10, lon: 20 },
      { lat: -5, lon: 30 },
      { lat: 15, lon: -10 },
    ];
    const b = getBounds(points);
    expect(b.north).toBe(15);
    expect(b.south).toBe(-5);
    expect(b.east).toBe(30);
    expect(b.west).toBe(-10);
  });
});

// ---------------------------------------------------------------------------
// transformMission
// ---------------------------------------------------------------------------
describe('transformMission', () => {
  const wps = [
    { lat: 10, lon: 20, alt: 50 },
    { lat: 11, lon: 21, alt: 50 },
  ];

  it('translate shifts all waypoints', () => {
    const result = transformMission(wps, 'translate', { deltaLat: 1, deltaLon: -1 });
    expect(result[0].lat).toBe(11);
    expect(result[0].lon).toBe(19);
    expect(result[1].lat).toBe(12);
    expect(result[1].lon).toBe(20);
  });

  it('reverse reverses the order', () => {
    const result = transformMission(wps, 'reverse', {});
    expect(result[0].lat).toBe(11);
    expect(result[1].lat).toBe(10);
  });

  it('unknown transform returns original', () => {
    const result = transformMission(wps, 'unknown', {});
    expect(result).toEqual(wps);
  });

  it('empty waypoints returns same array', () => {
    expect(transformMission([], 'translate', { deltaLat: 1, deltaLon: 1 })).toEqual([]);
  });

  it('null waypoints returns null', () => {
    expect(transformMission(null, 'translate', {})).toBeNull();
  });

  it('rotate preserves waypoint count and extra properties', () => {
    const withProps = [
      { lat: 10, lon: 20, alt: 50, name: 'A' },
      { lat: 11, lon: 21, alt: 60, name: 'B' },
    ];
    const result = transformMission(withProps, 'rotate', { angle: 90 });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('A');
    expect(result[1].name).toBe('B');
    expect(result[0].alt).toBe(50);
  });

  it('scale by 1 returns approximately same positions', () => {
    const result = transformMission(wps, 'scale', { factor: 1 });
    expect(result[0].lat).toBeCloseTo(10, 2);
    expect(result[0].lon).toBeCloseTo(20, 2);
  });
});
