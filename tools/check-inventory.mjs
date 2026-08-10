/**
 * inventory/index.html 的自检（真浏览器跑，Playwright）。
 *
 * 跑法：
 *   python3 -m http.server 8899 &
 *   node tools/check-inventory.mjs
 * 沙盒里浏览器装在别处，要带 CHROMIUM_PATH=/opt/pw-browsers/chromium。
 *
 * 为什么要用真浏览器而不是读代码判断：这里管的是老板的酒／茶叶／虫草库存数量，
 * 点两下按钮就可能多扣一瓶——见 .claude/rules/diagnosis.md 2026-08-08 那条教训，
 * 这类窗口期 bug 只有用 el.click(); el.click() 连打两下的真实双击才测得出来
 * （page.click() 会等元素恢复可点，page.evaluate 里同步调两次函数也测不出来）。
 *
 * 全程用 ctx.route('**\/*', ...) 拦掉所有请求，不打真实的 butler-bot 接口。
 */
import { chromium } from 'playwright';

const PORT = process.env.CHECK_PORT || 8899;
const URL = `http://localhost:${PORT}/inventory/`;
const API = 'https://butler-bot.jarixhew.workers.dev/inventory';

let pass = 0; const fails = [];
const ok = (n, c, got) => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fails.push(n); console.log(`  ❌ ${n} — 实际: ${JSON.stringify(got)}`); }
};

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);

// 一份跟真接口形状一致的假数据：wine 两个位置＋一个已用完，tea/herb 空
function fakeCategories() {
  return [
    { key:'wine', label:'酒', defaultUnit:'瓶', items: [
      { id:'w1', name:'Laffite 2001', count:11, unit:'瓶', location:'西港', note:'老板留用', added_at:'2026-01-01' },
      { id:'w2', name:'Pavie', count:17, unit:'瓶', location:'西港', note:'', added_at:'2026-01-01' },
      { id:'w3', name:'茅台50年', count:1, unit:'瓶', location:'金边', note:'', added_at:'2026-01-01' },
      { id:'w4', name:'红酒过期款', count:0, unit:'瓶', location:'西港', note:'', added_at:'2026-01-01' },
      { id:'w5', name:'白兰地', count:0, unit:'瓶', location:'', note:'', added_at:'2026-01-01' },
    ]},
    { key:'tea', label:'茶叶', defaultUnit:'饼', items: [] },
    { key:'herb', label:'虫草', defaultUnit:'克', items: [] },
  ];
}

// ---------- 场景一：没填密钥 ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let hitApi = false;
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}`)) return route.continue();
    if (u.startsWith(API)) { hitApi = true; return route.fulfill({ status:200, contentType:'application/json', body:'{}' }); }
    return route.abort('failed');
  });

  console.log('【1】没填密钥：显示引导，不显示报错堆栈，也不打接口');
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(600);
  ok('引导横幅显示', await page.locator('#guide-banner').isVisible());
  ok('错误横幅不显示', !(await page.locator('#error-banner').isVisible()));
  ok('没有请求打去接口', !hitApi, hitApi);
  ok('三个类别标签都在', await page.locator('.tab-btn').count() === 3);
  const tabTexts = await page.$$eval('.tab-btn', els => els.map(e => e.textContent));
  ok('标签含 酒／茶叶／虫草', tabTexts.some(t=>t.includes('酒')) && tabTexts.some(t=>t.includes('茶叶')) && tabTexts.some(t=>t.includes('虫草')), tabTexts);
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));

  console.log('\n【1b】点「去设置」能填密钥');
  await page.click('#guide-settings-link');
  await page.waitForTimeout(200);
  ok('设置弹窗打开', await page.locator('#modal-settings').isVisible());
  await page.fill('#settings-token', 'test-token-abc');
  await page.click('#settings-save');
  await page.waitForTimeout(300);
  ok('保存到 localStorage', await page.evaluate(()=>localStorage.getItem('inventoryToken')) === 'test-token-abc');

  // 两个页面同在 github.io 这一个站点下，localStorage 同源共用。记账 App 那边的输入框是
  // password 型、打开设置又不回填，密钥忘了就真的看不到了——所以库存页要能直接借用它存的
  // 那把，不必让人再输一遍（2026-08-09 用户就是忘了密钥卡在这）。
  console.log('\n【1c】自己没设密钥时，借用记账 App 已存的那把');
  await page.evaluate(() => {
    localStorage.removeItem('inventoryToken');
    localStorage.setItem('expenseTracker_companyToken', 'boss-key-from-expense-app');
  });
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(600);
  ok('不再显示「还没设密钥」的引导', !(await page.locator('#guide-banner').isVisible()));
  await page.click('#btn-settings');
  await page.waitForTimeout(200);
  ok('设置里看得到借来的密钥（忘了也能在这查回来）',
     await page.inputValue('#settings-token') === 'boss-key-from-expense-app');
  // 借用只在读取时兜底，不写回自己的 key——那边换钥匙时这边要跟着变，不留过期副本
  ok('没有把借来的密钥复制成自己的一份',
     await page.evaluate(()=>localStorage.getItem('inventoryToken')) === null);
  await ctx.close();
}

// ---------- 场景二：正常数据 ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let posted = [];
  let serverCats = fakeCategories();
  let forceError = null; // {action, message}

  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}`)) return route.continue();
    if (u.startsWith(API)) {
      const req = JSON.parse(route.request().postData() || '{}');
      const h = { 'Access-Control-Allow-Origin':'*' };
      if (forceError && forceError.action === req.action) {
        // status 可指定：服务端除了 error 还会回 forbidden（同事版钥匙查库存时），
        // 页面必须一视同仁当成失败，不能只认 error 就把 forbidden 当成功往下走。
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status: forceError.status || 'error', message: forceError.message }) });
      }
      if (req.action === 'list') {
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', categories: serverCats }) });
      }
      posted.push(req);
      if (req.action === 'adjust') {
        const cat = serverCats.find(c=>c.key===req.category);
        const it = cat.items.find(x=>x.id===req.id);
        it.count = Math.max(0, Number(it.count) + Number(req.delta));
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', item: it }) });
      }
      if (req.action === 'add') {
        const cat = serverCats.find(c=>c.key===req.category);
        const item = { id:'new'+Date.now(), name:req.name, count:req.count, unit:req.unit, location:req.location, note:req.note||'', added_at:'2026-08-09' };
        cat.items.push(item);
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', item, merged:false }) });
      }
      if (req.action === 'update') {
        const cat = serverCats.find(c=>c.key===req.category);
        const it = cat.items.find(x=>x.id===req.id);
        Object.assign(it, { name:req.name, count:req.count, unit:req.unit, location:req.location, note:req.note });
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', item: it }) });
      }
      if (req.action === 'remove') {
        const cat = serverCats.find(c=>c.key===req.category);
        const idx = cat.items.findIndex(x=>x.id===req.id);
        const [removed] = cat.items.splice(idx,1);
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', removed }) });
      }
      return route.fulfill({ status:400, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'error', message:'假服务端不认识这个 action' }) });
    }
    return route.abort('failed');
  });

  await page.addInitScript(() => localStorage.setItem('inventoryToken', 'test-token-abc'));

  console.log('\n【2】正常加载：按位置分组，小计对得上');
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(700);
  ok('引导横幅不显示', !(await page.locator('#guide-banner').isVisible()));
  ok('错误横幅不显示', !(await page.locator('#error-banner').isVisible()));
  const locNames = await page.$$eval('.loc-name', els => els.map(e=>e.textContent.trim()));
  ok('两个有库存的位置分组：西港、金边', locNames.includes('📍 西港') && locNames.includes('📍 金边'), locNames);
  const subTexts = await page.$$eval('.loc-sub', els => els.map(e=>e.textContent.trim()));
  ok('西港小计 = 28 瓶（11+17）', subTexts.some(t=>t.includes('28 瓶')), subTexts);
  ok('金边小计 = 1 瓶', subTexts.some(t=>t.includes('1 瓶')), subTexts);
  const usedUpSummary = await page.textContent('details.used-up summary');
  ok('已用完区块显示 2 种（红酒过期款＋白兰地）', /已用完（2 种）/.test(usedUpSummary||''), usedUpSummary);
  const usedUpOpen = await page.evaluate(()=>document.querySelector('details.used-up').open);
  ok('已用完区块默认折叠', usedUpOpen === false, usedUpOpen);

  console.log('\n【3】切到茶叶／虫草：空数据显示空状态而不是坏掉');
  await page.click('.tab-btn[data-cat="tea"]');
  await page.waitForTimeout(300);
  ok('茶叶标签变 active', await page.evaluate(()=>document.querySelector('.tab-btn[data-cat="tea"]').classList.contains('active')));
  ok('茶叶显示空状态', await page.locator('.empty-state').isVisible());
  const teaEmptyTxt = await page.textContent('.empty-state');
  ok('空状态文字提到茶叶', (teaEmptyTxt||'').includes('茶叶'), teaEmptyTxt);
  ok('没有报错', errs.length === 0, errs.slice(0,3));
  await page.click('.tab-btn[data-cat="herb"]');
  await page.waitForTimeout(300);
  ok('虫草也显示空状态', await page.locator('.empty-state').isVisible());
  await page.click('.tab-btn[data-cat="wine"]');
  await page.waitForTimeout(300);

  console.log('\n【4】点 + 发出正确的请求');
  posted = [];
  const plusBtn = page.locator('.item-row[data-id="w1"] .qty-plus');
  await plusBtn.click();
  await page.waitForTimeout(600);
  ok('发了 1 个请求', posted.length === 1, posted.length);
  ok('action 是 adjust，delta 是 1', posted[0]?.action==='adjust' && posted[0]?.delta===1, posted[0]);
  ok('category/id 正确', posted[0]?.category==='wine' && posted[0]?.id==='w1', posted[0]);
  const w1Qty = await page.textContent('.item-row[data-id="w1"] .qty-val');
  ok('数量变成 12', (w1Qty||'').includes('12'), w1Qty);

  console.log('\n【5】连点两下 + 只发一次请求（真双击，用原生 el.click() 连打两下）');
  posted = [];
  const dbl = await page.evaluate((sel) => {
    const row = document.querySelector(`.item-row[data-id="w1"]`);
    const btn = row.querySelector('.qty-plus');
    btn.click(); btn.click();
    return true;
  });
  await page.waitForTimeout(700);
  ok('连点两下只送出 1 个请求', posted.length === 1, posted.length);
  const w1QtyAfterDbl = await page.textContent('.item-row[data-id="w1"] .qty-val');
  ok('数量只加了 1（变成 13，不是 14）', (w1QtyAfterDbl||'').includes('13'), w1QtyAfterDbl);

  console.log('\n【6】接口返回 status:error 时把 message 显示出来');
  forceError = { action:'adjust', message:'假服务端说库存对不上' };
  await page.waitForTimeout(500); // 让【5】的锁窗口先过去，避免误触发防连点
  const minusBtn = page.locator('.item-row[data-id="w2"] .qty-minus');
  await minusBtn.click();
  await page.waitForTimeout(600);
  const toastTxt = await page.textContent('#toast');
  ok('toast 显示了服务端的 message', (toastTxt||'').includes('假服务端说库存对不上'), toastTxt);
  forceError = null;

  // 库存是老板私人物品，服务端对同事版钥匙回的是 status:"forbidden" 而不是 "error"。
  // 页面若只认 "error"，forbidden 会被当成成功、往下读 data.item 读到 undefined，
  // 表现成「莫名其妙坏掉」而不是「告诉他钥匙不对」。
  console.log('\n【6b】接口返回 status:forbidden 也要当成失败提示出来');
  forceError = { action:'adjust', status:'forbidden', message:'库存只有老板能查看和修改' };
  await page.waitForTimeout(500);
  const beforeFb = await page.textContent('.item-row[data-id="w2"] .qty-val');
  await page.locator('.item-row[data-id="w2"] .qty-minus').click();
  await page.waitForTimeout(600);
  const fbToast = await page.textContent('#toast');
  ok('toast 显示了 forbidden 的 message', (fbToast||'').includes('只有老板'), fbToast);
  const afterFb = await page.textContent('.item-row[data-id="w2"] .qty-val');
  ok('被拒绝时数量没有被改动', beforeFb === afterFb, { beforeFb, afterFb });
  forceError = null;

  console.log('\n【7】分享文字格式正确');
  await page.addInitScript(() => {}); // no-op，确认后面用 evaluate 直接挂假的 share 更可靠
  const shareCalls = [];
  await page.exposeFunction('__recordShare', (opts) => { shareCalls.push(opts); });
  await page.evaluate(() => {
    navigator.share = (opts) => { window.__recordShare(opts); return Promise.resolve(); };
  });
  await page.click('#btn-share-all');
  await page.waitForTimeout(300);
  ok('调用了 navigator.share', shareCalls.length === 1, shareCalls);
  const shareText = shareCalls[0]?.text || '';
  ok('标题行含图标与日期', /^🍷 酒库存（\d{4}-\d{2}-\d{2}）/.test(shareText), shareText);
  // w1（Laffite）在【4】【5】里被加过库存（11→13），这里用当前实际值算小计，
  // 不是页面加载时的原始 11+17
  ok('含西港小计 30 瓶（13+17，含前面测试加过的库存）', shareText.includes('📍 西港　共 30 瓶'), shareText);
  ok('含金边小计 1 瓶', shareText.includes('📍 金边　共 1 瓶'), shareText);
  ok('含具体条目 x11 格式', /Laffite 2001 x\d+/.test(shareText), shareText);
  ok('末尾提到已用完 2 种', /另有 2 种已用完$/.test(shareText.trim()), shareText);

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
  await page.click('#btn-share-all');
  await page.waitForTimeout(400);
  const clip = await page.evaluate(()=>window.__clipboardCalls);
  ok('退回剪贴板复制', clip.length === 1, clip.length);
  const toastTxt2 = await page.textContent('#toast');
  ok('提示已复制', (toastTxt2||'').includes('已复制'), toastTxt2);

  console.log('\n【7c】用户主动取消分享（AbortError）不算失败，不弹错误', );
  await page.evaluate(() => {
    window.__clipboardCalls = [];
    navigator.share = () => { const e = new Error('cancelled'); e.name = 'AbortError'; return Promise.reject(e); };
  });
  await page.click('#btn-share-all');
  await page.waitForTimeout(400);
  const clipAfterCancel = await page.evaluate(()=>window.__clipboardCalls);
  ok('取消后不会又去走复制兜底', clipAfterCancel.length === 0, clipAfterCancel);

  console.log('\n【8】添加新条目：位置下拉来自已有数据，能新增位置');
  await page.click('#btn-add');
  await page.waitForTimeout(300);
  const locOpts = await page.$$eval('#add-location-select option', els => els.map(e=>e.value));
  ok('下拉含已有位置 西港/金边 与新位置选项', locOpts.includes('西港') && locOpts.includes('金边') && locOpts.includes('__NEW__'), locOpts);
  await page.selectOption('#add-location-select', '__NEW__');
  await page.waitForTimeout(150);
  ok('选新位置后出现文字输入框', await page.locator('#add-location-new').isVisible());
  await page.fill('#add-name', '新到的酒');
  await page.fill('#add-count', '5');
  await page.fill('#add-location-new', '仓库B');
  await page.click('#add-submit');
  await page.waitForTimeout(700);
  ok('新条目出现在列表', (await page.textContent('#list')).includes('新到的酒'));
  ok('新位置分组出现', (await page.textContent('#list')).includes('仓库B'));

  console.log('\n【9】编辑与删除');
  await page.click('.item-row[data-id="w3"]');
  await page.waitForTimeout(300);
  ok('编辑弹窗打开且带入原值', await page.inputValue('#edit-name') === '茅台50年');
  await page.fill('#edit-count', '3');
  await page.click('#edit-submit');
  await page.waitForTimeout(600);
  ok('数量更新为 3', (await page.textContent('.item-row[data-id="w3"] .qty-val')||'').includes('3'));

  page.once('dialog', d => d.accept());
  await page.click('.item-row[data-id="w3"]');
  await page.waitForTimeout(300);
  await page.click('#edit-delete');
  await page.waitForTimeout(600);
  ok('删除后条目消失', !(await page.locator('.item-row[data-id="w3"]').count()));

  console.log('\n【10】全程无 JS 报错');
  ok('无 JS 报错', errs.length === 0, errs.slice(0,5));

  await ctx.close();
}

await browser.close();

console.log(`\n结果：${pass} 通过，${fails.length} 失败`);
if (fails.length) {
  console.log('失败项：' + fails.join('；'));
  process.exit(1);
}
console.log('全绿');
