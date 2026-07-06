const CACHE = 'expense-tracker-v3';
const ASSETS = [
  'expense-tracker.html',
  'expense-tracker-icon.svg',
  'expense-tracker.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // HTML: network-first so updates are always picked up immediately
  if(e.request.destination === 'document'){
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  // Other assets (icons, manifest, SW): cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
