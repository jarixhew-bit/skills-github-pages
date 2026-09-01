// 同事版报账页的 service worker。
//
// 作用只有一个：**没信号的时候页面还能打开**。同事在外面记账，打开页面时常常
// 正好没网——页面打不开的话，「先存手机、有网自动补送」那套队列一次都用不上。
//
// 跟老板 App 的 expense-tracker-sw.js 是两个独立的 SW：这个注册在 /staff/ 目录下，
// 作用域只到这个目录，不会去缓存或接管 App 那边的页面。缓存名也是分开的。
// 这个文件是手写的（不是生成的）——它跟 App 的 SW 没有共用逻辑，各管各的目录。
const CACHE = 'staff-expense-v6';
const ASSETS = ['./', './index.html', './manifest.webmanifest'];

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
  // 页面本身：网络优先，这样改了版同事一刷新就拿到新的；没网才回落到缓存
  if(e.request.destination === 'document'){
  // ⚠️ 必须带 cache:'reload'（2026-08-28 教训）：光「网络优先」还不够——GitHub Pages
  // 给 HTML 带 10 分钟的浏览器 HTTP 缓存，普通 fetch() 会吃那层缓存，于是用户关掉
  // App 重开、甚至重开两次，拿到的仍是旧页面。今天为此反复困惑了好几轮（「你说改了
  // 怎么还是老样子」）。reload 会绕过 HTTP 缓存直接问服务器，离线时照旧回落缓存。
    e.respondWith(fetch(e.request, { cache: 'reload' }).catch(() => caches.match(e.request) || caches.match('./index.html')));
    return;
  }
  // 其余静态资源：缓存优先
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
