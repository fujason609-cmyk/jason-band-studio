/*
 * Band Studio service worker. Generated into dist/sw.js by scripts/serviceWorker.ts,
 * which fills in BUILD with this build's file list; not used in `pnpm dev`.
 *
 *   app shell (index.html, scripts, styles, icons, demo song): cached on install, per build
 *   instrument samples: cached the first time they're fetched, kept until they change
 *   lazy chunks (score import) and other same-origin files: cached on first use, per build;
 *              an older build's copies are kept for a week after the deploy that replaced
 *              it, so a tab left open across it can still load the chunk it was built with
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
/** In an older build's runtime cache: when a newer build replaced it. */
const RETIRED = "/__retired__";
/** A page that hasn't answered by then is served from the cache (a connection that's up but stalled). */
const PAGE_TIMEOUT_MS = 4000;
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
        if (key.startsWith("kon-runtime-")) {
          // kept for a week from the deploy that retired it (not from its own build time:
          // deploys weeks apart would otherwise drop it at once)
          const cache = await caches.open(key);
          const mark = await cache.match(at(RETIRED));
          const retiredAt = mark ? Number(await mark.text()) : Date.now();
          if (!mark) await cache.put(at(RETIRED), new Response(String(retiredAt)));
          if (Date.now() - retiredAt < KEEP_OLD_RUNTIME_MS) continue;
        }
        await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// Module scripts are CORS requests with an Origin header; a server answering "Vary: Origin"
// would make them miss the copies cached on install, so lookups ignore Vary.
const MATCH = { ignoreVary: true };

async function cacheFirst(request, cacheName, revalidate = false) {
  const hit = await caches.match(request, MATCH);
  if (hit) return hit;
  // samples keep their names when re-rendered: ask the server, not the HTTP cache, or the
  // old file could be cached here for good
  const response = await fetch(revalidate ? new Request(request, { cache: "no-cache" }) : request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstPage(request) {
  const network = fetch(request.url, { cache: "no-cache", credentials: "same-origin" }).then(async (response) => {
    // a .mid or .md opened in a tab is a navigation too: only an HTML page may become the offline app
    if (response.ok && (response.headers.get("content-type") ?? "").includes("text/html")) {
      const cache = await caches.open(SHELL);
      await cache.put(at("index.html"), response.clone());
    }
    return response;
  });
  network.catch(() => undefined); // still awaited below; this only keeps a late failure quiet
  const cached = () => caches.match(at("index.html"), MATCH);
  const timeout = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS)).then(cached);
  try {
    // whichever comes first: the page, or the cached app once the network has stalled
    const first = await Promise.race([network, timeout]);
    return first ?? (await network);
  } catch (err) {
    const page = await cached();
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
    event.respondWith(cacheFirst(request, SAMPLES, true));
  } else if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname)) {
    event.respondWith(cacheFirst(request, RUNTIME));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, FONTS));
  }
});
