// 同事版报账页（staff/index.html）的浏览器自检。
//
// 跑法：
//   python3 -m http.server 8899 &
//   node tools/check-staff-page.mjs
//   （沙盒里浏览器装在别处时加 CHROMIUM_PATH=/opt/pw-browsers/chromium）
// CI 见 .github/workflows/staff-page-check.yml。
//
// 这个页面是**生成**的（tools/build-staff-page.py 从 expense-tracker.html 生成），
// 所以这份检查要守的有两类东西：
//
// 1. 生成器真的把该拿掉的拿掉了——概览/统计/设置、账户切换、云同步入口。
//    断言方式是 count() === 0（DOM 里根本没有），不是「不可见」：藏起来的东西
//    去掉一个 class 就回来了，没生成进来的东西回不来。
// 2. 拿掉之后**剩下的功能还是好的**——共用脚本里有几十处 getElementById，
//    删错一个就当场抛错、记账整个不能用。所以从填钥匙一路走到送出、删除、离线补送。
//
// 用假服务端（route 拦截）跑，不碰真的 butler，也不需要任何钥匙。
import { chromium } from 'playwright';

const PORT = 8899;
const BASE = `http://localhost:${PORT}/staff/index.html`;
const APP = `http://localhost:${PORT}/expense-tracker.html`;
const BUTLER = 'https://butler-bot.jarixhew.workers.dev';

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);

let pass = 0;
const fails = [];
/**
 * 等条件成立，而不是死等固定时间（2026-08-11 提速改造，做法与 check-expense-company.mjs 一致）。
 * 注意：断言「某件事没有发生」的地方不能用它——等一件不会发生的事只能真的等，
 * 那些 waitForTimeout 都留着。
 */
async function until(fn, { timeout = 8000, interval = 20, what = '条件' } = {}) {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - t0 > timeout) throw new Error(`等不到「${what}」（超时 ${timeout}ms）`);
    await new Promise(r => setTimeout(r, interval));
  }
}
/** 记账弹窗是开着还是关着（overlay 拿到 .open 才算开）。 */
const txModalOpen = page => page.evaluate(() => {
  const m = document.getElementById('modal-add-tx');
  return !!m && m.classList.contains('open');
});

/**
 * 拆成两半并行跑（2026-08-11 加，为了压 CI 墙上时间）。
 *   PART=1 只跑前半，PART=2 只跑后半，不设环境变量就整份跑（本地默认）。
 * want() 每个场景块都会调用一次，所以计数不受跳过影响，两半加起来 = 整份。
 * 注意：开头那条共用 main 上下文的链（【1】到【4】那几块）必须整条留在前半，
 * 分开跑会拿到没登录的页面。
 */
const PART = Number(process.env.PART || 0);
const SPLIT_AT = 14;           // 前半 = 第 1～14 块（含 main 那条链），后半 = 其余
let _blk = 0;
const want = () => { _blk++; return !PART || (PART === 1 ? _blk <= SPLIT_AT : _blk > SPLIT_AT); };

const ok = (name, cond, got) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fails.push(name); console.log(`  ❌ ${name} —— 实际: ${JSON.stringify(got)}`); }
};

const SERYI_KEY = 'seryi-key-xyz';
const BOSS_KEY = 'boss-key-abc';

// 老板 App 首屏那张「公司账本（全员）」用的假账本。日期**故意不是今天**：
// 真实踩过的情形就是同事拍旧收据、OCR 把票面日期填进去，那笔记到别天，老板看到
// 今天合计 $0.00 以为账没进系统。断言要守住「0 的旁边有话说清楚」。
const LEDGER_DAY = '2026-01-05';
const R_SERYI = { id:'rec_1', date:LEDGER_DAY, categoryEn:'Lunch', billNo:'1', side:'assist',
                  person:'Seryi', reporter:'Seryi', amountUsd:4.49, note:null, hasPhoto:true };
const R_KUANG = { id:'rec_2', date:LEDGER_DAY, categoryEn:'Store', billNo:'1', side:'boss',
                  person:'Boss', reporter:'Kuang', amountUsd:20.00, note:null, hasPhoto:false };
const LEDGER_FIXTURE = {
  status:'ok', month:'2026-01', scope:'owner',
  days:[{ date:LEDGER_DAY, count:2, total:24.49, missingPhoto:1,
          // 一天里按「谁记的」分块，服务端算好送过来（App 一个数都不自己加）
          byReporter:[
            { name:'Seryi', count:1, total:4.49,  missingPhoto:0, records:[R_SERYI] },
            { name:'Kuang', count:1, total:20.00, missingPhoto:1, records:[R_KUANG] },
          ],
          records:[R_SERYI, R_KUANG] }],
  count:2, total:24.49, missingPhoto:1,
  byPerson:[{ name:'Boss', count:1, total:20.00 }, { name:'Seryi', count:1, total:4.49 }],
  byReporter:[{ name:'Seryi', count:1, total:4.49 }, { name:'Kuang', count:1, total:20.00 }],
  orphan:0,
};

// 假 butler：只认一把钥匙，按钥匙回身份。「看不到别人的记录」那条守在服务端
// （butler-bot 的 tests/staff-access.test.mjs），这份只守页面这一侧。
function makeBook() {
  return {
    [SERYI_KEY]: { status:'ok', reporter:'Seryi', month:'2026-08', total:0, missingPhoto:0, records:[] },
  };
}

async function newPage({ offline = false, lang = 'zh', tz = null } = {}) {
  const ctx = await browser.newContext(tz ? { timezoneId: tz } : {});
  // 明确钉住语言再断言文案：headless Chromium 的 navigator.language 是 en-US，
  // 靠「默认语言」写断言会全挂。只在还没有选择时写入，否则 addInitScript 会在
  // 刷新时把用户刚点的语言盖掉，「刷新后记住选择」那条就永远测不出来（踩过）。
  await ctx.addInitScript(l => {
    if (!localStorage.getItem('siteLangUser')) localStorage.setItem('siteLangUser', l);
  }, lang);
  const posted = [];
  const book = makeBook();
  // 备用金：测试可以改 petty.row 来摆布服务端回什么（null = 还没设起点）
  const petty = { row: null, fail: false };
  // 就地改：测试把 editFails 设成 true 就能制造「账本改不成」，用来验本机不会偷偷改掉
  const edit = { fails: false };
  const aiProxyCalls = [];   // 拍收据时打去 /ai-proxy 的请求
  let mode = offline ? 'offline' : 'online';
  let nextNo = 7;
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}`)) return route.continue();
    // 外部网域一律挡掉（酒店 WiFi / 白名单网络就是这样），顺带证明页面不靠 CDN 才能用
    if (!u.startsWith(BUTLER)) return route.abort('failed');
    if (mode === 'offline') return route.abort('failed');
    const h = { 'Access-Control-Allow-Origin': '*' };
    // 拍收据的 AI 识别转发。同事版没有设置页填不了 AI key，靠公司报账密钥换服务端
    // 那把共用 key（2026-08-13）——这里只记下请求长什么样，交给断言检查。
    if (u.startsWith(BUTLER + '/ai-proxy')) {
      aiProxyCalls.push(JSON.parse(route.request().postData() || '{}'));
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ text: '{"amount":12.34,"date":null,"merchant":"Test Shop"}' }) });
    }
    if (route.request().method() === 'GET') {
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({
          categories:['Beverage','Dinner','Driver Meal','Lunch','Petrol','Store'],
          plateCategories:['Petrol'],
          // 正餐清单 + 「这一餐是老板的」该送什么原文（butler 的 BOSS_MEAL_RAW）
          mealCategories:[{label:'Lunch', bossRaw:'老板午餐'}, {label:'Dinner', bossRaw:'老板晚餐'}],
          people:[{code:'Boss',label:'Boss'},{code:'Seryi',label:'Seryi',ownMeals:['Breakfast','Lunch','Dinner']}],
        }) });
    }
    const req = JSON.parse(route.request().postData() || '{}');
    posted.push(req);
    // 全员账本：只有老板那把钥匙拿得到，同事的钥匙回 forbidden（跟真服务端一样）。
    // 放在 book 检查之前，因为老板的钥匙不在同事名册里。
    if (req.action === 'ledger')
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify(req.token === BOSS_KEY ? LEDGER_FIXTURE
          : { status:'forbidden', message:'这个功能只有老板的钥匙能用' }) });
    if (!book[req.token]) return route.fulfill({ status:401, contentType:'application/json',
      headers:h, body: JSON.stringify({ error:'密钥不对' }) });
    if (req.action === 'petty') {
      if (petty.fail) return route.abort('failed');
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'ok', scope:'staff',
          people: [petty.row || { person:'Seryi', status:'unset', balance:null, topups:[], spent:0 }] }) });
    }
    if (req.action === 'mine')
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify(book[req.token]) });
    if (req.action === 'delete')
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'ok' }) });
    // 就地改（2026-08-13 起服务端有这个动作）：person 按新类别重算，别的字段不动
    if (req.action === 'edit') {
      if (edit.fails) return route.fulfill({ status:400, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'error', message:'假服务端故意让这次改失败' }) });
      const c = String(req.categoryRaw || '');
      const person = (!/老板|boss/i.test(c) && ['Breakfast','Lunch','Dinner'].includes(c))
        ? 'Seryi' : 'Boss';
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'ok', record:{ id:req.recordId, person, amountUsd:req.amount } }) });
    }
    // 认不得的 action 一律拒绝。别把它当成「新增」——真服务端不会那样做，
    // 而且会让「送出了几笔」这类断言被别的请求悄悄污染（踩过：同事版误调 ledger，
    // 假服务端当成新增，单号就多跳了一号）。
    if (req.action) return route.fulfill({ status:400, contentType:'application/json', headers:h,
      body: JSON.stringify({ status:'error', message:'假服务端不认得这个 action：' + req.action }) });
    // 新增：照 butler 的规则回一个号和归属（自己吃的正餐算自己，其余算 Boss）
    // 原文带「老板」两字的一律 Boss（butler 的 forceBoss），即使是他自己那几餐
    const cat = String(req.items?.[0]?.categoryRaw || '');
    const person = (!/老板|boss/i.test(cat) && ['Breakfast','Lunch','Dinner'].includes(cat))
      ? 'Seryi' : 'Boss';
    return route.fulfill({ status:200, contentType:'application/json', headers:h,
      body: JSON.stringify({ status:'ok',
        records:[{ id:'rec_'+(nextNo), person, refTag:String(nextNo++) }] }) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  // 弹出的对话框内容留下来：有些提示（例如「这台手机存不住记录」）就是用 alert 说的，
  // 一律 accept 掉的话断言就看不到它说了什么
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  // book 交出去：测「从公司账本找回记录」时要能摆布服务端手上有哪几笔
  return { ctx, page, posted, errs, book, dialogs, petty, edit, aiProxyCalls,
           setMode: m => { mode = m; } };
}

/** 填钥匙进门，返回已经进到主界面的 page。 */
async function signIn(h) {
  await h.page.goto(BASE, { waitUntil:'domcontentloaded' });
  await h.page.fill('#staff-gate-key', SERYI_KEY);
  await h.page.click('#staff-gate-btn');
  await h.page.waitForTimeout(900);
  return h;
}

/**
 * 按键输入金额（不是 fill）。
 * 用 pressSequentially 是刻意的：金额栏一旦被改回 type="number"，playwright 的
 * fill 会直接抛错、整份自检崩掉；逐键输入则跟真人一样——逗号被输入框吞掉、
 * 值变成空的，断言才会给出一个干净的红灯，看得出是「金额没进去」而不是脚本坏了。
 */
async function typeAmount(page, text) {
  const el = page.locator('#tx-amount');
  await el.click();
  await el.press('ControlOrMeta+a').catch(() => {});
  await el.pressSequentially(String(text), { delay: 20 });
}

/** 走一遍完整的记一笔（金额 + 类别 [+ 车牌]）。 */
async function addOne(page, { amount, category, plate } = {}) {
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await typeAmount(page, amount);
  await page.selectOption('#tx-company-category', category);
  await page.waitForTimeout(200);
  if (plate) await page.fill('#tx-company-plate', plate);
  await page.click('button[onclick="saveTx()"]');
  await until(async () => !(await txModalOpen(page)), { what: '这一笔存好、弹窗关上' });
  await page.waitForTimeout(100);   // 让送出与本机写入收尾
}

// ---------- 【1】没钥匙时的样子 ----------
console.log('【1】还没填钥匙：闸门盖着，什么都看不到');
if (want()) {
  const h = await newPage();
  await h.page.goto(BASE, { waitUntil:'domcontentloaded' });
  await h.page.waitForTimeout(500);
  ok('闸门盖着', await h.page.locator('#staff-gate').isVisible());
  // 闸门必须写死在 HTML 里、默认就盖着——等脚本跑完才盖的话，网慢时会先闪一下内容
  const gateInHtml = await h.page.evaluate(() =>
    !document.getElementById('staff-gate').classList.contains('off'));
  ok('闸门是 HTML 默认状态，不是脚本事后盖上的', gateInHtml);
  await h.page.fill('#staff-gate-key', 'wrong-key');
  await h.page.click('#staff-gate-btn');
  await h.page.waitForTimeout(700);
  ok('钥匙错 → 当场说，不放进去', await h.page.locator('#staff-gate').isVisible());
  ok('提示写明是钥匙的问题',
     /钥匙不对|Wrong key/.test(await h.page.textContent('#staff-gate-msg')),
     await h.page.textContent('#staff-gate-msg'));
  ok('无 JS 报错', h.errs.length === 0, h.errs);
  await h.ctx.close();
}

// ---------- 【2】生成器有没有真的把个人账本那些块拿掉 ----------
console.log('\n【2】个人账本的界面是「没生成进来」，不是「藏起来」');
let main;
if (want()) {
  main = await signIn(await newPage());
  const { page } = main;
  ok('进到主界面（闸门收起）', !(await page.locator('#staff-gate').isVisible()));

  // count()===0 = DOM 里根本没有这个东西。用「不可见」写断言是不够的：
  // 藏起来的东西去掉一个 class 就回来了，没生成进来的回不来。
  const gone = [
    ['概览页', '#tab-overview'], ['统计页', '#tab-analytics'], ['设置页', '#tab-settings'],
    ['概览按钮', '#nav-overview'], ['统计按钮', '#nav-analytics'], ['设置按钮', '#nav-settings'],
    ['账户切换弹窗', '#modal-acc-switch'], ['新增账户弹窗', '#modal-add-acc'],
    ['新增类别弹窗', '#modal-add-cat'], ['循环账单弹窗', '#modal-add-recurring'],
  ];
  for (const [label, sel] of gone) {
    ok(`${label}根本不在页面里`, (await page.locator(sel).count()) === 0,
       await page.locator(sel).count());
  }
  // 云同步/账户切换按钮留在 DOM 里（共用脚本会读），但必须看不见、点不到
  ok('云同步图标看不见', !(await page.locator('#hdr-cloud').isVisible()));
  ok('账户切换按钮看不见', !(await page.locator('#hdr-acc-pill').isVisible()));
  // 底部只有「明细」「老板账」「库存」三个入口，而老板账要有口令才看得见——
  // 没口令的同事看到的是明细＋库存两个按钮。
  // 库存是 2026-08-10 从独立的 inventory/index.html 并进来的第五个分页：老板与同事在
  // 服务端的库存权限相同，所以生成同事版时**刻意保留**（概览/统计/设置那三个才删）。
  // 这条守的是「除了这三个之外没有别的入口漏进来」，不是「必须是 2 个」。
  ok('底部只有明细/老板账/库存三个入口', (await page.locator('.nav-btn').count()) === 3,
     await page.locator('.nav-btn').count());
  ok('没填口令时看不到老板账入口', !(await page.locator('#nav-boss').isVisible()));
  ok('库存入口在（同事也要能查库存）', await page.locator('#nav-inventory').isVisible());
  ok('概览/统计/设置三个入口一个都没有',
     (await page.locator('#nav-overview, #nav-analytics, #nav-settings').count()) === 0);
  // 设置页里的东西一个都不该在（脚本里可能还留着用不到的函数，那不影响；
  // 要守的是 DOM 里没有任何可以点到的入口）
  ok('没有云同步的界面', (await page.locator('#cloud-status-text').count()) === 0);
  ok('没有 AI 识别 key 的输入框', (await page.locator('#ai-key-input').count()) === 0);
  ok('没有填公司密钥的输入框（钥匙走闸门，不走设置）',
     (await page.locator('#company-token-input').count()) === 0);
  ok('无 JS 报错', main.errs.length === 0, main.errs);
}

// ---------- 【3】身份由钥匙决定 ----------
console.log('\n【3】身份由钥匙决定，页面上没得选');
if (want()) {
  const { page } = main;
  ok('标题显示服务端认出的名字 Seryi',
     (await page.textContent('#hdr-title')).includes('Seryi'), await page.textContent('#hdr-title'));
  // 同事回报问题时第一件要确认的就是「你手上是哪一版」——版本号必须在页面上看得到
  ok('页面上看得到版本号', /\d{4}-\d{2}-\d{2}/.test(await page.textContent('#staff-build-note')),
     await page.textContent('#staff-build-note'));
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  ok('「谁报的账」看不见（选不了也就选不错）', !(await page.locator('#tx-reporter-group').isVisible()));
  ok('单据号栏看不见（号由服务端派）', !(await page.locator('#tx-reftag-group').isVisible()));
  ok('收入/支出切换看不见（同事只会有支出）', !(await page.locator('#tx-type-tabs').isVisible()));
  ok('瑞尔按钮看不见（公司账本记美元）', !(await page.locator('#tx-riel-toggle').isVisible()));
  ok('备注栏看不见', !(await page.locator('#tx-desc-group').isVisible()));
  ok('公司类别下拉看得见', await page.locator('#tx-company-category').isVisible());
  const cats = await page.$$eval('#tx-company-category option', e => e.map(o => o.value));
  ok('类别来自服务端（含 Driver Meal）', cats.includes('Driver Meal') && cats.includes('Store'), cats);
  ok('日期默认填好了', (await page.inputValue('#tx-date')).length === 10, await page.inputValue('#tx-date'));
  // 收据照片：必须**两个**独立 input。只放一个的话，加 capture 就只能开相机、
  // 去掉 capture 那台 Android 又只弹相册——两次实机都踩到（2026-08-07）。
  const cam = await page.$eval('#attach-camera-input',
    e => ({ capture: e.getAttribute('capture'), accept: e.getAttribute('accept') }));
  const lib = await page.$eval('#attach-gallery-input',
    e => ({ capture: e.getAttribute('capture'), accept: e.getAttribute('accept') }));
  ok('拍照那个 input 带 capture（点了直接开相机）', cam.capture === 'environment', cam);
  ok('相册那个 input 不带 capture（点了才会出相册）', lib.capture === null, lib);
  ok('两个都只收图片', cam.accept === 'image/*' && lib.accept === 'image/*', { cam, lib });
  await page.click('#modal-add-tx .modal-close');
  await until(async () => !(await txModalOpen(page)), { what: '弹窗关上' });
}

// ---------- 【4】记一笔：送出去的内容必须对 ----------
console.log('\n【4】记一笔');
if (want()) {
  const { page, posted, errs } = main;
  posted.length = 0;
  await addOne(page, { amount: 12.34, category: 'Lunch' });
  const p = posted.find(x => !x.action);
  ok('送出了一个新增请求', !!p, posted.map(x => x.action || 'add'));
  ok('带了钥匙', p && p.token === SERYI_KEY, p && p.token);
  // 身份以服务端从钥匙推出来的为准。页面这边也不许写别人——写死成登录的那个人。
  ok('reporter 就是钥匙对应的人（不是页面上选的）', p && p.reporter === 'Seryi', p && p.reporter);
  ok('金额原样送出，没在本地换算', p && p.items[0].amount === 12.34, p && p.items[0]);
  ok('币种是美元（公司账本记美元）', p && p.items[0].currency === 'USD', p && p.items[0].currency);
  ok('类别原样送出', p && p.items[0].categoryRaw === 'Lunch', p && p.items[0].categoryRaw);
  ok('不带备注（同事版没有这一栏）', p && !p.items[0].note, p && p.items[0].note);
  ok('不自己填单据号（留给服务端派）', p && !p.items[0].refTag, p && p.items[0].refTag);
  // 单号是同事唯一必须记住的信息——保存后必须当场告诉他写几号
  const toastTxt = await page.textContent('#toast');
  ok('保存后告诉他单据写几号', /7/.test(toastTxt) && /单据写|Write No/.test(toastTxt), toastTxt);
  // 全员账本是老板专用的（服务端只认老板的钥匙）。同事版连问都不该问——
  // 问了必被拒，白费一次请求，还会让人以为同事那边也能看到全员的数
  ok('从头到尾没去问过全员账本', posted.every(x => x.action !== 'ledger'),
     posted.map(x => x.action || 'add'));
  ok('记录出现在清单里', (await page.locator('#tx-list .tx-item').count()) === 1,
     await page.locator('#tx-list .tx-item').count());
  const listTxt = await page.textContent('#tx-list');
  ok('清单上标着单号', listTxt.includes('7'), listTxt.slice(0, 200));
  ok('无 JS 报错', errs.length === 0, errs);
}

// ---------- 【5】本月合计 + 缺收据标红 ----------
console.log('\n【5】本月合计与缺收据提醒');
if (want()) {
  const { page } = main;
  const sum = await page.textContent('#staff-summary');
  // 「今天合计」摆在最上面：同事每天要在纸单上抄当天总数，这就是他要抄的那个数
  ok('显示今天合计', /今天合计/.test(sum), sum);
  ok('显示本月合计', /本月合计/.test(sum) && /12\.34/.test(sum), sum);
  ok('显示笔数', /1/.test(sum), sum);
  // 清单里每一天也要带当天小计（翻回前几天核对时用）
  const dayTotals = await page.$$eval('.staff-day-total', els => els.map(e => e.textContent.trim()));
  ok('清单里每天一行小计', dayTotals.length === 1 && dayTotals[0].includes('12.34'), dayTotals);
  // 用户明确要的：缺收据照样能记，但要**明显标红**提醒（2026-08-07 拍板）
  ok('这笔没拍照 → 出现缺收据提醒', /没有收据照片|without a receipt/.test(sum), sum);
  ok('缺收据提醒用醒目样式，不是普通灰字',
     (await page.locator('.staff-sum-warn').count()) === 1);
}

// ---------- 【6】车牌类项目 ----------
console.log('\n【6】汽油这类项目要填车牌');
if (want()) {
  const { page, posted } = main;
  posted.length = 0;
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await page.fill('#tx-amount', '50');
  await page.selectOption('#tx-company-category', 'Petrol');
  await page.waitForTimeout(300);
  ok('选 Petrol → 车牌栏出现', await page.locator('#tx-company-plate-wrap').isVisible());
  await page.click('button[onclick="saveTx()"]');
  await page.waitForTimeout(500);
  ok('没填车牌不给送', /车牌|plate/i.test(await page.textContent('#toast')),
     await page.textContent('#toast'));
  ok('也真的没送出去', posted.filter(x => !x.action).length === 0, posted);
  await page.fill('#tx-company-plate', 'NS6868');
  await page.click('button[onclick="saveTx()"]');
  await until(async () => !(await txModalOpen(page)), { what: '这一笔存好、弹窗关上' });
  await page.waitForTimeout(100);   // 让送出与本机写入收尾
  const p = posted.find(x => !x.action);
  ok('填了车牌就能送', !!p && p.items[0].plate === 'NS6868', p && p.items[0]);
  await page.selectOption('#tx-company-category', 'Lunch').catch(() => {});
}

// ---------- 【7】删掉自己记错的 ----------
console.log('\n【7】删掉自己记错的（删本机的同时也删公司账本那条）');
if (want()) {
  const { page, posted } = main;
  posted.length = 0;
  const before = await page.locator('#tx-list .tx-item').count();
  await page.click('#tx-list .tx-item');
  await page.waitForTimeout(400);
  ok('点记录能打开编辑弹窗', await page.locator('#modal-add-tx').isVisible());
  ok('弹窗里有删除键', await page.locator('button[onclick="deleteTx()"]').isVisible());
  await page.click('button[onclick="deleteTx()"]');
  await page.waitForTimeout(1000);
  const d = posted.find(x => x.action === 'delete');
  // 关键：本机删了、公司账本没删的话，月底 Excel 里那笔还在——必须两边一起删
  ok('同时去删公司账本那条', !!d, posted.map(x => x.action || 'add'));
  ok('删除请求带了钥匙和记录 id', !!d && d.token === SERYI_KEY && !!d.recordId, d);
  ok('清单少一笔', (await page.locator('#tx-list .tx-item').count()) === before - 1,
     await page.locator('#tx-list .tx-item').count());
}

// ---------- 【8】双语 ----------
console.log('\n【8】中英双语（同事不一定读中文）');
if (want()) {
  const { page } = main;
  ok('先是中文', (await page.textContent('body')).includes('本月合计'));
  await page.click('#staff-lang-btn');
  await page.waitForTimeout(500);
  const en = await page.textContent('body');
  ok('切到英文：合计跟着变', en.includes('This month'), null);
  ok('切到英文：缺收据提醒也跟着变', /without a receipt/.test(en), null);
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  const enForm = await page.textContent('#modal-add-tx');
  ok('切到英文：表单也是英文', enForm.includes('New expense') && enForm.includes('Save'), null);
  ok('切到英文：栏位标签也是英文', enForm.includes('Category') && enForm.includes('Date'), null);
  await page.click('#modal-add-tx .modal-close');
  await until(async () => !(await txModalOpen(page)), { what: '弹窗关上' });
  // 全站共用的语言 key，跟仓库里其他双语页面一致
  ok('语言选择存进全站共用的 siteLangUser',
     (await page.evaluate(() => localStorage.getItem('siteLangUser'))) === 'en');
  await page.reload({ waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  ok('刷新后记住英文', (await page.textContent('body')).includes('This month'));
  ok('刷新后不用再填钥匙', !(await page.locator('#staff-gate').isVisible()));
  await main.ctx.close();
}

// ---------- 【9】离线：不能静静丢掉一笔 ----------
console.log('\n【9】没网时记账：存本机、有网自动补送（这是最容易丢钱的地方）');
if (want()) {
  const h = await signIn(await newPage());
  const { page, posted, errs, setMode } = h;
  setMode('offline');
  posted.length = 0;
  await addOne(page, { amount: 9.99, category: 'Dinner' });
  const t = await page.textContent('#toast');
  // 措辞分两种：真的没网 vs 有网但连不上服务器。都必须说清「已存本机」，
  // 但不能一律说成「没网络」——用户开着 4G 看到「没网」完全没法排查（2026-08-07 实机反馈）。
  ok('提示已存本机（没有假装成功）', /已存|存起来|saved/i.test(t), t);
  ok('这笔在清单里，标着还没送出', /待送出|not sent/.test(await page.textContent('#tx-list')),
     await page.textContent('#tx-list'));
  const q = await page.evaluate(() => JSON.parse(localStorage.getItem('staffExpense_queue') || '[]'));
  ok('这笔真的进了补送队列，没丢', q.length === 1, q);

  setMode('online');
  posted.length = 0;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(1500);
  const sent = posted.find(x => !x.action && x.items?.[0]?.amount === 9.99);
  ok('有网后自动补送出去', !!sent, posted.map(x => x.action || 'add'));
  ok('补送时也带钥匙', !!sent && sent.token === SERYI_KEY, sent && sent.token);
  const q2 = await page.evaluate(() => JSON.parse(localStorage.getItem('staffExpense_queue') || '[]'));
  ok('送出去之后队列清空（不会重复送）', q2.length === 0, q2);
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【9b】刷新之后记录还在 ----------
console.log('\n【9b】刷新／重开页面，之前记的还在（同事一天会开关很多次）');
if (want()) {
  const h = await signIn(await newPage());
  const { page, errs, setMode } = h;
  await addOne(page, { amount: 3.30, category: 'Beverage' });
  await addOne(page, { amount: 6.70, category: 'Lunch' });
  // 再记一笔没网的：这笔只在本机、还等着补送，被冲掉就是真的丢钱
  setMode('offline');
  await addOne(page, { amount: 8.80, category: 'Dinner' });
  setMode('online');

  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(1500);
  const n = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('staffExpense_v2') || '{}').transactions || []).length);
  ok('刷新后本机账本里还是 3 笔', n === 3, n);
  const list = await page.textContent('#tx-list');
  ok('刷新后清单里看得到（3.30）', list.includes('3.30'), list.slice(0, 300));
  ok('刷新后清单里看得到（6.70）', list.includes('6.70'));
  ok('刷新后连没送出的那笔也还在', list.includes('8.80'));
  const sum = await page.textContent('#staff-summary');
  ok('本月合计跟着还在（18.80）', sum.replace(/\s+/g,'').includes('18.80'), sum);
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【9c】换手机／清过数据之后，从公司账本找回 ----------
console.log('\n【9c】清掉本机数据后，能从公司账本把自己报过的找回来');
if (want()) {
  const h = await signIn(await newPage());
  const { page, posted, errs, book } = h;
  // 模拟「清了浏览器数据／换手机」：账本没了，钥匙还在。
  // 此刻服务端手上也还没有他的记录，所以开页面时的自动补回没东西可补——
  // 这一组测的是**手动**按「找回本月记录」，先把自动那条路排除掉（自动那条在【9d】）
  await page.evaluate(() => localStorage.removeItem('staffExpense_v2'));
  await page.reload({ waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  ok('清掉之后清单确实是空的', /还没有记录|Nothing recorded/.test(await page.textContent('#tx-list')),
     await page.textContent('#tx-list'));

  // 现在服务端有他本月报过的两笔（模拟他之前在别的手机上报的）
  book[SERYI_KEY].records = [
    { id:'srv_1', date:'2026-08-02', categoryEn:'Lunch',   billNo:'1', side:'assist',
      amountUsd:4.49, originalAmount:null, note:null, hasPhoto:true },
    // 车牌类项目服务端存的就是 "Petrol (车牌)"（见 butler 的 plateLabelOf），照实摆
    { id:'srv_2', date:'2026-08-03', categoryEn:'Petrol (2AB-1234)', billNo:'2', side:'boss',
      amountUsd:20.00, originalAmount:null, note:null, hasPhoto:false },
  ];

  posted.length = 0;
  await page.click('#staff-restore-btn');
  await page.waitForTimeout(1200);
  const list = await page.textContent('#tx-list');
  ok('找回第一笔（4.49）', list.includes('4.49'), list.slice(0, 300));
  ok('找回第二笔（20.00）', list.includes('20.00'));
  const sum = await page.textContent('#staff-summary');
  ok('本月合计跟着回来（24.49）', sum.replace(/\s+/g,'').includes('24.49'), sum);

  // 最贵的一条：找回来的必须标成「已送出」，绝不能再送一次——
  // butler 那边是追加不是覆盖，重送就是公司账本里多一条、金额翻倍
  ok('找回来的不标成待送出', !/待送出|not sent/.test(list), list.slice(0, 300));
  const q = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('staffExpense_queue') || '[]'));
  ok('没有被塞进补送队列', q.length === 0, q);
  ok('没有偷偷重新报一次账', !posted.some(x => !x.action), posted.map(x => x.action || 'add'));
  // 真正会让钱翻倍的路径：找回来的那笔如果没标成「已送出」，同事一编辑它
  // saveTx 就当成还没报过、真的再送一次。所以要走一遍编辑，确认一个字都没送出去。
  posted.length = 0;
  await page.click('.tx-item >> nth=1');   // 第 2 条是 08-02 那笔午餐（清单按日期倒序）
  await page.waitForTimeout(500);
  // 2026-08-08 起表单会锁住（见【18】），所以这里直接绕过锁硬存一次——
  // 要测的是「就算改得动，也绝不会再报一次账」
  await page.evaluate(() => {
    const el = document.getElementById('tx-amount');
    el.disabled = false; el.value = '99.99';
    saveTx();
  });
  await page.waitForTimeout(1000);
  ok('编辑找回来的那笔，不会再报一次账', !posted.some(x => !x.action),
     posted.map(x => x.action || 'add'));
  // 2026-08-13 前这里验的是「提示说改不了」；现在改得动了，改成验它走的是 edit——
  // 要守的那件事没变：找回来的那笔绝不能被当成没报过、再报一次账（上一条断言）。
  ok('走的是 edit（就地改），不是再报一次账',
     posted.some(x => x.action === 'edit'), posted.map(x => x.action || 'add'));
  // 编辑时 tx.company 是整个重组的，recordId 不带过来就丢了——丢了以后这笔在 App 里
  // 删不掉公司账本那条（本机没了、账本还留着），找回时也会当成新的再拉一遍
  const ids = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('staffExpense_v2') || '{}').transactions || [])
      .map(t => t.company && t.company.recordId));
  ok('编辑之后 recordId 还在（删除和去重都靠它）', ids.filter(Boolean).length === 2, ids);
  // 被挡下来的保存不会关弹窗（保存成功才关），弹窗盖着下面的按钮点不到
  await page.evaluate(() => closeModal('modal-add-tx'));
  await page.waitForTimeout(300);

  // 按第二下不该变出重复的
  await page.click('#staff-restore-btn');
  await page.waitForTimeout(1200);
  const n = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('staffExpense_v2') || '{}').transactions || []).length);
  ok('再按一次不会重复（还是 2 笔）', n === 2, n);
  ok('第二次提示「都在了」', /都在了|already here/.test(await page.textContent('#toast')),
     await page.textContent('#toast'));
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【9f】金额栏要收得下人真的会打出来的写法 ----------
console.log('\n【9f】用逗号当小数点也要记得进去（手机键盘很多语言就是逗号）');
if (want()) {
  const h = await signIn(await newPage());
  const { page, posted, errs } = h;

  // 2026-08-07 Seryi 实机：手打「5,45」怎么都存不进去。原因是金额栏原本是
  // type="number"，逗号让它判定不合法、.value 回空字符串——画面上有数字，
  // 程序拿到的是空的。当天有收据那笔（OCR 自动填、带小数点）和整数那笔都进得去，
  // 只有手打小数的进不去，正是这个毛病的形状。
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await typeAmount(page, '5,45');
  await page.selectOption('#tx-company-category', 'Dinner');
  await page.click('button[onclick="saveTx()"]');
  await until(async () => !(await txModalOpen(page)), { what: '这一笔存好、弹窗关上' });
  await page.waitForTimeout(100);   // 让送出与本机写入收尾
  const sent = posted.filter(x => !x.action);
  ok('「5,45」存得进去', sent.length === 1, posted.map(x => x.action || 'add'));
  ok('而且金额是 5.45，不是 545 也不是 5', sent[0] && sent[0].items[0].amount === 5.45,
     sent[0] && sent[0].items[0]);
  ok('清单里看得到 5.45', (await page.textContent('#tx-list')).includes('5.45'));

  // iPhone 的数字键盘在有些语言下只有逗号没有点（用户 2026-08-07 确认同事就是这样），
  // 所以打字当下就要回显认到的是多少，别让他记完才发现记成了 545
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await typeAmount(page, '5,45');
  await page.waitForTimeout(300);
  const echo = page.locator('#tx-amount-echo');
  ok('用逗号打字时当场回显认到多少', await echo.isVisible());
  ok('回显的是 5.45', (await echo.textContent() || '').includes('5.45'), await echo.textContent());
  await typeAmount(page, '6.00');
  await page.waitForTimeout(300);
  ok('正常打小数点就不啰嗦（回显收起）', !(await echo.isVisible()));
  await page.click('button[onclick="closeModal(\'modal-add-tx\')"]');
  await page.waitForTimeout(300);

  // 千分位写法（1,234.50）不能被当成小数点
  posted.length = 0;
  await addOne(page, { amount: '1,234.50', category: 'Store' });
  const s2 = posted.filter(x => !x.action);
  ok('「1,234.50」认成 1234.5（逗号当千分位）', s2[0] && s2[0].items[0].amount === 1234.5,
     s2[0] && s2[0].items[0]);

  // 真的看不懂时要把他打的原文引出来，不能只说「请输入金额」
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await typeAmount(page, 'abc');
  await page.selectOption('#tx-company-category', 'Dinner');
  await page.click('button[onclick="saveTx()"]');
  await page.waitForTimeout(600);
  const note = await page.textContent('#tx-save-note') || '';
  ok('打了看不懂的东西：把原文引给他看', note.includes('abc'), note);
  ok('并且告诉他小数点该用什么', note.includes('.'), note);
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【9d】手机存不住数据时，不许静静地什么都不说 ----------
console.log('\n【9d】存不住 / 存丢了：要么当场说清楚，要么自己把记录找回来');
if (want()) {
  // 情境一：清单空着打开页面（无痕模式、站点数据被清、旧版页面清空过）→ 自动补回来。
  // 2026-08-07 Seryi 实机就是这样：公司账本收到了三笔，他手机上一直是 0 笔 US$0.00。
  const h = await signIn(await newPage());
  const { page, errs, book } = h;
  book[SERYI_KEY].records = [
    { id:'srv_9', date:'2026-08-02', categoryEn:'Lunch', billNo:'1', side:'assist',
      amountUsd:4.49, originalAmount:null, note:null, hasPhoto:true },
  ];
  await page.evaluate(() => localStorage.removeItem('staffExpense_v2'));
  await page.reload({ waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  ok('开页面时清单是空的 → 自动从公司账本补回来（不用他自己去按）',
     (await page.textContent('#tx-list')).includes('4.49'), await page.textContent('#tx-list'));

  // 情境二：localStorage 写不进去（写了等于没写）→ 必须当场说，不能静静吞掉。
  // 关键：账还是要报出去（钱不能因为手机存不住就消失），但要明说别重记。
  const dialogs = h.dialogs;
  await page.evaluate(() => { localStorage.setItem = () => {}; });   // 假装写进去了
  const before = h.posted.filter(x => !x.action).length;
  await addOne(page, { amount: 12.34, category: 'Dinner' });
  await page.waitForTimeout(900);
  ok('存不住时也照样报进公司账本（钱不能丢）',
     h.posted.filter(x => !x.action).length === before + 1,
     h.posted.map(x => x.action || 'add'));
  // 用 alert 而不是 toast 说这件事是刻意的：toast 两秒就被后面的「已入账」盖掉，
  // 而这件事的代价是「记了一晚上，明天全空」，必须挡在眼前一次
  ok('弹窗当场说清楚这台手机存不住', dialogs.some(m => /存不住/.test(m)), dialogs);
  ok('并且明说别重记（重记会让公司账本算两次）',
     dialogs.some(m => /不用重记|别重记/.test(m)), dialogs);
  ok('也说了怎么修（别用无痕 / 加到主屏幕）',
     dialogs.some(m => /无痕|主屏幕/.test(m)), dialogs);
  ok('提示里带版本号（同事截图就能看出他手上是哪一版）',
     dialogs.some(m => /版本 \d{4}-\d{2}-\d{2}/.test(m)), dialogs);
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【9e】保存中途抛错，不许按钮按下去什么都不发生 ----------
console.log('\n【9e】保存出错要留下痕迹（「点了完全没反应」是最难查的一种）');
if (want()) {
  const h = await signIn(await newPage());
  const { page, errs } = h;
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await typeAmount(page, '5.00');
  await page.selectOption('#tx-company-category', 'Lunch');
  // 让保存中途炸掉，模拟任意一处意外抛错
  await page.evaluate(() => { window.saveData = () => { throw new Error('假装存储炸了'); }; });
  await page.click('button[onclick="saveTx()"]');
  await page.waitForTimeout(700);
  const note = page.locator('#tx-save-note');
  ok('出错时按钮上方留下一行字（不是什么都不发生）', await note.isVisible());
  const txt = await note.textContent() || '';
  ok('那行字带原始错误内容', txt.includes('假装存储炸了'), txt);
  ok('那行字带版本号，方便同事截图回报', /版本 \d{4}-\d{2}-\d{2}/.test(txt), txt);
  ok('弹窗留着不关，让人看得到', (await page.locator('#modal-add-tx.open').count()) === 1);
  await h.ctx.close();
}

// ---------- 【10】存储位跟老板 App 分开 ----------
console.log('\n【10】跟老板的 App 同源，存储位必须分开');
if (want()) {
  const h = await newPage();
  const { page } = h;
  // 先在同一个浏览器里放一份「老板的账本」当哨兵。同源共用 localStorage，
  // 存储位没分开的话，同事版一启动就会把它冲掉（staffStart() 会重设 data.accounts）。
  await page.goto(APP, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  const bossBefore = await page.evaluate(() => {
    localStorage.setItem('expenseTracker_v2', JSON.stringify({ sentinel:'老板的账本' }));
    localStorage.setItem('expenseTracker_companyToken', 'boss-key-do-not-touch');
    return localStorage.getItem('expenseTracker_v2');
  });
  // 再用同一个浏览器进同事版并记一笔——它会重设 data.accounts，
  // 存储位没分开的话这一下就把老板的账户全冲掉了
  await signIn(h);
  await addOne(page, { amount: 3.5, category: 'Store' });
  const bossAfter = await page.evaluate(() => localStorage.getItem('expenseTracker_v2'));
  ok('同事版记完账，老板 App 的账本一个字没动', bossAfter === bossBefore, null);
  const staffData = await page.evaluate(() => localStorage.getItem('staffExpense_v2'));
  ok('同事版存在自己的位置 staffExpense_v2', !!staffData, null);
  ok('同事版的钥匙也是自己的位置',
     (await page.evaluate(() => localStorage.getItem('staffExpense_token'))) === SERYI_KEY);
  ok('老板的钥匙没被同事的盖掉',
     (await page.evaluate(() => localStorage.getItem('expenseTracker_companyToken'))) === 'boss-key-do-not-touch');
  await h.ctx.close();
}

// ---------- 【10b】收据识别的大件必须是同源那份 ----------
console.log('\n【10b】拍收据要用的 opencv / tesseract，同源那份得真的取得到');
if (want()) {
  // 这两样都刻意优先走仓库里的同源文件——酒店/商家的白名单 WiFi 连不上 CDN，
  // 而同事正好常在那种网络里。同事版在 staff/ 子目录，路径少个 ../ 就会 404，
  // 于是每次拍收据都悄悄退到 CDN：不会报错，只会在最需要的时候用不了。
  const h = await signIn(await newPage());
  const { page } = h;
  const probe = await page.evaluate(async () => {
    // 语言包按页面自己声明的 gzip 设定拼文件名，别在这里猜
    const lang = TESSERACT_LOCAL_OPTS.langPath + '/eng.traineddata'
               + (TESSERACT_LOCAL_OPTS.gzip === false ? '' : '.gz');
    const srcs = [OPENCV_SOURCES[0], TESSERACT_SOURCES[0],
                  TESSERACT_LOCAL_OPTS.workerPath,
                  TESSERACT_LOCAL_OPTS.corePath + 'tesseract-core-simd.wasm.js', lang];
    const out = [];
    for (const s of srcs) {
      const url = new URL(s, location.href).href;
      let status = 0;
      try { status = (await fetch(url, { method:'GET' })).status; } catch (e) { status = -1; }
      out.push({ src: s, url, status });
    }
    return out;
  });
  for (const r of probe) {
    ok(`同源取得到 ${r.src}`, r.status === 200, r);
  }
  await h.ctx.close();
}

// ---------- 【11】源码那份没被改坏 ----------
console.log('\n【11】老板自己的 App 没受影响');
if (want()) {
  const h = await newPage();
  const { page, errs } = h;
  await page.goto(APP, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  ok('App 打开正常、没有闸门', (await page.locator('#staff-gate').count()) === 0);
  ok('App 的概览页还在', (await page.locator('#tab-overview').count()) === 1);
  ok('App 的设置页还在', (await page.locator('#tab-settings').count()) === 1);
  ok('App 里没有混进同事版的东西', (await page.locator('#staff-lang-btn').count()) === 0);
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【12】日期不是今天要当场说出来 ----------
console.log('\n【12】记的不是今天时，日期底下要有提醒（OCR 会填票面日期）');
if (want()) {
  // 钉在金边时区的凌晨 3 点（UTC 那时还是前一天）：这一刻 toISOString() 会回昨天，
  // 本地日历回今天。不钉住的话容器跑在 UTC，两种写法算出来一样，这条测了等于没测。
  const h = await newPage({ tz:'Asia/Phnom_Penh' });
  const { page, errs } = h;
  await page.clock.setFixedTime(new Date('2026-08-06T20:00:00Z'));
  await signIn(h);
  ok('today() 按手机本地日期算（UTC 那时还是 6 号）',
     (await page.evaluate(() => today())) === '2026-08-07',
     await page.evaluate(() => today()));
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  const hint = page.locator('#tx-date-hint');
  ok('刚打开时是今天，没有多余提醒', !(await hint.isVisible()));

  await page.fill('#tx-date', LEDGER_DAY);
  await page.waitForTimeout(200);
  ok('改成别的日子：提醒出现', await hint.isVisible());
  ok('提醒里写明记在哪天', (await hint.textContent() || '').includes(LEDGER_DAY));

  // 英文模式下不能漏成中文——同事有人只读英文。语言键在表单底下点不到，
  // 按钮本身在【8】已经点过了，这里直接调切换函数
  await page.evaluate(() => staffToggleLang());
  await until(() => page.evaluate(() => {
    const b = document.getElementById('staff-lang-btn');
    return !!b && (b.textContent.trim() === 'EN' || b.textContent.trim() === '中');
  }), { what: '语言切换生效' });
  ok('切语言后提醒当场跟着变成英文', (await hint.textContent() || '').includes('not today'),
     await hint.textContent());

  // 改回今天要收起来（不能一直挂着，挂着就没人看了）
  const t = await page.evaluate(() => today());
  await page.fill('#tx-date', t);
  await page.waitForTimeout(200);
  ok('改回今天：提醒收起', !(await hint.isVisible()));
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【13】公司账本卡只出现在公司账户那一边 ----------
console.log('\n【13】老板 App：公司账本卡只在公司账户那边，今天是 0 也要说清楚');
if (want()) {
  const h = await newPage();
  const { page, errs } = h;
  await h.ctx.addInitScript(k => localStorage.setItem('expenseTracker_companyToken', k), BOSS_KEY);
  await page.goto(APP, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  // 造两个账户：一个私人（默认那个）、一个公司，然后来回切
  await page.evaluate(async () => {
    data.accounts[0].isCompany = false;
    data.accounts.push({ id:'acc-co', name:'公司', currency:'USD', color:'#334155', isCompany:true });
    saveData();
    await fetchCompanyLedger(ledMonthNow(), { force:true });
  });
  await page.evaluate(() => switchAccount(data.accounts[0].id));
  await page.waitForTimeout(400);
  ok('私人账户那一屏：卡不出现', !(await page.locator('#ov-company').isVisible()));

  await page.evaluate(() => switchAccount('acc-co'));
  await page.waitForTimeout(700);
  const card = page.locator('#ov-company');
  ok('切到公司账户：卡回来了', await card.isVisible());
  const txt = (await card.textContent() || '').replace(/\s+/g, ' ');
  ok('今天没人记账时不是干摆一个 0', txt.includes('今天还没有人记账'), txt);
  ok('指出最近有记录的那天在哪', txt.includes(LEDGER_DAY), txt);
  ok('本月合计仍然看得到', txt.includes('24.49'), txt);

  // 点开完整清单：一天里要按人分块，当天总账摆最后
  // （2026-08-07 用户明确要的排法：「seryi 一笔、kuang 一笔、以此类推，然后才来个总账」）
  await page.click('#ov-company');
  await page.waitForTimeout(900);
  const led = (await page.textContent('#led-body') || '').replace(/\s+/g, ' ');
  ok('一天里分成两块：Seryi 一块', /Seryi\s*1 笔/.test(led), led.slice(0, 400));
  ok('一天里分成两块：Kuang 一块', /Kuang\s*1 笔/.test(led), led.slice(0, 400));
  ok('每块带自己的小计', led.includes('US$4.49') && led.includes('US$20.00'), led.slice(0, 400));
  ok('缺收据算在那个人自己那块', /Kuang[^A-Za-z]*1 笔 · 1 笔缺收据/.test(led), led.slice(0, 400));
  const iSeryi = led.indexOf('Seryi'), iKuang = led.indexOf('Kuang'), iSum = led.indexOf('当天总账');
  ok('当天总账排在两个人后面（不是摆最前面）',
     iSum > 0 && iSeryi < iSum && iKuang < iSum, { iSeryi, iKuang, iSum });
  ok('当天总账的数 = 两块加起来', /当天总账 US\$24\.49/.test(led), led.slice(0, 400));
  // 块里每一行都是同一个人记的，不必再逐行写一次「X 记」
  ok('记录行不再逐行重复「谁记的」', !led.includes('记　·　算') && !led.includes('记 · 算'), led.slice(0, 400));
  ok('但仍写明这笔算谁头上（Excel 分左右靠它）', led.includes('算 Boss 的'), led.slice(0, 400));
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【14】没装到主屏幕就提醒（装好了就闭嘴）----------
// 这条守的不是好不好看：iOS 会自行清掉 Safari 里的站点数据，没装到主屏幕的人
// 记了几笔、隔天打开就全空（2026-08-07 Seryi 实机）。提示条不出现 = 没人会去装。
console.log('\n【14】还在浏览器里：顶上要有「装到主屏幕」的提示，装好了就不再念');
if (want()) {
  const h = await newPage();
  const { page, errs } = h;
  await signIn(h);
  const tip = page.locator('#staff-install-tip');
  ok('在浏览器里打开：提示条出现', await tip.isVisible());
  const txt = (await tip.textContent() || '').replace(/\s+/g, ' ');
  ok('说清楚后果，不是只说「建议安装」', txt.includes('记录可能会不见'), txt);
  ok('链接指向说明书', (await tip.getAttribute('href')) === 'install.html');
  // 链接写对了但文件没上线 = 点下去 404。真的抓一次。
  const r = await page.request.get(`http://localhost:${PORT}/staff/install.html`);
  ok('说明书打得开（不是 404）', r.status() === 200, r.status());
  // 只读英文的同事也要看得懂
  await page.evaluate(() => staffToggleLang());
  await until(() => page.evaluate(() => {
    const b = document.getElementById('staff-lang-btn');
    return !!b && (b.textContent.trim() === 'EN' || b.textContent.trim() === '中');
  }), { what: '语言切换生效' });
  ok('切英文后提示条也变英文', /Home Screen/.test(await tip.textContent() || ''),
     await tip.textContent());
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}
if (want()) {
  // iOS 装好之后走的是 navigator.standalone（Safari 至今不认 display-mode）
  const h = await newPage();
  await h.ctx.addInitScript(() => {
    Object.defineProperty(window.navigator, 'standalone', { value:true, configurable:true });
  });
  await signIn(h);
  ok('iOS 装好后（navigator.standalone）：提示条不出现',
     !(await h.page.locator('#staff-install-tip').isVisible()));
  ok('无 JS 报错', h.errs.length === 0, h.errs);
  await h.ctx.close();
}
if (want()) {
  // Android／桌面装成 App 后走的是 display-mode: standalone
  const h = await newPage();
  await h.ctx.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = q => q.includes('display-mode: standalone')
      ? { matches:true, media:q, onchange:null, addEventListener(){}, removeEventListener(){},
          addListener(){}, removeListener(){}, dispatchEvent(){ return false; } }
      : real(q);
  });
  await signIn(h);
  ok('装成 App 后（display-mode: standalone）：提示条不出现',
     !(await h.page.locator('#staff-install-tip').isVisible()));
  ok('无 JS 报错', h.errs.length === 0, h.errs);
  await h.ctx.close();
}

// ---------- 【14b】英文模式下不许剩中文 ----------
// 同事里有人只读英文。以前是靠人肉扫，漏了整整三处（月份栏、底部导航、车牌说明），
// 还漏掉一个更糟的：拍照按钮的 data-en 加错元素，英文模式下变成「Camera拍照」
// 而且相机图标没了（2026-08-08 扫出来时已经上线过一版）。所以改成机器扫。
console.log('\n【14b】切成英文之后，画面上不该再有中文');
if (want()) {
  const h = await newPage({ lang:'en' });
  const { page, errs } = h;
  await signIn(h);
  // 扫「看得见的」中文：闸门已经关掉，语言按钮本身写「中」是对的（按它换回中文）
  const scanCJK = () => page.evaluate(() => {
    const out = [], CJK = /[一-鿿]/;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const t = (n.nodeValue || '').trim();
      if (!t || !CJK.test(t)) continue;
      const el = n.parentElement;
      if (!el || el.closest('#staff-lang-btn, #staff-gate')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      let vis = true;
      for (let e = el; e; e = e.parentElement) {
        const st = getComputedStyle(e);
        if (st.display === 'none' || st.visibility === 'hidden') { vis = false; break; }
      }
      if (vis) out.push(`${t.slice(0, 30)} <${el.tagName.toLowerCase()}#${el.id}>`);
    }
    document.querySelectorAll('input[placeholder]').forEach(el => {
      if (el.offsetParent && /[一-鿿]/.test(el.getAttribute('placeholder')))
        out.push(`[提示字] ${el.getAttribute('placeholder')} <#${el.id}>`);
    });
    return out;
  });
  const home = await scanCJK();
  ok('主界面没有残留中文', home.length === 0, home);
  ok('月份栏是英文月名', /^[A-Z][a-z]+ \d{4}$/.test(await page.textContent('#tx-month-text') || ''),
     await page.textContent('#tx-month-text'));
  ok('底部导航是英文', (await page.textContent('#nav-transactions') || '').includes('Records'),
     await page.textContent('#nav-transactions'));
  // 「找回本月记录 / Restore this month」那种斜线并排，两边读者都要多看一半
  const restore = (await page.textContent('#staff-restore-btn') || '').trim();
  ok('按钮只说一种语言，不是中英并排', restore === 'Restore this month', restore);

  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await page.selectOption('#tx-company-category', 'Petrol');
  await page.waitForTimeout(400);
  const modal = await scanCJK();
  ok('新增弹窗（含车牌栏）没有残留中文', modal.length === 0, modal);
  // 「这一餐算谁的」只在选了正餐时展开，上面那一轮扫不到（跟车牌栏同一个坑）
  await page.selectOption('#tx-company-category', 'Lunch');
  await page.waitForTimeout(400);
  ok('英文模式下「这一餐算谁的」也展开得出来',
     await page.locator('#tx-company-whose-wrap').isVisible());
  const mealBlock = await scanCJK();
  ok('「这一餐算谁的」那一段没有残留中文', mealBlock.length === 0, mealBlock);
  // 这条专门守上面那个 bug：图标必须还在，且不许中英黏在一起
  const cam = (await page.locator('.attach-btn').first().textContent() || '').trim();
  ok('拍照按钮：图标还在、文字只有英文', cam.includes('📷') && cam.includes('Camera') && !/[一-鿿]/.test(cam), cam);

  // 切回中文要能完整还原（data-zh 是第一次切换时才记下来的，容易只单向对）
  await page.evaluate(() => staffToggleLang());
  await page.waitForTimeout(400);
  ok('切回中文：月份栏还原', (await page.textContent('#tx-month-text') || '').includes('年'),
     await page.textContent('#tx-month-text'));
  ok('切回中文：拍照按钮还原', (await page.locator('.attach-btn').first().textContent() || '').includes('拍照'));
  ok('切回中文：车牌提示字还原',
     (await page.getAttribute('#tx-company-plate', 'placeholder') || '').includes('例'),
     await page.getAttribute('#tx-company-plate', 'placeholder'));
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【16】备用金卡 ----------
// 这张卡显示的是同事口袋里的**现金**还剩多少。显示错了他会照着错的数去花钱、
// 或者该要钱的时候不要，月底点现金对不上，谁也说不清差额从哪来。
// 所以守两条底线：数字一律照抄服务端（App 不许自己算），没数字时整张卡不出现。
console.log('\n【16】备用金卡：数字照抄服务端，没设起点就不出现');
if (want()) {
  const h = await newPage();
  const { page, errs } = h;
  await signIn(h);
  ok('还没设起点：整张卡不出现（不是显示 0）',
     !(await page.locator('#staff-petty').isVisible()));

  // 老板设好起点、发过一笔钱之后
  h.petty.row = { person:'Seryi', status:'ok', opened:500, openedDate:'2026-08-08',
                  spent:37.72, balance:562.28,
                  topups:[{ date:'2026-08-20', amountUsd:100, type:'topup', note:null }] };
  await page.evaluate(() => staffLoadPetty());
  await page.waitForTimeout(600);
  const card = page.locator('#staff-petty');
  ok('设了起点就出现', await card.isVisible());
  const txt = (await card.textContent() || '').replace(/\s+/g, ' ');
  ok('余额照抄服务端的数，一分不差', txt.includes('US$562.28'), txt);
  ok('起点写出来（同事要能自己对）', txt.includes('US$500.00'), txt);
  ok('已花写出来', txt.includes('US$37.72'), txt);
  ok('收到的钱有明细', txt.includes('2026-08-20') && txt.includes('US$100.00'), txt);
  ok('余额够时不喊「快用完」', !txt.includes('快用完'), txt);
  ok('这个数不是 App 自己算的（500-37.72=462.28 不该出现）', !txt.includes('462.28'), txt);

  // 负余额：他自己先垫了钱，公司欠他。这跟「快用完了」是两回事——
  // 对着「公司欠你 52 块」写「快用完了记得跟老板要」，他会以为自己还有钱。
  // （2026-08-08 用户指出他们上个月就是负的，一开始连负起点都存不进去。）
  h.petty.row = { ...h.petty.row, balance:-52.25, spent:552.25 };
  await page.evaluate(() => staffLoadPetty());
  await page.waitForTimeout(600);
  const neg = (await card.textContent() || '').replace(/\s+/g, ' ');
  ok('负余额：标题改成「公司欠你」', neg.includes('公司欠你'), neg);
  ok('大字写成正数 52.25（不是 -52.25）', neg.includes('US$52.25') && !neg.includes('-US$'), neg);
  ok('说的是「你先垫了」不是「快用完了」',
     neg.includes('你先垫了') && !neg.includes('快用完'), neg);

  // 见底了要显眼
  h.petty.row = { ...h.petty.row, balance:42.5, spent:557.5 };
  await page.evaluate(() => staffLoadPetty());
  await page.waitForTimeout(600);
  const txt2 = (await card.textContent() || '').replace(/\s+/g, ' ');
  ok('余额见底：喊他去要钱', txt2.includes('快用完'), txt2);
  ok('见底时换成警示色', (await card.getAttribute('class') || '').includes('low'));
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}
if (want()) {
  // 没网时：显示上次拿到的，但要明说是旧的——同事常在外面没信号，
  // 一片空白比一个标注过的旧数字更没用
  const h = await newPage();
  const { page } = h;
  h.petty.row = { person:'Seryi', status:'ok', opened:500, openedDate:'2026-08-08',
                  spent:0, balance:500, topups:[] };
  await signIn(h);
  await page.waitForTimeout(600);
  ok('在线时正常显示', await page.locator('#staff-petty').isVisible());
  h.petty.fail = true;
  await page.evaluate(() => staffLoadPetty());
  await page.waitForTimeout(600);
  const txt = (await page.textContent('#staff-petty') || '').replace(/\s+/g, ' ');
  ok('断网后还看得到余额（用上次那份）', txt.includes('US$500.00'), txt);
  ok('但明说这是离线的旧数字', txt.includes('离线'), txt);
  await h.ctx.close();
}
if (want()) {
  // 离线记的那几笔还没送出去，服务端余额里没扣。不许 App 自己减，
  // 但必须把这件事说出来——否则他以为还有那么多钱
  const h = await newPage({ offline: true });
  const { page } = h;
  await page.goto(BASE, { waitUntil:'domcontentloaded' });
  await page.evaluate(k => localStorage.setItem('staffExpense_token', k), SERYI_KEY);
  await page.evaluate(w => localStorage.setItem('staffExpense_identity', JSON.stringify(w)),
                      { status:'ok', reporter:'Seryi', scope:'staff' });
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(800);
  await addOne(page, { amount: '8.00', category: 'Lunch' });   // 离线：存本机、待送出
  h.setMode('online');
  h.petty.row = { person:'Seryi', status:'ok', opened:500, openedDate:'2026-08-08',
                  spent:0, balance:500, topups:[] };
  await page.evaluate(() => staffLoadPetty());
  await page.waitForTimeout(700);
  const txt = (await page.textContent('#staff-petty') || '').replace(/\s+/g, ' ');
  ok('余额仍是服务端那个数，App 没自己减', txt.includes('US$500.00') && !txt.includes('US$492.00'), txt);
  ok('但明写「还有 N 笔没送出去，没扣」', /没送出去/.test(txt) && txt.includes('US$8.00'), txt);
  await h.ctx.close();
}

// ---------- 【15】说明书本身 ----------
// 提示条点过去的落地页。它是同事唯一的操作指引，坏了没人会回报——所以在这里守。
console.log('\n【15】安装说明书 staff/install.html');
if (want()) {
  const h = await newPage();
  const { page, errs } = h;
  await page.goto(`http://localhost:${PORT}/staff/install.html`, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(300);
  ok('四个步骤都在', (await page.locator('.step').count()) === 4,
     await page.locator('.step').count());
  ok('每一步都配图', (await page.locator('.step .pic svg').count()) === 4,
     await page.locator('.step .pic svg').count());
  // 图是画出来的，读屏软件只能靠 <title> 念出内容
  ok('每张图都有文字说明（读屏用）', (await page.locator('.step .pic svg > title').count()) === 4,
     await page.locator('.step .pic svg > title').count());
  const zh = (await page.textContent('body') || '').replace(/\s+/g, ' ');
  ok('中文版讲了关键那三件事：Safari、分享、加到主屏幕',
     zh.includes('Safari') && zh.includes('分享') && zh.includes('加到主屏幕'), zh.slice(0, 200));
  ok('说明书里带着报账页网址', (await page.locator('a[href$="/staff/"]').count()) >= 1);

  await page.click('#lang-btn');
  await page.waitForTimeout(300);
  const en = (await page.textContent('body') || '').replace(/\s+/g, ' ');
  ok('切英文后正文真的变英文', en.includes('Add to Home Screen') && !en.includes('加到主屏幕'),
     en.slice(0, 200));
  ok('语言选择用全站统一的 key',
     (await page.evaluate(() => localStorage.getItem('siteLangUser'))) === 'en');
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}
if (want()) {
  // 已经装好的人如果点进这一页，要直接告诉他不用看了
  const h = await newPage();
  await h.ctx.addInitScript(() => {
    Object.defineProperty(window.navigator, 'standalone', { value:true, configurable:true });
  });
  await h.page.goto(`http://localhost:${PORT}/staff/install.html`, { waitUntil:'domcontentloaded' });
  await h.page.waitForTimeout(300);
  ok('从已装好的图标里打开：顶上说「你已经装好了」',
     await h.page.locator('#ok-box.on').isVisible());
  await h.ctx.close();
}

// ---------- 【17】买给老板的餐 ----------
// 2026-08-08 用户发现：同事买了老板的午餐，在这一页也只能选 Lunch，服务端按
// ownMeals 规则记成他自己的（Excel 右表）——老板的餐费算到了同事那栏，而且
// 备用金也会按他花的钱扣。所以这一组守的是「钱记对人」。
console.log('\n【17】买给老板的餐：同事要能标出来');
if (want()) {
  const h = await newPage();
  const { page, posted, errs } = h;
  await signIn(h);
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });

  await page.selectOption('#tx-company-category', 'Store');
  ok('选 Store 时不问「这一餐算谁的」', !(await page.locator('#tx-company-whose-wrap').isVisible()));
  await page.selectOption('#tx-company-category', 'Lunch');
  ok('选 Lunch 时问「这一餐算谁的」', await page.locator('#tx-company-whose-wrap').isVisible());
  ok('默认「自己吃的」（同事绝大多数时候记的是自己的餐）',
     await page.evaluate(() => state.companyWhose === 'self'));
  // 说明文字要用同事的口径：老板 App 那句讲「报账人」，这边没有那个下拉，照抄会看不懂
  const hint = await page.textContent('#tx-company-whose-wrap');
  ok('说明用的是同事口径，不提「报账人」', !hint.includes('报账人'), hint);

  await typeAmount(page, '9.90');
  await page.evaluate(() => setCompanyWhose('boss'));
  await page.waitForTimeout(150);
  await page.click('button[onclick="saveTx()"]');
  await until(async () => !(await txModalOpen(page)), { what: '这一笔存好、弹窗关上' });
  await page.waitForTimeout(100);   // 让送出与本机写入收尾
  const sent = posted.filter(r => !r.action).pop() || {};
  ok('送出去的是服务端给的「老板午餐」', sent.items?.[0]?.categoryRaw === '老板午餐',
     sent.items?.[0]?.categoryRaw);
  ok('服务端据此记成 Boss，不是 Seryi 自己', await page.evaluate(() => {
    const t = data.transactions.filter(x => x.amount === 9.9).pop(); return t?.company?.person;
  }) === 'Boss');
  await page.waitForTimeout(300);
  ok('明细里标出「老板的」（记错人要翻账才查得出来）',
     (await page.textContent('#tx-list') || '').includes('老板的'));

  // 对照组：不点就还是他自己的（别把原来的行为改坏）
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await typeAmount(page, '4.40');
  await page.selectOption('#tx-company-category', 'Lunch');
  await page.click('button[onclick="saveTx()"]');
  await until(async () => !(await txModalOpen(page)), { what: '这一笔存好、弹窗关上' });
  await page.waitForTimeout(100);   // 让送出与本机写入收尾
  const own = posted.filter(r => !r.action).pop() || {};
  ok('对照：不点就送标准类别 Lunch', own.items?.[0]?.categoryRaw === 'Lunch', own.items?.[0]?.categoryRaw);
  ok('对照：仍记到 Seryi 自己头上', await page.evaluate(() => {
    const t = data.transactions.filter(x => x.amount === 4.4).pop(); return t?.company?.person;
  }) === 'Seryi');
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【18】已经报上去的那笔：改得动，但两边必须一起改 ----------
// 编辑已送出的记录只改本机、账本不动，两边会静静分叉——2026-08-08 真出过事
// （Seryi 8/2 那笔本机 11.76、账本 11.78）。当时的解法是锁住表单只留删除；
// 2026-08-13 服务端有了 action:'edit'，改成「先改账本、成功了才改本机」，
// 分叉照样挡住（账本改不成就整个不动），而且不用删掉重记。
console.log('\n【18】已经报上去的那笔：改得动，但账本和本机必须一起改');
if (want()) {
  const h = await newPage();
  const { page, posted, errs } = h;
  await signIn(h);
  await addOne(page, { amount: '6.60', category: 'Store' });
  const txId = await page.evaluate(() => {
    const t = data.transactions.filter(x => x.company && x.company.status === 'sent').pop();
    return t ? t.id : null;
  });
  ok('先记一笔并送达', !!txId, txId);

  await page.evaluate(id => editTx(id), txId);
  await page.waitForTimeout(500);
  ok('顶上说明哪些能改哪些不能', await page.locator('#tx-sent-lock').isVisible());
  // 2026-08-13 起金额和类别改得动了（会同步改账本），锁的只剩服务端 edit 不给改的那几栏
  ok('金额、类别改得动', await page.evaluate(() =>
    ['tx-amount', 'tx-company-category'].every(id => !document.getElementById(id).disabled)));
  ok('日期、单据号仍锁着', await page.evaluate(() =>
    ['tx-date', 'tx-company-reftag'].every(id => document.getElementById(id).disabled)));
  ok('保存键在（现在按下去是有用的）', await page.locator('#tx-save-btn').isVisible());
  ok('删除键还在', await page.locator('#tx-delete-wrap').isVisible());

  // 先验最要紧的：账本改不成时，本机绝不能偷偷改掉（那就又回到两边分叉）
  const adds0 = posted.filter(x => !x.action).length;
  h.edit.fails = true;
  await page.evaluate(() => { document.getElementById('tx-amount').value = '99.99'; saveTx(); });
  await page.waitForTimeout(700);
  ok('账本改不成时：本机金额没变',
     await page.evaluate(id => data.transactions.find(t => t.id === id)?.amount, txId) === 6.6);
  h.edit.fails = false;

  // 账本改成功了，两边才一起变
  await page.evaluate(() => { document.getElementById('tx-amount').value = '99.99'; saveTx(); });
  await page.waitForTimeout(700);
  ok('账本改成功后：本机金额跟着变成 99.99',
     await page.evaluate(id => data.transactions.find(t => t.id === id)?.amount, txId) === 99.99,
     await page.evaluate(id => data.transactions.find(t => t.id === id)?.amount, txId));
  ok('走的是 edit，不是再报一次账', posted.some(x => x.action === 'edit'),
     posted.map(x => x.action || 'add'));
  ok('也没有再往账本送一次 add（重送会翻倍）',
     posted.filter(x => !x.action).length === adds0,
     [posted.filter(x => !x.action).length, adds0]);
  await page.evaluate(() => closeModal('modal-add-tx'));

  // 新记一笔时锁必须是解开的（别把上一笔的状态留着）
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  ok('新增记录时锁是解开的',
     !(await page.locator('#tx-sent-lock').isVisible()) &&
     !(await page.evaluate(() => document.getElementById('tx-amount').disabled)));
  await page.evaluate(() => closeModal('modal-add-tx'));
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}
if (want()) {
  // 英文模式下这句提示也要是英文（同事不一定读中文）
  const h = await newPage({ lang: 'en' });
  const { page } = h;
  await signIn(h);
  await addOne(page, { amount: '2.20', category: 'Store' });
  const id = await page.evaluate(() => {
    const t = data.transactions.filter(x => x.company && x.company.status === 'sent').pop();
    return t ? t.id : null;
  });
  await page.evaluate(i => editTx(i), id);
  await page.waitForTimeout(500);
  const txt = (await page.textContent('#tx-sent-lock') || '').trim();
  ok('英文模式下提示是英文', /company ledger/i.test(txt) && !/[一-鿿]/.test(txt), txt);
  await h.ctx.close();
}

// ---------- 【19】照片认出来的金额要人核对过 ----------
// 同事记账几乎每笔都拍收据，识别认错一位数不会报错、不会变色，只会静静进公司账本。
// 2026-08-08 用户明确要求「不要再有数目不对」，所以这里是硬闸门，不是一句提示。
console.log('\n【19】照片认出来的金额，没核对过不准保存');
if (want()) {
  const h = await newPage();
  const { page, posted, errs } = h;
  await signIn(h);
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await page.selectOption('#tx-company-category', 'Store');
  await page.evaluate(() => {          // 模拟识别填进去的金额
    document.getElementById('tx-amount').value = '77.78';
    markAmountUnconfirmed();
  });
  await page.waitForTimeout(200);
  ok('出现「请跟收据核对」', await page.locator('#tx-amount-check').isVisible());
  const n = posted.filter(r => !r.action).length;
  await page.click('button[onclick="saveTx()"]');
  await page.waitForTimeout(800);
  ok('没核对就存 → 挡下来，一个字都没送出去',
     posted.filter(r => !r.action).length === n, posted.map(r => r.action || 'add'));
  ok('也没存进本机', !(await page.evaluate(() => data.transactions.some(t => t.amount === 77.78))));

  await page.click('#tx-amount-ok');
  await page.waitForTimeout(200);
  await page.click('button[onclick="saveTx()"]');
  await until(async () => !(await txModalOpen(page)), { what: '这一笔存好、弹窗关上' });
  await page.waitForTimeout(100);   // 让送出与本机写入收尾
  ok('核对过就存得进去，金额原样 77.78',
     posted.filter(r => !r.action).pop()?.items?.[0]?.amount === 77.78,
     posted.filter(r => !r.action).pop()?.items?.[0]);
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}
if (want()) {
  // 英文模式：提示和按钮都要是英文
  const h = await newPage({ lang: 'en' });
  const { page } = h;
  await signIn(h);
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await page.evaluate(() => {
    document.getElementById('tx-amount').value = '77.78';
    markAmountUnconfirmed();
  });
  await page.waitForTimeout(300);
  const t = (await page.textContent('#tx-amount-check') || '').trim();
  ok('英文模式下这段提示是英文', /receipt/i.test(t) && !/[一-鿿]/.test(t), t);
  await h.ctx.close();
}

// ---------- 【20】双击保存不能生出两条一样的记录 ----------
// 2026-08-08 用户实机遇到（主 App 那边），同事版用的是同一份 saveTx()，一并守住。
console.log('\n【20】双击「保存」不能生出两条一样的记录');
if (want()) {
  const h = await newPage();
  const { page, posted, errs } = h;
  await signIn(h);
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await typeAmount(page, '4.44');
  await page.selectOption('#tx-company-category', 'Store');
  await page.evaluate(() => {
    const btn = document.getElementById('tx-save-btn');
    btn.click(); btn.click();   // 原生 el.click() 连打两下，真实模拟双击
  });
  await page.waitForTimeout(1500);
  const matches = await page.evaluate(() =>
    (JSON.parse(localStorage.getItem('staffExpense_v2') || '{}').transactions || [])
      .filter(t => t.amount === 4.44));
  ok('本机只留一笔，不是两笔', matches.length === 1, matches.length);
  ok('账本也只收到一次', posted.filter(r => !r.action && r.items?.[0]?.amount === 4.44).length === 1,
     posted.filter(r => !r.action).map(r => r.items?.[0]?.amount));
  await page.waitForTimeout(500);
  ok('短暂延迟后按钮解锁', !(await page.evaluate(() => document.getElementById('tx-save-btn').disabled)));
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【21】对账（待claim）是老板专用的，不该出现在同事版里 ----------
// 2026-08-08 加的对账功能（三人余额+本月开销+待claim=固定盘子）整个只服务老板一个人，
// 同事跟这笔钱一点关系都没有。HTML 已经靠 ACCOUNT SWITCHER～PDF REPORT 那段 cut 掉了，
// 这里守的是运行时：卡片真的看不见、也真的没有任何请求打去 pendingClaim 那几个 action
// ——万一以后谁不小心把 init() 里的 fetchPendingClaim() 调用漏掉没 cut，这条会当场变红。
console.log('\n【21】对账功能是老板专用的，同事版看不到也碰不到');
if (want()) {
  const h = await newPage();
  const { page, posted, errs } = h;
  await signIn(h);
  await page.waitForTimeout(600);
  ok('同事版 DOM 里没有对账卡', (await page.locator('#ov-reconcile').count()) === 0);
  ok('同事版 DOM 里没有对账明细弹窗', (await page.locator('#modal-reconcile').count()) === 0);
  ok('同事版没有「记一笔待claim」的弹窗', (await page.locator('#modal-reconcile-add').count()) === 0);
  ok('全程没有任何 pendingClaim 相关请求',
     !posted.some(r => /^pendingClaim/.test(r.action || '')), posted.map(r => r.action));
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【22】老板账（投递箱）：拿到口令才有，记的账送去 inbox_boss ----------
// 这一页跟公司报账是两本完全不同的账：公司账进 butler 出月底 Excel，老板账直接进
// 老板自己的账本。走错一个是要翻账才查得出来的，所以这里守三件事：
//   1. 没口令的人根本看不到这个入口（跟以前一模一样的页面）
//   2. 切过去之后表单是**个人账本**那套（描述/收入支出/类别宫格），不是公司那套
//   3. 记一笔真的送进 inbox_boss，payload 的字段跟 Firestore 规则对得上
//      （规则要求 k/tx/from，可选 photo/createdAt，多一个字段就会被服务端拒绝）
console.log('\n【22】老板账：拿到口令才有，记的账送进投递箱');
if (want()) {
  const h = await newPage();
  const { page, errs } = h;
  await signIn(h);
  ok('没口令时看不到老板账入口', !(await page.locator('#nav-boss').isVisible()));

  // 老板私下发的口令。存进去再刷新——正式路径是 staffSetBossKey()（prompt + reload），
  // 这里直接写存储位跳过 prompt，效果一样。
  await page.evaluate(() => localStorage.setItem('staffExpense_bossKey', 'pass-1234'));
  await page.reload({ waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  ok('填了口令就看得到老板账入口', await page.locator('#nav-boss').isVisible());

  // 把 Firestore 的写入换成假的：外部网域在这份自检里全被挡（模拟酒店 WiFi），
  // 真发一定失败，测不到 payload 长什么样。
  await page.evaluate(() => {
    window.__inbox = [];
    auth = { currentUser:{ uid:'anon1' }, signInAnonymously: async () => ({}) };
    db = { collection: (c) => ({ add: async (p) => { window.__inbox.push({ c, p }); return { id:'d1' }; } }) };
    cloudAvailable = true;
  });

  await page.click('#nav-boss');
  // 「老板账」不是普通分页（staffGoBoss 切的是身份，没有 #tab-boss 这个元素），
  // 所以这里等的是切换后标题变成老板账那一版
  await until(() => page.evaluate(() => {
    const el = document.getElementById('hdr-title');
    return !!el && /老板|Boss/i.test(el.textContent || '');
  }), { what: '切到老板账' });
  ok('切过去之后 body 上有 staff-boss', await page.evaluate(() => document.body.classList.contains('staff-boss')));
  ok('页面顶上挂着「进老板账本」的说明', await page.locator('#staff-boss-note').isVisible());
  ok('备用金卡不出现（那是公司账的钱）', !(await page.locator('#staff-petty').isVisible()));

  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  ok('公司那套栏位整块不见', !(await page.locator('#tx-company-wrap').isVisible()));
  ok('描述栏回来了（个人账本那套）', await page.locator('#tx-desc-group').isVisible());
  ok('收入/支出切换回来了', await page.locator('#tx-type-tabs').isVisible());
  ok('类别宫格回来了', await page.locator('#tx-cat-wrap').isVisible());

  await typeAmount(page, '12.34');
  await page.locator('#cat-grid > *').first().click();
  await page.fill('#tx-desc', '老板的咖啡');
  await page.click('button[onclick="saveTx()"]');
  await until(async () => !(await txModalOpen(page)), { what: '这一笔存好、弹窗关上' });
  await page.waitForTimeout(100);   // 让送出与本机写入收尾

  const box = await page.evaluate(() => window.__inbox);
  ok('送进 inbox_boss 集合，一笔一条', box.length === 1 && box[0].c === 'inbox_boss',
     box.map(b => b.c));
  const p = box[0]?.p || {};
  ok('带上口令 k', p.k === 'pass-1234', p.k);
  ok('带上谁记的', p.from === 'Seryi', p.from);
  const sent = JSON.parse(p.tx || '{}');
  ok('金额原样送过去', sent.amount === 12.34, sent.amount);
  ok('描述一起送', sent.description === '老板的咖啡', sent.description);
  ok('带 srcId（老板那边靠它去重，送两次不会变两条）', !!sent.srcId, sent.srcId);
  // 规则里 hasOnly(['k','tx','photo','from','createdAt'])：多一个字段整条会被拒
  ok('字段没有超出规则允许的范围',
     Object.keys(p).every(k => ['k','tx','photo','from','createdAt'].includes(k)), Object.keys(p));

  const st = await page.evaluate(() =>
    (data.transactions.find(t => t.accountId === 'acc_boss_inbox') || {}).inbox);
  ok('本机标成已送出', st && st.status === 'sent', st);
  ok('队列已清空', (await page.evaluate(() =>
     JSON.parse(localStorage.getItem('staffExpense_bossQueue') || '[]'))).length === 0);
  ok('列表上看得出「已送老板」',
     (await page.locator('#tx-list').innerText()).includes('已送老板'));

  // 送不出去也绝不丢账：本机永远先存好，进队列等有网
  await page.evaluate(() => {
    db = { collection: () => ({ add: async () => { const e = new Error('offline'); throw e; } }) };
  });
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await typeAmount(page, '5.00');
  await page.locator('#cat-grid > *').first().click();
  await page.click('button[onclick="saveTx()"]');
  await until(async () => !(await txModalOpen(page)), { what: '这一笔存好、弹窗关上' });
  await page.waitForTimeout(100);   // 让送出与本机写入收尾
  ok('送不出去这笔还是存进了本机',
     await page.evaluate(() => data.transactions.some(t => t.amount === 5)));
  ok('进了待送队列', (await page.evaluate(() =>
     JSON.parse(localStorage.getItem('staffExpense_bossQueue') || '[]'))).length === 1);
  ok('说明条上写着还有几笔没送到',
     (await page.locator('#staff-boss-queue').innerText()).includes('还没送到'));

  // 切回公司账：表单要变回公司那套，两边不能互相污染
  await page.click('#nav-transactions');
  await until(() => page.evaluate(t => {
    const el = document.getElementById('tab-' + t);
    return !!el && el.classList.contains('active');
  }, 'transactions'), { what: '切到 transactions 分页' });
  ok('切回来 body 上的 staff-boss 拿掉了',
     await page.evaluate(() => !document.body.classList.contains('staff-boss')));
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  ok('公司那套栏位回来了', await page.locator('#tx-company-wrap').isVisible());
  ok('描述栏又收起来了', !(await page.locator('#tx-desc-group').isVisible()));
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【23】老板账的币种 + 手上现金 ----------
// 出门带的是现金，币种由老板当场决定：写死 USD 的话，日元账目会显示成「US$8000」，
// 差两个数量级，同事会以为自己多打了一个零。
// 手上现金那张卡跟公司账那张备用金卡是两套东西——那张的数由 butler 服务端算，
// 这张老板账没有服务端，只能本机算（收到的钱 − 支出 + 收入）。这里守的是：
//   1. 币种改得动，而且改完列表和卡片一起跟着变
//   2. 余额是真算的，不是显示一个固定数
//   3. 没送出去的账也照扣（现金离开口袋就没了，跟送没送到无关）
//   4. 公司账那一页不许出现这张卡
console.log('\n【23】老板账：币种可改，手上现金自己算');
if (want()) {
  const h = await newPage();
  const { page, errs } = h;
  await signIn(h);
  await page.evaluate(() => localStorage.setItem('staffExpense_bossKey', 'pass-1234'));
  await page.reload({ waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  await page.evaluate(() => {
    window.__inbox = [];
    auth = { currentUser:{ uid:'anon1' }, signInAnonymously: async () => ({}) };
    db = { collection: () => ({ add: async (p) => { window.__inbox.push(p); return { id:'d1' }; } }) };
    cloudAvailable = true;
  });
  await page.click('#nav-boss');
  // 「老板账」不是普通分页（staffGoBoss 切的是身份，没有 #tab-boss 这个元素），
  // 所以这里等的是切换后标题变成老板账那一版
  await until(() => page.evaluate(() => {
    const el = document.getElementById('hdr-title');
    return !!el && /老板|Boss/i.test(el.textContent || '');
  }), { what: '切到老板账' });

  ok('手上现金卡出现在老板账页', await page.locator('#staff-boss-cash').isVisible());
  ok('还没填收到多少时，不编一个 0 出来（那看起来像花光了）',
     !(await page.locator('#staff-boss-cash').innerText()).match(/0\.00/),
     await page.locator('#staff-boss-cash').innerText());
  ok('请他先记一笔收到的现金',
     (await page.locator('#staff-boss-cash').innerText()).includes('收到现金'));
  ok('默认币种是 USD', await page.evaluate(() => staffBossCur()) === 'USD');

  // —— 改币种 ——
  await page.evaluate(() => { window.prompt = () => 'JPY'; });
  await page.evaluate(() => staffSetBossCur());
  await page.waitForTimeout(400);
  ok('币种改成 JPY', await page.evaluate(() => staffBossCur()) === 'JPY');
  ok('老板账那个账户的币种也跟着改（否则设定变了、数字还是旧符号）',
     await page.evaluate(() =>
       (data.accounts.find(a => a.id === 'acc_boss_inbox') || {}).currency) === 'JPY');
  ok('说明块上写着现在用的是 JPY',
     (await page.locator('#staff-boss-cfg').innerText()).includes('JPY'));
  await page.evaluate(() => { window.prompt = () => 'ABC'; });
  await page.evaluate(() => staffSetBossCur());
  await page.waitForTimeout(300);
  ok('乱填的代码不认（不然会变成「ABC 300.00」）',
     await page.evaluate(() => staffBossCur()) === 'JPY');

  // —— 收到现金 600 ——
  await page.evaluate(() => { window.prompt = () => '600'; });
  await page.evaluate(() => bossCashAdd());
  await page.waitForTimeout(400);
  let card = await page.locator('#staff-boss-cash').innerText();
  ok('卡上显示手上现金 600（用 JPY 的符号 ¥）',
     card.includes('¥600.00') && card.includes('手上现金'), card);

  // —— 花掉 100：余额要自己算出 500 ——
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await typeAmount(page, '100');
  await page.locator('#cat-grid > *').first().click();
  await page.click('button[onclick="saveTx()"]');
  await until(async () => !(await txModalOpen(page)), { what: '这一笔存好、弹窗关上' });
  await page.waitForTimeout(100);   // 让送出与本机写入收尾
  card = await page.locator('#staff-boss-cash').innerText();
  ok('花了 100 之后余额变 500（是算出来的，不是写死的）', card.includes('¥500.00'), card);
  ok('卡上写明收到多少、花掉多少', card.includes('收到 ¥600.00') && card.includes('已花 ¥100.00'), card);

  // —— 送不出去的那笔照样扣：现金离开口袋就没了 ——
  await page.evaluate(() => {
    db = { collection: () => ({ add: async () => { throw new Error('offline'); } }) };
  });
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await typeAmount(page, '50');
  await page.locator('#cat-grid > *').first().click();
  await page.click('button[onclick="saveTx()"]');
  await until(async () => !(await txModalOpen(page)), { what: '这一笔存好、弹窗关上' });
  await page.waitForTimeout(100);   // 让送出与本机写入收尾
  card = await page.locator('#staff-boss-cash').innerText();
  ok('没送出去的那笔也从余额扣掉了（现金已经花了）', card.includes('¥450.00'), card);
  ok('但要写明有几笔还没送到，别让人以为账丢了',
     card.includes('还没送到老板那边'), card);

  // —— 超支：他自己先垫了钱，要看得出来 ——
  await page.evaluate(() => {
    db = { collection: () => ({ add: async (p) => { window.__inbox.push(p); return { id:'d2' }; } }) };
  });
  await page.click('.fab');
  await until(() => txModalOpen(page), { what: '记账弹窗打开' });
  await typeAmount(page, '500');
  await page.locator('#cat-grid > *').first().click();
  await page.click('button[onclick="saveTx()"]');
  await until(async () => !(await txModalOpen(page)), { what: '这一笔存好、弹窗关上' });
  await page.waitForTimeout(100);   // 让送出与本机写入收尾
  card = await page.locator('#staff-boss-cash').innerText();
  ok('花超了显示「超支了」而不是一个负数余额', card.includes('超支了'), card);
  ok('说清楚是他自己先垫的、该跟老板要回来', card.includes('先垫了'), card);
  ok('超支时卡片换成警示色', await page.evaluate(() =>
     document.getElementById('staff-boss-cash').classList.contains('low')));

  // —— 老板又给钱：加上去 ——
  await page.evaluate(() => { window.prompt = () => '1000'; });
  await page.evaluate(() => bossCashAdd());
  await page.waitForTimeout(400);
  card = await page.locator('#staff-boss-cash').innerText();
  ok('又收到 1000 之后余额回正（600+1000-650=950）', card.includes('¥950.00'), card);

  // —— 重填只清收到的钱，账目一笔都不许动 ——
  const txCount = await page.evaluate(() =>
    data.transactions.filter(t => t.accountId === 'acc_boss_inbox').length);
  // 直接换掉 window.confirm，不再挂 dialog 处理器——这页已经有一个了，
  // 再挂第二个 playwright 会报「dialog already handled」（同一个坑在 check-expense-company 里写过）
  await page.evaluate(() => { window.confirm = () => true; });
  await page.evaluate(() => bossCashReset());
  await page.waitForTimeout(400);
  ok('重填之后回到「还没填收到多少」的状态',
     (await page.locator('#staff-boss-cash').innerText()).includes('收到现金'));
  ok('重填不动任何一笔账', await page.evaluate(() =>
     data.transactions.filter(t => t.accountId === 'acc_boss_inbox').length) === txCount, txCount);

  // —— 公司账那一页不该有这张卡 ——
  await page.click('#nav-transactions');
  await until(() => page.evaluate(t => {
    const el = document.getElementById('tab-' + t);
    return !!el && el.classList.contains('active');
  }, 'transactions'), { what: '切到 transactions 分页' });
  ok('切回公司账，手上现金卡不出现（那是老板账的钱）',
     !(await page.locator('#staff-boss-cash').isVisible()));
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

// ---------- 【24】拍收据用 AI 识别（靠公司密钥换服务端共用 key）----------
// 2026-08-13 用户反映「同事版相机识别没主 App 好用」。根因不是模型差，是同事版
// 压根没用 AI：填 AI key 的入口在「设置」分页，而同事版把设置整个拿掉了，所以永远
// 退回手机本地的 Tesseract。修法是带公司报账密钥去换服务端那把共用 key。
// 这一组守住的是：同事手机上一个 key 都没有的情况下，仍然走得到 AI 那条路。
console.log('\n【24】拍收据：没有自己的 AI key 也要能用 AI（拿公司密钥换服务端那把）');
if (want()) {
  const h = await newPage();
  const { page, errs, aiProxyCalls } = h;
  await signIn(h);
  ok('前提：同事手机上没有自己的 AI key',
     await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('aiKey')).length === 0));

  // 直接喂一张画布给识别函数，不必真的开相机
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 300;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 300);
    g.fillStyle = '#000'; g.font = '28px sans-serif'; g.fillText('TOTAL 12.34', 20, 150);
    await runReceiptSmartOCR(c);
  });
  await page.waitForTimeout(500);

  ok('真的去打了 AI 识别（不是默默退回本地 OCR）', aiProxyCalls.length === 1, aiProxyCalls.length);
  ok('用的是 Mistral', aiProxyCalls[0]?.provider === 'mistral', aiProxyCalls[0]?.provider);
  ok('带的是公司报账密钥', !!aiProxyCalls[0]?.token, Object.keys(aiProxyCalls[0] || {}));
  // 同事手机上不该有、也不该送任何 AI key——共用那把只存在服务端
  ok('没有把 AI key 送出去（共用那把只在服务端）', !aiProxyCalls[0]?.apiKey, aiProxyCalls[0]?.apiKey);
  ok('照片有一起送过去', !!aiProxyCalls[0]?.imageBase64);
  ok('无 JS 报错', errs.length === 0, errs);
  await h.ctx.close();
}

await browser.close();
console.log();
if (fails.length) {
  console.log(`不通过：${pass} 项通过 / ${fails.length} 项失败`);
  fails.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
console.log(`通过：${pass} 项通过 / 0 项失败`);
