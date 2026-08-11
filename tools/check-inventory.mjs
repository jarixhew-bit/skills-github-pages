/**
 * 库存分页的自检（真浏览器跑，Playwright）。
 *
 * 跑法：
 *   python3 -m http.server 8899 &
 *   node tools/check-inventory.mjs
 * 沙盒里浏览器装在别处，要带 CHROMIUM_PATH=/opt/pw-browsers/chromium。
 *
 * 【2026-08-10 改】库存原本是独立的 inventory/index.html，现在整个并进了记账 App
 * （expense-tracker.html 的第五个分页「📦 库存」），同事版 staff/index.html 也一样有。
 * 所以这份自检改成打**记账 App 的库存分页**，并且老板版与同事版都要覆盖。
 * 原来那 60 多条断言（防连点、分组小计、分享文案、空态、错误态、操作记录懒加载、
 * forbidden 当失败处理…）全部保留，只换了定位方式（#list → #inv-list）与钥匙来源
 * （inventoryToken 那条三把钥匙的链条 → 直接用记账的 getCompanyToken()）。
 *
 * 为什么要用真浏览器而不是读代码判断：这里管的是老板的酒／茶叶／虫草／氢水库存数量，
 * 点两下按钮就可能多扣一瓶——见 .claude/rules/diagnosis.md 2026-08-08 那条教训，
 * 这类窗口期 bug 只有用 el.click(); el.click() 连打两下的真实双击才测得出来
 * （page.click() 会等元素恢复可点，page.evaluate 里同步调两次函数也测不出来）。
 *
 * 全程用 ctx.route('**\/*', ...) 拦掉所有外部请求，不打真实的 butler-bot 接口。
 */
import { chromium } from 'playwright';

const PORT = process.env.CHECK_PORT || 8899;
const BOSS_URL = `http://localhost:${PORT}/expense-tracker.html`;
const STAFF_URL = `http://localhost:${PORT}/staff/index.html`;
const INV_API = 'https://butler-bot.jarixhew.workers.dev/inventory';
const COMPANY_API = 'https://butler-bot.jarixhew.workers.dev/company-expense';

let pass = 0; const fails = [];
/**
 * 等条件成立，而不是死等固定时间（2026-08-11 提速改造，做法与其他两份自检一致）。
 * 注意两类不能用它，本档里都留着原样的 waitForTimeout：
 *   1) 断言「某件事没有发生」——等一件不会发生的事只能真的等；
 *   2) 防连点那几段——那里等的就是「时间窗口」本身，把它换掉等于把要测的东西测没了。
 */
async function until(fn, { timeout = 8000, interval = 20, what = '条件' } = {}) {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - t0 > timeout) throw new Error(`等不到「${what}」（超时 ${timeout}ms）`);
    await new Promise(r => setTimeout(r, interval));
  }
}

const ok = (n, c, got) => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fails.push(n); console.log(`  ❌ ${n} — 实际: ${JSON.stringify(got)}`); }
};

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);

// 一份跟真接口形状一致的假数据：wine 两个位置＋两种已用完，tea/herb 空，hydrogen 有货
function fakeCategories() {
  return [
    { key:'wine', label:'酒', defaultUnit:'瓶', items: [
      { id:'w1', name:'Laffite 2001', count:11, unit:'瓶', location:'西港', note:'老板留用', added_at:'2026-01-01' },
      { id:'w2', name:'Pavie', count:17, unit:'瓶', location:'西港', note:'', added_at:'2026-01-01' },
      { id:'w3', name:'茅台50年', count:1, unit:'瓶', location:'金边', note:'', added_at:'2026-01-01' },
      { id:'w4', name:'红酒过期款', count:0, unit:'瓶', location:'西港', note:'', added_at:'2026-01-01' },
      { id:'w5', name:'白兰地', count:0, unit:'', location:'', note:'', added_at:'2026-01-01' },
    ]},
    { key:'tea', label:'茶叶', defaultUnit:'饼', items: [] },
    { key:'herb', label:'虫草', defaultUnit:'克', items: [] },
    // 氢水（2026-08-10 加的第四个类别）。这一格有货，所以它同时验了
    // 「不是空状态也画得对」和「加减打给服务端的 category 是 hydrogen」
    { key:'hydrogen', label:'氢水', defaultUnit:'瓶', items: [
      { id:'h1', name:'禾露堂 350ml', count:48, unit:'瓶', location:'西港', note:'新到一批', added_at:'2026-08-10' },
      { id:'h2', name:'禾露堂 500ml', count:12, unit:'瓶', location:'金边', note:'', added_at:'2026-08-10' },
    ]},
  ];
}

// 三条假操作记录，最新的排最前（跟服务端的约定一致）
function fakeLogEntries(){
  const now = Date.now();
  return [
    { id:'l3', at:new Date(now - 3*60000).toISOString(), who:'Seryi', action:'adjust',
      category:'wine', itemName:'Laffite 2001', before:11, after:12, delta:1,
      note:'Seryi 把 Laffite 2001 从 11 加到 12' },
    { id:'l2', at:new Date(now - 3600*1000).toISOString(), who:'Boss', action:'add',
      category:'tea', itemName:'普洱饼', before:0, after:5, delta:5,
      note:'Boss 新增 普洱饼 x5' },
    { id:'l1', at:new Date(now - 90000*1000).toISOString(), who:'Kuang', action:'remove',
      category:'herb', itemName:'过期虫草', before:2, after:0, delta:-2,
      note:'Kuang 删除了 过期虫草 这条记录' },
  ];
}

/**
 * 把假的 butler-bot 挂上去。所有非 localhost 的请求一律拦掉（外部 CDN、firebase
 * 全部断开），只有 /inventory 与 /company-expense 两个端点给假回应。
 * 返回一个可以在断言里读的记录本。
 */
function mountRoutes(ctx, opts = {}) {
  const rec = {
    invCalls: [],        // 打去库存端点的写操作（list/log 另外记）
    listCalls: [],
    logCalls: [],
    allInvCalls: [],     // 所有打去库存端点的请求，懒加载那条断言用它
    lastToken: null,
    serverCats: fakeCategories(),
    forceError: null,    // {action, message, status?}
    logEntriesOverride: null,
    who: opts.who || 'Boss',
  };
  ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}`)) return route.continue();
    const h = { 'Access-Control-Allow-Origin':'*' };

    if (u.startsWith(COMPANY_API)) {
      // 记账 App 自己要问的那几个接口，给个能过的回应，免得启动流程卡住。
      if (route.request().method() === 'GET') {
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ categories:['Lunch','Dinner','Store'], plateCategories:[],
                                 mealCategories:[], people:[{code:'Seryi', label:'Seryi'}] }) });
      }
      const rq = JSON.parse(route.request().postData() || '{}');
      if (rq.action === 'mine' && !rq.month)
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', reporter: rec.who }) });
      if (rq.action === 'mine')
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', reporter: rec.who, records: [] }) });
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'ok', people: [], entries: [], records: [] }) });
    }

    if (u.startsWith(INV_API)) {
      const req = JSON.parse(route.request().postData() || '{}');
      rec.allInvCalls.push(req);
      rec.lastToken = req.token;
      if (rec.forceError && rec.forceError.action === req.action) {
        // status 可指定：服务端除了 error 还会回 forbidden（拿没权限的钥匙来查库存时），
        // 页面必须一视同仁当成失败，不能只认 error 就把 forbidden 当成功往下走。
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status: rec.forceError.status || 'error', message: rec.forceError.message }) });
      }
      if (req.action === 'list') {
        rec.listCalls.push(req);
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', who: rec.who, categories: rec.serverCats }) });
      }
      if (req.action === 'log') {
        rec.logCalls.push(req);
        const entries = rec.logEntriesOverride !== null ? rec.logEntriesOverride : fakeLogEntries();
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', who: rec.who, entries }) });
      }
      rec.invCalls.push(req);
      if (req.action === 'adjust') {
        const cat = rec.serverCats.find(c=>c.key===req.category);
        const it = cat.items.find(x=>x.id===req.id);
        it.count = Math.max(0, Number(it.count) + Number(req.delta));
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', who: rec.who, item: it }) });
      }
      if (req.action === 'add') {
        const cat = rec.serverCats.find(c=>c.key===req.category);
        const item = { id:'new'+Date.now(), name:req.name, count:req.count, unit:req.unit,
                       location:req.location, note:req.note||'', added_at:'2026-08-10' };
        cat.items.push(item);
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', who: rec.who, item, merged:false }) });
      }
      if (req.action === 'update') {
        const cat = rec.serverCats.find(c=>c.key===req.category);
        const it = cat.items.find(x=>x.id===req.id);
        Object.assign(it, { name:req.name, count:req.count, unit:req.unit,
                            location:req.location, note:req.note });
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', who: rec.who, item: it }) });
      }
      if (req.action === 'remove') {
        const cat = rec.serverCats.find(c=>c.key===req.category);
        const idx = cat.items.findIndex(x=>x.id===req.id);
        const [removed] = cat.items.splice(idx,1);
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', who: rec.who, removed }) });
      }
      return route.fulfill({ status:400, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'error', message:'假服务端不认识这个 action' }) });
    }
    return route.abort('failed');
  });
  return rec;
}

// ---------- 场景一：老板版，没填密钥 ----------
{
  const ctx = await browser.newContext();
  const rec = mountRoutes(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));

  console.log('【1】老板版没填密钥：库存分页显示引导去设置，不打接口');
  await page.goto(BOSS_URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  ok('底部导航有「库存」按钮', await page.locator('#nav-inventory').isVisible());
  await page.click('#nav-inventory');
  await until(() => page.evaluate(() => {
    const tab = document.getElementById('tab-inventory');
    if (!tab || !tab.classList.contains('active')) return false;
    // 同「操作记录」那一处的教训：光看「没在加载中」会当场成立，等于没等。
    // 三种终态才算画完：列表有东西 / 提示要填钥匙 / 连不上的错误横幅。
    const list = document.getElementById('inv-list');
    const guide = document.getElementById('inv-guide-banner');
    const err = document.getElementById('inv-error-banner');
    if (!list) return false;
    return list.children.length > 0
           || (!!guide && !guide.hidden) || (!!err && !err.hidden);
  }), { what: '库存分页显示出来' });
  ok('库存分页显示出来', await page.locator('#tab-inventory').isVisible());
  ok('引导横幅显示', await page.locator('#inv-guide-banner').isVisible());
  ok('错误横幅不显示', !(await page.locator('#inv-error-banner').isVisible()));
  ok('没有请求打去库存接口', rec.allInvCalls.length === 0, rec.allInvCalls.length);
  ok('四个类别标签都在（酒／茶叶／虫草／氢水）', await page.locator('.inv-tab-btn').count() === 4);
  const tabTexts = await page.$$eval('.inv-tab-btn', els => els.map(e => e.textContent));
  ok('标签含 酒／茶叶／虫草',
     tabTexts.some(t=>t.includes('酒')) && tabTexts.some(t=>t.includes('茶叶')) && tabTexts.some(t=>t.includes('虫草')),
     tabTexts);
  ok('没连上时不显示 who（不能显示 undefined）',
     !(await page.locator('#inv-who').isVisible()), await page.locator('#inv-who').textContent());
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));

  console.log('\n【1b】引导里的「去设置」真的把人送到设置分页');
  await page.click('#inv-guide-link');
  await page.waitForTimeout(300);
  ok('切到了设置分页', await page.locator('#tab-settings').isVisible());
  ok('设置里有公司报账密钥输入框', await page.locator('#company-token-input').count() === 1);

  console.log('\n【1c】钥匙用的是记账那把（不再自己存一份）');
  await page.evaluate(() => localStorage.setItem('expenseTracker_companyToken', 'boss-key-from-expense-app'));
  await page.click('#nav-inventory');
  await page.waitForTimeout(700);
  ok('填了记账的密钥后库存自己就能加载', rec.listCalls.length === 1, rec.listCalls.length);
  ok('请求带的就是记账那把钥匙', rec.lastToken === 'boss-key-from-expense-app', rec.lastToken);
  ok('库存没有另外存一把自己的钥匙',
     await page.evaluate(()=>localStorage.getItem('inventoryToken')) === null);

  await ctx.close();
}

// ---------- 场景二：老板版，正常数据（主战场）----------
{
  const ctx = await browser.newContext();
  const rec = mountRoutes(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => localStorage.setItem('expenseTracker_companyToken', 'test-token-abc'));

  console.log('\n【2】懒加载：没切到库存分页之前，一个库存请求都不许发');
  await page.goto(BOSS_URL, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1200);
  ok('启动后没有任何库存请求', rec.allInvCalls.length === 0, rec.allInvCalls);
  ok('首屏停在概览分页', await page.locator('#tab-overview').isVisible());

  // 记账的账本里先放一笔真数据，后面用来验证「库存怎么点都碰不到记账的钱」
  await page.evaluate(() => {
    data.transactions.push({ id:'seed_tx_1', accountId: data.accounts[0].id, amount: 12.34,
      type:'expense', categoryId:'cat_food', description:'自检用的种子记录',
      date: today(), updatedAt: Date.now() });
    saveData();
  });
  const txBefore = await page.evaluate(() => data.transactions.length);

  console.log('\n【2b】切到库存分页才拉数据：按位置分组，小计对得上');
  await page.click('#nav-inventory');
  await until(() => page.evaluate(() => {
    const tab = document.getElementById('tab-inventory');
    if (!tab || !tab.classList.contains('active')) return false;
    // 同「操作记录」那一处的教训：光看「没在加载中」会当场成立，等于没等。
    // 三种终态才算画完：列表有东西 / 提示要填钥匙 / 连不上的错误横幅。
    const list = document.getElementById('inv-list');
    const guide = document.getElementById('inv-guide-banner');
    const err = document.getElementById('inv-error-banner');
    if (!list) return false;
    return list.children.length > 0
           || (!!guide && !guide.hidden) || (!!err && !err.hidden);
  }), { what: '库存分页显示出来' });
  ok('切过去之后拉了 1 次 list', rec.listCalls.length === 1, rec.listCalls.length);
  ok('引导横幅不显示', !(await page.locator('#inv-guide-banner').isVisible()));
  ok('错误横幅不显示', !(await page.locator('#inv-error-banner').isVisible()));
  const locNames = await page.$$eval('.inv-loc-name', els => els.map(e=>e.textContent.trim()));
  ok('两个有库存的位置分组：西港、金边',
     locNames.includes('📍 西港') && locNames.includes('📍 金边'), locNames);
  const subTexts = await page.$$eval('.inv-loc-sub', els => els.map(e=>e.textContent.trim()));
  ok('西港小计 = 28 瓶（11+17）', subTexts.some(t=>t.includes('28 瓶')), subTexts);
  ok('金边小计 = 1 瓶', subTexts.some(t=>t.includes('1 瓶')), subTexts);
  const usedUpSummary = await page.textContent('details.inv-used-up summary');
  ok('已用完区块显示 2 种（红酒过期款＋白兰地）', /已用完（2 种）/.test(usedUpSummary||''), usedUpSummary);
  const usedUpOpen = await page.evaluate(()=>document.querySelector('details.inv-used-up').open);
  ok('已用完区块默认折叠', usedUpOpen === false, usedUpOpen);

  console.log('\n【2c】切回记账再切回来，不重复拉（拉过一次就够）');
  await page.click('#nav-transactions');
  await page.waitForTimeout(300);
  await page.click('#nav-inventory');
  await until(() => page.evaluate(() => {
    const tab = document.getElementById('tab-inventory');
    if (!tab || !tab.classList.contains('active')) return false;
    // 同「操作记录」那一处的教训：光看「没在加载中」会当场成立，等于没等。
    // 三种终态才算画完：列表有东西 / 提示要填钥匙 / 连不上的错误横幅。
    const list = document.getElementById('inv-list');
    const guide = document.getElementById('inv-guide-banner');
    const err = document.getElementById('inv-error-banner');
    if (!list) return false;
    return list.children.length > 0
           || (!!guide && !guide.hidden) || (!!err && !err.hidden);
  }), { what: '库存分页显示出来' });
  ok('还是只拉过 1 次', rec.listCalls.length === 1, rec.listCalls.length);
  ok('列表还在（没被切走时清空）', (await page.textContent('#inv-list')).includes('Laffite 2001'));

  console.log('\n【3】切到茶叶／虫草：空数据显示空状态而不是坏掉');
  await page.click('#inv-cat-tea');
  await page.waitForTimeout(300);
  ok('茶叶标签变 active',
     await page.evaluate(()=>document.getElementById('inv-cat-tea').classList.contains('active')));
  ok('茶叶显示空状态', await page.locator('.inv-empty').isVisible());
  const teaEmptyTxt = await page.textContent('.inv-empty');
  ok('空状态文字提到茶叶', (teaEmptyTxt||'').includes('茶叶'), teaEmptyTxt);
  await page.click('#inv-cat-herb');
  await page.waitForTimeout(300);
  ok('虫草也显示空状态', await page.locator('.inv-empty').isVisible());

  console.log('\n【3b】氢水（第四个类别）：有货就照常画，加减打对 category');
  await page.click('#inv-cat-hydrogen');
  await page.waitForTimeout(400);
  ok('氢水标签变 active',
     await page.evaluate(()=>document.getElementById('inv-cat-hydrogen').classList.contains('active')));
  const hydTxt = await page.textContent('#inv-list');
  ok('两条禾露堂都画出来了',
     hydTxt.includes('禾露堂 350ml') && hydTxt.includes('禾露堂 500ml'), hydTxt.slice(0,80));
  ok('单位是「瓶」', hydTxt.includes('48 瓶'), hydTxt.slice(0,80));
  ok('切到氢水不会再拉一次服务端（一次 list 就够）', rec.listCalls.length === 1, rec.listCalls.length);
  rec.invCalls = [];
  await page.locator('.inv-item-row[data-inv-id="h1"] .inv-qty-minus').click();
  await page.waitForTimeout(700);
  ok('减一瓶发的是 category=hydrogen',
     rec.invCalls[0]?.category === 'hydrogen' && rec.invCalls[0]?.id === 'h1', rec.invCalls[0]);
  ok('delta 是 -1', rec.invCalls[0]?.delta === -1, rec.invCalls[0]);
  ok('数量变成 47', ((await page.textContent('.inv-item-row[data-inv-id="h1"] .inv-qty-val'))||'').includes('47'));
  await page.click('#inv-btn-add');
  await page.waitForTimeout(300);
  ok('新增表单带出来的默认单位是「瓶」',
     await page.inputValue('#inv-add-unit') === '瓶', await page.inputValue('#inv-add-unit'));
  await page.click('#inv-modal-add .modal-close');
  await page.waitForTimeout(200);

  await page.click('#inv-cat-wine');
  await page.waitForTimeout(300);
  ok('没有报错', errs.length === 0, errs.slice(0,3));

  console.log('\n【4】点 + 发出正确的请求');
  rec.invCalls = [];
  await page.locator('.inv-item-row[data-inv-id="w1"] .inv-qty-plus').click();
  await page.waitForTimeout(700);
  ok('发了 1 个请求', rec.invCalls.length === 1, rec.invCalls.length);
  ok('action 是 adjust，delta 是 1',
     rec.invCalls[0]?.action==='adjust' && rec.invCalls[0]?.delta===1, rec.invCalls[0]);
  ok('category/id 正确',
     rec.invCalls[0]?.category==='wine' && rec.invCalls[0]?.id==='w1', rec.invCalls[0]);
  const w1Qty = await page.textContent('.inv-item-row[data-inv-id="w1"] .inv-qty-val');
  ok('数量变成 12', (w1Qty||'').includes('12'), w1Qty);

  console.log('\n【4b】库存的操作碰不到记账的数据（两本账没有交叉路径）');
  const txAfter = await page.evaluate(() => data.transactions.length);
  ok('记账的交易数没变', txAfter === txBefore, { txBefore, txAfter });
  const seedOk = await page.evaluate(() => {
    const t = data.transactions.find(x => x.id === 'seed_tx_1');
    return !!t && t.amount === 12.34 && t.description === '自检用的种子记录';
  });
  ok('那笔种子记录原样还在（金额没被动过）', seedOk);
  const storedOk = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('expenseTracker_v2') || '{}');
    return (raw.transactions || []).length;
  });
  ok('本机存的账本里也一样多', storedOk === txBefore, { storedOk, txBefore });

  console.log('\n【5】连点两下 + 只发一次请求（真双击，用原生 el.click() 连打两下）');
  rec.invCalls = [];
  await page.evaluate(() => {
    const row = document.querySelector('.inv-item-row[data-inv-id="w1"]');
    const btn = row.querySelector('.inv-qty-plus');
    btn.click(); btn.click();
  });
  await page.waitForTimeout(800);
  ok('连点两下只送出 1 个请求', rec.invCalls.length === 1, rec.invCalls.length);
  const w1QtyAfterDbl = await page.textContent('.inv-item-row[data-inv-id="w1"] .inv-qty-val');
  ok('数量只加了 1（变成 13，不是 14）', (w1QtyAfterDbl||'').includes('13'), w1QtyAfterDbl);

  console.log('\n【6】接口返回 status:error 时把 message 显示出来');
  rec.forceError = { action:'adjust', message:'假服务端说库存对不上' };
  await page.waitForTimeout(500); // 让【5】的锁窗口先过去，避免误触发防连点
  await page.locator('.inv-item-row[data-inv-id="w2"] .inv-qty-minus').click();
  await page.waitForTimeout(700);
  const toastTxt = await page.textContent('#toast');
  ok('toast 显示了服务端的 message', (toastTxt||'').includes('假服务端说库存对不上'), toastTxt);
  rec.forceError = null;

  // 库存是老板私人物品，服务端对没权限的钥匙回的是 status:"forbidden" 而不是 "error"。
  // 页面若只认 "error"，forbidden 会被当成成功、往下读 body.item 读到 undefined，
  // 表现成「莫名其妙坏掉」而不是「告诉他钥匙不对」。
  console.log('\n【6b】接口返回 status:forbidden 也要当成失败提示出来');
  rec.forceError = { action:'adjust', status:'forbidden', message:'库存只有老板能查看和修改' };
  await page.waitForTimeout(500);
  const beforeFb = await page.textContent('.inv-item-row[data-inv-id="w2"] .inv-qty-val');
  await page.locator('.inv-item-row[data-inv-id="w2"] .inv-qty-minus').click();
  await page.waitForTimeout(700);
  const fbToast = await page.textContent('#toast');
  ok('toast 显示了 forbidden 的 message', (fbToast||'').includes('只有老板'), fbToast);
  const afterFb = await page.textContent('.inv-item-row[data-inv-id="w2"] .inv-qty-val');
  ok('被拒绝时数量没有被改动', beforeFb === afterFb, { beforeFb, afterFb });
  rec.forceError = null;

  console.log('\n【7】分享文字格式正确');
  const shareCalls = [];
  await page.exposeFunction('__recordShare', (opts) => { shareCalls.push(opts); });
  await page.evaluate(() => {
    navigator.share = (opts) => { window.__recordShare(opts); return Promise.resolve(); };
  });
  await page.click('#inv-btn-share-all');
  await page.waitForTimeout(400);
  ok('调用了 navigator.share', shareCalls.length === 1, shareCalls);
  const shareText = shareCalls[0]?.text || '';
  ok('标题行含图标与日期', /^🍷 酒库存（\d{4}-\d{2}-\d{2}）/.test(shareText), shareText);
  // w1（Laffite）在【4】【5】里被加过库存（11→13），这里用当前实际值算小计，
  // 不是页面加载时的原始 11+17
  ok('含西港小计 30 瓶（13+17，含前面测试加过的库存）',
     shareText.includes('📍 西港　共 30 瓶'), shareText);
  ok('含金边小计 1 瓶', shareText.includes('📍 金边　共 1 瓶'), shareText);
  ok('含具体条目 x11 格式', /Laffite 2001 x\d+/.test(shareText), shareText);
  ok('末尾提到已用完 2 种', /另有 2 种已用完$/.test(shareText.trim()), shareText);

  console.log('\n【7a】每个位置各有一个分享按钮，只分享那个位置');
  shareCalls.length = 0;
  const shareBtnCount = await page.locator('.inv-loc-share').count();
  ok('两个位置各一个分享按钮', shareBtnCount === 2, shareBtnCount);
  await page.locator('.inv-loc-group', { hasText:'金边' }).locator('.inv-loc-share').click();
  await page.waitForTimeout(400);
  const oneLocText = shareCalls[0]?.text || '';
  ok('只含金边那一段', oneLocText.includes('金边') && !oneLocText.includes('西港'), oneLocText);
  ok('单个位置的分享不带「已用完」那一行', !oneLocText.includes('已用完'), oneLocText);

  console.log('\n【7b】分享失败/不支持 share 时会退回复制，不能没反应');
  await page.evaluate(() => {
    // navigator.clipboard 在真浏览器里是只读 getter，plain assignment 会静默失败
    // （非严格模式下不报错，但 navigator.clipboard 还是原来那个），必须用 defineProperty
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    window.__clipboardCalls = [];
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: (t) => { window.__clipboardCalls.push(t); return Promise.resolve(); } },
      configurable: true,
    });
  });
  await page.click('#inv-btn-share-all');
  await page.waitForTimeout(500);
  const clip = await page.evaluate(()=>window.__clipboardCalls);
  ok('退回剪贴板复制', clip.length === 1, clip.length);
  const toastTxt2 = await page.textContent('#toast');
  ok('提示已复制', (toastTxt2||'').includes('已复制'), toastTxt2);

  console.log('\n【7c】用户主动取消分享（AbortError）不算失败，不弹错误');
  await page.evaluate(() => {
    window.__clipboardCalls = [];
    navigator.share = () => { const e = new Error('cancelled'); e.name = 'AbortError'; return Promise.reject(e); };
  });
  await page.click('#inv-btn-share-all');
  await page.waitForTimeout(500);
  const clipAfterCancel = await page.evaluate(()=>window.__clipboardCalls);
  ok('取消后不会又去走复制兜底', clipAfterCancel.length === 0, clipAfterCancel);

  console.log('\n【8】添加新条目：位置下拉来自已有数据，能新增位置');
  await page.click('#inv-btn-add');
  await page.waitForTimeout(400);
  ok('添加弹窗打开', await page.locator('#inv-modal-add').isVisible());
  const locOpts = await page.$$eval('#inv-add-location-select option', els => els.map(e=>e.value));
  ok('下拉含已有位置 西港/金边 与新位置选项',
     locOpts.includes('西港') && locOpts.includes('金边') && locOpts.includes('__NEW__'), locOpts);
  ok('单位预填成这一类的默认单位（瓶）',
     await page.inputValue('#inv-add-unit') === '瓶', await page.inputValue('#inv-add-unit'));
  await page.selectOption('#inv-add-location-select', '__NEW__');
  await page.waitForTimeout(200);
  ok('选新位置后出现文字输入框', await page.locator('#inv-add-location-new').isVisible());
  await page.fill('#inv-add-name', '新到的酒');
  await page.fill('#inv-add-count', '5');
  await page.fill('#inv-add-location-new', '仓库B');
  await page.click('#inv-add-submit');
  await page.waitForTimeout(900);
  ok('新条目出现在列表', (await page.textContent('#inv-list')).includes('新到的酒'));
  ok('新位置分组出现', (await page.textContent('#inv-list')).includes('仓库B'));

  console.log('\n【9】编辑与删除');
  await page.click('.inv-item-row[data-inv-id="w3"] .inv-item-name');
  await page.waitForTimeout(400);
  ok('编辑弹窗打开且带入原值', await page.inputValue('#inv-edit-name') === '茅台50年');
  await page.fill('#inv-edit-count', '3');
  await page.click('#inv-edit-submit');
  await page.waitForTimeout(900);
  ok('数量更新为 3',
     (await page.textContent('.inv-item-row[data-inv-id="w3"] .inv-qty-val')||'').includes('3'));

  page.once('dialog', d => d.accept());
  await page.click('.inv-item-row[data-inv-id="w3"] .inv-item-name');
  await page.waitForTimeout(400);
  await page.click('#inv-edit-delete');
  await page.waitForTimeout(900);
  ok('删除后条目消失', !(await page.locator('.inv-item-row[data-inv-id="w3"]').count()));

  console.log('\n【11】库存分页里看得见服务端回的 who（每次加减记在谁名下）');
  ok('who 那行显示出来了', await page.locator('#inv-who').isVisible());
  const whoTxt = await page.textContent('#inv-who');
  ok('里面含 Boss', (whoTxt||'').includes('Boss'), whoTxt);

  console.log('\n【12】操作记录：切进库存分页时不发请求，点开才发');
  ok('到这一步都还没有 log 请求', rec.logCalls.length === 0, rec.logCalls.length);
  await page.click('#inv-btn-log');
  await until(() => page.evaluate(() => {
    const m2 = document.getElementById('inv-modal-log');
    if (!m2 || !m2.classList.contains('open')) return false;
    // 三种终态才算「载入完」：画出了条目 / 空状态 / 错误横幅。
    // 第一版写成「文字里没有『加载中』」——列表初始是空字符串，条件当场就成立，
    // 等于没等；本地够快看不出来，CI 慢一点就整段红（2026-08-11 踩过）。
    const body = document.getElementById('inv-log-list');
    const err = document.getElementById('inv-log-error');
    if (!body) return false;
    return body.children.length > 0 || (!!err && !err.hidden);
  }), { what: '操作记录打开并载入' });
  ok('打开后发了 1 个 log 请求', rec.logCalls.length === 1, rec.logCalls.length);
  ok('请求带 action:log', rec.logCalls[0] && rec.logCalls[0].action === 'log', rec.logCalls[0]);

  console.log('\n【13】操作记录列表显示 who 与 note，最新的在最上面');
  const logEntriesTxt = await page.$$eval('.inv-log-entry', els => els.map(e=>e.textContent));
  ok('共 3 条记录', logEntriesTxt.length === 3, logEntriesTxt.length);
  ok('第一条含 Seryi 与 note 文本（最新的排最前）',
     (logEntriesTxt[0]||'').includes('Seryi') && (logEntriesTxt[0]||'').includes('Laffite 2001'),
     logEntriesTxt[0]);
  ok('第三条含 Kuang（最旧的排最后）', (logEntriesTxt[2]||'').includes('Kuang'), logEntriesTxt[2]);
  const badges = await page.$$eval('.inv-log-badge', els => els.map(e=>e.textContent.trim()));
  ok('动作徽章翻成中文（加减／新增／删除）',
     badges.includes('加减') && badges.includes('新增') && badges.includes('删除'), badges);
  await page.click('#inv-modal-log .modal-close');
  await until(() => page.evaluate(() => {
    const m2 = document.getElementById('inv-modal-log');
    return !m2 || !m2.classList.contains('open');
  }), { what: '操作记录关上' });

  console.log('\n【14】操作记录为空时显示空状态（不是坏掉）');
  rec.logEntriesOverride = [];
  await page.click('#inv-btn-log');
  await until(() => page.evaluate(() => {
    const m2 = document.getElementById('inv-modal-log');
    if (!m2 || !m2.classList.contains('open')) return false;
    // 三种终态才算「载入完」：画出了条目 / 空状态 / 错误横幅。
    // 第一版写成「文字里没有『加载中』」——列表初始是空字符串，条件当场就成立，
    // 等于没等；本地够快看不出来，CI 慢一点就整段红（2026-08-11 踩过）。
    const body = document.getElementById('inv-log-list');
    const err = document.getElementById('inv-log-error');
    if (!body) return false;
    return body.children.length > 0 || (!!err && !err.hidden);
  }), { what: '操作记录打开并载入' });
  const emptyLogTxt = await page.textContent('#inv-log-list');
  ok('显示「还没有任何操作记录」', (emptyLogTxt||'').includes('还没有任何操作记录'), emptyLogTxt);
  await page.click('#inv-modal-log .modal-close');
  await until(() => page.evaluate(() => {
    const m2 = document.getElementById('inv-modal-log');
    return !m2 || !m2.classList.contains('open');
  }), { what: '操作记录关上' });
  rec.logEntriesOverride = null;

  console.log('\n【15】拉取操作记录失败时显示错误提示，不是白屏');
  rec.forceError = { action:'log', message:'假服务端说日志读取失败' };
  await page.click('#inv-btn-log');
  await until(() => page.evaluate(() => {
    const m2 = document.getElementById('inv-modal-log');
    if (!m2 || !m2.classList.contains('open')) return false;
    // 三种终态才算「载入完」：画出了条目 / 空状态 / 错误横幅。
    // 第一版写成「文字里没有『加载中』」——列表初始是空字符串，条件当场就成立，
    // 等于没等；本地够快看不出来，CI 慢一点就整段红（2026-08-11 踩过）。
    const body = document.getElementById('inv-log-list');
    const err = document.getElementById('inv-log-error');
    if (!body) return false;
    return body.children.length > 0 || (!!err && !err.hidden);
  }), { what: '操作记录打开并载入' });
  ok('log 错误横幅显示', await page.locator('#inv-log-error').isVisible());
  const logErrTxt = await page.textContent('#inv-log-error-text');
  ok('显示服务端的错误信息', (logErrTxt||'').includes('假服务端说日志读取失败'), logErrTxt);
  rec.forceError = null;
  await page.click('#inv-modal-log .modal-close');
  await until(() => page.evaluate(() => {
    const m2 = document.getElementById('inv-modal-log');
    return !m2 || !m2.classList.contains('open');
  }), { what: '操作记录关上' });

  console.log('\n【16】记账本身没被库存弄坏：切回明细还能记一笔');
  await page.click('#nav-transactions');
  await page.waitForTimeout(400);
  ok('明细分页显示出来', await page.locator('#tab-transactions').isVisible());
  ok('记账的 FAB 还在', await page.locator('.fab').isVisible());
  const txStillThere = await page.evaluate(() =>
    data.transactions.filter(t => t.id === 'seed_tx_1').length);
  ok('那笔种子记录仍在账本里', txStillThere === 1, txStillThere);

  // 原来独立库存页那 4 条「主屏图标必须是 PNG」的断言，现在改成守记账 App 这一条：
  // 库存不再是独立 App、没有自己的 manifest 要守了；真正该守的还是同一件事——
  // iOS 的 apple-touch-icon **不认 SVG**，写成 SVG 不会报错，只是主屏图标悄悄退化成
  // 网页截图。记账 App 是在浏览器里用 canvas 现画一张 PNG 挂上去的（setupPWA()），
  // 所以只能在真浏览器里验，读文件验不出来。
  console.log('\n【0】主屏图标必须是 PNG（iOS 不认 SVG）');
  const touchHref = await page.evaluate(() => {
    const l = document.querySelector('link[rel="apple-touch-icon"]');
    return l ? l.href.slice(0, 30) : null;
  });
  ok('apple-touch-icon 是 PNG', (touchHref||'').startsWith('data:image/png;base64,'), touchHref);

  console.log('\n【10】全程无 JS 报错');
  ok('无 JS 报错', errs.length === 0, errs.slice(0,5));

  await ctx.close();
}

// ---------- 场景三：同事版也要有库存 ----------
{
  const ctx = await browser.newContext();
  const rec = mountRoutes(ctx, { who:'Seryi' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => localStorage.setItem('staffExpense_token', 'staff-key-seryi'));

  console.log('\n【17】同事版：库存分页也在，钥匙用同事那把');
  await page.goto(STAFF_URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  ok('钥匙闸门已经放行', !(await page.locator('#staff-gate').isVisible()));
  ok('启动后没有任何库存请求（懒加载）', rec.allInvCalls.length === 0, rec.allInvCalls);
  ok('底部导航有「库存」按钮', await page.locator('#nav-inventory').isVisible());
  ok('同事版确实没有设置分页（只是库存被保留了）',
     await page.locator('#tab-settings').count() === 0);

  await page.click('#nav-inventory');
  await until(() => page.evaluate(() => {
    const tab = document.getElementById('tab-inventory');
    if (!tab || !tab.classList.contains('active')) return false;
    // 同「操作记录」那一处的教训：光看「没在加载中」会当场成立，等于没等。
    // 三种终态才算画完：列表有东西 / 提示要填钥匙 / 连不上的错误横幅。
    const list = document.getElementById('inv-list');
    const guide = document.getElementById('inv-guide-banner');
    const err = document.getElementById('inv-error-banner');
    if (!list) return false;
    return list.children.length > 0
           || (!!guide && !guide.hidden) || (!!err && !err.hidden);
  }), { what: '库存分页显示出来' });
  ok('库存分页显示出来', await page.locator('#tab-inventory').isVisible());
  ok('拉了 1 次 list', rec.listCalls.length === 1, rec.listCalls.length);
  ok('用的是同事那把钥匙 staffExpense_token',
     rec.lastToken === 'staff-key-seryi', rec.lastToken);
  const staffLocs = await page.$$eval('.inv-loc-name', els => els.map(e=>e.textContent.trim()));
  ok('同事版也正常分组渲染',
     staffLocs.includes('📍 西港') && staffLocs.includes('📍 金边'), staffLocs);
  const staffSubs = await page.$$eval('.inv-loc-sub', els => els.map(e=>e.textContent.trim()));
  ok('同事版小计也对（西港 28 瓶）', staffSubs.some(t=>t.includes('28 瓶')), staffSubs);
  const staffWho = await page.textContent('#inv-who');
  ok('同事看得见自己的名字（加减记在谁名下）', (staffWho||'').includes('Seryi'), staffWho);

  console.log('\n【18】同事版：加减、防连点、操作记录都跟老板版一样');
  rec.invCalls = [];
  await page.evaluate(() => {
    const btn = document.querySelector('.inv-item-row[data-inv-id="w1"] .inv-qty-plus');
    btn.click(); btn.click();
  });
  await page.waitForTimeout(900);
  ok('连点两下只送出 1 个请求', rec.invCalls.length === 1, rec.invCalls.length);
  ok('同事版的操作记录也是打开才拉', rec.logCalls.length === 0, rec.logCalls.length);
  await page.click('#inv-btn-log');
  await until(() => page.evaluate(() => {
    const m2 = document.getElementById('inv-modal-log');
    if (!m2 || !m2.classList.contains('open')) return false;
    // 三种终态才算「载入完」：画出了条目 / 空状态 / 错误横幅。
    // 第一版写成「文字里没有『加载中』」——列表初始是空字符串，条件当场就成立，
    // 等于没等；本地够快看不出来，CI 慢一点就整段红（2026-08-11 踩过）。
    const body = document.getElementById('inv-log-list');
    const err = document.getElementById('inv-log-error');
    if (!body) return false;
    return body.children.length > 0 || (!!err && !err.hidden);
  }), { what: '操作记录打开并载入' });
  ok('打开后拉了 1 次', rec.logCalls.length === 1, rec.logCalls.length);
  ok('列表画出来了', (await page.$$eval('.inv-log-entry', e=>e.length)) === 3);
  await page.click('#inv-modal-log .modal-close');
  await page.waitForTimeout(300);

  console.log('\n【19】同事版：库存也碰不到他自己的账本');
  const staffTx = await page.evaluate(() => data.transactions.length);
  ok('同事的交易数还是 0（库存没往账本里塞东西）', staffTx === 0, staffTx);
  ok('同事版全程无 JS 报错', errs.length === 0, errs.slice(0,5));

  await ctx.close();
}

// ---------- 场景四：按名字排序（2026-08-10 用户要求）----------
// 为什么单独开一个场景：主战场那份假数据本来就是排好序的，拿它测排序等于没测。
// 这里故意给一份「乱序 + 大小写混着 + 名字里带数字」的数据，把排序真正逼出来。
{
  const ctx = await browser.newContext();
  const rec = mountRoutes(ctx);
  rec.serverCats = [
    { key:'wine', label:'酒', defaultUnit:'瓶', items:[
      { id:'s1', name:'Pavie',        count:2, unit:'瓶', location:'西港', note:'', added_at:'2026-01-01' },
      { id:'s2', name:'茅台50年',      count:1, unit:'瓶', location:'西港', note:'', added_at:'2026-01-01' },
      { id:'s3', name:'Laffite 2012', count:1, unit:'瓶', location:'西港', note:'', added_at:'2026-01-01' },
      { id:'s4', name:'laffite 2001', count:1, unit:'瓶', location:'西港', note:'', added_at:'2026-01-01' },
      { id:'s5', name:'茅台30年',      count:1, unit:'瓶', location:'西港', note:'', added_at:'2026-01-01' },
      { id:'s6', name:'Dalmore',      count:1, unit:'瓶', location:'金边', note:'', added_at:'2026-01-01' },
      { id:'s7', name:'Zzz 喝完的',    count:0, unit:'瓶', location:'西港', note:'', added_at:'2026-01-01' },
      { id:'s8', name:'Aaa 喝完的',    count:0, unit:'瓶', location:'西港', note:'', added_at:'2026-01-01' },
    ]},
    { key:'tea',  label:'茶叶', defaultUnit:'饼', items: [] },
    { key:'herb', label:'虫草', defaultUnit:'克', items: [] },
  ];
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => localStorage.setItem('expenseTracker_companyToken', 'test-token-sort'));
  await page.goto(BOSS_URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  await page.click('#nav-inventory');
  await until(() => page.evaluate(() => {
    const tab = document.getElementById('tab-inventory');
    if (!tab || !tab.classList.contains('active')) return false;
    // 同「操作记录」那一处的教训：光看「没在加载中」会当场成立，等于没等。
    // 三种终态才算画完：列表有东西 / 提示要填钥匙 / 连不上的错误横幅。
    const list = document.getElementById('inv-list');
    const guide = document.getElementById('inv-guide-banner');
    const err = document.getElementById('inv-error-banner');
    if (!list) return false;
    return list.children.length > 0
           || (!!guide && !guide.hidden) || (!!err && !err.hidden);
  }), { what: '库存分页显示出来' });

  console.log('\n【20】列表按名字排序（不是按记录加入的先后）');
  const names = await page.locator('.inv-loc-group', { hasText:'西港' })
    .locator('.inv-item-name').allTextContents();
  const at = n => names.indexOf(n);
  ok('西港这一组 5 条都在', names.length === 5, names);
  ok('名字里的数字按数值排：laffite 2001 在 Laffite 2012 前面',
     at('laffite 2001') >= 0 && at('laffite 2001') < at('Laffite 2012'), names);
  ok('大小写不拆组：两条 laffite 挨在一起',
     Math.abs(at('laffite 2001') - at('Laffite 2012')) === 1, names);
  ok('L 排在 P 前面（Laffite 2012 → Pavie）', at('Laffite 2012') < at('Pavie'), names);
  ok('中文按拼音排：茅台30年 在 茅台50年 前面', at('茅台30年') < at('茅台50年'), names);

  console.log('\n【20b】存放位置本身也排序，已用完那一区也排序');
  const locs = await page.$$eval('.inv-loc-name', els => els.map(e=>e.textContent.trim()));
  ok('金边（j）排在西港（x）前面', locs.indexOf('📍 金边') < locs.indexOf('📍 西港'), locs);
  const usedNames = await page.locator('details.inv-used-up .inv-item-name').allTextContents();
  ok('已用完的两条也按名字排', usedNames.indexOf('Aaa 喝完的') < usedNames.indexOf('Zzz 喝完的'), usedNames);

  console.log('\n【20c】分享出去的文字跟屏幕上的顺序一致（对方念第几行＝你看第几行）');
  const shareCalls2 = [];
  await page.exposeFunction('__recordShare2', (opts) => { shareCalls2.push(opts); });
  await page.evaluate(() => {
    navigator.share = (opts) => { window.__recordShare2(opts); return Promise.resolve(); };
  });
  await page.click('#inv-btn-share-all');
  await page.waitForTimeout(400);
  const txt = shareCalls2[0]?.text || '';
  // 第一行是标题「🍷 酒库存（日期）」，也以 🍷 开头，要先切掉再取条目行
  const shareOrder = txt.split('\n').slice(1)
    .filter(l => l.startsWith('🍷 ')).map(l => l.slice(2).replace(/ x\d+$/, '').trim());
  const expected = ['Dalmore', ...names];   // 金边那组在前，然后西港那组，顺序照屏幕
  ok('分享文字里的条目顺序 = 屏幕上的顺序',
     JSON.stringify(shareOrder) === JSON.stringify(expected), { shareOrder, expected });

  ok('排序场景全程无 JS 报错', errs.length === 0, errs.slice(0,5));
  await ctx.close();
}

// ---------- 场景五：库存页上不该有记账球（2026-08-10 用户发现）----------
// 记账球是 position:fixed，跟分页无关，切到库存页照样浮在右下角，
// 跟库存自己的「＋ 添加」撞成两个加号——点错就开出记账表单。
for (const [who, url, token, homeNav] of [
  ['老板版', BOSS_URL,  'expenseTracker_companyToken', '#nav-overview'],
  ['同事版', STAFF_URL, 'staffExpense_token',          '#nav-transactions'],
]) {
  const ctx = await browser.newContext();
  mountRoutes(ctx, { who:'Seryi' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(k => localStorage.setItem(k, 'test-token-fab'), token);
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);

  console.log(`\n【21】${who}：记账球只在记账的分页出现`);
  ok('记账分页上记账球在（这是主要用途，不能连它一起藏掉）',
     await page.locator('.fab').isVisible());
  await page.click('#nav-inventory');
  await until(() => page.evaluate(() => {
    const tab = document.getElementById('tab-inventory');
    if (!tab || !tab.classList.contains('active')) return false;
    // 同「操作记录」那一处的教训：光看「没在加载中」会当场成立，等于没等。
    // 三种终态才算画完：列表有东西 / 提示要填钥匙 / 连不上的错误横幅。
    const list = document.getElementById('inv-list');
    const guide = document.getElementById('inv-guide-banner');
    const err = document.getElementById('inv-error-banner');
    if (!list) return false;
    return list.children.length > 0
           || (!!guide && !guide.hidden) || (!!err && !err.hidden);
  }), { what: '库存分页显示出来' });
  ok('切到库存页，记账球不见了', !(await page.locator('.fab').isVisible()));
  ok('库存自己的「＋ 添加」还在（页面上只剩这一个加号）',
     await page.locator('#inv-btn-add').isVisible());
  await page.click(homeNav);
  await page.waitForTimeout(500);
  ok('切回记账分页，记账球又回来了', await page.locator('.fab').isVisible());
  ok('全程无 JS 报错', errs.length === 0, errs.slice(0,5));
  await ctx.close();
}

await browser.close();

console.log(`\n结果：${pass} 通过，${fails.length} 失败`);
if (fails.length) {
  console.log('失败项：' + fails.join('；'));
  process.exit(1);
}
console.log('全绿');
