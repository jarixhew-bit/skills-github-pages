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
const PSI_API = 'https://api.data.gov.sg/**';
const AIR_API = 'https://air-quality-api.open-meteo.com/**';

/* 实时空气质量的假资料。烟霾是这趟最可能打乱户外行程的变量，而它只有实时值、
   没有多日预报——所以要验的是「数字对不对、该不该标红、抓不到时会不会开天窗」。 */
const psiPayload = (readings) => ({
  items: [{ timestamp: '2026-09-25T12:00:00+08:00', readings: { psi_twenty_four_hourly: readings } }],
});
const PSI_MODERATE = psiPayload({ north: 70, south: 67, east: 74, west: 84, central: 90 });
const PSI_GOOD = psiPayload({ north: 30, south: 28, east: 33, west: 35, central: 40 });
const PSI_UNHEALTHY = psiPayload({ north: 110, south: 105, east: 120, west: 131, central: 118 });

/* 槟城那本用的是 open-meteo 的空气质量接口（马来西亚没有免钥匙又允许浏览器直抓的官方接口），
   口径是美国 AQI：>100 老人小孩少户外、>150 整团改室内——两条线都要验，颜色也要跟着换。 */
const airPayload = (us_aqi, pm2_5) => ({ current: { time: '2026-10-11T14:00', us_aqi, pm2_5 } });
const AIR_GOOD = airPayload(38, 9.1);
const AIR_SENSITIVE = airPayload(121, 44.3);
const AIR_UNHEALTHY = airPayload(176, 104.6);

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

async function load(handler, now, psiHandler) {
  let called = false;
  await page.route(API, r => { called = true; return handler(r); });
  /* PSI 预设给一份正常读数：天气那几个情境不该因为空气质量的网络行为而改变结果 */
  await page.route(PSI_API, r => (psiHandler || (x => x.fulfill({ json: PSI_MODERATE })))(r));
  await page.clock.setFixedTime(new Date(now));
  await page.goto(SG_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => [...document.querySelectorAll('.wx[data-wx]')].every(b => b.textContent && !/载入中|Loading/.test(b.textContent)),
    null, { timeout: 10000 },
  );
  /* 空气质量是另一条独立的 fetch，跟天气那几条谁先回来没保证。只等天气就去读 #psi，
     在慢一点的机器上会读到还没填完的「载入中」——2026-09-18 在 CI 上就这样红过一次
     （本地全过、CI 三条 PSI 断言全红）。所以这里单独等它落定。
     等不到就不硬抛：让后面的断言把「实得什么」原样印出来，比栈追踪好读。 */
  await page.waitForFunction(
    () => {
      const el = document.getElementById('psi');
      return !!el && !!el.textContent && !/载入中|Loading/.test(el.textContent);
    },
    null, { timeout: 10000 },
  ).catch(() => {});
  const texts = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.wx[data-wx]').forEach(b => { out[b.dataset.wx] = b.textContent; });
    return out;
  });
  const psi = await page.evaluate(() => {
    const el = document.getElementById('psi');
    return el ? { text: el.textContent, cls: el.className } : null;
  });
  /* 当天那张卡的烟霾行：只有「今天」该露出来，而且要带真实数字 */
  const dayHaze = await page.evaluate(() => {
    const shown = [...document.querySelectorAll('.day[data-date]')]
      .filter(d => d.querySelector('.hazeplan') && !d.querySelector('.hazeplan').hidden)
      .map(d => ({
        date: d.dataset.date,
        now: d.querySelector('.hazenow')?.textContent || '',
        actHidden: d.querySelector('.hazeact')?.hidden,
        cls: d.querySelector('.hazeplan')?.className || '',
      }));
    return shown;
  });
  await page.unroute(API);
  await page.unroute(PSI_API);
  return { texts, called, psi, dayHaze };
}

/* ---- 1. 每天都要有天气条与雨天备案，日期还得对得上 ---- */
await page.goto(SG_URL, { waitUntil: 'domcontentloaded' });
const structure = await page.evaluate(() =>
  [...document.querySelectorAll('.day[data-date]')].map(d => ({
    date: d.dataset.date,
    wx: d.querySelector('.wx[data-wx]')?.dataset.wx || null,
    rain: !!d.querySelector('.rainplan .cn')?.textContent.trim(),
    rainEn: !!d.querySelector('.rainplan .en')?.textContent.trim(),
    /* 烟霾备案跟雨天备案同一条规矩：加一天就要配一条，否则那天 PSI 高了
       没人知道该改去哪。差别是它**预设隐藏**、只有当天抓到读数才露出来
       （2026-09-19 用户：「别写死的，只在当天抓完数据写上当天的空气质量」），
       所以这里查的是「文案在不在 DOM 里」，可见与否由下面的情境测试管。 */
    haze: !!d.querySelector('.hazeact .cn')?.textContent.trim(),
    hazeEn: !!d.querySelector('.hazeact .en')?.textContent.trim(),
    hazeHidden: d.querySelector('.hazeplan')?.hasAttribute('hidden') ?? null,
  })));
check(structure.length === 5, `行程应有 5 天（实得 ${structure.length}）`);

/* ---- 1b. 空气质量条的骨架：元素在、中英说明都在、官方网站链接在 ---- */
const psiSkeleton = await page.evaluate(() => {
  const note = document.querySelector('.psinote');
  return {
    exists: !!document.getElementById('psi'),
    cn: !!note?.querySelector('.cn')?.textContent.trim(),
    en: !!note?.querySelector('.en')?.textContent.trim(),
    haze: !!document.querySelector('.psinote a[href*="haze.gov.sg"]'),
  };
});
check(psiSkeleton.exists, '应有实时空气质量条 #psi');
check(psiSkeleton.cn && psiSkeleton.en, '空气质量的说明要中英文都有');
check(psiSkeleton.haze, '空气质量说明要给官方烟霾网站的链接（现场自己查得到）');
structure.forEach(d => {
  check(d.wx === d.date, `${d.date} 的天气条日期要跟当天一致（实得 ${d.wx}）`);
  check(d.rain && d.rainEn, `${d.date} 的雨天备案中英文都要有`);
  check(d.haze && d.hazeEn, `${d.date} 的烟霾备案中英文都要有`);
  check(d.hazeHidden === true, `${d.date} 的烟霾备案预设要隐藏（没抓到数据就不该占版面）`);
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

/* ---- 6. 空气质量：三档读数 ＋ API 挂掉 ---- */
const { psi: psiMod } = await load(r => r.fulfill({ json: FULL }), IN_WINDOW,
  r => r.fulfill({ json: PSI_MODERATE }));
check(/中等/.test(psiMod.text), `PSI 90 应判「中等」（实得：${psiMod.text}）`);
check(/90/.test(psiMod.text), 'PSI 中等情境应显示滨海湾一带的数字 90');
check(/warn/.test(psiMod.cls) && !/bad/.test(psiMod.cls),
  `全岛最高 90 应标提醒色而非红色（实得 class：${psiMod.cls}）`);

const { psi: psiGood } = await load(r => r.fulfill({ json: FULL }), IN_WINDOW,
  r => r.fulfill({ json: PSI_GOOD }));
check(/良好/.test(psiGood.text), `PSI 40 应判「良好」（实得：${psiGood.text}）`);
check(!/warn|bad/.test(psiGood.cls), `空气好的时候不该标色（实得 class：${psiGood.cls}）`);

const { psi: psiBad } = await load(r => r.fulfill({ json: FULL }), IN_WINDOW,
  r => r.fulfill({ json: PSI_UNHEALTHY }));
check(/不健康/.test(psiBad.text), `PSI 131 应判「不健康」（实得：${psiBad.text}）`);
check(/bad/.test(psiBad.cls), `超过 100 必须标红——这是「改走室内」的触发线（实得 class：${psiBad.cls}）`);
check(/131/.test(psiBad.text), '不健康情境要显示全岛最高值 131（去圣淘沙、义顺那几天看的是最高值）');

const { psi: psiDown } = await load(r => r.fulfill({ json: FULL }), IN_WINDOW,
  r => r.fulfill({ status: 500, body: 'boom' }));
check(/抓不到|unavailable/i.test(psiDown.text),
  `空气质量 API 挂掉时要说明白（实得：${psiDown.text}）`);
check(!/载入中|Loading/.test(psiDown.text), 'API 挂掉时不该卡在「载入中」');

/* ---- 5. 当天那张卡的烟霾行：只有今天、只在抓到数据之后 ---- */
const D3 = '2026-09-25T09:00:00+08:00';   // 把「今天」固定在环球影城那天

// 5a. 不在行程日期内（出发前一天）→ 五天一条都不该露出来
const { dayHaze: beforeTrip } = await load(r => r.fulfill({ json: FULL }), IN_WINDOW,
  r => r.fulfill({ json: PSI_MODERATE }));
check(beforeTrip.length === 0,
  `[singapore] 不是行程中的日子，当天烟霾行一条都不该显示（实得 ${JSON.stringify(beforeTrip)}）`);

// 5b. 今天是 9/25 且空气中等（全岛最高 90）→ 只有 D3 露出，报数字、说照常、不摊开替代方案
const { dayHaze: okDay } = await load(r => r.fulfill({ json: FULL }), D3,
  r => r.fulfill({ json: PSI_MODERATE }));
check(okDay.length === 1 && okDay[0].date === '2026-09-25',
  `[singapore] 只有今天那张卡该显示烟霾行（实得 ${JSON.stringify(okDay.map(d => d.date))}）`);
check(/90/.test(okDay[0]?.now || ''),
  `[singapore] 当天烟霾行要写出实时数字 90（实得：${okDay[0]?.now}）`);
check(/照常|unchanged/.test(okDay[0]?.now || ''),
  `[singapore] PSI 100 以内要明说行程照常（实得：${okDay[0]?.now}）`);
check(okDay[0]?.actHidden === true,
  '[singapore] 空气没问题时不该把替代方案摊开（那就又变成一行废话了）');
check(!/bad/.test(okDay[0]?.cls || ''), '[singapore] 空气没问题时不该标红');

// 5c. 今天是 9/25 且不健康（全岛最高 131）→ 标红、摊开当天的替代方案
const { dayHaze: badDay } = await load(r => r.fulfill({ json: FULL }), D3,
  r => r.fulfill({ json: PSI_UNHEALTHY }));
check(/131/.test(badDay[0]?.now || ''),
  `[singapore] 超标那天要写出 131（实得：${badDay[0]?.now}）`);
check(badDay[0]?.actHidden === false,
  '[singapore] PSI 超过 100 要把当天的替代方案摊开——这才是要人改行程的那一刻');
check(/bad/.test(badDay[0]?.cls || ''), '[singapore] PSI 超过 100 当天那行要标红');
const actText = await page.evaluate(() =>
  document.querySelector('.day[data-date="2026-09-25"] .hazeact')?.textContent || '');
check(/VivoCity|海洋馆/.test(actText),
  `[singapore] 9/25 摊开的替代方案要是这一天的（VivoCity／海洋馆），实得：${actText.slice(0, 60)}`);

// 5d. API 挂掉但人在行程中 → 当天那行要讲明抓不到，并把替代方案摊开备用
const { dayHaze: downDay } = await load(r => r.fulfill({ json: FULL }), D3,
  r => r.fulfill({ status: 500, body: 'boom' }));
check(downDay.length === 1 && /抓不到|Could not fetch/.test(downDay[0]?.now || ''),
  `[singapore] 抓不到数据时当天要说明白（实得：${JSON.stringify(downDay)}）`);
check(downDay[0]?.actHidden === false,
  '[singapore] 抓不到数字时要把替代方案摊开备用（宁可多给资讯，也不要开天窗）');

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

async function loadPGT(handler, now, airHandler) {
  let called = false;
  await pgtPage.route(API, r => { called = true; return handler(r); });
  /* 空气质量预设给一份好读数：天气那几个情境不该因为它的网络行为而改变结果。
     不拦的话 CI 上会去打真的 open-meteo，结果就随当天空气变动了。 */
  await pgtPage.route(AIR_API, r => (airHandler || (x => x.fulfill({ json: AIR_GOOD })))(r));
  await pgtPage.clock.setFixedTime(new Date(now));
  await pgtPage.goto(PGT_URL, { waitUntil: 'domcontentloaded' });
  await pgtPage.waitForFunction(
    () => {
      const n = document.getElementById('wxNote');
      return n && n.textContent && !/载入中|Loading weather/.test(n.textContent);
    },
    null, { timeout: 10000 },
  );
  /* 空气质量是另一条独立的 fetch，跟天气谁先回来没保证——只等天气就读它，
     慢一点的机器会读到还没填的「载入中」（新加坡那边 2026-09-18 在 CI 上踩过）。 */
  await pgtPage.waitForFunction(
    () => {
      const el = document.getElementById('air');
      return !!el && !!el.textContent && !/载入中|Loading air/.test(el.textContent);
    },
    null, { timeout: 10000 },
  ).catch(() => {});
  const state = await pgtPage.evaluate(() => {
    const note = document.getElementById('wxNote');
    const daily = document.getElementById('wxdaily');
    const cards = {};
    daily.querySelectorAll('.wxd[data-wx]').forEach(c => { cards[c.dataset.wx] = c.textContent; });
    const air = document.getElementById('air');
    const plan = document.querySelector('.airplan');
    return {
      air: air ? { text: air.textContent, cls: air.className } : null,
      /* 当天那块：行程之外应该整块隐藏，行程当天才写实时读数 */
      plan: plan ? {
        hidden: plan.hidden,
        now: plan.querySelector('.airnow')?.textContent || '',
        actHidden: plan.querySelector('.airact')?.hidden,
        cls: plan.className,
      } : null,
      noteText: note.textContent,
      dailyHidden: daily.hidden,
      cardDates: [...daily.querySelectorAll('.wxd[data-wx]')].map(c => c.dataset.wx),
      wetDates: [...daily.querySelectorAll('.wxd.wet')].map(c => c.dataset.wx),
      cards,
    };
  });
  await pgtPage.unroute(API);
  await pgtPage.unroute(AIR_API);
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

/* ---- 5. 实时空气质量条（烧芭季烟霾）---- */
const pgtSkeleton = await pgtPage.evaluate(() => {
  const note = document.querySelector('.airnote');
  return {
    exists: !!document.getElementById('air'),
    cn: !!note?.querySelector('.cn'),
    en: !!note?.querySelector('.en'),
    apims: !!document.querySelector('.airnote a[href*="apims.doe.gov.my"]'),
  };
});
check(pgtSkeleton.exists, '[penang] 应有实时空气质量条 #air');
check(pgtSkeleton.cn && pgtSkeleton.en, '[penang] 空气质量的说明要中英文都有');
check(pgtSkeleton.apims, '[penang] 说明要给马来西亚官方 APIMS 的链接（现场自己查得到）');

const pgtAirGood = await loadPGT(r => r.fulfill({ json: PGT_FULL }), PGT_IN_WINDOW,
  r => r.fulfill({ json: AIR_GOOD }));
check(/良好/.test(pgtAirGood.air.text), `[penang] AQI 38 应判「良好」（实得：${pgtAirGood.air.text}）`);
check(/38/.test(pgtAirGood.air.text) && /9\s*µg/.test(pgtAirGood.air.text),
  `[penang] 良好情境要显示 AQI 38 与 PM2.5 9（实得：${pgtAirGood.air.text}）`);
check(!/warn|bad/.test(pgtAirGood.air.cls), `[penang] 空气好的时候不该标色（实得 class：${pgtAirGood.air.cls}）`);

const pgtAirSens = await loadPGT(r => r.fulfill({ json: PGT_FULL }), PGT_IN_WINDOW,
  r => r.fulfill({ json: AIR_SENSITIVE }));
check(/敏感人群/.test(pgtAirSens.air.text), `[penang] AQI 121 应判「敏感人群不健康」（实得：${pgtAirSens.air.text}）`);
check(/warn/.test(pgtAirSens.air.cls) && !/bad/.test(pgtAirSens.air.cls),
  `[penang] 超过 100 要标提醒色而非红色——那是「老人小孩少户外」的线（实得 class：${pgtAirSens.air.cls}）`);

const pgtAirBad = await loadPGT(r => r.fulfill({ json: PGT_FULL }), PGT_IN_WINDOW,
  r => r.fulfill({ json: AIR_UNHEALTHY }));
check(/不健康/.test(pgtAirBad.air.text) && !/敏感人群/.test(pgtAirBad.air.text),
  `[penang] AQI 176 应判「不健康」（实得：${pgtAirBad.air.text}）`);
check(/bad/.test(pgtAirBad.air.cls),
  `[penang] 超过 150 必须标红——那是「整团改室内」的触发线（实得 class：${pgtAirBad.air.cls}）`);

const pgtAirDown = await loadPGT(r => r.fulfill({ json: PGT_FULL }), PGT_IN_WINDOW,
  r => r.fulfill({ status: 500, body: 'boom' }));
check(/抓不到|unavailable/i.test(pgtAirDown.air.text),
  `[penang] 空气质量 API 挂掉时要说明白（实得：${pgtAirDown.air.text}）`);
check(!/载入中|Loading/.test(pgtAirDown.air.text), '[penang] API 挂掉时不该卡在「载入中」');

/* ---- 6. 当天那块：只在行程期间、抓到读数之后才出现 ---- */
const PGT_DAY = '2026-10-11T09:00:00+08:00';   // 行程第三天

// 6a. 不在行程期间（出发前 4 天）→ 整块隐藏
const notTrip = await loadPGT(r => r.fulfill({ json: PGT_FULL }), PGT_IN_WINDOW,
  r => r.fulfill({ json: AIR_GOOD }));
check(notTrip.plan?.hidden === true,
  '[penang] 不在行程期间时，当天那块要整块隐藏（不占版面）');

// 6b. 行程当天 + 空气良好（38）→ 露出、报数字、说照常、不摊开替代方案
const dayGood = await loadPGT(r => r.fulfill({ json: PGT_FULL }), PGT_DAY,
  r => r.fulfill({ json: AIR_GOOD }));
check(dayGood.plan?.hidden === false, '[penang] 行程当天抓到读数后要露出来');
check(/38/.test(dayGood.plan?.now || ''),
  `[penang] 当天那行要写出实时数字 38（实得：${dayGood.plan?.now}）`);
check(/照常|unchanged/.test(dayGood.plan?.now || ''),
  `[penang] 空气好的时候要明说行程照常（实得：${dayGood.plan?.now}）`);
check(dayGood.plan?.actHidden === true,
  '[penang] 空气好的时候不该摊开「改去哪」（那就又变成一行废话了）');

// 6c. 行程当天 + 敏感人群不健康（121，>100 但 ≤150）→ 摊开替代方案，但先不标红
const daySens = await loadPGT(r => r.fulfill({ json: PGT_FULL }), PGT_DAY,
  r => r.fulfill({ json: AIR_SENSITIVE }));
check(daySens.plan?.actHidden === false,
  '[penang] AQI 超过 100 就要摊开「改去哪」');
check(!/bad/.test(daySens.plan?.cls || ''),
  '[penang] 100–150 之间还不到整团改室内，别标红');

// 6d. 行程当天 + 不健康（176 > 150）→ 标红
const dayBad = await loadPGT(r => r.fulfill({ json: PGT_FULL }), PGT_DAY,
  r => r.fulfill({ json: AIR_UNHEALTHY }));
check(/bad/.test(dayBad.plan?.cls || ''),
  '[penang] AQI 超过 150 当天那行要标红（整团改室内的线）');
const pgtAct = await pgtPage.evaluate(() => document.querySelector('.airact')?.textContent || '');
check(/Gurney|Queensbay|Tech Dome/.test(pgtAct),
  `[penang] 摊开的替代方案要点名手册里的室内去处（实得：${pgtAct.slice(0, 50)}）`);
check(/升旗山|Penang Hill/.test(pgtAct),
  '[penang] 也要讲明哪些户外行程该往后挪');

// 6e. 行程当天 + API 挂掉 → 说明抓不到，并把替代方案摊开备用
const dayDown = await loadPGT(r => r.fulfill({ json: PGT_FULL }), PGT_DAY,
  r => r.fulfill({ status: 500, body: 'boom' }));
check(/抓不到|Could not fetch/.test(dayDown.plan?.now || ''),
  `[penang] 抓不到数据时当天要说明白（实得：${dayDown.plan?.now}）`);
check(dayDown.plan?.actHidden === false,
  '[penang] 抓不到数字时要把替代方案摊开备用');

check(pgtErrors.length === 0, `[penang] 不应有 JS 错误（实得：${pgtErrors.slice(0, 3).join(' | ')}）`);

await browser.close();

console.log(`通过 ${ok.length} 项`);
if (fails.length) {
  console.error(`\n未通过 ${fails.length} 项：`);
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('每日天气条自检全部通过');
