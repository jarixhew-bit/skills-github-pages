#!/usr/bin/env node
/**
 * 验 trading/index.html 的「持仓底数过期」警告。
 *
 * 为什么要单独测：这块的价值全在**什么时候不该报警**。Flex Query 的周期是
 * LastBusinessDay，落后 1 个交易日是天天都有的正常状态；如果判据写成日历天数，
 * 每个周一都会跳出「持仓已落后 3 天」，美股假日后更乱——警告每周误报一次，
 * 用户两星期就学会无视它，那么真正停更的那天也就没人看了。
 * 反过来，漏报的代价是 2026-10-26 那次：加仓后股数、现金都还是旧的，
 * 而「建议」和「决策日志」是拿现金算的，会告出「现金足够，可以补仓」
 * 这种与事实相反的结论。
 *
 * 做法：从 index.html 里把真正发布出去的那两个函数抠出来跑（不是另抄一份逻辑，
 * 抄一份就会出现「测试过了、页面还是错的」），用合成的 nav_series 喂进去。
 * 不需要浏览器、不需要密码，所以可以挂 CI 每次改动都跑。
 *
 * 用法：node tools/check-flex-stale.mjs      退出码 0 = 通过，1 = 有用例不符预期
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(join(ROOT, "trading", "index.html"), "utf8");

// —— 把页面里的那两个函数抠出来 ——
const START = "function flexLagTradingDays(P) {";
const END = "function renderDecisionLog(";
const a = HTML.indexOf(START);
const b = HTML.indexOf(END);
if (a < 0 || b < 0 || b < a) {
  console.error("不通过：在 index.html 里找不到 flexLagTradingDays / renderDecisionLog。");
  console.error("  这两个函数被改名或删掉了？本自检靠它们定位，请同步改 START/END。");
  process.exit(1);
}
const source = HTML.slice(a, b);
for (const must of ["function renderFlexStale(P) {", "nav_series"]) {
  if (!source.includes(must)) {
    console.error(`不通过：抠出来的代码里没有 ${must}，定位范围不对。`);
    process.exit(1);
  }
}

// —— 打桩：假的 DOM 节点与 esc ——
let node;
const $ = () => node;
const esc = (s) => String(s);
const factory = new Function("$", "esc", source + "\nreturn { flexLagTradingDays, renderFlexStale };");
const { flexLagTradingDays, renderFlexStale } = factory($, esc);

function run(P) {
  node = { innerHTML: "", style: { display: "" } };
  renderFlexStale(P);
  return { lag: flexLagTradingDays(P), shown: node.style.display !== "none", html: node.innerHTML };
}

/** 造一条 nav_series：给定日期列表（视为交易日） */
const series = (...days) => days.map((d) => [d, 100000]);

const CASES = [
  {
    name: "正常滞后 1 个交易日（周四对账、周五行情）不报警",
    P: { account: { synced: "2026-10-22" }, nav_series: series("2026-10-21", "2026-10-22", "2026-10-23") },
    ok: (r) => r.lag === 1 && !r.shown,
  },
  {
    // 最容易写错的一条：照日历算这里是 3 天，会每个周一误报一次
    name: "周一不许误报（周五对账、周一行情，中间是周末）",
    P: { account: { synced: "2026-10-23" }, nav_series: series("2026-10-22", "2026-10-23", "2026-10-26") },
    ok: (r) => r.lag === 1 && !r.shown,
  },
  {
    // 感恩节：周三收盘对账，下一个交易日是周五，隔了 2 个日历天但只过了 1 个交易日
    name: "美股假日不许误报",
    P: { account: { synced: "2026-11-25" }, nav_series: series("2026-11-24", "2026-11-25", "2026-11-27") },
    ok: (r) => r.lag === 1 && !r.shown,
  },
  {
    name: "对账日就是最新行情日（lag 0）不报警",
    P: { account: { synced: "2026-10-23" }, nav_series: series("2026-10-22", "2026-10-23") },
    ok: (r) => r.lag === 0 && !r.shown,
  },
  {
    // 2026-10-26 真实踩到的那次：周四对账，之后周五、周一两个交易日都没同步上
    name: "落后 2 个交易日要报警，并说出是几个交易日",
    P: { account: { synced: "2026-10-22" }, nav_series: series("2026-10-22", "2026-10-23", "2026-10-26") },
    ok: (r) => r.lag === 2 && r.shown && r.html.includes("2 个交易日"),
  },
  {
    name: "停很久也要报警，数字跟着变",
    P: {
      account: { synced: "2026-10-16" },
      nav_series: series("2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"),
    },
    ok: (r) => r.lag === 5 && r.shown && r.html.includes("5 个交易日"),
  },
  {
    name: "报警文案的加粗处要同时点出股数与现金",
    // 只说「股数旧了」不够：现金才是再平衡建议的输入，用户看不到就会照着
    // 一个已经花掉的现金余额去决定补不补仓。
    // 断言钉在 <b> 里而不是整段文字上：整段里本来就另有一句「按现金算出来的
    // 结论」，拿整段做 includes("现金") 的话，把加粗处改成只说「股数是旧的」
    // 也验得过——这条断言第一版就是这么写的，变异测试才抓出来它是假的。
    P: { account: { synced: "2026-10-22" }, nav_series: series("2026-10-23", "2026-10-26") },
    ok: (r) => {
      const bolds = [...r.html.matchAll(/<b>(.*?)<\/b>/g)].map((m) => m[1]);
      return r.shown && bolds.some((t) => t.includes("股数") && t.includes("现金"));
    },
  },
  {
    name: "报警文案要带上最后对账日期",
    P: { account: { synced: "2026-10-22" }, nav_series: series("2026-10-23", "2026-10-26") },
    ok: (r) => r.shown && r.html.includes("2026-10-22"),
  },
  {
    name: "没有对账日期时不许瞎报（无从判断）",
    P: { account: {}, nav_series: series("2026-10-23", "2026-10-26") },
    ok: (r) => r.lag === null && !r.shown,
  },
  {
    name: "nav_series 为空时不许瞎报",
    P: { account: { synced: "2026-10-22" }, nav_series: [] },
    ok: (r) => r.lag === null && !r.shown,
  },
  {
    name: "缺 account / nav_series 字段也不能崩",
    P: {},
    ok: (r) => r.lag === null && !r.shown,
  },
];

const failures = [];
for (const c of CASES) {
  let r;
  try {
    r = run(c.P);
  } catch (e) {
    failures.push(`${c.name}：抛出 ${e.name}: ${e.message}`);
    continue;
  }
  if (!c.ok(r)) failures.push(`${c.name}：结果不符预期\n      lag=${r.lag} shown=${r.shown}\n      html=${r.html}`);
}

// 页面上那行小字也要带对账日期——这次出问题的根源就是「日期藏在现金的 sub 里，
// 没挂在股数旁边」，所以把它钉住，别又被挪回去
if (!HTML.includes("股数与现金截至")) {
  failures.push('index.html 的 #pfSub 不再写「股数与现金截至 <日期>」——对账日期必须就在股数旁边');
}

if (failures.length) {
  console.log(`不通过（${failures.length} 项）：`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`通过：${CASES.length} 个持仓过期警告用例全部符合预期`);
