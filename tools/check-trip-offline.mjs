/**
 * 旅游手册「没网也打得开」的自检 —— 真浏览器跑，Playwright。
 * 守两份离线缓存：sg-jkt-trip/sw.js（新加坡＋雅加达两本）与 seoul-trip/sw.js（首尔）。
 *
 * 跑法：
 *   python3 -m http.server 8899 &
 *   node tools/check-trip-offline.mjs
 * 沙盒里要带 CHROMIUM_PATH=/opt/pw-browsers/chromium。
 * （`python3 tools/check-all.py` 会自动起 server 并带上 CHROMIUM_PATH。）
 *
 * 为什么要它（2026-11-04 建）：用户要的是「在飞机上、刚落地没漫游、信号差时手册照样能打开」。
 * 这种功能坏了**不会报任何错**——有网时页面一切正常，只有真的到了机上没网那一刻才发现
 * 打不开，而那时谁也修不了。所以只能在机器上把「没网」造出来验：
 *   1. 在线只打开一本，等 SW 接管；
 *   2. 断网（context.setOffline）后重新载入、再打开**从没开过的**另一本／文件夹网址——
 *      都要出来（第一次就要把整个文件夹的手册都预先缓存），主要内容（逐日、航班区块）在，
 *      没有 JS 错误；
 *   3. 照片：用 route 换成一张假图（不打真网），在线时背景预抓过的，断网后要照样显示得出来；
 *   4. 天气／空气质量／航班状态接口绝不能进缓存（读数会过期，缓存了反而误导）；
 *   5. 再恢复上网：页面要拿到**服务器上的新版**（网络优先——改了手册对方刷新就同步，
 *      这是本仓库的核心约定，SW 不能把它变成「永远看旧版」）。
 *
 * 首尔这本另外守（2026-11-22 加）：首尔的照片 213/233 张是 Naver 的 search.pstatic.net
 * 代理图，sw.js 原本只认 Google 图床，到了韩国没网照片会整片空白。CI 实测（同日）：
 * search.pstatic.net **不给跨域读取**（没有 Access-Control-Allow-Origin，Google 有），
 * 所以假图床照真的来——Naver 不带跨域头、Google 带——并验：
 *   - 两个图床的照片都要预抓进缓存、断网后都显示得出来；
 *   - Naver 只能存「不透明」响应，但**不能连累 Google 也改存不透明**
 *     （Chrome 把每个不透明响应按 0～14MB 随机计配额，实测 233 张全存要算 1.5GB）；
 *   - 图床一时回 503 不能被存进缓存（缓存优先＝坏图永远拿不掉）；
 *   - 手机配额不够时：先抓每张卡的第 1 张（每张卡至少有图），满了就停、不再白用漫游流量。
 *
 * 浏览器用「有硬盘的正式设定档」（launchPersistentContext）而不是无痕：无痕的照片缓存
 * 放在内存里，实测存到约 1GB（不透明照片约 137 张）就满，比手机正常浏览小得多，会冤枉 SW。
 * 配额用 CDP 钉死（主情境 4GB、配额情境 600MB），结果不随机器的硬盘大小变。
 *
 * false-red 验证过（2026-11-04）：拿掉页面里 navigator.serviceWorker.register → 第 1、2 步红；
 * SW 断网不退回缓存 → 第 2 步红；照片不从缓存拿 → 离线照片那条红；页面改成缓存优先 → 第 5 步红。
 * 首尔那段（2026-11-22）：用改之前的 seoul-trip/sw.js 跑 → Naver 照片预抓／离线显示、503 那几条红；
 * 照 sg-jkt 原样只把 Naver 加进图床（全站共用一个跨域旗标）→ Google 存成不透明那条红；
 * 去掉「配额满就停」→ 预抓次数那条红；预抓改回照页面顺序 → 「每张卡第 1 张」那条红。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = process.env.CHECK_PORT || 8899;
const ROOT = `http://localhost:${PORT}/`;
const ORIGIN = ROOT.replace(/\/$/, '');
const MB = 1024 * 1024;

const fails = [];
const ok = [];
function check(cond, label) { (cond ? ok : fails).push(label); }

// 1×1 PNG：顶替照片，不打真网（CI 打得到、沙盒打不到，结果不能看机器）
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const GOOGLE = { name: 'Google', host: 'lh3.googleusercontent.com', re: /https:\/\/lh3\.googleusercontent\.com\/[^"'\s)<>]+/g, cors: true };
// Naver 代理图床：2026-11-22 CI 实测不回 Access-Control-Allow-Origin（带不带 Origin 都没有），照真的来
const NAVER = { name: 'Naver', host: 'search.pstatic.net', re: /https:\/\/search\.pstatic\.net\/[^"'\s)<>]+/g, cors: false };

/**
 * 每本开一个独立的浏览器设定档（同源共用 CacheStorage，混在一起就数不清是谁存的），
 * 配额用 CDP 钉死。回传 { context, page, net, close }。
 */
async function bookContext(hosts, quotaMB) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trip-offline-'));
  const context = await chromium.launchPersistentContext(dir, {
    executablePath: process.env.CHROMIUM_PATH || undefined, serviceWorkers: 'allow',
  });
  const net = { offline: false, hits: 0, flaky: new Set() };
  // ⚠️ route 拦下的请求在 setOffline 之后照样会被 fulfill（不经过真网络），所以「断网」时
  // 要自己让它失败，否则离线看照片那条永远是绿的（2026-11-04 false-red 时逮到）。
  for (const h of hosts) {
    await context.route(`https://${h.host}/**`, r => {
      if (net.offline) return r.abort('internetdisconnected');
      net.hits++;
      // 不给跨域的图床：跨域模式的请求（带 Origin 头；<img> 与 no-cors 的 GET 不带）一律失败——
      // 在 JS 看来跨域被拒就是一个 TypeError。⚠️ 不能靠「fulfill 时不带 Access-Control-Allow-Origin」
      // 来模拟：Playwright 的 fulfill 会自动替跨域请求补上这个头，结果 Naver 照样跨域成功、
      // 整段等于没测（2026-11-22 false-red 时逮到：213 张全存成跨域响应）。
      if (!h.cors && r.request().headers()['origin']) return r.abort('failed');
      const headers = h.cors ? { 'access-control-allow-origin': '*' } : {};
      if (net.flaky.has(r.request().url())) return r.fulfill({ status: 503, contentType: 'text/plain', body: 'busy', headers });
      return r.fulfill({ status: 200, contentType: 'image/png', body: PNG, headers });
    });
  }
  // 天气／空气质量：给固定假数据，验它们不会被 SW 存进缓存
  await context.route('https://api.open-meteo.com/**', r => r.fulfill({ json: { daily: { time: [] } } }));
  await context.route('https://air-quality-api.open-meteo.com/**', r => r.fulfill({ json: {} }));
  await context.route('https://api.data.gov.sg/**', r => r.fulfill({ json: { items: [] } }));
  // 字体外链：沙盒打不到，别让它拖慢载入
  await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await context.route('https://fonts.gstatic.com/**', r => r.abort());
  // 航班实时状态（butler-bot /flight-status）：不打真接口，它有自己的自检 check-flight-live.mjs
  await context.route('https://butler-bot.jarixhew.workers.dev/**', r => r.abort());
  const page = context.pages()[0] || await context.newPage();
  let quotaSet = true;
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Storage.overrideQuotaForOrigin', { origin: ORIGIN, quotaSize: quotaMB * MB });
  } catch (e) { quotaSet = false; }
  const close = async () => {
    await context.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  };
  return { context, page, net, quotaSet, close };
}

async function waitControlled(page) {
  try {
    await page.waitForFunction(() => !!navigator.serviceWorker && !!navigator.serviceWorker.controller, null, { timeout: 15000 });
    return true;
  } catch (e) { return false; }
}

/** 缓存里现有什么：本文件夹的页面、各图床的照片张数（不透明几张）、其他。 */
function cacheState(page, folder, hosts) {
  return page.evaluate(async ({ folder, hosts }) => {
    const out = { pages: [], imgs: {}, opaque: {}, other: [], urls: [] };
    for (const h of hosts) { out.imgs[h] = 0; out.opaque[h] = 0; }
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      for (const r of await c.keys()) {
        const u = new URL(r.url);
        if (hosts.includes(u.hostname)) {
          out.imgs[u.hostname]++;
          out.urls.push(r.url);
          const res = await c.match(r);
          if (res && res.type === 'opaque') out.opaque[u.hostname]++;
        } else if (u.pathname.includes('/' + folder)) {
          out.pages.push(u.pathname.replace(new RegExp('.*' + folder), ''));
        } else out.other.push(r.url);
      }
    }
    return out;
  }, { folder, hosts: hosts.map(h => h.host) }).catch(() => ({ pages: [], imgs: {}, opaque: {}, other: [], urls: [] }));
}

/** 页面里各图床的照片网址各有几张（去重；&amp; 还原后才是浏览器真正请求的网址）。 */
async function expectedImgs(page, books, hosts) {
  return page.evaluate(async ({ books, hosts }) => {
    const sets = {};
    for (const h of hosts) sets[h.host] = new Set();
    for (const p of books) {
      const t = await (await fetch(p)).text();
      for (const h of hosts) {
        for (const m of t.matchAll(new RegExp(h.re, 'g'))) sets[h.host].add(m[0].replace(/&amp;/g, '&'));
      }
    }
    return Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.size]));
  }, { books, hosts: hosts.map(h => ({ host: h.host, re: h.re.source })) });
}

/** 每个相册（<div class="gal">）的第 1 张照片网址——从仓库里的档案直接读。 */
function firstPhotos(file) {
  const html = fs.readFileSync(file, 'utf8');
  return [...html.matchAll(/<div class="gal">([\s\S]*?)<\/div>/g)]
    .map(m => (m[1].match(/<img\b[^>]*\bsrc="(https:\/\/[^"]+)"/) || [])[1])
    .filter(Boolean)
    .map(u => new URL(u.replace(/&amp;/g, '&')).href);
}

async function offlineLoad(page, url, label, dayIds, hosts) {
  let res = null, err = '';
  try { res = await page.goto(url, { waitUntil: 'load', timeout: 20000 }); }
  catch (e) { err = e.message.split('\n')[0]; }
  check(!!res && res.ok(), `[离线] ${label} 要打得开（${err || (res ? 'HTTP ' + res.status() : '无响应')}）`);
  if (!res) return;
  check(res.fromServiceWorker(), `[离线] ${label} 应由 service worker 从缓存给出`);
  const dom = await page.evaluate(ids => ({
    days: ids.map(id => !!document.getElementById(id)),
    flights: !!document.querySelector('#flights'),
    flightText: (document.querySelector('#flights')?.textContent || '').length,
  }), dayIds);
  check(dom.days.every(Boolean), `[离线] ${label} 逐日行程 ${dayIds.join('/')} 都要在（实得 ${JSON.stringify(dom.days)}）`);
  check(dom.flights && dom.flightText > 200, `[离线] ${label} 航班区块要有内容（${dom.flightText} 字）`);
  // 每个图床各滑到第一张照片，确认缓存里的图真的显示得出来（lazy 图要滚到才载）
  for (const h of hosts) {
    const imgOk = await page.evaluate(async host => {
      const img = document.querySelector(`img[src^="https://${host}/"]`);
      if (!img) return null;
      img.scrollIntoView();
      for (let i = 0; i < 40 && !(img.complete && img.naturalWidth > 0); i++) await new Promise(r => setTimeout(r, 100));
      return img.complete && img.naturalWidth > 0;
    }, h.host);
    if (imgOk === null) continue;   // 这一页没有这个图床的照片（例如跳转页）
    check(imgOk, `[离线] ${label} 预抓过的 ${h.name} 照片（${h.host}）断网后要照样显示`);
  }
}

/**
 * 跑一本（一个文件夹）。spec：
 *   tag 讯息前缀；folder 'sg-jkt-trip/'；first 在线时打开的那页；books 要预缓存且照片要预抓的页面；
 *   offline [[页面, 说明, 逐日 id]]；fresh 验网络优先用的页面；hosts 图床；leak 不该进缓存的接口；
 *   flaky 拿哪个图床验「503 不进缓存」（不给就不验）
 */
async function checkBook(spec) {
  const T = s => `[${spec.tag}] ${s}`;
  const base = ROOT + spec.folder;
  const { context, page, net, quotaSet, close } = await bookContext(spec.hosts, 4096);
  check(quotaSet, T('这版 Chromium 要支持 CDP Storage.overrideQuotaForOrigin（配额钉不死，结果会随机器变）'));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // ---- 1. 在线打开一本，等 SW 接管 ----
  await page.goto(base + spec.first, { waitUntil: 'load' });
  const controlled = await waitControlled(page);
  check(controlled, T(`[在线] ${spec.first} 打开后 service worker 要接管页面（没接管＝根本没注册或注册失败）`));

  // 等预缓存与背景预抓照片做完：缓存里有全部手册、各图床的照片数稳定下来
  const expect = await expectedImgs(page, spec.books, spec.hosts);
  const total = Object.values(expect).reduce((a, b) => a + b, 0);
  const done = st => spec.books.every(b => st.pages.includes(b)) &&
    spec.hosts.every(h => (st.imgs[h.host] || 0) >= expect[h.host]);
  let st = await cacheState(page, spec.folder, spec.hosts);
  for (let i = 0; i < 60 && controlled && !done(st); i++) {
    await page.waitForTimeout(500);
    st = await cacheState(page, spec.folder, spec.hosts);
  }
  check(spec.books.every(b => st.pages.includes(b)),
    T(`[在线] 第一次打开就要把 ${spec.books.join('、')} 都预先缓存（实得：${JSON.stringify(st.pages)}）`));
  check(total > 100, T(`[在线] 页面里该有上百张照片（实得 ${JSON.stringify(expect)}）——抓不到就是这支自检的选择器过时了`));
  for (const h of spec.hosts) {
    check(expect[h.host] > 0 && st.imgs[h.host] === expect[h.host],
      T(`[在线] ${h.name} 照片（${h.host}）都要在背景预抓进缓存（页面 ${expect[h.host]} 张，缓存 ${st.imgs[h.host] || 0} 张）`));
    if (h.cors) {
      check(st.imgs[h.host] > 0 && st.opaque[h.host] === 0,
        T(`[在线] ${h.name} 给跨域读取，就要存成看得到状态码的正常响应、不能存成不透明响应（不透明 ${st.opaque[h.host]}/${st.imgs[h.host]} 张）`));
    }
  }

  if (spec.flaky) {
    // 图床一时回 503：不能退回「不透明」硬存进去——不透明响应看不到状态码，存进去就是一张
    // 永远拿不掉的坏图（照片缓存是缓存优先、又不跟版本走）。
    const flakyUrl = `https://${spec.flaky.host}/__check_flaky_503__`;
    net.flaky.add(flakyUrl);
    await page.evaluate(u => fetch(u, { mode: 'no-cors' }).catch(() => null), flakyUrl);
    await page.waitForTimeout(300);
    const cached = await page.evaluate(async u => {
      for (const k of await caches.keys()) if (await (await caches.open(k)).match(u)) return true;
      return false;
    }, flakyUrl);
    check(!cached, T(`${spec.flaky.name} 图床回 503 时，那张图不能被存进照片缓存（存了就永远是坏图）`));
  }

  // ---- 2. 断网：每一页都要打得开 ----
  await context.setOffline(true);
  net.offline = true;
  errors.length = 0;
  for (const [p, label, days] of spec.offline) {
    await offlineLoad(page, base + p, T(label), days, spec.hosts);
  }
  check(errors.length === 0, T(`[离线] 不应有 JS 错误（实得：${errors.slice(0, 3).join(' | ')}）`));

  // ---- 3. 实时数据绝不进缓存 ----
  await context.setOffline(false);
  net.offline = false;
  const after = await cacheState(page, spec.folder, spec.hosts);
  const leaked = after.other.filter(u => spec.leak.test(u));
  check(leaked.length === 0, T(`天气／空气质量／航班状态接口不能进缓存（实得：${leaked.slice(0, 2).join(' | ')}）`));

  // ---- 4. 恢复上网：要拿到服务器上的新版（网络优先，不是永远吃缓存）----
  // 用 route 改写同一网址的回应，模拟「用户改了手册、已经上线」。每次载入换一个新记号：
  // 网络优先 → 拿到的是**这一次**的记号；缓存优先（错的写法）→ 永远是上一次存进去的旧记号，
  // 重试几次也一样红。重试只为吸收「刚恢复上网那一下 SW 还以为没网」或 check-all 并行时
  // 机器太忙超过 6 秒——这两种都是 SW 刻意的退路，不是错。
  const FRESH = base + spec.fresh;
  let token = '';
  await context.route(FRESH, async r => {
    try {
      const resp = await r.fetch();
      const body = (await resp.text()).replace('</body>', `<div id="__fresh_marker">${token}</div></body>`);
      await r.fulfill({ response: resp, body });
    } catch (e) { /* 收尾关浏览器时 SW 背景刷新还在途，忽略 */ }
  });
  let fresh = false, seen = '';
  for (let i = 1; i <= 4 && !fresh; i++) {
    token = 'v' + i;
    await page.goto(FRESH, { waitUntil: 'load' });
    seen = await page.evaluate(() => document.getElementById('__fresh_marker')?.textContent || '(无)');
    fresh = seen === token;
    if (!fresh) await page.waitForTimeout(1500);
  }
  check(fresh, T(`[恢复上网] 重新载入要拿到服务器上的新版（网络优先），不能还是缓存里的旧版（最后一次拿到 ${seen}）`));
  await close();
}

/**
 * 手机配额不够存完全部照片（Naver 的不透明响应每张按好几 MB 计）：
 *   - 先抓每张卡的第 1 张——存不完时至少每张卡都有图，而不是前面几张卡满、后面全空；
 *   - 满了就停：不能把剩下的照片照样下载一遍再一张张存失败（在韩国用的是漫游流量）。
 * 配额钉成 600MB：够存手册本身＋每张卡头一张（约 55 张不透明，平均约 400MB），存不下全部。
 */
async function checkQuota(spec) {
  const T = s => `[${spec.tag}] ${s}`;
  const { page, net, quotaSet, close } = await bookContext(spec.hosts, 600);
  if (!quotaSet) {
    check(false, T('配额情境：这版 Chromium 不支持 CDP Storage.overrideQuotaForOrigin，这一段没验到'));
    await close();
    return;
  }
  await page.goto(ROOT + spec.folder + spec.first, { waitUntil: 'load' });
  await waitControlled(page);
  // 等预抓跑完：抓的次数 3 秒没再变就算停了
  let last = -1, stable = 0;
  for (let i = 0; i < 60 && stable < 6; i++) {
    await page.waitForTimeout(500);
    stable = net.hits === last ? stable + 1 : 0;
    last = net.hits;
  }
  const st = await cacheState(page, spec.folder, spec.hosts);
  const cachedImgs = Object.values(st.imgs).reduce((a, b) => a + b, 0);
  const firsts = firstPhotos(spec.folder + spec.first);
  const total = Object.values(await expectedImgs(page, spec.books, spec.hosts)).reduce((a, b) => a + b, 0);
  const have = new Set(st.urls);
  const missing = firsts.filter(u => !have.has(u));
  check(st.pages.includes(spec.first),
    T('配额 600MB 时手册本身仍要缓存得进去（这条红＝测试设的配额太小，不是 SW 的错）'));
  check(cachedImgs < total,
    T(`配额 600MB 本该存不下全部 ${total} 张照片（实存 ${cachedImgs} 张）——存得下的话这一段测不到「满了怎么办」`));
  check(firsts.length > 50 && missing.length === 0,
    T(`配额不够时要先抓每张卡的第 1 张：${firsts.length} 张卡里 ${missing.length} 张卡的头一张没存到`));
  check(net.hits - cachedImgs <= 10,
    T(`配额满了要停止预抓：去抓了 ${net.hits} 次、只存进 ${cachedImgs} 张（多抓的都是白用流量）`));
  await close();
}

await checkBook({
  tag: '新加坡／雅加达',
  folder: 'sg-jkt-trip/',
  first: 'singapore.html',
  books: ['singapore.html', 'jakarta.html'],
  offline: [
    ['singapore.html', '新加坡手册（重新载入）', ['day01', 'day02', 'day03', 'day04']],
    ['jakarta.html', '雅加达手册（在线时从没开过）', ['day01', 'day02', 'day03']],
    ['', '/sg-jkt-trip/ 旧链接（跳转页）', ['day01']],
  ],
  fresh: 'singapore.html',
  hosts: [GOOGLE],
  leak: /open-meteo|data\.gov\.sg|butler-bot/,
});

const SEOUL_DAYS = ['day00', 'day01', 'day02', 'day03', 'day04', 'day05', 'day06'];
const SEOUL = {
  tag: '首尔',
  folder: 'seoul-trip/',
  first: 'index.html',
  books: ['index.html'],
  offline: [
    ['index.html', '首尔手册（重新载入）', SEOUL_DAYS],
    ['', '/seoul-trip/ 文件夹网址（在线时没开过这个网址）', SEOUL_DAYS],
  ],
  fresh: 'index.html',
  hosts: [GOOGLE, NAVER],
  flaky: GOOGLE,
  leak: /open-meteo|butler-bot/,
};
await checkBook(SEOUL);
await checkQuota(SEOUL);

console.log(`通过 ${ok.length} 项`);
if (fails.length) {
  console.error(`\n未通过 ${fails.length} 项：`);
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('新加坡／雅加达／首尔手册离线自检全部通过');
