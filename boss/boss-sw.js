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
const CACHE = 'boss-app-v35';
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
  // 页面本身：**先给缓存、同时后台回源**（2026-08-29 改）。
  //
  // 上一版是「网络优先」，正确但慢：每次打开都要等一个完整的网络往返才画得出东西，
  // 手机网差的时候尤其难受（用户：「加载能不能快一点」）。
  //
  // ⚠️ 后台那次回源必须带 cache:'reload'（2026-08-28 教训，这条不能丢）：GitHub Pages
  // 给 HTML 带 10 分钟的浏览器 HTTP 缓存，普通 fetch() 会吃那层缓存，于是改了版
  // 老板重开两次还是旧页面。reload 绕过 HTTP 缓存直接问服务器。
  //
  // 拿回来跟缓存里那份不一样时，通知页面（index.html 那边收到就静默重载一次；
  // 正在编辑的话只提示不重载）。所以「快」和「改了就能看到」两个都保住了：
  // 画面立刻出来，新版在一两秒内自己顶上。
  if(req.destination === 'document'){
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req) || await cache.match('./index.html');
      // ⚠️ 比较用的副本必须**现在**就克隆好（2026-08-29 自检逮到）：cached 一旦作为
      // 响应交给页面，body 就被读走了，那时候再 clone() 会抛错 → 被 catch 成
      // 「内容变了」→ 发消息 → 页面重载 → 再来一遍，无限转圈。
      const cachedForCompare = cached ? cached.clone() : null;
      const network = (async () => {
        const res = await fetch(req, { cache: 'reload' });
        if(!res || !res.ok) return res;
        const fresh = res.clone();
        // 只有内容真的变了才惊动页面——每次都发的话会无谓地重载
        let changed = true;
        if(cachedForCompare){
          try{ changed = (await cachedForCompare.text()) !== (await res.clone().text()); }
          catch(err){ changed = true; }
        }
        await cache.put(req, fresh);
        if(changed && cached){
          const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          for(const c of list){ try{ c.postMessage({ type: 'shell-updated' }); }catch(err){} }
        }
        return res;
      })();
      if(cached){ e.waitUntil(network.catch(() => {})); return cached; } // 有缓存就秒开
      return network.catch(() => caches.match('./index.html')); // 第一次装，只能等网络
    })());
    return;
  }
  // 其余静态资源：缓存优先
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});

// 推送：后端在 tripsSave/billUpload 成功后发，载荷是 {title, body, url, tag}（见接口合约）。
// 弹通知＋标个角标；badge API 不是所有平台都支持，用可选链，不支持不能报错。
//
// tag 必须用上（2026-08-29 补）：后端一直在发 tag（trips/bills），这里以前直接丢掉，
// 结果同一类通知会在通知栏堆成一长列——行程改三次就有三条一模一样的。带上 tag 之后
// 新的一条会替换旧的，配 renotify 让它替换时仍然出声，不会被无声地盖掉。
// icon 也一并给上：不给的话安卓只显示一个通用的浏览器小铃铛，看不出是哪个 App。
self.addEventListener('push', e => {
  let data = {};
  try{ data = e.data ? e.data.json() : {}; }catch(err){ data = {}; }
  const title = data.title || '老板 App';
  const body = data.body || '';
  const url = data.url || './';
  const tag = data.tag || '';
  const opts = { body, data: { url }, icon: 'icon-192.png', badge: 'icon-192.png' };
  if(tag){ opts.tag = tag; opts.renotify = true; } // renotify 只在有 tag 时有意义
  e.waitUntil((async () => {
    try{ await self.registration.showNotification(title, opts); }catch(err){}
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
