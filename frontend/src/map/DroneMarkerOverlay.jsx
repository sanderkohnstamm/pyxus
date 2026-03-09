import React, { useState } from 'react';
import { Marker, Popup } from '@vis.gl/react-maplibre';
import useDroneStore from '../store/droneStore';
import { INITIAL_TELEMETRY } from '../store/droneStore';
import { DRONE_COLORS, DRONE_STROKES, hexToRgba } from './constants';
import { formatCoord } from '../utils/formatCoord';

// Home position SVG
const homeSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`;

// GCS location SVG
const gcsSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;

export default function DroneMarkerOverlay({ droneColorMap }) {
  const drones = useDroneStore((s) => s.drones);
  const activeDroneId = useDroneStore((s) => s.activeDroneId);
  const setActiveDrone = useDroneStore((s) => s.setActiveDrone);
  const homePosition = useDroneStore((s) => s.homePosition);
  const gcsPosition = useDroneStore((s) => s.gcsPosition);
  const coordFormat = useDroneStore((s) => s.coordFormat);
  const [popupDroneId, setPopupDroneId] = useState(null);

  const hasHome = homePosition && homePosition.lat !== 0 && homePosition.lon !== 0;
  const hasGcs = gcsPosition && gcsPosition.lat !== 0 && gcsPosition.lon !== 0;

  return (
    <>
      {/* Drone name labels + click targets */}
      {Object.entries(drones).map(([droneId, drone]) => {
        const t = drone.telemetry || INITIAL_TELEMETRY;
        if (t.lat === 0 && t.lon === 0) return null;

        const isActive = droneId === activeDroneId;
        const cIdx = droneColorMap[droneId] ?? 0;
        const isLinkLost = drone.linkLost;
        const fillColor = isLinkLost ? '#ef4444' : DRONE_COLORS[cIdx];
        const strokeColor = isLinkLost ? '#f87171' : DRONE_STROKES[cIdx];
        const heading = t.heading || (t.yaw * 180) / Math.PI;

        return (
          <React.Fragment key={droneId}>
            {/* Name label */}
            <Marker
              longitude={t.lon}
              latitude={t.lat}
              anchor="bottom-left"
              offset={[12, -10]}
              style={{ pointerEvents: 'none' }}
            >
              <div
                style={{
                  whiteSpace: 'nowrap',
                  background: hexToRgba(fillColor, 0.85),
                  color: 'white',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  fontSize: '9px',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                {drone.name}
              </div>
            </Marker>

            {/* Drone arrow icon */}
            <Marker
              longitude={t.lon}
              latitude={t.lat}
              anchor="center"
              rotation={heading}
              rotationAlignment="map"
              onClick={() => {
                if (!isActive) setActiveDrone(droneId);
                setPopupDroneId(droneId);
              }}
            >
              <div style={{ cursor: 'pointer' }}>
                <svg viewBox="-14 -14 28 28" width="32" height="32" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                  <polygon
                    points="0,-13 12,10 0,3 -12,10"
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth="1.5"
                    opacity="0.9"
                  />
                </svg>
              </div>
            </Marker>

            {/* Popup (separate from Marker) */}
            {popupDroneId === droneId && (
              <Popup
                longitude={t.lon}
                latitude={t.lat}
                anchor="bottom"
                closeButton={true}
                closeOnClick={true}
                onClose={() => setPopupDroneId(null)}
                maxWidth="200px"
              >
                <div className="text-xs font-mono space-y-0.5 p-1">
                  <div className="font-semibold text-[11px] mb-1" style={{ color: fillColor }}>{drone.name}</div>
                  {isLinkLost && (
                    <div style={{ color: '#f87171', fontWeight: 700, fontSize: '10px', marginBottom: '4px' }}>
                      LAST KNOWN POSITION
                      {drone.linkLostSince && <span style={{ fontWeight: 400, color: '#fca5a5' }}> ({Math.round((Date.now() - drone.linkLostSince) / 1000)}s ago)</span>}
                    </div>
                  )}
                  <div><span style={{ color: '#94a3b8' }}>ALT</span> <span style={{ color: '#e2e8f0' }}>{t.alt.toFixed(1)}m</span></div>
                  <div><span style={{ color: '#94a3b8' }}>GS</span> <span style={{ color: '#e2e8f0' }}>{t.groundspeed.toFixed(1)} m/s</span></div>
                  <div><span style={{ color: '#94a3b8' }}>HDG</span> <span style={{ color: '#e2e8f0' }}>{Math.round(heading)}&deg;</span></div>
                  <div style={{ borderTop: '1px solid rgba(100,116,139,0.3)', marginTop: '4px', paddingTop: '4px', fontSize: '9px', color: '#64748b' }}>
                    {formatCoord(t.lat, t.lon, coordFormat, 6)}
                  </div>
                </div>
              </Popup>
            )}
          </React.Fragment>
        );
      })}

      {/* Home position marker */}
      {hasHome && (
        <Marker
          longitude={homePosition.lon}
          latitude={homePosition.lat}
          anchor="center"
        >
          <div style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#10b981', border: '2px solid #34d399', borderRadius: '50%',
            boxShadow: '0 2px 8px rgba(16,185,129,0.4)',
          }} dangerouslySetInnerHTML={{ __html: homeSVG }} />
        </Marker>
      )}

      {/* GCS location marker */}
      {hasGcs && (
        <Marker
          longitude={gcsPosition.lon}
          latitude={gcsPosition.lat}
          anchor="center"
        >
          <div style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#6366f1', border: '2px solid #818cf8', borderRadius: '50%',
            boxShadow: '0 2px 8px rgba(99,102,241,0.4)',
          }} dangerouslySetInnerHTML={{ __html: gcsSVG }} />
        </Marker>
      )}
    </>
  );
}
