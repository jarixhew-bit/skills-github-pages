// 新加坡＋雅加达两本手册的离线缓存（2026-11-04 建）。
//
// 为什么要有：用户原话「在飞机上、刚落地没漫游、信号差时手册照样能打开」。
// 作用域只到 sg-jkt-trip/ 这个文件夹（sw.js 放这里、不另设 scope），不碰仓库里其它页面。
// 不装主屏（没有 manifest），只管「没网也打得开」。
//
// 三种请求三种待遇：
//   1. 手册页面（singapore.html／jakarta.html／跳转页）：**网络优先**——有网永远拿最新版，
//      用户改了手册对方刷新就同步（本仓库的核心约定）；网络失败或 6 秒没回应才拿缓存。
//      第一次打开时两本都预先缓存：在新加坡打开过一次，到了雅加达没网也能开雅加达那本。
//      每次在线打开一本，顺手在背景把另一本也刷新一份，缓存里不会是很旧的版本。
//   2. Google 照片（lh3.googleusercontent.com）与 Google 字体：**缓存优先**，第一次看过
//      （或背景预抓过）之后离线也看得到。预抓失败只是少几张图，不会让安装失败。
//   3. 其他一律不插手（直接走网络、不缓存）：天气 open-meteo、空气质量 data.gov.sg 等
//      实时数据，缓存了反而会把旧读数当成现在的——页面本身已处理抓不到的情况。
//
// 改了 singapore.html／jakarta.html／index.html 要把下面 VERSION 加一
// （tools/check-sw-version.py 会拦忘记升的情况）。升版会重新预缓存两本、重新补抓新照片。
const VERSION = 'sgjkt-v6';
const PAGES = VERSION + '-pages';
const IMGS = 'sgjkt-img';            // 照片缓存不跟版本走：升版不必把几百张图重抓一遍
const BOOKS = ['./singapore.html', './jakarta.html'];
const PRECACHE = ['./', './index.html', ...BOOKS];
const NET_TIMEOUT = 6000;

const scopeURL = new URL('./', self.location).href;
const isImg = u => u.hostname === 'lh3.googleusercontent.com';
const isFont = u => u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';

// 页面缓存一律按「去掉 ?query 与 #」的地址存，同一页只留一份
function pageKey(url) {
  const u = new URL(url, scopeURL);
  u.search = ''; u.hash = '';
  return u.href;
}

async function fetchFresh(url) {
  // no-cache：带 ETag 去问服务器，没改就 304，省流量；改了就拿新版。
  // 不用普通 fetch——GitHub Pages 给 HTML 10 分钟浏览器缓存，会吃到旧版（boss-sw.js 踩过）。
  const res = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
  if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
  return res;
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(PAGES);
    await Promise.all(PRECACHE.map(async p => {
      const res = await fetchFresh(new URL(p, scopeURL).href);
      await c.put(pageKey(p), res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('sgjkt-') && k !== PAGES && k !== IMGS)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// ---- 页面：网络优先，超时／失败退回缓存 ----
async function handlePage(e) {
  const req = e.request;
  const key = pageKey(req.url);
  const cache = await caches.open(PAGES);
  const network = fetchFresh(req.url).then(async res => {
    await cache.put(key, res.clone());
    return res;
  });
  network.catch(() => {});
  // 在线打开了一本，就顺手把另一本也刷新（不阻塞这次打开）
  e.waitUntil(network.then(() => refreshOthers(key)).catch(() => {}));

  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(resolve, NET_TIMEOUT); });
  try {
    const res = await Promise.race([network, timeout.then(() => null)]);
    if (res) return res;
  } catch (err) { /* 没网：往下拿缓存 */ }
  finally { clearTimeout(timer); }

  const cached = await cache.match(key) ||
    // 打开的是文件夹本身（/sg-jkt-trip/）→ 跳转页的缓存；都没有就给新加坡那本
    (key === scopeURL ? await cache.match(pageKey('./index.html')) : null);
  if (cached) return cached;
  return network; // 从没缓存过：只能继续等网络（失败就是浏览器原本的离线页）
}

async function refreshOthers(doneKey) {
  const cache = await caches.open(PAGES);
  await Promise.all(PRECACHE.map(async p => {
    const k = pageKey(p);
    if (k === doneKey) return;
    try { await cache.put(k, await fetchFresh(k)); } catch (err) { /* 下次再说 */ }
  }));
}

// ---- 照片与字体：缓存优先 ----
let corsOK = true; // Google 照片若不给跨域读取，就改存「不透明」响应，并记住别再白试
async function fetchImage(url) {
  let corsFailed = false;
  if (corsOK) {
    try {
      const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (r.ok) return r;
    } catch (err) { corsFailed = true; }
  }
  const r = await fetch(url, { mode: 'no-cors', credentials: 'omit' });
  // 只有「跨域那次失败、不透明这次却拿到了」才算对方不给跨域读取；
  // 断网时两次都会失败（上面这行抛错），不能因此永久改存不透明响应——那种响应很占配额。
  if (corsFailed) corsOK = false;
  return r;
}

async function handleAsset(req, u) {
  const cache = await caches.open(IMGS);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = isImg(u) ? await fetchImage(req.url) : await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) {
    try { await cache.put(req.url, res.clone()); } catch (err) { /* 空间满了就不存，照常显示 */ }
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let u;
  try { u = new URL(req.url); } catch (err) { return; }

  if (u.origin === self.location.origin) {
    // 只管本文件夹的页面；同源其它东西（理论上没有）照常走网络
    if (req.mode === 'navigate' || (u.href.startsWith(scopeURL) && /(\.html|\/)$/.test(u.pathname))) {
      e.respondWith(handlePage(e));
    }
    return;
  }
  if (isImg(u) || isFont(u)) {
    e.respondWith(handleAsset(req, u));
    return;
  }
  // 其他跨域（天气、空气质量、地图……）：不插手，浏览器照常走网络、不进缓存
});

// ---- 背景预抓两本手册里的照片（页面载入后发 'warm' 过来）----
// 只补缓存里还没有的；同时清掉手册里已经不再用的旧图，缓存不会越积越大。
// 用户开了「省流量」就不预抓，滑到哪张存哪张。
let warming = null;
async function warmImages() {
  const pages = await caches.open(PAGES);
  const urls = new Set();
  for (const p of BOOKS) {
    const res = await pages.match(pageKey(p));
    if (!res) continue;
    const html = await res.text();
    for (const m of html.matchAll(/https:\/\/lh3\.googleusercontent\.com\/[^"'\s)<>]+/g)) {
      urls.add(m[0].replace(/&amp;/g, '&'));
    }
  }
  if (!urls.size) return;
  const cache = await caches.open(IMGS);
  for (const req of await cache.keys()) {
    const u = new URL(req.url);
    if (isImg(u) && !urls.has(req.url)) await cache.delete(req);
  }
  const todo = [];
  for (const url of urls) if (!(await cache.match(url))) todo.push(url);
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const url = todo[i++];
      try {
        const res = await fetchImage(url);
        if (res && (res.ok || res.type === 'opaque')) await cache.put(url, res);
      } catch (err) { /* 抓不到这张就算了 */ }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'warm') return;
  if (e.data.saveData) return;
  if (!warming) warming = warmImages().finally(() => { warming = null; });
  e.waitUntil(warming.catch(() => {}));
});
