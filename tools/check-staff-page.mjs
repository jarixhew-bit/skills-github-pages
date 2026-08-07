// 同事版报账页（staff/index.html）的浏览器自检。
//
// 跑法：
//   python3 -m http.server 8899 &
//   node tools/check-staff-page.mjs
//   （沙盒里浏览器装在别处时加 CHROMIUM_PATH=/opt/pw-browsers/chromium）
// CI 见 .github/workflows/staff-page-check.yml。
//
// 为什么要有这份：这个页面要发到同事手上，装在他们自己的手机里。会出问题的地方
// 不是「好不好看」，而是——送出去的内容对不对、离线时会不会静静丢掉一笔、
// 会不会显示到别人的数据。这三件全部在这里断言。
// 用假服务端（route 拦截）跑，不碰真的 butler，也不需要任何钥匙。
import { chromium } from 'playwright';

const PORT = 8899;
const BASE = `http://localhost:${PORT}/staff/index.html`;
const BUTLER = 'https://butler-bot.jarixhew.workers.dev';

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);

let pass = 0;
const fails = [];
const ok = (name, cond, got) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fails.push(name); console.log(`  ❌ ${name} —— 实际: ${JSON.stringify(got)}`); }
};

// 假 butler：认两把钥匙，各自只回自己的记录。刻意不实现「回别人的」——
// 页面若真去要了别人的数据，这里也给不出来，所以「看不到别人」那条要在
// 服务端测试（tests/staff-access.test.mjs）里守，这份只守页面这一侧。
const SERYI_KEY = 'seryi-key-xyz';
const BOOK = {
  [SERYI_KEY]: {
    reporter: 'Seryi', month: '2026-08', total: 25, missingPhoto: 1,
    records: [
      { id:'s1', date:'2026-08-02', categoryEn:'Lunch', billNo:'1', side:'assist',
        amountUsd:5, originalAmount:null, note:null, hasPhoto:true },
      { id:'s2', date:'2026-08-03', categoryEn:'Store', billNo:'2', side:'boss',
        amountUsd:20, originalAmount:{value:80000,currency:'KHR'}, note:'办公室用品', hasPhoto:false },
    ],
  },
};

async function newPage({ offline = false, lang = 'zh' } = {}) {
  const ctx = await browser.newContext();
  // 明确钉住语言再断言文案：headless Chromium 的 navigator.language 是 en-US，
  // 页面会自动显示英文，靠"默认语言"写断言会全挂（第一版就是这么挂的）。
  // 只在还没有选择时写入：addInitScript 每次导航都会跑，无条件写的话会把用户
  // 刚点的语言在刷新时盖掉，「刷新后记住选择」那条就永远测不出来（踩过）。
  await ctx.addInitScript(l => {
    if (!localStorage.getItem('siteLangUser')) localStorage.setItem('siteLangUser', l);
  }, lang);
  const posted = [];
  let mode = offline ? 'offline' : 'online';
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}`)) return route.continue();
    if (!u.startsWith(BUTLER)) return route.abort('failed');   // 外部网域一律挡（酒店 WiFi）
    if (mode === 'offline') return route.abort('failed');
    const h = { 'Access-Control-Allow-Origin': '*' };
    if (route.request().method() === 'GET') {
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({
          categories:['Beverage','Dinner','Lunch','Petrol','Store'],
          plateCategories:['Petrol'],
        }) });
    }
    const req = JSON.parse(route.request().postData() || '{}');
    posted.push(req);
    if (!BOOK[req.token]) return route.fulfill({ status:401, contentType:'application/json',
      headers:h, body: JSON.stringify({ error:'密钥不对' }) });
    const mine = BOOK[req.token];
    if (req.action === 'mine')
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'ok', ...mine }) });
    if (req.action === 'delete') {
      const i = mine.records.findIndex(r => r.id === req.recordId);
      if (i === -1) return route.fulfill({ status:400, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'not_found', message:'账本里没有你记的这条记录' }) });
      mine.records.splice(i, 1);
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'ok' }) });
    }
    // 新增：假服务端照 butler 的规则回一个号和归属
    const cat = String(req.items?.[0]?.categoryRaw || '').toLowerCase();
    const person = ['breakfast','lunch','dinner'].includes(cat) ? 'Seryi' : 'Boss';
    return route.fulfill({ status:200, contentType:'application/json', headers:h,
      body: JSON.stringify({ status:'ok', records:[{ id:'new1', person, refTag:'7' }] }) });
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  return { ctx, page, posted, errs, setMode: m => { mode = m; } };
}

// ---------- 【1】没钥匙时的样子 ----------
console.log('【1】还没填钥匙：只显示填钥匙那块，不显示表单');
{
  const { ctx, page, errs } = await newPage();
  await page.goto(BASE, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(400);
  ok('显示填钥匙的卡片', await page.locator('#setup').isVisible());
  ok('不显示记账表单', !(await page.locator('#app').isVisible()));
  // 钥匙错的时候必须当场说，不能等他辛辛苦苦填完一笔才报错
  await page.fill('#key-input', 'wrong-key');
  await page.click('#setup .btn');
  await page.waitForTimeout(600);
  ok('钥匙错 → 当场提示，不放进去', await page.locator('#setup').isVisible());
  ok('提示文字说得明白', (await page.textContent('#toast')).includes('钥匙不对'),
     await page.textContent('#toast'));
  ok('无 JS 报错', errs.length === 0, errs);
  await ctx.close();
}

// ---------- 【2】填对钥匙 → 认出是谁 ----------
console.log('\n【2】钥匙对了：服务端说他是谁，页面就显示谁');
let mainCtx;
{
  const { ctx, page, posted, errs } = await newPage();
  mainCtx = { ctx, page, posted, errs };
  await page.goto(BASE, { waitUntil:'domcontentloaded' });
  await page.fill('#key-input', SERYI_KEY);
  await page.click('#setup .btn');
  await page.waitForTimeout(800);
  ok('进到主界面', await page.locator('#app').isVisible());
  ok('标题显示服务端认出的名字 Seryi',
     (await page.textContent('#hdr-name')).includes('Seryi'), await page.textContent('#hdr-name'));
  // 关键：页面上没有「选择报账人」的下拉框——身份由钥匙决定，选不了也就选不错
  ok('没有「谁报的账」下拉框（身份由钥匙决定）',
     (await page.locator('select').count()) === 2, await page.locator('select').count());
  ok('类别下拉来自服务端', (await page.$$eval('#f-category option', e=>e.map(o=>o.value))).includes('Store'));
  ok('日期默认填好了', (await page.inputValue('#f-date')).length === 10, await page.inputValue('#f-date'));
  // 收据照片必须能「从相册选」，不能只让现场拍：加了 capture 属性浏览器会直接开相机、
  // 跳过选择器（2026-08-07 实机发现）。收据常常是外卖 App 截图或别人转发来的图，
  // 早就在相册里了，逼他现场拍等于这笔账记不了。
  const photoAttrs = await page.$eval('#f-photo', e => ({
    capture: e.getAttribute('capture'), accept: e.getAttribute('accept'), type: e.type,
  }));
  ok('照片输入框没有 capture 属性（否则只能开相机、选不了相册）',
     photoAttrs.capture === null, photoAttrs);
  ok('只收图片（accept=image/*）', photoAttrs.accept === 'image/*', photoAttrs);
  ok('按钮文案跟行为一致（写了「选一张」就真的能选）',
     (await page.textContent('#photo-label')).includes('选一张'), await page.textContent('#photo-label'));
  ok('无 JS 报错', errs.length === 0, errs);
}

// ---------- 【3】我记过的：显示单号、缺收据标红、合计 ----------
console.log('\n【3】我记过的清单');
{
  const { page } = mainCtx;
  const body = await page.textContent('#mine-body');
  ok('显示两笔', (await page.locator('#mine-body .item').count()) === 2,
     await page.locator('#mine-body .item').count());
  // 单号是服务端按整月算的（2 号），不能是页面自己按第几行编的（那样会是 2 但含义不同，
  // 这里用「跟服务端给的 billNo 一致」来验）
  const bnos = await page.$$eval('#mine-body .bno', e=>e.map(x=>x.textContent.trim()));
  ok('单号照抄服务端给的 1 / 2', JSON.stringify(bnos) === JSON.stringify(['1','2']), bnos);
  ok('合计是服务端算的 25.00', body.includes('25.00'), body);
  ok('缺收据那笔标出来了', body.includes('缺收据'), body);
  ok('缺收据用醒目样式（不是普通灰字）', (await page.locator('.nophoto').count()) === 1);
  ok('顶部有缺收据总提醒', body.includes('1 笔没有收据照片'), body);
  ok('标出哪笔算公司的、哪笔算自己的', body.includes('公司') && body.includes('自己'), body);
  ok('原币金额带出来（80000 KHR）', body.includes('80000 KHR'), body);
  ok('备注显示出来', body.includes('办公室用品'), body);
}

// ---------- 【4】送出：内容必须原样，且不送 reporter ----------
console.log('\n【4】送出一笔');
{
  const { page, posted, errs } = mainCtx;
  posted.length = 0;
  await page.fill('#f-amount', '12.34');
  await page.selectOption('#f-category', 'Lunch');
  await page.fill('#f-note', '跟客户午餐');
  await page.click('#submit-btn');
  await page.waitForTimeout(900);
  const p = posted.find(x => !x.action);
  ok('送出了一个新增请求', !!p, posted);
  ok('带了钥匙', p.token === SERYI_KEY, p.token);
  // 这是这个页面最重要的一条：身份由服务端从钥匙推，页面不送 reporter，
  // 送了也不算数——同事没有任何办法把账记到别人头上
  ok('**不送 reporter**（身份由钥匙决定，不给冒充的余地）', p.reporter === undefined, p.reporter);
  ok('金额原样送出，没在本地换算', p.items[0].amount === 12.34, p.items[0]);
  ok('币种原样送出', p.items[0].currency === 'USD', p.items[0].currency);
  ok('类别原样送出', p.items[0].categoryRaw === 'Lunch', p.items[0].categoryRaw);
  ok('备注送出', p.items[0].note === '跟客户午餐', p.items[0].note);
  // 送完把「写几号」显示得够大——这是同事唯一必须记住的信息
  ok('显示单号', (await page.textContent('#done-no')).trim() === '7', await page.textContent('#done-no'));
  ok('单号字号足够大（≥32px）',
     parseFloat(await page.$eval('#done-no', e=>getComputedStyle(e).fontSize)) >= 32,
     await page.$eval('#done-no', e=>getComputedStyle(e).fontSize));
  ok('送完清空金额，避免重复记同一笔', (await page.inputValue('#f-amount')) === '', await page.inputValue('#f-amount'));
  ok('无 JS 报错', errs.length === 0, errs);
}

// ---------- 【5】车牌类项目 ----------
console.log('\n【5】汽油这类项目要填车牌，且由服务端说了算');
{
  const { page } = mainCtx;
  await page.selectOption('#f-category', 'Petrol');
  await page.waitForTimeout(200);
  ok('选 Petrol → 车牌栏出现', await page.locator('#plate-wrap').isVisible());
  await page.fill('#f-amount', '50');
  await page.click('#submit-btn');
  await page.waitForTimeout(500);
  ok('没填车牌不给送', (await page.textContent('#toast')).includes('车牌'), await page.textContent('#toast'));
  await page.selectOption('#f-category', 'Lunch');
  await page.waitForTimeout(200);
  ok('换回 Lunch → 车牌栏收起', !(await page.locator('#plate-wrap').isVisible()));
}

// ---------- 【6】删除 ----------
console.log('\n【6】删掉自己记错的');
{
  const { page, posted } = mainCtx;
  posted.length = 0;
  page.on('dialog', d => d.accept());
  await page.click('#mine-body .item:first-child .del');
  await page.waitForTimeout(900);
  const d = posted.find(x => x.action === 'delete');
  ok('送出删除请求', !!d, posted);
  ok('带了钥匙和记录 id', d.token === SERYI_KEY && d.recordId === 's1', d);
  ok('删完清单少一笔', (await page.locator('#mine-body .item').count()) === 1,
     await page.locator('#mine-body .item').count());
  await mainCtx.ctx.close();
}

// ---------- 【7】离线：不能静静丢掉一笔 ----------
console.log('\n【7】没网时记账：存本机、有网自动补送（这是最容易丢钱的地方）');
{
  const { ctx, page, posted, errs, setMode } = await newPage();
  await page.goto(BASE, { waitUntil:'domcontentloaded' });
  await page.evaluate(k => localStorage.setItem('staffExpenseKey', k), SERYI_KEY);
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(700);
  setMode('offline');
  await page.fill('#f-amount', '9.99');
  await page.selectOption('#f-category', 'Dinner');
  await page.click('#submit-btn');
  await page.waitForTimeout(900);
  ok('提示已存本机（没有假装成功）',
     (await page.textContent('#toast')).includes('没网'), await page.textContent('#toast'));
  const q = await page.evaluate(()=>JSON.parse(localStorage.getItem('staffExpenseQueue')||'[]'));
  ok('这笔真的进了队列，没丢', q.length === 1 && q[0].items[0].amount === 9.99, q);
  ok('顶部显示还有几笔没送出', (await page.textContent('#offline-note')).includes('1'),
     await page.textContent('#offline-note'));

  // 恢复网络 → 自动补送
  posted.length = 0;
  setMode('online');
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(1200);
  const sent = posted.find(x => !x.action && x.items?.[0]?.amount === 9.99);
  ok('有网后自动补送出去', !!sent, posted.map(x=>x.action || 'add'));
  ok('补送时也带钥匙', sent && sent.token === SERYI_KEY, sent && sent.token);
  const q2 = await page.evaluate(()=>JSON.parse(localStorage.getItem('staffExpenseQueue')||'[]'));
  ok('送出去之后队列清空（不会重复送）', q2.length === 0, q2);
  ok('无 JS 报错', errs.length === 0, errs);
  await ctx.close();
}

// ---------- 【8】双语 ----------
console.log('\n【8】中英双语（同事不一定读中文）');
{
  const { ctx, page, errs } = await newPage({ lang:'zh' });
  await page.goto(BASE, { waitUntil:'domcontentloaded' });
  await page.evaluate(k => localStorage.setItem('staffExpenseKey', k), SERYI_KEY);
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(800);
  ok('默认按存下的选择显示中文', (await page.textContent('body')).includes('记一笔'));
  await page.click('#langbtn');
  await page.waitForTimeout(400);
  const en = await page.textContent('body');
  ok('切到英文后表单是英文', en.includes('New expense') && en.includes('Submit'), null);
  ok('清单也跟着变英文（脚本画的部分不能漏）',
     en.includes('My records this month') && en.includes('No receipt'), null);
  ok('缺收据提醒也是英文', en.includes('paper receipts at month end'), null);
  // 全站共用的语言 key，跟仓库里其他双语页面一致
  ok('语言选择存进全站共用的 siteLangUser',
     (await page.evaluate(()=>localStorage.getItem('siteLangUser'))) === 'en');
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(700);
  ok('刷新后记住英文', (await page.textContent('body')).includes('New expense'));
  ok('无 JS 报错', errs.length === 0, errs);
  await ctx.close();
}
{
  // 没手动选过语言时跟系统语言走（这个 headless 浏览器是 en-US → 英文）
  const ctx2 = await browser.newContext();
  await ctx2.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  const p2 = await ctx2.newPage();
  await p2.goto(BASE, { waitUntil:'domcontentloaded' });
  await p2.waitForTimeout(400);
  ok('从没选过语言 → 跟系统语言（这台是英文）',
     (await p2.textContent('body')).includes('Enter your key'), await p2.textContent('#setup h2'));
  await ctx2.close();
}

// ---------- 【9】退出 ----------
console.log('\n【9】换钥匙 / 退出');
{
  const { ctx, page } = await newPage();
  await page.goto(BASE, { waitUntil:'domcontentloaded' });
  await page.evaluate(k => localStorage.setItem('staffExpenseKey', k), SERYI_KEY);
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(700);
  page.on('dialog', d => d.accept());
  await page.click('button[onclick="forgetKey()"]');
  await page.waitForTimeout(900);
  ok('钥匙被清掉', (await page.evaluate(()=>localStorage.getItem('staffExpenseKey'))) === null);
  ok('回到填钥匙那一屏', await page.locator('#setup').isVisible());
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
