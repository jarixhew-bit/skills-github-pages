/**
 * 高德地图照片抓取器 —— 从高德的店铺页抓照片，给手册卡片用。
 *
 * 背景（2026-08-22 建立）：中国大陆的中小餐厅在 Google 地图上常常一张照片都没有
 * （第稻客家菜馆换过四组关键字，抓回来的全是别家同名店），但在高德上图很齐。
 * 用户的原话是「不必一定要 Google 吧 灵活一点」——所以补这条通道。
 *
 * 与 fetch-photos.mjs 的分工：Google 那套照旧（境外地点、连锁品牌抓得到），
 * 这一套专门收拾「Google 没有、高德有」的大陆店家。输出格式刻意保持一致，
 * 好让插图的脚本两边通吃。
 *
 * ⚠ **实测结论（2026-08-22，两次 CI 试跑）：这条通道目前抓不到照片。**
 * 高德手机版与桌面版的店铺页上都没有照片元素，照片只走它 App 端的接口；
 * 拦截网络回应也只捞到界面图与用户头像。第一版还因为把 img.alicdn.com
 * 放进白名单而「假成功」——回报抓满 5 张，全是 48x48 图标。
 * 过滤已收紧成只认 aos-comment / store.is.autonavi 两个真照片域名，
 * 所以现在它会诚实地回报 0 张。**除非有新思路（例如找到公开的照片接口），
 * 不要再拿这条通道烧 CI**；大陆店家 Google 又没图时，直接向用户要图更快。
 *
 * 铁律沿用：**宁可少给，绝不补重复**。抓不满就如实回报数量。
 *
 * 用法（只能在 GitHub Actions 上跑，沙盒连不上高德）：
 *   QUERIES="高德短链或店名|..." WANT=5 node tools/fetch-photos-amap.mjs
 *
 * 输出：每家店一行 `RESULT {json}`，字段 query/ok/count/method/urls/title；
 * 末尾一行 `SUMMARY {json}`。
 */
import { chromium, devices } from 'playwright';

const WANT = parseInt(process.env.WANT || '5', 10);

/** 高德的照片走这几个 CDN；其余（图标、地图瓦片、头像）一律不要。 */
function isPlacePhoto(src) {
  if (!src) return false;
  // img.alicdn.com 是阿里的**界面** CDN（按钮、二维码、48x48 图标），一张店家照片都没有。
  // 第一版把它放进白名单，结果三家店都「抓满 5 张」，全是图标——**假成功比失败更糟**，
  // 所以这里只认高德真正放照片的两个域名（2026-08-22 踩过）。
  if (!/(aos-comment\.amap\.com|store\.is\.autonavi\.com)/.test(src)) return false;
  if (/\/avatar|head_img|icon|logo|qrcode/i.test(src)) return false;
  if (/tps-\d{1,3}-\d{1,3}\./.test(src)) return false;  // tps-48-48 这种尺寸标记 = 图标
  return true;
}

/**
 * 同一张照片会带不同的裁切参数（?x-oss-process=... / _w200_h150）。
 * 去重必须按「参数之前的部分」比对，否则同一张会被当成两张，
 * 又变回重复图——这正是 Google 那套踩过的坑，别在这里重演。
 */
function photoKey(src) {
  return src.split('?')[0].replace(/_\d+x\d+\.(jpg|jpeg|png|webp)$/i, '');
}

/** 拿原图：去掉裁切参数，高德会回原尺寸。 */
function normalize(src) {
  return src.split('?')[0];
}

/**
 * 高德手机版把照片放在 API 回应里，**DOM 上一张都没有**（2026-08-22 第一次试跑：
 * 三家店 diag 全是 ssr-next.amap.com 的界面图，照片零张）。所以真正管用的是
 * 拦截网络回应、从 JSON 里正则捞照片网址。DOM 那条留着当补充。
 */
function harvestFromText(text, sink) {
  const clean = text.replace(/\\\//g, '/').replace(/\\u002F/gi, '/');
  const re = /https?:\/\/[A-Za-z0-9._-]*(?:aos-comment\.amap\.com|store\.is\.autonavi\.com)\/[A-Za-z0-9._~%!$&'()*+,;=:@/-]+/g;
  for (const m of clean.match(re) || []) sink.push(m);
}

function watchResponses(page, sink) {
  page.on('response', async res => {
    try {
      const ct = (res.headers()['content-type'] || '');
      if (!/json|javascript|text/.test(ct)) return;
      const body = await res.text();
      if (body.length > 4_000_000) return;
      harvestFromText(body, sink);
    } catch (e) { /* 回应读不到就算了 */ }
  });
}

async function collect(page) {
  const urls = await page.$$eval('img', imgs =>
    imgs.map(i => i.currentSrc || i.src).filter(Boolean));
  const bg = await page.$$eval('*', els =>
    els.slice(0, 3000)
      .map(e => (getComputedStyle(e).backgroundImage || '').match(/url\("?([^")]+)"?\)/))
      .filter(Boolean).map(m => m[1]));
  return [...urls, ...bg].filter(isPlacePhoto);
}

function merge(map, urls) {
  for (const u of urls) {
    const k = photoKey(u);
    if (!map.has(k)) map.set(k, normalize(u));
  }
}

async function fetchOne(ctx, query) {
  const page = await ctx.newPage();
  const out = { query, ok: false, count: 0, method: 'none', urls: [], title: '' };
  const fromNetwork = [];
  watchResponses(page, fromNetwork);
  try {
    const url = /^https?:\/\//.test(query)
      ? query
      : 'https://www.amap.com/search?query=' + encodeURIComponent(query);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);
    out.title = (await page.title()).slice(0, 80);
    out.landed = page.url().slice(0, 120);

    const collected = new Map();
    merge(collected, fromNetwork);
    merge(collected, await collect(page));
    out.method = fromNetwork.length ? 'network' : 'placepage';

    // 页面往下滚，把懒加载的相册与点评图都带出来
    for (let i = 0; i < 10 && collected.size < WANT * 2; i++) {
      await page.evaluate(() => window.scrollBy(0, 900));
      await page.waitForTimeout(1200);
      merge(collected, fromNetwork);
      merge(collected, await collect(page));
    }

    // 有相册入口就点进去再收一轮
    for (const sel of ['[class*="photo"] img', '[class*="album"]', 'text=全部照片', 'text=图片']) {
      const el = await page.$(sel).catch(() => null);
      if (!el) continue;
      await el.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(2500);
      const before = collected.size;
      merge(collected, await collect(page));
      if (collected.size > before) { out.method = 'gallery'; break; }
    }

    // 手机版还抓不满时，用落地网址里的 POI id 再开一次桌面版店铺页
    const poi = (out.landed.match(/__p=([A-Z0-9]+)/) || [])[1];
    if (collected.size < WANT && poi) {
      const p2 = await page.context().newPage();
      const sink2 = [];
      watchResponses(p2, sink2);
      try {
        await p2.goto('https://www.amap.com/place/' + poi, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await p2.waitForTimeout(8000);
        for (let i = 0; i < 5; i++) { await p2.evaluate(() => window.scrollBy(0, 800)); await p2.waitForTimeout(1200); }
        merge(collected, sink2);
        merge(collected, await collect(p2));
        if (collected.size > 0) out.method += '+desktop';
      } catch (e) { /* 桌面版打不开就算了 */ } finally { await p2.close().catch(() => {}); }
    }

    out.urls = [...collected.values()].slice(0, WANT);
    out.count = out.urls.length;
    out.ok = out.count >= WANT;
    if (!out.ok) {
      // 抓不满时报出页面上到底有多少张图、都在哪个域名，免得靠猜再烧一轮 CI
      out.diag = await page.$$eval('img', imgs => {
        const hosts = {};
        for (const i of imgs) {
          const s = i.currentSrc || i.src || '';
          if (!s.startsWith('http')) continue;
          const h = new URL(s).host;
          hosts[h] = (hosts[h] || 0) + 1;
        }
        return hosts;
      }).catch(() => ({}));
    }
  } catch (e) {
    out.error = String(e).slice(0, 200);
  } finally {
    await page.close().catch(() => {});
  }
  return out;
}

const queries = (process.env.QUERIES || '').split('|').map(s => s.trim()).filter(Boolean);
if (!queries.length) {
  console.error('QUERIES 是空的');
  process.exit(1);
}

const browser = await chromium.launch();
// 用手机版：高德的 wap 页把照片直接铺在页面上，桌面版藏在 canvas 地图后面
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'zh-CN' });
const results = [];
for (const q of queries) {
  const r = await fetchOne(ctx, q);
  results.push(r);
  console.log('RESULT ' + JSON.stringify(r));
}
await browser.close();
console.log('SUMMARY ' + JSON.stringify({
  total: results.length,
  ok: results.filter(r => r.ok).length,
  short: results.filter(r => !r.ok).map(r => ({ query: r.query, count: r.count })),
}));
