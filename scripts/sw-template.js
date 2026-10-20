/*
 * Band Studio service worker. Generated into dist/sw.js by scripts/serviceWorker.ts,
 * which fills in BUILD with this build's file list; not used in `pnpm dev`.
 *
 *   app shell (index.html, scripts, styles, icons, demo song): cached on install, per build
 *   instrument samples: cached the first time they're fetched, kept until they change
 *   lazy chunks (score import) and other same-origin files: cached on first use, per build
 *   Google Fonts: served from cache, refreshed in the background
 * Pages always try the network first, so a new deploy shows up on the next visit.
 */
const BUILD = self.__BUILD__;
const SHELL = `kon-app-${BUILD.version}`;
const RUNTIME = `kon-runtime-${BUILD.version}`;
const SAMPLES = `kon-instruments-${BUILD.samplesVersion}`;
const FONTS = "kon-fonts";
const scope = new URL(self.registration.scope);
const at = (path) => new URL(path, scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(BUILD.shell.map(at)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, RUNTIME, SAMPLES, FONTS]);
      for (const key of await caches.keys()) {
        if (key.startsWith("kon-") && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// Module scripts are CORS requests with an Origin header; a server answering "Vary: Origin"
// would make them miss the copies cached on install, so lookups ignore Vary.
const MATCH = { ignoreVary: true };

async function cacheFirst(request, cacheName) {
  const hit = await caches.match(request, MATCH);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL);
      await cache.put(at("index.html"), response.clone());
    }
    return response;
  } catch (err) {
    const page = await caches.match(at("index.html"), MATCH);
    if (page) return page;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, MATCH);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok || response.type === "opaque") void cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  return hit ?? refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (request.mode === "navigate" && url.origin === scope.origin) {
    event.respondWith(networkFirstPage(request));
  } else if (url.origin === scope.origin && url.pathname.startsWith(`${scope.pathname}instruments/`)) {
    event.respondWith(cacheFirst(request, SAMPLES));
  } else if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) {
    event.respondWith(cacheFirst(request, RUNTIME));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, FONTS));
  }
});
