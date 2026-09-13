/* =============================================================
   Holiday Ledger — service worker

   Two jobs, and deliberately no more:
     1. the app opens without a network (the shell is cached on install)
     2. the last data it saw is there to read when the server is not

   Writes are never queued or faked. A POST with no connection fails and the
   UI says so, because a ledger that silently accepted a line it had not
   stored would be worse than one that refused it.

   Bump VERSION to ship a new shell: the old caches are dropped on activate.
============================================================= */
const VERSION = "v2";
const SHELL = "hl-shell-" + VERSION;
const DATA = "hl-data-" + VERSION;

// Everything needed to draw the app with the network down. Kept in step with
// the files in public/ by the self check, which fails if one is missing.
// NB "/" is deliberately NOT here. It was, and because the asset branch below
// is cache-first, every fetch of "/" returned the copy cached on first visit —
// for good. The document has exactly one route into this worker now, and that
// route is network-first.
const ASSETS = [
  "/index.html",
  "/chart.umd.min.js",
  "/manifest.json",
  "/icon-180.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
];

// How long to wait for the server before falling back to the cached app. Long
// enough that a slow home connection still wins (so a redeploy is picked up),
// short enough that a dead one does not leave you staring at a blank screen.
const DOC_TIMEOUT = 2500;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(ASSETS))
      // Warm the store too, or the first offline launch shows the app with
      // nothing in it: on the very first visit this worker takes control only
      // AFTER the page has already fetched /api/data, so that request never
      // passes through here and nothing is cached until the second visit.
      // Best-effort by design — a failure here must not fail the install and
      // cost the app its offline mode entirely.
      .then(() => fetch("/api/data")
        .then((res) => {
          if (!res.ok) return;
          const headers = new Headers(res.headers);
          headers.set("X-Cached-At", new Date().toISOString());
          return res.arrayBuffer().then((body) => caches.open(DATA)
            .then((c) => c.put("/api/data", new Response(body, { status: 200, headers }))));
        })
        .catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Writes always go to the server, and fail honestly when it is not there.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname === "/api/data") return e.respondWith(dataFirst(req));
  // Backups, exports, rate refreshes, the version probe: all need the server.
  if (url.pathname.startsWith("/api/")) return;
  // The document, however it is asked for. Matching on req.mode alone missed
  // a plain fetch("/") — which is how the app checks itself — and handed it the
  // cache-first branch, so the page could never see that it had gone stale.
  if (req.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html")
    return e.respondWith(docFirst(req));
  e.respondWith(assetFirst(req));
});

/* The store: network first, so a reachable server always wins and the cached
   copy is only ever the thing to show when there is nothing better. The reply
   carries the time it was stored, which is what lets the app say how old the
   figures on screen are rather than pretending they are current. */
async function dataFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const body = await res.clone().arrayBuffer();
      const headers = new Headers(res.headers);
      headers.set("X-Cached-At", new Date().toISOString());
      const c = await caches.open(DATA);
      await c.put("/api/data", new Response(body, { status: 200, headers }));
    }
    return res;
  } catch (err) {
    const hit = await caches.match("/api/data");
    if (!hit) throw err;
    const headers = new Headers(hit.headers);
    headers.set("X-From-Cache", "1");
    return new Response(await hit.arrayBuffer(), { status: 200, headers });
  }
}

/* The app itself: network first with a deadline. index.html carries the whole
   UI, so serving a cached copy while the server is reachable would mean a
   redeploy silently did nothing on the phone. */
async function docFirst(req) {
  try {
    const res = await withTimeout(fetch(req), DOC_TIMEOUT);
    if (!res || !res.ok) throw new Error("bad response");
    const copy = res.clone();
    caches.open(SHELL).then((c) => c.put("/index.html", copy));
    return res;
  } catch (err) {
    return (await caches.match("/index.html")) || Response.error();
  }
}

/* Chart.js and the icons never change within a version, so they come straight
   off disk and are refreshed in the background for the next launch. */
async function assetFirst(req) {
  const hit = await caches.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
      return res;
    })
    .catch(() => null);
  return hit || (await fresh) || Response.error();
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (r) => { clearTimeout(t); resolve(r); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}
