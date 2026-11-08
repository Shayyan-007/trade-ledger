// Network-first with revalidation: always try the server (checking for changes), fall back to cache offline.
// Supabase and CDN requests are not touched.
const CACHE = "ledger-v3";
const SHELL = ["./", "index.html", "styles.css", "config.js", "manifest.webmanifest", "icon.svg", "icon-192.png",
  "js/main.js", "js/core.js", "js/views.js", "js/forms.js", "js/io.js", "js/charts.js", "prop-firms.json"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.endsWith("version.json")) return;
  e.respondWith(fetch(new Request(e.request, { cache: "no-cache" }))
    .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
