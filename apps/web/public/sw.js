/* ShopBooks offline shell.
 *
 * Keeps the app's pages and static files in the browser so the point of sale still opens with no connection.
 * It never touches /api/* (the app keeps its own offline data in IndexedDB), except product images.
 * Bump VERSION to drop everything cached by an older worker.
 */
const VERSION = "v1";
const PAGES = `sb-pages-${VERSION}`;
const FILES = `sb-files-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("sb-") && key !== PAGES && key !== FILES) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** A copy that can be served for navigations (redirected responses can't be). */
async function plain(res) {
  return new Response(await res.clone().blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

async function put(cacheName, request, res) {
  if (!res || !res.ok) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.put(request, res.redirected ? await plain(res) : res.clone());
  } catch {
    /* quota or opaque response: skip */
  }
}

const OFFLINE_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title><body style="font:16px system-ui;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px">
<div><h1 style="font-size:20px">You're offline</h1><p>This page isn't saved on this device yet.</p><p><a href="/pos">Open the point of sale</a></p></div>`;

async function navigate(request) {
  const url = new URL(request.url);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 4000)),
    ]);
    if (res.ok) await put(PAGES, url.pathname, res);
    return res;
  } catch {
    const cache = await caches.open(PAGES);
    const hit = (await cache.match(url.pathname)) || (await cache.match(url.pathname.replace(/\/$/, "") || "/"));
    if (hit) return hit;
    if (url.pathname.startsWith("/pos")) {
      const pos = await cache.match("/pos");
      if (pos) return pos;
    }
    return new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(FILES);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  await put(FILES, request, res);
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(FILES);
  const hit = await cache.match(request);
  const net = fetch(request)
    .then(async (res) => {
      await put(FILES, request, res);
      return res;
    })
    .catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/files/")) return;

  if (request.mode === "navigate") return event.respondWith(navigate(request));
  if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(request));
  event.respondWith(staleWhileRevalidate(request));
});

/** The app asks us to save pages and files it will need offline: { type: "cache", pages: [...], files: [...] }. */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "cache") return;
  event.waitUntil(
    (async () => {
      const found = new Set(data.files || []);
      for (const path of data.pages || []) {
        try {
          const res = await fetch(path, { credentials: "include" });
          if (!res.ok) continue;
          await put(PAGES, path, res);
          // The page's own scripts and styles, so it can boot offline even if it was never opened here.
          const html = await res.clone().text();
          for (const m of html.matchAll(/(?:\/?_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s)<>]+/g)) {
            found.add("/_next/" + m[0].replace(/^\/?(?:_next\/)?/, ""));
          }
        } catch {
          /* offline right now: nothing to warm */
        }
      }
      const cache = await caches.open(FILES);
      await Promise.all(
        [...found].map(async (file) => {
          try {
            if (await cache.match(file)) return;
            await put(FILES, file, await fetch(file));
          } catch {
            /* skip */
          }
        }),
      );
    })(),
  );
});
