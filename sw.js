'use strict';

/* Increase BUILD for each release so existing installations receive a fresh shell. */
const BUILD = '2026-11-08-reference-light-2';
const SCOPE = self.registration.scope;
const PREFIX = 'hantco-fieldpulse:' + encodeURIComponent(SCOPE) + ':';
const CACHE = PREFIX + BUILD;
const INDEX = new URL('index.html', SCOPE).href;
const MANIFEST = new URL('manifest.json', SCOPE).href;
const CORE = [INDEX, MANIFEST];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    /* addAll is atomic: a failed download never replaces the last working shell. */
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE.map(url => new Request(url, {cache: 'reload'})));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  /* Activation is opt-in; an active visit is never silently reloaded. */
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkWithTimeout(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    return await fetch(request, {signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  /* Never cache API payloads, credentials, mutations or third-party requests. */
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(SCOPE)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await networkWithTimeout(request);
        if (!response.ok) throw new Error('Navigation unavailable');
        return response;
      } catch (_) {
        const cache = await caches.open(CACHE);
        return (await cache.match(INDEX)) || new Response('FieldPulse needs one successful online visit before it can work offline. Reconnect and reload.', {
          status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}
        });
      }
    })());
    return;
  }

  const canonical = url.origin + url.pathname;
  if (!CORE.includes(canonical)) return;
  event.respondWith((async () => {
    const cached = await caches.match(canonical, {cacheName: CACHE});
    if (cached) return cached;
    return fetch(request);
  })());
});
