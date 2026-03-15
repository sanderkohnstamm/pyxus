// Service worker for offline map tile caching
const CACHE_NAME = 'tile-cache-v1';
const TILE_PATTERN = /\.(arcgisonline|arcgis)\.com\//;

// Cache-first strategy for tile URLs
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  if (!TILE_PATTERN.test(url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;

      try {
        const response = await fetch(event.request);
        if (response.ok) {
          cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        return new Response('', { status: 503, statusText: 'Offline' });
      }
    })
  );
});

// Handle messages from the app
self.addEventListener('message', (event) => {
  const { type, data } = event.data || {};

  if (type === 'cache-region') {
    cacheRegion(data, event.source);
  } else if (type === 'cache-stats') {
    sendCacheStats(event.source);
  } else if (type === 'clear-cache') {
    caches.delete(CACHE_NAME).then(() => {
      event.source.postMessage({ type: 'cache-cleared' });
    });
  }
});

async function cacheRegion({ bounds, minZoom, maxZoom }, client) {
  const cache = await caches.open(CACHE_NAME);
  const urls = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const minTile = latLonToTile(bounds.south, bounds.west, z);
    const maxTile = latLonToTile(bounds.north, bounds.east, z);

    const xMin = Math.min(minTile.x, maxTile.x);
    const xMax = Math.max(minTile.x, maxTile.x);
    const yMin = Math.min(minTile.y, maxTile.y);
    const yMax = Math.max(minTile.y, maxTile.y);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        urls.push(
          `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
        );
      }
    }
  }

  let cached = 0;
  const total = urls.length;

  for (const url of urls) {
    try {
      const existing = await cache.match(url);
      if (!existing) {
        const response = await fetch(url);
        if (response.ok) {
          await cache.put(url, response);
        }
      }
      cached++;
      if (cached % 10 === 0 || cached === total) {
        client.postMessage({ type: 'cache-progress', cached, total });
      }
    } catch {
      cached++;
    }
  }

  client.postMessage({ type: 'cache-complete', cached, total });
}

async function sendCacheStats(client) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    client.postMessage({ type: 'cache-stats', count: keys.length });
  } catch {
    client.postMessage({ type: 'cache-stats', count: 0 });
  }
}

function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}
