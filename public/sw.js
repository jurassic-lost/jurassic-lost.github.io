// Service worker de Jurassic Lost: permite instalar el juego como app y jugar sin conexión.
// Siempre intenta descargar la versión más nueva; si no hay internet, usa la copia guardada.
const CACHE = 'jurassic-lost-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    // no-cache: pregunta siempre al servidor si hay versión nueva (si no la hay, responde rápido con 304).
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./'))),
  );
});
