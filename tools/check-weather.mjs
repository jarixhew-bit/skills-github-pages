/**
 * singapore-trip/index.html 与 penang-trip/index.html 每日天气的自检
 * —— 真浏览器跑，Playwright（两页共用同一套 open-meteo 前端现抓机制，合在一个脚本里）。
 *
 * 跑法：
 *   python3 -m http.server 8899 &
 *   node tools/check-weather.mjs
 * 沙盒里浏览器装在别处，要带 CHROMIUM_PATH=/opt/pw-browsers/chromium。
 * （`python3 tools/check-all.py` 会自动起 server 并带上 CHROMIUM_PATH。）
 *
 * 为什么要真浏览器：这条天气是**前端现抓** open-meteo 再自己渲染的，读代码看不出
 * 它在三种情况下会长什么样——预报正常、日期还在预报窗口外、以及 API 挂掉。手册是
 * 出门当天要看的东西，天气条开天窗或写错日期，比不放还糟。
 *
 * === singapore-trip：天气条挂在每天的行程卡片上 ===
 * 三个情境全部用 route 拦截造出来，不打真的 open-meteo：
 *   1. 正常回应 → 每天显示自己那一天的温度与降雨机率，且降雨≥60% 要标红（.wet）；
 *   2. 日期超出预报范围（API 只回前两天）→ 其余日子退回「九月常态」文案，不留空白；
 *   3. API 500 → 全部退回常态文案，且不得抛 JS 错误；
 *   4. 整趟都还在 16 天窗口外（现在就是这样）→ **根本不打 API**：打了会拿到 400，
 *      画面写成「抓不到（可能没网）」会害人跑去查 WiFi。
 * 「今天」一律用 page.clock 固定住，否则这份自检的结果会随跑的日子改变。
 * 另外验行程内每一天都配了天气条与雨天备案（加了一天却忘了配，就是这里挡下来）。
 *
 * === penang-trip：没有逐日行程列，天气独立成 #weather 一个区块 ===
 * 结构不同，情境改成三种：
 *   1. 整趟（10/9–10/17）都在 16 天窗口外（现在就是，2026-08-21 距 10/9 有 49 天）
 *      → 不发请求，只显示「距出发还有 N 天」倒数提示 + 历史气候平均卡片（page 里本来就有），
 *      逐日预报行 `#wxdaily` 保持 hidden；
 *   2. 进窗口后抓到 → `#wxdaily` 显示，9 张 `.wxd[data-wx]` 卡片按日期对齐渲染，
 *      降雨≥60% 标 `.wet`；若 API 只回部分天数，缺的那几天单卡退回「常态」文案而不是空白；
 *   3. API 失败 → 静默退回倒数提示样式（带一句「暂时取不到实时预报」），`#wxdaily` 仍 hidden，
 *      不留空卡片、不抛 JS 错误。
 */
import { chromium } from 'playwright';

const PORT = process.env.CHECK_PORT || 8899;
const SG_URL = `http://localhost:${PORT}/singapore-trip/`;
const PGT_URL = `http://localhost:${PORT}/penang-trip/`;
const API = 'https://api.open-meteo.com/**';

const fails = [];
const ok = [];
function check(cond, label) { (cond ? ok : fails).push(label); }

/* 固定 fixture：五天，最后一天特意给 80% 降雨，验标红那条路径 */
const DATES = ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];
const FULL = {
  daily: {
    time: DATES,
    weather_code: [0, 3, 61, 95, 80],
    temperature_2m_max: [32.4, 31.6, 30.8, 31.2, 30.4],
    temperature_2m_min: [26.1, 25.7, 25.2, 25.9, 25.5],
    precipitation_probability_max: [10, 30, 55, 45, 80],
  },
};
/* 只回前两天：模拟「行程还远，预报只到某一天」 */
const PARTIAL = {
  daily: {
    time: DATES.slice(0, 2),
    weather_code: [0, 3],
    temperature_2m_max: [32.4, 31.6],
    temperature_2m_min: [26.1, 25.7],
    precipitation_probability_max: [10, 30],
  },
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

async function load(handler, now) {
  let called = false;
  await page.route(API, r => { called = true; return handler(r); });
  await page.clock.setFixedTime(new Date(now));
  await page.goto(SG_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => [...document.querySelectorAll('.wx[data-wx]')].every(b => b.textContent && !/载入中|Loading/.test(b.textContent)),
    null, { timeout: 10000 },
  );
  const texts = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.wx[data-wx]').forEach(b => { out[b.dataset.wx] = b.textContent; });
    return out;
  });
  await page.unroute(API);
  return { texts, called };
}

/* ---- 1. 每天都要有天气条与雨天备案，日期还得对得上 ---- */
await page.goto(SG_URL, { waitUntil: 'domcontentloaded' });
const structure = await page.evaluate(() =>
  [...document.querySelectorAll('.day[data-date]')].map(d => ({
    date: d.dataset.date,
    wx: d.querySelector('.wx[data-wx]')?.dataset.wx || null,
    rain: !!d.querySelector('.rainplan .cn')?.textContent.trim(),
    rainEn: !!d.querySelector('.rainplan .en')?.textContent.trim(),
  })));
check(structure.length === 5, `行程应有 5 天（实得 ${structure.length}）`);
structure.forEach(d => {
  check(d.wx === d.date, `${d.date} 的天气条日期要跟当天一致（实得 ${d.wx}）`);
  check(d.rain && d.rainEn, `${d.date} 的雨天备案中英文都要有`);
});

/* ---- 2. 预报正常 ---- */
const IN_WINDOW = '2026-09-22T09:00:00+08:00';   // 出发前一天：五天全在预报窗口内
const TOO_EARLY = '2026-08-19T09:00:00+08:00';  // 出发前一个多月：整趟都还报不了
const { texts: full, called: fullCalled } = await load(r => r.fulfill({ json: FULL }), IN_WINDOW);
check(fullCalled, '行程已进入预报窗口时应该真的去打 API');
check(/26–32°C/.test(full['2026-09-23']), `9/23 应显示 26–32°C（实得：${full['2026-09-23']}）`);
check(/10%/.test(full['2026-09-23']), '9/23 应显示降雨机率 10%');
check(/26–31°C/.test(full['2026-09-26']), `9/26 应显示 26–31°C（实得：${full['2026-09-26']}）`);
check(/80%/.test(full['2026-09-27']), '9/27 应显示降雨机率 80%');
// 每天读的是自己那一格，不是整排错位（错位会把别天的数字安到今天头上）
check(!/32/.test(full['2026-09-25']), `9/25 不该出现 9/23 的高温（实得：${full['2026-09-25']}）`);
const wet = await page.evaluate(() =>
  [...document.querySelectorAll('.wx.wet')].map(b => b.dataset.wx));
check(wet.length === 1 && wet[0] === '2026-09-27', `只有降雨≥60% 的 9/27 该标红（实得 ${JSON.stringify(wet)}）`);

/* ---- 3. 日期还在预报窗口外 ---- */
const { texts: partial } = await load(r => r.fulfill({ json: PARTIAL }), IN_WINDOW);
check(/26–32°C/.test(partial['2026-09-23']), '有预报的那天照常显示温度');
['2026-09-25', '2026-09-26', '2026-09-27'].forEach(d => {
  check(/九月常态|typical September/i.test(partial[d]) && !/°C · 降雨/.test(partial[d]),
    `${d} 无预报时要退回常态文案（实得：${partial[d]}）`);
});

/* ---- 4. API 挂掉 ---- */
const { texts: down } = await load(r => r.fulfill({ status: 500, body: 'boom' }), IN_WINDOW);
DATES.forEach(d => {
  check(/九月常态|typical September/i.test(down[d]), `${d} 在 API 挂掉时仍要有文案（实得：${down[d]}）`);
});

/* ---- 5. 整趟都还在预报窗口外：不打 API，也不能写成「没网」 ---- */
const { texts: early, called: earlyCalled } = await load(r => r.fulfill({ json: FULL }), TOO_EARLY);
check(!earlyCalled, '整趟都还在 16 天窗口外时不该去打 API（打了会拿到 400）');
DATES.forEach(d => {
  check(/还没到能报的时候|Too early/i.test(early[d]),
    `${d} 应写「还没到能报的时候」而不是抓不到（实得：${early[d]}）`);
  check(!/抓不到|unavailable/i.test(early[d]), `${d} 不该显示成「抓不到（可能没网）」`);
});

check(errors.length === 0, `[singapore] 不应有 JS 错误（实得：${errors.slice(0, 3).join(' | ')}）`);

/* ============================================================
 * penang-trip：没有逐日行程列，天气条独立成 #weather 区块里的
 * #wxNote（倒数/状态提示）+ #wxdaily（9 张 .wxd[data-wx] 卡片，进窗口才显示）。
 * ============================================================ */
const PGT_DATES = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13',
  '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'];
const PGT_FULL = {
  daily: {
    time: PGT_DATES,
    weather_code: [0, 3, 61, 80, 95, 2, 51, 63, 45],
    temperature_2m_max: [31.4, 32.1, 29.8, 30.5, 31.0, 32.6, 30.2, 29.5, 31.8],
    temperature_2m_min: [24.6, 25.0, 24.1, 24.8, 24.3, 25.2, 24.0, 23.9, 24.7],
    precipitation_probability_max: [20, 35, 55, 70, 40, 15, 45, 25, 50],
  },
};
/* 只回前 3 天：模拟「API 只回了窗口内那几天，其余的还没进 16 天窗口」 */
const PGT_PARTIAL = {
  daily: {
    time: PGT_DATES.slice(0, 3),
    weather_code: PGT_FULL.daily.weather_code.slice(0, 3),
    temperature_2m_max: PGT_FULL.daily.temperature_2m_max.slice(0, 3),
    temperature_2m_min: PGT_FULL.daily.temperature_2m_min.slice(0, 3),
    precipitation_probability_max: PGT_FULL.daily.precipitation_probability_max.slice(0, 3),
  },
};

const pgtPage = await browser.newPage({ timezoneId: 'Asia/Kuala_Lumpur' });
const pgtErrors = [];
pgtPage.on('pageerror', e => pgtErrors.push(String(e)));

async function loadPGT(handler, now) {
  let called = false;
  await pgtPage.route(API, r => { called = true; return handler(r); });
  await pgtPage.clock.setFixedTime(new Date(now));
  await pgtPage.goto(PGT_URL, { waitUntil: 'domcontentloaded' });
  await pgtPage.waitForFunction(
    () => {
      const n = document.getElementById('wxNote');
      return n && n.textContent && !/载入中|Loading weather/.test(n.textContent);
    },
    null, { timeout: 10000 },
  );
  const state = await pgtPage.evaluate(() => {
    const note = document.getElementById('wxNote');
    const daily = document.getElementById('wxdaily');
    const cards = {};
    daily.querySelectorAll('.wxd[data-wx]').forEach(c => { cards[c.dataset.wx] = c.textContent; });
    return {
      noteText: note.textContent,
      dailyHidden: daily.hidden,
      cardDates: [...daily.querySelectorAll('.wxd[data-wx]')].map(c => c.dataset.wx),
      wetDates: [...daily.querySelectorAll('.wxd.wet')].map(c => c.dataset.wx),
      cards,
    };
  });
  await pgtPage.unroute(API);
  return { ...state, called };
}

/* ---- 1. 整趟都在 16 天窗口外（现在就是：距 10/9 约 49 天）→ 不发请求，只显示倒数 ---- */
const PGT_TOO_EARLY = '2026-08-21T09:00:00+08:00';
const pgtEarly = await loadPGT(r => r.fulfill({ json: PGT_FULL }), PGT_TOO_EARLY);
check(!pgtEarly.called, '[penang] 整趟都在 16 天窗口外时不该去打 API（打了会拿到 400）');
check(/距出发还有\s*49\s*天|49 days to departure/.test(pgtEarly.noteText),
  `[penang] 窗口外应显示「距出发还有 49 天」（实得：${pgtEarly.noteText}）`);
check(pgtEarly.dailyHidden === true, '[penang] 窗口外时 #wxdaily 应保持隐藏');
check(!/暂时取不到|unavailable right now/.test(pgtEarly.noteText),
  '[penang] 窗口外不该误报成「取不到实时预报」（那是 API 失败才有的文案）');

/* ---- 2. 进窗口、抓到完整 9 天 → 渲染 9 张卡片，按日期对齐，降雨≥60% 标红 ---- */
const PGT_IN_WINDOW = '2026-10-05T09:00:00+08:00'; // 出发前 4 天：10/9–10/17 全部落在 16 天窗口内
const pgtFull = await loadPGT(r => r.fulfill({ json: PGT_FULL }), PGT_IN_WINDOW);
check(pgtFull.called, '[penang] 进窗口后应该真的去打 API');
check(pgtFull.dailyHidden === false, '[penang] 抓到预报后 #wxdaily 应该显示出来');
check(pgtFull.cardDates.length === 9 && PGT_DATES.every(d => pgtFull.cardDates.includes(d)),
  `[penang] 应渲染 9 张卡片，日期与行程一致（实得 ${JSON.stringify(pgtFull.cardDates)}）`);
check(/25–31/.test(pgtFull.cards['2026-10-09']), `[penang] 10/9 应显示 25–31°（实得：${pgtFull.cards['2026-10-09']}）`);
check(/20%/.test(pgtFull.cards['2026-10-09']), `[penang] 10/9 降雨机率应为 20%（实得：${pgtFull.cards['2026-10-09']}）`);
check(/25–33/.test(pgtFull.cards['2026-10-14']), `[penang] 10/14 应显示 25–33°（实得：${pgtFull.cards['2026-10-14']}）`);
check(/70%/.test(pgtFull.cards['2026-10-12']), `[penang] 10/12 降雨机率应为 70%（实得：${pgtFull.cards['2026-10-12']}）`);
// 每天读的是自己那一格，不是整排错位（10/14 的 32.6°高温不该跑到别天头上）
PGT_DATES.filter(d => d !== '2026-10-14').forEach(d => {
  check(!/32–33|33°/.test(pgtFull.cards[d]), `[penang] ${d} 不该混进 10/14 的高温（实得：${pgtFull.cards[d]}）`);
});
check(pgtFull.wetDates.length === 1 && pgtFull.wetDates[0] === '2026-10-12',
  `[penang] 只有降雨≥60% 的 10/12 该标 .wet（实得 ${JSON.stringify(pgtFull.wetDates)}）`);

/* ---- 3. 进窗口但 API 只回前 3 天 → 有的天显示预报，缺的天退回「常态」而不是空白 ---- */
const pgtPartial = await loadPGT(r => r.fulfill({ json: PGT_PARTIAL }), PGT_IN_WINDOW);
check(pgtPartial.dailyHidden === false, '[penang] 有部分预报时 #wxdaily 仍应显示');
check(/25–31/.test(pgtPartial.cards['2026-10-09']), '[penang] 有预报的那天照常显示温度');
PGT_DATES.slice(3).forEach(d => {
  check(/常态|avg/i.test(pgtPartial.cards[d]) && pgtPartial.cards[d].trim().length > 0,
    `[penang] ${d} 无预报时要退回「常态」文案、不能是空卡片（实得：${JSON.stringify(pgtPartial.cards[d])}）`);
});

/* ---- 4. API 挂掉 → 静默退回倒数提示样式，#wxdaily 隐藏，不留空白 ---- */
const pgtDown = await loadPGT(r => r.fulfill({ status: 500, body: 'boom' }), PGT_IN_WINDOW);
check(pgtDown.dailyHidden === true, '[penang] API 挂掉时 #wxdaily 应隐藏（不留空卡片行）');
check(/暂时取不到实时预报|live forecast unavailable/.test(pgtDown.noteText),
  `[penang] API 挂掉应提示「暂时取不到实时预报」（实得：${pgtDown.noteText}）`);
check(pgtDown.noteText.trim().length > 0, '[penang] API 挂掉时提示文字不能是空白');

check(pgtErrors.length === 0, `[penang] 不应有 JS 错误（实得：${pgtErrors.slice(0, 3).join(' | ')}）`);

await browser.close();

console.log(`通过 ${ok.length} 项`);
if (fails.length) {
  console.error(`\n未通过 ${fails.length} 项：`);
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('每日天气条自检全部通过');
