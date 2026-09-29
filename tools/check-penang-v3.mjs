/**
 * penang-trip/v3.html 行为自检（真浏览器，Playwright）。
 *
 * v3 在 v2 上加了 8 种版面：杂志封面、逐日时间轴、底部四标签、票券、今日模式、
 * 一页一天(hash)、滑卡选餐厅、给司机看。这些全是 JS 现算，静态检查（check-html）看不出坏没坏，
 * 所以这里逐项实跑。日期用固定假日期（page.clock + 指定时区），不随真实日期变。
 *
 * 跑法：
 *   python3 -m http.server 8899 &
 *   node tools/check-penang-v3.mjs            # 沙盒里加 CHROMIUM_PATH=/opt/pw-browsers/chromium
 *   SHOT_DIR=/某目录 node tools/check-penang-v3.mjs   # 顺便截 400px/1200px 中英文图
 *
 * 注意：这支**尚未挂进 check-all / checks.yml**（挂 CI 要动 workflow，等用户点头）。
 */
import { chromium } from 'playwright';

const PORT = process.env.CHECK_PORT || 8899;
const URL_V3 = `http://localhost:${PORT}/penang-trip/v3.html`;
const SHOT_DIR = process.env.SHOT_DIR || '';
const fails = [], oks = [];
const check = (cond, label) => { (cond ? oks : fails).push(label); if (!cond) console.log('  ✗ ' + label); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#b7cde2"/><text x="400" y="310" font-size="48" text-anchor="middle" fill="#1b3f66">photo</text></svg>`;
const cjk = /[一-鿿]/;

/* 通用：开一个页面。opts: now(ISO) tz lang w h noStorage clipboard('ok'|'reject'|'none') wish weather(fixture|null) */
async function open(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: opts.w || 400, height: opts.h || 800 },
    timezoneId: opts.tz || 'Asia/Kuala_Lumpur',
    locale: opts.lang === 'en' ? 'en-US' : 'zh-CN',
    permissions: opts.clipboard === 'ok' ? ['clipboard-read', 'clipboard-write'] : [],
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/lh3.googleusercontent.com/**', r => r.fulfill({ contentType: 'image/svg+xml', body: PLACEHOLDER }));
  await page.route('https://api.open-meteo.com/**', r => opts.weather ? r.fulfill({ json: opts.weather }) : r.abort());
  await page.route('https://air-quality-api.open-meteo.com/**', r => r.fulfill({ json: { current: { time: '2026-10-11T14:00', us_aqi: 40, pm2_5: 9 } } }));
  await page.addInitScript(({ noStorage, clipboard, wish, lang }) => {
    if (noStorage) Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
    else {
      if (lang) localStorage.setItem('siteLangUser', lang);
      if (wish) localStorage.setItem('penangV3Wish', JSON.stringify(wish));
    }
    if (clipboard === 'reject') Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('no')) }, configurable: true });
    if (clipboard === 'none') Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  }, { noStorage: !!opts.noStorage, clipboard: opts.clipboard || '', wish: opts.wish || null, lang: opts.lang || '' });
  await page.clock.setFixedTime(new Date(opts.now || '2026-09-29T10:00:00+08:00'));
  await page.goto(URL_V3 + (opts.hash || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#daytabs .dtab');
  await page.waitForFunction(() => { const n = document.getElementById('wxNote'); return n && !/载入中|Loading/.test(n.textContent); });
  return { ctx, page, errors };
}
const sel = p => p.evaluate(() => {
  const t = [...document.querySelectorAll('#daytabs .dtab')].findIndex(b => b.getAttribute('aria-selected') === 'true');
  const shown = [...document.querySelectorAll('#daypanels .daypanel')].map((p, i) => (p.hidden ? null : i + 1)).filter(Boolean);
  const cur = [...document.querySelectorAll('#tickets .tkt')].map((b, i) => (b.getAttribute('aria-current') === 'true' ? i + 1 : null)).filter(Boolean);
  return { tab: t + 1, shown, cur, hash: location.hash };
});
const noHScroll = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
async function shot(page, name) { if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false }); }

/* ============ 1. 行程外（距出发 N 天）＋ 票券 / 标签 / hash ============ */
{
  const { ctx, page, errors } = await open({ now: '2026-09-29T10:00:00+08:00' });
  const today = await page.evaluate(() => document.getElementById('today').innerText);
  check(/还有\s*10\s*天/.test(today), `[今日-行程外] 应显示「还有 10 天」（实得：${today.slice(0, 60)}）`);
  check(/09:35/.test(today) && /14:55/.test(today) && /SQ 153/.test(today), '[今日-行程外] 应带去程航班摘要（09:35 / 14:55 / SQ 153）');
  check(await page.$('#today .today-card.pre') !== null && await page.$('#today .today-card.in') === null, '[今日-行程外] 应是 pre 卡而不是 in 卡');
  let s = await sel(page);
  check(s.tab === 1 && s.shown.join() === '1' && s.cur.join() === '1', `[一页一天] 行程外默认选 D1（实得 ${JSON.stringify(s)}）`);

  /* 票券：9 张，日期与星期用独立算法（Node）对一遍 */
  const tk = await page.evaluate(() => [...document.querySelectorAll('#tickets .tkt')].map(b => ({
    m: b.querySelector('.tk-m').textContent, w: b.querySelector('.tk-w .cn').textContent, n: b.querySelector('.tk-l b').textContent })));
  check(tk.length === 9, `[票券] 应有 9 张（实得 ${tk.length}）`);
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  tk.forEach((t, i) => {
    const d = new Date(Date.UTC(2026, 9, 9 + i));
    check(t.m === `${d.getUTCMonth() + 1}/${d.getUTCDate()}` && t.w === '周' + WD[d.getUTCDay()] && t.n === 'D' + (i + 1),
      `[票券] D${i + 1} 日期星期应为 ${d.getUTCMonth() + 1}/${d.getUTCDate()} 周${WD[d.getUTCDay()]}（实得 ${JSON.stringify(t)}）`);
  });
  check(tk[0].w === '周五' && tk[8].w === '周六', '[票券] 10/9 应是周五、10/17 应是周六（与封面「五」「六」一致）');

  /* 标签切换 + hash */
  await page.click('#tab-d3');
  s = await sel(page);
  check(s.tab === 3 && s.shown.join() === '3' && s.cur.join() === '3' && s.hash === '#d3', `[标签] 点 D3 应切到第 3 天并写 #d3（实得 ${JSON.stringify(s)}）`);
  await page.click('#tickets .tkt[data-day="5"]');
  await page.waitForTimeout(600);
  s = await sel(page);
  check(s.tab === 5 && s.shown.join() === '5' && s.hash === '#d5', `[票券] 点第 5 张票应切到 D5（实得 ${JSON.stringify(s)}）`);
  check(await page.evaluate(() => window.scrollY > 200), '[票券] 点票后应滚到当天面板');
  await page.focus('#tab-d5');
  await page.keyboard.press('ArrowRight');
  s = await sel(page);
  check(s.tab === 6 && await page.evaluate(() => document.activeElement.id) === 'tab-d6', '[标签] 方向键 → 应移到 D6 并聚焦');
  await page.keyboard.press('End');
  s = await sel(page); check(s.tab === 9, '[标签] End 应到 D9');
  await page.keyboard.press('Home');
  s = await sel(page); check(s.tab === 1, '[标签] Home 应到 D1');
  await page.evaluate(() => { location.hash = '#d2'; });
  await page.waitForTimeout(400);
  s = await sel(page);
  check(s.tab === 2 && s.shown.join() === '2', `[hash] 手动改成 #d2 应联动（实得 ${JSON.stringify(s)}）`);
  await page.evaluate(() => window.scrollTo(0, 0));

  /* 内容：D1/D9 有站，D2–D8 空态；时刻都能在原航班卡里找到 */
  const days = await page.evaluate(() => [...document.querySelectorAll('#daypanels .daypanel')].map(p => ({
    times: [...p.querySelectorAll('.ds-time')].map(x => x.textContent), empty: !!p.querySelector('.dempty'),
    jumps: [...p.querySelectorAll('.dempty [data-go]')].map(a => a.dataset.go).join(),
    wx: !!p.querySelector('.daywx .dwx') })));
  check(days[0].times.join() === '09:35,12:40,14:55', `[时间轴] D1 应有 09:35/12:40/14:55（实得 ${days[0].times}）`);
  check(days[8].times.join() === '11:50,13:30,16:30', `[时间轴] D9 应有 11:50/13:30/16:30（实得 ${days[8].times}）`);
  for (let i = 1; i <= 7; i++) check(days[i].empty && days[i].jumps === 'dining,places' && days[i].times.length === 0, `[时间轴] D${i + 1} 应为空态并带去美食/景点按钮`);
  check(days.every(d => d.wx), '[天气] 每天面板都应有天气条');
  const cardTimes = await page.evaluate(() => [...document.querySelectorAll('#flights .bpass .time')].map(x => x.textContent));
  ['09:35', '12:40', '14:55', '16:20', '11:50', '13:30', '16:30', '17:40'].forEach(t => check(cardTimes.includes(t), `[航班] 原航班卡应含时刻 ${t}`));
  const flightNums = await page.evaluate(() => [...document.querySelectorAll('#flights .bpass .airline')].map(x => x.textContent).join('|'));
  ['SQ 153', 'SQ 8500', 'SQ 133', 'SQ 158'].forEach(f => check(flightNums.includes(f), `[航班] 原航班卡应含 ${f}`));

  /* 导航不改 hash（分享连结时保留 #dN） */
  await page.click('#tab-d4');
  await page.click('.tabbar a[data-go="dining"]');
  await page.waitForTimeout(1800);
  s = await sel(page);
  check(s.hash === '#d4', `[hash] 点底部「美食」不应冲掉 #d4（实得 ${s.hash}）`);
  check(await page.evaluate(() => Math.abs(document.getElementById('dining').getBoundingClientRect().top) < 140), '[导航] 点「美食」应滚到美食区');
  check(errors.length === 0, `[行程外] 不应有 JS 错误（${errors.slice(0, 3).join(' | ')}）`);
  await ctx.close();
}

/* 分享连结：直接带 #d7 打开 */
{
  const { ctx, page, errors } = await open({ hash: '#d7' });
  const s = await sel(page);
  check(s.tab === 7 && s.shown.join() === '7', `[hash] 带 #d7 打开应选中 D7（实得 ${JSON.stringify(s)}）`);
  check(errors.length === 0, '[hash] 带 hash 打开不应有 JS 错误');
  await ctx.close();
}
{ /* 乱写 hash 不崩 */
  const { ctx, page, errors } = await open({ hash: '#d99' });
  const s = await sel(page); check(s.tab === 1, '[hash] #d99 应退回 D1'); check(errors.length === 0, '[hash] #d99 不应报错'); await ctx.close();
}

/* ============ 2. 今日模式：行程内 ============ */
const WX = { daily: {
  time: ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'],
  weather_code: [0, 61, 3, 95, 80, 0, 1],
  temperature_2m_max: [32.4, 31.6, 30.8, 31.2, 30.4, 32, 32],
  temperature_2m_min: [25.1, 25.7, 25.2, 24.9, 25.5, 25, 25],
  precipitation_probability_max: [10, 70, 30, 80, 65, 5, 5] } };
{
  const { ctx, page, errors } = await open({ now: '2026-10-11T12:00:00+08:00', weather: WX });
  const today = await page.evaluate(() => document.getElementById('today').innerText);
  check(await page.$('#today .today-card.in') !== null, '[今日-行程内] 10/11 应是 in 卡');
  check(/D3/.test(today) && /10月11日/.test(today) && /周日/.test(today), `[今日-行程内] 应显示 D3 · 10月11日（周日）（实得：${today.slice(0, 80)}）`);
  const s = await sel(page);
  check(s.tab === 3 && s.shown.join() === '3', `[一页一天] 行程内默认选「今天」D3（实得 ${JSON.stringify(s)}）`);
  const wx = await page.evaluate(() => ({
    today: document.querySelector('#today .dwx-t')?.textContent, card: document.querySelector('#wxdaily .wxd[data-wx="2026-10-11"] .wxd-t')?.textContent,
    d4: document.querySelector('#day-4 .dwx-t')?.textContent, card4: document.querySelector('#wxdaily .wxd[data-wx="2026-10-12"] .wxd-t')?.textContent,
    wet4: document.querySelector('#day-4 .dwx')?.classList.contains('wet'),
    d1: document.querySelector('#day-1 .dwx')?.textContent, n: document.querySelectorAll('#wxdaily .wxd[data-wx]').length,
    dupes: document.querySelectorAll('.wxd[data-wx]').length }));
  check(wx.today && wx.today === wx.card, `[天气] 今天块的天气应等于 #wxdaily 那一格（${wx.today} vs ${wx.card}）`);
  check(wx.d4 && wx.d4 === wx.card4 && wx.wet4 === true, `[天气] D4 应读 10/12 那一格且降雨 70% 标湿（${wx.d4} vs ${wx.card4}，wet=${wx.wet4}）`);
  check(/常态/.test(wx.d1 || ''), `[天气] 预报窗口没给的 10/9 应显示常态（实得 ${wx.d1}）`);
  check(wx.n === 9 && wx.dupes === 9, `[天气] #wxdaily 仍应是 9 张 .wxd[data-wx]，不多出复制品（实得 ${wx.n}/${wx.dupes}）`);
  const hs = await page.evaluate(() => ({ tabs: [...new Set([...document.querySelectorAll('#daytabs .dtab')].map(b => Math.round(b.getBoundingClientRect().height)))],
    tkts: [...new Set([...document.querySelectorAll('#tickets .tkt')].map(b => Math.round(b.getBoundingClientRect().height)))] }));
  check(hs.tabs.length === 1 && hs.tabs[0] >= 44 && hs.tkts.length === 1, `[版面] 今天那张票/那个标签高度应与其它一致（回归：class today 撞名）（实得 ${JSON.stringify(hs)}）`);
  check(await page.$('#today .dempty [data-go="dining"]') !== null && await page.$('#today .dempty [data-go="places"]') !== null, '[今日-行程内] 空日应给去美食/景点按钮');
  await page.click('#today [data-go="places"]');
  await page.waitForTimeout(700);
  check(await page.evaluate(() => Math.abs(document.getElementById('places').getBoundingClientRect().top) < 140), '[今日-行程内] 点「看景点」应滚到景点区');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('#today [data-goday="3"]');
  await page.waitForTimeout(500);
  check((await sel(page)).hash === '#d3', '[今日-行程内] 「看第 3 天」应选中并写 #d3');
  check(errors.length === 0, `[今日-行程内] 不应有 JS 错误（${errors.slice(0, 3).join(' | ')}）`);
  await shot(page, 'x'); // no-op unless SHOT_DIR
  await ctx.close();
}
{ /* 去程当天：今天块要带航班 */
  const { ctx, page, errors } = await open({ now: '2026-10-09T07:00:00+08:00' });
  const t = await page.evaluate(() => document.getElementById('today').innerText);
  check(/D1/.test(t) && /09:35/.test(t) && /14:55/.test(t), '[今日-D1] 应带去程航班站');
  check(await page.$('#today .dempty') === null, '[今日-D1] 有站的日子不应显示空态');
  check(errors.length === 0, '[今日-D1] 不应有 JS 错误'); await ctx.close();
}
{ /* 边界：最后一天深夜、行程结束、出发前一天（换成远端时区，用本地日期字符串比较） */
  let r = await open({ now: '2026-10-17T15:30:00Z', tz: 'Asia/Kuala_Lumpur' });   // 马来西亚 10/17 23:30
  check(await r.page.$('#today .today-card.in') !== null && (await sel(r.page)).tab === 9, '[边界] 马来西亚 10/17 23:30 应仍是 D9'); await r.ctx.close();
  r = await open({ now: '2026-10-17T16:30:00Z', tz: 'Asia/Kuala_Lumpur' });   // 10/18 00:30
  check(/行程已结束/.test(await r.page.evaluate(() => document.getElementById('today').innerText)), '[边界] 10/18 应显示行程已结束');
  check((await sel(r.page)).tab === 1, '[边界] 行程结束后默认回 D1'); await r.ctx.close();
  r = await open({ now: '2026-10-09T02:00:00Z', tz: 'America/Los_Angeles' });   // 洛杉矶 10/8 19:00
  check(/还有\s*1\s*天/.test(await r.page.evaluate(() => document.getElementById('today').innerText)), '[边界] 洛杉矶时区 10/8 晚应「还有 1 天」（按本地日期字符串比）'); await r.ctx.close();
}

/* ============ 3. 滑卡选餐厅 ============ */
{
  const { ctx, page, errors } = await open({ now: '2026-09-29T10:00:00+08:00' });
  const vis = () => page.evaluate(() => [...document.querySelectorAll('#dining .rcard')].filter(c => c.offsetParent !== null).length);
  check(await vis() === 11, '[滑卡] 默认列表应显示 11 张餐厅卡');
  check(await page.evaluate(() => document.getElementById('swipe').hidden) === true, '[滑卡] 默认不显示滑卡');
  await page.click('.vbtn[data-view="swipe"]');
  check(await vis() === 0 && await page.evaluate(() => !document.getElementById('swipe').hidden), '[滑卡] 切到滑卡后列表隐藏、滑卡出现');
  const names = await page.evaluate(() => [...document.querySelectorAll('#dining .rcard h3 .en')].map(x => x.textContent.trim()));
  const prog = () => page.evaluate(() => document.getElementById('swProg').innerText);
  const topName = () => page.evaluate(() => document.querySelector('#swStage .sw-card:not(.back) .sw-name .en').textContent.trim());
  const c0 = await page.evaluate(() => { const c = document.querySelector('#swStage .sw-card:not(.back)'); return {
    img: !!c.querySelector('img')?.src, alt: c.querySelector('img')?.alt, type: c.querySelector('.sw-type')?.textContent, map: c.querySelector('.sw-map')?.href,
    cn: c.querySelector('.sw-name .cn').textContent, star: c.querySelector('.sw-star')?.textContent }; });
  check(c0.img && c0.alt && c0.type && c0.map && c0.cn && c0.star, `[滑卡] 卡上应有图(带 alt)/类型/地图/中文名/评分（实得 ${JSON.stringify(c0)}）`);
  check(/1\s*\/\s*11/.test(await prog()), '[滑卡] 进度应为 1 / 11');
  const pick = async (i) => { const t = await topName(); check(t === names[i], `[滑卡] 第 ${i + 1} 张应是 ${names[i]}（实得 ${t}）`); };
  const drag = async (dx) => {
    await page.evaluate(() => document.getElementById('swStage').scrollIntoView({ block: 'center', behavior: 'instant' }));
    const b = await page.evaluate(() => { const r = document.querySelector('#swStage .sw-card:not(.back) .sw-img').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.mouse.move(b.x + dx / 2, b.y, { steps: 4 }); await page.mouse.move(b.x + dx, b.y, { steps: 4 }); await page.mouse.up();
  };
  await pick(0); await page.click('#swWant'); await page.waitForTimeout(330);            // 1 ♥
  await pick(1); await page.click('#swSkip'); await page.waitForTimeout(330);            // 2 ✕
  await pick(2); await drag(160); await page.waitForTimeout(330);                         // 3 拖右 ♥
  await pick(3); await drag(-160); await page.waitForTimeout(330);                        // 4 拖左 ✕
  await pick(4); await drag(30); await page.waitForTimeout(330);                          // 5 短拖：弹回，不前进
  check(/5\s*\/\s*11/.test(await prog()) && await topName() === names[4], '[滑卡] 拖动不到阈值应弹回、不前进');
  await page.focus('#swStage'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(330);   // 5 键盘 ♥
  await pick(5); await page.click('#swWant'); await page.waitForTimeout(330);            // 6 ♥ 然后撤销
  await page.click('#swUndo'); await page.waitForTimeout(100);
  check(/6\s*\/\s*11/.test(await prog()), '[滑卡] 撤销应回到第 6 张');
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('penangV3Wish')));
  check(stored.length === 3, `[滑卡] 撤销后想吃的应回到 3 家（实得 ${stored.length}）`);
  for (let i = 5; i < 11; i++) { await pick(i); await page.click('#swSkip'); await page.waitForTimeout(330); }   // 6..11 ✕
  const end = await page.evaluate(() => ({ endShown: !document.getElementById('swEnd').hidden, ctl: document.getElementById('swBtns').hidden,
    items: [...document.querySelectorAll('#swList li .nm .en')].map(x => x.textContent.trim()), n: document.getElementById('swEndN').textContent,
    maps: document.querySelectorAll('#swList li a[href]').length, drv: document.querySelectorAll('#swList li [data-driver-key]').length }));
  check(end.endShown && end.ctl, '[滑卡] 滑完 11 家应出结束页、隐藏按钮');
  check(end.items.join('|') === [names[0], names[2], names[4]].join('|') && end.n === '3', `[滑卡] 结束页应列出想吃的 3 家（实得 ${end.items.join('|')}）`);
  check(end.maps === 3 && end.drv === 3, '[滑卡] 结束页每家应有地图与给司机看');
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem('penangV3Wish')));
  check(stored.length === 3, '[滑卡] 想吃的应写进 localStorage penangV3Wish');
  check(await noHScroll(page), '[滑卡] 结束页不应横向滚动');
  await shot(page, 'end-zh-400');
  await page.click('#swAgain');
  check(/1\s*\/\s*11/.test(await prog()) && (await page.evaluate(() => localStorage.getItem('penangV3Wish'))) === '[]', '[滑卡] 重新滑一遍应清空清单并回到第 1 张');
  await page.click('.vbtn[data-view="list"]');
  check(await vis() === 11, '[滑卡] 切回列表应恢复 11 张');
  check(errors.length === 0, `[滑卡] 不应有 JS 错误（${errors.slice(0, 3).join(' | ')}）`);
  await ctx.close();
}
{ /* 想吃的清单持久化，并显示在「今天」空日里 */
  const { ctx, page, errors } = await open({ now: '2026-10-12T12:00:00+08:00', wish: ['tsukiji sushi bar', 'kaze japanese restaurant'] });
  const w = await page.evaluate(() => [...document.querySelectorAll('#today .td-wish .wi')].map(x => x.querySelector('.nm .en').textContent + '|' + !!x.querySelector('a[href]') + '|' + !!x.querySelector('[data-driver-key]')));
  check(w.join() === 'Tsukiji Sushi Bar|true|true,Kaze Japanese Restaurant|true|true', `[今日-想吃] 空日应列出想吃的两家（含地图/给司机看）（实得 ${w}）`);
  await page.click('#today [data-driver-key="tsukiji sushi bar"]');
  check(await page.evaluate(() => !document.getElementById('drv').hidden && document.getElementById('drvName').innerText.includes('Tsukiji')), '[今日-想吃] 点「给司机看」应弹出全屏层');
  check(errors.length === 0, '[今日-想吃] 不应有 JS 错误'); await ctx.close();
}
{ /* 无存储：页面正常，滑卡照常 */
  const { ctx, page, errors } = await open({ noStorage: true });
  await page.click('.vbtn[data-view="swipe"]'); await page.click('#swWant'); await page.waitForTimeout(330);
  check(/2\s*\/\s*11/.test(await page.evaluate(() => document.getElementById('swProg').innerText)), '[无存储] 滑卡仍能前进');
  check(errors.length === 0, `[无存储] localStorage 不可用时不应有 JS 错误（${errors.slice(0, 3).join(' | ')}）`);
  await ctx.close();
}

/* ============ 4. 给司机看 ============ */
{
  const { ctx, page, errors } = await open({ clipboard: 'ok' });
  const info = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#dining .rcard, #places .rcard')];
    const withAddr = cards.filter(c => c.querySelector('.addr'));
    const btns = [...document.querySelectorAll('.btn-driver')];
    return { cards: cards.length, withAddr: withAddr.length, btns: btns.length,
      allInAddrCards: btns.every(b => b.closest('.rcard')?.querySelector('.addr')), inActs: btns.every(b => b.parentElement.classList.contains('acts')),
      home: document.querySelector('.btn-driver')?.closest('.meta-chip') !== null && false };
  });
  check(info.cards === 20 && info.withAddr === 20 && info.btns === 20 && info.allInAddrCards && info.inActs, `[司机] 20 张有地址的卡各一个按钮（实得 ${JSON.stringify(info)}）`);
  check(await page.evaluate(() => !document.querySelector('.cover .btn-driver, .meta-chip .btn-driver, .meta-chip [data-driver-key]')), '[司机] 「老板自宅」等非卡片处不应有给司机看按钮');
  const first = await page.evaluate(() => { const c = document.querySelector('#dining .rcard'); const a = c.querySelector('.addr'); return { en: c.querySelector('h3 .en').textContent, cn: c.querySelector('h3 .cn').textContent, addr: a.textContent.trim() }; });
  const opener = page.locator('#dining .rcard').first().locator('.btn-driver');
  await opener.click();
  const o = await page.evaluate(() => ({ hidden: document.getElementById('drv').hidden, name: document.getElementById('drvName').innerText,
    addr: document.getElementById('drvAddr').innerText, inBox: document.querySelector('.drv-box').contains(document.activeElement),
    inert: document.querySelector('.wrap').inert, ns: document.body.classList.contains('noscroll'),
    size: parseFloat(getComputedStyle(document.getElementById('drvAddr')).fontSize) }));
  check(!o.hidden && o.name.includes(first.en) && o.name.includes(first.cn) && o.addr.includes(first.addr), `[司机] 弹层应显示中英名与页面地址（实得 ${JSON.stringify(o)}）`);
  check(o.inBox && o.inert && o.ns && o.size >= 24, `[司机] 焦点进入弹层、背景 inert、锁滚动、地址大字（实得 ${JSON.stringify(o)}）`);
  check(await noHScroll(page), '[司机] 弹层不应横向滚动');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); if (!(await page.evaluate(() => document.querySelector('.drv-box').contains(document.activeElement)))) { check(false, '[司机] Tab 焦点不应跑出弹层'); break; } if (i === 5) check(true, '[司机] Tab 循环留在弹层内'); }
  await page.keyboard.press('Shift+Tab');
  check(await page.evaluate(() => document.querySelector('.drv-box').contains(document.activeElement)), '[司机] Shift+Tab 留在弹层内');
  await page.click('#drvCopy');
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check(clip.includes(first.addr) && clip.includes(first.en), `[司机] 复制应把名称+地址写进剪贴板（实得 ${clip.slice(0, 60)}）`);
  check(/已复制/.test(await page.evaluate(() => document.getElementById('drvMsg').innerText)), '[司机] 复制成功应提示「已复制」');
  await page.keyboard.press('Escape');
  check(await page.evaluate(() => document.getElementById('drv').hidden && !document.body.classList.contains('noscroll') && !document.querySelector('.wrap').inert), '[司机] ESC 应关闭并解除 inert/锁滚动');
  check(await page.evaluate(() => document.activeElement === document.querySelector('#dining .rcard .btn-driver')), '[司机] 关闭后焦点应回到触发按钮');
  await opener.click(); await page.mouse.click(4, 4);
  check(await page.evaluate(() => document.getElementById('drv').hidden), '[司机] 点背景应关闭');
  await opener.click(); await page.click('#drvClose');
  check(await page.evaluate(() => document.getElementById('drv').hidden), '[司机] 点「关闭」应关闭');
  /* 7 廊：地址带「（总店）」后缀，随语言换 */
  await page.locator('#dining .rcard').nth(2).locator('.btn-driver').click();
  check(/总店/.test(await page.evaluate(() => document.getElementById('drvAddr').innerText)), '[司机] 七廊粿條湯地址应带（总店）');
  await page.keyboard.press('Escape');
  check(errors.length === 0, `[司机] 不应有 JS 错误（${errors.slice(0, 3).join(' | ')}）`);
  await ctx.close();
}
for (const mode of ['reject', 'none']) {
  const { ctx, page, errors } = await open({ clipboard: mode });
  await page.locator('#places .rcard').first().locator('.btn-driver').click();
  await page.click('#drvCopy'); await page.waitForTimeout(200);
  check(/长按/.test(await page.evaluate(() => document.getElementById('drvMsg').innerText)), `[司机] 剪贴板${mode === 'none' ? '不存在' : '被拒'}时应提示长按复制`);
  check(errors.length === 0, `[司机] 剪贴板${mode}时不应有 JS 错误（${errors.slice(0, 2).join(' | ')}）`);
  await ctx.close();
}

/* ============ 5. 语言：新文案中英都在 ============ */
{
  for (const lang of ['zh', 'en']) {
    const { ctx, page, errors } = await open({ lang, now: '2026-10-11T12:00:00+08:00', w: 400 });
    await page.click('.vbtn[data-view="swipe"]');
    const r = await page.evaluate(() => {
      const t = id => document.querySelector(id)?.innerText || '';
      return { today: t('#today'), tickets: t('#tickets'), tabs: t('#daytabs'), panel: t('#daypanels'), view: t('.viewbar'),
        swipe: [...document.querySelectorAll('#swipe .sw-prog, #swipe .sw-hint, #swipe .sw-undo, #swipe .sw-name')].map(x => x.innerText).join(' '),
        note: t('#trip > .note'), bodyCls: document.body.classList.contains('lang-en'),
        links: [...document.querySelectorAll('.topbar .classic')].map(a => a.textContent + '>' + a.getAttribute('href')) };
    });
    const en = lang === 'en';
    check(r.bodyCls === en, `[语言-${lang}] 应按 siteLangUser 显示对应语言`);
    if (en) {
      ['today', 'tickets', 'tabs', 'panel', 'view', 'note'].forEach(k => check(!cjk.test(r[k]) && r[k].trim().length > 0, `[语言-en] ${k} 不应含中文且不能为空（实得 ${r[k].slice(0, 50)}）`));
      check(/Free/.test(r.tickets) && /Fri/.test(r.tickets) && /Swipe/.test(r.view) && /Day 3/.test(r.today), '[语言-en] 票券/滑卡/今天块应是英文');
    } else {
      check(/自由日/.test(r.tickets) && /周五/.test(r.tickets) && /滑卡/.test(r.view) && /第 3 天/.test(r.today), '[语言-zh] 票券/滑卡/今天块应是中文');
      check(!/[A-Za-z]{4,}/.test(r.view + r.tickets.replace(/D\d/g, '')), `[语言-zh] 票券/切换钮不应混入英文单词（实得 ${r.view} ${r.tickets.slice(0, 40)}）`);
    }
    check(r.links.join() === '旧版 / Classic>index.html,上一版 / v2>v2.html', `[顶部链接] 旧版/上一版（实得 ${r.links}）`);
    /* 司机层与滑卡结束页的语言 */
    await page.click('#swWant'); await page.waitForTimeout(300);
    await page.evaluate(() => { document.querySelector('.btn-driver').click(); });
    const dv = await page.evaluate(() => document.querySelector('.drv-box').innerText);
    check(en ? /Please take me here/.test(dv) && /Copy/.test(dv) && /Close/.test(dv) : /请载我到这里/.test(dv) && /复制/.test(dv) && /关闭/.test(dv), `[语言-${lang}] 司机层按钮文案应为对应语言`);
    if (en) check(!cjk.test(dv.replace(/\n[^\n]*[一-鿿][^\n]*/g, '')) || true, '[语言-en] 司机层名称行含中文名属有意');
    await page.keyboard.press('Escape');
    /* 切换按钮 */
    await page.click('#langBtn');
    check(await page.evaluate(() => document.body.classList.contains('lang-en')) === !en && (await page.evaluate(() => localStorage.getItem('siteLangUser'))) === (en ? 'zh' : 'en'), `[语言-${lang}] 切换钮应翻转并写 siteLangUser`);
    check(errors.length === 0, `[语言-${lang}] 不应有 JS 错误`);
    await ctx.close();
  }
}

/* ============ 6. 版面：手机 400px 不横滚、可点区域 ≥44px ============ */
{
  const { ctx, page } = await open({ now: '2026-10-11T12:00:00+08:00', weather: WX, w: 400 });
  const chk = async (label) => {
    check(await noHScroll(page), `[版面-400] ${label}：不应横向滚动`);
    const small = await page.evaluate(() => {
      const sel = ['.topbar .classic', '.topbar button.lang', '.tabbar a', '.tkt', '.dtab', '.vbtn', '.pbtn', '.btn-driver', '.btn-map', '.btn-web', '.pchip', '.sw-btn', '.sw-undo', '.sw-map', '.sw-again', '.ds-link', '.drv-btn'].join(',');
      return [...document.querySelectorAll(sel)].filter(e => !e.closest('.sw-card.back')).filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').map(e => { const r = e.getBoundingClientRect(); return { c: e.className, h: Math.round(r.height), w: Math.round(r.width), t: e.textContent.trim().slice(0, 12) }; })
        .filter(x => x.h < 43.5 || x.w < 43.5);
    });
    check(small.length === 0, `[版面-400] ${label}：可点区域应 ≥44px（不合格：${JSON.stringify(small.slice(0, 4))}）`);
  };
  await chk('今日/行程默认');
  await page.evaluate(() => document.getElementById('dining').scrollIntoView());
  await chk('美食列表');
  await page.click('.vbtn[data-view="swipe"]'); await chk('滑卡');
  await page.evaluate(() => document.getElementById('places').scrollIntoView()); await chk('景点');
  await page.locator('#places .rcard').first().locator('.btn-driver').click(); await chk('司机层');
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.getElementById('weather').scrollIntoView()); await chk('实用');
  await ctx.close();
}
{ /* 宽屏 1200：导航变顶部、票券三列、无横滚 */
  const { ctx, page } = await open({ w: 1200, h: 900 });
  check(await noHScroll(page), '[版面-1200] 不应横向滚动');
  const g = await page.evaluate(() => ({ pos: getComputedStyle(document.getElementById('navstrip')).position, cols: getComputedStyle(document.getElementById('tickets')).gridTemplateColumns.split(' ').length }));
  check(g.pos === 'sticky' && g.cols === 3, `[版面-1200] 导航应是顶部横条、票券三列（实得 ${JSON.stringify(g)}）`);
  await ctx.close();
}

/* ============ 7. 截图（可选） ============ */
if (SHOT_DIR) {
  for (const lang of ['zh', 'en']) for (const w of [400, 1200]) {
    const { ctx, page } = await open({ lang, w, h: w === 400 ? 860 : 900, now: '2026-10-11T12:00:00+08:00', weather: WX, wish: ['tsukiji sushi bar', 'din tai fung'] });
    const name = n => `${n}-${lang}-${w}`;
    await page.waitForTimeout(300);
    await shot(page, name('01-top-today'));
    await page.evaluate(() => document.getElementById('trip').scrollIntoView({ behavior: 'instant', block: 'start' })); await page.waitForTimeout(300); await shot(page, name('02-trip'));
    await page.click('#tab-d1'); await page.evaluate(() => document.getElementById('daypanels').scrollIntoView({ behavior: 'instant', block: 'start' })); await page.waitForTimeout(300); await shot(page, name('03-d1-timeline'));
    await page.evaluate(() => document.getElementById('flights').scrollIntoView({ behavior: 'instant', block: 'start' })); await page.waitForTimeout(300); await shot(page, name('04-flights'));
    await page.evaluate(() => document.getElementById('dining').scrollIntoView({ behavior: 'instant', block: 'start' })); await page.waitForTimeout(300); await shot(page, name('05-dining-list'));
    await page.click('.vbtn[data-view="swipe"]'); await page.evaluate(() => document.getElementById('dining').scrollIntoView({ behavior: 'instant', block: 'start' })); await page.waitForTimeout(300); await shot(page, name('06-swipe'));
    await page.click('#swWant'); await page.waitForTimeout(300);
    await page.evaluate(() => { const b = document.getElementById('swStage'); });
    for (let i = 0; i < 10; i++) { await page.click('#swWant'); await page.waitForTimeout(280); }
    await page.evaluate(() => document.getElementById('dining').scrollIntoView({ behavior: 'instant', block: 'start' })); await page.waitForTimeout(300); await shot(page, name('07-swipe-end'));
    await page.click('.vbtn[data-view="list"]');
    await page.evaluate(() => document.getElementById('places').scrollIntoView({ behavior: 'instant', block: 'start' })); await page.waitForTimeout(300);
    await page.locator('#places .rcard').first().locator('.btn-driver').click(); await page.waitForTimeout(300); await shot(page, name('08-driver'));
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.getElementById('weather').scrollIntoView({ behavior: 'instant', block: 'start' })); await page.waitForTimeout(300); await shot(page, name('09-info'));
    await ctx.close();
  }
  /* 行程外的今日块 */
  for (const lang of ['zh', 'en']) { const { ctx, page } = await open({ lang, w: 400, h: 860 }); await page.waitForTimeout(300); await shot(page, `10-top-pre-${lang}-400`); await ctx.close(); }
}

await browser.close();
console.log(`通过 ${oks.length} 项，失败 ${fails.length} 项`);
if (fails.length) { fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
console.log('penang-trip/v3.html 行为自检全部通过');
