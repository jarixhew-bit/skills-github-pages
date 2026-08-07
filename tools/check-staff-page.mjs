// 同事模式的浏览器自检（记账 App 的 ?staff=1）。
//
// 跑法：
//   python3 -m http.server 8899 &
//   node tools/check-staff-page.mjs
//   （沙盒里浏览器装在别处时加 CHROMIUM_PATH=/opt/pw-browsers/chromium）
// CI 见 .github/workflows/staff-page-check.yml。
//
// 2026-08-07 起同事跟老板用**同一个 App**（用户拍板）。原本的独立页面
// staff/index.html 已改成跳转页——它连撞三个 App 早就解决过的问题
// （中文乱码、只能开相机、不压缩导致 4G 传不上去），当初就不该重写。
//
// 这份守的是两件事：
// 1. 同事模式确实把个人账本那一整套藏掉了（他们不该看到老板的界面）
// 2. **不带 ?staff=1 时一切照旧**——老板的 App 不能被同事模式影响
//    （老板那一侧的完整验证在 check-expense-company.mjs，90 项）
//
// 注意：同事模式只是界面简化，不是安全边界。真正的权限在服务端
// （reporter 由钥匙推出、只能删自己记的），有 tests/staff-access.test.mjs 守着。
import { chromium } from 'playwright';

const PORT = 8899;
const APP = `http://localhost:${PORT}/expense-tracker.html`;
const REDIRECT = `http://localhost:${PORT}/staff/index.html`;
const BUTLER = 'https://butler-bot.jarixhew.workers.dev';

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);

let pass = 0;
const fails = [];
const ok = (name, cond, got) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fails.push(name); console.log(`  ❌ ${name} —— 实际: ${JSON.stringify(got)}`); }
};

const STAFF_KEY = 'seryi-key-xyz';
const BOSS_KEY  = 'boss-key-abc';

async function newCtx({ offline = false } = {}) {
  const ctx = await browser.newContext();
  const posted = [];
  let mode = offline ? 'offline' : 'online';
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}`)) return route.continue();
    // 外部网域一律挡：Firebase / CDN 连不上时 App 要能退化成纯本地，
    // 顺带复现同事在工地/路上那种网络
    if (!u.startsWith(BUTLER)) return route.abort('failed');
    if (mode === 'offline') return route.abort('failed');
    const h = { 'Access-Control-Allow-Origin': '*' };
    if (route.request().method() === 'GET') {
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ categories:['Dinner','Lunch','Petrol','Store'], plateCategories:['Petrol'] }) });
    }
    const req = JSON.parse(route.request().postData() || '{}');
    posted.push(req);
    const who = req.token === STAFF_KEY ? { reporter:'Seryi', scope:'staff' }
              : req.token === BOSS_KEY  ? { reporter:'Boss',  scope:'owner' } : null;
    if (!who) return route.fulfill({ status:401, contentType:'application/json', headers:h,
      body: JSON.stringify({ error:'密钥不对' }) });
    if (req.action === 'mine')
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'ok', month:'2026-08', total:0, missingPhoto:0, records:[], ...who }) });
    return route.fulfill({ status:200, contentType:'application/json', headers:h,
      body: JSON.stringify({ status:'ok', records:[{ id:'n1', person:who.reporter, refTag:'7' }] }) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  return { ctx, page, posted, errs, setMode: m => { mode = m; } };
}

const seeVisible = (page, sel) => page.locator(sel).isVisible().catch(() => false);

// ---------- 【1】旧网址还能用 ----------
console.log('【1】发出去的旧网址 staff/ 要能继续用（同事可能已经加到主屏幕了）');
{
  const { ctx, page } = await newCtx();
  await page.goto(REDIRECT, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1200);
  ok('自动转到 App 的同事模式', /expense-tracker\.html\?staff=1/.test(page.url()), page.url());
  await ctx.close();
}

// ---------- 【2】没填钥匙：闸门挡住 ----------
console.log('\n【2】带 ?staff=1 但还没填钥匙：闸门挡住');
{
  const { ctx, page, errs } = await newCtx();
  await page.goto(APP + '?staff=1', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  ok('闸门显示出来', await seeVisible(page, '#staff-gate'));
  ok('闸门上有中英两种说明', /Enter your key/.test(await page.textContent('#staff-gate')));
  // 钥匙错要当场说，不能等他辛苦填完一笔才报错
  await page.fill('#staff-gate-key', 'wrong-key');
  await page.click('#staff-gate-btn');
  await page.waitForTimeout(900);
  ok('钥匙错 → 当场提示，闸门不放行',
     (await page.textContent('#staff-gate-msg')).includes('钥匙不对') && await seeVisible(page, '#staff-gate'),
     await page.textContent('#staff-gate-msg'));
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【3】填对钥匙：进同事模式 ----------
console.log('\n【3】同事的钥匙 → 进同事模式，个人账本整套藏掉');
let staffCtx;
{
  const { ctx, page, posted, errs } = await newCtx();
  staffCtx = { ctx, page, posted, errs };
  await page.goto(APP + '?staff=1', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('#staff-gate-key', STAFF_KEY);
  await page.click('#staff-gate-btn');
  await page.waitForTimeout(1500);

  ok('闸门收起来了', !(await seeVisible(page, '#staff-gate')));
  ok('进了同事模式（body 挂上 staff-mode）',
     await page.evaluate(() => document.body.classList.contains('staff-mode')));
  ok('标题显示服务端认出的名字 Seryi',
     (await page.$eval('.hdr-title', e => e.getAttribute('data-staff-name') || '')).includes('Seryi'),
     await page.$eval('.hdr-title', e => e.getAttribute('data-staff-name')));

  // 下面这些是老板的东西，同事不该看到
  for (const [name, sel] of [
    ['概览 tab 的入口', '#nav-overview'],
    ['统计 tab 的入口', '#nav-analytics'],
    ['设置 tab 的入口', '#nav-settings'],
    ['云同步图标', '#hdr-cloud'],
    ['账户卡片行', '#acc-cards-row'],
    ['切换账户的按钮', '.acc-pill'],
  ]) ok(`藏掉了：${name}`, !(await seeVisible(page, sel)));

  ok('留着「明细」入口', await seeVisible(page, '#nav-transactions'));
  ok('留着记账按钮（FAB）', await seeVisible(page, '.fab'));
  ok('有「换钥匙」的出口（钥匙换了要能重填）', await seeVisible(page, '#staff-signout-row'));

  // 自动建好公司账户并选中——同事不该自己去设置里摸索
  const acc = await page.evaluate(() => {
    const a = data.accounts.find(x => x.id === data.currentAccountId);
    return a ? { isCompany: !!a.isCompany, currency: a.currency } : null;
  });
  ok('自动建好公司账户并选中', acc && acc.isCompany === true, acc);
  ok('公司账户是美元（公司账本是美元记账）', acc && acc.currency === 'USD', acc);
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
}

// ---------- 【4】记一笔：不给他选报账人 ----------
console.log('\n【4】记一笔：报账人由钥匙决定，页面不给选');
{
  const { page, posted, errs } = staffCtx;
  posted.length = 0;
  await page.evaluate(() => showAddTx());
  await page.waitForTimeout(900);
  ok('公司字段显示出来', await seeVisible(page, '#tx-company-wrap'));
  // 这是同事模式最重要的一条：没有「谁报的账」下拉框，选不了也就选不错
  ok('「谁报的账」那一组被藏起来', !(await seeVisible(page, '#tx-company-reporter')));
  await page.fill('#tx-amount', '12.34');
  await page.selectOption('#tx-company-category', 'Lunch');
  await page.evaluate(() => saveTx());
  await page.waitForTimeout(1800);
  const p = posted.find(x => !x.action);
  ok('送出去了', !!p, posted);
  ok('带的是同事自己那把钥匙', p && p.token === STAFF_KEY, p && p.token);
  ok('金额原样送出，没在本地换算', p && p.items[0].amount === 12.34, p && p.items[0]);
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await staffCtx.ctx.close();
}

// ---------- 【5】老板的钥匙不进同事模式 ----------
console.log('\n【5】老板的钥匙带 ?staff=1 → 不进同事模式（身份由服务端说了算）');
{
  const { ctx, page, errs } = await newCtx();
  await page.goto(APP + '?staff=1', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('#staff-gate-key', BOSS_KEY);
  await page.click('#staff-gate-btn');
  await page.waitForTimeout(1500);
  ok('没进同事模式', !(await page.evaluate(() => document.body.classList.contains('staff-mode'))));
  ok('概览入口还在', await seeVisible(page, '#nav-overview'));
  ok('设置入口还在', await seeVisible(page, '#nav-settings'));
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【6】不带 ?staff=1：老板的 App 一切照旧 ----------
console.log('\n【6】不带 ?staff=1：老板的 App 完全不受影响');
{
  const { ctx, page, errs } = await newCtx();
  await page.goto(APP, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  ok('闸门不出现', !(await seeVisible(page, '#staff-gate')));
  ok('没有 staff-mode', !(await page.evaluate(() => document.body.classList.contains('staff-mode'))));
  for (const [name, sel] of [
    ['概览', '#nav-overview'], ['统计', '#nav-analytics'],
    ['设置', '#nav-settings'], ['账户卡片', '#acc-cards-row'],
  ]) ok(`${name}照常显示`, await seeVisible(page, sel));
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【7】认过一次之后，没网也进得去 ----------
console.log('\n【7】认过一次之后没网：不能把人挡在门外（他正要记账）');
{
  const { ctx, page, setMode, errs } = await newCtx();
  await page.goto(APP + '?staff=1', { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('#staff-gate-key', STAFF_KEY);
  await page.click('#staff-gate-btn');
  await page.waitForTimeout(1200);
  ok('先正常进去', await page.evaluate(() => document.body.classList.contains('staff-mode')));
  setMode('offline');
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(2000);
  ok('没网重开仍进同事模式（用上次认过的身份）',
     await page.evaluate(() => document.body.classList.contains('staff-mode')));
  ok('没被闸门挡住', !(await seeVisible(page, '#staff-gate')));
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

await browser.close();
console.log();
if (fails.length) {
  console.log(`不通过：${pass} 项通过 / ${fails.length} 项失败`);
  fails.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log(`通过：${pass} 项通过 / 0 项失败`);
