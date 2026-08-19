/**
 * singapore-trip/index.html 每日天气条的自检 —— 真浏览器跑，Playwright。
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
 * 三个情境全部用 route 拦截造出来，不打真的 open-meteo：
 *   1. 正常回应 → 每天显示自己那一天的温度与降雨机率，且降雨≥60% 要标红（.wet）；
 *   2. 日期超出预报范围（API 只回前两天）→ 其余日子退回「九月常态」文案，不留空白；
 *   3. API 500 → 全部退回常态文案，且不得抛 JS 错误。
 * 另外验行程内每一天都配了天气条与雨天备案（加了一天却忘了配，就是这里挡下来）。
 */
import { chromium } from 'playwright';

const PORT = process.env.CHECK_PORT || 8899;
const URL = `http://localhost:${PORT}/singapore-trip/`;
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

async function load(handler) {
  await page.route(API, handler);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
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
  return texts;
}

/* ---- 1. 每天都要有天气条与雨天备案，日期还得对得上 ---- */
await page.goto(URL, { waitUntil: 'domcontentloaded' });
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
const full = await load(r => r.fulfill({ json: FULL }));
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
const partial = await load(r => r.fulfill({ json: PARTIAL }));
check(/26–32°C/.test(partial['2026-09-23']), '有预报的那天照常显示温度');
['2026-09-25', '2026-09-26', '2026-09-27'].forEach(d => {
  check(/九月常态|typical September/i.test(partial[d]) && !/°C · 降雨/.test(partial[d]),
    `${d} 无预报时要退回常态文案（实得：${partial[d]}）`);
});

/* ---- 4. API 挂掉 ---- */
const down = await load(r => r.fulfill({ status: 500, body: 'boom' }));
DATES.forEach(d => {
  check(/九月常态|typical September/i.test(down[d]), `${d} 在 API 挂掉时仍要有文案（实得：${down[d]}）`);
});

check(errors.length === 0, `不应有 JS 错误（实得：${errors.slice(0, 3).join(' | ')}）`);

await browser.close();

console.log(`通过 ${ok.length} 项`);
if (fails.length) {
  console.error(`\n未通过 ${fails.length} 项：`);
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('每日天气条自检全部通过');
