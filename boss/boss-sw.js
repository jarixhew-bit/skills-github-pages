// 老板 App 的 service worker。
//
// 作用：没信号的时候页面壳还能打开（真正的行程/账单/库存数据缓存在 localStorage 里，
// 见 index.html 的 FEED_CACHE_KEY，这里只管页面壳本身）。
//
// 独立注册在 /boss/ 目录下，作用域只到这个文件夹，跟仓库里其它 PWA
// （staff/、xisui/、expense-tracker.html 等）互不干扰，缓存名也各自独立。
//
// 改了页面内容记得同步升这里的版本号（v1 → v2 这样升），否则已安装的
// 老板手机会一直看到旧版壳（PWA 页面规则，见 skills/pwa-pages.md）。
const CACHE = 'boss-app-v26';
const ASSETS = ['./', './index.html', './manifest.webmanifest',
  './apple-touch-icon.png', './icon-192.png', './icon-512.png'];

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
  const req = e.request;
  // 只管这个 App 自己的页面壳；跨源请求（老板数据接口 butler-bot.jarixhew.workers.dev）
  // 完全不插手，交给浏览器正常处理——这里如果连 POST/跨源请求也接手，
  // 会把原本该走真实网络的 API 调用也导进 SW 的 fetch 管线，白白多一层、
  // 离线判断也会被搅乱。同源的非 GET 请求同理跳过。
  let url;
  try{ url = new URL(req.url); }catch(e2){ return; }
  if(url.origin !== self.location.origin) return;
  if(req.method !== 'GET') return;
  // 页面本身：网络优先，这样改了版老板一刷新就拿到新的；没网才回落到缓存
  if(req.destination === 'document'){
  // ⚠️ 必须带 cache:'reload'（2026-08-28 教训）：光「网络优先」还不够——GitHub Pages
  // 给 HTML 带 10 分钟的浏览器 HTTP 缓存，普通 fetch() 会吃那层缓存，于是用户关掉
  // App 重开、甚至重开两次，拿到的仍是旧页面。今天为此反复困惑了好几轮（「你说改了
  // 怎么还是老样子」）。reload 会绕过 HTTP 缓存直接问服务器，离线时照旧回落缓存。
    e.respondWith(fetch(req, { cache: 'reload' }).catch(() => caches.match(req) || caches.match('./index.html')));
    return;
  }
  // 其余静态资源：缓存优先
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});

// 推送：后端在 tripsSave/billUpload 成功后发，载荷是 {title, body, url}（见接口合约）。
// 弹通知＋标个角标；badge API 不是所有平台都支持，用可选链，不支持不能报错。
self.addEventListener('push', e => {
  let data = {};
  try{ data = e.data ? e.data.json() : {}; }catch(err){ data = {}; }
  const title = data.title || '老板 App';
  const body = data.body || '';
  const url = data.url || './';
  e.waitUntil((async () => {
    try{ await self.registration.showNotification(title, { body, data: { url } }); }catch(err){}
    try{ navigator.setAppBadge?.(); }catch(err){}
  })());
});

// 点通知：聚焦已开着的分页（并跳去对应网址），没有就开一个新的。
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for(const c of list){
      if('focus' in c){
        try{
          await c.focus();
          if('navigate' in c) await c.navigate(url);
          return;
        }catch(err){}
      }
    }
    if(clients.openWindow) await clients.openWindow(url);
  })());
});
