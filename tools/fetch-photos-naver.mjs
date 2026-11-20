/**
 * Naver 地图抓取器 —— 韩国手册用：照片、营业时间、营业状态、菜单从 Naver 拿。
 *
 * 背景（2026-11-20 建立）：用户拍板韩国行程「评分看 Google，其他——营业时间、
 * 营业状态、照片、菜单——看 Naver」。韩国的店家资料在 Naver 上远比 Google 齐。
 * 可行性实测（CI，naver-probe 分支）的结论：
 *   - map.naver.com 的 allSearch 接口与照片页滚动加载的 graphql 会触发验证码；
 *   - m.place.naver.com/place/list、m.search.naver.com 纯 HTTP 拿得到 place id；
 *   - 店家首页 HTML 里的 __APOLLO_STATE__ 有名称／地址／营业时间／菜单／评分／首屏照片；
 *   - 照片页首屏（SSR）有十来张；search.pstatic.net 代理图能直接 <img>。
 * 所以这里：id 与首页资料走纯 HTTP，照片页才开浏览器，而且**节奏放慢**
 * （每家间隔随机 3–6 秒），遇到验证码就记 captcha:true 换下一家，**绝不重试死循环**。
 *
 * 解析全在 tools/lib/naver-parse.mjs（纯函数，tools/check-naver-parse.mjs 离线验）。
 *
 * 与另外两条通道的分工：Google（fetch-photos.mjs）给评分门槛与境外地点；
 * 高德（fetch-photos-amap.mjs）实测抓不到图；这一条只给韩国。输出格式跟它们一致
 * （每家一行 `RESULT {json}`，末尾 `SUMMARY {json}`），多出 Naver 专有字段。
 *
 * 用法（只能在 GitHub Actions 上跑，沙盒连不上 naver）：
 *   QUERIES="명동교자 본점|https://map.naver.com/p/entry/place/11592650" WANT=5 node tools/fetch-photos-naver.mjs
 *
 * RESULT 字段：query、ok、captcha、naver_id、naver_url、place_title、address、
 * business_status（营业中／休业／歇业／unknown）、now_status、hours[]、closed_days、
 * menu[{name,price}]、naver_rating、naver_reviews、urls[]、photo_src[]（每张 owner/visitor）、
 * photo_cat[]、count、method、search_candidates（搜名称时的前几个候选，核对用）。
 * captcha＝整页被验证码挡（这家资料不全，换下一家）；gql_captcha＝照片页滚动加载的 graphql
 * 被挡（2026-11-20 实测几乎每家都会，属常态：照片只拿得到服务端渲染的那一批）。
 * **名称要人工核对**：搜「짱게임 종로」会落到「짱오락실 종로점」，place_title 与 query 不像时要看一眼。
 */
import { pathToFileURL } from 'node:url';
import {
  isCaptcha, placeIdFromUrl, naverPlaceUrl, parseSearchIds, extractApolloState,
  parseHome, parsePhotoState, unwrapPstatic, selectPhotos, harvestPhotoUrls, labelByFilter, photoCandsFromState, photoSource,
} from './lib/naver-parse.mjs';

const WANT = parseInt(process.env.WANT || '5', 10);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// 搜索中心点：首尔市厅。只影响排序，不影响能不能搜到。
const X = process.env.NAVER_X || '126.9784';
const Y = process.env.NAVER_Y || '37.5666';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = (lo, hi) => sleep(lo + Math.random() * (hi - lo));

async function get(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', Referer: 'https://m.place.naver.com/' },
      redirect: 'follow',
    });
    const body = await r.text();
    return { status: r.status, body, url: r.url };
  } catch (e) {
    return { status: 0, body: '', url, error: String(e).slice(0, 120) };
  }
}

async function resolveId(q, out) {
  let id = placeIdFromUrl(q);
  if (id) { out.method = 'url'; return id; }
  if (/^https?:\/\/naver\.me\//.test(q)) {
    const r = await get(q);
    id = placeIdFromUrl(r.url) || placeIdFromUrl(r.body.slice(0, 5000));
    if (id) { out.method = 'shortlink'; return id; }
  }
  if (/^https?:\/\//.test(q)) return '';
  const tries = [
    ['list', `https://m.place.naver.com/place/list?query=${encodeURIComponent(q)}&x=${X}&y=${Y}`],
    ['msearch', `https://m.search.naver.com/search.naver?query=${encodeURIComponent(q)}`],
  ];
  for (const [name, url] of tries) {
    const r = await get(url);
    if (isCaptcha(r.body)) { out.captcha = true; out.captcha_at = (out.captcha_at || []).concat(name); continue; }
    const ids = parseSearchIds(r.body);
    if (ids.length) {
      out.method = name;
      out.search_candidates = ids.slice(0, 3);
      return ids[0].id;
    }
    await jitter(1000, 2000);
  }
  return '';
}

async function fetchHome(id, out) {
  for (const kind of ['restaurant', 'place']) {
    const r = await get(`https://m.place.naver.com/${kind}/${id}/home`);
    if (isCaptcha(r.body)) { out.captcha = true; out.captcha_at = (out.captcha_at || []).concat('home'); return null; }
    const st = extractApolloState(r.body);
    const parsed = st && parseHome(st);
    if (parsed) return { kind, parsed };
    await jitter(1000, 2000);
  }
  return null;
}

/** 照片页 DOM 里现有的 pstatic 图（原图网址或代理网址都收，交给 selectPhotos 还原）。 */
async function domImgs(page) {
  return page.$$eval('img', els => els
    .map(e => e.currentSrc || e.src || e.getAttribute('data-src') || '')
    .filter(s => /pstatic\.net/.test(s))).catch(() => []);
}

const TAB_RE = /^(내부|음식·음료|음식|음료|외부|메뉴|업체|방문자|풍경|객실|시설)\s*\d*$/;

async function fetchPhotos(ctx, kind, id, out) {
  const page = await ctx.newPage();
  const cands = [];
  const diag = { tabs: [], per_tab: {}, apollo_keys: [] };
  page.on('response', async r => {
    if (!/graphql/.test(r.url())) return;
    if (r.status() === 405 || r.status() === 403) { out.gql_captcha = true; diag.gql_blocked = (diag.gql_blocked || 0) + 1; return; }
    try { if (isCaptcha(await r.text())) { out.gql_captcha = true; diag.gql_blocked = (diag.gql_blocked || 0) + 1; } } catch { /* 读不到就算了 */ }
  });
  try {
    await page.goto(`https://m.place.naver.com/${kind}/${id}/photo`, { waitUntil: 'networkidle', timeout: 45000 })
      .catch(e => { diag.goto = String(e).slice(0, 100); });
    if (isCaptcha(await page.content().catch(() => ''))) {
      out.captcha = true; out.captcha_at = (out.captcha_at || []).concat('photo');
      return { cands, diag };
    }
    for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, 1800); await sleep(1200); }
    for (const u of await domImgs(page)) cands.push({ url: u, category: '' });
    const st0 = await page.evaluate(() => window.__APOLLO_STATE__ || null).catch(() => null);
    if (st0) {
      diag.apollo_keys = Object.keys(st0.ROOT_QUERY || {}).filter(k => /photo/i.test(k)).map(k => k.slice(0, 160));
      cands.push(...parsePhotoState(st0));
    }
    diag.all = cands.length;

    const labels = await page.$$eval('a, button, span, [role=tab]', els =>
      [...new Set(els.map(e => (e.textContent || '').trim()).filter(t => t && t.length <= 12))]).catch(() => []);
    diag.tabs = labels.filter(t => TAB_RE.test(t)).map(t => t.replace(/\s*\d+$/, ''));
    const st1 = await page.evaluate(() => window.__APOLLO_STATE__ || null).catch(() => null);
    if (st1) cands.push(...parsePhotoState(st1));
  } catch (e) {
    diag.error = String(e).slice(0, 160);
  } finally {
    await page.close().catch(() => {});
  }
  // 分类页走纯 HTTP：?filterType=분류 的照片页服务端直接渲染（第二轮实跑：无头浏览器里
  // 页签点不动、滚动加载的 graphql 被验证码挡）。메뉴 也抓——是为了知道哪些要排除。
  const base = [...new Set(cands.map(c => c.url))];
  const perFilter = {};
  const typedCands = [];
  const filters = [...new Set([...(diag.tabs || []), '음식·음료', '내부', '메뉴'])].filter(f => !/업체|방문자/.test(f));
  const r0 = await get(`https://m.place.naver.com/${kind}/${id}/photo`);
  if (isCaptcha(r0.body)) { out.captcha = true; out.captcha_at = (out.captcha_at || []).concat('photo-http'); }
  else {
    // 先按物件类型分好类（菜品图＝메뉴、要排除），剩下 apollo 之外零散的网址才当「没分类」
    const st = extractApolloState(r0.body);
    const typed = st ? photoCandsFromState(st) : [];
    typedCands.push(...typed);
    const typedKeys = new Set(typed.map(c => unwrapPstatic(c.url).split('?')[0]));
    base.push(...harvestPhotoUrls(r0.body).filter(u => !typedKeys.has(u.split('?')[0])));
    if (st) {
      const types = {};
      for (const [k, v] of Object.entries(st)) { const t = (v && v.__typename) || k.split(':')[0]; types[t] = (types[t] || 0) + 1; }
      diag.photo_types = types;
    }
  }
  for (const f of filters.slice(0, 5)) {
    if (out.captcha_at && out.captcha_at.includes('photo-http')) break;
    await jitter(1000, 2000);
    const r = await get(`https://m.place.naver.com/${kind}/${id}/photo?filterType=${encodeURIComponent(f)}`);
    if (isCaptcha(r.body)) { out.captcha = true; out.captcha_at = (out.captcha_at || []).concat('photo-http'); break; }
    const st = extractApolloState(r.body);
    perFilter[f] = [...harvestPhotoUrls(r.body), ...(st ? parsePhotoState(st).map(x => x.url) : [])];
    (diag.filter_http ||= {})[f] = [r.status, r.body.length, st ? Object.keys(st.ROOT_QUERY || {}).filter(k => /photo/i.test(k)).map(k => k.slice(0, 120)) : 'no-apollo'];
  }
  // 访客评论页（服务端渲染）：评论照多半是食物与店内，补首屏不够的时候用
  await jitter(1000, 2000);
  const rv = await get(`https://m.place.naver.com/${kind}/${id}/review/visitor`);
  if (isCaptcha(rv.body)) { out.captcha = true; out.captcha_at = (out.captcha_at || []).concat('review'); }
  else {
    const rvUrls = harvestPhotoUrls(rv.body).filter(u => photoSource(u) === 'visitor');
    diag.review_photos = rvUrls.length;
    for (const u of rvUrls) typedCands.push({ url: u, category: '', source: 'visitor' });
  }
  const lab = labelByFilter([...base, ...typedCands.map(c => c.url)], perFilter);
  diag.per_filter = Object.fromEntries(Object.entries(perFilter).map(([k, v]) => [k, v.length]));
  diag.filter_ignored = lab.ignored;
  diag.base = base.length;
  return { cands: [...typedCands, ...cands.filter(c => c.category), ...lab.cands], diag };
}

async function fetchOne(ctx, q) {
  const out = {
    query: q, ok: false, captcha: false, naver_id: '', naver_url: '', place_title: '', address: '',
    business_status: 'unknown', now_status: '', hours: [], closed_days: '', menu: [],
    naver_rating: null, naver_reviews: null, urls: [], photo_src: [], photo_cat: [], count: 0, method: 'none',
  };
  try {
    const id = await resolveId(q, out);
    if (!id) { out.error = out.captcha ? '搜索被验证码挡住' : '搜不到 place id'; return out; }
    out.naver_id = id;
    out.naver_url = naverPlaceUrl(id);
    await jitter(1000, 2000);
    const home = await fetchHome(id, out);
    let menuUrls = [];
    let homePhotos = [];
    let kind = 'restaurant';
    if (home) {
      kind = home.kind;
      const p = home.parsed;
      Object.assign(out, {
        place_title: p.place_title, category: p.category, address: p.address, phone: p.phone,
        business_status: p.business_status, now_status: p.now_status, hours: p.hours,
        closed_days: p.closed_days, menu: p.menu, naver_rating: p.naver_rating,
        naver_reviews: p.naver_reviews, photo_total: p.photo_total, coord: p.coord,
      });
      menuUrls = p.menu_images;
      homePhotos = p.top_photos;
    } else if (!out.captcha) {
      out.error = '店家首页解析不到（页面改版？）';
    }
    if (out.captcha && !home) return out;   // 首页都被挡，照片页更不用试，换下一家
    await jitter(1500, 3000);
    const { cands, diag } = await fetchPhotos(ctx, kind, id, out);
    out.diag = diag;
    const picked = selectPhotos([...homePhotos, ...cands], { menuUrls, want: Math.max(WANT, 8) });
    out.urls = picked.map(x => x.url);
    out.photo_src = picked.map(x => x.source);
    out.photo_cat = picked.map(x => x.category || '');
    out.count = out.urls.length;
    out.ok = out.count >= WANT && out.hours.length > 0;
  } catch (e) {
    out.error = String(e).slice(0, 200);
  }
  return out;
}

async function main() {
  const queries = (process.env.QUERIES || '').split('|').map(s => s.trim()).filter(Boolean);
  if (!queries.length) { console.error('QUERIES 是空的'); process.exit(1); }
  const { chromium, devices } = await import('playwright');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], userAgent: UA, locale: 'ko-KR' });
  const results = [];
  for (let i = 0; i < queries.length; i++) {
    if (i) await jitter(3000, 6000);   // 每家间隔随机 3–6 秒：太快会被 Naver 判成机器人
    const r = await fetchOne(ctx, queries[i]);
    results.push(r);
    console.log('RESULT ' + JSON.stringify(r));
  }
  await browser.close();
  console.log('SUMMARY ' + JSON.stringify({
    total: results.length,
    ok: results.filter(r => r.ok).length,
    captcha: results.filter(r => r.captcha).map(r => r.query),
    short: results.filter(r => !r.ok).map(r => ({ query: r.query, count: r.count, hours: r.hours.length, error: r.error || '' })),
    closed: results.filter(r => r.business_status === '歇业' || r.business_status === '休业')
      .map(r => ({ query: r.query, status: r.business_status, place_title: r.place_title })),
  }));
}

// 被自检 import 时不跑主程序；直接 node 执行时才跑
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
