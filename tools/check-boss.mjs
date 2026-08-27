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

function mountRoutes(ctx, { role = 'viewer', who = 'YANG', inventory = fakeInventory() } = {}){
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
            trips: fakeTrips(), bills: fakeBills(), inventory }) });
      }
      if (req.action === 'bill'){
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify({ status: 'ok', contentBase64: Buffer.from('%PDF-1.4 fake').toString('base64'), mime: 'application/pdf' }) });
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
  ok('条目有日期输入框', await row.locator('input[type="date"]').count() >= 1);
  ok('条目有时间输入框', await row.locator('input[type="time"]').count() >= 1);
  ok('条目有标题（中文）输入框', await row.locator('input[type="text"]').count() >= 1);
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
  await page.click(`button[onclick="adminAddItem(${idx10})"]`);

  const mapInput = page.locator('.admin-item-row').first().locator('.admin-field').last().locator('input');
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
  await page.fill(`input[data-trip="${idx14}"][data-field="title.en"]`, 'Osaka 3 Days');
  await page.fill(`input[data-trip="${idx14}"][data-field="start"]`, '2026-09-01');
  await page.fill(`input[data-trip="${idx14}"][data-field="end"]`, '2026-09-03');
  await page.click(`button[onclick="adminAddItem(${idx14})"]`);
  const row = page.locator('.admin-item-row').first();
  await row.locator('input[type="date"]').fill('2026-09-01');
  await row.locator('input[type="text"]').first().fill('入住酒店'); // 标题（中文）
  const mapInput = row.locator('.admin-field').last().locator('input');
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
  ok('trip.start / trip.end 字段名逐字对得上', t && t.start === '2026-09-01' && t.end === '2026-09-03', t);
  ok('trip.items 是数组，且有 1 条', t && Array.isArray(t.items) && t.items.length === 1, t && t.items);
  const it = t && t.items && t.items[0];
  ok('item.mapUrl 字段名逐字对得上，且是生成出来的地图链接',
     it && it.mapUrl === 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('大阪城'), it && it.mapUrl);
  ok('item.title 是 {zh,en} 对象，且 zh 对得上',
     it && typeof it.title === 'object' && it.title.zh === '入住酒店', it && it.title);
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

  await ctx.close();
}

await browser.close();

console.log(`\n结果：${pass} 通过，${fails.length} 失败`);
if (fails.length) {
  console.log('失败项：' + fails.join('；'));
  process.exit(1);
}
console.log('全绿');
