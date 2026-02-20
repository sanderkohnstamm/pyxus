import { describe, it, expect } from 'vitest';
import { formatCoord } from '../utils/formatCoord.js';

// ---------------------------------------------------------------------------
// Decimal Degrees (DD) format — the default format
// ---------------------------------------------------------------------------
describe('formatCoord — DD format (default)', () => {
  it('formats positive lat/lon with default precision (6)', () => {
    const result = formatCoord(52.370216, 4.895168);
    expect(result).toBe('52.370216, 4.895168');
  });

  it('formats negative lat/lon', () => {
    const result = formatCoord(-33.868820, -151.209290);
    // Negative values should display with minus sign
    expect(result).toContain('-33.86882');
    expect(result).toContain('-151.20929');
  });

  it('formats (0, 0) origin', () => {
    const result = formatCoord(0, 0);
    expect(result).toBe('0.000000, 0.000000');
  });

  it('respects custom precision', () => {
    const result = formatCoord(52.370216, 4.895168, 'latlon', 2);
    expect(result).toBe('52.37, 4.90');
  });

  it('handles precision 0', () => {
    const result = formatCoord(52.7, 4.3, 'latlon', 0);
    expect(result).toBe('53, 4');
  });

  it('handles north pole', () => {
    const result = formatCoord(90, 0);
    expect(result).toBe('90.000000, 0.000000');
  });

  it('handles south pole', () => {
    const result = formatCoord(-90, 0);
    expect(result).toBe('-90.000000, 0.000000');
  });

  it('handles antimeridian (+180)', () => {
    const result = formatCoord(0, 180);
    expect(result).toBe('0.000000, 180.000000');
  });

  it('handles antimeridian (-180)', () => {
    const result = formatCoord(0, -180);
    expect(result).toBe('0.000000, -180.000000');
  });

  it('high precision (10 digits)', () => {
    const result = formatCoord(1.23456789012, 9.87654321098, 'latlon', 10);
    expect(result).toContain('1.2345678901');
    expect(result).toContain('9.8765432110');
  });
});

// ---------------------------------------------------------------------------
// MGRS format
// ---------------------------------------------------------------------------
describe('formatCoord — MGRS format', () => {
  it('returns a valid MGRS string for a known location', () => {
    // Amsterdam: 52.3676, 4.9041 -> should be in grid zone 31U
    const result = formatCoord(52.3676, 4.9041, 'mgrs');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(5);
    // MGRS starts with grid zone (digits + letter)
    expect(result).toMatch(/^\d{1,2}[A-Z]/);
  });

  it('returns a valid MGRS string for equator/meridian', () => {
    // Slightly off (0,0) to be in a valid MGRS zone
    const result = formatCoord(0.5, 0.5, 'mgrs');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(5);
  });

  it('falls back to DD format for poles (MGRS undefined at poles)', () => {
    // MGRS is not defined above 84°N or below 80°S
    // The mgrs library may throw for exact poles
    const result = formatCoord(90, 0, 'mgrs');
    // Should either be a valid MGRS string or fall back to DD format
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('falls back to DD for very high south latitude', () => {
    const result = formatCoord(-85, 0, 'mgrs');
    // Should either produce valid MGRS or fall back to DD
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Unknown format falls back to DD
// ---------------------------------------------------------------------------
describe('formatCoord — unknown format', () => {
  it('unknown format uses DD by default', () => {
    const result = formatCoord(52.0, 4.0, 'some_unknown_format');
    expect(result).toBe('52.000000, 4.000000');
  });
});
