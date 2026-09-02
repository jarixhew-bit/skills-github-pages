/**
 * boss/index.html（老板专用行程/账单/库存 App）的自检 —— 真浏览器跑，Playwright。
 *
 * 跑法：
 *   python3 -m http.server 8899 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node tools/check-boss.mjs
 * （`python3 tools/check-all.py` 会自动起 server 并带上 CHROMIUM_PATH。）
 *
 * 这份自检要守的安全不变量（见 CLAUDE.md 的委派说明）：
 * **viewer 身份下，页面渲染出来的 DOM 里绝不能出现任何写操作控件**——上传账单、
 * 删账单、改行程 JSON。这条一旦回归（比如管理面板被改成 CSS 隐藏而不是不渲染），
 * 老板就能改数据了，而且没人会发现，因为界面看起来一切正常。
 * 所以第 1、2 两节必须成对存在：第 1 节测「viewer 没有」，第 2 节测「admin 有」——
 * 没有第 2 节这个对照组，第 1 节的 0 可能只是因为整个功能坏了，不是因为权限做对了。
 *
 * 打桩接口：/boss（合约字段 status/who/role/updated/trips/bills/inventory），
 * 结构照 tools/check-inventory.mjs、tools/check-fund.mjs 的写法：ctx.route 拦所有
 * 外部请求，只有 /boss 给假回应，其余一律 abort，保证自检不打真实网络。
 */
import { chromium } from 'playwright';

const PORT = process.env.CHECK_PORT || 8899;
const URL = `http://localhost:${PORT}/boss/index.html`;
const API = 'https://butler-bot.jarixhew.workers.dev/boss';
const GOOD_TOKEN = 'boss-good-token';

let pass = 0; const fails = [];
const ok = (n, c, got) => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fails.push(n); console.log(`  ❌ ${n} — 实际: ${JSON.stringify(got)}`); }
};

/** 等条件成立，而不是死等固定时间（跟其他几份自检一致）。 */
async function until(fn, { timeout = 8000, interval = 20, what = '条件' } = {}) {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - t0 > timeout) throw new Error(`等不到「${what}」（超时 ${timeout}ms）`);
    await new Promise(r => setTimeout(r, interval));
  }
}

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);

/* ---------- 假数据：跟真接口形状一致 ---------- */
function fakeUpdated(){
  const now = new Date().toISOString();
  return { trips: now, bills: now, inventory: now };
}
function fakeTrips(){
  return [{
    id: 't1', title: { zh: '大阪行', en: 'Osaka trip' }, start: '2026-01-01', end: '2026-01-03',
    location: { zh: '大阪', en: 'Osaka' },
    guideUrl: 'https://example.com/guide',
    items: [
      { date: '2026-01-01', time: '10:00', title: { zh: '入住酒店', en: 'Check in' }, note: { zh: '', en: '' }, mapUrl: 'https://maps.example.com/a' },
    ],
  }];
}
function fakeBills(){
  return [{
    id: 'b1', title: { zh: '8月账单', en: 'August bill' },
    period: '2026-08', uploadedAt: '2026-08-01T00:00:00Z', kind: 'month', filename: 'aug.pdf',
  }];
}
// 真实形状：id/name/count/unit/location/note/added_at，count 是整数、location 是字符串
function fakeInventory(){
  return {
    wine: [
      { id: 'w1', name: 'Laffite 2001', count: 11, unit: '瓶', location: '西港', note: '老板留用', added_at: '2026-01-01' },
    ],
    tea: [],
    herb: [],
  };
}

// 页面的中英文案是 pick() 现算出来的单一字符串（不是双语成对 span），
// 会跟着 curLang 变——而 curLang 默认取 navigator.language，headless Chromium
// 里这常常是 en-US，导致文案全变英文、把这份自检里按中文关键字找按钮/错误提示的
// 断言测出假阴性。全部场景统一把 siteLangUser 锁定成 'cn'，断言才稳定可靠。
function forceZh(ctx){
  return ctx.addInitScript(() => { try{ localStorage.setItem('siteLangUser', 'cn'); }catch(e){} });
}

// 真的 4 页 PDF（pypdf 生成的空白页）。**不能用假字符串**：假的 PDF 会让 PDF.js
// 解析失败、直接走错误分支，等于账单预览这条路径从来没被测过——2026-08-27
// 「账单只显示一页、滑不动」就是这样漏出去的。
const FOUR_PAGE_PDF_B64 = 'JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgKHB5cGRmKQo+PgplbmRvYmoKMiAwIG9iago8PAovVHlwZSAvUGFnZXMKL0NvdW50IDQKL0tpZHMgWyA0IDAgUiA1IDAgUiA2IDAgUiA3IDAgUiBdCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9DYXRhbG9nCi9QYWdlcyAyIDAgUgo+PgplbmRvYmoKNCAwIG9iago8PAovVHlwZSAvUGFnZQovUmVzb3VyY2VzIDw8Cj4+Ci9NZWRpYUJveCBbIDAuMCAwLjAgNTk1IDg0MiBdCi9QYXJlbnQgMiAwIFIKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1Jlc291cmNlcyA8PAo+PgovTWVkaWFCb3ggWyAwLjAgMC4wIDU5NSA4NDIgXQovUGFyZW50IDIgMCBSCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9SZXNvdXJjZXMgPDwKPj4KL01lZGlhQm94IFsgMC4wIDAuMCA1OTUgODQyIF0KL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKNyAwIG9iago8PAovVHlwZSAvUGFnZQovUmVzb3VyY2VzIDw8Cj4+Ci9NZWRpYUJveCBbIDAuMCAwLjAgNTk1IDg0MiBdCi9QYXJlbnQgMiAwIFIKPj4KZW5kb2JqCnhyZWYKMCA4CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDU0IDAwMDAwIG4gCjAwMDAwMDAxMzEgMDAwMDAgbiAKMDAwMDAwMDE4MCAwMDAwMCBuIAowMDAwMDAwMjc0IDAwMDAwIG4gCjAwMDAwMDAzNjggMDAwMDAgbiAKMDAwMDAwMDQ2MiAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDgKL1Jvb3QgMyAwIFIKL0luZm8gMSAwIFIKPj4Kc3RhcnR4cmVmCjU1NgolJUVPRgo=';

// flightLookupFlight：不传就默认「查不到」（{status:'ok'} 没带 flight 字段，
// 走 adminFlightLookup() 的 !f 分支）——这正是最常见、最该守住的场景：
// 一打开自检默认就是「查不到」，逼着断言必须去处理失败可见性，不能靠巧合蒙混过关。
function mountRoutes(ctx, { role = 'viewer', who = 'YANG', inventory = fakeInventory(), flightLookupFlight = null, trips = null, ticketParseResult = null, dental = null, bills = null, pushTestResult = null, seen = null, leaveToday = null, leaveUpcoming = null } = {}){
  const rec = { calls: [], token: null };
  ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}`)) return route.continue();
    const h = { 'Access-Control-Allow-Origin': '*' };
    if (u.startsWith(API)){
      const req = JSON.parse(route.request().postData() || '{}');
      rec.calls.push(req);
      rec.token = req.token;
      if (req.token !== GOOD_TOKEN){
        return route.fulfill({ status: 401, contentType: 'application/json', headers: h,
          body: JSON.stringify({ status: 'error', message: '访问码不对，请再检查一次' }) });
      }
      if (req.action === 'feed'){
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify({ status: 'ok', who, role, updated: fakeUpdated(),
            ...(seen ? { seen } : {}),
            ...(leaveToday ? { leaveToday } : {}),
            ...(leaveUpcoming ? { leaveUpcoming } : {}),
            trips: trips || fakeTrips(), bills: bills || fakeBills(), inventory,
            dental: dental || { lastVisit: null, nextVisit: null, intervalMonths: 3, note: '' } }) });
      }
      if (req.action === 'bill'){
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify({ status: 'ok', contentBase64: FOUR_PAGE_PDF_B64, mime: 'application/pdf' }) });
      }
      if (req.action === 'pushTest'){
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify(pushTestResult || { status: 'ok', sent: 0, total: 0, results: [] }) });
      }
      if (req.action === 'ticketParse'){
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify(ticketParseResult || { status:'ok', title:'', start:null, end:null, legs: [], stays: [] }) });
      }
      if (req.action === 'flightLookup'){
        // byNo：按航班号给不同结果，用来一次跑出「查得到」和「查不到」两种分支
        const f = (flightLookupFlight && flightLookupFlight.byNo)
          ? (flightLookupFlight.byNo[req.no] || null)
          : flightLookupFlight;
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify(f ? { status: 'ok', flight: f } : { status: 'ok' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
        body: JSON.stringify({ status: 'ok' }) });
    }
    return route.abort('failed');
  });
  return rec;
}

async function gotoTab(page, tab){
  await page.click(`.nav-btn[data-tab="${tab}"]`);
  await until(() => page.evaluate(t => {
    const pane = document.getElementById('tab-' + t);
    return !!pane && pane.classList.contains('active');
  }, tab), { what: `切到 ${tab} 分页` });
}

// ---------- 场景一：viewer 身份 —— 【最重要】DOM 里不能有任何写操作控件 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('【1】viewer 身份：渲染后的 DOM 里绝不能有任何写操作控件');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });

  const fileCnt = await page.locator('input[type=file]').count();
  // 原来这一对守的是「编辑行程 JSON」那个 textarea，该功能 2026-08-28 已整块移除
  // （用户说没在用）。移除后两边都是 0，这对断言就失去意义了——换成行程表单的日期框，
  // 它同样是只有 admin 才该有的写入控件，对照组才继续成立。
  const billTitleCnt = await page.locator('#admin-bill-title-zh').count();
  const writeBtnCnt = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter(b => /上传|删除|保存/.test(b.textContent || '')).length);
  ok('viewer 下 input[type=file] 数量为 0 —— 否则老板能改数据了', fileCnt === 0, fileCnt);
  ok('viewer 下 #admin-bill-title-zh（上传账单的标题框）不存在 —— 否则老板能改数据了', billTitleCnt === 0, billTitleCnt);
  ok('viewer 下含「上传/删除/保存」文案的按钮数量为 0 —— 否则老板能改数据了', writeBtnCnt === 0, writeBtnCnt);
  ok('viewer 下底部导航没有「管理」入口', await page.locator('#nav-admin-btn').count() === 0);
  ok('viewer 下 #tab-admin 容器是空的（不是 CSS 隐藏，是压根没渲染）',
     (await page.evaluate(() => document.getElementById('tab-admin').innerHTML.trim())) === '');
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景二：admin 身份 —— 对照组，证明第 1 条不是因为功能坏了 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('\n【2】admin 身份：这些写操作控件必须存在（第 1 条的对照组）');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  ok('admin 下底部导航出现「管理」入口', await page.locator('#nav-admin-btn').count() === 1);
  await gotoTab(page, 'admin');

  const fileCnt = await page.locator('input[type=file]').count();
  const billTitleCnt = await page.locator('#admin-bill-title-zh').count();
  const writeBtnCnt = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter(b => /上传|删除|保存/.test(b.textContent || '')).length);
  ok('admin 下 input[type=file]（上传账单）存在', fileCnt >= 1, fileCnt);
  ok('admin 下 #admin-bill-title-zh（上传账单的标题框）存在', billTitleCnt === 1, billTitleCnt);
  ok('admin 下含「上传/删除/保存」文案的按钮存在（上传按钮＋删除账单＋保存行程，至少 3 个）',
     writeBtnCnt >= 3, writeBtnCnt);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景三：没填访问码 → 显示输入框；填错 → 中文错误提示，且不存错的钥匙 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));

  console.log('\n【3】没填访问码显示输入框；填错显示中文错误提示，且不把错钥匙存进 localStorage');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  ok('没有钥匙时闸门显示（输入框可见）', await page.locator('#gate-input').isVisible());
  ok('闸门是打开状态（未加 off）',
     !(await page.evaluate(() => document.getElementById('gate').classList.contains('off'))));

  await page.fill('#gate-input', 'wrong-code-123');
  await page.click('#gate-btn');
  await until(() => page.evaluate(() => (document.getElementById('gate-msg').textContent || '').trim() !== ''
      && (document.getElementById('gate-msg').textContent || '') !== '验证中…'),
    { what: '闸门显示错误提示' });
  const gateMsg = await page.textContent('#gate-msg');
  ok('错误提示是中文，且提到访问码不对', (gateMsg || '').includes('访问码不对'), gateMsg);
  ok('闸门仍然打开（没有被放行）',
     !(await page.evaluate(() => document.getElementById('gate').classList.contains('off'))));
  const storedToken = await page.evaluate(() => localStorage.getItem('bossApp_token'));
  ok('错的钥匙没有被存进 localStorage', storedToken === null, storedToken);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景四：红点——有更新时亮，进过该 tab 后消失 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('\n【4】红点：updated 比本地 seen 新时亮，进过该 tab 后消失');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成' });
  await until(() => page.evaluate(() =>
    document.querySelector('.nav-btn[data-tab="trips"]').classList.contains('has-dot')),
    { what: '行程 tab 出现红点' });

  ok('行程 tab 有红点（服务端有更新、本地从没看过）',
     await page.evaluate(() => document.querySelector('.nav-btn[data-tab="trips"]').classList.contains('has-dot')));
  ok('账单 tab 有红点', await page.evaluate(() => document.querySelector('.nav-btn[data-tab="bills"]').classList.contains('has-dot')));
  ok('库存 tab 有红点', await page.evaluate(() => document.querySelector('.nav-btn[data-tab="inventory"]').classList.contains('has-dot')));
  ok('「今日」不在红点体系里，没有 has-dot',
     !(await page.evaluate(() => document.querySelector('.nav-btn[data-tab="today"]').classList.contains('has-dot'))));

  await gotoTab(page, 'trips');
  ok('进过行程 tab 后红点消失', !(await page.evaluate(() => document.querySelector('.nav-btn[data-tab="trips"]').classList.contains('has-dot'))));
  ok('没进过的账单 tab 红点还在', await page.evaluate(() => document.querySelector('.nav-btn[data-tab="bills"]').classList.contains('has-dot')));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景五：四个 tab 都能切，全程无 JS 报错 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('\n【5】四个 tab（今日/行程/账单/库存）都能切，切换全程无 JS 报错');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成' });
  for (const tab of ['trips', 'bills', 'inventory', 'today']){
    await gotoTab(page, tab);
    ok(`切到 ${tab} 分页后确实是 active`,
       await page.evaluate(t => document.getElementById('tab-' + t).classList.contains('active'), tab));
  }
  ok('四个 tab 切换全程无 JS 报错', errs.length === 0, errs.slice(0, 5));

  await ctx.close();
}

// ---------- 场景六：点账单会调 action:bill，iframe.src 变成 blob URL ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('\n【6】账单：点一条会调 action:bill，iframe 的 src 变成 blob URL');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成' });
  await gotoTab(page, 'bills');
  await until(() => page.locator('.bill-row').count().then(n => n > 0), { what: '账单列表画出来' });

  rec.calls.length = 0;
  await page.click('.bill-row');
  await until(() => page.evaluate(() => {
    const f = document.getElementById('billFrame');
    return !!f && f.src.startsWith('blob:');
  }), { what: 'iframe.src 变成 blob URL' });

  ok('发了一个 action:bill 的请求', rec.calls.some(c => c.action === 'bill'), rec.calls);
  const frameSrc = await page.evaluate(() => document.getElementById('billFrame').src);
  ok('iframe.src 是 blob URL', frameSrc.startsWith('blob:'), frameSrc);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景六之二：账单真的画出来了，而且用手指能滑到后面几页 ----------
// 这一节守两件在 2026-08-27 真实踩到的事：
// 1. Android Chrome 没有内建 PDF 阅读器，iframe 塞 PDF 只会出乱码，所以必须自己
//    用 PDF.js 画成 canvas——要断言 canvas 真的出现，不是「没报错」。
// 2. 滚动**必须用真实滚轮/触摸事件**，不许用 element.scrollTop = x。后者绕过
//    「手指点在哪个元素上」的判定：当时 .overlay-status 整片盖在账单上面又没设
//    pointer-events:none，程序设 scrollTop 一切正常，真人却怎么滑都不动，
//    只看得到第一页。用 scrollTop 的测法完全测不出来。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('\n【6b】账单真的渲染出来，且能用真实滚轮滑到后面几页');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成' });
  await gotoTab(page, 'bills');
  await until(() => page.locator('.bill-row').count().then(n => n > 0), { what: '账单列表画出来' });
  await page.click('.bill-row');

  await until(() => page.evaluate(() =>
    document.querySelectorAll('#billPages canvas').length > 0),
    { what: '账单被画成 canvas（不是靠浏览器自己读 PDF）', timeout: 20000 });

  const before = await page.evaluate(() => {
    const p = document.getElementById('billPages');
    return { canvases: p.querySelectorAll('canvas').length,
             holders: p.querySelectorAll('.bill-page-holder').length,
             scrollable: p.scrollHeight > p.clientHeight + 10 };
  });
  ok('每一页都有占位块（4 页）', before.holders === 4, before);
  ok('至少画出了一页', before.canvases >= 1, before);
  ok('内容比一屏高，也就是真的需要滚动', before.scrollable, before);

  // 真实滚轮：不许改成 scrollTop = x，理由见本节顶部注释
  await page.mouse.move(195, 400);
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(120); }

  const after = await page.evaluate(() => {
    const p = document.getElementById('billPages');
    return { scrollTop: Math.round(p.scrollTop), canvases: p.querySelectorAll('canvas').length };
  });
  ok('用滚轮真的滚动了（没有被上层元素挡住）', after.scrollTop > 100, after);
  // 断言「每一页都画出来了」而不是「比之前多」：懒渲染本来就会多画一页，
  // 用「比之前多」的话，滑不动时也会蒙混过关（2026-08-27 第一版就写松了）。
  ok('滚到底后每一页都画出来了', after.canvases === before.holders, { before, after });
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景七：库存字段真实形状（数量是整数、location 是字符串） ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('\n【7】库存字段容错：真实形状 {id,name,count,unit,location,note,added_at}');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成' });
  await gotoTab(page, 'inventory');
  await until(() => page.locator('.inv-row').count().then(n => n > 0), { what: '库存列表画出来' });

  const invTxt = await page.textContent('#tab-inventory');
  ok('品名显示正确', (invTxt || '').includes('Laffite 2001'), invTxt.slice(0, 200));
  ok('数量与单位显示正确（11 瓶）', (invTxt || '').includes('11') && (invTxt || '').includes('瓶'), invTxt.slice(0, 200));
  ok('存放位置显示正确（西港）', (invTxt || '').includes('西港'), invTxt.slice(0, 200));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景八：库存挂掉（inventory:null）时行程/账单照常渲染，不白屏 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer', inventory: null });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('\n【8】inventory:null（库存挂掉）时，行程和账单照常渲染，页面不白屏');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成' });

  await gotoTab(page, 'trips');
  ok('行程分页照常渲染（不受库存挂掉影响）',
     (await page.textContent('#tab-trips') || '').includes('大阪'));
  await gotoTab(page, 'bills');
  ok('账单分页照常渲染（不受库存挂掉影响）',
     (await page.locator('.bill-row').count()) > 0);
  await gotoTab(page, 'inventory');
  ok('库存分页显示「暂时无法读取」而不是白屏',
     (await page.textContent('#tab-inventory') || '').includes('暂时无法读取'));
  ok('页面主体没有变空白（body 仍有内容）',
     (await page.evaluate(() => document.body.innerText.trim().length)) > 20);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景九：admin 表单——新增行程 / 新增条目，行程条目的输入框都齐全 ----------
// 2026-08-27：行程 JSON textarea 换成了真表单（用户是非工程师，这是他唯一会用的入口）。
// 注：「高级：直接编辑 JSON」已于 2026-08-28 整块移除，下面 admin 对照组守的
// textarea 现在指的是行程表单里的那些输入框，不是那个 JSON 框。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('\n【9】admin 表单：「+ 新增行程」能新增一组行程输入框');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');

  const cardsBefore = await page.locator('.admin-trip-card').count();
  await page.click('button[onclick="adminAddTrip()"]');
  const cardsAfter = await page.locator('.admin-trip-card').count();
  ok('点「+ 新增行程」后多出一组行程输入框', cardsAfter === cardsBefore + 1, { cardsBefore, cardsAfter });
  ok('新行程默认是展开的表单（能直接填），不是收起状态',
     await page.locator('.admin-trip-card').count() > 0);
  // 假数据（fakeTrips）本来就带 1 条行程，新增的这条不一定排在下标 0——
  // 用 adminExpandedTrip（新增后自动展开的那条）拿真实下标，不要硬编 0。
  const idx = await page.evaluate(() => adminExpandedTrip);

  console.log('\n【10】填了标题和日期后，「+ 新增条目」能新增一条带日期/时间/标题的条目');
  await page.fill(`input[data-trip="${idx}"][data-field="title.zh"]`, '测试行程');
  await page.fill(`input[data-trip="${idx}"][data-field="start"]`, '2026-09-01');
  await page.fill(`input[data-trip="${idx}"][data-field="end"]`, '2026-09-03');
  const itemsBefore = await page.locator('.admin-item-row').count();
  await page.click(`button[onclick="adminAddItem(${idx})"]`);
  const itemsAfter = await page.locator('.admin-item-row').count();
  ok('点「+ 新增条目」后多出一条条目', itemsAfter === itemsBefore + 1, { itemsBefore, itemsAfter });
  const row = page.locator('.admin-item-row').first();
  // 2026-08-28 简化表单后，日期输入框收进了紧凑行旁边的「更多」（原生 <details>），
  // 跟紧凑行是兄弟节点、不再是 .admin-item-row 的子元素——按委派说明「先展开再断言，
  // 不弱化」：展开第一条（下标 0，两个条目里较早那个）的「更多」，改用外层
  // .admin-item-wrap（涵盖紧凑行＋更多两块）作查找范围，日期/时间/标题三样仍然都要有。
  // 「更多」可能已经自动展开（没填日期时会自动打开），这里用 open=true 确保展开，
  // 不能用 click——已经开着的话点一下反而会收起来。
  await page.evaluate(id => { const d = document.getElementById(id); if(d) d.open = true; }, `admin-item-${idx}-0-more`);
  const wrap = page.locator('.admin-item-wrap').first();
  ok('条目有日期输入框', await wrap.locator('input[type="date"]').count() >= 1);
  ok('条目有时间输入框', await wrap.locator('input[type="time"]').count() >= 1);
  ok('条目有标题（中文）输入框', await wrap.locator('input[type="text"]').count() >= 1);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景十：地点名称自动生成地图链接（CLAUDE.md 硬规则的自动化保障）----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('\n【11】地点名称框填地名，自动生成 Google 地图搜索链接（本仓库硬规则：提到地点必须带地图链接）');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await page.click('button[onclick="adminAddTrip()"]');
  const idx10 = await page.evaluate(() => adminExpandedTrip);
  // adminAddTrip() 自带一条空条目，下标 0——2026-08-28 简化表单后地点名称挪进了
  // 「更多」，默认收起（内容全空，没有东西可藏）。按委派说明「先展开再断言，不弱化」，
  // 这里先点开「更多」再定位地点输入框（换成 id，不再靠 .admin-field 在行内的位置）。
  // 「更多」可能已经自动展开（没填日期时会自动打开），这里用 open=true 确保展开，
  // 不能用 click——已经开着的话点一下反而会收起来。
  await page.evaluate(id => { const d = document.getElementById(id); if(d) d.open = true; }, `admin-item-${idx10}-0-more`);
  const mapInput = page.locator(`#admin-item-${idx10}-0-map`);
  await mapInput.fill('大阪城');
  await mapInput.dispatchEvent('change');
  const generated = await mapInput.inputValue();
  const expected = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('大阪城');
  ok('地点名称自动生成的地图链接跟 encodeURIComponent 后的地名逐字符对得上',
     generated === expected, { generated, expected });

  console.log('\n【12】直接粘贴 https:// 开头的地图链接时，原样保留、不被重新编码');
  const pasted = 'https://maps.app.goo.gl/abc123XYZ';
  await mapInput.fill(pasted);
  await mapInput.dispatchEvent('change');
  const kept = await mapInput.inputValue();
  ok('粘贴的完整链接原样保留，没有被 encodeURIComponent 再包一层', kept === pasted, { kept, pasted });
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景十一：校验生效——结束日期早于开始日期时，保存被拦下且有提示 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('\n【13】校验：结束日期早于开始日期时，保存被拦下，且有提示（不是静默失败）');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await page.click('button[onclick="adminAddTrip()"]');
  const idx13 = await page.evaluate(() => adminExpandedTrip);
  await page.fill(`input[data-trip="${idx13}"][data-field="title.zh"]`, '倒着填日期');
  await page.fill(`input[data-trip="${idx13}"][data-field="start"]`, '2026-09-10');
  await page.fill(`input[data-trip="${idx13}"][data-field="end"]`, '2026-09-01'); // 早于开始日期

  await page.click('button[onclick="adminSaveTripsForm()"]');
  await until(() => page.evaluate(() =>
    (document.getElementById('admin-trips-form-status').textContent || '').trim() !== ''),
    { what: '保存表单出现提示' });
  const statusTxt = await page.textContent('#admin-trips-form-status');
  const statusCls = await page.evaluate(() => document.getElementById('admin-trips-form-status').className);
  ok('提示不是空的（不是静默失败）', (statusTxt || '').trim() !== '', statusTxt);
  ok('提示是错误样式（err class）', statusCls.includes('err'), statusCls);
  ok('提示内容提到结束日期不能早于开始日期', (statusTxt || '').includes('结束日期不能早于开始日期'), statusTxt);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景十二：保存调 bossCall('tripsSave', ...)，送出去的 JSON 结构符合 Trip 合约 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('\n【14】保存会调 bossCall(\'tripsSave\', ...)，送出去的 JSON 结构逐字段符合 Trip 合约');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await page.click('button[onclick="adminAddTrip()"]');
  const idx14 = await page.evaluate(() => adminExpandedTrip);
  await page.fill(`input[data-trip="${idx14}"][data-field="title.zh"]`, '大阪三日游');
  // 2026-08-28 简化表单：行程标题（英文）输入框整个不再渲染，砍不掉的是数据结构——
  // 直接写工作副本模拟「旧数据本来就带着英文」，断言下面保存后这个值原样带出去，
  // 不是靠 UI 填第二遍（对应委派要求 E：已经填过英文的旧数据不许弄丢）。
  await page.evaluate((i) => { adminTripsDraft[i].title.en = 'Osaka 3 Days'; }, idx14);
  await page.fill(`input[data-trip="${idx14}"][data-field="start"]`, '2026-09-01');
  await page.fill(`input[data-trip="${idx14}"][data-field="end"]`, '2026-09-03');
  // adminAddTrip() 自带一条空条目，下标 0——不用再点「新增条目」，直接用它。
  // 「更多」默认收起（内容全空），先展开才能填日期和地点（委派说明允许的「先展开
  // 再断言」，选择器从 .admin-field 的相对位置换成明确 id，不再依赖行内顺序）。
  // 「更多」可能已经自动展开（没填日期时会自动打开），这里用 open=true 确保展开，
  // 不能用 click——已经开着的话点一下反而会收起来。
  await page.evaluate(id => { const d = document.getElementById(id); if(d) d.open = true; }, `admin-item-${idx14}-0-more`);
  const row = page.locator('.admin-item-row').first();
  await page.fill(`#admin-item-${idx14}-0-date`, '2026-09-01');
  await row.locator('input[type="text"]').first().fill('入住酒店'); // 标题（中文）
  // 同一条目的英文标题/英文备注也直接写工作副本模拟旧数据，跟标题英文同一个理由。
  await page.evaluate((i) => {
    adminTripsDraft[i].items[0].title.en = 'Check in (old EN)';
    adminTripsDraft[i].items[0].note.en = 'Bring umbrella (old EN)';
  }, idx14);
  const mapInput = page.locator(`#admin-item-${idx14}-0-map`);
  await mapInput.fill('大阪城');
  await mapInput.dispatchEvent('change');

  rec.calls.length = 0;
  await page.click('button[onclick="adminSaveTripsForm()"]');
  await until(() => rec.calls.some(c => c.action === 'tripsSave'), { what: '发出 tripsSave 请求' });

  const call = rec.calls.find(c => c.action === 'tripsSave');
  ok('调用的 action 是 tripsSave', !!call, call);
  const trips = call && call.trips;
  // 假数据（fakeTrips）本来带 1 条（t1），新增的这条是第 2 条——按 id 找新增的那条，
  // 不能假设它排在下标 0（跟场景九同一个理由）。
  ok('trips 是数组，且有 2 条（原本 1 条 ＋ 新增 1 条）', Array.isArray(trips) && trips.length === 2, trips);
  const t = trips && trips.find(x => x.id !== 't1');
  ok('trip.title 是 {zh,en} 对象', t && typeof t.title === 'object' && 'zh' in t.title && 'en' in t.title, t && t.title);
  ok('trip.title.zh 逐字对得上', t && t.title.zh === '大阪三日游', t && t.title.zh);
  ok('trip.title.en 是砍掉输入框之前就有的旧值，保存后没弄丢', t && t.title.en === 'Osaka 3 Days', t && t.title.en);
  ok('trip.start / trip.end 字段名逐字对得上', t && t.start === '2026-09-01' && t.end === '2026-09-03', t);
  ok('trip.items 是数组，且有 1 条', t && Array.isArray(t.items) && t.items.length === 1, t && t.items);
  const it = t && t.items && t.items[0];
  ok('item.mapUrl 字段名逐字对得上，且是生成出来的地图链接',
     it && it.mapUrl === 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('大阪城'), it && it.mapUrl);
  ok('item.title 是 {zh,en} 对象，且 zh 对得上',
     it && typeof it.title === 'object' && it.title.zh === '入住酒店', it && it.title);
  ok('item.title.en 是砍掉输入框之前就有的旧值，保存后没弄丢（结构没被简化表单改坏）',
     it && it.title.en === 'Check in (old EN)', it && it.title.en);
  ok('item.note.en 是砍掉输入框之前就有的旧值，保存后没弄丢（结构没被简化表单改坏）',
     it && it.note.en === 'Bring umbrella (old EN)', it && it.note.en);
  // 注：没有断言「保存成功后状态栏显示已保存」——实测 adminSaveTripsForm() 里
  // statusEl.textContent='已保存' 之后紧跟着 await refreshFeed() 立刻用新数据整块
  // 重建 #tab-admin（renderAdmin() 重新 innerHTML），"已保存" 那条消息在用户看到之前
  // 就被冲掉了，这是真实存在的 UX 缺陷，写进委派回报，不在这里自己改 boss/index.html。
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景十三：机场名与时间格式（原来这一节还验「高级：直接编辑 JSON」默认折叠，
// 该功能 2026-08-28 已按用户要求整块移除——「我没有用」——所以那三条断言一并删掉。
// 这是功能没了，不是把判定标准放宽。） ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');

  console.log('\n【15】「高级：直接编辑 JSON」已整块移除（用户说没在用）');
  const jsonGone = await page.evaluate(() => ({
    details: !!document.getElementById('admin-json-details'),
    textarea: !!document.getElementById('admin-trips-json'),
    fn: typeof window.adminSaveTrips,
  }));
  ok('JSON 折叠块不在了', jsonGone.details === false, jsonGone);
  ok('JSON textarea 不在了', jsonGone.textarea === false, jsonGone);
  ok('只服务它的 adminSaveTrips 也清掉了（不留悬空函数）', jsonGone.fn === 'undefined', jsonGone);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  console.log('\n【16】机场名不许写死：extractHM 两种时间格式、airportLabelZh/flightTitleFromLookup 三级优先级');
  const flightChecks = await page.evaluate(() => {
    const r = {};
    // extractHM：真实接口时间格式我们没验证过，至少这两种常见写法＋边界情况要抓得到
    r.hmIso = extractHM('2026-09-12T09:30:00+07:00');
    r.hmSpace = extractHM('2026-09-12 09:30+07:00');
    r.hmDateOnly = extractHM('2026-09-12');
    r.hmEmpty = extractHM('');
    r.hmNull = extractHM(null);
    // airportLabelZh：1. 表里有 → 中文名+代码
    r.zhInTable = airportLabelZh('PNH', null);
    // 2. 表里没有，但接口给了名字（如德累斯顿 DRS，这次真实反馈的那个缺陷）→ 名字+代码
    r.zhOutOfTableWithName = airportLabelZh('DRS', 'Dresden');
    // 3. 两者都没有 → 只剩代码
    r.zhOutOfTableNoName = airportLabelZh('DRS', null);
    // airportLabelEn：没有中文表这一级，接口给了名字就用，没有就只用代码
    r.enWithName = airportLabelEn('DRS', 'Dresden');
    r.enNoName = airportLabelEn('DRS', null);
    // flightTitleFromLookup：模拟后端新字段 from_name/to_name（表外机场也要显示得出名字）
    r.title = flightTitleFromLookup({ from: 'DRS', to: 'PNH', from_name: 'Dresden', to_name: null });
    return r;
  });
  ok('extractHM 抓到 ISO 格式', flightChecks.hmIso === '09:30', flightChecks.hmIso);
  ok('extractHM 抓到带空格格式', flightChecks.hmSpace === '09:30', flightChecks.hmSpace);
  ok('extractHM 只有日期没时间时回空字符串、不报错', flightChecks.hmDateOnly === '', flightChecks.hmDateOnly);
  ok('extractHM 空字符串输入回空字符串', flightChecks.hmEmpty === '', flightChecks.hmEmpty);
  ok('extractHM null 输入回空字符串、不报错', flightChecks.hmNull === '', flightChecks.hmNull);
  ok('表里有 → 中文名+代码', flightChecks.zhInTable === '金边 PNH', flightChecks.zhInTable);
  ok('表外但接口给了名字 → 名字+代码（不再是光秃秃的代码）', flightChecks.zhOutOfTableWithName === 'Dresden DRS', flightChecks.zhOutOfTableWithName);
  ok('表外且接口也没给名字 → 只剩代码', flightChecks.zhOutOfTableNoName === 'DRS', flightChecks.zhOutOfTableNoName);
  ok('英文侧有接口名字 → 名字+代码', flightChecks.enWithName === 'Dresden DRS', flightChecks.enWithName);
  ok('英文侧没有接口名字 → 只用代码', flightChecks.enNoName === 'DRS', flightChecks.enNoName);
  ok('flightTitleFromLookup 中文侧表外机场带出接口名字', flightChecks.title && flightChecks.title.zh === 'Dresden DRS → 金边 PNH', flightChecks.title);
  ok('flightTitleFromLookup 英文侧同样带出接口名字（没有就退回代码）', flightChecks.title && flightChecks.title.en === 'Dresden DRS → PNH', flightChecks.title);

  await ctx.close();
}

// ---------- 场景十四：航班号填完自动查询——不用再点一下「查询」按钮 ----------
// 2026-08-28 事故：上一版航班号输入框没绑任何事件，只有按钮能触发查询。用户填完
// 航班号直接保存，查询压根没跑过，两条航班全程没时间、没 ✈️ 标记，也没有任何报错。
// 这四条断言分别守：自动触发、同组合去重（省 API 额度）、日期改了要重查、失败要显眼。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin' }); // 默认「查不到」（见 mountRoutes 顶部注释）
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  // fakeTrips 只有一条行程（t1），展开它，条目在下标 0——不用新增行程/条目，
  // 直接用假数据自带的那一条，省得再走一遍新增流程。
  await page.evaluate(() => adminExpandTrip(0));
  // 注意：until() 的判定函数必须整体是 async（或直接返回 promise），
  // `() => page.locator(...).count() === 1` 是错的——.count() 返回 promise，
  // 拿 promise 对象去跟数字比较永远是 false，会一直等到超时（这份自检本身踩过一次）。
  await until(async () => (await page.locator('#admin-item-0-0-flightno').count()) === 1,
    { what: '航班号输入框出现' });

  console.log('\n【17】填完航班号失焦，不用点「查询」按钮就自动发出请求');
  rec.calls.length = 0;
  // 航班日期没有独立输入框了——它就是条目自己的日期（2026-08-28 改）
  await page.evaluate(() => { adminTripsDraft[0].items[0].date = '2026-09-01'; });
  await page.fill('#admin-item-0-0-flightno', 'CZ3096');
  await page.locator('#admin-item-0-0-flightno').blur();
  await until(() => rec.calls.some(c => c.action === 'flightLookup'), { what: '自动发出 flightLookup 请求' });
  const firstCallCount = rec.calls.filter(c => c.action === 'flightLookup').length;
  ok('没点「查询」按钮，失焦就自动发出了 action:flightLookup 请求', firstCallCount === 1, rec.calls);

  console.log('\n【18】同一组合（号+日期没变）再失焦一次，不重复发请求（省 API 额度）');
  await page.locator('#admin-item-0-0-flightno').focus();
  await page.locator('#admin-item-0-0-flightno').blur();
  await page.waitForTimeout(300); // 等得到就是没发；用 until 反而会一直等到超时，故意固定等一下看有没有多出请求
  const secondCallCount = rec.calls.filter(c => c.action === 'flightLookup').length;
  ok('号和日期都没变，第二次失焦不再打请求', secondCallCount === firstCallCount, { firstCallCount, secondCallCount });

  console.log('\n【19】改「条目日期」就会按新日期重查（同一个号但日期变了）');
  await page.fill('#admin-item-0-0-date', '2026-09-02');
  // fill() 只保证触发 input 事件，日期框绑的是 onchange——显式补发一次 change，
  // 跟本文件其它场景里 mapInput.dispatchEvent('change') 是同一手法，避免测试本身不稳。
  await page.locator('#admin-item-0-0-date').dispatchEvent('change');
  await until(() => rec.calls.filter(c => c.action === 'flightLookup').length > secondCallCount,
    { what: '日期改动后重新发出 flightLookup 请求' });
  const thirdCallCount = rec.calls.filter(c => c.action === 'flightLookup').length;
  ok('日期改动后又发起了一次新查询', thirdCallCount === secondCallCount + 1, { secondCallCount, thirdCallCount });
  // 这一条是 2026-08-28 那次事故的核心：他把回程条目改成 27 号，查询却仍然按 23 号发出去，
  // 拿回来的是另一天的航班时间。所以不能只验「有没有再查一次」，要验「查的是不是新日期」。
  const lastLookup = rec.calls.filter(c => c.action === 'flightLookup').pop();
  ok('重查用的是改后的条目日期，不是旧日期', lastLookup && lastLookup.date === '2026-09-02', lastLookup);

  console.log('\n【20】查询失败（mountRoutes 默认查不到）时，条目上要有明显标记，不能只是一行小字');
  await until(() => page.evaluate(() =>
    document.getElementById('admin-item-0-0-flightblock').classList.contains('flight-lookup-block-err')),
    { what: '航班块出现失败态的红边框 class' });
  const failState = await page.evaluate(() => ({
    blockErr: document.getElementById('admin-item-0-0-flightblock').classList.contains('flight-lookup-block-err'),
    inputErr: document.getElementById('admin-item-0-0-flightno').classList.contains('flight-input-err'),
    statusTxt: (document.getElementById('admin-item-0-0-flightstatus').textContent || '').trim(),
    flight: adminTripsDraft[0].items[0].flight,
  }));
  ok('航班块本身带上失败态的红边框 class（不是只有状态字变红）', failState.blockErr, failState);
  ok('航班号输入框带上红边框 class', failState.inputErr, failState);
  ok('状态字不是空的（有具体的失败原因文字）', failState.statusTxt !== '', failState);
  ok('查询失败也把 {no,date,unresolved:true} 记进 it.flight，不是完全没留痕迹',
     failState.flight && failState.flight.unresolved === true && failState.flight.no === 'CZ3096', failState);

  console.log('\n【21】重新渲染表单（模拟保存后 renderAdmin() 整块重画，跟 refreshFeed() 后的效果一样）后，失败提示仍然在，不是一闪而过');
  await page.evaluate(() => renderAdmin()); // renderAdmin() 会重建 #tab-admin，adminExpandedTrip 还是 0，展开态不变
  await until(async () => (await page.locator('#admin-item-0-0-flightblock').count()) === 1, { what: '航班块重新渲染出来' });
  const afterRerender = await page.evaluate(() => ({
    blockErr: document.getElementById('admin-item-0-0-flightblock').classList.contains('flight-lookup-block-err'),
    statusTxt: (document.getElementById('admin-item-0-0-flightstatus').textContent || '').trim(),
  }));
  ok('重新渲染后失败标记还在（不是只在查询那一刻闪一下）', afterRerender.blockErr, afterRerender);
  ok('重新渲染后状态字仍有提示文字', afterRerender.statusTxt !== '', afterRerender);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景十五：条目/行程表单简化——默认只露最常填的几样，英文输入框整个不再渲染 ----------
// 2026-08-28：用户反馈「填一个条目要面对 9 个输入框，一半是英文根本不会填」。
// 这份场景守四件事：(1) 默认只有时间/做什么/航班号三样看得见 (2) 英文标题/英文备注
// 输入框压根不进 DOM（不是隐藏） (3) 点「更多」才出现日期/备注/地点/航班日期，
// 日期与航班日期自动带出不用手填 (4) 已有内容的条目「更多」默认展开，不会被藏没。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await page.click('button[onclick="adminAddTrip()"]');
  const idx22 = await page.evaluate(() => adminExpandedTrip);
  // adminAddTrip() 自带一条空条目，下标 0，不用再点「新增条目」。

  console.log('\n【22】新建条目：默认只看得到时间／做什么／航班号，英文标题/英文备注输入框压根不进 DOM');
  ok('默认能看到「时间」输入框', await page.locator(`#admin-item-${idx22}-0-time`).count() === 1);
  ok('默认能看到「做什么」（标题中文）输入框', await page.locator(`#admin-item-${idx22}-0-title-zh`).count() === 1);
  ok('默认能看到「航班号」输入框', await page.locator(`#admin-item-${idx22}-0-flightno`).count() === 1);
  ok('条目英文标题输入框整个不渲染（数量为 0，不是 CSS 隐藏）', await page.locator(`#admin-item-${idx22}-0-title-en`).count() === 0);
  ok('条目英文备注输入框整个不渲染（数量为 0，不是 CSS 隐藏）', await page.locator(`#admin-item-${idx22}-0-note-en`).count() === 0);
  ok('行程层英文标题输入框也整个不渲染', await page.locator(`input[data-trip="${idx22}"][data-field="title.en"]`).count() === 0);
  ok('行程层英文地点输入框也整个不渲染', await page.locator(`input[data-trip="${idx22}"][data-field="location.en"]`).count() === 0);

  console.log('\n【23】新建条目内容全空时，「更多」默认收起（<details> 没有 open 属性）——折叠是真的挡住了字段，不是摆设');
  const moreOpenEmpty = await page.evaluate((i) => document.getElementById(`admin-item-${i}-0-more`).open, idx22);
  ok('全空条目的「更多」默认收起', moreOpenEmpty === false, moreOpenEmpty);
  ok('折叠时地点输入框不可见（用 isVisible 判断，不真的去 fill 卡住整份自检）',
     await page.locator(`#admin-item-${idx22}-0-map`).isVisible() === false);

  console.log('\n【24】点开「更多」后，日期／备注／地点名称／航班日期才出现');
  // 「更多」可能已经自动展开（没填日期时会自动打开），这里用 open=true 确保展开，
  // 不能用 click——已经开着的话点一下反而会收起来。
  await page.evaluate(id => { const d = document.getElementById(id); if(d) d.open = true; }, `admin-item-${idx22}-0-more`);
  ok('点开「更多」后地点输入框可见了', await page.locator(`#admin-item-${idx22}-0-map`).isVisible() === true);
  ok('点开「更多」后日期输入框可见了', await page.locator(`#admin-item-${idx22}-0-date`).isVisible() === true);
  ok('点开「更多」后备注输入框可见了', await page.locator(`#admin-item-${idx22}-0-note-zh`).isVisible() === true);
  // 航班日期的独立输入框已经**整个拿掉**（2026-08-28）：它是「两个日期各走各的」这类
  // 事故的唯一来源。这里反过来验它不在 DOM 里，防止哪天又被加回来。
  ok('航班日期不再有独立输入框（唯一日期就是上面那个）',
     await page.locator(`#admin-item-${idx22}-0-flightdate`).count() === 0);
  ok('航班块里写明了用的是哪个日期', await page.locator(`#admin-item-${idx22}-0-flightblock .flight-lookup-date`).count() === 1);

  console.log('\n【25】日期与航班日期自动带出，不用每条都填');
  await page.fill(`input[data-trip="${idx22}"][data-field="start"]`, '2026-10-01');
  await page.click(`button[onclick="adminAddItem(${idx22})"]`); // 新增第 2 条，日期应自动带出行程出发日
  const autoDate = await page.evaluate((i) => adminTripsDraft[i].items[1].date, idx22);
  ok('新条目日期自动带成行程出发日（不用手选）', autoDate === '2026-10-01', autoDate);
  const flightDateTxt = await page.evaluate((i) => {
    const el = document.querySelector(`#admin-item-${i}-1-flightblock .flight-lookup-date`);
    return el ? el.textContent.trim() : null;
  }, idx22);
  ok('航班块显示的日期就是条目日期', !!flightDateTxt && flightDateTxt.includes('2026-10-01'), flightDateTxt);

  console.log('\n【26】条目已经有备注时，「更多」默认展开，不会把已填内容藏没——双向验证的第二步（跟场景 23 折叠生效对照）');
  await page.evaluate((i) => {
    adminTripsDraft[i].items[0].note = { zh: '记得带伞', en: '' };
    rerenderAdminTripsSection();
  }, idx22);
  const moreOpenWithNote = await page.evaluate((i) => document.getElementById(`admin-item-${i}-0-more`).open, idx22);
  ok('已有备注的条目，「更多」默认展开', moreOpenWithNote === true, moreOpenWithNote);
  const summaryTxt = await page.locator(`#admin-item-${idx22}-0-more summary`).textContent();
  ok('「更多」标题上有提示已有内容的文字', (summaryTxt || '').includes('备注'), summaryTxt);

  console.log('\n【27】保存后，条目的英文标题/英文备注字段仍在数据里（数据结构没有被简化表单改坏）');
  await page.evaluate((i) => {
    adminTripsDraft[i].title.zh = '福冈两日游';
    adminTripsDraft[i].end = '2026-10-02';
    adminTripsDraft[i].items[0].title.en = 'Old English Title';
    adminTripsDraft[i].items[0].note.en = 'Old English Note';
  }, idx22);
  rec.calls.length = 0;
  await page.click('button[onclick="adminSaveTripsForm()"]');
  await until(() => rec.calls.some(c => c.action === 'tripsSave'), { what: '发出 tripsSave 请求' });
  const call27 = rec.calls.find(c => c.action === 'tripsSave');
  const trip27 = call27 && call27.trips && call27.trips.find(x => x.id !== 't1');
  const item27 = trip27 && trip27.items && trip27.items[0];
  ok('保存后 item.title.en 仍在数据里，没被简化表单改坏', item27 && item27.title.en === 'Old English Title', item27);
  ok('保存后 item.note.en 仍在数据里，没被简化表单改坏', item27 && item27.note.en === 'Old English Note', item27);

  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}


// ---------- 场景二十八：预计时间不许冒充实际时间 ----------
// ⚠️ 用户当场抓到的 bug（2026-08-28）：他刚填完一个 9 月 1 日的航班（当天才 8 月 28 日），
// App 就告诉他「实际 10:12　延误 42 分」。原因是显示逻辑写的是 `act || est`，拿不到实际
// 时间就退而用预计时间、却照样标成「实际」。而 est 来自接口的 predictedTime，起飞前
// 好几天就有。那不是显示错误，是**把预测当成既成事实播报给老板**，他可能据此改行程。
// 这一节守三件事，改回 `act || est` 的话第一条会立刻红。
{
  const p2 = n => String(n).padStart(2, '0');
  const isoOff = (ms) => { const d = new Date(ms);
    return `${d.getUTCFullYear()}-${p2(d.getUTCMonth()+1)}-${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}+07:00`; };
  const now = Date.now();
  const mkTrip = (sched, act, est) => ([{
    id: 't-eta', title: { zh: '时间测试', en: 'ETA' },
    start: sched.slice(0, 10), end: sched.slice(0, 10),
    location: { zh: '', en: '' }, guideUrl: '',
    items: [{ date: sched.slice(0, 10), time: '09:00', title: { zh: '航班', en: 'F' },
      note: { zh: '', en: '' }, mapUrl: '',
      flight: { no: 'XX123', date: sched.slice(0, 10), trackId: 't',
        live: { from: 'PNH', to: 'CAN', sched_dep: sched, est_dep: est, act_dep: act,
          sched_arr: null, est_arr: null, act_arr: null, gate: null, terminal: null,
          status: 'scheduled', verified: true } } }],
  }]);

  async function timesText(trips){
    const ctx = await browser.newContext();
    await forceZh(ctx);
    mountRoutes(ctx, { role: 'viewer', trips });
    const page = await ctx.newPage();
    await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
      { what: 'App 加载完成' });
    await gotoTab(page, 'trips');
    await until(() => page.locator('.trip-card-hd').count().then(n => n > 0), { what: '行程卡出现' });
    await page.click('.trip-card-hd');
    await page.waitForTimeout(200);
    const txt = await page.evaluate(() => {
      const el = document.querySelector('.flight-info-times');
      return el ? el.innerText : '';
    });
    await ctx.close();
    return txt;
  }

  console.log('\n【28】预计时间不许冒充实际时间');

  // 1) 还早（4 天后）+ 只有预计 → 只显示计划时间，不许出现「延误」「实际」「预计」
  const far = isoOff(now + 4 * 86400000);
  const tFar = await timesText(mkTrip(far, null, isoOff(now + 4 * 86400000 + 42 * 60000)));
  ok('4 天后的航班不显示「延误」', !tFar.includes('延误'), tFar);
  ok('4 天后的航班不把预测标成「实际」', !tFar.includes('实际'), tFar);
  ok('4 天后的航班连「预计」也不显示（这么早的预测是噪音）', !tFar.includes('预计'), tFar);

  // 2) 快起飞了（6 小时内）+ 只有预计 → 显示「预计」，且明确写成预计不是实际
  const near = isoOff(now + 6 * 3600000);
  const tNear = await timesText(mkTrip(near, null, isoOff(now + 6 * 3600000 + 42 * 60000)));
  ok('6 小时内的航班显示「预计」', tNear.includes('预计'), tNear);
  ok('6 小时内的航班不冒充「实际」', !tNear.includes('实际'), tNear);
  ok('措辞是「预计晚 N 分」而不是「延误 N 分」', tNear.includes('预计晚 42 分') && !tNear.includes('延误 42 分'), tNear);

  // 3) 真的飞了 → 才是「实际」＋「延误」
  const past = isoOff(now - 3600000);
  const tPast = await timesText(mkTrip(past, isoOff(now - 3600000 + 42 * 60000), null));
  ok('已起飞的航班显示「实际」', tPast.includes('实际'), tPast);
  ok('已起飞的航班才说「延误 42 分」', tPast.includes('延误 42 分'), tPast);
}


// ---------- 场景二十九：账单能放大，而且放大后是真的清晰 ----------
// 用户 2026-08-28 要求：「PDF 的这个窗口不能放大吗？」账单上的数字很小、老板年纪不小。
// 关键不是「能变大」，是**变大之后看得清**——所以断言要盯**画布像素数变多**（=按新
// 尺寸重画了），而不是只看有没有 transform。纯 CSS 拉大位图会更糊，等于没做。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('\n【29】账单能放大，且放大后是重画的（不是把位图拉糊）');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成' });
  await gotoTab(page, 'bills');
  await until(() => page.locator('.bill-row').count().then(n => n > 0), { what: '账单列表画出来' });
  await page.click('.bill-row');
  await until(() => page.evaluate(() => document.querySelectorAll('#billPages canvas').length > 0),
    { what: '账单画成 canvas', timeout: 20000 });

  const snap = () => page.evaluate(() => {
    const c = document.querySelector('#billPages canvas');
    const w = document.getElementById('billZoomWrap');
    return { zoom: (document.getElementById('billZoomLabel') || {}).textContent || '',
             wrapW: w ? Math.round(w.getBoundingClientRect().width) : 0,
             canvasPx: c ? c.width : 0 };
  });

  const before = await snap();
  ok('缩放控件在（加减按钮都有）',
    await page.locator('#billZoomIn').count() === 1 && await page.locator('#billZoomOut').count() === 1);
  ok('一开始是 100%', before.zoom === '100%', before);

  await page.click('#billZoomIn');
  await page.click('#billZoomIn');
  await until(() => snap().then(a => a.canvasPx > before.canvasPx),
    { what: '放大后按新尺寸重画（画布像素变多）', timeout: 20000 });
  const zoomed = await snap();
  ok('倍率变大了', zoomed.wrapW > before.wrapW, { before, zoomed });
  ok('画布像素数变多 —— 是重画的，不是把位图拉糊', zoomed.canvasPx > before.canvasPx, { before, zoomed });

  // 一直点减号：停在 100%，不许缩到看不见
  for (let i = 0; i < 8; i++) { await page.click('#billZoomOut').catch(() => {}); await page.waitForTimeout(120); }
  const minned = await snap();
  ok('一直缩最小停在 100%，不会缩到看不见', minned.zoom === '100%', minned);

  // 关掉再打开要回到 100%，不带上一份账单的倍率
  await page.click('#billZoomIn'); await page.waitForTimeout(400);
  await page.evaluate(() => closeBillOverlay());
  await page.waitForTimeout(200);
  await page.click('.bill-row');
  await until(() => page.evaluate(() => document.querySelectorAll('#billPages canvas').length > 0),
    { what: '重新打开账单', timeout: 20000 });
  const reopened = await snap();
  ok('关掉再打开回到 100%', reopened.zoom === '100%', reopened);
  ok('「在新分页打开」的退路还在', await page.locator('#billOpenNew').count() === 1);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));

  await ctx.close();
}

// ---------- 场景八：顶部推送条不能赖着不走（2026-08-28 用户第二次反映「通知还是看得见」）----------
// 守三件事：① 老板（viewer）能自己按 × 关掉，关了刷新还是不出现；
// ② 通知已经开好之后顶部那条自动消失（没什么好提示了，一直挂着就是碍事）；
// ③ 【对照组】admin 那条仍然在管理页里活着，而且不给 × —— 关掉就找不回来了。
// 没有 ③ 的话，把 ensurePushUI() 整个改成 return 也能让 ①② 变绿。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.trip-card, .empty-card')),
    { what: 'viewer 首屏渲染完' });

  console.log('\n[场景八] 顶部推送条：viewer 能关、开好后自动消失、admin 对照组还在');
  const supported = await page.evaluate(() => pushSupported());
  ok('这台浏览器支持 Push（不支持的话下面几条等于没测）', supported === true, supported);

  const bar1 = await page.evaluate(() => {
    const b = document.getElementById('pushBar');
    return { exists: !!b, parent: b && b.parentElement && b.parentElement.id,
             dismiss: !!(b && b.querySelector('.push-dismiss')) };
  });
  ok('viewer 没开通知时，顶部有推送条', bar1.exists && bar1.parent === 'app', bar1);
  ok('推送条上有 × 可以关', bar1.dismiss === true, bar1);

  await page.click('#pushBar .push-dismiss');
  ok('按了 × 就没了', await page.locator('#pushBar').count() === 0);
  const remembered = await page.evaluate(() => localStorage.getItem('bossApp_pushBarDismissed'));
  ok('关掉这件事被记住了', remembered === '1', remembered);

  await page.reload();
  await until(() => page.evaluate(() => !!document.querySelector('.trip-card, .empty-card')),
    { what: 'viewer 刷新后渲染完' });
  ok('刷新后仍然不出现', await page.locator('#pushBar').count() === 0);

  // 换个干净身份验②：没按过 ×，但已经订阅成功 → 顶部那条自己消失
  await page.evaluate(() => {
    localStorage.removeItem('bossApp_pushBarDismissed');
    pushSubscription = null; ensurePushUI();
  });
  ok('清掉记号后又出现（证明上一条不是因为整块坏了）', await page.locator('#pushBar').count() === 1);
  await page.evaluate(() => { pushSubscription = { endpoint: 'https://example.test/x' }; ensurePushUI(); });
  ok('通知开好之后顶部那条自动消失', await page.locator('#pushBar').count() === 0);

  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}
// ---------- 场景八之对照组：admin 身上一条都不该有 ----------
// 2026-08-28 第四轮：之前把这条收进管理页插槽，想着「他可能要自己试通知」。
// 他连着三轮反映「还是看得见」——admin 身上就不该有这个提示（他不是收通知的人）。
// 这一节验的是「admin 一条都没有」，跟上一节「viewer 有」正好构成对照：
// 只删代码会让上一节红，只保留会让这一节红。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  // 「试一下本机通知」那条要真的走到 showNotification，得先有通知权限——
  // 不给的话它会停在「权限没给」那一步，验不到我们要验的东西。
  await ctx.grantPermissions(['notifications']); // 真机行为对齐；CI 无头环境不一定认，所以下面还会在页面内打桩
  mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-trips-section')),
    { what: 'admin 管理页渲染完' });

  ok('admin：整个页面里没有顶部推送条', await page.locator('#pushBar').count() === 0);
  ok('admin：管理页那个插槽也一并拿掉了', await page.locator('#adminPushSlot').count() === 0);
  // 订阅状态变化也不该把顶部那条招回来（refreshPushSubscriptionState 会再调一次 ensurePushUI）
  await page.evaluate(() => { pushSubscription = null; ensurePushUI(); });
  ok('admin：刷新推送状态后顶部也没冒出来', await page.locator('#pushBar').count() === 0);

  // 2026-08-29：上一版删过头了——顶部那条该删，但他自己那台机器的订阅被 FCM 判 410
  // 失效之后，手上**没有任何入口**能重开。所以管理页里要有一个安静的开关（一行，
  // 不是杵在首页的待办卡片）。这两组断言合起来才是完整的意思：
  //   顶部不许有（上面）＋ 管理页必须有（下面）。
  ok('admin：管理页里有通知开关（订阅失效了要能自己重开）',
     await page.locator('#admin-push-btn').count() === 1);
  ok('admin：开关旁边写着当前状态',
     await page.locator('#admin-push-state').count() === 1);
  const pushSecCn = (await page.locator('#admin-push-section .cn').allTextContents()).join(' ')
    || (await page.locator('#admin-push-section').innerText());
  ok('admin：未订阅时状态显示「未开启」、按钮写「开启」',
     /未开启/.test(pushSecCn) && /开启/.test(await page.locator('#admin-push-btn').innerText()), pushSecCn);
  ok('admin：写明了订阅可能失效、收不到就回来按一次',
     /失效/.test(pushSecCn), pushSecCn);

  // 订阅上了之后，同一行要变成「已开启／关闭」，而且**不重建整个管理页**
  // （重建会把正在编辑的行程表单冲掉）
  await page.evaluate(() => {
    document.getElementById('admin-trips-section').setAttribute('data-probe', '1');
    pushSubscription = { endpoint: 'https://push.example.com/x' };
    ensurePushUI();
  });
  ok('admin：订阅后状态变「已开启」',
     /已开启/.test(await page.locator('#admin-push-state').innerText()));
  ok('admin：按钮变成「关闭」',
     /关闭/.test(await page.locator('#admin-push-btn').innerText()));
  ok('admin：只重画那一行，没把整个管理页（连同正在编辑的表单）重建掉',
     await page.locator('#admin-trips-section[data-probe="1"]').count() === 1);

  // 2026-08-29：FCM 回 201 但手机什么都没跳。光看服务端分不出是「投递没到」还是
  // 「显示被挡」，所以要有一个绕开推送服务、直接让本机 SW 弹一条的按钮。
  ok('admin：有「试一下本机通知」按钮（把显示和投递拆开查）',
     await page.locator('#admin-push-local-btn').count() === 1);
  // 点了要真的调 registration.showNotification，而不是只改一行字充数
  // 这条断言验的是「点了会不会真的调 showNotification」。跟它无关、却会让它在 CI 上
  // 假红的外部条件有两个，全部在页面内打桩掉（沙盒过、CI 连红两次都栽在这上面：
  // 先是 SW 还没 active，改掉之后又栽在无头浏览器的通知权限上——grantPermissions
  // 在这个环境里没把 Notification.permission 变成 granted）：
  //   ① navigator.serviceWorker.ready 什么时候 resolve
  //   ② Notification.permission 是不是 granted
  const localFired = await page.evaluate(async () => {
    let called = null;
    const fakeReg = {
      showNotification: (title, opts) => { called = { title, body: opts && opts.body }; return Promise.resolve(); },
    };
    Object.defineProperty(navigator.serviceWorker, 'ready', {
      configurable: true, get: () => Promise.resolve(fakeReg),
    });
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
    await adminTestLocalNotification();
    return called;
  });
  ok('admin：点了确实调用了 showNotification（不是只改一行提示文字）',
     localFired && localFired.title && /本机通知测试/.test(localFired.title), localFired);
  ok('admin：弹完给出的说明能把「没看到」指向正确的方向',
     /手机\/浏览器挡掉|通知栏/.test(await page.locator('#admin-push-local-status').innerText()),
     await page.locator('#admin-push-local-status').innerText());
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}
// ---------- 场景九：往返不是转机（2026-08-28 新加坡行踩到）----------
// 他 23 号飞 SIN、27 号从 SIN 飞回来。两段相邻、落地机场＝起飞机场，旧写法一律当转机；
// 日期又因为「航班日期框没跟着条目日期走」查成同一天，算出负数 → 页面报「转机时间异常」。
// 这里守两件事：① 隔了一天以上的两段不算转机，整行不显示；
// ② 【对照组】同一天真的转机照样算得出来 —— 没有 ② 的话，把 transferRowHtml 改成
// 永远 return '' 也能让 ① 变绿。
function flightItem(date, time, from, to, schedDep, schedArr, est){
  est = est || {};
  return { date, time, title: { zh: `${from} → ${to}`, en: '' }, note: { zh: '', en: '' }, mapUrl: '',
    flight: { no: 'XX1', date, trackId: 't', live: {
      from, to, from_iata: from, to_iata: to, from_name: from, to_name: to,
      sched_dep: schedDep, est_dep: est.dep || null, act_dep: null,
      sched_arr: schedArr, est_arr: est.arr || null, act_arr: null,
      gate: null, terminal: null, status: 'expected', verified: true } } };
}
/** 生成「距今 N 天后」的当地时刻字符串，时区固定 +08:00。 */
function localAt(daysFromNow, hm, offset){
  const d = new Date(Date.now() + daysFromNow * 86400000);
  const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  return { date: iso, at: `${iso} ${hm}${offset || '+08:00'}` };
}
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const roundTrip = [{
    id: 'rt', title: { zh: '新加坡小旅行', en: '' }, start: '2026-09-23', end: '2026-09-27',
    location: { zh: '', en: '' }, guideUrl: '',
    items: [
      flightItem('2026-09-23', '18:55', 'KTI', 'SIN', '2026-09-23 18:55+07:00', '2026-09-23 22:00+08:00'),
      flightItem('2026-09-27', '12:25', 'SIN', 'KTI', '2026-09-27 12:25+08:00', '2026-09-27 13:40+07:00'),
    ],
  }];
  mountRoutes(ctx, { role: 'viewer', trips: roundTrip });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.trip-card')), { what: '行程卡渲染完' });
  await gotoTab(page, 'trips');

  console.log('\n[场景九] 往返（去程/回程）不能被当成转机');
  const rt = await page.evaluate(() => ({
    rows: document.querySelectorAll('#tab-trips .transfer-row').length,
    warn: document.querySelectorAll('#tab-trips .transfer-warn').length,
    txt: document.getElementById('tab-trips').textContent,
  }));
  ok('隔了 4 天的两段完全不显示转机行', rt.rows === 0, rt.rows);
  ok('也不会报「转机时间异常」', rt.warn === 0 && !rt.txt.includes('转机时间异常'), rt.warn);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}
// ---------- 场景九之对照组：同一天真的转机，照样要算得出来 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const realTransfer = [{
    id: 'tr', title: { zh: '金边回程', en: '' }, start: '2026-09-01', end: '2026-09-01',
    location: { zh: '', en: '' }, guideUrl: '',
    items: [
      flightItem('2026-09-01', '13:30', 'PEN', 'KUL', '2026-09-01 13:30+08:00', '2026-09-01 14:35+08:00'),
      flightItem('2026-09-01', '16:30', 'KUL', 'KTI', '2026-09-01 16:30+08:00', '2026-09-01 17:25+07:00'),
    ],
  }];
  mountRoutes(ctx, { role: 'viewer', trips: realTransfer });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.trip-card')), { what: '行程卡渲染完' });
  await gotoTab(page, 'trips');

  const tr = await page.evaluate(() => {
    const row = document.querySelector('#tab-trips .transfer-row');
    return { has: !!row, warn: !!document.querySelector('#tab-trips .transfer-warn'),
             txt: row ? row.textContent.replace(/\s+/g, ' ').trim() : null };
  });
  ok('同一天的真转机照样显示转机行', tr.has === true, tr);
  ok('算出来是 1 小时 55 分（14:35 到、16:30 走）', !!tr.txt && tr.txt.includes('1 小时 55 分'), tr);
  ok('机场名是吉隆坡（转机地取「到达那一段」的落点）', !!tr.txt && tr.txt.includes('吉隆坡'), tr);
  ok('这个间隔不算偏紧（>90 分）', !!tr.txt && !tr.txt.includes('偏紧'), tr);
  ok('不是异常态', tr.warn === false, tr);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景十：库存要排序（2026-08-28「金边那个酒的排序还是不顺序」）----------
// 真实数据里同一款酒的不同年份是分好几天陆续加进去的，按记录顺序显示就会
// 1996 → 2006 → 2009 → 2010 → 2001 这样跳。用跟记账 App 同一套排序规则：
// 中文按拼音、数字按数值。地点本身也要排，未标地点的垫底。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  // 故意打乱：地点交错、年份倒错、还夹一条没写地点的
  const messyInv = { wine: [
    { id:'a', name:'拉菲古堡 2010', count:6,  unit:'瓶', location:'金边' },
    { id:'b', name:'茅台精品',      count:12, unit:'瓶', location:'金边' },
    { id:'c', name:'Pavie',        count:17, unit:'瓶', location:'西港' },
    { id:'d', name:'拉菲古堡 1996', count:6,  unit:'瓶', location:'金边' },
    { id:'e', name:'Dalmore',      count:124,unit:'瓶', location:'金边' },
    { id:'f', name:'拉菲古堡 2001', count:18, unit:'瓶', location:'金边' },
    { id:'g', name:'来路不明的酒',   count:1,  unit:'瓶', location:'' },
    { id:'h', name:'茅台 15 年',    count:6,  unit:'瓶', location:'西港' },
  ], tea: [], herb: [] };
  mountRoutes(ctx, { role: 'viewer', inventory: messyInv });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.inv-row')), { what: '库存画出来' });
  await gotoTab(page, 'inventory');

  console.log('\n[场景十] 库存排序：同款酒的年份要顺、地点要顺');
  const shown = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#tab-inventory .inv-loc-hdr, #tab-inventory .inv-row').forEach(el => {
      if(el.classList.contains('inv-loc-hdr')) out.push('@' + el.querySelector('span').textContent.trim());
      else {
        const cn = el.querySelector('.cn');
        out.push((cn ? cn.textContent : el.textContent).trim().split('\n')[0]);
      }
    });
    return out;
  });
  const locs = shown.filter(x => x.startsWith('@'));
  ok('地点按名字排，未标地点的垫底', JSON.stringify(locs) === JSON.stringify(['@金边', '@西港', '@未标注地点']), locs);

  const jinbian = shown.slice(shown.indexOf('@金边') + 1, shown.indexOf('@西港'));
  ok('金边组：拉菲三个年份从小到大挨在一起',
     jinbian.join('|').includes('拉菲古堡 1996|拉菲古堡 2001|拉菲古堡 2010'), jinbian);
  // 中文和拉丁字母谁在前，取决于浏览器带的 ICU 排序表（这台机器上是中文在前）。
  // 写死顺序会让这份自检绑死某个浏览器版本，所以改成「跟同一套 collator 排出来的
  // 结果一致」——两个 App 用的是同一套规则，一致才是真正要守的东西。
  const sortedBy = (arr) => page.evaluate((names) => {
    const c = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });
    return names.slice().sort((a, b) => c.compare(a, b));
  }, arr);
  ok('金边组整体顺序 == collator 排出来的顺序',
     JSON.stringify(jinbian) === JSON.stringify(await sortedBy(jinbian)), jinbian);

  const xigang = shown.slice(shown.indexOf('@西港') + 1, shown.indexOf('@未标注地点'));
  ok('西港组也排了（对照组：不是只排了第一组）',
     JSON.stringify(xigang) === JSON.stringify(await sortedBy(xigang)), xigang);
  // 上面两条如果页面根本没排，也可能碰巧成立——所以再钉一条：西港组的显示顺序
  // 必须跟喂进去的记录顺序不同（喂的是 Pavie 在前、茅台 15 年在后）。
  ok('西港组的显示顺序确实跟记录顺序不同（证明真的排过）',
     JSON.stringify(xigang) !== JSON.stringify(['Pavie', '茅台 15 年']), xigang);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景十一：转机等待要跟屏幕上写着的时间对得上 ----------
// 2026-08-28 用户：「转机怎么 1 小时 29 分？13:30 到 16:30 飞不是 3 个小时？」
// 真相：航班还有 4 天才飞，卡片上按规矩只显示计划时间（14:35 到、16:30 走），
// 但转机那行**偷偷用了没显示出来的预计到达 15:01** 去算 → 1 小时 29 分。
// 屏幕上的数字自己对不上，比算错更糟——他没法验证，只能怀疑全部。
// ① 远期航班：卡片显示计划时间，转机就必须按计划时间算（1 小时 55 分）。
// ② 【对照组】24 小时内的航班：预计时间是显示出来的，转机就该跟着预计走，
//    否则「显示延误了、等待时间却纹丝不动」同样是自相矛盾。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const far = localAt(4, '13:30');           // 4 天后 —— 超过 24 小时预测窗口
  const legs = [
    flightItem(far.date, '13:30', 'PEN', 'KUL', `${far.date} 13:30+08:00`, `${far.date} 14:35+08:00`,
               { arr: `${far.date} 15:01+08:00` }),   // 预计晚 26 分，但这么早不该显示
    flightItem(far.date, '16:30', 'KUL', 'KTI', `${far.date} 16:30+08:00`, `${far.date} 17:25+07:00`),
  ];
  mountRoutes(ctx, { role: 'viewer', trips: [{ id:'f', title:{zh:'远期转机',en:''},
    start: far.date, end: far.date, location:{zh:'',en:''}, guideUrl:'', items: legs }] });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.trip-card')), { what: '行程卡渲染完' });
  await gotoTab(page, 'trips');

  console.log('\n[场景十一] 转机等待必须跟卡片上显示的时间一致');
  const far1 = await page.evaluate(() => {
    const pane = document.getElementById('tab-trips');
    const row = pane.querySelector('.transfer-row');
    return { txt: row ? row.textContent.replace(/\s+/g, ' ').trim() : null,
             pane: pane.textContent.replace(/\s+/g, ' ') };
  });
  ok('远期航班的卡片上没有出现预计到达 15:01', far1.pane.includes('15:01') === false, far1.pane.slice(0, 200));
  ok('转机按显示出来的计划时间算 = 1 小时 55 分',
     !!far1.txt && far1.txt.includes('1 小时 55 分'), far1.txt);
  ok('绝不是拿没显示的预计时间算出来的 1 小时 29 分',
     !!far1.txt && !far1.txt.includes('1 小时 29 分'), far1.txt);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}
{
  // ② 对照组：同样的两段，但改成 6 小时后起飞 —— 预计时间这时是显示出来的，
  //    转机就该按预计算（15:01 → 16:30 = 1 小时 29 分）。
  const ctx = await browser.newContext();
  await forceZh(ctx);
  // 时刻一律用「此刻 + N 分钟」生成（UTC+00:00），免得跨日/跨时区把断言算歪
  const mk = (offsetMin) => {
    const d = new Date(Date.now() + offsetMin * 60000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}+00:00`;
  };
  const day = new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 10);
  const legs = [
    flightItem(day, '', 'PEN', 'KUL', mk(6 * 60), mk(7 * 60), { arr: mk(7 * 60 + 26) }), // 预计晚 26 分
    flightItem(day, '', 'KUL', 'KTI', mk(9 * 60), mk(10 * 60)),
  ];
  mountRoutes(ctx, { role: 'viewer', trips: [{ id:'n', title:{zh:'近期转机',en:''},
    start: day, end: day, location:{zh:'',en:''}, guideUrl:'', items: legs }] });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.trip-card')), { what: '行程卡渲染完' });
  await gotoTab(page, 'trips');

  const near = await page.evaluate(() => {
    const pane = document.getElementById('tab-trips');
    const row = pane.querySelector('.transfer-row');
    return { txt: row ? row.textContent.replace(/\s+/g, ' ').trim() : null,
             hasEta: pane.textContent.includes('预计') };
  });
  ok('24 小时内的航班会显示「预计」', near.hasEta === true, near);
  // 计划：7:00 到、9:00 走 = 2 小时；预计到 7:26 → 1 小时 34 分
  ok('转机跟着显示出来的预计走 = 1 小时 34 分（不是按计划的 2 小时）',
     !!near.txt && near.txt.includes('1 小时 34 分'), near.txt);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景十二：航站楼不能只印一个光秃秃的数字 ----------
// 2026-08-28 用户：「行程里显示 KTI 1 2 槟城这些，1 是什么东西」——接口给的
// terminal 常常就是 "1"，之前原样塞进备注/航班卡，行程里就多出一个没头没尾的数字。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const withTerminal = [{
    id:'t', title:{zh:'带航站楼的航班',en:''}, start:'2026-09-01', end:'2026-09-01',
    location:{zh:'',en:''}, guideUrl:'',
    items: [
      (() => { const it = flightItem('2026-09-01','16:30','KUL','KTI',
        '2026-09-01 16:30+08:00','2026-09-01 17:25+07:00');
        it.flight.live.terminal = '1'; it.flight.live.gate = 'C7'; return it; })(),
    ],
  }];
  mountRoutes(ctx, { role:'viewer', trips: withTerminal });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.trip-card')), { what: '行程卡渲染完' });
  await gotoTab(page, 'trips');

  console.log('\n[场景十二] 航站楼要写成人看得懂的');
  const gate = await page.evaluate(() => {
    const el = document.querySelector('#tab-trips .flight-info-gate');
    if(!el) return null;
    return { zh: Array.from(el.querySelectorAll('.cn')).map(e => e.textContent.trim()),
             all: el.textContent.replace(/\s+/g, ' ').trim() };
  });
  ok('航班卡上有航站楼那一行', !!gate, gate);
  ok('中文写成「1 号航站楼」，不是光秃秃一个 1',
     !!gate && gate.zh.includes('1 号航站楼'), gate);
  ok('英文写成「Terminal 1」', !!gate && gate.all.includes('Terminal 1'), gate);
  ok('登机口照旧', !!gate && gate.all.includes('C7'), gate);

  // 自动填备注那条路径（查到航班后写进 it.note）也要走同一套说法
  const note = await page.evaluate(() =>
    flightNoteFromLookup({ dep_terminal: '2', dep_gate: 'A11' }));
  ok('自动填的备注：中文是「2 号航站楼 · 登机口 A11」',
     note.zh === '2 号航站楼 · 登机口 A11', note);
  ok('自动填的备注：英文是「Terminal 2 · Gate A11」',
     note.en === 'Terminal 2 · Gate A11', note);
  // 已经带字母的别被改坏
  const t1 = await page.evaluate(() => [terminalLabel('T3','zh'), terminalLabel('T3','en'),
                                        terminalLabel('2E','zh'), terminalLabel('','zh')]);
  ok('已经写成 T3 的不会变成「T3 号航站楼」',
     JSON.stringify(t1) === JSON.stringify(['航站楼 3', 'Terminal 3', '航站楼 2E', '']), t1);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景十三：丢机票进来自动填行程 ----------
// 分工要守住：AI 只给「航班号 + 日期」，时间必须去查真接口。
// ① 选完文件 → 发出 ticketParse，且**原件不带进任何写操作**；
// ② 认出几段就建几个条目，并且每段都真的去查了 flightLookup（带的是 AI 给的号和日期）；
// ③ 查到的真时间要覆盖票面时间（这是整个设计的重点：不让 AI 报时间）；
// ④ 【对照组】查不到的那段退回票面时间，并且明确标出来没核对。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin',
    ticketParseResult: { status:'ok', title:'新加坡小旅行', start:'2026-09-23', end:'2026-09-27',
      legs: [
        { flight_no:'SQ157', date:'2026-09-23', from:'KTI', to:'SIN', dep_time:'18:55', terminal:'1' },
        { flight_no:'SQ156', date:'2026-09-27', from:'SIN', to:'KTI', dep_time:'12:25', terminal:'2' },
      ] },
    // 真接口只认得第一段，第二段查不到 —— 一次跑出「覆盖」和「退回票面」两种结果
    flightLookupFlight: { byNo: { SQ157: { no:'SQ157', date:'2026-09-23', trackId:'tk1', from:'KTI', to:'SIN',
      from_name:'Phnom Penh Techo', to_name:'Singapore Changi',
      sched_dep:'2026-09-23 19:40+07:00', sched_arr:'2026-09-23 22:45+08:00',
      dep_terminal:'3', dep_gate:'B5' } } } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-trips-section')),
    { what: '管理页渲染完' });

  console.log('\n[场景十三] 丢机票进来自动填行程');
  ok('管理页有「丢机票进来」的按钮', await page.locator('#admin-ticket-input').count() === 1);

  rec.calls.length = 0;
  await page.setInputFiles('#admin-ticket-input', {
    name: 'ticket.pdf', mimeType: 'application/pdf', buffer: Buffer.from(FOUR_PAGE_PDF_B64, 'base64'),
  });
  await until(() => rec.calls.some(c => c.action === 'ticketParse'), { what: '发出 ticketParse' });
  const tp = rec.calls.find(c => c.action === 'ticketParse');
  ok('文件是以 base64 传上去的', !!(tp.files && tp.files[0] && tp.files[0].contentBase64), Object.keys(tp || {}));
  ok('带了 mime（PDF 要让后端认得出来）', tp.files[0].mime === 'application/pdf', tp.files[0].mime);

  await until(() => page.evaluate(() => (adminTripsDraft || []).some(t => (t.items || []).length === 2)),
    { what: '两段航班都建出来' });
  await until(() => page.evaluate(() =>
    !!(document.getElementById('admin-ticket-status').textContent || '').match(/已填好/)),
    { what: '识别流程跑完' });

  const lookups = rec.calls.filter(c => c.action === 'flightLookup');
  ok('两段都去查了真接口', lookups.length === 2, lookups);
  ok('查的是 AI 给的号和日期', JSON.stringify(lookups.map(c => c.no + '|' + c.date))
     === JSON.stringify(['SQ157|2026-09-23', 'SQ156|2026-09-27']), lookups);
  ok('机票原件没有混进任何一次 flightLookup', lookups.every(c => !c.files && !c.contentBase64), lookups);

  const trip = await page.evaluate(() => adminTripsDraft[adminTripsDraft.length - 1]);
  ok('行程名用了识别出来的名字', trip.title.zh === '新加坡小旅行', trip.title);
  ok('起讫日期填好了', trip.start === '2026-09-23' && trip.end === '2026-09-27', trip);

  // ③ 第一段：查到了 → 时间用真数据 19:40，不是票面的 18:55
  ok('查到的那段用真接口的时间（19:40），不是票面的 18:55',
     trip.items[0].time === '19:40', trip.items[0]);
  ok('查到的那段标题换成真接口的机场名', trip.items[0].title.zh.includes('金边德崇'), trip.items[0].title);
  ok('查到的那段备注是真数据的航站楼 3 ＋ 登机口，不带「票面」字样',
     trip.items[0].note.zh.includes('3 号航站楼') && trip.items[0].note.zh.includes('B5')
     && !trip.items[0].note.zh.includes('票面'), trip.items[0].note);
  ok('查到的那段没有 unresolved 标记', !trip.items[0].flight.unresolved, trip.items[0].flight);

  // ④ 第二段：查不到 → 退回票面时间，并且标明没核对
  ok('查不到的那段退回票面时间 12:25', trip.items[1].time === '12:25', trip.items[1]);
  ok('查不到的那段备注保留票面航站楼且注明「票面」',
     trip.items[1].note.zh.includes('2 号航站楼') && trip.items[1].note.zh.includes('票面'),
     trip.items[1].note);
  ok('查不到的那段带 unresolved 标记（界面上会显眼提示）',
     trip.items[1].flight.unresolved === true, trip.items[1].flight);

  const status = await page.locator('#admin-ticket-status').innerText();
  ok('状态栏说清楚有几段没核对', /1 段航班没查到/.test(status), status);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}
// ---------- 场景十三之对照组：viewer 身上不能有这个入口 ----------
// 机票识别会花 AI 额度、而且是写行程的前半段——老板不该有。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.trip-card, .empty-card')),
    { what: 'viewer 首屏渲染完' });
  ok('viewer：DOM 里没有机票上传的入口', await page.locator('#admin-ticket-input').count() === 0);
  await ctx.close();
}

// ---------- 场景十五：条目没填日期，必须当场看得见 ----------
// 2026-08-29 收工体检时在真实数据里逮到两条没日期的条目（「出发机场」「金边家里出发」）。
// 后果不是显示难看，是**老板的「今日」分页永远不会显示它们**——那一页是按 it.date
// 抓当天条目的。成因：日期框收在「更多」里默认收起，空着又不报警，填的人看不见。
// 这一节守「空日期要报警＋自动展开」，并带**对照组**（日期正常的条目不能误报，
// 否则警告到处都是等于没有警告）。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const noDateTrips = [{
    id: 't1', title: { zh: '测试行程', en: '' }, start: '2026-09-01', end: '2026-09-03',
    location: { zh: '', en: '' },
    items: [
      { date: '', time: '10:30', title: { zh: '出发机场', en: '' }, note: { zh: '', en: '' }, mapUrl: '' },
      { date: '2026-09-01', time: '13:30', title: { zh: '午餐', en: '' }, note: { zh: '', en: '' }, mapUrl: '' },
    ],
  }];
  const rec = mountRoutes(ctx, { role: 'admin', trips: noDateTrips });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await page.evaluate(() => adminExpandTrip(0));
  await until(async () => (await page.locator('#admin-item-0-0-date').count()) === 1,
    { what: '条目表单出现' });

  console.log('\n【没填日期的条目】');
  const noDate = await page.evaluate(() => {
    const warn = document.getElementById('admin-item-0-0-warn');
    const more = document.getElementById('admin-item-0-0-more');
    return {
      warnShown: warn && warn.style.display !== 'none',
      warnTxt: warn ? (warn.textContent || '').trim() : '',
      moreOpen: !!(more && more.open),
      badge: more ? ((more.querySelector('.admin-more-badge') || {}).textContent || '').trim() : '',
    };
  });
  ok('空日期：警告是显示出来的', noDate.warnShown, noDate);
  ok('空日期：警告说清楚后果——不会出现在「今日」', /今日/.test(noDate.warnTxt), noDate.warnTxt);
  ok('空日期：「更多」自动展开，日期框不再藏着', noDate.moreOpen, noDate);
  ok('空日期：折叠条上有 ⚠️ 提示', noDate.badge.includes('⚠️'), noDate.badge);

  console.log('\n【最后一道闸：没日期的条目不许存出去】');
  await page.click('button[onclick="adminSaveTripsForm()"]');
  await until(() => page.evaluate(() => {
    const el = document.getElementById('admin-trips-form-status');
    return !!el && el.className.includes('err');
  }), { what: '保存被拦下并报错' });
  const saveErr = await page.locator('#admin-trips-form-status').textContent();
  ok('保存被拦下，而且点名是哪一条没日期', /出发机场/.test(saveErr) && /日期/.test(saveErr), saveErr);
  ok('拦下时一次请求都没发出去', rec.calls.every(c => c.action !== 'tripsSave'), rec.calls.map(c => c.action));

  console.log('\n【对照组：日期正常的条目不能误报】');
  const good = await page.evaluate(() => {
    const warn = document.getElementById('admin-item-0-1-warn');
    const more = document.getElementById('admin-item-0-1-more');
    return {
      warnShown: warn && warn.style.display !== 'none',
      moreOpen: !!(more && more.open),
      badge: more ? ((more.querySelector('.admin-more-badge') || {}).textContent || '').trim() : '',
    };
  });
  ok('日期正常：不报警', good.warnShown === false, good);
  ok('日期正常：「更多」保持收起（没别的内容就别打扰）', good.moreOpen === false, good);
  ok('日期正常：没有 ⚠️ 徽章', !good.badge.includes('⚠️'), good.badge);

  console.log('\n【把日期填上，警告要自己消失】');
  await page.fill('#admin-item-0-0-date', '2026-09-01');
  await page.locator('#admin-item-0-0-date').dispatchEvent('change');
  await until(() => page.evaluate(() => {
    const w = document.getElementById('admin-item-0-0-warn');
    return !!w && w.style.display === 'none';
  }), { what: '填上日期后警告消失' });
  ok('填上日期后警告消失', true);
  ok('填上的日期真的写进了数据', await page.evaluate(() => adminTripsDraft[0].items[0].date) === '2026-09-01');

  console.log('\n【超范围仍然只是提示，不能被空日期那条盖掉】');
  await page.fill('#admin-item-0-0-date', '2026-08-30');
  await page.locator('#admin-item-0-0-date').dispatchEvent('change');
  await until(() => page.evaluate(() => {
    const w = document.getElementById('admin-item-0-0-warn');
    return !!w && w.style.display !== 'none' && /范围/.test(w.textContent || '');
  }), { what: '出现「不在行程范围内」提示' });
  ok('日期早于行程起点：显示的是「不在行程范围内」，不是「没填日期」', true);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景十六：填行程要好填——按天分组 ＋ 报错能点着跳过去 ----------
// 2026-08-29 用户：「我每次填 4-5 个以上都会搞混」「有什么填了显示警告的地方，
// 直接跳转去那个错误的地方能吗」。条目长得一模一样是串行的根源，报错只报「某某
// 没填」而不带人过去，等于把找的活儿丢回给他。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const manyTrips = [{
    id: 't1', title: { zh: '多条目行程', en: '' }, start: '2026-09-01', end: '2026-09-03',
    location: { zh: '', en: '' },
    items: [
      { date: '2026-09-01', time: '10:30', title: { zh: '出发机场', en: '' }, note: { zh: '', en: '' }, mapUrl: '' },
      { date: '2026-09-01', time: '13:30', title: { zh: '午餐', en: '' }, note: { zh: '', en: '' }, mapUrl: '' },
      { date: '2026-09-02', time: '09:00', title: { zh: '开会', en: '' }, note: { zh: '', en: '' }, mapUrl: '' },
      { date: '2026-09-02', time: '19:00', title: { zh: '晚餐', en: '' }, note: { zh: '', en: '' }, mapUrl: '' },
      { date: '', time: '08:00', title: { zh: '回程', en: '' }, note: { zh: '', en: '' }, mapUrl: '' },
    ],
  }];
  const rec = mountRoutes(ctx, { role: 'admin', trips: manyTrips });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await page.evaluate(() => adminExpandTrip(0));
  await until(async () => (await page.locator('#admin-item-0-0-time').count()) === 1,
    { what: '条目表单出现' });

  console.log('\n【按天分组：5 个条目不再糊成一片】');
  const hdrs = await page.locator('.admin-day-hdr').allTextContents();
  const clean = hdrs.map(t => t.replace(/\s+/g, ' ').trim());
  ok('两个不同日期各有一条分隔条，没日期的也单独一组', clean.length === 3, clean);
  // 没日期的排在最前面（空字符串排序在前）——正好也是该先处理的那一组，不改。
  ok('没日期的那组排在最前面且明确写「还没填日期」', /还没填日期/.test(clean[0]), clean[0]);
  ok('接着是 9 月 1 日并标「第 1 天」',
     /9月1日/.test(clean[1]) && /第 1 天/.test(clean[1]), clean[1]);
  ok('再来是 9 月 2 日并标「第 2 天」',
     /9月2日/.test(clean[2]) && /第 2 天/.test(clean[2]), clean[2]);
  ok('没日期那组的分隔条是警示样式（不是普通灰条）',
     await page.locator('.admin-day-hdr-warn').count() === 1);
  // 对照组：分隔条只是显示，不能把条目弄丢
  ok('5 个条目一个都没少', await page.locator('.admin-item-wrap').count() === 5);

  console.log('\n【保存被拦下：错误是可以点的，点了直接送到那一格】');
  await page.click('button[onclick="adminSaveTripsForm()"]');
  await until(async () => (await page.locator('.admin-err-item').count()) > 0,
    { what: '错误列表出现' });
  const errItems = await page.locator('.admin-err-item').allTextContents();
  ok('错误列表渲染成可点的按钮，不是一行纯文字', errItems.length === 1, errItems);
  ok('错误点名是哪一条（「回程」）', /回程/.test(errItems[0]), errItems[0]);
  ok('拦下时一次 tripsSave 都没发', rec.calls.every(c => c.action !== 'tripsSave'),
     rec.calls.map(c => c.action));

  // 报错后应该已经自动跳到第一个问题：该条目的「更多」被打开、日期框拿到焦点
  const jumped = await page.evaluate(() => ({
    moreOpen: !!(document.getElementById('admin-item-0-4-more') || {}).open,
    focused: document.activeElement ? document.activeElement.id : null,
    flashed: !!(document.getElementById('admin-item-0-4-date') || {}).classList
             && document.getElementById('admin-item-0-4-date').classList.contains('admin-jump-flash'),
  }));
  ok('自动展开了出问题那条的「更多」', jumped.moreOpen, jumped);
  ok('焦点落在出问题的那个日期框上', jumped.focused === 'admin-item-0-4-date', jumped);
  ok('那一格闪了一下（手机上不给记号就找不到）', jumped.flashed, jumped);

  console.log('\n【条目上那条 ⚠️ 警告本身也能点】');
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  await page.click('#admin-item-0-4-warn');
  const afterWarnClick = await page.evaluate(() => document.activeElement ? document.activeElement.id : null);
  ok('点警告直接跳到该条目的日期框', afterWarnClick === 'admin-item-0-4-date', afterWarnClick);

  console.log('\n【修好之后就能存出去了】');
  await page.fill('#admin-item-0-4-date', '2026-09-03');
  await page.locator('#admin-item-0-4-date').dispatchEvent('change');
  rec.calls.length = 0;
  await page.click('button[onclick="adminSaveTripsForm()"]');
  await until(() => rec.calls.some(c => c.action === 'tripsSave'), { what: '发出 tripsSave 请求' });
  ok('补上日期后保存放行', true);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景十七：iPhone 上还没「加到主屏」时，不能一片空白 ----------
// iOS Safari 里 window.PushManager 根本不存在 → pushSupported() 为 false →
// 上一版直接把整条提示移除，老板打开 Safari 什么都看不到，也就永远不知道
// 要先加到主屏。这一节验「认出这种情况并给出唯一有用的下一步」。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  // 假扮 iPhone Safari（未安装）：拿掉 PushManager，改 userAgent
  await page.addInitScript(() => {
    try{ delete window.PushManager; }catch(e){ window.PushManager = undefined; }
    Object.defineProperty(navigator, 'userAgent', {
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
    });
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !!document.getElementById('pushBar')),
    { what: 'iPhone 未安装时仍然出现提示条' });
  const barTxt = (await page.locator('#pushBar').innerText()).replace(/\s+/g, ' ');
  ok('iPhone 未安装：提示条没有被整条抹掉', barTxt.length > 0, barTxt);
  ok('说清楚要做什么：加到主屏幕', /主屏/.test(barTxt), barTxt);
  ok('给了具体路径「分享」', /分享/.test(barTxt), barTxt);
  ok('还带一条安装说明链接', await page.locator('#pushBar a[href="install.html"]').count() === 1);
  // 关键对照：这个环境里点开关必定失败，所以开关按钮**不能**出现
  ok('不给会失败的「开启通知」按钮', await page.locator('#pushToggleBtn').count() === 0);
  ok('× 还在，老板嫌烦可以关掉', await page.locator('#pushBar .push-dismiss').count() === 1);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}
// ---------- 场景十七之对照组：不是 iOS 又确实不支持推送 → 一条都不该冒出来 ----------
// 没有这个对照组的话，「什么环境都挂一条提示」也会显示通过。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.addInitScript(() => {
    try{ delete window.PushManager; }catch(e){ window.PushManager = undefined; }
    Object.defineProperty(navigator, 'userAgent', {
      get: () => 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    });
  });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !!document.querySelector('.trip-card, .empty-card')),
    { what: '首屏渲染完' });
  ok('非 iOS 且不支持推送：一条提示都不冒出来', await page.locator('#pushBar').count() === 0);
  await ctx.close();
}

// ---------- 场景十八：牙医小卡 ----------
// 老板真正会问的只有一句「上次什么时候看的，该不该约了」。这一节验它答得对，
// 并且**没有记录时整张卡不出现**（不给他一张写着「暂无」的空卡占版面）。
// 「多久以前」按自然月算：7月13日 → 8月29日 是「1 个月 16 天」，
// 用「除以 30 天」会说成 17 天，老板拿日历一对就发现对不上。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  // 时间钉死，否则「几个月前」会随着跑自检的日子变。
  await ctx.addInitScript(() => {
    // 用正午定死：取 UTC 边缘的时刻（比如 +07:00 的凌晨 4 点）会让浏览器按自己的
    // 时区算成前一天，「几个月前」就差一天——差的是测试的假设，不是被测的算法。
    const FIXED = Date.parse('2026-08-29T12:00:00Z');
    const _D = Date;
    // eslint-disable-next-line no-global-assign
    Date = class extends _D {
      constructor(...a){ if(a.length === 0) super(FIXED); else super(...a); }
      static now(){ return FIXED; }
    };
  });
  mountRoutes(ctx, { role: 'viewer', dental: { lastVisit: '2026-07-13', nextVisit: null, intervalMonths: 3, note: '' } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(async () => (await page.locator('.dental-card').count()) === 1,
    { what: '牙医小卡出现在今日页' });

  const cardCn = (await page.locator('.dental-card .cn').allTextContents()).join(' ').replace(/\s+/g, ' ');
  console.log('\n【牙医小卡：上次就诊】');
  ok('写出上次就诊的日期', /7月13日/.test(cardCn), cardCn);
  ok('按自然月算「多久以前」＝1 个月 16 天（不是除以 30 得出的 17 天）',
     /1 个月 16 天前/.test(cardCn), cardCn);
  ok('没约下次时明说「还没约」', /还没约/.test(cardCn), cardCn);
  ok('按他的复诊间隔（三个月）给参考日期＝10月13日，并写明这是建议不是已约',
     /每 3 个月一次/.test(cardCn) && /2026年10月13日/.test(cardCn), cardCn);
  ok('三个月的间隔不会被写死成半年', !/2027年1月13日/.test(cardCn), cardCn);
  ok('还没到期就不说「该约了」', !/该约了/.test(cardCn), cardCn);
  ok('牙医卡在今日页上，不是另开一个分页',
     await page.locator('#tab-today .dental-card').count() === 1);
  ok('老板身上没有任何牙医的写操作控件', await page.locator('#admin-dental-last').count() === 0);
  await ctx.close();
}
// ---------- 场景十八之对照组一：没有任何记录 → 整张卡不出现 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer', dental: { lastVisit: null, nextVisit: null, note: '' } });
  const page = await ctx.newPage();
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('#tab-today .empty-card, #tab-today .sec-hdr')),
    { what: '今日页渲染完' });
  ok('没有任何牙医记录时，整张卡不画出来', await page.locator('.dental-card').count() === 0);
  await ctx.close();
}
// ---------- 场景十八之对照组二：已经约好下次 → 显示预约日，不再劝他去约 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer',
    dental: { lastVisit: '2026-07-13', nextVisit: '2026-09-20', intervalMonths: 3, note: '补牙第二次' } });
  const page = await ctx.newPage();
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(async () => (await page.locator('.dental-card').count()) === 1, { what: '牙医小卡出现' });
  const cardCn = (await page.locator('.dental-card .cn').allTextContents()).join(' ').replace(/\s+/g, ' ');
  const cardAll = (await page.locator('.dental-card').innerText()).replace(/\s+/g, ' ');
  console.log('\n【对照组：已经约好下次】');
  ok('显示下次预约的日期', /9月20日/.test(cardCn), cardCn);
  ok('已经约好了就不再说「还没约」', !/还没约/.test(cardCn), cardCn);
  ok('也不再显示那句「每 N 个月一次」的建议', !/个月一次/.test(cardCn), cardCn);
  ok('备注显示出来了', /补牙第二次/.test(cardAll), cardAll);
  await ctx.close();
}
// ---------- 场景十八之对照组三：admin 能改，而且改错日期会被拦 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin',
    dental: { lastVisit: '2026-07-13', nextVisit: null, intervalMonths: 3, note: '' } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await until(async () => (await page.locator('#admin-dental-last').count()) === 1,
    { what: '牙医表单出现在管理页' });

  console.log('\n【对照组：管理页】');
  ok('管理页带出已存的上次就诊日期',
     await page.locator('#admin-dental-last').inputValue() === '2026-07-13');

  // 下次早于上次 → 拦下，且不发请求
  rec.calls.length = 0;
  await page.fill('#admin-dental-next', '2026-07-01');
  await page.click('button[onclick="adminSaveDental()"]');
  await until(() => page.evaluate(() => {
    const el = document.getElementById('admin-dental-status');
    return !!el && el.className.includes('err');
  }), { what: '颠倒的日期被拦下' });
  ok('下次早于上次会被拦下', true);
  ok('拦下时一个请求都没发', rec.calls.every(c => c.action !== 'dentalSave'),
     rec.calls.map(c => c.action));

  // 正常保存
  await page.fill('#admin-dental-next', '2026-09-20');
  await page.fill('#admin-dental-note', '补牙第二次');
  await page.click('button[onclick="adminSaveDental()"]');
  await until(() => rec.calls.some(c => c.action === 'dentalSave'), { what: '发出 dentalSave 请求' });
  const saved = rec.calls.find(c => c.action === 'dentalSave');
  ok('送出的字段形状对得上后端合约（含复诊间隔）',
     saved.lastVisit === '2026-07-13' && saved.nextVisit === '2026-09-20'
     && saved.intervalMonths === 3 && saved.note === '补牙第二次', saved);
  // 上面那次保存成功后会 refreshFeed()、整块重建管理页——必须等「已保存」出现
  // （它是重建之后才写的）再往下填，否则 fill 的值会被重建冲掉，后面的断言就假红。
  await until(() => page.evaluate(() => {
    const el = document.getElementById('admin-dental-status');
    return !!el && el.className.includes('ok');
  }), { what: '保存完成、管理页重建完毕' });

  console.log('\n【对照组：复诊间隔可改，越界会被拦下】');
  ok('管理页带出复诊间隔 3',
     await page.locator('#admin-dental-interval').inputValue() === '3');
  rec.calls.length = 0;
  await page.fill('#admin-dental-interval', '0');
  await page.click('button[onclick="adminSaveDental()"]');
  await until(() => page.evaluate(() => {
    const el = document.getElementById('admin-dental-status');
    return !!el && el.className.includes('err') && /1/.test(el.textContent || '');
  }), { what: '越界的间隔被拦下' });
  ok('间隔填 0 被拦下', true);
  ok('拦下时一个请求都没发', rec.calls.every(c => c.action !== 'dentalSave'),
     rec.calls.map(c => c.action));
  await page.fill('#admin-dental-interval', '6');
  await page.click('button[onclick="adminSaveDental()"]');
  await until(() => rec.calls.some(c => c.action === 'dentalSave'), { what: '改成 6 个月存出去' });
  ok('改成 6 个月照样能存', rec.calls.find(c => c.action === 'dentalSave').intervalMonths === 6,
     rec.calls.find(c => c.action === 'dentalSave'));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}
// ---------- 场景十八之对照组四：间隔到了还没约 → 明说「该约了」并标红 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  await ctx.addInitScript(() => {
    const FIXED = Date.parse('2026-08-29T12:00:00Z');
    const _D = Date;
    // eslint-disable-next-line no-global-assign
    Date = class extends _D {
      constructor(...a){ if(a.length === 0) super(FIXED); else super(...a); }
      static now(){ return FIXED; }
    };
  });
  // 三个月前的 5 月 1 日看的，到 8 月 1 日就该约了——今天已经过期近一个月
  mountRoutes(ctx, { role: 'viewer',
    dental: { lastVisit: '2026-05-01', nextVisit: null, intervalMonths: 3, note: '' } });
  const page = await ctx.newPage();
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(async () => (await page.locator('.dental-card').count()) === 1, { what: '牙医小卡出现' });
  const cardCn = (await page.locator('.dental-card .cn').allTextContents()).join(' ').replace(/\s+/g, ' ');
  console.log('\n【对照组：该约了】');
  ok('过期了就明说「该约了」，不再是温吞的「还没约」',
     /该约了/.test(cardCn) && !/还没约/.test(cardCn), cardCn);
  ok('参考日期是 8 月 1 日（5月1日 + 3 个月）', /2026年8月1日/.test(cardCn), cardCn);
  ok('那一行标了红（dental-overdue）', await page.locator('.dental-overdue').count() === 1);
  await ctx.close();
}

// ---------- 场景十九：交接给老板时，红点要全部重新亮起来 ----------
// 2026-08-29 用户：「把他的那一版改成全未读」。老板那台机器试用时已经把红点点掉了，
// 交接时他一进来会以为里面没东西。做法是给已读记号加一个版号（SEEN_EPOCH），
// 版号一改，所有设备的已读状态作废一次。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  // 装一份「旧版号」的已读记号：三个分页全标成已读，而且时间比服务端还新
  await page.addInitScript(t => {
    localStorage.setItem('bossApp_token', t);
    localStorage.setItem('bossApp_seen', JSON.stringify({
      __epoch: '2020-01-01', trips: '2099-01-01T00:00:00.000Z',
      bills: '2099-01-01T00:00:00.000Z', inventory: '2099-01-01T00:00:00.000Z',
    }));
  }, GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !!document.querySelector('.trip-card, .empty-card')),
    { what: '首屏渲染完' });

  console.log('\n【红点重置】');
  ok('旧版号的已读记号一律作废，三个分页全部重新变成未读',
     await page.locator('.nav-btn.has-dot').count() === 3);

  // 双向验证，都在同一页里做——「更新时间」在打桩接口里每次请求都是当下，
  // 所以不能靠「重开一次」来验已读，只能拿页面自己那份 feedData 的时间来比。
  const both = await page.evaluate(() => {
    const u = feedData.updated;
    saveSeen({ trips: u.trips, bills: u.bills, inventory: u.inventory }); // 会带上当前版号
    updateDots();
    const afterRead = document.querySelectorAll('.nav-btn.has-dot').length;
    const stored = JSON.parse(localStorage.getItem('bossApp_seen') || '{}');
    // 把版号改旧，模拟「下一次交接又要重置」
    localStorage.setItem('bossApp_seen',
      JSON.stringify(Object.assign({}, stored, { __epoch: '2020-01-01' })));
    updateDots();
    return { afterRead, afterEpochChange: document.querySelectorAll('.nav-btn.has-dot').length,
             epoch: stored.__epoch || null };
  });
  // 对照组：没有这一条的话，「loadSeen 永远返回 {}」也能让上面那条变绿——
  // 那样红点就永远消不掉，等于天天在喊狼来了。
  ok('版号对得上时，已读还是已读（红点消得掉）', both.afterRead === 0, both);
  ok('版号一改，三个红点立刻全部重新亮起来', both.afterEpochChange === 3, both);
  ok('写回去的是当前版号，不是那个旧的', both.epoch && both.epoch !== '2020-01-01', both);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十：丢酒店确认单进来也能建行程 ----------
// 2026-08-29 用户：「丢酒店 check in voucher 也能识别」。
// 两条不许破的规矩在这里各有断言：
//   ① 时间不猜——单子没写入住时间就空着，绝不按常识填 15:00（填错了他会吃闭门羹）
//   ② 提到地点必须带地图链接（本仓库硬规矩）
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin', ticketParseResult: {
    status: 'ok', title: '新加坡小旅行', start: '2026-09-23', end: '2026-09-27',
    legs: [],
    stays: [
      { name: 'Marina Bay Sands', address: '10 Bayfront Ave, Singapore',
        check_in: '2026-09-23', check_out: '2026-09-27',
        check_in_time: '15:00', check_out_time: null,
        confirmation: 'ABC12345', room: 'Deluxe King' },
    ],
  } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await page.setInputFiles('#admin-ticket-input', {
    name: 'hotel.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake voucher'),
  });
  await until(() => page.evaluate(() =>
    adminTripsDraft && adminTripsDraft.length && adminTripsDraft[adminTripsDraft.length-1].items.length >= 2),
    { what: '酒店建出入住/退房两条' });

  const trip = await page.evaluate(() => adminTripsDraft[adminTripsDraft.length - 1]);
  console.log('\n【酒店确认单】');
  ok('一段住宿建出「入住」「退房」两条', trip.items.length === 2, trip.items.map(i => i.title.zh));
  const ci = trip.items.find(i => /入住/.test(i.title.zh)) || {};
  const co = trip.items.find(i => /退房/.test(i.title.zh)) || {};
  ok('入住那条日期是入住日', ci.date === '2026-09-23', ci);
  ok('退房那条日期是退房日', co.date === '2026-09-27', co);
  ok('标题带上酒店名', /Marina Bay Sands/.test(ci.title.zh), ci.title);
  ok('单子写了入住时间就用它', ci.time === '15:00', ci);
  // ① 不猜：单子没写退房时间 → 留空，而不是自作主张填 12:00
  ok('单子没写退房时间就留空，不按常识填 12:00', co.time === '', co);
  // ② 地图链接（仓库硬规矩）
  ok('入住那条带 Google 地图链接',
     /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/.test(ci.mapUrl || ''), ci.mapUrl);
  ok('地图链接里带了酒店名和地址', /Marina/.test(decodeURIComponent(ci.mapUrl || ''))
     && /Bayfront/.test(decodeURIComponent(ci.mapUrl || '')), ci.mapUrl);
  ok('退房那条也带地图链接（他退房当天可能还要回去拿行李）', !!co.mapUrl, co.mapUrl);
  ok('确认号和房型放进备注（前台要用）',
     /ABC12345/.test(ci.note.zh) && /Deluxe King/.test(ci.note.zh), ci.note);
  ok('行程起讫按住宿算', trip.start === '2026-09-23' && trip.end === '2026-09-27', trip);
  // 没有航班就不该去打航班接口——那要花 AeroDataBox 额度
  ok('纯酒店单不去查航班接口（省额度）',
     rec.calls.every(c => c.action !== 'flightLookup'), rec.calls.map(c => c.action));
  const status = await page.locator('#admin-ticket-status').innerText();
  ok('状态栏点明「没写时间的有几条，要自己补」', /没写时间/.test(status), status);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}
// ---------- 场景二十之对照组：机票＋酒店混在一起时，两边都要建出来 ----------
// 只验纯酒店的话，「把航班那段代码删了」也能绿。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin', ticketParseResult: {
    status: 'ok', title: '混合行程', start: '2026-09-23', end: '2026-09-27',
    legs: [{ flight_no: 'SQ157', date: '2026-09-23', from: 'KTI', to: 'SIN', dep_time: '18:55', terminal: '3' }],
    stays: [{ name: '樟宜酒店', address: null, check_in: '2026-09-23', check_out: '2026-09-25',
              check_in_time: null, check_out_time: null, confirmation: null, room: null }],
  } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await page.setInputFiles('#admin-ticket-input', {
    name: 'both.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake'),
  });
  await until(() => page.evaluate(() =>
    adminTripsDraft && adminTripsDraft.length && adminTripsDraft[adminTripsDraft.length-1].items.length >= 3),
    { what: '航班＋住宿都建出来' });
  const trip = await page.evaluate(() => adminTripsDraft[adminTripsDraft.length - 1]);
  console.log('\n【对照组：机票＋酒店混在一起】');
  ok('航班那条还在', trip.items.some(i => i.flight && i.flight.no === 'SQ157'), trip.items);
  ok('住宿也建出来了', trip.items.some(i => /入住 樟宜酒店/.test(i.title.zh)), trip.items.map(i => i.title.zh));
  ok('航班那条排在数组前面（查真数据是按下标走的，不能被住宿挤掉）',
     trip.items[0].flight && trip.items[0].flight.no === 'SQ157', trip.items[0]);
  ok('有航班就照样去查真接口', rec.calls.some(c => c.action === 'flightLookup'),
     rec.calls.map(c => c.action));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十一：行程管理里的行程卡按日期排 ----------
// 2026-08-30 用户：「行程管理里能按照日期顺序排列吗」。以前是按存进去的顺序排，
// 存的时候什么样就什么样。条目在卡片里早就排好了，卡片本身没排。
//
// 这一节最要紧的不是顺序本身，而是**下标不能跟着动**：adminExpandedTrip、
// data-trip、flightLookupState 全按下标寻址，真去 sort 数组会变成「点开甲、改到乙」。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  await ctx.addInitScript(() => {
    const FIXED = Date.parse('2026-09-05T12:00:00Z');   // 让「过去/未来」有确定答案
    const _D = Date;
    // eslint-disable-next-line no-global-assign
    Date = class extends _D {
      constructor(...a){ if(a.length === 0) super(FIXED); else super(...a); }
      static now(){ return FIXED; }
    };
  });
  // 刻意打乱：存进去的顺序跟日期顺序完全不一样
  const messy = [
    { id:'a', title:{zh:'十月槟城',en:''}, start:'2026-10-09', end:'2026-10-17', location:{zh:'',en:''}, items:[] },
    { id:'b', title:{zh:'七月旧行程',en:''}, start:'2026-07-01', end:'2026-07-05', location:{zh:'',en:''}, items:[] },
    { id:'c', title:{zh:'九月新加坡',en:''}, start:'2026-09-23', end:'2026-09-27', location:{zh:'',en:''}, items:[] },
    { id:'d', title:{zh:'还没填日期',en:''}, start:'', end:'', location:{zh:'',en:''}, items:[] },
    { id:'e', title:{zh:'八月旧行程',en:''}, start:'2026-08-24', end:'2026-08-27', location:{zh:'',en:''}, items:[] },
  ];
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  mountRoutes(ctx, { role: 'admin', trips: messy });
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await until(async () => (await page.locator('#admin-trips-list .admin-trip-summary, #admin-trips-list .admin-trip-card').count()) >= 5,
    { what: '五张行程卡都渲染出来' });

  console.log('\n【行程管理：按日期排】');
  // 直接按卡片顺序取标题：卡片是 pick() 出来的纯文字，不是 bl() 的双语 span
  const names = await page.evaluate(() => {
    const titles = ['十月槟城','七月旧行程','九月新加坡','还没填日期','八月旧行程'];
    return Array.from(document.querySelectorAll('#admin-trips-list .admin-trip-summary'))
      .map(el => titles.find(t => el.textContent.includes(t)) || '(认不出)');
  });
  ok('没填日期的排最前（多半正在填）', names[0] === '还没填日期', names);
  ok('未来的按近到远：九月新加坡在十月槟城前面',
     names.indexOf('九月新加坡') < names.indexOf('十月槟城'), names);
  ok('已经结束的垫在未来行程后面',
     names.indexOf('十月槟城') < names.indexOf('八月旧行程'), names);
  ok('过去的按新到旧：八月在七月前面',
     names.indexOf('八月旧行程') < names.indexOf('七月旧行程'), names);
  ok('确实跟存进去的顺序不一样（否则这一节等于没验）',
     JSON.stringify(names) !== JSON.stringify(['十月槟城','七月旧行程','九月新加坡','还没填日期','八月旧行程']),
     names);

  // 关键对照：显示顺序变了，**数据下标不能跟着变**
  console.log('\n【对照组：只换显示顺序，下标一个都不许动】');
  const draftOrder = await page.evaluate(() => adminTripsDraft.map(t => t.title.zh));
  ok('底层数组顺序原封不动',
     JSON.stringify(draftOrder) === JSON.stringify(['十月槟城','七月旧行程','九月新加坡','还没填日期','八月旧行程']),
     draftOrder);
  // 点开显示在最前面的那张（「还没填日期」＝原数组下标 3），改个名字，看改到谁头上
  const firstCardIdx = await page.evaluate(() => {
    const btn = document.querySelector('#admin-trips-list [onclick^="adminExpandTrip("]');
    return btn ? Number(btn.getAttribute('onclick').match(/adminExpandTrip\((\d+)\)/)[1]) : null;
  });
  ok('第一张卡挂的是它在原数组里的下标 3，不是显示位置 0', firstCardIdx === 3, firstCardIdx);
  await page.evaluate(() => adminExpandTrip(3));
  await until(async () => (await page.locator('input[data-trip="3"][data-field="title.zh"]').count()) === 1,
    { what: '展开的是原下标 3 那一张' });
  await page.fill('input[data-trip="3"][data-field="title.zh"]', '改到我了吗');
  const after = await page.evaluate(() => adminTripsDraft.map(t => t.title.zh));
  ok('改的是「还没填日期」那一趟，没改到别人头上',
     after[3] === '改到我了吗' && after[0] === '十月槟城' && after[2] === '九月新加坡', after);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十二：管理页要看得出「哪几份老板已经看了」 ----------
// 2026-08-30 用户：「老板已读的账单PDF管理这边能显示吗？方便我删」。
// readAt 由后端在老板打开账单那一刻写进 bills.json（不是老板 App 上报的，
// viewer 依旧没有任何写入接口）。这里验前端有没有把它显示出来。
{
  const twoBills = [
    { id:'b1', title:{zh:'8月账单',en:''}, period:'2026-08', uploadedAt:'2026-08-01T00:00:00Z',
      kind:'month', filename:'aug.pdf', readAt:'2026-08-30T06:30:00Z' },
    { id:'b2', title:{zh:'9月账单',en:''}, period:'2026-09', uploadedAt:'2026-09-01T00:00:00Z',
      kind:'month', filename:'sep.pdf' },
  ];
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin', bills: twoBills });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await until(async () => (await page.locator('.admin-bill-row').count()) === 2, { what: '两条账单都渲染出来' });

  console.log('\n【管理页：老板看了没】');
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.admin-bill-row')).map(r => ({
    text: r.textContent,
    badge: (r.querySelector('.admin-bill-read') || {}).className || '',
  })));
  const aug = rows.find(r => r.text.includes('8月账单'));
  const sep = rows.find(r => r.text.includes('9月账单'));
  ok('看过的那份标「老板已看」', !!aug && aug.text.includes('老板已看'), aug && aug.text);
  ok('看过的那份带时间，不是光一句话', !!aug && /8月30日|8\/30/.test(aug.text), aug && aug.text);
  ok('没看过的那份标「老板还没看」', !!sep && sep.text.includes('老板还没看'), sep && sep.text);
  ok('两份的标记不一样（否则等于没分辨）',
     !!aug && !!sep && aug.badge !== sep.badge, [aug && aug.badge, sep && sep.badge]);
  ok('两份都还留着删除按钮', (await page.locator('.admin-bill-del').count()) === 2);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十二之对照组：老板自己那边看不到这行字 ----------
// 「老板已看」是给 YANG 看的管理信息，不该出现在老板的账单列表里。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer', bills: [
    { id:'b1', title:{zh:'8月账单',en:''}, period:'2026-08', uploadedAt:'2026-08-01T00:00:00Z',
      kind:'month', filename:'aug.pdf', readAt:'2026-08-30T06:30:00Z' },
  ] });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'bills');
  await until(async () => (await page.locator('.bill-row').count()) === 1, { what: '老板看到一条账单' });

  console.log('\n【对照组：老板那边不出现「已看」标记】');
  // 只看**渲染出来的**内容：document.body.textContent 会把内联 <script> 的源码
  // 也算进去，那里当然有这几个字（函数就写在那），拿它断言必定误报。
  const shown = await page.evaluate(() => {
    const parts = [];
    document.querySelectorAll('.tab, .app-header, .nav-bar').forEach(el => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('script, style').forEach(n => n.remove());
      parts.push(clone.textContent);
    });
    return parts.join(' ');
  });
  ok('账单还是照常列出来', await page.locator('.bill-row').count() === 1);
  ok('老板看不到「老板已看／还没看」', !/老板已看|老板还没看/.test(shown), shown.slice(0, 200));
  ok('页面上一个 .admin-bill-read 都没有', (await page.locator('.admin-bill-read').count()) === 0);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十三：管理页「发一条到老板手机」 ----------
// 2026-08-30：YANG 手上没有 iPhone，老板那台机器收不收得到没有别的办法验，
// 只能真发一条看推送服务怎么回。这一节验两件事：结果按设备逐台列出来（分得清
// 哪台是 iPhone），以及失效的订阅要说人话（不能只丢一个 410）。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin', pushTestResult: { status: 'ok', sent: 1, total: 2, results: [
    { who: '老板', host: 'web.push.apple.com', ok: true, httpStatus: 201, dead: false, error: null, detail: null },
    { who: 'YANG', host: 'fcm.googleapis.com', ok: false, httpStatus: 410, dead: true, error: null, detail: 'unsubscribed' },
  ] } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-trips-section')),
    { what: 'admin 管理页渲染完' });

  console.log('\n【二十三】管理页能往已登记的设备真发一条测试推送');
  ok('有「发一条到老板手机」按钮', await page.locator('#admin-push-test-btn').count() === 1);
  await gotoTab(page, 'admin');   // 按钮在管理分页里，不切过去它是隐藏的，点不到
  await page.click('#admin-push-test-btn');
  await until(async () => /iPhone|安卓/.test(await page.locator('#admin-push-test-status').innerText()),
    { what: '测试推送结果出来' });
  const txt = await page.locator('#admin-push-test-status').innerText();
  ok('逐台列出来，认得出哪台是 iPhone', /iPhone/.test(txt), txt);
  ok('也认得出安卓那台', /安卓|Android/.test(txt), txt);
  ok('成功那台写明推送服务收下了（带状态码）', /201/.test(txt), txt);
  ok('失效那台说人话，不是只丢一个 410', /失效/.test(txt) && /410/.test(txt), txt);
  ok('提醒「收下了不等于跳出来了」', /收下了不等于/.test(txt), txt);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十三的对照组：老板那边没有这颗按钮 ----------
// 没有对照组的话，这颗按钮哪天漏进 viewer 的 DOM 也不会有人发现——
// 它打的是 admin-only 的 pushTest，老板点了只会 403，但控件本身就不该存在。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.nav-btn')), { what: '老板那边渲染完' });

  console.log('\n【对照组：老板那边没有「发一条到老板手机」】');
  ok('老板看不到这颗按钮', await page.locator('#admin-push-test-btn').count() === 0);
  ok('结果区也不存在', await page.locator('#admin-push-test-status').count() === 0);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十四：老板按掉顶上的横幅之后，仍然有地方能开通知 ----------
// 顶上那条横幅有个 ×，按了永久不再出现（记在 localStorage）——那是刻意的。
// 但只有那一个入口的话，他按完 × 就再也开不了通知，跟 2026-08-29 admin 那次
// 踩的坑一模一样。所以「今天」最底下常驻一行安静的入口，这一节守的就是它。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.nav-btn')), { what: '老板那边渲染完' });
  // 无头浏览器不是「已加到主屏」的 PWA，isStandalonePwa() 必定 false，
  // 那样只会渲染「先加到主屏」的提示，验不到开关。这两个是环境条件，打桩掉。
  await page.evaluate(() => {
    isStandalonePwa = () => true;
    pushSupported = () => true;
    pushSubscription = null;
    ensurePushUI(); renderToday();
  });

  console.log('\n【二十四】老板按掉顶上的通知横幅之后，仍然找得到地方开通知');
  ok('一开始顶上有通知横幅', await page.locator('#pushBar').count() === 1);
  ok('「今天」底下也常驻一行通知入口', await page.locator('#todayPush').count() === 1);
  ok('那一行写着还没开，并且有「开启」按钮',
     /还没开/.test(await page.locator('#todayPush').innerText()) &&
     await page.locator('#todayPushBtn').count() === 1,
     await page.locator('#todayPush').innerText());

  await page.click('.push-dismiss');
  ok('按 × 之后顶上那条真的没了（他的选择要算数）', await page.locator('#pushBar').count() === 0);
  ok('★但底下那一行还在——不然他就永远开不了通知了',
     await page.locator('#todayPush').count() === 1);
  ok('★按钮也还在，点得到', await page.locator('#todayPushBtn').count() === 1);

  // 订阅成功之后：顶上那条本来就不挂了，底下这一行是他唯一能看到状态、也是唯一
  // 能关掉的地方，所以状态必须跟着变。
  await page.evaluate(() => {
    pushSubscription = { endpoint: 'https://web.push.apple.com/x' };
    ensurePushUI();
  });
  ok('开启之后那一行变「通知已开启」',
     /已开启/.test(await page.locator('#todayPush').innerText()),
     await page.locator('#todayPush').innerText());
  ok('并且给得出「关闭」（开了之后要能关）',
     /关闭/.test(await page.locator('#todayPushBtn').innerText()));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十四的对照组：admin 那边不出现这一行 ----------
// 2026-08-28 他连着三轮反映「我去开了通知也还是看得见」——不是他要的东西就别放。
// 没有这个对照组的话，这行字哪天渗回 admin 页面也不会有人发现。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-trips-section')),
    { what: 'admin 管理页渲染完' });
  await page.evaluate(() => { isStandalonePwa = () => true; pushSupported = () => true; ensurePushUI(); renderToday(); });

  console.log('\n【对照组：YANG 自己那边不出现「今天」底下那行通知】');
  ok('admin 的「今天」底下没有那一行', await page.locator('#todayPush').count() === 0);
  ok('admin 仍然有管理页那一行开关（他的入口在那）',
     await page.locator('#admin-push-btn').count() === 1);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十五：管理页看得出「老板到底装上了没有」 ----------
// 2026-08-30 YANG 问「有什么办法知道他已经装上了吗」。三种状态必须分得开：
// 没打开过 / 打开了但还在浏览器里（**通知一定收不到**）/ 已装到主屏。
// 中间那种最容易被忽略，所以它必须带警告，不能跟「装好了」长得一样。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin',
    seen: { firstSeen: '2026-08-20T00:00:00.000Z', lastSeen: '2026-08-30T01:02:03.000Z', standalone: true } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-trips-section')),
    { what: 'admin 管理页渲染完' });

  console.log('\n【二十五】管理页看得出老板装上了没有');
  const feedCall = rec.calls.find(c => c.action === 'feed');
  ok('拉 feed 时带上了 standalone（服务端靠它判断装没装到主屏）',
     feedCall && typeof feedCall.standalone === 'boolean', feedCall);

  ok('有「老板那边」这一块', await page.locator('#admin-seen-section').count() === 1);
  let txt = await page.locator('#admin-seen-section').innerText();
  ok('写出最后一次打开的时间', /8月30日|8\/30/.test(txt), txt);
  ok('装好了就说「已装到主屏」', /已装到主屏/.test(txt), txt);
  ok('装好了就不该有警告', await page.locator('#admin-seen-section .admin-status.err').count() === 0, txt);

  // 打开了、但还在浏览器里 —— 这种最容易被当成「装好了」，必须带警告
  await page.evaluate(() => { feedData.seen = { lastSeen: '2026-08-30T01:02:03.000Z', standalone: false }; renderAdmin(); });
  txt = await page.locator('#admin-seen-section').innerText();
  ok('★没装到主屏时说清楚「还在浏览器里」', /还在浏览器里/.test(txt), txt);
  ok('★并且警告收不到通知', /收不到通知/.test(txt), txt);
  ok('警告是显眼的那一种，不是一行灰字',
     await page.locator('#admin-seen-section .admin-status.err').count() === 1);

  // 从没打开过
  await page.evaluate(() => { feedData.seen = { lastSeen: null, standalone: null }; renderAdmin(); });
  txt = await page.locator('#admin-seen-section').innerText();
  ok('从没打开过时说「还没打开过」', /还没打开过/.test(txt), txt);
  ok('★不会误报成「已装到主屏」', !/已装到主屏/.test(txt), txt);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十五的对照组：老板那边看不到这一块 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer',
    seen: { lastSeen: '2026-08-30T01:02:03.000Z', standalone: true } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.nav-btn')), { what: '老板那边渲染完' });

  console.log('\n【对照组：老板看不到「老板那边」这一块】');
  ok('老板页面里没有这一块', await page.locator('#admin-seen-section').count() === 0);
  const shown = await page.evaluate(() => {
    const parts = [];
    document.querySelectorAll('.tab, .app-header, .nav-bar').forEach(el => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('script, style').forEach(n => n.remove());
      parts.push(clone.textContent);
    });
    return parts.join(' ');
  });
  ok('页面上也看不到「已装到主屏／还没打开过」这些字',
     !/已装到主屏|还没打开过|还在浏览器里/.test(shown), shown.slice(0, 200));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十六：今天谁请假（老板只读，有人才说话）----------
// 2026-09-02 加。同事在报账页自己登记、司机由 YANG 代录，老板这一屏只是显示。
// 两件事必须同时成立，所以对照组是「没人请假时整段不出现」——老板每天开这一屏，
// 天天挂一行「今天没有人请假」是噪音；而漏显示又会让他以为人齐了。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer', leaveToday: [
    { person: '司机 Sok', reason: '回乡', start: '2026-09-02', end: '2026-09-04' },
    { person: 'Seryi', reason: null, start: '2026-09-02', end: '2026-09-02' },
  ] });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.nav-btn')), { what: '老板那边渲染完' });

  console.log('\n【二十六】今天谁请假');
  let txt = await page.locator('#tab-today').innerText();
  ok('★今天请假的人都在', /司机 Sok/.test(txt) && /Seryi/.test(txt), txt.slice(0, 300));
  ok('有事由的把事由也写出来', /回乡/.test(txt), txt.slice(0, 300));
  ok('有「今天请假」这个抬头', /今天请假/.test(txt), txt.slice(0, 300));
  // 老板只读：这一屏不许出现任何登记/销假的控件（不是藏起来，是根本不存在）
  ok('★没有任何登记假的入口进 DOM',
     await page.locator('#modal-leave, #leave-person, [onclick*="leaveSubmit"], [onclick*="openLeaveModal"]').count() === 0);

  // 接下来两周要开始的假也要看得到——2026-09-02 用户当场发现的缺口：他 9/10 起
  // 回国一个星期，只报「今天谁没来」的话老板要到当天早上才知道。
  await page.evaluate(() => {
    feedData.leaveUpcoming = [{ person: 'Yang', reason: '回国祭拜母亲', start: '2026-09-10', end: '2026-09-17' }];
    renderToday();
  });
  txt = await page.locator('#tab-today').innerText();
  ok('★还没到的假也列出来（不用等到当天）', /Yang/.test(txt), txt.slice(0, 400));
  ok('写明是哪几天到哪几天', /9月10日/.test(txt) && /9月17日/.test(txt), txt.slice(0, 400));
  ok('分得出「今天」和「接下来」', /今天/.test(txt) && /接下来/.test(txt), txt.slice(0, 400));

  // 对照组：今天没人、但有将来的假 → 这一段仍要出现（换个抬头）
  await page.evaluate(() => { feedData.leaveToday = []; renderToday(); });
  txt = await page.locator('#tab-today').innerText();
  ok('★今天没人请假，但将来的假仍然看得到', /Yang/.test(txt) && /请假安排/.test(txt), txt.slice(0, 400));
  ok('这时候不该说「今天请假」', !/今天请假/.test(txt), txt.slice(0, 400));

  // 对照组：两边都空 → 整段不出现
  await page.evaluate(() => { feedData.leaveToday = []; feedData.leaveUpcoming = []; renderToday(); });
  txt = await page.locator('#tab-today').innerText();
  ok('★两边都没有时整段不出现（不留一行废话）', !/今天请假|请假安排/.test(txt), txt.slice(0, 300));
  ok('行程本身照常还在', await page.locator('#tab-today').count() === 1);

  // 后端老版本没有这两个字段时也不能炸
  await page.evaluate(() => { delete feedData.leaveToday; delete feedData.leaveUpcoming; renderToday(); });
  txt = await page.locator('#tab-today').innerText();
  ok('后端没给这些字段也不炸', !/今天请假|请假安排/.test(txt) && errs.length === 0, errs.slice(0, 3));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十六b：请假那张卡不许把字顶出框外 ----------
// 2026-09-02 用户实机看到：日期＋事由那一串借用了牙医卡的 .dental-k，而那个类是
// flex:none——收不了缩，长一点就直接冲出卡片。这类毛病肉眼才看得出来，除非**量**
// 真实宽度，所以这一节全部用 scrollWidth/clientWidth 和 getBoundingClientRect 判定，
// 不看文字内容。窄屏（360px，常见手机）跑，宽屏上看不出来的正是这个问题。
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer',
    leaveToday: [{ person: '司机 Sok', reason: '家里有事要回乡下一趟', start: '2026-09-02', end: '2026-09-02' }],
    leaveUpcoming: [{ person: 'Yang', reason: '回国祭拜母亲并处理房产事宜', start: '2026-09-10', end: '2026-09-17' }],
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.leave-row')), { what: '请假卡渲染完' });

  console.log('\n【二十六b】请假卡在窄屏上不许溢出');
  // 量之前先确保不会因为「某个元素不存在」而抛错——测量块崩掉的话，整份自检当场
  // 中断，看不出是哪一条不过；要的是一个干净的红灯（回退验证时确认过这件事）。
  const m = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.leave-row')];
    const card = rows.length ? rows[0].closest('.dental-card') : null;
    if(!card) return { noCard: true };
    const inner = card.getBoundingClientRect().right - parseFloat(getComputedStyle(card).paddingRight);
    let worst = -1e9, rowOverflow = 0;
    for(const row of rows){
      rowOverflow = Math.max(rowOverflow, row.scrollWidth - row.clientWidth);
      for(const el of [row, ...row.querySelectorAll('*')]){
        worst = Math.max(worst, el.getBoundingClientRect().right - inner);
      }
    }
    const meta = document.querySelector('.leave-meta');
    return {
      noCard: false,
      cardOverflow: card.scrollWidth - card.clientWidth,
      rowOverflow,
      worstRight: Math.round(worst * 10) / 10,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      metaLines: meta ? meta.getBoundingClientRect().height : 0,
    };
  });
  ok('请假卡真的画出来了（没画出来的话下面几条等于没测）', m.noCard === false, m);
  ok('★每一行自己没有横向溢出', m.rowOverflow <= 1, m);
  ok('★卡片内没有横向溢出', m.cardOverflow <= 1, m);
  ok('★每一行都没有超出卡片的内边界', m.worstRight <= 1, m);
  ok('★整页不会变成可以左右拖（溢出会把整屏拖歪）', m.pageOverflow <= 1, m);
  ok('长事由是换行而不是撑宽（第二行占得比一行高）', m.metaLines > 18, m);
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
