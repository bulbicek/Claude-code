// Mestopolis – service worker: online vždy čerstvá verzia, offline z cache
const VERSION = 'mestopolis-v8';
const ASSETS = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './js/main.js', './js/config.js', './js/noise.js', './js/world.js', './js/sim.js', './js/geom.js',
  './js/buildgeo.js', './js/renderer.js', './js/ui.js', './js/icons.js',
  './vendor/three.module.js', './vendor/three.core.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' obíde HTTP cache prehliadača, aby sa neuložila stará verzia
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(ASSETS.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => r.ok && c.put(u, r)))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// network-first: najprv sieť (bez HTTP cache), pri výpadku alebo po 6 s cache
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const net = fetch(req, { cache: 'no-cache' });
      const res = await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000))]);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const cached = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' && await cache.match('./index.html'));
      if (cached) return cached;
      throw err;
    }
  })());
});
