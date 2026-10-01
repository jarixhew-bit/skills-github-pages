// 减脂训练 App 的离线缓存。改了 index.html／manifest 一定要升下面的版本号
// （tools/check-sw-version.py 会拦忘记升的情况）。
const CACHE = 'fitness-v6';
const BASE = '/skills-github-pages/fitness/';
const ASSETS = [BASE, BASE + 'index.html', BASE + 'manifest.webmanifest', BASE + 'icon.svg', BASE + 'icon-192.png', BASE + 'icon-180.png', BASE + 'anim3d.js', '/skills-github-pages/vendor/three/three.module.min.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k.startsWith('fitness-') && k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// 页面本身：先上网拿最新版，没网（健身房地下室）才用缓存；其他资源：缓存优先。
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(BASE + 'index.html', copy)); return r;
    }).catch(() => caches.match(BASE + 'index.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok && (req.url.startsWith(self.location.origin) || req.url.includes('fonts.g'))) {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy));
    }
    return r;
  })));
});
