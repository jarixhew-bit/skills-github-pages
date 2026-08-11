/**
 * Google 地图照片抓取器 —— 每家店抓 N 张「不重复」照片。
 *
 * 背景（2026-08-11 建立）：旧版脚本读的是 Google 地图「搜索结果页」，
 * 那一页每家店通常只露 1~3 张缩图，抓不满就只能重复填。boss-dinner.html
 * 的 26 张卡片因此变成 130 个图位只有 71 张不同图，每张卡片都有重复。
 * 本脚本改成进入店铺的「照片图库」再抓，一家店能拿到几十张。
 *
 * 铁律：**宁可少给，绝不补重复**。抓不满就如实回报数量，由人决定怎么办。
 *
 * 用法（只能在 GitHub Actions 上跑，沙盒连不上 Google）：
 *   QUERIES="链接或店名|链接或店名" WANT=5 node tools/fetch-photos.mjs
 *
 * 输出：每家店一行 `RESULT {json}`，字段 query/ok/count/method/urls/title/rating。
 * 末尾一行 `SUMMARY {json}` 汇总，方便一眼看出哪几家没抓满。
 */
import { chromium } from 'playwright';

const WANT = parseInt(process.env.WANT || '5', 10);
const PHOTO_HOST = 'googleusercontent.com';

/** 判断一个 img src 是不是 Google 地图的地点照片（排除头像、图标、地图瓦片）。 */
function isPlacePhoto(src) {
  if (!src || !src.includes(PHOTO_HOST)) return false;
  if (!/gps-cs-s|gps-proxy|\/places\/|\/p\/|place-photos/.test(src)) return false;
  // 用户头像走 /a/ 或 /a-/ 路径，尺寸也小，排除掉
  if (/\/a[-/]/.test(src)) return false;
  return true;
}

/**
 * 照片同一张但尺寸不同时 URL 会不一样（=w203-h152 vs =s4800）。
 * 去重必须按「= 之前的部分」比对，否则同一张照片会被当成两张，
 * 又变回重复图——这正是本脚本要消灭的问题。
 */
function photoKey(src) {
  return src.split('=')[0];
}

/** 统一放大成手册用的尺寸。 */
function normalize(src) {
  return photoKey(src) + '=s4800-w800-h600';
}

/** 从当前页面 DOM 收集地点照片。 */
async function collectFromDom(page) {
  const urls = await page.$$eval('img', imgs => imgs.map(i => i.src));
  return urls.filter(isPlacePhoto);
}

/** 把已收集的 URL 合并进 map（按 photoKey 去重，保留首见者）。 */
function merge(map, urls) {
  for (const u of urls) {
    const k = photoKey(u);
    if (!map.has(k)) map.set(k, normalize(u));
  }
}

/** 尝试打开店铺的照片图库。回传是否成功打开。 */
async function openGallery(page) {
  // 依次尝试多种入口：Google 会改版，单一选择器一定会有失效的一天。
  const candidates = [
    'button[jsaction*="heroHeaderImage"]',
    'button[aria-label*="Photo of"]',
    'button[aria-label*="照片"]',
    'button[aria-label*="写真"]',
    'button[aria-label*="Photos"]',
  ];
  for (const sel of candidates) {
    const el = await page.$(sel);
    if (!el) continue;
    try {
      await el.click({ timeout: 5000 });
      await page.waitForTimeout(2500);
      // 图库打开的判据：页面上地点照片数量明显变多
      const n = (await collectFromDom(page)).length;
      if (n > 3) return sel;
    } catch (e) {
      /* 换下一个入口 */
    }
  }
  return null;
}

/** 在图库里滚动，触发懒加载，边滚边收。 */
async function scrollGallery(page, collected, want) {
  for (let i = 0; i < 8 && collected.size < want * 2; i++) {
    merge(collected, await collectFromDom(page));
    if (collected.size >= want * 2) break;
    await page.evaluate(() => {
      // 图库是一个可滚动容器，找出页面上最高的那个来滚
      const nodes = Array.from(document.querySelectorAll('div'));
      let best = null;
      for (const n of nodes) {
        if (n.scrollHeight > n.clientHeight + 200 && n.clientHeight > 300) {
          if (!best || n.scrollHeight > best.scrollHeight) best = n;
        }
      }
      (best || document.scrollingElement).scrollBy(0, 1200);
    });
    await page.waitForTimeout(1200);
  }
  merge(collected, await collectFromDom(page));
}

/**
 * 兜底：从页面源码里正则捞照片 URL。
 * 图库点不开时用（Google 改版会让选择器失效，但初始数据 blob 一直都在）。
 * 缺点是可能混进「附近类似店家」的照片，所以只在 DOM 抓不满时才用，
 * 并在回报里标明 method，方便人工抽查。
 */
async function collectFromSource(page) {
  const html = await page.content();
  const re = /https:\/\/lh\d\.googleusercontent\.com\/[A-Za-z0-9_\-/]+(?:=[A-Za-z0-9\-]+)?/g;
  return (html.match(re) || []).filter(isPlacePhoto);
}

async function handleConsent(page) {
  // 欧盟节点会先跳同意页，点掉才能看到地图
  for (const sel of ['button[aria-label*="Accept all"]', 'button:has-text("Accept all")', 'form[action*="consent"] button']) {
    const el = await page.$(sel).catch(() => null);
    if (el) {
      await el.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000);
      return true;
    }
  }
  return false;
}

async function fetchOne(ctx, query) {
  const page = await ctx.newPage();
  const out = { query, ok: false, count: 0, method: 'none', urls: [], title: '', rating: '' };
  try {
    const url = /^https?:\/\//.test(query)
      ? query
      : 'https://www.google.com/maps/search/' + encodeURIComponent(query) + '?hl=en';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    await handleConsent(page);

    // 搜索式查询可能停在结果列表，点进第一个结果才是店铺页
    if (page.url().includes('/maps/search/')) {
      const first = await page.$('a[href*="/maps/place/"]');
      if (first) {
        await first.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(4000);
      }
    }

    out.title = await page.title();
    out.rating = await page.evaluate(() => {
      const el = document.querySelector('div.F7nice');
      if (el) return el.innerText.replace(/\n/g, ' ').trim();
      const m = document.body.innerText.match(/([0-9]\.[0-9])\s*\n?\s*\(([0-9,]+)\)/);
      return m ? m[1] + ' (' + m[2] + ')' : 'NOT_FOUND';
    });

    const collected = new Map();
    merge(collected, await collectFromDom(page));

    const entry = await openGallery(page);
    if (entry) {
      out.method = 'gallery';
      await scrollGallery(page, collected, WANT);
    } else {
      out.method = 'placepage';
    }

    if (collected.size < WANT) {
      merge(collected, await collectFromSource(page));
      out.method += '+source';
    }

    out.urls = [...collected.values()].slice(0, Math.max(WANT, 8));
    out.count = out.urls.length;
    out.ok = out.count >= WANT;
  } catch (e) {
    out.error = e.message;
  }
  await page.close().catch(() => {});
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

  const short = results.filter(r => !r.ok);
  console.log(
    'SUMMARY ' +
      JSON.stringify({
        total: results.length,
        ok: results.length - short.length,
        short: short.map(r => ({ query: r.query, count: r.count, error: r.error })),
      })
  );
  // 抓不满不算失败——如实回报即可，由人决定怎么处理
})();
