/**
 * 老板月度报告页（boss-report/index.html）的自检（真浏览器跑，Playwright）。
 *
 * 跑法：
 *   python3 -m http.server 8899 &
 *   node tools/check-boss-report.mjs
 * 沙盒里浏览器装在别处，要带 CHROMIUM_PATH=/opt/pw-browsers/chromium。
 *
 * 这页是要发给老板的，所以自检盯的是三条设计铁律（页面头部注释里写着）：
 *   1. 只读——页面上不许有任何输入框/提交按钮，老板拿到的是一面窗不是一支笔
 *   2. 不看当月——当月的数还在动，动的数不叫报告；?m= 传当月或未来都要被挡回上个月
 *   3. 一个数都不在这边算——总额显示的必须是服务端送来的 total，
 *      不是页面自己把每一笔加出来的（故意送一份「总额与明细对不上」的假数据来验）
 * 外加钥匙的处理：#k= 收下后必须从地址栏抹掉（手机截图就外泄）。
 *
 * 全程用 ctx.route 拦掉 butler-bot 的请求，不打真实接口、不碰真实账目。
 */
import { chromium } from 'playwright';

const PORT = process.env.CHECK_PORT || 8899;
const URL_ = `http://localhost:${PORT}/boss-report/`;
const API = 'https://butler-bot.jarixhew.workers.dev/company-expense';

let pass = 0; const fails = [];
const ok = (n, c, got) => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fails.push(n); console.log(`  ❌ ${n} — 实际: ${JSON.stringify(got)}`); }
};

const lastMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() - 1, 1)).toISOString().slice(0, 7);
};
const thisMonth = () => new Date().toISOString().slice(0, 7);

// 故意让 total(999.99) ≠ 明细相加(120.00)：页面若自己算总额，这一项就会红
const fakeLedger = (month) => ({
  status: 'ok', month, total: 999.99, count: 2, missingPhoto: 1, orphan: 0,
  byReporter: [{ name: '阿明', total: 999.99, count: 2 }],
  days: [{
    date: `${month}-15`, total: 120, count: 2, missingPhoto: 1,
    byReporter: [{
      name: '阿明', total: 120, count: 2, missingPhoto: 1, records: [
        { billNo: 'B-1', categoryEn: 'Lunch', note: '客户', reporter: '阿明', person: '老板', side: 'boss', hasPhoto: true, amountUsd: 100 },
        { billNo: 'B-2', categoryEn: 'Petrol', note: '', reporter: '阿明', person: '阿明', side: 'staff', hasPhoto: false, amountUsd: 20 },
      ],
    }],
  }],
});
const fakePetty = () => ({
  status: 'ok', people: [
    { person: '阿明', status: 'ok', balance: 250, opened: 500, openedDate: '2026-07-01', spent: 250, topups: [] },
    { person: '阿华', status: 'ok', balance: -30, opened: 200, openedDate: '2026-07-01', spent: 230, topups: [] },
  ],
});

/** 把 API 拦下来，按 action 回假数据；记下每次请求的 body 供断言 */
function mountApi(ctx, { forbidden = false } = {}) {
  const calls = [];
  // 先挂「其它外部请求一律断掉」，再挂 API——Playwright 的路由是**后挂的先匹配**，
  // 顺序反过来的话 API 会先被那条 catch-all 断掉，测出来像是页面根本没去拉数据。
  ctx.route('**/*', route =>
    route.request().url().startsWith(`http://localhost:${PORT}`) ? route.continue() : route.abort('failed'));
  ctx.route(u => u.href.startsWith(API), async route => {
    const req = route.request();
    let payload = {};
    try { payload = JSON.parse(req.postData() || '{}'); } catch (e) {}
    calls.push(payload);
    if (forbidden) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ status: 'forbidden' }) });
    }
    const body = payload.action === 'petty' ? fakePetty() : fakeLedger(payload.month);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);

// ---------- 场景一：没有钥匙 → 示例数据，看得出这页长什么样 ----------
{
  const ctx = await browser.newContext();
  const calls = mountApi(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  console.log('\n【1】没有钥匙时给示例数据，而不是一片空白');
  ok('顶部写的是上个月', (await page.locator('#hd-month').textContent()).includes(lastMonth().split('-')[0]));
  ok('角标写「示例」', (await page.locator('#hd-badge').textContent()).trim() === '示例');
  ok('明确告诉人这是示例数据', (await page.locator('#banner').textContent()).includes('示例数据'));
  const body1 = await page.locator('#body').textContent();
  ok('示例总额画出来了', body1.includes('238.40'), body1.slice(0, 80));
  ok('三个报账人都在', ['阿明', '阿华', '阿强'].every(n => body1.includes(n)));
  ok('类别条画出来了', await page.locator('.bar-row').count() > 0);
  ok('备用金卡在（负数那个人也画出来）', body1.includes('-$11.50') || body1.includes('$-11.50'), body1.includes('11.50'));
  // 示例数据自己要对得上：174.40 + 32.50 + 31.50 = 238.40，左右表 126.00 + 112.40 也是
  ok('示例里每个人的小计加起来 = 总额',
     ['174.40', '32.50', '31.50'].every(n => body1.includes(n)), body1.slice(0, 200));
  ok('示例里左右表加起来 = 总额', body1.includes('126.00') && body1.includes('112.40'));
  ok('没有钥匙就不去打服务端（示例数据不该产生请求）', calls.length === 0, calls);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  console.log('\n【2】只读：页面上没有任何能写东西的控件');
  ok('没有输入框', await page.locator('input, textarea, select').count() === 0);
  ok('没有表单', await page.locator('form').count() === 0);
  ok('没有按钮', await page.locator('button').count() === 0);
  await ctx.close();
}

// ---------- 场景二：不看当月 ----------
{
  const ctx = await browser.newContext();
  const calls = mountApi(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${URL_}?m=${thisMonth()}#k=readonly-key`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  console.log('\n【3】传当月进来也只给上个月（当月的数还在动）');
  ok('拉的是上个月', calls[0] && calls[0].month === lastMonth(), calls[0]);
  ok('顶部显示的也是上个月', (await page.locator('#hd-month').textContent()).includes(String(Number(lastMonth().split('-')[1]))));

  await page.goto(`${URL_}?m=2099-01`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  // 最后一次请求是备用金（没有 month），要找的是最后一次拉账本
  const later = calls.filter(c => c.action === 'ledger').pop();
  ok('传未来的月份也被挡回上个月', later.month === lastMonth(), later);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三：钥匙从链接进来，收下后要从地址栏抹掉 ----------
{
  const ctx = await browser.newContext();
  const calls = mountApi(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${URL_}#k=readonly-key`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  console.log('\n【4】钥匙：用得上，但不留在地址栏（手机截图就外泄）');
  ok('钥匙送去服务端了', calls[0] && calls[0].token === 'readonly-key', calls[0]);
  ok('地址栏里的钥匙已抹掉', !page.url().includes('readonly-key'), page.url());
  ok('钥匙存下来了', await page.evaluate(() => localStorage.getItem('bossReport_key')) === 'readonly-key');
  ok('角标不再是「示例」', (await page.locator('#hd-badge').textContent()).trim() !== '示例');
  ok('示例横幅已经收掉', (await page.locator('#banner').textContent()).trim() === '');

  console.log('\n【5】刷新之后不用再给一次钥匙');
  const before = calls.length;
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  ok('刷新后照样拿真数据', calls.length > before && calls[before].token === 'readonly-key', calls[before]);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景四：总额用服务端的，不是自己加出来的 ----------
{
  const ctx = await browser.newContext();
  mountApi(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${URL_}#k=readonly-key`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const txt = await page.locator('#body').textContent();

  console.log('\n【6】一个数都不在这边算（假数据故意让总额与明细对不上）');
  ok('显示的是服务端的 total 999.99', txt.includes('999.99'), txt.slice(0, 120));
  ok('没有把明细加成 120 当总额显示在大字上',
     (await page.locator('.big').textContent()).includes('999.99'));
  ok('左右表分开：算老板的 100、算同事的 20', txt.includes('$100.00') && txt.includes('$20.00'));
  ok('缺收据有标出来', txt.includes('缺收据') || txt.includes('没有收据'));
  ok('备用金负数有解释（公司欠他）', txt.includes('垫'), txt.includes('-$30.00'));

  console.log('\n【7】明细默认收起，要看才展开');
  ok('明细区块是 details', await page.locator('details').count() === 1);
  ok('默认没展开', await page.locator('details[open]').count() === 0);
  await page.locator('summary').click();
  await page.waitForTimeout(200);
  const opened = await page.locator('.day-body').textContent();
  ok('展开后看得到每一笔', opened.includes('Lunch') && opened.includes('Petrol'), opened.slice(0, 80));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景五：钥匙不对时说人话，不是白屏 ----------
{
  const ctx = await browser.newContext();
  mountApi(ctx, { forbidden: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`${URL_}#k=wrong-key`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const txt = await page.locator('#body').textContent();

  console.log('\n【8】钥匙没权限时给一句能照做的话');
  ok('说了看不到', txt.includes('看不到'), txt.slice(0, 120));
  ok('说了是权限问题', txt.includes('权限'), txt.slice(0, 120));
  ok('告诉他找谁', txt.includes('Yang'), txt.slice(0, 120));
  ok('不是白屏', txt.trim().length > 10);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

await browser.close();

console.log(`\n结果：${pass} 通过，${fails.length} 失败`);
if (fails.length) {
  console.log('失败项：' + fails.join('；'));
  process.exit(1);
}
console.log('全绿');
