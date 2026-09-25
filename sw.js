// Oak Joinery home app — service worker.
// Network-FIRST for everything (so a new upload shows on the next open),
// cached copy only when offline. Icons are cache-first.
const CACHE_NAME = 'oak-home-v1';
const SHELL = ['./', './index.html', './manifest.json', './oak-core.js', './icon-192.png', './icon-512.png', './icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ns) => Promise.all(ns.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL('./', self.location).pathname)) return; // only this app's files
  if (/\/icon-\d+\.png$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(e.request, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
