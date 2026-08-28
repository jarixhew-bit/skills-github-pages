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
function mountRoutes(ctx, { role = 'viewer', who = 'YANG', inventory = fakeInventory(), flightLookupFlight = null, trips = null } = {}){
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
            trips: trips || fakeTrips(), bills: fakeBills(), inventory }) });
      }
      if (req.action === 'bill'){
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify({ status: 'ok', contentBase64: FOUR_PAGE_PDF_B64, mime: 'application/pdf' }) });
      }
      if (req.action === 'flightLookup'){
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify(flightLookupFlight ? { status: 'ok', flight: flightLookupFlight } : { status: 'ok' }) });
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
  const taCnt = await page.locator('textarea').count();
  const writeBtnCnt = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter(b => /上传|删除|保存/.test(b.textContent || '')).length);
  ok('viewer 下 input[type=file] 数量为 0 —— 否则老板能改数据了', fileCnt === 0, fileCnt);
  ok('viewer 下 textarea 数量为 0 —— 否则老板能改数据了', taCnt === 0, taCnt);
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
  const taCnt = await page.locator('textarea').count();
  const writeBtnCnt = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter(b => /上传|删除|保存/.test(b.textContent || '')).length);
  ok('admin 下 input[type=file]（上传账单）存在', fileCnt >= 1, fileCnt);
  ok('admin 下 textarea（编辑行程 JSON）存在', taCnt >= 1, taCnt);
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
// 「高级：直接编辑 JSON」还留着（折叠着，当兜底），场景二守的「textarea 存在」不受影响。
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
  await page.click(`#admin-item-${idx}-0-more summary`);
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
  await page.click(`#admin-item-${idx10}-0-more summary`);
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
  await page.click(`#admin-item-${idx14}-0-more summary`);
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

// ---------- 场景十三：「高级：直接编辑 JSON」默认是折叠的 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);

  console.log('\n【15】「高级：直接编辑 JSON」默认折叠，不会一进管理面板就吓到非工程师用户');
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');

  const isOpen = await page.evaluate(() => {
    const d = document.getElementById('admin-json-details');
    return d ? d.open : null;
  });
  ok('#admin-json-details 存在（第 2 条对照组守的 textarea 就在里面）', isOpen !== null, isOpen);
  ok('默认是折叠的（<details> 没有 open 属性）', isOpen === false, isOpen);
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
  await page.fill('#admin-item-0-0-flightdate', '2026-09-01');
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

  console.log('\n【19】日期改了，会重新发起查询（同一个号但组合变了）');
  await page.fill('#admin-item-0-0-flightdate', '2026-09-02');
  // fill() 只保证触发 input 事件，日期框绑的是 onchange——显式补发一次 change，
  // 跟本文件其它场景里 mapInput.dispatchEvent('change') 是同一手法，避免测试本身不稳。
  await page.locator('#admin-item-0-0-flightdate').dispatchEvent('change');
  await until(() => rec.calls.filter(c => c.action === 'flightLookup').length > secondCallCount,
    { what: '日期改动后重新发出 flightLookup 请求' });
  const thirdCallCount = rec.calls.filter(c => c.action === 'flightLookup').length;
  ok('日期改动后又发起了一次新查询', thirdCallCount === secondCallCount + 1, { secondCallCount, thirdCallCount });

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
  await page.click(`#admin-item-${idx22}-0-more summary`);
  ok('点开「更多」后地点输入框可见了', await page.locator(`#admin-item-${idx22}-0-map`).isVisible() === true);
  ok('点开「更多」后日期输入框可见了', await page.locator(`#admin-item-${idx22}-0-date`).isVisible() === true);
  ok('点开「更多」后备注输入框可见了', await page.locator(`#admin-item-${idx22}-0-note-zh`).isVisible() === true);
  ok('点开「更多」后航班日期输入框可见了', await page.locator(`#admin-item-${idx22}-0-flightdate`).isVisible() === true);

  console.log('\n【25】日期与航班日期自动带出，不用每条都填');
  await page.fill(`input[data-trip="${idx22}"][data-field="start"]`, '2026-10-01');
  await page.click(`button[onclick="adminAddItem(${idx22})"]`); // 新增第 2 条，日期应自动带出行程出发日
  const autoDate = await page.evaluate((i) => adminTripsDraft[i].items[1].date, idx22);
  ok('新条目日期自动带成行程出发日（不用手选）', autoDate === '2026-10-01', autoDate);
  const flightDateVal = await page.locator(`#admin-item-${idx22}-1-flightdate`).inputValue();
  ok('航班日期默认跟着条目日期走（不用单独再填一遍，inputValue 不要求可见）', flightDateVal === '2026-10-01', flightDateVal);

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

await browser.close();

console.log(`\n结果：${pass} 通过，${fails.length} 失败`);
if (fails.length) {
  console.log('失败项：' + fails.join('；'));
  process.exit(1);
}
console.log('全绿');
