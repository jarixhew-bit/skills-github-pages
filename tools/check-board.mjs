/**
 * trading/board.html（券商风格自选股看板）的自检 —— 真浏览器跑，Playwright。
 *
 * 跑法：
 *   python3 -m http.server 8899 &
 *   node tools/check-board.mjs
 * 沙盒里要带 CHROMIUM_PATH=/opt/pw-browsers/chromium。
 * （`python3 tools/check-all.py` 会自动起 server 并带上 CHROMIUM_PATH。）
 *
 * 为什么要真浏览器：涨跌、涨跌%、损益、合计全是前端现算的，读代码看不出算错，
 * 只有拿手算得出的 fixture 去对。这是钱的页面，算错比不显示更糟。
 *
 * 三个数据档（data-public.json / data-private.enc / history/*.json）全用固定 fixture 拦掉：
 * 私密档加密、CI 没密码；公开档每小时被 Actions 改写，拿真档做数值断言会随行情每天红。
 * 私密档的密文由本脚本用 Node crypto 现场加密，顺带验证封装格式与浏览器解密互通。
 *
 * 手算过程（fixture 数字刻意挑成整数）：
 *   AAA 110 / 前收 100 → +10.00  +10.00%        CCC 90 / 前收 120 → -30.00  -25.00%
 *   BBB  50 / 前收  50 →  0.00    0.00%        DDD 20.5 / 前收 20 → +0.50   +2.50%
 *   持仓 AAA 10 股 成本 80：市值 1100，总损益 +300（+37.50%），今日 +100（+10.00%）
 *   持仓 CCC 20 股 成本 100：市值 1800，总损益 -200（-10.00%），今日 -600（-25.00%）
 *   持仓 BBB  5 股 成本 50：市值  250，总损益 0，今日 0
 *   合计：市值 3150；成本 3050；总损益 +100 → +3.28%（100/3050）；
 *         今日 -500，昨日市值 3650 → -13.70%
 *
 * 近即时报价（CNBC，F 区）：浏览器直连 CNBC，这里用 ctx.route 拦截并回假响应（拦不到真网络）。
 * 情境：same（与每小时价相同）／live（价格不同，DDD、CCC 缺档）／closed（POST_MKT）／down（HTTP 500）／flap（先好后坏）。
 * live 情境手算（缺档 DDD、CCC 沿用每小时价）：
 *   AAA 现价 120 涨跌 +15 → 前收 105 → +14.29%（15/105）；BBB 50.5 / +0.5 → 前收 50 → +1.00%
 *   SPY 700.7 / +7.7 → 前收 693 → +1.11%；QQQ 601.2 / -1.2 → 前收 602.4 → -0.20%
 *   持仓：AAA 10 股 成本 80 → 市值 1200、今日 +150（150/1050 = +14.29%）、总损益 +400（+50.00%）
 *         BBB  5 股 成本 50 → 市值 252.5、今日 +2.5（2.5/250 = +1.00%）、总损益 +2.5（+1.00%）
 *         CCC 缺档 → 沿用每小时：价 90、市值 1800、今日 -600、总损益 -200
 *   合计：市值 3252.5；今日 -447.5，昨日市值 3700 → -12.09%；总损益 +202.5 / 成本 3050 = +6.64%
 */
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.CHECK_PORT || 8899;
const URL = `http://localhost:${PORT}/trading/board.html`;
const PW = 'test-password-not-real';

const fails = [];
const ok = [];
function check(cond, label) { (cond ? ok : fails).push(label); }
function eq(a, b, label) { check(a === b, `${label}（期望 ${JSON.stringify(b)}，实得 ${JSON.stringify(a)}）`); }

function encryptJson(obj, password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 300000, 32, 'sha256');
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), 'utf8')), c.final(), c.getAuthTag()]);
  return JSON.stringify({ v: 1, kdf: 'pbkdf2-sha256', iter: 300000,
    salt: salt.toString('base64'), nonce: nonce.toString('base64'), ct: ct.toString('base64') });
}

/* ---------- fixture ---------- */
const mk = (symbol, name, price, prev, over) => ({
  symbol, name, etf: false, price, prev_close: prev, chg1d: 0, score: 0, action: '中性观望', act_cls: 'hold',
  date: '2026-10-06', ...over });
const PUBLIC_FIX = {
  generated_at: '2026-10-06 23:08 UTC', data_date: '2026-10-06',
  market: { line: 'x', breadth: 52, spy: { trend: '多头趋势', chg1d: 0.5, price: 700 }, qqq: { trend: '多头趋势', chg1d: 0.4, price: 600 } },
  opportunities: ['AAA'], weak: ['CCC'],
  tickers: [
    mk('AAA', '甲公司', 110, 100),
    mk('BBB', '乙基金', 50, 50, { etf: true }),
    mk('CCC', '丙公司', 90, 120),
    mk('DDD', '丁公司', 20.5, 20),
    mk('SPY', '标普500 ETF', 700, 693, { etf: true }),     // +7.00 / +1.0101% → +1.01%
    mk('QQQ', '纳指100 ETF', 600, 600, { etf: true }),
  ],
  warnings: [],
};
const PRIVATE_FIX = {
  generated_at: '2026-10-06 23:08 UTC',
  account: { net_liq: 9999, cash: 1 },
  positions: [
    { symbol: 'AAA', qty: 10, avg_price: 80, price: 110, value: 1100, upnl: 300, upct: 37.5, daily_pnl: 100, weight: 30, signal: null, notes: [] },
    { symbol: 'CCC', qty: 20, avg_price: 100, price: 90, value: 1800, upnl: -200, upct: -10, daily_pnl: -600, weight: 50, signal: null, notes: [] },
    { symbol: 'BBB', qty: 5, avg_price: 50, price: 50, value: 250, upnl: 0, upct: 0, daily_pnl: 0, weight: 7, signal: null, notes: [] },
  ],
};
// 日线 fixture：70 根，偶数根收阳（c>o）、奇数根收阴。最高价（最高的影线）特意放在第 63 根。
const BARS = [];
for (let i = 0; i < 70; i++) {
  const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
  const o = 100 + i * 0.1;
  const c = i % 2 === 0 ? o + 1 : o - 1;
  const h = (i === 63 ? 200 : Math.max(o, c) + 0.5), l = Math.min(o, c) - 0.5;
  BARS.push([d, o, h, l, c, 1000 + i]);
}
const UP_IN_LAST_60 = BARS.slice(-60).filter(b => b[4] >= b[1]).length;   // 独立算：阳线根数

/* ---------- 浏览器 ---------- */
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

/* ---------- CNBC 假响应 ---------- */
const etStamp = (ageMs = 0) => new Date(Date.now() - ageMs).toISOString().replace('Z', '+0000').replace(/\.(\d{3})\+/, '.$1+'); // 无冒号时区，同 CNBC 格式
const cq = (symbol, last, change, o = {}) => ({ symbol, code: 0, last, change, previous_day_closing: '999', curmktstatus: 'REG_MKT',
  last_time: etStamp(o.age ?? 120000), ...o.extra });
const CNBC_SCEN = {
  same: () => [cq('AAA', '110.00', '+10.00'), cq('BBB', '50.00', 'UNCH'), cq('CCC', '90.00', '-30.00'), cq('DDD', '20.50', '+0.50'), cq('SPY', '700.00', '+7.00'), cq('QQQ', '600.00', 'UNCH')],
  live: () => [cq('AAA', '120.00', '+15.00'), cq('BBB', '50.50', '+0.50'), { symbol: 'CCC', code: 1 }, { symbol: 'DDD', code: 1 }, cq('SPY', '700.70', '+7.70'), cq('QQQ', '601.20', '-1.20')],
  closed: () => [cq('AAA', '110.00', '+10.00', { extra: { curmktstatus: 'POST_MKT' } }), cq('SPY', '700.00', '+7.00', { extra: { curmktstatus: 'POST_MKT' } })],
};
const bodyOf = rows => JSON.stringify({ FormattedQuoteResult: { FormattedQuote: rows } });

async function open({ password, viewport, cnbc = 'same', cfg } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 }, locale: 'zh-CN' });
  const errors = [], reqs = [], cnbcReqs = [];
  let flapCount = 0;
  const page = await ctx.newPage();
  page.on('dialog', d => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  await ctx.route('**/*', route => {
    const u = route.request().url();
    reqs.push(u);
    if (u.startsWith('https://quote.cnbc.com/')) {
      cnbcReqs.push(route.request());
      const h = { 'access-control-allow-origin': '*' };
      if (cnbc === 'down') return route.fulfill({ status: 500, headers: h, body: 'oops' });
      if (cnbc === 'garbage') return route.fulfill({ status: 200, headers: h, contentType: 'application/json', body: '{"x":1}' });
      if (cnbc === 'hang') return new Promise(r => setTimeout(r, 4000)).then(() => route.abort()).catch(() => {});
      if (cnbc === 'flap' && ++flapCount > 1) return route.fulfill({ status: 500, headers: h, body: 'oops' });
      const rows = (CNBC_SCEN[cnbc === 'flap' ? 'live' : cnbc] || CNBC_SCEN.same)();
      return route.fulfill({ status: 200, headers: h, contentType: 'application/json', body: bodyOf(rows) });
    }
    if (u.includes('data-public.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PUBLIC_FIX) });
    if (u.includes('data-private.enc')) return route.fulfill({ status: 200, contentType: 'text/plain', body: encryptJson(PRIVATE_FIX, PW) });
    if (u.includes('/history/AAA.json')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ symbol: 'AAA', bars: BARS }) });
    if (u.includes('/history/')) return route.fulfill({ status: 404, body: 'no' });
    if (u.startsWith(`http://localhost:${PORT}/`)) return route.continue();
    return route.abort();
  });
  if (password) {
    await ctx.addInitScript(pw => { try { localStorage.setItem('tradingAnalyzerPw', pw); } catch (e) {} }, password);
  }
  if (cfg) await ctx.addInitScript(c => { window.BOARD_CFG = c; }, cfg);
  await page.goto(URL, { waitUntil: cfg ? 'load' : 'networkidle' });   // 高频轮询时永远不会 networkidle
  await page.waitForSelector('tr.row');
  if (cnbc !== 'none') await page.waitForFunction(() => document.getElementById('qstatus') && /live|fail/.test(document.getElementById('qstatus').className), null, { timeout: 8000 }).catch(() => {});
  return { ctx, page, errors, reqs, cnbcReqs };
}
const cell = (page, sym, k, root = 'tbody') => page.locator(`${root} tr[data-sym="${sym}"] td[data-k="${k}"]`).first().innerText();
const colorOf = (loc) => loc.evaluate(el => getComputedStyle(el).color);
const syms = page => page.$$eval('#watchCols tr.row', rs => rs.map(r => r.dataset.sym));

/* ===== A. 没有密码：自选股照常，损益页只显示解锁框，不报错、不发加密档请求 ===== */
{
  const { ctx, page, errors, reqs } = await open();
  eq((await syms(page)).join(), 'AAA,DDD,SPY,BBB,QQQ,CCC', 'A1 默认按涨跌% 由高到低（AAA 10 > DDD 2.5 > SPY 1.01 > BBB 0 = QQQ 0 按代号 > CCC -25）');
  // 涨跌、涨跌%
  eq(await cell(page, 'AAA', 'price'), '110.00', 'A2 AAA 现价');
  eq(await cell(page, 'AAA', 'chg'), '+10.00', 'A3 AAA 涨跌 = 110-100');
  eq(await cell(page, 'AAA', 'pct'), '▲ +10.00%', 'A4 AAA 涨跌% = 10%');
  eq(await cell(page, 'CCC', 'chg'), '-30.00', 'A5 CCC 涨跌');
  eq(await cell(page, 'CCC', 'pct'), '▼ -25.00%', 'A6 CCC 涨跌% = -25%');
  eq(await cell(page, 'DDD', 'chg'), '+0.50', 'A7 DDD 涨跌（小数价）');
  eq(await cell(page, 'DDD', 'pct'), '▲ +2.50%', 'A8 DDD 涨跌% = 2.5%');
  eq(await cell(page, 'BBB', 'pct'), '– 0.00%', 'A9 平盘不带正负号');
  eq(await cell(page, 'SPY', 'pct'), '▲ +1.01%', 'A10 SPY 涨跌% = 7/693 = 1.0101%');
  // 绿涨红跌
  const upC = await colorOf(page.locator('tr[data-sym="AAA"] td[data-k="pct"]'));
  const dnC = await colorOf(page.locator('tr[data-sym="CCC"] td[data-k="pct"]'));
  const flC = await colorOf(page.locator('tr[data-sym="BBB"] td[data-k="pct"]'));
  const rgb = s => s.match(/\d+/g).map(Number);
  const [ur, ug, ub] = rgb(upC), [dr, dg, db] = rgb(dnC);
  check(ug > ur && ug > ub, `A11 上涨必须是绿色（实得 ${upC}）`);
  check(dr > dg && dr > db, `A12 下跌必须是红色（实得 ${dnC}）`);
  check(flC !== upC && flC !== dnC, `A13 平盘既不是绿也不是红（实得 ${flC}）`);
  eq(await colorOf(page.locator('tr[data-sym="AAA"] td[data-k="price"]')), upC, 'A14 现价跟着涨跌变色（涨→绿）');
  // 指数列：只显示 fixture 里真有的（SPY/QQQ），没有的（DIA/IWM）不得编
  eq((await page.$$eval('.idx', e => e.map(x => x.dataset.idx))).join(), 'SPY,QQQ', 'A15 指数列只列数据里有的，不编');
  check((await page.locator('.idx[data-idx="SPY"]').innerText()).includes('+1.01%'), 'A16 指数列带涨跌%');
  // 排序：点表头
  await page.click('th[data-sort="price"]');
  eq((await syms(page)).join(), 'SPY,QQQ,AAA,CCC,BBB,DDD', 'A17 点「现价」→ 由高到低');
  await page.click('th[data-sort="price"]');
  eq((await syms(page)).join(), 'DDD,BBB,CCC,AAA,QQQ,SPY', 'A18 再点一次 → 反向');
  await page.click('th[data-sort="sym"]');
  eq((await syms(page)).join(), 'AAA,BBB,CCC,DDD,QQQ,SPY', 'A19 点「代号」→ 字母升序');
  // 筛选与搜索
  await page.click('.chip[data-f="etf"]');
  eq((await syms(page)).sort().join(), 'BBB,QQQ,SPY', 'A20 ETF 筛选');
  await page.click('.chip[data-f="buy"]');
  eq((await syms(page)).join(), 'AAA', 'A21 买入信号筛选（来自 opportunities）');
  await page.click('.chip[data-f="all"]');
  await page.fill('#q', '丙');
  eq((await syms(page)).join(), 'CCC', 'A22 按中文名搜索');
  await page.fill('#q', 'dd');
  eq((await syms(page)).join(), 'DDD', 'A23 按代号搜索（不分大小写）');
  await page.fill('#q', 'zzz');
  check((await page.locator('#watchCols .empty').count()) === 1, 'A24 无结果时有提示');
  await page.fill('#q', '');
  // 没有密码：不泄露持仓、没有「持仓」筛选、不发加密档请求
  check((await page.locator('.chip[data-f="held"]').count()) === 0, 'A25 未解锁时不得出现「持仓」筛选');
  check(!reqs.some(u => u.includes('data-private.enc')), 'A26 没存密码时不得去抓加密档');
  await page.click('.tab[data-tab="pnl"]');
  check(await page.locator('#lockbox').isVisible(), 'A27 损益页显示解锁框');
  const body = await page.locator('body').innerText();
  check(!body.includes('3,150') && !body.includes('1,100'), 'A28 未解锁时不得出现任何持仓金额');
  // 错误密码
  await page.fill('#pwInput', 'wrong-password');
  await page.click('#pwBtn');
  await page.locator('#pwErr').waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  check(await page.locator('#pwErr').isVisible(), 'A29 错误密码显示提示');
  check(await page.locator('#pnlTable').count() === 0, 'A30 错误密码不得解锁');
  check(await page.evaluate(() => localStorage.getItem('tradingAnalyzerPw')) === null, 'A31 错误密码不得被存下来');
  // 正确密码
  await page.fill('#pwInput', PW);
  await page.click('#pwBtn');
  await page.locator('#pnlTable').waitFor({ timeout: 8000 });
  eq(await page.evaluate(() => localStorage.getItem('tradingAnalyzerPw')), PW, 'A32 解锁后用同一个 key（tradingAnalyzerPw）记住密码');
  check(errors.length === 0, `A33 无 JS 错误（实得 ${errors.slice(0, 3).join(' | ')}）`);
  await ctx.close();
}

/* ===== B. 有密码：损益视图 ===== */
{
  const { ctx, page, errors } = await open({ password: PW });
  await page.click('.tab[data-tab="pnl"]');
  await page.locator('#pnlTable').waitFor({ timeout: 8000 });
  const P = (s, k) => cell(page, s, k, '#pnlTable tbody');
  eq(await P('AAA', 'qty'), '10', 'B1 股数');
  eq(await P('AAA', 'avg'), '80.00', 'B2 成本');
  eq(await P('AAA', 'price'), '110.00', 'B3 现价');
  eq(await P('AAA', 'todayPct'), '+10.00%', 'B4 AAA 今日% = 100/1000');
  eq(await P('AAA', 'todayPnl'), '+100.00', 'B5 AAA 今日损益');
  eq(await P('AAA', 'pnl'), '+300.00', 'B6 AAA 总损益 = (110-80)×10');
  eq(await P('AAA', 'pnlPct'), '+37.50%', 'B7 AAA 损益% = 300/800');
  eq(await P('CCC', 'todayPct'), '-25.00%', 'B8 CCC 今日% = -600/2400');
  eq(await P('CCC', 'todayPnl'), '-600.00', 'B9 CCC 今日损益');
  eq(await P('CCC', 'pnl'), '-200.00', 'B10 CCC 总损益 = (90-100)×20');
  eq(await P('CCC', 'pnlPct'), '-10.00%', 'B11 CCC 损益% = -200/2000');
  eq(await P('BBB', 'pnl'), '0.00', 'B12 BBB 总损益为零不带符号');
  const T = k => page.locator(`#pnlTotal td[data-k="${k}"]`).innerText();
  eq(await T('todayPnl'), '-500.00', 'B13 合计今日损益 = 100-600+0');
  eq(await T('todayPct'), '-13.70%', 'B14 合计今日% = -500/3650');
  eq(await T('pnl'), '+100.00', 'B15 合计总损益 = 300-200+0');
  eq(await T('pnlPct'), '+3.28%', 'B16 合计损益% = 100/3050');
  eq(await page.locator('#pnlTiles [data-k="value"]').innerText(), '3,150.00', 'B17 持仓市值 = 1100+1800+250');
  // 配色
  const pc = await colorOf(page.locator('#pnlTable tr[data-sym="AAA"] td[data-k="pnl"]'));
  const nc = await colorOf(page.locator('#pnlTable tr[data-sym="CCC"] td[data-k="pnl"]'));
  const tc = await colorOf(page.locator('#pnlTotal td[data-k="todayPnl"]'));
  check(nc === tc && nc !== pc, `B18 亏损（含合计）红、盈利绿（盈 ${pc} / 亏 ${nc} / 合计今日 ${tc}）`);
  // 排序
  const order = () => page.$$eval('#pnlTable tbody tr', rs => rs.map(r => r.dataset.sym).join());
  eq(await order(), 'CCC,AAA,BBB', 'B19 默认按市值 1800 > 1100 > 250');
  await page.click('#pnlTable th[data-sort="pnl"]');
  eq(await order(), 'AAA,BBB,CCC', 'B20 按总损益降序 +300 > 0 > -200');
  await page.click('#pnlTable th[data-sort="pnl"]');
  eq(await order(), 'CCC,BBB,AAA', 'B21 再点反向');
  await page.click('#pnlTable th[data-sort="todayPct"]');
  eq(await order(), 'AAA,BBB,CCC', 'B22 按今日% 降序');
  await page.click('#pnlTable th[data-sort="pnlPct"]');
  eq(await order(), 'AAA,BBB,CCC', 'B23 按损益% 降序 37.5 > 0 > -10');
  check((await page.locator('#pnlTotal').count()) === 1, 'B24 排序后合计行仍在');
  eq(await T('pnl'), '+100.00', 'B25 排序不改变合计');
  // 解锁后出现「持仓」筛选
  await page.click('.tab[data-tab="watch"]');
  await page.click('.chip[data-f="held"]');
  eq((await syms(page)).sort().join(), 'AAA,BBB,CCC', 'B26 解锁后「持仓」筛选可用');
  // 锁定
  await page.click('.tab[data-tab="pnl"]');
  await page.click('#lockBtn');
  check(await page.locator('#lockbox').isVisible(), 'B27 锁定后回到解锁框');
  eq(await page.evaluate(() => localStorage.getItem('tradingAnalyzerPw')), null, 'B28 锁定后忘记密码');
  check(errors.length === 0, `B29 无 JS 错误（实得 ${errors.slice(0, 3).join(' | ')}）`);
  await ctx.close();
}

/* ===== C. 趋势图 ===== */
{
  const { ctx, page, errors } = await open();
  await page.click('tr[data-sym="AAA"]');       // 点自选股行 → 进趋势图
  await page.locator('#chartSvg').waitFor({ timeout: 8000 });
  eq(await page.locator('#chartSel').inputValue(), 'AAA', 'C1 点行后图表切到该股');
  eq(await page.locator('#chartSvg g.k').count(), 70, 'C2 默认 120 日范围，fixture 只有 70 根就画 70 根');
  await page.click('.chip[data-r="60"]');
  await page.waitForFunction(() => document.querySelectorAll('#chartSvg g.k').length === 60);
  eq(await page.locator('#chartSvg g.k').count(), 60, 'C3 60 日范围画 60 根');
  eq(await page.locator('#chartSvg g.k.up').count(), UP_IN_LAST_60, 'C4 阳线（绿）根数与独立统计一致');
  eq(await page.locator('#chartSvg g.k.down').count(), 60 - UP_IN_LAST_60, 'C5 阴线（红）根数一致');
  // 最高价那根（第 63 根，fixture 里 h=200）的影线顶端必须是全图最高（y 最小）
  const tops = await page.$$eval('#chartSvg g.k', gs => gs.map(g => +g.querySelector('line').getAttribute('y1')));
  const idxMax = tops.indexOf(Math.min(...tops));
  eq(idxMax, 63 - 10, 'C6 最高价所在那根的影线最高（70 根里取最后 60 根，第 63 根是窗口内第 53 根）');
  // 默认信息：最后一根
  const last = BARS[69];
  eq(await page.locator('#chClose').innerText(), last[4].toFixed(2), 'C7 默认显示最后一根收盘价');
  const prevC = BARS[68][4], chg = last[4] - prevC;
  check((await page.locator('#chChg').innerText()).includes((chg > 0 ? '+' : '') + chg.toFixed(2)), 'C8 涨跌 = 最后收盘 - 前一根收盘');
  // 悬停第一根
  const box = await page.locator('#chartSvg').boundingBox();
  await page.mouse.move(box.x + 6, box.y + 40);
  check((await page.locator('#chInfo').innerText()).includes(BARS[10][0]), 'C9 悬停最左一根显示该根日期（窗口第 0 根 = 全序列第 10 根）');
  // 绿涨红跌在 SVG 上也成立
  const gc = await page.$eval('#chartSvg g.k.up rect', el => getComputedStyle(el).fill);
  const rc = await page.$eval('#chartSvg g.k.down rect', el => getComputedStyle(el).fill);
  const [r1, g1] = gc.match(/\d+/g).map(Number), [r2, g2] = rc.match(/\d+/g).map(Number);
  check(g1 > r1 && r2 > g2, `C10 K 线阳绿阴红（阳 ${gc} / 阴 ${rc}）`);
  // 没有日线的股票：给提示，不报错、不空白
  await page.selectOption('#chartSel', 'DDD');
  await page.locator('#chartBox .empty').waitFor({ timeout: 8000 });
  check((await page.locator('#chartBox .empty').innerText()).length > 0, 'C11 日线载入失败时有提示');
  check(errors.every(e => e.includes('404') || e.includes('Failed to load resource')) , `C12 除了预期的 404 外无 JS 错误（实得 ${errors.slice(0, 3).join(' | ')}）`);
  await ctx.close();
}

/* ===== D. 语言：系统语言侦测、手动切换、全站共用 key ===== */
{
  // 英文系统：首次打开显示英文
  const ctxEn = await browser.newContext({ locale: 'en-US' });
  const pEn = await ctxEn.newPage();
  await ctxEn.route('**/*', r => { const u = r.request().url();
    if (u.includes('data-public.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PUBLIC_FIX) });
    if (u.startsWith(`http://localhost:${PORT}/`)) return r.continue(); return r.abort(); });
  await pEn.goto(URL, { waitUntil: 'networkidle' });
  await pEn.waitForSelector('tr.row');
  check((await pEn.locator('h1').innerText()).includes('Watchlist'), 'D1 英文系统首次打开显示英文');
  check((await pEn.locator('tr[data-sym="AAA"]').innerText()).includes('AAA'), 'D2 英文模式仍显示代号');
  eq(await pEn.locator('tr[data-sym="AAA"] .nm').innerText(), '甲公司', 'D3 英文名表里没有的代号退回数据里的名称');
  await pEn.click('#langBtn');
  eq(await pEn.evaluate(() => localStorage.getItem('siteLangUser')), 'cn', 'D4 手动切换后存进全站共用 key siteLangUser');
  check((await pEn.locator('h1').innerText()).includes('自选股'), 'D5 切换后变中文');
  await pEn.reload({ waitUntil: 'networkidle' }); await pEn.waitForSelector('tr.row');
  check((await pEn.locator('h1').innerText()).includes('自选股'), 'D6 手动选择优先于系统语言');
  // storage 事件即时同步
  await pEn.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'siteLangUser', newValue: 'en' })));
  check((await pEn.locator('h1').innerText()).includes('Watchlist'), 'D7 storage 事件让已开页面即时同步');
  // 页脚如实标注时间且不称「即时」
  const foot = await pEn.locator('#foot').innerText();
  check(foot.includes('2026-10-06 23:08 UTC'), 'D8 页脚标出 generated_at');
  check(foot.includes('Not real-time'), 'D9 英文页脚明说非即时');
  await pEn.click('#langBtn');
  const footZh = await pEn.locator('#foot').innerText();
  check(footZh.includes('数据不是即时的') && footZh.includes('2026-10-06 23:08 UTC'), 'D10 中文页脚明说非即时并带时间');
  // 英文名表覆盖 universe.json 全部代号（英文模式不该冒出中文名）
  const universe = JSON.parse(fs.readFileSync(path.join(ROOT, 'trading/universe.json'), 'utf8')).tickers.map(t => t.symbol);
  const enNames = await pEn.evaluate(() => Object.keys(EN_NAMES));
  const missing = universe.filter(s => !enNames.includes(s));
  check(missing.length === 0, `D11 英文名表覆盖 universe.json 全部代号（缺：${missing.join(',')}）`);
  await ctxEn.close();
}

/* ===== E. 版面：手机宽度不得页面级横向溢出；真实数据清单对得上 universe ===== */
{
  const { ctx, page } = await open({ viewport: { width: 390, height: 844 } });
  const ov = async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check((await ov()) <= 2, `E1 手机宽度（自选股）不横向溢出（实得 ${await ov()}px）`);
  await page.click('.tab[data-tab="chart"]'); await page.locator('#chartSvg').waitFor({ timeout: 8000 });
  check((await ov()) <= 2, `E2 手机宽度（趋势图）不横向溢出（实得 ${await ov()}px）`);
  await ctx.close();
  const pubReal = JSON.parse(fs.readFileSync(path.join(ROOT, 'trading/data-public.json'), 'utf8')).tickers.map(t => t.symbol).sort();
  const uni = JSON.parse(fs.readFileSync(path.join(ROOT, 'trading/universe.json'), 'utf8')).tickers.map(t => t.symbol).sort();
  eq(pubReal.join(), uni.join(), 'E3 data-public.json 的 tickers 与 universe.json 的 58 档一致');
  const withHist = uni.filter(s => fs.existsSync(path.join(ROOT, `trading/history/${s}.json`)));
  eq(withHist.length, uni.length, 'E4 每一档都有 history 日线可画图');
}

{
  // 宽屏：超过一屏时分左右两栏
  const big = JSON.parse(JSON.stringify(PUBLIC_FIX));
  for (let i = 0; i < 20; i++) big.tickers.push(mk('Z' + i, '填充' + i, 10 + i, 10));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await ctx.route('**/*', r => { const u = r.request().url();
    if (u.includes('data-public.json')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(big) });
    if (u.startsWith(`http://localhost:${PORT}/`)) return r.continue(); return r.abort(); });
  await page.goto(URL, { waitUntil: 'networkidle' }); await page.waitForSelector('tr.row');
  eq(await page.locator('#watchCols table').count(), 2, 'E5 宽屏且超过一屏时分两栏');
  eq(await page.locator('#watchCols tr.row').count(), 26, 'E6 两栏合计行数不丢不重');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelectorAll('#watchCols table').length === 1);
  eq(await page.locator('#watchCols tr.row').count(), 26, 'E7 窄屏退回单栏，行数不变');
  const sc = await page.$eval('#watchScroll', e => getComputedStyle(e).overflowY);
  check(sc === 'auto' || sc === 'scroll', `E8 清单可滚动（overflow-y: ${sc}）`);
  await ctx.close();
}

/* ===== F. 近即时报价（CNBC）：拦截假响应 ===== */
const qs = page => page.locator('#qstatus').innerText();
const realErr = errors => errors.filter(e => !e.startsWith('console.error: Failed to load resource'));
{
  // F1 与每小时价相同：数字不变，状态标示 live、延迟约 2 分钟，页脚如实声明
  const { ctx, page, errors, cnbcReqs } = await open({ cnbc: 'same' });
  check(await page.locator('#qstatus.live').count() === 1, 'F1 取到报价后状态条为 live');
  check((await qs(page)).includes('延迟约 2 分钟'), `F2 延迟 = 现在 - last_time（假数据设为 2 分钟前，中位数），实得「${await qs(page)}」`);
  eq(await cell(page, 'AAA', 'pct'), '▲ +10.00%', 'F3 价相同时涨跌% 不变');
  const foot = await page.locator('#foot').innerText();
  check(foot.includes('CNBC') && foot.includes('不是 IBKR 价格') && foot.includes('延迟约 2 分钟') && foot.includes('每小时 IBKR 数据'), `F4 页脚写明来源 CNBC／非 IBKR／延迟／持仓为每小时数据（实得 ${foot.slice(0, 120)}）`);
  check(!foot.includes('数据不是即时的'), 'F5 live 时不再写「数据不是即时的」');
  // 请求只带代号
  const r0 = cnbcReqs[0], u0 = new globalThis.URL(r0.url());
  eq(r0.method(), 'GET', 'F6 CNBC 请求是 GET');
  check(r0.postData() === null, 'F7 请求没有 body');
  eq(u0.searchParams.get('symbols'), 'AAA|BBB|CCC|DDD|SPY|QQQ', 'F8 请求里的代号 = 名单全部代号（公开名单，不是持仓）');
  check(!('cookie' in r0.headers()), 'F9 请求不带 cookie');
  check(realErr(errors).length === 0, `F10 无 JS 错误（实得 ${errors.slice(0, 3).join(' | ')}）`);
  await ctx.close();
}
{
  // F11+ 价格不同：缺档 DDD/CCC 沿用每小时价并标「延迟」；指数、损益、合计用即时价重算
  const { ctx, page, errors, cnbcReqs } = await open({ cnbc: 'live', password: PW });
  eq(await cell(page, 'AAA', 'price'), '120.00', 'F11 AAA 现价用 CNBC 价');
  eq(await cell(page, 'AAA', 'chg'), '+15.00', 'F12 AAA 涨跌 = 120 - (120-15)');
  eq(await cell(page, 'AAA', 'pct'), '▲ +14.29%', 'F13 AAA 涨跌% = 15/105');
  eq(await cell(page, 'BBB', 'pct'), '▲ +1.00%', 'F14 BBB 涨跌% = 0.5/50');
  eq(await cell(page, 'QQQ', 'pct'), '▼ -0.20%', 'F15 QQQ 涨跌% = -1.2/602.4');
  eq(await cell(page, 'DDD', 'price'), '20.50', 'F16 缺档 DDD 沿用每小时价');
  eq(await cell(page, 'DDD', 'pct'), '▲ +2.50%', 'F17 缺档 DDD 涨跌% 沿用每小时算法');
  eq(await page.locator('.late').count(), 2, 'F18 缺档的 DDD、CCC 各标一个「延迟」');
  eq(await page.locator('tr[data-sym="DDD"] .late').count(), 1, 'F19 标记在缺档那行');
  eq(await page.locator('tr[data-sym="AAA"] .late').count(), 0, 'F20 有报价的行不标');
  check((await page.locator('.idx[data-idx="SPY"]').innerText()).includes('700.70') && (await page.locator('.idx[data-idx="SPY"]').innerText()).includes('+1.11%'), 'F21 指数列 SPY 用即时价 +7.7/693 = +1.11%');
  await page.click('.tab[data-tab="pnl"]');
  await page.locator('#pnlTable').waitFor({ timeout: 8000 });
  const P = (s, k) => cell(page, s, k, '#pnlTable tbody');
  eq(await P('AAA', 'price'), '120.00', 'F22 持仓 AAA 现价即时');
  eq(await P('AAA', 'todayPnl'), '+150.00', 'F23 AAA 今日损益 = 10×15');
  eq(await P('AAA', 'todayPct'), '+14.29%', 'F24 AAA 今日% = 150/1050');
  eq(await P('AAA', 'pnl'), '+400.00', 'F25 AAA 总损益 = 10×(120-80)');
  eq(await P('AAA', 'pnlPct'), '+50.00%', 'F26 AAA 损益% = 400/800');
  eq(await P('BBB', 'todayPnl'), '+2.50', 'F27 BBB 今日损益 = 5×0.5');
  eq(await P('CCC', 'price'), '90.00', 'F28 持仓缺档 CCC 沿用每小时价');
  eq(await P('CCC', 'todayPnl'), '-600.00', 'F29 CCC 今日损益沿用 IBKR 的每小时值');
  const T = k => page.locator(`#pnlTotal td[data-k="${k}"]`).innerText();
  eq(await T('todayPnl'), '-447.50', 'F30 合计今日损益 = 150-600+2.5');
  eq(await T('todayPct'), '-12.09%', 'F31 合计今日% = -447.5/3700');
  eq(await T('pnl'), '+202.50', 'F32 合计总损益 = 400-200+2.5');
  eq(await T('pnlPct'), '+6.64%', 'F33 合计损益% = 202.5/3050');
  eq(await page.locator('#pnlTiles [data-k="value"]').innerText(), '3,252.50', 'F34 持仓市值 = 1200+1800+252.5');
  // 隐私：解锁后请求仍然只有代号，没有持仓数字
  const urls = cnbcReqs.map(r => decodeURIComponent(r.url()));
  check(urls.length > 0 && urls.every(u => !/(1200|1800|3252|3050|\b80\b)/.test(u.split('symbols=')[1].split('&')[0])), 'F35 解锁后请求里仍只有代号');
  check(cnbcReqs.every(r => r.postData() === null), 'F36 解锁后请求仍无 body');
  check(realErr(errors).length === 0, `F37 无 JS 错误（实得 ${errors.slice(0, 3).join(' | ')}）`);
  await ctx.close();
}
{
  // 非常规时段：显示收盘价、状态条写明
  const { ctx, page } = await open({ cnbc: 'closed' });
  check((await qs(page)).includes('非常规交易时段'), `F38 POST_MKT 时状态条说明显示常规收盘价（实得「${await qs(page)}」）`);
  check((await page.locator('#foot').innerText()).includes('非常规交易时段'), 'F39 页脚也说明');
  eq(await page.locator('.late').count(), 4, 'F40 只回了 2 档，其余 4 档标「延迟」');
  await ctx.close();
}
for (const mode of ['down', 'garbage', 'hang']) {
  // 接口挂掉（500 / 非预期格式 / 超时）：退回每小时价，明显标示，不弹窗不抛错
  const { ctx, page, errors } = await open({ cnbc: mode, cfg: mode === 'hang' ? { timeoutMs: 400 } : undefined });
  if (mode === 'hang') await page.waitForFunction(() => document.getElementById('qstatus').className.includes('fail'), null, { timeout: 8000 });
  check(await page.locator('#qstatus.fail').count() === 1, `F41 ${mode}：状态条标示退回每小时价`);
  eq(await cell(page, 'AAA', 'price'), '110.00', `F42 ${mode}：价格是 data-public 的每小时价`);
  eq(await page.locator('.late').count(), 0, `F43 ${mode}：整体退回时不逐行标记`);
  const f = await page.locator('#foot').innerText();
  check(f.includes('暂时取不到') && f.includes('数据不是即时的'), `F44 ${mode}：页脚如实说明`);
  check(realErr(errors).length === 0, `F45 ${mode}：无 JS 错误、无弹窗（实得 ${errors.slice(0, 3).join(' | ')}）`);
  await ctx.close();
}
{
  // 先好后坏：超过 staleMs 后退回每小时价；恢复前不闪烁（grace 内保留上次好价）
  const { ctx, page } = await open({ cnbc: 'flap', cfg: { pollMs: 250, offPollMs: 250, retryMs: 250, staleMs: 900 } });
  eq(await cell(page, 'AAA', 'price'), '120.00', 'F46 第一次成功：即时价');
  await page.waitForTimeout(450);
  eq(await cell(page, 'AAA', 'price'), '120.00', 'F47 一次失败后在宽限期内仍保留上次好价（不闪烁）');
  await page.waitForFunction(() => document.getElementById('qstatus').className.includes('fail'), null, { timeout: 8000 });
  eq(await cell(page, 'AAA', 'price'), '110.00', 'F48 超过宽限期退回每小时价');
  await ctx.close();
}
{
  // 页面不可见时暂停轮询，回来立即补抓
  const { ctx, page, cnbcReqs } = await open({ cnbc: 'same', cfg: { pollMs: 300, offPollMs: 300, retryMs: 300 } });
  await page.waitForFunction(() => true);
  await page.waitForTimeout(1000);
  const n1 = cnbcReqs.length;
  check(n1 >= 3, `F49 可见时持续轮询（1 秒内 ${n1} 次，间隔 300ms）`);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(150);
  const n2 = cnbcReqs.length;
  await page.waitForTimeout(1200);
  eq(cnbcReqs.length, n2, 'F50 页面不可见时不再发请求');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  check(cnbcReqs.length > n2, 'F51 回到前台立即补抓');
  await ctx.close();
}
{
  // 手机宽度：状态条与「延迟」标记不得造成横向溢出
  const { ctx, page } = await open({ cnbc: 'live', viewport: { width: 390, height: 844 } });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(ov <= 2, `F52 手机宽度（含状态条与延迟标记）不横向溢出（实得 ${ov}px）`);
  await ctx.close();
}

await browser.close();
console.log(`通过 ${ok.length} 项`);
if (fails.length) {
  console.error(`\n未通过 ${fails.length} 项：`);
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('board.html 自检全部通过');
