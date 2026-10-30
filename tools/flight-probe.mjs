#!/usr/bin/env node
// 查航班工具：开 Google Flights 查某日某航线，抽出每个选项的航班号、起降时间、
// 总时长、经停、转机机场与等候时间、价格。
//
// 为什么要有它（2026-10-30）：Claude 的云端沙盒打不开任何航班网站，WebSearch 只拿得到
// 聚合站的旧班表（冬夏季换班后时刻会差 10~60 分钟）。当天一个 subagent 用临时分支＋
// Playwright 在 CI 上开 Google Flights，拿到了 11/16 CGK→KTI/PEN 的正确班表；这里把那次
// 的一次性脚本做成固定工具，以后只要触发 .github/workflows/flight-probe.yml 填三个格子。
//
// 用法（在 CI 上；沙盒连不上 google.com）：
//   node tools/flight-probe.mjs --from CGK --to KTI --date 2026-11-16 \
//        [--adults 2] [--airline MH] [--out 目录] [--smoke]
// 结果：stdout 印一份纯文字表（get_job_logs 读得到）；$GITHUB_STEP_SUMMARY 写 markdown 表；
//       --out 目录里放 result.json 与 summary.md。
// 退出码：0 = 抓到至少一个选项；1 = 一个都没抓到／页面日期对不上（--smoke 时门槛更高）。
//
// 解析逻辑全部是下面导出的纯函数，自检 tools/check-flight-probe.mjs 拿真实页面文字
// （2026-10-30 那次 CI 日志摘下来的）去验，不开浏览器。
//
// 页面文字长什么样（每个结果是一个 <li>，innerText 的换行换成 " | "）：
//  收合时：11:10 AM | – | 5:30 PM | Malaysia Airlines | 6 hr 20 min | CGK–KTI | 1 stop | 2 hr 20 min KUL | 196 kg CO2e | $212
//  展开后：Departure | Mon, Nov 16 | … | $161 | 11:10 AMSoekarno–Hatta International Airport (CGK) |
//          Travel time: 2 hr 10 min | 2:20 PMKuala Lumpur International Airport (KUL) |
//          Malaysia AirlinesEconomyBoeing 737MAX 8 PassengerMH 710 | … |
//          1 hr 45 min layoverFederal Territory of Kuala Lumpur (KUL) | 4:05 PM… | … | Select flight
//  注意：航班号与机型黏在一起、航司代码与数字之间是不换行空格（U+00A0），时刻与 AM 之间
//  新版 Chrome 可能是 U+202F。正则里的 \s 在 JS 都涵盖这几种空格。

// 舱等字样夹在航司与机型中间；取最早出现的那个
import { pathToFileURL } from 'node:url';

const CABIN_RE = /^(.*?)(Premium economy|Economy|Business|First)(.*)$/;
const PRICE_RE = /^(?:[A-Z]{3}\s?|[$€£¥₹]|RM\s?|S\$|Rp\s?)[\d,.]+$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "2 hr 10 min" / "1 hr" / "45 min" / "1 day 3 hr" → 分钟数；认不出回 null */
export function parseDuration(s) {
  if (!s) return null;
  const m = String(s).match(/^\s*(?:(\d+)\s*days?)?\s*(?:(\d+)\s*hrs?)?\s*(?:(\d+)\s*min)?/);
  if (!m || (m[1] == null && m[2] == null && m[3] == null)) return null;
  return (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

/** "11:10 AM" / "6:50 AM+1"（任意空格）→ {min: 当天第几分钟, day: 相对出发日的天数} */
export function parseClock(s) {
  const m = String(s).match(/^\s*(\d{1,2}):(\d{2})\s*([AP])M\s*([+-]\d)?/);
  if (!m) return null;
  let h = +m[1] % 12;
  if (m[3] === 'P') h += 12;
  return { min: h * 60 + +m[2], day: m[4] ? +m[4] : 0, rest: s.slice(m[0].length) };
}

export function fmtClock(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtDur(min) {
  if (min == null) return '?';
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** "2026-11-16" → "Mon, Nov 16"（Google Flights 展开后的日期写法），拿来核对页面查的是不是那一天 */
export function dateLabel(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function buildUrl({ from, to, date, adults = 1 }) {
  let q = `Flights from ${from} to ${to} on ${date} one way`;
  if (adults > 1) q += ` for ${adults} adults`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&hl=en&gl=us&curr=USD`;
}

function splitFields(text) {
  return String(text).split(/\s*\|\s*/).map((f) => f.trim()).filter(Boolean);
}

// "11:10 AMSoekarno–Hatta International Airport (CGK)"
function parsePoint(field) {
  const c = parseClock(field);
  if (!c) return null;
  const m = c.rest.match(/^\s*(.*?)\s*\(([A-Z0-9]{3})\)\s*$/);
  if (!m) return null;
  return { min: c.min, day: c.day, name: m[1], code: m[2] };
}

// "Malaysia AirlinesEconomyBoeing 737MAX 8 PassengerMH 710"
// 航班号黏在机型后面，所以从尾巴往回认：最后的「两码 空格 1~4 位数字」就是航班号。
function parseCarrier(field) {
  const c = field.match(CABIN_RE);
  if (!c || !c[1].trim()) return null;
  const airline = c[1].trim(), cabin = c[2], tail = c[3];
  const m = tail.match(/^(.*?)([A-Z0-9]{2})\s(\d{1,4})\s*$/);
  if (!m) return { airline, cabin, aircraft: tail.trim() || null, flight: null };
  return { airline, cabin, aircraft: m[1].trim() || null, flight: `${m[2]}${m[3]}` };
}

/**
 * 展开后的详情文字 → 行程（含逐段航班号）。认不出来回 null。
 * 转机等待用「下一段起飞 − 上一段降落」重算（同一机场、同一时区，带 +1 天），
 * 跟页面写的等待时间对一次；全程 = 各段飞行时间 ＋ 各次等待——**不能**拿两端当地时刻
 * 直接相减，跨时区会差整小时（CGK UTC+7 → PEN UTC+8：11:10→17:05 看起来 5h55，实际 4h55）。
 */
export function parseDetail(text) {
  const f = splitFields(text);
  if (f[0] !== 'Departure') return null;
  const it = { source: 'detail', dateLabel: f[1] || null, price: null, segments: [], layovers: [], notes: [] };
  let seg = null;
  for (let i = 2; i < f.length; i++) {
    const x = f[i];
    if (it.price == null && (PRICE_RE.test(x) || x === 'Price unavailable')) {
      it.price = x === 'Price unavailable' ? null : x;
      if (x === 'Price unavailable') it.priceUnavailable = true;
      continue;
    }
    const lay = x.match(/^(.+?)\s+layover\s*(.*?)\s*\(([A-Z0-9]{3})\)\s*(.*)$/);
    if (lay) {
      it.layovers.push({ statedMin: parseDuration(lay[1]), at: lay[3], city: lay[2], tag: lay[4] || '' });
      continue;
    }
    const tt = x.match(/^Travel time:\s*(.+?)(Overnight)?$/);
    if (tt && seg && !seg.travelMin) {
      seg.travelMin = parseDuration(tt[1]);
      continue;
    }
    const pt = parsePoint(x);
    if (pt) {
      if (!seg || seg.arr) {
        seg = { dep: pt, arr: null, travelMin: null, airline: null, aircraft: null, flight: null };
        it.segments.push(seg);
      } else {
        seg.arr = pt;
      }
      continue;
    }
    if (seg && seg.arr && !seg.airline) {
      const c = parseCarrier(x);
      if (c) Object.assign(seg, c);
      continue;
    }
    if (/^(Often delayed|Change of airport|Self transfer|Separate tickets)/i.test(x)) it.notes.push(x);
  }
  if (!it.segments.length || it.segments.some((s) => !s.arr || s.travelMin == null)) return null;
  return finishDetail(it);
}

function finishDetail(it) {
  const segs = it.segments;
  it.mismatch = [];
  // 页面列出的等待次数应等于段数−1；不等就照算出来的，但记一笔
  const computed = [];
  for (let i = 1; i < segs.length; i++) {
    const a = segs[i - 1].arr, d = segs[i].dep;
    const min = (d.day * 1440 + d.min) - (a.day * 1440 + a.min);
    const stated = it.layovers[i - 1] || {};
    const lay = { at: a.code, depAt: d.code, min, statedMin: stated.statedMin ?? null, tag: stated.tag || '' };
    if (a.code !== d.code) lay.changeAirport = true;
    if (lay.statedMin != null && lay.statedMin !== min) {
      it.mismatch.push(`${a.code} 等待：页面写 ${fmtDur(lay.statedMin)}，按时刻算 ${fmtDur(min)}`);
    }
    computed.push(lay);
  }
  it.layovers = computed;
  it.from = segs[0].dep.code;
  it.to = segs[segs.length - 1].arr.code;
  it.dep = segs[0].dep.min;
  it.depDay = segs[0].dep.day;
  it.arr = segs[segs.length - 1].arr.min;
  it.arrDay = segs[segs.length - 1].arr.day;
  it.stops = segs.length - 1;
  it.durationMin = segs.reduce((s, x) => s + x.travelMin, 0) + computed.reduce((s, x) => s + x.min, 0);
  it.airlines = [...new Set(segs.map((s) => s.airline).filter(Boolean))];
  it.flights = segs.map((s) => s.flight);
  return it;
}

/** 收合的结果列 → 行程（没有航班号，只有时刻/航司/经停/价格）。认不出来回 null。 */
export function parseSummary(text) {
  const f = splitFields(text);
  if (f.length < 6 || f[1] !== '–') return null;
  const d = parseClock(f[0]), a = parseClock(f[2]);
  if (!d || !a) return null;
  const it = {
    source: 'summary', dep: d.min, depDay: d.day, arr: a.min, arrDay: a.day,
    airlines: f[3].split(/\s*,\s*/), durationMin: parseDuration(f[4]),
    from: null, to: null, stops: null, layovers: [], price: null, flights: [], segments: [],
  };
  for (let i = 5; i < f.length; i++) {
    const x = f[i];
    const r = x.match(/^([A-Z0-9]{3})\s*[–-]\s*([A-Z0-9]{3})$/);
    if (r) { it.from = r[1]; it.to = r[2]; continue; }
    if (x === 'Nonstop') { it.stops = 0; continue; }
    const s = x.match(/^(\d+) stops?$/);
    if (s) {
      it.stops = +s[1];
      const nx = f[i + 1] || '';
      const one = nx.match(/^(.+?)\s([A-Z0-9]{3})$/);
      if (it.stops === 1 && one && parseDuration(one[1]) != null) {
        it.layovers = [{ at: one[2], min: parseDuration(one[1]) }];
        i++;
      } else if (/^[A-Z0-9]{3}(,\s*[A-Z0-9]{3})*$/.test(nx)) {
        it.layovers = nx.split(/\s*,\s*/).map((c) => ({ at: c, min: null }));
        i++;
      }
      continue;
    }
    if (PRICE_RE.test(x)) { it.price = x; continue; }
    if (x === 'Price unavailable') { it.priceUnavailable = true; continue; }
  }
  if (it.stops == null || it.durationMin == null) return null;
  return it;
}

function keyOf(it) {
  return [it.dep, it.depDay, it.arr, it.arrDay, it.stops].join('/');
}

/**
 * 把一页抓到的全部 <li> 文字变成行程清单：展开的详情优先；收合列只在没有对应详情时保留
 * （拿不到航班号，但时刻/经停/价格照样有用）。同一行程出现多次只留一份。
 */
export function collectItineraries(texts, { airline } = {}) {
  const details = [], summaries = [];
  const seen = new Set();
  for (const t of texts) {
    const d = parseDetail(t);
    if (d) {
      const k = d.flights.join('+') + '@' + keyOf(d);
      if (!seen.has(k)) { seen.add(k); details.push(d); }
      continue;
    }
    const s = parseSummary(t);
    if (s) summaries.push(s);
  }
  const covered = new Map();
  for (const d of details) covered.set(keyOf(d), d);
  const out = [...details];
  const seenS = new Set();
  for (const s of summaries) {
    const k = keyOf(s) + '|' + s.airlines.join(',');
    const d = covered.get(keyOf(s));
    if (d) {
      if (!d.price && s.price) d.price = s.price;
      if (d.durationMin !== s.durationMin) d.mismatch.push(`全程：列表写 ${fmtDur(s.durationMin)}，按各段算 ${fmtDur(d.durationMin)}`);
      continue;
    }
    if (seenS.has(k)) continue;
    seenS.add(k);
    out.push(s);
  }
  let res = out;
  if (airline) {
    // 可填航司名（Malaysia）或两码代码（MH）；收合列没有航班号，就借详情里「代码→航司名」对照
    const a = airline.toLowerCase();
    const names = new Set();
    for (const d of details) for (const sg of d.segments) {
      if (sg.flight && sg.airline && sg.flight.toLowerCase().startsWith(a)) names.add(sg.airline.toLowerCase());
    }
    res = res.filter((it) => it.airlines.some((x) => x.toLowerCase().includes(a) || names.has(x.toLowerCase()))
      || it.flights.some((fl) => fl && fl.toLowerCase().startsWith(a)));
  }
  res.sort((x, y) => (x.depDay * 1440 + x.dep) - (y.depDay * 1440 + y.dep) || x.durationMin - y.durationMin);
  return res;
}

function dayTag(day) {
  return day ? `(+${day}天)` : '';
}

function stopText(it) {
  if (it.stops === 0) return '直飞';
  const parts = it.layovers.map((l) => {
    const t = l.min != null ? `${l.at} 等 ${fmtDur(l.min)}` : l.at;
    return l.changeAirport ? `${t}（换机场到 ${l.depAt}）` : t;
  });
  return `${it.stops} 次转机：${parts.join('，') || '?'}`;
}

function segText(s) {
  return `${s.flight || '?'} ${s.dep.code} ${fmtClock(s.dep.min)}${dayTag(s.dep.day)}→${s.arr.code} ${fmtClock(s.arr.min)}${dayTag(s.arr.day)}`;
}

/** 给人看的 markdown 表（写进 job summary） */
export function toMarkdown(itins, meta) {
  const L = [];
  L.push(`## 航班查询：${meta.from} → ${meta.to}，${meta.date}（${meta.adults || 1} 位成人）`);
  L.push('');
  L.push(`来源：Google Flights（${meta.url}）。时间都是**当地时间**；全程＝各段飞行＋转机等待（已含时差）。`);
  if (meta.warnings?.length) for (const w of meta.warnings) L.push(`> ⚠️ ${w}`);
  L.push('');
  if (!itins.length) {
    L.push('**没有抓到任何航班。**');
    return L.join('\n') + '\n';
  }
  L.push('| # | 航段（航班号 起飞→降落） | 出发 | 到达 | 全程 | 转机 | 航司 | 价格 |');
  L.push('|---|---|---|---|---|---|---|---|');
  itins.forEach((it, i) => {
    const segs = it.segments.length ? it.segments.map(segText).join('<br>') : '（未展开，无航班号）';
    const price = it.price || (it.priceUnavailable ? '无报价' : '—');
    const warn = it.mismatch?.length ? ' ⚠️' : '';
    L.push(`| ${i + 1} | ${segs}${warn} | ${fmtClock(it.dep)} ${it.from || meta.from} | ${fmtClock(it.arr)}${dayTag(it.arrDay)} ${it.to || meta.to} | ${fmtDur(it.durationMin)} | ${stopText(it)} | ${it.airlines.join('、')} | ${price} |`);
  });
  const mm = itins.filter((it) => it.mismatch?.length);
  if (mm.length) {
    L.push('');
    L.push('⚠️ 页面数字与按时刻重算的对不上（以页面为准再核对一次）：');
    for (const it of mm) L.push(`- ${it.flights.join('+')}：${it.mismatch.join('；')}`);
  }
  return L.join('\n') + '\n';
}

/** 给 job log 的纯文字版（get_job_logs 读得到，不必下载 artifact） */
export function toText(itins, meta) {
  const L = [`FLIGHTS ${meta.from}->${meta.to} ${meta.date} adults=${meta.adults || 1} count=${itins.length}`];
  for (const w of meta.warnings || []) L.push(`WARN ${w}`);
  itins.forEach((it, i) => {
    const segs = it.segments.length ? it.segments.map(segText).join(' / ') : '(未展开)';
    const price = it.price || (it.priceUnavailable ? '无报价' : '-');
    L.push(`${String(i + 1).padStart(2)}. ${fmtClock(it.dep)}→${fmtClock(it.arr)}${dayTag(it.arrDay)} 全程${fmtDur(it.durationMin)} | ${stopText(it)} | ${segs} | ${it.airlines.join(',')} | ${price}${it.mismatch?.length ? ' | ⚠️' + it.mismatch.join(';') : ''}`);
  });
  return L.join('\n');
}

/** 结果像不像正常（--smoke 用）：回传问题清单，空 = 正常 */
export function smokeProblems(itins, meta) {
  const p = [];
  if (itins.length < 3) p.push(`只抓到 ${itins.length} 个选项（热门航线至少应有 3 个）`);
  if (!itins.some((it) => it.flights.length && it.flights.every(Boolean))) p.push('没有任何一个选项拿到航班号（展开详情坏了）');
  if (meta.dateMismatch) p.push(meta.dateMismatch);
  return p;
}

// ───────────────────────── 以下是真的开浏览器的部分（只在 CI 跑） ─────────────────────────

function parseArgs(argv) {
  const a = { adults: 1, max: 60 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--from') a.from = (v() || '').trim().toUpperCase();
    else if (k === '--to') a.to = (v() || '').trim().toUpperCase();
    else if (k === '--date') a.date = (v() || '').trim();
    else if (k === '--adults') a.adults = parseInt(v() || '1', 10) || 1;
    else if (k === '--airline') a.airline = (v() || '').trim();
    else if (k === '--out') a.out = v();
    else if (k === '--max') a.max = parseInt(v(), 10) || 60;
    else if (k === '--smoke') a.smoke = true;
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bad = [];
  if (!/^[A-Z]{3}$/.test(args.from || '')) bad.push('--from 要三码机场代码（例 CGK）');
  if (!/^[A-Z]{3}$/.test(args.to || '')) bad.push('--to 要三码机场代码（例 KTI）');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date || '') || isNaN(Date.parse(args.date))) bad.push('--date 要 YYYY-MM-DD');
  if (args.adults < 1 || args.adults > 9) bad.push('--adults 要 1~9');
  if (bad.length) { console.error(bad.join('\n')); process.exit(1); }

  const fs = await import('node:fs');
  const path = await import('node:path');
  const { chromium } = await import('playwright');
  const url = buildUrl(args);
  const meta = { from: args.from, to: args.to, date: args.date, adults: args.adults, url, warnings: [] };
  console.log(`URL ${url}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC', viewport: { width: 1400, height: 2400 } });
  const page = await ctx.newPage();
  let texts = [], body = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt === 1) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      else await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      for (const t of ['Accept all', 'Reject all']) {
        const btn = page.getByRole('button', { name: t });
        if (await btn.count()) { await btn.first().click().catch(() => {}); break; }
      }
      // 等「结果列出现了」，不是等「加载中消失了」（否定式条件在还没开始加载时就成立）
      await page.waitForFunction(() => [...document.querySelectorAll('li')].some((li) =>
        /\d{1,2}:\d{2}\s*[AP]M/.test(li.innerText) && /(\$\d|Price unavailable)/.test(li.innerText)), null, { timeout: 45000 });
      await page.waitForTimeout(2500);
      const more = page.getByRole('button', { name: /more flights/i });
      if (await more.count()) { await more.first().click().catch(() => {}); await page.waitForTimeout(3000); }
      const grab = () => page.locator('li').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s*\n\s*/g, ' | ')));
      const before = await grab();
      const exp = page.locator('button[aria-label^="Flight details"]');
      const n = await exp.count();
      console.log(`attempt ${attempt}: ${before.length} li, ${n} 个「Flight details」按钮，展开前 ${Math.min(n, args.max)} 个`);
      for (let i = 0; i < Math.min(n, args.max); i++) {
        await exp.nth(i).click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(2000);
      texts = before.concat(await grab());
      body = await page.innerText('body');
      if (collectItineraries(texts).length) break;
    } catch (e) {
      console.log(`attempt ${attempt} 出错：${e.message.split('\n')[0]}`);
      body = await page.innerText('body').catch(() => '');
    }
  }
  await browser.close();

  const itins = collectItineraries(texts, { airline: args.airline });
  const label = dateLabel(args.date);
  const labels = [...new Set(itins.filter((x) => x.dateLabel).map((x) => x.dateLabel))];
  if (labels.length && !labels.includes(label)) {
    meta.dateMismatch = `页面日期是 ${labels.join('/')}，不是要查的 ${label}——查询句没被正确理解，结果不能用`;
    meta.warnings.push(meta.dateMismatch);
  }
  const pax = body.match(/One way\s*\n\s*(\d+)\s*\n/);
  if (pax && +pax[1] !== args.adults) meta.warnings.push(`页面乘客数是 ${pax[1]}，要的是 ${args.adults}（价格按页面人数）`);
  if (args.airline) meta.warnings.push(`只列航司含「${args.airline}」的选项`);

  const md = toMarkdown(itins, meta);
  console.log(toText(itins, meta));
  if (!itins.length) console.log('PAGE TEXT (前 2000 字):\n' + body.slice(0, 2000));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  if (args.out) {
    fs.mkdirSync(args.out, { recursive: true });
    fs.writeFileSync(path.join(args.out, 'result.json'), JSON.stringify({ meta, itineraries: itins }, null, 2));
    fs.writeFileSync(path.join(args.out, 'summary.md'), md);
  }
  if (!itins.length || meta.dateMismatch) process.exit(1);
  if (args.smoke) {
    const p = smokeProblems(itins, meta);
    if (p.length) { console.log('SMOKE FAIL: ' + p.join('；')); process.exit(1); }
    console.log('SMOKE OK');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
