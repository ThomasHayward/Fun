// Offline cache: serve app files from cache, refresh in the background.
// Loaded as a classic script (not a module), so no imports/exports here.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = 'shelf-prep-v1';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.json',
  'app.js', 'content.js', 'store.js', 'srs.js', 'body.js',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

sw.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  sw.skipWaiting();
});

sw.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  sw.clients.claim();
});

sw.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request)
        .then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => cached ?? Response.error());
      return cached ?? network;
    })
  );
});
