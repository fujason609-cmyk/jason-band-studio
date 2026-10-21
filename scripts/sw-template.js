/*
 * Band Studio service worker. Generated into dist/sw.js by scripts/serviceWorker.ts,
 * which fills in BUILD with this build's file list; not used in `pnpm dev`.
 *
 *   app shell (index.html, scripts, styles, icons, demo song): cached on install, per build
 *   instrument samples: cached the first time they're fetched, kept until they change
 *   lazy chunks (score import) and other same-origin files: cached on first use, per build;
 *              an older build's copies are kept for a week, so a tab left open across a
 *              deploy can still load the chunk it was built with
 *   Google Fonts: served from cache, refreshed in the background (successful CORS only)
 * Pages always try the network first (skipping the HTTP cache), so a new deploy shows up
 * on the next visit; only HTML responses are kept as the offline page.
 */
const BUILD = self.__BUILD__;
const SHELL = `kon-app-${BUILD.version}`;
const RUNTIME = `kon-runtime-${BUILD.builtAt}-${BUILD.version}`;
const SAMPLES = `kon-instruments-${BUILD.samplesVersion}`;
const FONTS = "kon-fonts";
/** How long an older build's lazy chunks stay cached after a deploy. */
const KEEP_OLD_RUNTIME_MS = 7 * 24 * 3600 * 1000;
/** Font files (the stylesheet plus its unicode-range subsets) kept at most. */
const MAX_FONT_FILES = 80;
const scope = new URL(self.registration.scope);
const at = (path) => new URL(path, scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // straight from the server: the HTTP cache may still hold the previous build's index.html
      .then((cache) => cache.addAll(BUILD.shell.map((path) => new Request(at(path), { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, RUNTIME, SAMPLES, FONTS]);
      for (const key of await caches.keys()) {
        if (!key.startsWith("kon-") || keep.has(key)) continue;
        const runtimeBuiltAt = Number(key.split("-")[2]);
        if (key.startsWith("kon-runtime-") && BUILD.builtAt - runtimeBuiltAt < KEEP_OLD_RUNTIME_MS) continue;
        await caches.delete(key);
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
    const response = await fetch(request.url, { cache: "no-cache", credentials: "same-origin" });
    // a .mid or .md opened in a tab is a navigation too: only an HTML page may become the offline app
    if (response.ok && (response.headers.get("content-type") ?? "").includes("text/html")) {
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

/** Drop the oldest entries beyond `max` (keys come back in insertion order). */
async function trim(cache, max) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, MATCH);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone()).then(() => trim(cache, MAX_FONT_FILES));
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
