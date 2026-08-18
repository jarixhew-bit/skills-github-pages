/**
 * trading/fund.html（作业系统简报页）的自检 —— 真浏览器跑，Playwright。
 *
 * 跑法：
 *   python3 -m http.server 8899 &
 *   node tools/check-fund.mjs
 * 沙盒里浏览器装在别处，要带 CHROMIUM_PATH=/opt/pw-browsers/chromium。
 * （`python3 tools/check-all.py` 会自动起 server 并带上 CHROMIUM_PATH。）
 *
 * 为什么要用真浏览器：这页所有数字都是前端现算的——夏普、最大回撤、VaR、再平衡
 * 差额，没有一个是后端算好送过来的。读代码看不出算错，只有真的跑一遍、拿手算得
 * 出来的答案去对，才知道页上那些数字能不能信。这是钱的页面，算错比不显示更糟。
 *
 * 两个数据档（data-public.json / data-private.enc）**全部用固定 fixture 拦掉**：
 *   1. 私密档是加密的，CI 没有密码，不拦就永远走不进解锁后的渲染路径；
 *   2. 公开档每小时被 Actions 改写，拿真档做数值断言会随行情每天红一次。
 * fixture 的结构严格照 analyzer.py 的输出契约（README.md「数据契约」那节），
 * 契约改了这份也要跟着改。
 *
 * 私密档的密文由本脚本用 Node crypto 现场加密（PBKDF2-SHA256 30 万次 + AES-256-GCM），
 * 顺带验证了 Python 端加密与浏览器 Web Crypto 解密的封装格式确实互通。
 */
import { chromium } from 'playwright';
import crypto from 'node:crypto';

const PORT = process.env.CHECK_PORT || 8899;
const URL = `http://localhost:${PORT}/trading/fund.html`;
const PW = 'test-password-not-real';

const fails = [];
const ok = [];
function check(cond, label) { (cond ? ok : fails).push(label); }
function near(a, b, tol, label) {
  const good = a != null && Math.abs(a - b) <= tol;
  check(good, `${label}（期望 ${b}±${tol}，实得 ${a}）`);
}

/* ---------- 与 analyzer.py encrypt_json 相同的封装 ---------- */
function encryptJson(obj, password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 300000, 32, 'sha256');
  const nonce = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ct = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), 'utf8')), c.final(), c.getAuthTag()]);
  return JSON.stringify({
    v: 1, kdf: 'pbkdf2-sha256', iter: 300000,
    salt: salt.toString('base64'), nonce: nonce.toString('base64'), ct: ct.toString('base64'),
  });
}

/* ---------- fixture：公开区 ---------- */
const mkTicker = (symbol, name, over) => ({
  symbol, name, etf: false, price: 100, prev_close: 99, chg1d: 1.01, score: 4,
  action: '强烈买入', act_cls: 'buy2', rsi: 60, ma50: 95, ma200: 90,
  above_ma50: true, above_ma200: true, from_52w_high: -2, from_52w_low: 30,
  stop_atr: 94, signals: [['趋势', '价格站上50日线', 1]], date: '2026-08-13',
  spark: Array.from({ length: 90 }, (_, i) => 90 + i * 0.1), ...over,
});
const PUBLIC_FIX = {
  generated_at: '2026-08-13 14:23 UTC',
  data_date: '2026-08-13',
  market: {
    line: '测试用市场概况一句话。',
    breadth: 76,
    spy: { trend: '多头趋势', chg1d: 0.79, price: 778.56 },
    qqq: { trend: '多头趋势', chg1d: 1.14, price: 731.94 },
  },
  opportunities: ['AAA', 'BBB'],
  weak: ['CCC'],
  tickers: [
    mkTicker('AAA', '甲公司', { news_score: 1 }),
    mkTicker('BBB', '乙公司', { etf: true }),
    mkTicker('CCC', '丙公司', { action: '强烈卖出', act_cls: 'sell2', score: -4, chg1d: -2.5, news_score: -1 }),
    mkTicker('DDD', '丁公司', { action: '中性观望', act_cls: 'hold', score: 0 }),
  ],
  warnings: [],
};

/* ---------- fixture：私密区（数字都挑成手算得出来的） ---------- */
// 日 TWR 因子：平盘微幅波动 + 一次 -20% 的真实暴跌 + 回补。
// 暴跌这天是本自检的重点——它必须留在样本里，不能被当成转帐剔掉。
const twrDaily = {};
const navSeries = [];
{
  const start = Date.UTC(2026, 0, 5);
  const facs = [];
  for (let i = 0; i < 30; i++) facs.push(i % 2 ? 1.002 : 0.999);
  facs.push(1.10, 0.80, 1.25);           // 涨 10%、暴跌 20%、回补 25%
  for (let i = 0; i < 20; i++) facs.push(1);
  let nav = 100000;
  navSeries.push([new Date(start).toISOString().slice(0, 10), nav]);
  facs.forEach((f, i) => {
    const d = new Date(start + (i + 1) * 86400000).toISOString().slice(0, 10);
    twrDaily[d] = f;
    nav = Math.round(nav * f * 100) / 100;
    navSeries.push([d, nav]);
  });
}

const POSITIONS = [
  { symbol: 'VOO', qty: 100, avg_price: 500, price: 600, value: 60000, upnl: 10000, upct: 20, daily_pnl: 300, weight: 60,
    signal: { score: 3, action: '偏多', act_cls: 'buy1', rsi: 58, stop_atr: 570, from_52w_high: -1.5 }, notes: [] },
  { symbol: 'IBIT', qty: 400, avg_price: 50, price: 75, value: 30000, upnl: 10000, upct: 50, daily_pnl: -200, weight: 30,
    signal: { score: 1, action: '偏多', act_cls: 'buy1', rsi: 62, stop_atr: 68, from_52w_high: -8 }, notes: ['占组合 30%，高于目标 20%'] },
  { symbol: 'SGOV', qty: 100, avg_price: 100, price: 100, value: 10000, upnl: 0, upct: 0, daily_pnl: 0, weight: 10,
    signal: null, notes: [] },
];
const PRIVATE_FIX = {
  generated_at: '2026-08-13 14:23 UTC',
  account: { net_liq: 110000, cash: 10000, cash_pct: 9.1, synced: '2026-08-12' },
  perf: { '1d': 0.42, '7d': 1.35, mtd: 2.1, ytd: 18.34 },
  nav_series: navSeries,
  twr_daily: twrDaily,
  positions: POSITIONS,
  actions: ['⚠️ IBIT：占组合 30%，高于目标 20%', '✅ 其余持仓无异常信号'],
  review: { n_trades: 42, first_date: '2026-01-08', last_date: '2026-08-11', buys: 120000, sells: 40000,
    realized: 3200, commission: 38.5, win_rate: 0.714, n_closed: 14, per_symbol: [], insights: [] },
  targets: { VOO: 80, IBIT: 20 },
  ai_note: '这是一段测试用的帐户点评。',
  ai_note_date: '2026-08-13',
  ai_note_nav: 110000,
};

/* ---------- fixture：新闻 ---------- */
// VOO 在持仓里、AAA 不在——用来验「解锁后才把持仓那几檔挑出来」这条。
const NEWS_FIX = {
  generated_at: '2026-08-13 14:30 UTC',
  counts: { bull: 6, bear: 3, flat: 1 },
  translated: true,
  macro: [
    { title: 'Fed holds rates steady', zh: '联准会维持利率不变', link: 'https://example.com/m1',
      source: 'CNBC 市场', ts: '2026-08-13 12:00', sent: 'flat', id: 'm1' },
    { title: 'Stocks rally on strong earnings', zh: '强劲财报带动股市走高', link: 'https://example.com/m2',
      source: 'Yahoo 财经', ts: '2026-08-13 11:00', sent: 'bull', id: 'm2' },
  ],
  crypto: [
    { title: 'Bitcoin ETF sees record inflow', zh: '比特币 ETF 出现纪录资金流入', link: 'https://example.com/c1',
      source: 'CoinDesk', ts: '2026-08-13 10:00', sent: 'bull', id: 'c1' },
  ],
  by_symbol: {
    VOO: [{ title: 'VOO tops estimates', zh: 'VOO 表现优于预期', link: 'https://example.com/v1',
            source: '甲', ts: '2026-08-13 09:00', sent: 'bull', id: 'v1' }],
    AAA: [{ title: 'AAA faces lawsuit', zh: 'AAA 面临诉讼', link: 'https://example.com/a1',
            source: '甲公司', ts: '2026-08-13 08:00', sent: 'bear', id: 'a1' }],
    CCC: [{ title: 'CCC plunges on weak guidance', zh: 'CCC 因指引疲弱大跌', link: 'https://example.com/c9',
            source: '丙公司', ts: '2026-08-13 07:00', sent: 'bear', id: 'c9' }],
  },
  n_symbols: 2,
  spikes: [{ symbol: 'AAA', count: 9, avg: 2.3, ratio: 3.9 }],
};

/* ---------- 跑 ---------- */
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const ctx = await browser.newContext();
const errors = [];
const page = await ctx.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });

// 拦掉两个数据档；顺手拦掉所有外部请求，自检不该打网络
await ctx.route('**/*', route => {
  const u = route.request().url();
  if (u.includes('data-public.json')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PUBLIC_FIX) });
  }
  if (u.includes('news.json')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(NEWS_FIX) });
  }
  if (u.includes('data-private.enc')) {
    return route.fulfill({ status: 200, contentType: 'text/plain', body: encryptJson(PRIVATE_FIX, PW) });
  }
  if (u.startsWith(`http://localhost:${PORT}/`)) return route.continue();
  return route.abort();
});

await page.goto(URL, { waitUntil: 'networkidle' });

/* ---- 1. 未解锁：私密区必须是锁住的，不能漏任何数字 ---- */
const lockedCount = await page.locator('.locked').count();
check(lockedCount >= 4, `未解锁时私密区应显示锁（实得 ${lockedCount} 个锁区块）`);
const bodyBefore = await page.locator('body').innerText();
check(!bodyBefore.includes('110,000'), '未解锁时不得出现帐户净值');
check(!bodyBefore.includes('18.34'), '未解锁时不得出现绩效数字');

/* ---- 1b. 新闻：未解锁也要看得到，但不得泄露哪几檔是持仓 ---- */
const newsBefore = await page.locator('#newsBody').innerText();
check(newsBefore.includes('联准会维持利率不变'), '未解锁也应显示宏观新闻（新闻是公开的）');
check(newsBefore.includes('比特币 ETF'), '未解锁也应显示加密新闻');
check(!newsBefore.includes('持仓'.repeat(1) + '的相关新闻'), '未解锁时不得出现「你持仓的相关新闻」区块');
check((await page.locator('#newsBody .pill.mine').count()) === 0, '未解锁时不得把任何一檔标成持仓');
check(newsBefore.includes('偏多'), '情绪统计应显示');

/* ---- 2. 公开区渲染 ---- */
check((await page.locator('#mktGrid .metric').count()) === 4, '市场概况应有 4 张卡');
check((await page.locator('#oppList .item').count()) === 2, '买入信号应列 2 檔');
check((await page.locator('#weakList .item').count()) === 1, '转弱应列 1 檔');
check((await page.locator('#mktLine').innerText()).includes('测试用市场概况'), '市场概况文字应显示');
check((await page.locator('#a2u').innerText()) === '4 檔', '监控名单檔数应为 4 檔');

/* ---- 2b. 解释层：信号卡要带上那檔的新闻，并标出新闻分 ---- */
const oppTxt = await page.locator('#oppList').innerText();
check(oppTxt.includes('AAA 面临诉讼'), '买入信号卡应附上该檔最新一条新闻（解释层）');
check(oppTxt.includes('新闻 +1'), 'news_score 为正时应标示「新闻 +1」');
const weakTxt = await page.locator('#weakList').innerText();
check(weakTxt.includes('新闻 -1'), 'news_score 为负时应标示「新闻 -1」');
check(weakTxt.includes('CCC 因指引疲弱大跌'), '转弱卡也要附新闻');
// 没有新闻分的那檔不该冒出标记
check((await page.locator('#oppList .nsig').count()) === 1,
  `只有带 news_score 的那檔能有新闻标记（实得 ${await page.locator('#oppList .nsig').count()} 个）`);

/* ---- 2c. 新闻量异常：报「有事」但绝不报方向 ---- */
const spikeTxt = await page.locator('#newsBody').innerText();
check(spikeTxt.includes('忽然很多人在写'), '应显示新闻量异常区块');
check(spikeTxt.includes('×3.9'), '应显示异常倍数');
check(spikeTxt.includes('不代表该买或该卖'), '异常提醒必须写明它不是买卖建议');
// 底线：异常区块不得出现方向性字眼
const spikeBlock = await page.locator('#newsBody .spikes').innerText();
check(!/买入|卖出|加仓|减仓/.test(spikeBlock), `异常区块不得出现买卖字眼（实得：${spikeBlock}）`);

/* ---- 3. 页内自检（指标算法）必须通过 ---- */
check(!(await page.locator('#selftest').isVisible()), '页内自检应通过（未通过代表指标算法出错）');

/* ---- 4. 解锁 ---- */
await page.click('#lockBtn');
await page.fill('#pwInput', PW);
await page.click('#pwForm .ok');
await page.waitForSelector('#p5body .tbl', { timeout: 5000 });
check((await page.locator('#lockBtn').innerText()).includes('已解锁'), '解锁后按钮应变成已解锁');

/* ---- 5. 绩效区：YTD 直接取 perf.ytd，不得自己再算一次 ---- */
const p1 = await page.locator('#p1body').innerText();
check(p1.includes('+18.34%'), 'YTD 应显示 +18.34%（取自 perf.ytd）');
check(p1.includes('71.4%'), `胜率应显示 71.4%`);
check(p1.includes('42'), '交易笔数应显示 42');

/* ---- 6. 风险指标：拿手算得出来的答案去对 ---- */
// 净值序列里唯一的真回撤是 110000 → 88000 = -20%
const riskTxt = await page.locator('#p4body').innerText();
const mddMatch = riskTxt.match(/-(\d+\.\d)%/);
check(riskTxt.includes('-20.0%'), `最大回撤应为 -20.0%（实得区块文字：${mddMatch ? mddMatch[0] : '未找到'}）`);
// 有 twr_daily 时不得走阈值估算那条退路（走了就会把 -20% 暴跌误剔）
check(p1.includes('由管线依'), '有 twr_daily 时口径应写明出入金由管线剔除');
check(!p1.includes('目前为估算'), '有 twr_daily 时不该标示为估算');
// VaR 与 ES 应为负数
const varOk = /VaR（95%）[\s\S]{0,40}?-\d/.test(riskTxt);
check(varOk, 'VaR（95%）应显示为负数');
check(riskTxt.includes('-20.00%'), '实际最差单日应保留 -20.00%（真实暴跌不得被当成转帐剔掉）');

/* ---- 7. 持仓表：合计要等于各行相加 ---- */
const rows = await page.locator('#p5body .tbl tbody tr').count();
check(rows === 3, `持仓表应有 3 行（实得 ${rows}）`);
const foot = await page.locator('#p5body .tbl tfoot').innerText();
check(foot.includes('$100,000'), '合计市值应为 $100,000（60000+30000+10000）');
check(foot.includes('$20,000'), '合计未实现损益应为 $20,000（10000+10000+0）');

/* ---- 8. 系统提示：⚠️ 与 ✅ 都要分流到对的图示 ---- */
const warnN = await page.locator('#p5body .item .ic.warn').count();
const okN = await page.locator('#p5body .item .ic.ok').count();
check(warnN === 1 && okN === 1, `提示应为 1 警示 + 1 正常（实得 ${warnN} / ${okN}）`);
check((await page.locator('#p5body').innerText()).includes('测试用的帐户点评'), '帐户点评应显示');

/* ---- 9. 再平衡：差额与调整金额必须算对 ---- */
// VOO 目前 60%、目标 80% → 差 -20%，按净资产 110000 应买进 $22,000
// IBIT 目前 30%、目标 20% → 差 +10%，应卖出 $11,000
const reb = await page.locator('#p6body').innerText();
check(reb.includes('-20.0%'), '(再平衡) VOO 差额应为 -20.0%');
check(reb.includes('买进 $22,000'), '(再平衡) VOO 应买进 $22,000');
check(reb.includes('+10.0%'), '(再平衡) IBIT 差额应为 +10.0%');
check(reb.includes('卖出 $11,000'), '(再平衡) IBIT 应卖出 $11,000');
// SGOV 没有目标配置，目标应视为 0%，不能整行漏掉
check(reb.includes('SGOV'), '(再平衡) 无目标配置的持仓也要列出来');

/* ---- 10. 帐户总览 ---- */
const p7 = await page.locator('#p7body').innerText();
check(p7.includes('$110,000'), '帐户净资产应为 $110,000');
check(p7.includes('+18.34%'), '总览的 YTD 应为 +18.34%');
check(p7.includes('3'), '持有部位应为 3');

/* ---- 10b. 解锁后：持仓那几檔要被挑出来，非持仓的不得误标 ---- */
const newsAfter = await page.locator('#newsBody').innerText();
check(newsAfter.includes('你持仓的相关新闻'), '解锁后应出现持仓新闻区块');
const minePills = await page.locator('#newsBody .pill.mine').allInnerTexts();
check(minePills.length > 0 && minePills.every(t => t.includes('VOO')),
  `只有持仓檔（VOO）能标成持仓，实得：${JSON.stringify(minePills)}`);
check(newsAfter.includes('AAA'), '非持仓檔的新闻仍应显示在监控名单区');
// 新闻连结一律新分页开，且带 noopener（防 tabnabbing）
const badLinks = await page.evaluate(() => [...document.querySelectorAll('#newsBody a')]
  .filter(a => a.target !== '_blank' || !a.rel.includes('noopener')).length);
check(badLinks === 0, `新闻连结都要 target=_blank + rel=noopener（实得 ${badLinks} 个不合格）`);

/* ---- 11. 解锁后页内自检仍需通过 ---- */
check(!(await page.locator('#selftest').isVisible()), '解锁后页内自检仍应通过');

/* ---- 12. 密码错误不得解锁 ---- */
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.click('#lockBtn');
await page.fill('#pwInput', 'wrong-password');
await page.click('#pwForm .ok');
await page.waitForTimeout(600);
check(await page.locator('#pwErr').isVisible(), '密码错误应显示错误提示');
check((await page.locator('#p5body .locked').count()) === 1, '密码错误时私密区应维持锁住');

/* ---- 13. 窄屏不得横向溢出 ---- */
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
const overflow = await page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(overflow <= 2, `窄屏不应横向溢出（实得溢出 ${overflow}px）`);

check(errors.length === 0, `不应有 JS 错误（实得：${errors.slice(0, 3).join(' | ')}）`);

await browser.close();

console.log(`通过 ${ok.length} 项`);
if (fails.length) {
  console.error(`\n未通过 ${fails.length} 项：`);
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('fund.html 自检全部通过');
