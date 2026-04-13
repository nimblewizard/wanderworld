/* WanderWorld — Tile Cache Service Worker */
const CACHE_NAME = 'ww-tiles-v1';

// Tile host patterns to intercept
const TILE_HOSTS = [
  'tile.openstreetmap.org',
  'arcgisonline.com',
  'basemaps.cartocdn.com'
];

function isTileRequest(url) {
  return TILE_HOSTS.some(h => url.includes(h));
}

// 1×1 transparent PNG returned when offline and tile not cached
const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function blankResponse() {
  const r = await fetch(BLANK_PNG);
  return r;
}

// ---- Install / Activate ----
self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', e  => e.waitUntil(self.clients.claim()));

// ---- Fetch interception ----
self.addEventListener('fetch', e => {
  if (!isTileRequest(e.request.url)) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(e.request);
    if (cached) return cached;

    try {
      const resp = await fetch(e.request.clone());
      if (resp.ok) cache.put(e.request, resp.clone());
      return resp;
    } catch {
      // offline — return blank tile so map still renders
      const blank = await blankResponse();
      return blank;
    }
  })());
});

// ---- Message handling ----
self.addEventListener('message', e => {
  const { type, urls, id } = e.data || {};

  if (type === 'CACHE_TILES') {
    e.waitUntil(cacheTiles(urls, id, e.source));
  }
  if (type === 'CLEAR_TILES') {
    e.waitUntil((async () => {
      await caches.delete(CACHE_NAME);
      e.source.postMessage({ type: 'CLEAR_DONE' });
    })());
  }
  if (type === 'GET_STATS') {
    e.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const keys  = await cache.keys();
      e.source.postMessage({ type: 'STATS', count: keys.length });
    })());
  }
});

async function cacheTiles(urls, jobId, client) {
  const cache = await caches.open(CACHE_NAME);
  const BATCH = 4;
  let done = 0;

  for (let i = 0; i < urls.length; i += BATCH) {
    const chunk = urls.slice(i, i + BATCH);
    await Promise.all(chunk.map(async url => {
      try {
        const cached = await cache.match(url);
        if (!cached) {
          const resp = await fetch(url, { mode: 'cors' });
          if (resp.ok) await cache.put(url, resp);
        }
      } catch { /* skip failed tile */ }
      done++;
    }));
    client.postMessage({ type: 'CACHE_PROGRESS', jobId, done, total: urls.length });
    // small breathing room between batches
    await new Promise(r => setTimeout(r, 60));
  }
  client.postMessage({ type: 'CACHE_DONE', jobId, total: urls.length });
}
