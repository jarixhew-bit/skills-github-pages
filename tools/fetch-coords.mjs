/**
 * Google 地图坐标抓取器 —— 给一串 cid（或地图链接），逐个打开地点页读经纬度。
 *
 * 背景（2026-09-30 建立）：槟城手册要做「总地图」试装版，20 张卡片只有
 * `maps.google.com/?cid=数字` 链接、没有坐标。沙盒连不上 Google，只能在 CI 跑。
 *
 * 铁律：**读不到就写 null 并注明原因，绝不猜坐标**。放错位置的图钉比没有图钉更糟
 * （家人会照着导航跑错地方）。
 *
 * 读坐标的优先序（source 字段会写明用了哪一种）：
 *   1. url-3d4d ：最终网址里的 `!3d纬度!4d经度`——这是地点图钉本身的位置，最准
 *   2. url-at   ：最终网址里的 `@纬度,经度`——这是地图视野中心，打开地点页时通常就对准图钉
 *   3. meta     ：页面 <meta> 里静态地图图片的 center=纬度,经度（网址没跳转时的后备）
 *
 * 用法（只能在 GitHub Actions 上跑）：
 *   QUERIES="cid或链接|cid或链接" COORDS_OUT=penang-trip/coords.json node tools/fetch-coords.mjs
 *
 * 输出：每个点一行 `RESULT {json}`；全部结果以 JSON 数组写进 COORDS_OUT
 * （`[{cid, query, lat, lng, source, title, reason}]`）。
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const OUT = process.env.COORDS_OUT || 'coords.json';

/** 把输入统一成可打开的网址，并抽出 cid（有的话）。 */
function normalizeQuery(q) {
  const s = q.trim();
  if (/^\d+$/.test(s)) return { cid: s, url: 'https://maps.google.com/?cid=' + s + '&hl=en' };
  const m = s.match(/[?&]cid=(\d+)/);
  const url = /^https?:\/\//.test(s) ? s + (s.includes('?') ? '&' : '?') + 'hl=en' : null;
  return { cid: m ? m[1] : null, url };
}

function num(x) {
  const v = parseFloat(x);
  return Number.isFinite(v) ? v : null;
}

/** 从网址里读坐标。回传 {lat,lng,source} 或 null。 */
export function parseUrl(u) {
  const d = decodeURIComponent(u || '');
  // 同一网址里可能有多组 !3d!4d（附近地点），地点本身那组在最后
  const all = [...d.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)];
  if (all.length) {
    const last = all[all.length - 1];
    return { lat: num(last[1]), lng: num(last[2]), source: 'url-3d4d' };
  }
  const at = d.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: num(at[1]), lng: num(at[2]), source: 'url-at' };
  return null;
}

async function handleConsent(page) {
  for (const sel of ['button[aria-label*="Accept all"]', 'button:has-text("Accept all")', 'form[action*="consent"] button']) {
    const el = await page.$(sel).catch(() => null);
    if (el) {
      await el.click({ timeout: 5000 }).catch(() => {});
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      return true;
    }
  }
  return false;
}

async function fetchOne(ctx, query) {
  const { cid, url } = normalizeQuery(query);
  const out = { cid, query, lat: null, lng: null, source: null, title: '', reason: '' };
  if (!url) { out.reason = '输入既不是 cid 也不是网址'; return out; }
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await handleConsent(page);
    // 地点页是前端路由，网址会在脚本跑起来后才换成 /maps/place/...!3d!4d。
    // 等条件而不是写死秒数：等到网址里出现坐标，最多 30 秒。
    await page.waitForFunction(
      () => /!3d-?\d+\.\d+!4d-?\d+\.\d+|@-?\d+\.\d+,-?\d+\.\d+/.test(decodeURIComponent(location.href)),
      null, { timeout: 30000 }
    ).catch(() => {});
    // !3d!4d 常比 @ 晚一步出现，再给它一点机会（同样是等条件）
    await page.waitForFunction(
      () => /!3d-?\d+\.\d+!4d/.test(decodeURIComponent(location.href)),
      null, { timeout: 8000 }
    ).catch(() => {});
    out.title = (await page.title()).slice(0, 120);
    out.finalUrl = page.url().slice(0, 300);
    let got = parseUrl(page.url());
    if (!got) {
      const meta = await page.evaluate(() =>
        [...document.querySelectorAll('meta')].map(m => m.getAttribute('content') || '').join(' ')
      );
      const m = decodeURIComponent(meta).match(/center=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (m) got = { lat: num(m[1]), lng: num(m[2]), source: 'meta' };
    }
    if (got && got.lat !== null && got.lng !== null) {
      Object.assign(out, got);
    } else {
      out.reason = '网址与页面 meta 里都没读到坐标（可能停在同意页或搜索页）';
    }
  } catch (e) {
    out.reason = '打开失败：' + String(e.message || e).slice(0, 120);
  } finally {
    await page.close().catch(() => {});
  }
  return out;
}

(async () => {
  const queries = (process.env.QUERIES || '').split('|').map(s => s.trim()).filter(Boolean);
  if (!queries.length) {
    console.log('没有查询目标，QUERIES 是空的');
    process.exit(1);
  }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    locale: 'en-US',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    viewport: { width: 1400, height: 1000 },
  });
  const results = [];
  for (const q of queries) {
    const r = await fetchOne(ctx, q);
    results.push(r);
    console.log('RESULT ' + JSON.stringify(r));
  }
  await browser.close();
  const ok = results.filter(r => r.lat !== null);
  // 一个都没读到＝整轮没跑起来（被挡、改版），不写文件，让 workflow 那边的空档保护接住
  if (ok.length) writeFileSync(OUT, JSON.stringify(results, null, 2) + '\n');
  console.log('SUMMARY ' + JSON.stringify({
    total: results.length, ok: ok.length,
    missing: results.filter(r => r.lat === null).map(r => ({ query: r.query, reason: r.reason })),
  }));
})();
