/**
 * 航班实时状态框的自检（2026-11-05 建）—— 真浏览器跑，Playwright。
 * 守三处：sg-jkt-trip/singapore.html、sg-jkt-trip/jakarta.html 的机票卡（.bpass 里的 .flive），
 * 以及老板 App boss/index.html 的航班条目。三处的 JS 是同一段（FLIGHT-LIVE BEGIN～END），
 * 这里也比对它们一字不差。
 *
 * 跑法：
 *   python3 -m http.server 8899 &
 *   node tools/check-flight-live.mjs
 * 沙盒里要带 CHROMIUM_PATH=/opt/pw-browsers/chromium。
 * （`python3 tools/check-all.py` 会自动起 server 并带上 CHROMIUM_PATH。）
 *
 * 为什么要真浏览器：状态框是前端现抓 butler-bot 的 /flight-status 再自己画的，读代码看不出
 * 它在「延误／取消／没网／还早」时长什么样。真接口一律不打：route 拦截，给固定假资料；
 * 「现在」用 page.clock / freezeClock 钉死，结果不随跑的日子变。
 *
 * 最要紧的一条是**时区**：浏览器故意设成洛杉矶（America/Los_Angeles）。页面若偷懒用
 * new Date(iso).getHours() 按浏览器时区显示，12:55 会变成 20:55——老板人在金边看、
 * 手机在哪个时区都一样，屏幕上必须是出发机场的当地时刻。新加坡 +08:00、雅加达 +07:00 各验一个。
 *
 * 情境：
 *   1. 准点（绿，「准点」）  2. 延误 25 分钟（琥珀，原定划线，新加坡与雅加达各一）
 *   3. 取消（红）  4. 已落地（蓝）；已起飞（蓝，实际起飞＋预计到达）
 *   5. 还没到 window_start（起飞前 48 小时）只印淡色提示
 *   6. 接口 500 又没缓存：整框隐藏，不出错误字样，没有 JS 错误
 *   7. 接口失败但有缓存：照样显示，标「上次更新 HH:MM（离线）」
 *   8. 两本手册都没有 FlightAware 链接、没有 .track 按钮；每张机票卡一个状态框，夹在 .route 与 .perf 之间
 *   9. 老板 App 用 viewer 身份打开，航班项也有状态框（admin 同样有，作对照）
 *  另：已落地超过 6 小时的航班不再抓（直接用缓存）；一次请求带上整页所有航班；回到前台会重抓。
 *
 * false-red 验证过（2026-11-05）：把 FLIGHT-LIVE 里的 hm() 改成按浏览器时区
 * （new Date(iso).getHours()）→ 延误／准点／更新时间那几条全红。
 */
import fs from 'node:fs';
import {
  browser, ok, finish, until, mountRoutes, forceZh, freezeClock, gotoTab, GOOD_TOKEN, PORT,
  URL as BOSS_URL,
} from './lib/boss-check-kit.mjs';

const BASE = `http://localhost:${PORT}/sg-jkt-trip/`;
const SG = BASE + 'singapore.html';
const JKT = BASE + 'jakarta.html';
const API = 'https://butler-bot.jarixhew.workers.dev/flight-status';
const TZ = 'America/Los_Angeles';   // 故意跟新加坡／雅加达都不一样
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const GREEN = 'rgb(63, 125, 92)', AMBER = 'rgb(138, 90, 18)', RED = 'rgb(163, 39, 31)', BLUE = 'rgb(54, 104, 156)';

/* ---------- 假资料：形状照 butler-bot /flight-status 的规格 ---------- */
const base = (no, date, extra) => ({
  no, date, tracked: true, status: '', state: 'scheduled',
  sched_dep: null, est_dep: null, act_dep: null, sched_arr: null, est_arr: null, act_arr: null,
  delay_min: null, terminal: null, gate: null, last_polled: null, window_start: null, ...extra,
});
const SQ958_LATE = base('SQ958', '2026-11-14', {
  state: 'delayed', status: 'Delayed', delay_min: 25,
  sched_dep: '2026-11-14T12:30:00+08:00', est_dep: '2026-11-14T12:55:00+08:00',
  sched_arr: '2026-11-14T13:20:00+07:00', est_arr: '2026-11-14T13:45:00+07:00',
  terminal: '2', gate: 'F53', last_polled: '2026-11-14T03:40:00Z', window_start: '2026-11-12T12:30:00+08:00',
});
const SQ153_LANDED = base('SQ153', '2026-11-11', {
  state: 'landed', status: 'Arrived',
  sched_dep: '2026-11-11T09:35:00+07:00', act_dep: '2026-11-11T09:41:00+07:00',
  sched_arr: '2026-11-11T12:50:00+08:00', act_arr: '2026-11-11T12:46:00+08:00',
  terminal: '1', gate: 'A2', last_polled: '2026-11-11T05:00:00Z', window_start: '2026-11-09T09:35:00+07:00',
});
const SQ133_CXL = base('SQ133', '2026-11-11', {
  state: 'cancelled', status: 'Canceled',
  sched_dep: '2026-11-11T12:00:00+08:00', sched_arr: '2026-11-11T13:35:00+08:00',
  last_polled: '2026-11-11T02:00:00Z', window_start: '2026-11-09T12:00:00+08:00',
});
const SQ957_ONTIME = base('SQ957', '2026-11-16', {
  state: 'scheduled', status: 'Expected',
  sched_dep: '2026-11-16T11:10:00+07:00', est_dep: '2026-11-16T11:10:00+07:00',
  sched_arr: '2026-11-16T13:55:00+08:00', terminal: '3', gate: null,
  last_polled: '2026-11-16T01:55:00Z', window_start: '2026-11-14T11:10:00+07:00',
});
const SQ957_LATE = { ...SQ957_ONTIME, state: 'delayed', est_dep: '2026-11-16T11:50:00+07:00', delay_min: null };
const SQ958_DEPARTED = { ...SQ958_LATE, state: 'departed', act_dep: '2026-11-14T12:41:00+08:00', est_arr: '2026-11-14T13:25:00+07:00' };
// 接口上线后 CI 实测拿到的原样回应（2026-11-05）：时间没有秒、window_start 是 UTC 带毫秒、
// terminal 是纯数字、last_polled 还是 null（还没真正查过）——四种「跟规格样例长得不一样」的地方都在这条里
const SQ958_REAL = {"no":"SQ958","date":"2026-11-14","tracked":true,"status":"unknown","state":"scheduled","sched_dep":"2026-11-14T12:30+08:00","est_dep":"2026-11-14T12:30+08:00","act_dep":null,"sched_arr":"2026-11-14T13:20+07:00","est_arr":"2026-11-14T13:20+07:00","act_arr":null,"delay_min":0,"terminal":"2","gate":null,"last_polled":null,"window_start":"2026-11-12T04:30:00.000Z"};

/* ---------- 共用：开一个手册 context（洛杉矶时区、钉死「现在」、拦掉所有外部请求）---------- */
async function bookCtx() {
  const ctx = await browser.newContext({ timezoneId: TZ, serviceWorkers: 'block', viewport: { width: 390, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('siteLangUser', 'cn'); } catch (e) {} });
  return ctx;
}
/** 拦 /flight-status：flights 是 {key: 记录}，status 可设 500。回 calls（每次请求的 f= 列表）。 */
async function routeApi(target, opts, apiOnly = false) {
  const calls = [];
  // apiOnly：老板 App 那边其它请求已由 mountRoutes 管，这里只接 /flight-status
  await target.route(apiOnly ? API + '**' : '**/*', async r => {
    const u = r.request().url();
    if (u.startsWith(`http://localhost:${PORT}`)) return r.continue();
    if (u.startsWith('https://lh3.googleusercontent.com/')) return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (u.startsWith(API)) {
      const f = new globalThis.URL(u).searchParams.get('f') || '';
      calls.push(f.split(',').filter(Boolean));
      const h = { 'access-control-allow-origin': '*' };
      if (opts.status && opts.status !== 200) return r.fulfill({ status: opts.status, headers: h, body: 'boom' });
      const flights = f.split(',').filter(Boolean).map(k => {
        const rec = opts.flights[k];
        if (rec) return rec;
        const [no, date] = k.split('@');
        return { no, date, tracked: false };
      });
      return r.fulfill({ status: 200, headers: h, contentType: 'application/json',
        body: JSON.stringify({ flights, generated_at: '2026-11-14T03:41:00Z' }) });
    }
    return r.abort('failed');
  });
  return calls;
}
async function openBook(ctx, url, now, opts) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.clock.setFixedTime(new Date(now));
  const calls = await routeApi(page, opts);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // 等第一轮抓完（每个框都画过一次）
  await until(() => page.evaluate(() =>
    [...document.querySelectorAll('.flive')].every(b => b.getAttribute('data-fl-painted'))),
    { what: '状态框画完' });
  await page.waitForTimeout(150);
  return { page, errs, calls };
}
const box = (page, no) => page.locator(`.flive[data-flight="${no}"]`);
async function info(page, no) {
  return page.evaluate(n => {
    const b = document.querySelector(`.flive[data-flight="${n}"]`);
    if (!b) return null;
    const st = b.querySelector('.fl-st');
    const s = b.querySelector('.fl-was s');
    return {
      hidden: b.hidden || getComputedStyle(b).display === 'none',
      cls: b.className, text: b.innerText.replace(/\s+/g, ' ').trim(),
      color: st ? getComputedStyle(st).color : null,
      struck: s ? s.textContent.trim() : null,
      strikeStyle: s ? getComputedStyle(s).textDecorationLine : null,
    };
  }, no);
}

/* ============ 0. 三处 JS 一字不差 ============ */
{
  console.log('\n【0】三处 FLIGHT-LIVE 段一字不差');
  const grab = p => {
    const s = fs.readFileSync(p, 'utf8');
    const a = s.indexOf('/* ===== FLIGHT-LIVE BEGIN'), b = s.indexOf('/* ===== FLIGHT-LIVE END ===== */');
    return a >= 0 && b > a ? s.slice(a, b) : null;
  };
  const sg = grab('sg-jkt-trip/singapore.html'), jk = grab('sg-jkt-trip/jakarta.html'), bs = grab('boss/index.html');
  ok('★三处都有这一段', !!(sg && jk && bs), [!!sg, !!jk, !!bs]);
  ok('★新加坡＝雅加达', sg === jk, 'diff');
  ok('★新加坡＝老板 App', sg === bs, 'diff');
}

/* ============ 8. 版面：没有 FlightAware、每张机票卡一个状态框 ============ */
for (const [name, url, nos] of [['新加坡', SG, ['SQ153', 'SQ133', 'SQ958']], ['雅加达', JKT, ['SQ958', 'SQ957', 'SQ138', 'SQ158']]]) {
  const ctx = await bookCtx();
  const { page } = await openBook(ctx, url, '2026-11-01T00:00:00Z', { flights: {} });
  console.log(`\n【8】${name}：版面`);
  const layout = await page.evaluate(() => ({
    fa: document.querySelectorAll('a[href*="flightaware" i]').length,
    track: document.querySelectorAll('.track, a.track').length,
    faText: /flightaware/i.test(document.documentElement.outerHTML),
    cards: [...document.querySelectorAll('.bpass')].map(c => {
      const kids = [...c.children].map(k => k.className.split(' ')[0]);
      const i = kids.indexOf('flive');
      return { n: c.querySelectorAll('.flive').length, before: kids[i - 1], after: kids[i + 1],
        no: c.querySelector('.flive') && c.querySelector('.flive').dataset.flight,
        airline: (c.querySelector('.airline') || {}).textContent, emptyLinks: c.querySelectorAll('.links:empty').length };
    }),
  }));
  ok(`★${name}：没有 FlightAware 链接`, layout.fa === 0 && !layout.faText, layout.fa);
  ok(`★${name}：没有追踪按钮`, layout.track === 0, layout.track);
  ok(`★${name}：每张机票卡恰好一个状态框`, layout.cards.length === nos.length && layout.cards.every(c => c.n === 1), layout.cards);
  ok(`★${name}：状态框夹在 .route 与 .perf 之间`, layout.cards.every(c => c.before === 'route' && c.after === 'perf'), layout.cards);
  ok(`★${name}：航班号从卡片读（data-flight 对得上 .airline）`,
    layout.cards.every(c => c.airline.replace(/\s|^SQ(?=SQ)/g, '').endsWith(c.no)) && layout.cards.map(c => c.no).join() === nos.join(), layout.cards.map(c => [c.no, c.airline]));
  ok(`★${name}：没有留下空的 .links`, layout.cards.every(c => c.emptyLinks === 0), layout.cards);
  await ctx.close();
}

/* ============ 1–4、7、已落地不再抓：新加坡 ============ */
{
  const ctx = await bookCtx();
  // 11/14 11:00 新加坡时间（＝洛杉矶 11/13 19:00）
  const { page, errs, calls } = await openBook(ctx, SG, '2026-11-14T03:00:00Z',
    { flights: { 'SQ958@2026-11-14': SQ958_LATE, 'SQ153@2026-11-11': SQ153_LANDED, 'SQ133@2026-11-11': SQ133_CXL } });
  console.log('\n【2】新加坡 SQ958 延误 25 分钟（+08:00）');
  const d = await info(page, 'SQ958');
  ok('★看得见', d && !d.hidden, d);
  ok('★琥珀色', d && d.color === AMBER && /fl-late/.test(d.cls), d && d.color);
  ok('★写「延误 25 分钟」', /延误 25 分钟/.test(d.text), d.text);
  ok('★预计起飞按新加坡当地 12:55（不是浏览器时区）', /预计起飞 12:55/.test(d.text), d.text);
  ok('★原定 12:30 划线', d.struck === '12:30' && /line-through/.test(d.strikeStyle), [d.struck, d.strikeStyle]);
  ok('★航站楼 T2、登机口 F53', /航站楼 T2/.test(d.text) && /登机口 F53/.test(d.text), d.text);
  ok('★更新时间按出发机场时区：11:40 更新', /11:40 更新/.test(d.text), d.text);
  ok('★有 LIVE · 实时状态 标头', /LIVE · 实时状态/.test(d.text), d.text);
  ok('★一次请求带上整页三个航班', calls.length === 1 && calls[0].length === 3, calls);

  console.log('\n【3】取消');
  const c = await info(page, 'SQ133');
  ok('★红色、写「已取消」', c && !c.hidden && c.color === RED && /已取消/.test(c.text), c);
  ok('★取消了就不印登机口', !/登机口/.test(c.text), c.text);

  console.log('\n【4】已落地');
  const l = await info(page, 'SQ153');
  ok('★蓝色、写「已落地 12:46」', l && !l.hidden && l.color === BLUE && /已落地 12:46/.test(l.text), l);

  console.log('\n【双语】切英文');
  await page.evaluate(() => toggleLang());
  const de = await info(page, 'SQ958');
  ok('★英文：Delayed 25 min · Est. departure 12:55 · Gate F53 · Updated 11:40',
    /Delayed 25 min/.test(de.text) && /Est\. departure 12:55/.test(de.text) && /Gate F53/.test(de.text) && /Updated 11:40/.test(de.text) && !/延误/.test(de.text), de.text);
  await page.evaluate(() => toggleLang());

  console.log('\n【回到前台】visibilitychange 会重抓');
  const before = calls.length;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await until(() => calls.length > before, { what: '回前台重抓' });
  ok('★回到前台重抓了一次', calls.length === before + 1, calls.length - before);
  await page.waitForTimeout(150);

  console.log('\n【7】接口失败但有缓存 → 显示上次的状态并标离线');
  await page.close();
  const r = await openBook(ctx, SG, '2026-11-14T03:00:00Z', { status: 500, flights: {} });
  const o = await info(r.page, 'SQ958');
  ok('★还看得见（缓存）', o && !o.hidden && /延误 25 分钟/.test(o.text), o);
  ok('★标「上次更新 11:40（离线）」', /上次更新 11:40（离线）/.test(o.text), o.text);
  ok('★没有 JS 错误', r.errs.length === 0, r.errs);

  console.log('\n【已落地超过 6 小时】不再抓');
  ok('★SQ153（11/11 落地，现在 11/14）不在请求里', r.calls.length >= 1 && r.calls.every(k => !k.includes('SQ153@2026-11-11')), r.calls);
  const l2 = await info(r.page, 'SQ153');
  ok('★照样显示缓存里的「已落地」，不标离线', l2 && !l2.hidden && /已落地 12:46/.test(l2.text) && !/离线/.test(l2.text), l2);
  ok('无 JS 报错（第一轮）', errs.length === 0, errs);
  await ctx.close();
}

/* ============ 1、2（+07:00）、已起飞：雅加达 ============ */
{
  const ctx = await bookCtx();
  // 11/16 09:00 雅加达时间
  const { page, errs } = await openBook(ctx, JKT, '2026-11-16T02:00:00Z',
    { flights: { 'SQ957@2026-11-16': SQ957_ONTIME, 'SQ958@2026-11-14': SQ958_DEPARTED } });
  console.log('\n【1】雅加达 SQ957 准点（+07:00）');
  const g = await info(page, 'SQ957');
  ok('★绿色、写「准点」', g && !g.hidden && g.color === GREEN && /准点/.test(g.text), g);
  ok('★预计起飞按雅加达当地 11:10', /预计起飞 11:10/.test(g.text), g.text);
  ok('★准点不印「原定」', !/原定/.test(g.text), g.text);
  ok('★登机口 null → 「登机口 未公布」', /登机口 未公布/.test(g.text), g.text);
  ok('★更新时间按雅加达：08:55 更新', /08:55 更新/.test(g.text), g.text);
  console.log('\n【已起飞】');
  const dp = await info(page, 'SQ958');
  ok('★蓝色、「实际起飞 12:41 · 预计到达 13:25」', dp && dp.color === BLUE && /实际起飞 12:41 · 预计到达 13:25/.test(dp.text), dp);
  console.log('\n【tracked:false 又没缓存】');
  const t = await info(page, 'SQ158');
  ok('★整框隐藏', t && t.hidden, t);
  ok('无 JS 报错', errs.length === 0, errs);

  console.log('\n【2】雅加达 SQ957 延误（delay_min 为 null，自己算）');
  await page.close();
  const r = await openBook(ctx, JKT, '2026-11-16T02:00:00Z', { flights: { 'SQ957@2026-11-16': SQ957_LATE } });
  const d = await info(r.page, 'SQ957');
  ok('★琥珀色、「延误 40 分钟」', d && d.color === AMBER && /延误 40 分钟/.test(d.text), d);
  ok('★预计起飞 11:50、原定 11:10 划线', /预计起飞 11:50/.test(d.text) && d.struck === '11:10', [d.text, d.struck]);
  await ctx.close();
}

/* ============ 5. 还没到 window_start ============ */
{
  const ctx = await bookCtx();
  const { page, errs } = await openBook(ctx, SG, '2026-11-10T00:00:00Z', { flights: { 'SQ958@2026-11-14': SQ958_REAL } });
  console.log('\n【5】还没到起飞前 48 小时');
  const w = await info(page, 'SQ958');
  ok('★看得见、淡色提示', w && !w.hidden && /fl-wait/.test(w.cls), w);
  ok('★写「起飞前 2 天开始显示实时状态」', /起飞前 2 天开始显示实时状态/.test(w.text), w.text);
  ok('★不写准点／延误', !/准点|延误/.test(w.text), w.text);
  await page.evaluate(() => toggleLang());
  const we = await info(page, 'SQ958');
  ok('★英文同义', /Live status starts 2 days before departure/.test(we.text), we.text);
  ok('无 JS 报错', errs.length === 0, errs);
  await ctx.close();
}

/* ============ 真接口原样回应：过了 window_start ============ */
{
  const ctx = await bookCtx();
  // 11/13 08:00 新加坡时间：已过 window_start（11/12 12:30 SGT）
  const { page, errs } = await openBook(ctx, SG, '2026-11-13T00:00:00Z', { flights: { 'SQ958@2026-11-14': SQ958_REAL } });
  console.log('\n【真回应】时间无秒、terminal 纯数字、last_polled 为 null');
  const r = await info(page, 'SQ958');
  ok('★看得见、绿色「准点」', r && !r.hidden && r.color === GREEN && /准点/.test(r.text), r);
  ok('★「预计起飞 12:30」（无秒的时间也解析得了）', /预计起飞 12:30/.test(r.text), r.text);
  ok('★terminal "2" 显示成「航站楼 T2」', /航站楼 T2/.test(r.text) && !/TT2/.test(r.text), r.text);
  ok('★gate null →「登机口 未公布」', /登机口 未公布/.test(r.text), r.text);
  ok('★last_polled null → 不写「几点更新」', !/更新|离线/.test(r.text), r.text);
  ok('无 JS 报错', errs.length === 0, errs);
  await ctx.close();
}

/* ============ 6. 接口 500 且没缓存 ============ */
for (const [name, url] of [['新加坡', SG], ['雅加达', JKT]]) {
  const ctx = await bookCtx();
  const { page, errs } = await openBook(ctx, url, '2026-11-14T03:00:00Z', { status: 500, flights: {} });
  console.log(`\n【6】${name}：接口 500、没缓存`);
  const all = await page.evaluate(() => [...document.querySelectorAll('.flive')].map(b => ({ hidden: b.hidden || getComputedStyle(b).display === 'none', text: b.textContent })));
  ok(`★${name}：状态框全部隐藏`, all.length > 0 && all.every(b => b.hidden), all);
  const txt = await page.locator('#flights').innerText();
  ok(`★${name}：航班区块没有错误字样`, !/错误|失败|抓不到|error|failed|unavailable/i.test(txt), txt.slice(0, 200));
  ok(`★${name}：没有 JS 错误`, errs.length === 0, errs);
  await ctx.close();
}

/* ============ 9. 老板 App：viewer 也有状态框（admin 对照） ============ */
function bossTrips() {
  return [{
    id: 'trip-jkt', title: { zh: '雅加达 · 11月14–16日', en: 'Jakarta · 14–16 Nov' }, start: '2026-11-14', end: '2026-11-16',
    location: { zh: '雅加达', en: 'Jakarta' }, guideUrl: 'https://example.com/jkt', items: [
      { date: '2026-11-14', time: '12:30', title: { zh: 'SQ958 樟宜 → 雅加达', en: 'SQ958 Changi → Jakarta' }, note: { zh: '', en: '' }, mapUrl: '',
        flight: { no: 'SQ958', date: '2026-11-14', pax: [{ name: 'Tan Chin Hooi', seat: '14A' }], live: null } },
      { date: '2026-11-16', time: '11:10', title: { zh: 'SQ957 雅加达 → 樟宜', en: 'SQ957 Jakarta → Changi' }, note: { zh: '', en: '' }, mapUrl: '',
        flight: { no: 'SQ957', date: '2026-11-16', live: null } },
    ],
  }];
}
for (const role of ['viewer', 'admin']) {
  const ctx = await browser.newContext({ timezoneId: TZ, viewport: { width: 390, height: 900 } });
  await forceZh(ctx);
  await freezeClock(ctx, '2026-11-14');   // 11/14 12:00 UTC
  mountRoutes(ctx, { role, trips: bossTrips() });
  const calls = await routeApi(ctx, { flights: { 'SQ958@2026-11-14': SQ958_LATE, 'SQ957@2026-11-16': SQ957_ONTIME } }, true);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(BOSS_URL);
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')), { what: 'App 加载完成' });
  console.log(`\n【9】老板 App（${role}）`);
  await until(() => page.evaluate(() => {
    const b = document.querySelector('#tab-today .flive[data-flight="SQ958"]');
    return !!b && !b.hidden;
  }), { what: `${role}：今天页的状态框画出来` });
  const t = await page.evaluate(() => {
    const b = document.querySelector('#tab-today .flive[data-flight="SQ958"]');
    return b && { hidden: b.hidden, text: b.innerText.replace(/\s+/g, ' '), color: getComputedStyle(b.querySelector('.fl-st') || b).color,
      role: typeof role !== 'undefined' ? role : null };
  });
  ok(`★${role}：今天页 SQ958 有状态框`, t && !t.hidden, t);
  ok(`★${role}：延误 25 分钟、琥珀色`, t && /延误 25 分钟/.test(t.text) && t.color === AMBER, t);
  ok(`★${role}：预计起飞 12:55（新加坡当地）、原定 12:30`, t && /预计起飞 12:55/.test(t.text) && /原定 12:30/.test(t.text), t && t.text);
  ok(`★${role}：身份确实是 ${role}`, t && t.role === role, t && t.role);
  // 行程分页重画之后，框直接用手上的状态填，不再多打一次
  const n0 = calls.length;
  await gotoTab(page, 'trips');
  await page.locator('.trip-card-hd').first().click();
  await until(() => page.evaluate(() => {
    const b = document.querySelector('#tab-trips .flive[data-flight="SQ957"]');
    return !!b && !b.hidden;
  }), { what: `${role}：行程页 SQ957 状态框` });
  const t2 = await page.evaluate(() => {
    const b = document.querySelector('#tab-trips .flive[data-flight="SQ957"]');
    return b && { text: b.innerText.replace(/\s+/g, ' '), color: getComputedStyle(b.querySelector('.fl-st') || b).color };
  });
  ok(`★${role}：行程页 SQ957 准点、绿色、11:10（雅加达当地）`, t2 && /准点/.test(t2.text) && /11:10/.test(t2.text) && t2.color === GREEN, t2);
  ok(`★${role}：重画不会多打接口`, calls.length === n0, [n0, calls.length]);
  ok(`★${role}：状态框里没有任何按钮／输入框（只读）`,
    await page.locator('.flive button, .flive input, .flive select, .flive textarea, .flive a').count() === 0);
  ok(`${role}：无 JS 报错`, errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

await finish('航班实时状态');
