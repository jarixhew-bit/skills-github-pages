// 首尔手册的离线缓存（2026-11-19 建，照 sg-jkt-trip/sw.js 做）。
//
// 为什么要有：用户原话「在飞机上、刚落地没漫游、信号差时手册照样能打开」。
// 作用域只到 seoul-trip/ 这个文件夹（sw.js 放这里、不另设 scope），不碰仓库里其它页面。
// 不装主屏（没有 manifest），只管「没网也打得开」。
//
// 三种请求三种待遇：
//   1. 手册页面（index.html）：**网络优先**——有网永远拿最新版，
//      用户改了手册对方刷新就同步（本仓库的核心约定）；网络失败或 6 秒没回应才拿缓存。
//      第一次打开时就预先缓存整本：在家打开过一次，到了首尔没网也能开。
//   2. 照片与 Google 字体：**缓存优先**，第一次看过（或背景预抓过）之后离线也看得到。
//      照片有两个图床（IMG_HOSTS）：Naver 的 search.pstatic.net（韩国手册照片以 Naver 为准，
//      这本 233 张里 213 张是它）与 Google 的 lh3.googleusercontent.com。
//      2026-11-22 之前只认 Google，到了韩国没网 Naver 照片会整片空白。
//      预抓失败只是少几张图，不会让安装失败。
//   3. 其他一律不插手（直接走网络、不缓存）：天气 open-meteo、航班状态等
//      实时数据，缓存了反而会把旧读数当成现在的——页面本身已处理抓不到的情况。
//
// 跨域与配额（2026-11-22 CI 实测）：Google 图床给跨域读取（Access-Control-Allow-Origin: *），
// Naver 的 search.pstatic.net 不给，只能存「不透明」响应。不透明响应有两个坑：
//   a. 看不到状态码——图床一时回 503 也会被当成一张图存进去，缓存优先＝那张坏图永远拿不掉。
//      所以只有「跨域那次连不上」才改走不透明；跨域那次拿到的是错误码，就照实回、不存。
//   b. 浏览器为了不泄露大小，按好几 MB 一张来计配额（Chrome 每张 0～14MB 随机）。
//      所以「给不给跨域」每个图床各记各的：Naver 不给，不能连累 Google 也改存不透明；
//      预抓时手机空间（配额）满了就停，不再用漫游流量下载存不进去的图。
//
// 改了 index.html 要把下面 VERSION 加一
// （tools/check-sw-version.py 会拦忘记升的情况）。升版会重新预缓存、重新补抓新照片。
// 自检：tools/check-trip-offline.mjs（断网后两个图床的照片都要显示得出来）。
const VERSION = 'seoul-v22';
const PAGES = VERSION + '-pages';
const IMGS = 'seoul-img';            // 照片缓存不跟版本走：升版不必把几百张图重抓一遍
const BOOKS = ['./index.html'];
const PRECACHE = ['./', ...BOOKS];
const NET_TIMEOUT = 6000;
const IMG_HOSTS = ['lh3.googleusercontent.com', 'search.pstatic.net'];

const scopeURL = new URL('./', self.location).href;
const isImg = u => IMG_HOSTS.includes(u.hostname);
const isFont = u => u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
// 手册 HTML 里的照片网址（两个图床都认）；属性里的 & 写成 &amp;，取出来要还原
const IMG_URL_RE = new RegExp('https://(?:' + IMG_HOSTS.map(h => h.replace(/\./g, '\\.')).join('|') +
  ')/[^"\'\\s)<>]+', 'g');

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
    await Promise.all(keys.filter(k => k.startsWith('seoul-') && k !== PAGES && k !== IMGS)
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
  // 在线打开了，就顺手把其余预缓存的页面也刷新（不阻塞这次打开）
  e.waitUntil(network.then(() => refreshOthers(key)).catch(() => {}));

  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(resolve, NET_TIMEOUT); });
  try {
    const res = await Promise.race([network, timeout.then(() => null)]);
    if (res) return res;
  } catch (err) { /* 没网：往下拿缓存 */ }
  finally { clearTimeout(timer); }

  const cached = await cache.match(key) ||
    // 打开的是文件夹本身（/seoul-trip/）→ index.html 的缓存
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
// 不给跨域读取的图床，记下来就直接存「不透明」响应、别再白试（每试一次就多下载一遍）。
// 每个图床各记各的；Naver 那个是 CI 实测出来的，先填上，省掉每次 SW 重启后的那一次白试。
const noCors = new Set(['search.pstatic.net']);
async function fetchImage(url) {
  const host = new URL(url).hostname;
  let corsFailed = false;
  if (!noCors.has(host)) {
    try {
      // 拿到回应就照实回，**错误码也一样**（503、404）：不能改走不透明硬存，那样坏图会被永久缓存
      return await fetch(url, { mode: 'cors', credentials: 'omit' });
    } catch (err) { corsFailed = true; }
  }
  const r = await fetch(url, { mode: 'no-cors', credentials: 'omit' });
  // 只有「跨域那次失败、不透明这次却拿到了」才算这个图床不给跨域读取；
  // 断网时两次都会失败（上面这行抛错），不能因此永久改存不透明响应——那种响应很占配额。
  if (corsFailed) noCors.add(host);
  return r;
}

const isQuotaError = err => !!err && /quota/i.test((err.name || '') + ' ' + (err.message || ''));

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

// ---- 背景预抓手册里的照片（页面载入后发 'warm' 过来）----
// 只补缓存里还没有的；同时清掉手册里已经不再用的旧图，缓存不会越积越大。
// 用户开了「省流量」就不预抓，滑到哪张存哪张。
// 抓的顺序：相册外的（封面）→ 每张卡的第 1 张 → 每张卡的第 2 张……
// 手机配额不够存完（见文件开头 b）时，至少每张卡都看得到头一张，而不是前面几张卡满、后面全空。
function imgUrls(s) {
  const out = [];
  for (const m of s.matchAll(IMG_URL_RE)) {
    // 统一成浏览器请求时的写法（缓存键就是它），删旧图时才比得准
    try { out.push(new URL(m[0].replace(/&amp;/g, '&')).href); } catch (err) { /* 坏网址跳过 */ }
  }
  return out;
}
function warmOrder(html) {
  const loose = [], gals = [];
  let last = 0;
  for (const m of html.matchAll(/<div class="gal">([\s\S]*?)<\/div>/g)) {
    loose.push(...imgUrls(html.slice(last, m.index)));
    gals.push(imgUrls(m[1]));
    last = m.index + m[0].length;
  }
  loose.push(...imgUrls(html.slice(last)));
  const order = loose;
  for (let k = 0; gals.some(g => k < g.length); k++) {
    for (const g of gals) if (k < g.length) order.push(g[k]);
  }
  return order;
}

let warming = null;
async function warmImages() {
  const pages = await caches.open(PAGES);
  const urls = new Set();
  for (const p of BOOKS) {
    const res = await pages.match(pageKey(p));
    if (!res) continue;
    for (const u of warmOrder(await res.text())) urls.add(u);
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
  let full = false;   // 配额满了：剩下的不抓了（抓了也存不进去，白用流量）
  const worker = async () => {
    while (!full && i < todo.length) {
      const url = todo[i++];
      let res;
      try { res = await fetchImage(url); } catch (err) { continue; }   // 抓不到这张就算了
      if (!res || !(res.ok || res.type === 'opaque')) continue;
      try { await cache.put(url, res); }
      catch (err) { if (isQuotaError(err)) full = true; }
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
