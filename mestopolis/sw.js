// Mestopolis – service worker: hra funguje aj offline
const VERSION = 'mestopolis-v1';
const ASSETS = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './js/main.js', './js/config.js', './js/noise.js', './js/world.js', './js/sim.js', './js/geom.js',
  './js/buildgeo.js', './js/renderer.js', './js/ui.js', './js/icons.js',
  './vendor/three.module.js', './vendor/three.core.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// stale-while-revalidate: rýchlo z cache, na pozadí aktualizácia
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || net;
  }));
});
