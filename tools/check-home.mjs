/**
 * home/index.html（个人总入口首页）的自检 —— 真浏览器跑，Playwright。
 *
 * 跑法：
 *   python3 -m http.server 8899 &
 *   node tools/check-home.mjs
 * 沙盒里要带 CHROMIUM_PATH=/opt/pw-browsers/chromium。
 * （`python3 tools/check-all.py` 会自动起 server 并带上 CHROMIUM_PATH。）
 *
 * 为什么要真浏览器：首页的主卡是按「今天」现算的（还有几天／明天出发／进行中第几天），
 * 读代码看不出差一天的错，只能把时钟钉在几个手算得出答案的日子去对。
 *
 * 守四件事：
 *   A. 倒数与进度：固定假日期，对手算答案（见下方 CASES）
 *   B. 链接不烂：首页每个链接指向的文件都真的在仓库里
 *   C. 不脱节：行程最后一天与 tools/lib/trips.py 一致；还没走完的手册都上了首页
 *      （新手册建好没加进首页，它会安静地不出现——这条专抓这个）
 *   D. 双语、搜索、常用排序、手机宽度不横向溢出
 *
 * 手算（2026 年 11 月：新加坡 11–14，雅加达 14–16）：
 *   11/05 → 新加坡 还有 6 天（11−5）；雅加达 还有 9 天（14−5）
 *   11/10 → 新加坡 明天出发（1 天）；雅加达 还有 4 天
 *   11/11 → 新加坡 进行中 第 1 天，共 4 天，进度 25%
 *   11/14 → 两段同一天交接：主卡换成雅加达 第 1 天／共 3 天；新加坡退到副位 第 4 天
 *   11/16 → 雅加达 第 3 天／共 3 天，进度 100%
 *   11/17 → 没有排定的行程；最近一趟＝雅加达；走过的路 7 趟
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.CHECK_PORT || 8899;
const URL = `http://localhost:${PORT}/home/index.html`;

const fails = [];
const ok = [];
function check(cond, label) { (cond ? ok : fails).push(label); }
function eq(a, b, label) { check(a === b, `${label}（期望 ${JSON.stringify(b)}，实得 ${JSON.stringify(a)}）`); }

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function open({ date = '2026-11-10', hour = '10', lang = 'zh', locale = 'zh-CN', use = null, viewport = { width: 390, height: 844 } } = {}) {
  const ctx = await browser.newContext({ locale, viewport, timezoneId: 'Asia/Kuala_Lumpur' });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(`${date}T${hour}:00:00+08:00`));
  await page.addInitScript(({ lang, use }) => {
    try {
      if (lang && !sessionStorage.getItem('__seeded')) {
        if (lang !== 'auto') localStorage.setItem('siteLangUser', lang);
        if (use) localStorage.setItem('homeUse', JSON.stringify(use));
        sessionStorage.setItem('__seeded', '1');
      }
    } catch (e) {}
  }, { lang, use });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL);
  await page.waitForSelector('#groups .card');
  return { ctx, page, errors };
}
const hero = (page) => page.evaluate(() => {
  const h = document.getElementById('hero'), t = (id) => document.getElementById(id).textContent;
  return { state: h.dataset.state, trip: h.dataset.trip, days: h.dataset.days, title: t('heroTitle'), n: t('heroN'), l: t('heroL'),
    dates: t('heroDates'), bar: document.getElementById('heroBar').hidden ? null : document.getElementById('heroBarFill').style.width,
    href: document.getElementById('heroGo').getAttribute('href'),
    also: [...document.querySelectorAll('#also a')].map(a => a.dataset.also + '|' + a.querySelector('span').textContent),
    past: [...document.querySelectorAll('#past li')].map(li => li.dataset.past) };
});

/* ---------- A. 倒数与进度 ---------- */
{
  const { ctx, page, errors } = await open({ date: '2026-11-05' });
  const h = await hero(page);
  eq(h.state + '/' + h.trip + '/' + h.days, 'upcoming/sg-nov/6', 'A1 11/05 主卡＝新加坡，还有 6 天');
  eq(h.l, '天后出发', 'A2 11/05 标签');
  eq(h.also.join(','), 'jakarta|还有 9 天', 'A3 11/05 副位＝雅加达 还有 9 天');
  eq(h.dates, '2026年11月11–14日 · 共 4 天', 'A4 日期与天数（11–14 共 4 天）');
  eq(h.bar, null, 'A5 还没出发不显示进度条');
  eq(errors.length, 0, 'A6 页面无脚本报错');
  await ctx.close();
}
{
  const { ctx, page } = await open({ date: '2026-11-10' });
  const h = await hero(page);
  eq(h.n + '/' + h.l, '1/天后 · 明天出发', 'A7 11/10 明天出发');
  eq(h.also.join(','), 'jakarta|还有 4 天', 'A8 11/10 雅加达 还有 4 天');
  eq(h.href, '../sg-jkt-trip/singapore.html', 'A9 主卡按钮通到新加坡手册');
  await ctx.close();
}
{
  // 深夜 23 点也还是「今天」：不能因为换算成 UTC 就跳到明天
  const { ctx, page } = await open({ date: '2026-11-10', hour: '23' });
  eq((await hero(page)).days, '1', 'A10 11/10 深夜 23 点仍是「还有 1 天」');
  await ctx.close();
}
{
  // 2026-11-12 审计抓到：上午 11 点多，英文问候写成了 Good afternoon
  for (const [hour, want] of [['11', 'Good morning'], ['12', 'Good afternoon']]) {
    const { ctx, page } = await open({ date: '2026-11-10', hour, lang: 'en', locale: 'en-US' });
    eq(await page.textContent('#greet'), want, `A26 英文 ${hour} 点的问候语`);
    await ctx.close();
  }
}
{
  // 2026-11-12 审计抓到：首页切语言存的是 'zh'，新加坡／雅加达手册的同步只认 'cn'，
  // 结果手册开在另一个分页时不会跟着换回中文。
  for (const book of ['singapore.html', 'jakarta.html']) {
    const ctx = await browser.newContext({ locale: 'zh-CN', serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
    await ctx.route(u => !u.href.startsWith('http://localhost'), r => r.abort());
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { if (!sessionStorage.getItem('__s')) { localStorage.setItem('siteLangUser', 'en'); sessionStorage.setItem('__s', '1'); } } catch (e) {} });
    await page.goto(URL.replace(/home\/.*$/, 'sg-jkt-trip/' + book), { waitUntil: 'domcontentloaded' });
    check(await page.evaluate(() => document.body.classList.contains('lang-en')), `A27 ${book} 先是英文（对照组）`);
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'siteLangUser', newValue: 'zh' })));
    check(await page.evaluate(() => !document.body.classList.contains('lang-en')), `A27 ${book} 首页切回中文（存 'zh'）后，开着的手册跟着变中文`);
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'siteLangUser', newValue: 'en' })));
    check(await page.evaluate(() => document.body.classList.contains('lang-en')), `A27 ${book} 切英文也跟着变`);
    await ctx.close();
  }
}
{
  const { ctx, page } = await open({ date: '2026-11-10', hour: '01' });
  eq((await hero(page)).days, '1', 'A11 11/10 凌晨 1 点仍是「还有 1 天」');
  await ctx.close();
}
{
  const { ctx, page } = await open({ date: '2026-11-11' });
  const h = await hero(page);
  eq(h.state + '/' + h.trip + '/' + h.n, 'ongoing/sg-nov/1', 'A12 11/11 新加坡进行中 第 1 天');
  eq(h.l, '第 1 天，共 4 天', 'A13 11/11 标签');
  eq(h.bar, '25%', 'A14 11/11 进度 1/4＝25%');
  await ctx.close();
}
{
  const { ctx, page } = await open({ date: '2026-11-14' });
  const h = await hero(page);
  eq(h.trip + '/' + h.n + '/' + h.l, 'jakarta/1/第 1 天，共 3 天', 'A15 11/14 交接日主卡换成雅加达');
  eq(h.also.join(','), 'sg-nov|进行中 · 第 4 天', 'A16 11/14 新加坡退到副位 第 4 天');
  await ctx.close();
}
{
  const { ctx, page } = await open({ date: '2026-11-16' });
  const h = await hero(page);
  eq(h.n + '/' + h.bar, '3/100%', 'A17 11/16 雅加达 第 3 天 进度 100%');
  eq(h.past[0], 'sg-nov', 'A18 11/16 走过的路最上面是刚结束的新加坡');
  await ctx.close();
}
{
  const { ctx, page } = await open({ date: '2026-11-17' });
  const h = await hero(page);
  eq(h.state, 'none', 'A19 11/17 没有排定的行程');
  check(h.dates.startsWith('最近一趟：雅加达'), `A20 11/17 最近一趟＝雅加达（实得 ${h.dates}）`);
  eq(h.href, '../sg-jkt-trip/jakarta.html', 'A21 空状态按钮通到最近一趟');
  eq(h.past.join(','), 'jakarta,sg-nov,penang,sg-sep,clinic,xiamen,japan', 'A22 走过的路 7 趟，新的在上');
  eq(await page.evaluate(() => getComputedStyle(document.querySelector('.stub')).display), 'none', 'A23 空状态不显示天数票根');
  await ctx.close();
}

{
  // 英文单复数：单日行程当主卡不能写「1 days」，搜到只剩一趟不能写「1 trips」
  const { ctx, page } = await open({ date: '2026-08-28', lang: 'en' });
  const h = await hero(page);
  eq(h.trip + '|' + h.dates, 'clinic|28 Aug 2026 · 1 day', 'A24 单日行程英文写 1 day');
  await page.fill('#q', 'japan');
  eq(await page.textContent('#pastCount'), '1 trip', 'A25 只剩一趟英文写 1 trip');
  await ctx.close();
}

/* ---------- B/C. 链接与数据不脱节（读文件，不看时钟） ---------- */
{
  const { ctx, page } = await open({ date: '2026-11-17' });
  const data = await page.evaluate(() => window.HOME_DATA);
  const hrefs = [
    ...data.trips.flatMap(t => [t.href, ...(t.sub || []).map(s => s.href)]),
    ...data.groups.flatMap(g => g.items.map(i => i.href)) ];
  const rel = (h) => path.normalize(path.join('home', h)).replace(/\\/g, '/');
  const dead = hrefs.filter(h => !fs.existsSync(path.join(ROOT, rel(h))));
  eq(dead.join(','), '', 'B1 首页每个链接的文件都在仓库里');
  eq(new Set(hrefs).size, hrefs.length, 'B2 没有重复收录同一页');
  const ids = [...data.trips.map(t => t.id), ...data.groups.flatMap(g => g.items.map(i => i.id))];
  eq(new Set(ids).size, ids.length, 'B3 id 不重复（常用次数靠它记）');
  // 画面上真的画出来的链接也逐个对一遍（数据对了、模板写错也会烂）
  const domHrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')));
  const domDead = domHrefs.filter(h => !fs.existsSync(path.join(ROOT, rel(h))));
  eq(domDead.join(','), '', 'B4 画面上每个链接都通');
  check(domHrefs.length >= hrefs.length, `B5 所有收录的页面都画出来了（数据 ${hrefs.length}，画面 ${domHrefs.length}）`);

  const src = fs.readFileSync(path.join(ROOT, 'tools/lib/trips.py'), 'utf8');
  const TRIPS = Object.fromEntries([...src.matchAll(/^\s*"([^"]+\.html)":\s*"(\d{4}-\d{2}-\d{2})"/gm)].map(m => [m[1], m[2]]));
  check(Object.keys(TRIPS).length >= 10, 'C1 读得到 trips.py 的日期表');
  for (const t of data.trips) {
    const p = rel(t.href);
    if (p in TRIPS) eq(t.end, TRIPS[p], `C2 ${p} 的最后一天与 trips.py 一致`);
    check(t.start <= t.end, `C3 ${t.id} 开始不晚于结束`);
  }
  // 还没走完的手册必须上首页（跳转页、同一趟的备用设计版 v2/v3/v4、选图页不算）
  const today = new Date().toISOString().slice(0, 10);
  const listed = new Set(hrefs.map(rel));
  const missing = Object.entries(TRIPS).filter(([p, end]) => end >= today && fs.existsSync(path.join(ROOT, p))
    && !/\/(v\d+|photo-picker|with-map)\.html$/.test(p)
    && !/http-equiv="refresh"/i.test(fs.readFileSync(path.join(ROOT, p), 'utf8'))
    && !listed.has(p)).map(([p]) => p);
  eq(missing.join(','), '', 'C4 还没走完的手册都上了首页');
  // 根目录网址要能带到首页
  const root = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check(/http-equiv="refresh"[^>]*url=home\//.test(root), 'C5 根目录 index.html 跳到 home/');
  await ctx.close();
}

/* ---------- D. 双语 / 搜索 / 常用 / 版面 ---------- */
{
  const { ctx, page } = await open({ date: '2026-11-10', lang: 'auto', locale: 'en-US' });
  const h = await hero(page);
  eq(h.title + '|' + h.l, 'Singapore|day to go · tomorrow', 'D1 系统是英文 → 自动英文');
  eq(h.dates, '11–14 Nov 2026 · 4 days', 'D2 英文日期');
  eq(await page.textContent('#today'), 'Tuesday, 10 Nov 2026', 'D3 2026-11-10 是星期二');
  const cjk = await page.evaluate(() => [...document.querySelectorAll('.wrap *')].filter(e => !e.children.length && e.offsetParent && /[一-鿿]/.test(e.textContent)).map(e => e.textContent));
  eq(cjk.join(' / '), '中文', 'D4 英文画面上除了切换钮没有中文残留');
  await page.click('#langBtn');
  eq(await page.textContent('#heroTitle'), '新加坡', 'D5 点切换 → 中文');
  eq(await page.evaluate(() => localStorage.getItem('siteLangUser')), 'zh', 'D6 手选记在全站共用的 siteLangUser');
  eq(await page.textContent('#today'), '2026年11月10日 星期二', 'D7 中文日期');
  await page.reload();
  eq(await page.textContent('#heroTitle'), '新加坡', 'D8 刷新后仍是手选的中文（优先于系统英文）');
  const latin = await page.evaluate(() => [...document.querySelectorAll('.card b, .sh h3, .past a.t')].map(e => e.textContent).filter(t => !/[一-鿿]/.test(t)));
  eq(latin.join(' / '), '', 'D9 中文画面上标题都有中文');
  await ctx.close();
}
{
  const { ctx, page } = await open({ date: '2026-11-17' });
  const cards = () => page.evaluate(() => [...document.querySelectorAll('#groups .card')].map(a => a.dataset.id).join(','));
  await page.fill('#q', '记账');
  eq(await cards(), 'expense', 'D10 搜「记账」只剩记账本');
  await page.fill('#q', 'FIT');
  eq(await cards(), 'fitness', 'D11 搜英文不分大小写');
  await page.fill('#q', '日本');
  eq(await cards(), '', 'D12 搜「日本」工具区全收起');
  eq(await page.evaluate(() => [...document.querySelectorAll('#past li')].map(l => l.dataset.past).join(',')), 'japan', 'D13 搜「日本」走过的路只剩日本');
  await page.fill('#q', '火星');
  eq(await page.evaluate(() => document.getElementById('empty').hidden), false, 'D14 搜不到时有提示');
  await page.fill('#q', '');
  eq((await cards()).split(',').length, 11, 'D15 清空搜索恢复 11 个工具');
  eq(await page.evaluate(() => document.getElementById('secFreq').hidden), true, 'D16 没点过任何页面时不显示「常用」');
  // 点一下 → 记一次（拦住跳转，只验计数）
  await page.evaluate(() => document.addEventListener('click', e => e.preventDefault(), true));
  await page.click('#groups .card[data-id="board"]');
  await page.click('#groups .card[data-id="board"]');
  await page.click('#groups .card[data-id="expense"]');
  eq(await page.evaluate(() => { const u = JSON.parse(localStorage.getItem('homeUse')); return u.board.n + '/' + u.expense.n; }), '2/1', 'D17 点开次数记在本机');
  await page.reload();
  eq(await page.evaluate(() => [...document.querySelectorAll('#gridFreq .card')].map(a => a.dataset.id).join(',')), 'board,expense', 'D18 「常用」按次数排：看板 2 次在记账本 1 次前');
  await ctx.close();
}
{
  // 常用最多四个；本机存的东西坏掉也不能白屏
  const use = { expense: { n: 5, t: 1 }, fitness: { n: 4, t: 1 }, board: { n: 3, t: 1 }, boss: { n: 2, t: 1 }, xisui: { n: 1, t: 1 }, gone: { n: 99, t: 1 } };
  const { ctx, page } = await open({ use });
  eq(await page.evaluate(() => [...document.querySelectorAll('#gridFreq .card')].map(a => a.dataset.id).join(',')), 'expense,fitness,board,boss', 'D19 常用取前四，已下架的 id 不出现');
  await page.evaluate(() => localStorage.setItem('homeUse', '{坏掉'));
  await page.reload();
  eq(await page.locator('#groups .card').count(), 11, 'D20 本机记录损坏时页面照常显示');
  await ctx.close();
}
for (const [w, lang] of [[320, 'zh'], [320, 'en'], [390, 'en'], [1280, 'zh']]) {
  for (const date of ['2026-11-10', '2026-11-14', '2026-11-17']) {
    const { ctx, page } = await open({ date, lang, viewport: { width: w, height: 800 } });
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(ov <= 1, `D21 ${w}px ${lang} ${date} 不横向溢出（实得 ${ov}px）`);
    await ctx.close();
  }
}

await browser.close();
console.log(`通过 ${ok.length} 项`);
if (fails.length) {
  console.error(`\n未通过 ${fails.length} 项：`);
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('home/index.html 自检全部通过');
