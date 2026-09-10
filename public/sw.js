/**
 * Service Worker (system-overview.md §1, spec.md §7). Hand-written, no
 * Workbox (techstack.md).
 *
 * Not `// @ts-check`'d: this file runs in the ServiceWorkerGlobalScope, but
 * deno.json's `compilerOptions.lib` is fixed project-wide to `dom` (for the
 * page-context client code) — `dom` and `webworker` are mutually exclusive
 * lib sets in TypeScript, so this file can't be type-checked under the same
 * config without a second `deno.json` scoped just to it. Not worth the
 * infrastructure for one file; it's excluded from `deno task check` too.
 *
 * It:
 *   - precaches the app shell on install;
 *   - cache-first for same-origin static assets;
 *   - stale-while-revalidate for `GET /api/*` (serves the cached copy
 *     instantly if there is one, refetches in the background either way —
 *     this is a speed/resilience layer over the network, not the offline
 *     guarantee itself, which is the IndexedDB Cache's job at the app
 *     layer, per system-overview.md's data-flow section);
 *   - non-GET `/api/*` requests always go straight to the network untouched
 *     — the client's Write Queue owns their durability, not this cache;
 *   - cross-origin requests (Google Fonts) pass through, uncached, to keep
 *     this worker's scope to the app's own assets;
 *   - a `sync` event (where the browser supports Background Sync) tells
 *     every open client to drain its Write Queue immediately; the `online`
 *     window event (wired in sync-manager.js) is the cross-browser fallback
 *     for reconnect, since Background Sync isn't universal (notably no
 *     Safari/iOS support).
 */

const VERSION = "v1";
const SHELL_CACHE = `noted-shell-${VERSION}`;
const API_CACHE = `noted-api-${VERSION}`;

/** Everything needed to boot the app shell with no network. */
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/app/main.js",
  "/app/app-shell.js",
  "/app/api.js",
  "/app/ui.js",
  "/app/note-list.js",
  "/app/note-editor.js",
  "/app/search-view.js",
  "/app/tag-browser.js",
  "/app/backlinks-panel.js",
  "/app/codemirror-setup.js",
  "/app/idb-cache.js",
  "/app/write-queue.js",
  "/app/sync-manager.js",
  "/app/styles.css",
  "/vendor/codemirror/state.js",
  "/vendor/codemirror/view.js",
  "/vendor/codemirror/language.js",
  "/vendor/codemirror/commands.js",
  "/vendor/codemirror/autocomplete.js",
  "/vendor/codemirror/lang-markdown.js",
  "/vendor/codemirror/lezer-common.js",
  "/vendor/codemirror/lezer-highlight.js",
  "/vendor/codemirror/node-process-stub.js",
  "/vendor/codemirror/style-mod.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, not addAll: one missing/renamed asset shouldn't fail
      // the whole install (addAll is all-or-nothing).
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            await cache.add(url);
          } catch (cause) {
            console.warn(`sw: failed to precache ${url}:`, cause);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== SHELL_CACHE && name !== API_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return; // let cross-origin pass through
  if (req.method !== "GET") return; // writes always go straight to the network

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(staleWhileRevalidate(req));
  } else {
    event.respondWith(cacheFirst(req));
  }
});

/** @param {Request} req */
async function cacheFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

/** @param {Request} req */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    network.catch(() => {}); // refresh in the background, ignore failures
    return cached;
  }
  const fresh = await network;
  if (fresh) return fresh;
  return new Response(JSON.stringify({ error: "offline, nothing cached" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

self.addEventListener("sync", (event) => {
  if (event.tag !== "noted-write-queue") return;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) client.postMessage({ type: "sync" });
    })(),
  );
});
