/**
 * 新加坡／雅加达两本手册「没网也打得开」的自检（sg-jkt-trip/sw.js）—— 真浏览器跑，Playwright。
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
 *   1. 在线只打开新加坡那本，等 SW 接管；
 *   2. 断网（context.setOffline）后重新载入新加坡、再打开**从没开过的**雅加达——
 *      两本都要出来（第一次就要把两本都预先缓存），主要内容（逐日 #day01、航班区块）在，
 *      没有 JS 错误；
 *   3. 照片：Google 照片用 route 换成一张假图（不打真网），在线时背景预抓过的，断网后
 *      要照样显示得出来；
 *   4. 天气／空气质量接口绝不能进缓存（读数会过期，缓存了反而误导）；
 *   5. 再恢复上网：页面要拿到**服务器上的新版**（网络优先——改了手册对方刷新就同步，
 *      这是本仓库的核心约定，SW 不能把它变成「永远看旧版」）。
 *
 * false-red 验证过（2026-11-04）：拿掉页面里 navigator.serviceWorker.register → 第 1、2 步红；
 * SW 断网不退回缓存 → 第 2 步红；照片不从缓存拿 → 离线照片那条红；页面改成缓存优先 → 第 5 步红。
 */
import { chromium } from 'playwright';

const PORT = process.env.CHECK_PORT || 8899;
const BASE = `http://localhost:${PORT}/sg-jkt-trip/`;
const SG = BASE + 'singapore.html';
const JKT = BASE + 'jakarta.html';

const fails = [];
const ok = [];
function check(cond, label) { (cond ? ok : fails).push(label); }

// 1×1 PNG：顶替 Google 照片，不打真网（CI 打得到、沙盒打不到，结果不能看机器）
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const context = await browser.newContext({ serviceWorkers: 'allow' });

// ⚠️ route 拦下的请求在 setOffline 之后照样会被 fulfill（不经过真网络），所以「断网」时
// 要自己让它失败，否则离线看照片那条永远是绿的（2026-11-04 false-red 时逮到）。
let offline = false;
await context.route('https://lh3.googleusercontent.com/**', r => {
  if (offline) return r.abort('internetdisconnected');
  return r.fulfill({ status: 200, contentType: 'image/png', body: PNG,
    headers: { 'access-control-allow-origin': '*' } });
});
// 天气／空气质量：给固定假数据，验它们不会被 SW 存进缓存
await context.route('https://api.open-meteo.com/**', r => r.fulfill({ json: { daily: { time: [] } } }));
await context.route('https://air-quality-api.open-meteo.com/**', r => r.fulfill({ json: {} }));
await context.route('https://api.data.gov.sg/**', r => r.fulfill({ json: { items: [] } }));
// 字体外链：沙盒打不到，别让它拖慢载入
await context.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await context.route('https://fonts.gstatic.com/**', r => r.abort());
// 航班实时状态（butler-bot /flight-status）：不打真接口，它有自己的自检 check-flight-live.mjs
await context.route('https://butler-bot.jarixhew.workers.dev/**', r => r.abort());

const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// ---- 1. 在线打开新加坡那本，等 SW 接管 ----
await page.goto(SG, { waitUntil: 'load' });
let controlled = false;
try {
  await page.waitForFunction(() => !!navigator.serviceWorker && !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  controlled = true;
} catch (e) { /* 下面断言会红 */ }
check(controlled, '[在线] 新加坡手册打开后 service worker 要接管页面（没接管＝根本没注册或注册失败）');

// 等预缓存与背景预抓照片做完：缓存里有两本手册、照片数稳定下来
const cacheState = () => page.evaluate(async () => {
  const out = { pages: [], imgs: 0, other: [] };
  for (const k of await caches.keys()) {
    const c = await caches.open(k);
    for (const r of await c.keys()) {
      if (/googleusercontent/.test(r.url)) out.imgs++;
      else if (/sg-jkt-trip\//.test(r.url)) out.pages.push(new URL(r.url).pathname.replace(/.*sg-jkt-trip\//, ''));
      else out.other.push(r.url);
    }
  }
  return out;
}).catch(() => ({ pages: [], imgs: 0, other: [] }));

const expectImgs = await page.evaluate(async () => {
  const set = new Set();
  for (const p of ['singapore.html', 'jakarta.html']) {
    const t = await (await fetch(p)).text();
    for (const m of t.matchAll(/https:\/\/lh3\.googleusercontent\.com\/[^"'\s)<>]+/g)) set.add(m[0]);
  }
  return set.size;
});
let st = await cacheState();
for (let i = 0; i < 60 && controlled && (st.imgs < expectImgs || !st.pages.includes('jakarta.html')); i++) {
  await page.waitForTimeout(500);
  st = await cacheState();
}
check(st.pages.includes('singapore.html') && st.pages.includes('jakarta.html'),
  `[在线] 第一次打开就要把两本手册都预先缓存（实得：${JSON.stringify(st.pages)}）`);
check(expectImgs > 100 && st.imgs === expectImgs,
  `[在线] 两本手册里的照片都要在背景预抓进缓存（页面共 ${expectImgs} 张，缓存 ${st.imgs} 张）`);

// ---- 2. 断网：两本都要打得开 ----
await context.setOffline(true);
offline = true;
const offlineLoad = async (url, label, dayIds) => {
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
    imgs: [...document.querySelectorAll('img[src*="googleusercontent"]')].length,
  }), dayIds);
  check(dom.days.every(Boolean), `[离线] ${label} 逐日行程 ${dayIds.join('/')} 都要在（实得 ${JSON.stringify(dom.days)}）`);
  check(dom.flights && dom.flightText > 200, `[离线] ${label} 航班区块要有内容（${dom.flightText} 字）`);
  // 滑到第一张照片，确认缓存里的图真的显示得出来（lazy 图要滚到才载）
  const imgOk = await page.evaluate(async () => {
    const img = document.querySelector('img[src*="googleusercontent"]');
    if (!img) return false;
    img.scrollIntoView();
    for (let i = 0; i < 40 && !(img.complete && img.naturalWidth > 0); i++) await new Promise(r => setTimeout(r, 100));
    return img.complete && img.naturalWidth > 0;
  });
  check(imgOk, `[离线] ${label} 预抓过的照片断网后要照样显示`);
};
errors.length = 0;
await offlineLoad(SG, '新加坡手册（重新载入）', ['day01', 'day02', 'day03', 'day04']);
await offlineLoad(JKT, '雅加达手册（在线时从没开过）', ['day01', 'day02', 'day03']);
await offlineLoad(BASE, '/sg-jkt-trip/ 旧链接（跳转页）', ['day01']);
check(errors.length === 0, `[离线] 不应有 JS 错误（实得：${errors.slice(0, 3).join(' | ')}）`);

// ---- 3. 实时数据绝不进缓存 ----
await context.setOffline(false);
offline = false;
const after = await cacheState();
const leaked = after.other.filter(u => /open-meteo|data\.gov\.sg/.test(u));
check(leaked.length === 0, `天气／空气质量接口不能进缓存（实得：${leaked.slice(0, 2).join(' | ')}）`);

// ---- 4. 恢复上网：要拿到服务器上的新版（网络优先，不是永远吃缓存）----
// 用 route 改写同一网址的回应，模拟「用户改了手册、已经上线」。每次载入换一个新记号：
// 网络优先 → 拿到的是**这一次**的记号；缓存优先（错的写法）→ 永远是上一次存进去的旧记号，
// 重试几次也一样红。重试只为吸收「刚恢复上网那一下 SW 还以为没网」或 check-all 并行时
// 机器太忙超过 6 秒——这两种都是 SW 刻意的退路，不是错。
let token = '';
await context.route(SG, async r => {
  try {
    const resp = await r.fetch();
    const body = (await resp.text()).replace('</body>', `<div id="__fresh_marker">${token}</div></body>`);
    await r.fulfill({ response: resp, body });
  } catch (e) { /* 收尾关浏览器时 SW 背景刷新还在途，忽略 */ }
});
let fresh = false, seen = '';
for (let i = 1; i <= 4 && !fresh; i++) {
  token = 'v' + i;
  await page.goto(SG, { waitUntil: 'load' });
  seen = await page.evaluate(() => document.getElementById('__fresh_marker')?.textContent || '(无)');
  fresh = seen === token;
  if (!fresh) await page.waitForTimeout(1500);
}
check(fresh, `[恢复上网] 重新载入要拿到服务器上的新版（网络优先），不能还是缓存里的旧版（最后一次拿到 ${seen}）`);
await context.unrouteAll({ behavior: 'ignoreErrors' });
await browser.close();

console.log(`通过 ${ok.length} 项`);
if (fails.length) {
  console.error(`\n未通过 ${fails.length} 项：`);
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('新加坡／雅加达手册离线自检全部通过');
