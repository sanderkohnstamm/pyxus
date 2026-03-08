// MapLibre style definitions for dark and light modes with satellite imagery + 3D terrain

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY || '';

// ArcGIS satellite raster tiles
const satelliteSource = {
  type: 'raster',
  tiles: [
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ],
  tileSize: 256,
  attribution: 'Tiles &copy; Esri',
  maxzoom: 19,
};

// Terrain DEM sources (prioritized)
function terrainSource() {
  if (MAPTILER_KEY) {
    return {
      type: 'raster-dem',
      url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
      tileSize: 256,
    };
  }
  // Fallback: Mapzen Terrarium (no key needed) via AWS
  return {
    type: 'raster-dem',
    tiles: [
      'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    ],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 15,
  };
}

function hasTerrainDEM() {
  return true; // Both providers work without auth issues
}

// Base style with satellite + terrain
export function createMapStyle() {
  const style = {
    version: 8,
    sources: {
      satellite: satelliteSource,
    },
    layers: [
      {
        id: 'satellite-layer',
        type: 'raster',
        source: 'satellite',
        paint: {
          'raster-brightness-min': 0.05,
        },
      },
    ],
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  };

  if (hasTerrainDEM()) {
    style.sources.terrain = terrainSource();
  }

  return style;
}

// Enable 3D terrain on a map instance
export function enableTerrain(map) {
  if (!map.getSource('terrain')) return;
  try {
    map.setTerrain({ source: 'terrain', exaggeration: 1.2 });
  } catch {
    // Terrain not available — flat mode
  }
}

// Disable 3D terrain
export function disableTerrain(map) {
  try {
    map.setTerrain(null);
  } catch {
    // Already disabled
  }
}
