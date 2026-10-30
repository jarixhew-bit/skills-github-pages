#!/usr/bin/env node
// tools/flight-probe.mjs（查航班工具）的解析器自检。不开浏览器、不连网，沙盒与 CI 都能跑。
//
// 为什么要它（2026-10-30）：查航班工具的输出会被直接拿去排行程，错一个数字等于订错票。
// 最容易错的两件事——
//   (1) 航班号与机型黏在一起（"Boeing 737MAX 8 PassengerMH 710"），切错就把 MH710 认成别的；
//   (2) 全程时长拿两端当地时刻相减：CGK（UTC+7）11:10 → PEN（UTC+8）17:05 看起来 5h55，
//       其实 4h55（check-flight-times 那边 2026-09-18 就这样错过两段）。
// fixture 全部摘自 2026-10-30 CI 上真开 Google Flights 的页面文字（run 40993397484 /
// 40994796654 / 40995118204），保留原本的不换行空格（U+00A0）——页面就是这样给的。
// 唯一的拼接件是 MH710+MH762：那天的日志里两段各自有真实文字，但这个组合没被展开过，
// 所以把两段真实文字接起来、中间放一行同格式的 layover。
//
// 页面改版后线上会不会坏，由 flight-probe.yml 每周三的实跑（--smoke）守着，不归这里管。
//
// 跑法：node tools/check-flight-probe.mjs      退出码 0 = 全过；1 = 有不符
import {
  parseDetail, parseSummary, collectItineraries, toMarkdown, toText, smokeProblems,
  parseDuration, parseClock, dateLabel, buildUrl, fmtDur,
} from './flight-probe.mjs';

let pass = 0;
const fails = [];
function eq(desc, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else fails.push(`${desc}\n      期望 ${w}\n      实际 ${g}`);
}
function ok(desc, cond) { eq(desc, !!cond, true); }

// ── 真实页面文字（2026-10-30 Google Flights，2026-11-16 班表） ──
const MH710_MH1152 =
  "Departure | Mon, Nov 16 | 142 kg CO2e | Avg emissions | $161 | 11:10 AMSoekarno\u2013Hatta International Airport\u00a0(CGK) | Travel time: 2 hr 10 min | 2:20 PMKuala Lumpur International Airport\u00a0(KUL) | Malaysia AirlinesEconomyBoeing 737MAX 8 PassengerMH\u00a0710 | Average legroom (30 in) | Free Wi-Fi | In-seat USB outlet | Stream media to your device | Emissions estimate: 97 kg CO2e | Contrail warming potential: Low | 1 hr 45 min layoverFederal Territory of Kuala Lumpur\u00a0(KUL) | 4:05 PMKuala Lumpur International Airport\u00a0(KUL) | Travel time: 1 hr | 5:05 PMPenang International Airport\u00a0(PEN) | Malaysia AirlinesEconomyBoeing 737MAX 8 PassengerMH\u00a01152 | Average legroom (30 in) | Free Wi-Fi | In-seat USB outlet | Stream media to your device | Emissions estimate: 45 kg CO2e | Contrail warming potential: Low | Select flight";
const MH762 =
  "Departure | Mon, Nov 16 | 99 kg CO2e | Avg emissions | $166 | 4:40 PMKuala Lumpur International Airport\u00a0(KUL) | Travel time: 1 hr 50 min | 5:30 PMTecho International Airport\u00a0(KTI) | Malaysia AirlinesEconomyBoeing 737MH\u00a0762 | Average legroom (30 in) | In-seat USB outlet | Stream media to your device | Emissions estimate: 99 kg CO2e | Contrail warming potential: Medium | Select flight";
const SQ957 =
  "Departure | Mon, Nov 16 | 93 kg CO2e | Avg emissions | Select flight | $157 | 11:10 AMSoekarno\u2013Hatta International Airport\u00a0(CGK) | Travel time: 1 hr 45 min | 1:55 PMSingapore Changi Airport\u00a0(SIN) | Singapore AirlinesEconomyAirbus A350SQ\u00a0957 | Above average legroom (32 in) | Free Wi-Fi | In-seat power & USB outlets | On-demand video | Emissions estimate: 93 kg CO2e | Contrail warming potential: Low";
const SQ158 =
  "Departure | Mon, Nov 16 | 88 kg CO2e | -14% emissions | $208 | 5:30 PMSingapore Changi Airport\u00a0(SIN) | Travel time: 2 hr | 6:30 PMTecho International Airport\u00a0(KTI) | Singapore AirlinesEconomyAirbus A350SQ\u00a0158 | Above average legroom (32 in) | Free Wi-Fi | In-seat power & USB outlets | On-demand video | Emissions estimate: 88 kg CO2e | Contrail warming potential: Low | Select flight";
const TR_OVERNIGHT =
  "Departure | Mon, Nov 16 | 138 kg CO2e | Avg emissions | $160 | 9:35 AMSoekarno\u2013Hatta International Airport\u00a0(CGK) | Travel time: 1 hr 50 min | 12:25 PMSingapore Changi Airport\u00a0(SIN) | ScootEconomyAirbus A320neoTR\u00a0275 | Below average legroom (28 in) | Emissions estimate: 71 kg CO2e | Contrail warming potential: Low | 18 hr 25 min layoverSingapore\u00a0(SIN)Long layover | 6:50 AM+1Singapore Changi Airport\u00a0(SIN) | Travel time: 1 hr 40 min | 8:30 AM+1Penang International Airport\u00a0(PEN) | ScootEconomyAirbus A320TR\u00a0430 | Below average legroom (28 in) | Emissions estimate: 67 kg CO2e | Contrail warming potential: Low | Select flight";
const SUMMARY_ROWS = [
  "12:20 PM | \u2013 | 5:30 PM | Malaysia Airlines | 5 hr 10 min | CGK\u2013KTI | 1 stop | 1 hr 10 min KUL | 196 kg CO2e | $212",
  "4:25 AM | \u2013 | 10:00 AM | Malaysia Airlines | 5 hr 35 min | CGK\u2013KTI | 1 stop | 1 hr 40 min KUL | 209 kg CO2e | $212",
  "9:40 AM | \u2013 | 5:30 PM | Malaysia Airlines | 7 hr 50 min | CGK\u2013KTI | 1 stop | 3 hr 45 min KUL | 196 kg CO2e | $212",
  "11:10 AM | \u2013 | 5:30 PM | Malaysia Airlines | 6 hr 20 min | CGK\u2013KTI | 1 stop | 2 hr 20 min KUL | 196 kg CO2e | $212",
  "5:25 AM | \u2013 | 1:45 PM | Singapore Airlines | 8 hr 20 min | CGK\u2013KTI | 1 stop | 4 hr 40 min SIN | 185 kg CO2e | Price unavailable",
  "8:40 AM | \u2013 | 1:45 PM | Singapore Airlines | 5 hr 5 min | CGK\u2013KTI | 1 stop | 1 hr 25 min SIN | 213 kg CO2e | Price unavailable",
  "8:40 AM | \u2013 | 6:30 PM | Singapore Airlines | 9 hr 50 min | CGK\u2013KTI | 1 stop | 6 hr 10 min SIN | 200 kg CO2e | Price unavailable",
  "9:30 AM | \u2013 | 6:30 PM | Singapore Airlines | 9 hr | CGK\u2013KTI | 1 stop | 5 hr 15 min SIN | 181 kg CO2e | Price unavailable",
  "11:10 AM | \u2013 | 6:30 PM | Singapore Airlines | 7 hr 20 min | CGK\u2013KTI | 1 stop | 3 hr 35 min SIN | 181 kg CO2e | Price unavailable",
  "4:25 AM | \u2013 | 1:10 PM | Malaysia Airlines, Firefly | 7 hr 45 min | CGK\u2013PEN | 2 stops | KUL, LGK | 207 kg CO2e | +43% emissions | $318"
];
// MH710（真实）＋ 2h20 等待 ＋ MH762（真实）
const MH710_MH762 = MH710_MH1152.slice(0, MH710_MH1152.indexOf(' | 1 hr 45 min layover'))
  + ' | 2 hr 20 min layoverFederal Territory of Kuala Lumpur (KUL) | '
  + MH762.slice(MH762.indexOf('4:40 PM'));

const hm = (it) => [it.dep, it.arr].map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);

// 1. 基本零件
eq('时长 2 hr 10 min', parseDuration('2 hr 10 min'), 130);
eq('时长 1 hr', parseDuration('1 hr'), 60);
eq('时长 45 min', parseDuration('45 min'), 45);
eq('时长认不出', parseDuration('Nonstop'), null);
eq('12:25 PM', parseClock('12:25 PM').min, 745);
eq('12:05 AM 是半夜', parseClock('12:05 AM').min, 5);
eq('U+202F 窄空格也认', parseClock('6:50 AM+1').min, 410);
eq('+1 天', parseClock('6:50 AM+1').day, 1);
eq('日期写法与页面一致', dateLabel('2026-11-16'), 'Mon, Nov 16');
ok('网址带航线与日期', buildUrl({ from: 'CGK', to: 'KTI', date: '2026-11-16' }).includes('CGK%20to%20KTI%20on%202026-11-16'));
ok('2 人时网址带人数', buildUrl({ from: 'CGK', to: 'KTI', date: '2026-11-16', adults: 2 }).includes('for%202%20adults'));

// 2. MH710 → KUL → MH1152 PEN（真实）：跨时区的全程陷阱
{
  const it = parseDetail(MH710_MH1152);
  ok('MH710+MH1152 认得出', it);
  eq('航班号', it.flights, ['MH710', 'MH1152']);
  eq('起讫', [it.from, it.to], ['CGK', 'PEN']);
  eq('出发/到达当地时间', hm(it), ['11:10', '17:05']);
  eq('第一段 CGK 11:10 → KUL 14:20', [it.segments[0].dep.min, it.segments[0].arr.code, it.segments[0].arr.min], [670, 'KUL', 860]);
  eq('KUL 等 1h45（按时刻算）', it.layovers.map((l) => [l.at, l.min]), [['KUL', 105]]);
  eq('页面写的等待一致', it.mismatch, []);
  eq('全程 4h55（不是两端当地时刻相减的 5h55）', it.durationMin, 295);
  eq('机型从黏连文字切出来', it.segments[0].aircraft, 'Boeing 737MAX 8 Passenger');
  eq('航司', it.airlines, ['Malaysia Airlines']);
  eq('价格', it.price, '$161');
  eq('页面日期', it.dateLabel, 'Mon, Nov 16');
}

// 3. MH710 → KUL → MH762 KTI：任务指定的验收例
{
  const it = parseDetail(MH710_MH762);
  eq('MH710+MH762 航班号', it.flights, ['MH710', 'MH762']);
  eq('MH762 KUL 16:40 → KTI 17:30', [it.segments[1].dep.min, it.segments[1].arr.code, it.segments[1].arr.min], [1000, 'KTI', 1050]);
  eq('KUL 等 2h20', it.layovers[0].min, 140);
  eq('全程 6h20', fmtDur(it.durationMin), '6h20');
  // 反向：页面写的等待跟时刻对不上时必须标出来（不然坏数据会静默流出去）
  const bad = parseDetail(MH710_MH762.replace('2 hr 20 min layover', '1 hr 20 min layover'));
  eq('等待对不上会被标出', bad.mismatch.length, 1);
  eq('但照时刻算的 2h20 为准', bad.layovers[0].min, 140);
}

// 4. 单段：SQ957、SQ158
{
  const a = parseDetail(SQ957);
  eq('SQ957 航班号', a.flights, ['SQ957']);
  eq('SQ957 11:10 → 13:55', hm(a), ['11:10', '13:55']);
  eq('SQ957 直飞', a.stops, 0);
  eq('SQ957 机型', a.segments[0].aircraft, 'Airbus A350');
  eq('SQ957 价格（Select flight 在价格前也不误认）', a.price, '$157');
  const b = parseDetail(SQ158);
  eq('SQ158 SIN 17:30 → KTI 18:30', [b.from, ...hm(b), b.to], ['SIN', '17:30', '18:30', 'KTI']);
  eq('SQ158 飞 2h（跨时区：当地时刻差 1h）', b.durationMin, 120);
  eq('SQ158 航班号', b.flights, ['SQ158']);
}

// 5. 隔夜：TR275 → SIN 等 18h25 → TR430 次日 6:50
{
  const it = parseDetail(TR_OVERNIGHT);
  eq('隔夜航班号', it.flights, ['TR275', 'TR430']);
  eq('第二段是次日', [it.segments[1].dep.day, it.arrDay], [1, 1]);
  eq('隔夜等 18h25', it.layovers[0].min, 1105);
  eq('隔夜全程 21h55', fmtDur(it.durationMin), '21h55');
  eq('航司 Scoot', it.airlines, ['Scoot']);
}

// 6. 收合列
{
  const rows = SUMMARY_ROWS.map(parseSummary);
  ok('收合列全部认得出', rows.every(Boolean));
  const mh = rows[3];
  eq('11:10 MH 经 KUL 等 2h20', [...hm(mh), mh.airlines, mh.stops, mh.layovers, mh.price, mh.durationMin],
    ['11:10', '17:30', ['Malaysia Airlines'], 1, [{ at: 'KUL', min: 140 }], '$212', 380]);
  eq('无报价不当成价格', [rows[4].price, rows[4].priceUnavailable], [null, true]);
  eq('9 hr 也认', rows[7].durationMin, 540);
  const two = rows[9];
  eq('两次转机', [two.stops, two.layovers.map((l) => l.at), two.airlines], [2, ['KUL', 'LGK'], ['Malaysia Airlines', 'Firefly']]);
  eq('详情文字不会被当成收合列', parseSummary(SQ957), null);
  eq('收合列不会被当成详情', parseDetail(SUMMARY_ROWS[0]), null);
}

// 7. 合并：同一班同时有详情与收合列时只留详情（带航班号）；没有详情的收合列保留
{
  const texts = [MH710_MH762, MH710_MH762, ...SUMMARY_ROWS.slice(0, 5), 'Skip to main content', 'Oops, something went wrong.'];
  const its = collectItineraries(texts);
  eq('合并后数量（重复详情去掉、对应的收合列并入）', its.length, 5);
  const mh = its.find((x) => x.flights.includes('MH710'));
  ok('合并后 MH710+MH762 还在', mh);
  eq('详情自己的价格保留', mh.price, '$161');
  eq('按出发时间排', its.map((x) => x.dep), [265, 325, 580, 670, 740]);
  eq('航司过滤 SQ', collectItineraries(texts, { airline: 'Singapore' }).length, 1);
  eq('航司过滤用代码 MH', collectItineraries(texts, { airline: 'MH' }).length, 4);
  eq('页面坏掉（只有错误字样）→ 0 个', collectItineraries(['Skip to main content', 'Oops, something went wrong.', 'No results returned.']).length, 0);

  const meta = { from: 'CGK', to: 'KTI', date: '2026-11-16', adults: 1, url: 'https://example/', warnings: [] };
  const md = toMarkdown(its, meta);
  ok('markdown 有表头', md.includes('| # | 航段（航班号 起飞→降落）'));
  ok('markdown 有 MH710 那一行', /MH710 CGK 11:10→KUL 14:20<br>MH762 KUL 16:40→KTI 17:30/.test(md));
  ok('markdown 写出转机等待', md.includes('KUL 等 2h20'));
  ok('没展开的标出来', md.includes('（未展开，无航班号）'));
  const txt = toText(its, meta);
  ok('日志纯文字版有航班', txt.includes('MH710 CGK 11:10→KUL 14:20 / MH762 KUL 16:40→KTI 17:30'));
  ok('空结果写明没抓到', toMarkdown([], meta).includes('没有抓到任何航班'));

  // smoke 门槛：正常结果过、坏结果一定红（绿灯要先被验证会红）
  eq('正常结果 smoke 通过', smokeProblems(its, meta), []);
  eq('只剩收合列（展开坏了）smoke 会红', smokeProblems(collectItineraries(SUMMARY_ROWS), meta).length, 1);
  eq('空结果 smoke 会红', smokeProblems([], meta).length, 2);
  eq('日期对不上 smoke 会红', smokeProblems(its, { dateMismatch: 'x' }).length, 1);
}

const total = pass + fails.length;
if (fails.length) {
  console.log(`不通过：${fails.length}/${total} 项不符`);
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`通过：查航班解析器 ${total} 项断言全部符合（真实 Google Flights 页面文字）`);
