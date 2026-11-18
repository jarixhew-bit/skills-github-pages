const CACHE = 'xisui-v6';
const ASSETS = [
  '/skills-github-pages/xisui/',
  '/skills-github-pages/xisui/index.html',
  '/skills-github-pages/xisui/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// 页面本身：先上网拿最新版，没网才用缓存；其他资源：缓存优先。
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('/skills-github-pages/xisui/index.html', copy)); }
      return r;
    }).catch(() => caches.match('/skills-github-pages/xisui/index.html')));
    return;
  }
  e.respondWith(
    caches.match(req).then(r => r || fetch(req))
  );
});
