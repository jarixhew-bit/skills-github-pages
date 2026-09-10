/**
 * expense-tracker.html 公司报账功能的自检（真浏览器跑）。
 *
 * 跑法：
 *   npm i playwright && npx playwright install chromium   （首次）
 *   python3 -m http.server 8899 &
 *   node tools/check-expense-company.mjs
 * CI：.github/workflows/expense-company-check.yml，改到 expense-tracker.html 就跑。
 *
 * 为什么要用真浏览器而不是读代码判断：这里管的是钱。送去公司账本的金额、币种、
 * 算谁头上，错一个就是账目对不上，光看代码"看起来对"不算数（见 judgment.md 第 5 节）。
 *
 * 测试全程把 localhost 以外的网域全部断掉，等于把「酒店/商家白名单 WiFi」在本地复现：
 * 那种网络是这个 App 反复踩坑的场景（2026-07-24 图像引擎、2026-08-02 本地 OCR、
 * 2026-08-03 Firebase SDK，全是同一类），所以基线就设成最恶劣的网络。
 */
import { chromium } from 'playwright';

const PORT = process.env.CHECK_PORT || 8899;
const URL = `http://localhost:${PORT}/expense-tracker.html`;
const BUTLER = 'https://butler-bot.jarixhew.workers.dev/company-expense';

let pass = 0; const fails = [];
/**
 * 等条件成立，而不是死等固定时间（2026-08-11 提速改造）。
 * 原本整份自检有 84 秒是纯粹在 waitForTimeout 里睡觉，其中大半是
 * 「送出一笔之后等 1.5 秒」——实际上零点几秒就到了。
 * 注意：断言「某件事没有发生」的地方不能用它（等一件不会发生的事只能真的等），
 * 那些 waitForTimeout 都留着，并在原地注明理由。
 */
async function until(fn, { timeout = 6000, interval = 20, what = '条件' } = {}) {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - t0 > timeout) throw new Error(`等不到「${what}」（超时 ${timeout}ms）`);
    await new Promise(r => setTimeout(r, interval));
  }
}

/**
 * 「让 App 把服务端回应写回本机记录」不能用固定 waitForTimeout(120) 赌——
 * 2026-08-28 用真实数据抓到根因：check-all.py 并发 6，这台沙盒只有 4 核，
 * 7 个 chromium 同时跑时 company 这份自检稳定复现失败（5 次里 2 次红，
 * 都红在这类「送出后立刻读本机状态」的断言）。120ms 是「机器不忙」时的
 * 经验值，机器忙的时候 JS 事件循环被抢占，这段回写可能要几百 ms 才跑到，
 * 断言读早了就看到半成品状态。改成轮询实际写回的条件（复用 until()，
 * 6 秒超时）——机器快就几十 ms 通过，机器慢就多等一会，不假设固定时长。
 */
async function untilWriteback(page, evalFn, what) {
  await until(() => page.evaluate(evalFn), { what: what || '服务端回应写回本机记录' });
}

/** fill() 之后确认值真的留在框里——页面可能在两次操作之间重渲染把输入清掉
 *  （2026-08-29：check-all 并行跑时「描述作为备注送出」偶发假红，单独跑就过）。
 *  值没留住就补填一次，再等它稳定；等条件而不是等固定时长。 */
async function fillStable(page, sel, val) {
  await page.fill(sel, val);
  try {
    await until(async () => (await page.inputValue(sel)) === val,
      { timeout: 2000, what: `${sel} 的值稳定在「${val}」` });
  } catch (e) {
    await page.fill(sel, val);
    await until(async () => (await page.inputValue(sel)) === val,
      { what: `${sel} 补填后的值稳定在「${val}」` });
  }
}

const ok = (n, c, got) => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fails.push(n); console.log(`  ❌ ${n} — 实际: ${JSON.stringify(got)}`); }
};

// CHROMIUM_PATH 是给「浏览器装在别处」的环境用的（例如本仓库的沙盒把 chromium
// 预装在 /opt/pw-browsers/chromium）。CI 里用 npx playwright install 装的话不用设。
const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);

// ---------- 场景一：外部网域全挡（酒店 WiFi） ----------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let posted = []; let butlerMode = 'ok';
  // edit（就地改）单独记一份：验「有没有重复记账」要看的是**有没有再来一次 add**，
  // 不能把 edit 也算进去（2026-08-13 加 edit 时分出来的）
  let edited = [];
  const todayStr = new Date().toISOString().slice(0,10);
  const serverBook = []; let recSeq = 0;   // 假的公司账本，用来验证删除真的删到了远端
  // 假的备用金：跟真服务端同一个形状——事件流 + 余额现算（绝不存一个「当前余额」字段）
  const pettyEvents = [];
  const pettyCalls = { add: 0 };
  // 假的待claim：同样是事件流 + 现算总数，不存一个「当前总数」的字段
  const claimEvents = [];
  const claimTotal = () => Math.round(claimEvents.reduce((t,e)=>t+e.amountUsd,0)*100)/100;
  const pettyRows = () => ['Seryi','Kuang','Yang'].map(person => {
    let openIdx = -1;
    pettyEvents.forEach((e,i)=>{ if(e.person===person && e.type==='open') openIdx = i; });
    if (openIdx === -1) return { person, status:'unset', balance:null, topups:[], spent:0 };
    const open = pettyEvents[openIdx];
    const after = pettyEvents.filter((e,i)=> e.person===person && e.type!=='open' && i>openIdx);
    const added = after.reduce((t,e)=>t+e.amountUsd, 0);
    const r2 = n => Math.round(n*100)/100;
    return { person, status:'ok', opened:r2(open.amountUsd), openedDate:open.date,
             spent:0, balance:r2(open.amountUsd + added),
             topups: after.slice().reverse().map(e=>({ date:e.date, amountUsd:r2(e.amountUsd), type:e.type })) };
  });
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}`)) return route.continue();
    if (u.startsWith(BUTLER)) {
      if (butlerMode === 'offline') return route.abort('failed');
      const h = { 'Access-Control-Allow-Origin': '*' };
      if (route.request().method() === 'GET')
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({
            categories:['Beverage','Car Wash','Dinner','Driver Meal','Lunch','Petrol','Postage','Store'],
            plateCategories:['Car Wash','Driver Meal','Petrol'],
            // 括号里填什么由服务端说了算：车牌那几类不给（App 按默认的车牌处理），
            // 司机餐给「司机名字」——这条就是这次要验的差别
            plateFields:{'Driver Meal':{what:'司机名字', whatEn:'Driver name', example:'Phal'}},
            // 正餐清单 + 「这一餐是老板的」该送什么原文（butler 的 BOSS_MEAL_RAW）。
            // 故意只给 Lunch/Dinner：清单是服务端说了算，App 不许自己补齐四餐。
            mealCategories:[{label:'Lunch', bossRaw:'老板午餐'}, {label:'Dinner', bossRaw:'老板晚餐'}],
            // 人员名册由服务端给（butler 的 config/people.json），App 的下拉框照它渲染
            people:[
              {code:'Boss', label:'Boss（老板自己）'},
              {code:'Seryi', label:'Seryi', ownMeals:['Breakfast','Lunch','Dinner']},
              {code:'Kuang', label:'Kuang', ownMeals:['Breakfast','Lunch']},
              {code:'Yang', label:'Yang', ownMeals:['Breakfast','Lunch','Dinner']},
            ],
          }) });
      const req = JSON.parse(route.request().postData() || '{}');
      // action:'ledger'（首屏那张「公司账本·今天」的卡）跟记账无关，
      // 别混进 posted——不然「送出 1 个请求」这类断言会被它污染（踩过）。
      // 备用金的三个 action 也不进 posted（跟 ledger 同理，别污染「送出几个请求」的断言）
      if (req.action === 'petty') {
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', scope:'owner', people: pettyRows(),
            lastEvent: pettyEvents.length ? pettyEvents[pettyEvents.length-1] : null }) });
      }
      if (req.action === 'pettyAdd') {
        pettyCalls.add++;
        // 真服务端会拒的，假的也要拒——不然 App 送了坏数据这边照单全收，测了个寂寞
        if (!['Seryi','Kuang','Yang'].includes(req.person) ||
            !['open','topup','adjust'].includes(req.type) || !Number.isFinite(Number(req.amount)) ||
            (req.type === 'topup' && Number(req.amount) < 0)) {
          return route.fulfill({ status:400, contentType:'application/json', headers:h,
            body: JSON.stringify({ status:'error', message:'假服务端拒绝了这笔备用金' }) });
        }
        const ev = { id:'pe'+pettyEvents.length, person:req.person, type:req.type,
                     amountUsd:Number(req.amount), date:todayStr, at:new Date().toISOString(), note:null };
        pettyEvents.push(ev);
        const row = pettyRows().find(r=>r.person===req.person);
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', event:ev, balance:row }) });
      }
      if (req.action === 'pettyUndo') {
        if (!pettyEvents.length) return route.fulfill({ status:400, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'error', message:'没得撤销' }) });
        const removed = pettyEvents.pop();
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', removed, people: pettyRows() }) });
      }
      if (req.action === 'pendingClaim') {
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', total: claimTotal(),
            history: claimEvents.slice().reverse().slice(0,20),
            lastEvent: claimEvents.length ? claimEvents[claimEvents.length-1] : null }) });
      }
      if (req.action === 'pendingClaimAdjust') {
        // 真服务端拒 0 和非数字，假的也要拒
        if (!Number.isFinite(Number(req.amount)) || Number(req.amount) === 0) {
          return route.fulfill({ status:400, contentType:'application/json', headers:h,
            body: JSON.stringify({ status:'error', message:'假服务端拒绝了这笔待claim' }) });
        }
        const ev = { id:'pc'+claimEvents.length, amountUsd:Number(req.amount),
                     note:req.note||null, date:todayStr, at:new Date().toISOString() };
        claimEvents.push(ev);
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', event:ev, total: claimTotal() }) });
      }
      if (req.action === 'pendingClaimUndo') {
        if (!claimEvents.length) return route.fulfill({ status:400, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'error', message:'没得撤销' }) });
        const removed = claimEvents.pop();
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', removed, total: claimTotal() }) });
      }
      if (req.action === 'ledger') {
        const days = new Map();
        for (const r of serverBook) {
          const d = r.date || todayStr;
          if (!days.has(d)) days.set(d, []);
          days.get(d).push({ id:r.id, date:d, categoryEn:r.categoryEn || 'Store', billNo:String(r.refTag || 1),
            side: r.person === 'Boss' ? 'boss' : 'assist', person:r.person, reporter:r.reporter,
            amountUsd:Number(r.amountUsd) || 0, originalAmount:null, note:null, hasPhoto:true });
        }
        const mk = rows => Math.round(rows.reduce((s,x)=>s+x.amountUsd,0)*100)/100;
        const all = [...days.values()].flat();
        // 每天再按「谁记的」分块——真服务端从 2026-08-07 起就是这个形状
        // （companyExpenseLedgerForApp 的 byReporter），假的这边要跟着，
        // 不然测的是一个线上不存在的响应
        const grp = rows => {
          const m = new Map();
          for (const r of rows) { if (!m.has(r.reporter)) m.set(r.reporter, []); m.get(r.reporter).push(r); }
          return [...m.entries()].map(([name, rs]) =>
            ({ name, count:rs.length, total:mk(rs), missingPhoto:0, records:rs }));
        };
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', month: todayStr.slice(0,7), scope:'owner',
            days:[...days.entries()].sort((a,b)=>b[0].localeCompare(a[0]))
              .map(([date, rows])=>({ date, count:rows.length, total:mk(rows), missingPhoto:0,
                                      byReporter:grp(rows), records:rows })),
            count: all.length, total: mk(all), missingPhoto:0,
            byPerson:[], byReporter:[], orphan:0 }) });
      }
      posted.push(req);
      if (req.action === 'edit') edited.push(req);
      // 「找回本月记录」用的接口：回指定报账人这个月记过的那些（老板的钥匙可以指定谁）
      if (req.action === 'mine') {
        const who = req.reporter || 'Boss';
        const rows = serverBook.filter(r => r.reporter === who).map(r => ({
          id: r.id, date: todayStr, categoryEn: r.categoryEn || 'Store',
          billNo: r.refTag, side: r.person === 'Boss' ? 'boss' : 'assist',
          amountUsd: Number(r.amountUsd) || 0, note: null,
        }));
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', reporter: who, records: rows }) });
      }
      if (req.action === 'edit') {
        // 就地改，照 butler 的 companyExpenseEditFromApp：只换金额/类别/备注，
        // person 按新类别重算，id / refTag / reporter 一律不动。
        const i = serverBook.findIndex(r => r.id === req.recordId);
        if (i === -1) return route.fulfill({ status:400, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'not_found', message:'账本里没有这条' }) });
        const OWN = { Seryi:['breakfast','lunch','dinner'], Kuang:['breakfast','lunch'],
                      Yang:['breakfast','lunch','dinner'] };
        const c = String(req.categoryRaw || '').toLowerCase();
        const rep = serverBook[i].reporter;
        const isMine = !/老板|boss/i.test(c) && (OWN[rep] || []).includes(c);
        serverBook[i] = { ...serverBook[i], person: isMine ? rep : 'Boss',
                          amount: req.amount, amountUsd: Number(req.amount) || 0 };
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', record: serverBook[i] }) });
      }
      if (req.action === 'delete') {
        const i = serverBook.findIndex(r => r.id === req.recordId);
        if (i === -1) return route.fulfill({ status:400, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'not_found', message:'账本里没有这条' }) });
        const [removed] = serverBook.splice(i, 1);
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'ok', removed }) });
      }
      // 假服务端照 butler 的规则算 person 回传（真规则住在 butler，这里只是替身）：
      // 名册里各人的 ownMeals 算他自己，其余一律 Boss。
      const OWN_MEALS = { Seryi:['breakfast','lunch','dinner'], Kuang:['breakfast','lunch'],
                          Yang:['breakfast','lunch','dinner'] };
      const cat = String(req.items?.[0]?.categoryRaw || '').toLowerCase();
      const rep = req.reporter;
      // 原文带「老板」两字的一律 Boss（butler 的 forceBoss），即使是同事自己那几餐
      const mine = !/老板|boss/i.test(cat) && (OWN_MEALS[rep] || []).includes(cat);
      const person = mine ? rep : 'Boss';
      const id = 'rec' + (++recSeq);
      // 照 butler 的规则派号：一个月从 1 排到底，左右两张表分开排
      const table = person === 'Boss' ? 'boss' : 'assist';
      const refTag = req.items?.[0]?.refTag
        || String(serverBook.filter(r => r.table === table).length + 1);
      // reporter / amountUsd 也要存下来：账本清单按「谁记的」分块、每块带小计，
      // 不存的话拉回来的每一笔都是「没有名字、0 块钱」，分块那几条断言等于没测
      serverBook.push({ id, person, table, refTag, reporter: rep,
                        // categoryEn 存下来：action:'mine'（找回本月记录）要照原样回给 App
                        categoryEn: req.items?.[0]?.categoryRaw || 'Store',
                        amount: req.items?.[0]?.amount,
                        amountUsd: Number(req.items?.[0]?.amount) || 0 });
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'ok', records:[{id, person, refTag}], total:0 }) });
    }
    return route.abort('failed');
  });
  const errs = []; page.on('pageerror', e => errs.push(e.message));

  console.log('【1】所有外部网域被挡时，App 仍能完整启动');
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  // 这条锁住 2026-08-03 修的 bug：Firebase SDK 从 gstatic.com 加载，挡掉后原本
  // firebase.initializeApp() 会当场抛错，整个脚本停在第一行，App 完全打不开。
  ok('无 JS 报错（云同步连不上不能拖垮整个 App）', errs.length===0, errs.slice(0,3));
  ok('主界面渲染出来', await page.locator('.fab').isVisible());
  ok('退化成纯本地模式', await page.evaluate(()=>cloudAvailable===false));

  console.log('\n【1b】设置页要能看到版本号（排查「是不是旧版」时靠它）');
  await page.evaluate(()=>switchTab('settings'));
  await page.waitForTimeout(600);
  const buildText = await page.textContent('#app-build-info');
  ok('版本号显示出来了', /版本\s+\d{4}-\d{2}-\d{2}/.test(buildText||''), buildText);
  ok('跟代码里的常量一致',
     (buildText||'').includes(await page.evaluate(()=>APP_BUILD)), buildText);
  ok('强制更新按钮存在', await page.evaluate(()=>typeof forceReload==='function'));

  console.log('\n【2】公司账户的币种闸门（公司账本是美元记账）');
  await page.evaluate(()=>localStorage.setItem('expenseTracker_companyToken','test-token-123'));
  ok('非美元账户不准设成公司账户', await page.evaluate(()=>{
    const a = data.accounts.find(x=>x.currency!=='USD'); if(!a) return true;
    toggleCompanyAccount(a.id); return !data.accounts.find(x=>x.id===a.id).isCompany;
  }));
  ok('美元账户可以设成公司账户', await page.evaluate(()=>{
    const a = data.accounts.find(x=>x.currency==='USD');
    toggleCompanyAccount(a.id); data.currentAccountId = a.id; saveData();
    return !!data.accounts.find(x=>x.id===a.id).isCompany;
  }));

  console.log('\n【2b】账户卡片的余额：负数必须看得出是负的（普通个人账户）');
  // 2026-08-07 用户发现卡片把负余额显示成正数——大字用了 Math.abs()，负号被丢到
  // 下面那行小字的末尾（"HKD · 总结余 −"），后面还没跟东西，看起来像被截断了。
  // 钱的正负看错是最要命的一类显示错误。用非公司账户测——公司账户从 2026-08-09
  // 起不再显示这种本地加总的「结余」，见下面【2c】。
  await page.evaluate(()=>{
    const a = data.accounts.find(x=>!x.isCompany);
    data.transactions = data.transactions.filter(t=>t.accountId!==a.id);
    data.transactions.push({id:'neg1', accountId:a.id, type:'expense', amount:1234,
      categoryId:(data.categories[0]||{}).id, date:'2026-08-01', desc:'测试'});
    saveData(); switchTab('overview'); renderAccCards();
  });
  await page.waitForTimeout(400);
  const cardBal = await page.evaluate(()=>{
    const a = data.accounts.find(x=>!x.isCompany);
    const cards = [...document.querySelectorAll('.acc-card')];
    const c = cards.find(el=>(el.textContent||'').includes(a.name));
    return { bal: c.querySelector('.acc-card-bal').textContent.trim(),
             cur: c.querySelector('.acc-card-cur').textContent.trim() };
  });
  ok('负余额的大字带负号（不是显示成正数）', /^[-−]/.test(cardBal.bal), cardBal);
  ok('金额本身还是对的（1234.00）', cardBal.bal.includes('1234.00'), cardBal);
  // 负号不能孤零零挂在小字末尾——那是这次 bug 的具体形态
  ok('小字那行末尾没有孤立的负号', !/[-−]\s*$/.test(cardBal.cur), cardBal);
  await page.evaluate(()=>{
    data.transactions = data.transactions.filter(t=>t.id!=='neg1'); saveData();
  });

  console.log('\n【2c】公司账户卡片不能再显示本地加总的「结余」，改显示 Yang 的备用金余额');
  // 2026-08-09 用户发现公司账户卡片显示 -246.35——公司账户只记支出、本地历史加总
  // 只会一路往负的方向跑，跟真实情况毫无关系。用户接着说明：负责转钱给 Seryi/Kuang
  // 的是 Yang，「主要财务都是他在负责」，改成显示他的备用金余额（还没拉到就显示
  // 「点击查看」占位，不能显示任何自己算出来的数字）。
  await page.evaluate(()=>{
    const a = data.accounts.find(x=>x.isCompany);
    data.transactions.push({id:'neg2', accountId:a.id, type:'expense', amount:246.35,
      categoryId:(data.categories[0]||{}).id, date:'2026-08-01', desc:'测试'});
    pettyState.data = null;
    saveData(); switchTab('overview'); renderAccCards();
  });
  await page.waitForTimeout(400);
  const companyCardEmpty = await page.evaluate(()=>{
    const a = data.accounts.find(x=>x.isCompany);
    const cards = [...document.querySelectorAll('.acc-card')];
    const c = cards.find(el=>(el.textContent||'').includes(a.name));
    return { bal: c.querySelector('.acc-card-bal').textContent.trim(),
             cur: c.querySelector('.acc-card-cur').textContent.trim() };
  });
  ok('还没拉到服务端数据时，不显示任何自己算出来的数字', companyCardEmpty.bal === '点击查看', companyCardEmpty);
  ok('也不再是「总结余」这个说法', !companyCardEmpty.cur.includes('总结余'), companyCardEmpty);

  // Yang 有余额时：正常显示
  await page.evaluate(()=>{
    pettyState.data = [
      { person:'Seryi', status:'unset', balance:null, topups:[], spent:0 },
      { person:'Kuang', status:'unset', balance:null, topups:[], spent:0 },
      { person:'Yang', status:'ok', balance:88.8, opened:100, openedDate:'2026-08-01', topups:[], spent:11.2 },
    ];
    renderAccCards();
  });
  await page.waitForTimeout(200);
  let companyCardLoaded = await page.evaluate(()=>{
    const a = data.accounts.find(x=>x.isCompany);
    const cards = [...document.querySelectorAll('.acc-card')];
    const c = cards.find(el=>(el.textContent||'').includes(a.name));
    return { bal: c.querySelector('.acc-card-bal').textContent.trim(),
             cur: c.querySelector('.acc-card-cur').textContent.trim() };
  });
  ok('显示的是 Yang 的备用金余额（88.80），不是本地加总', companyCardLoaded.bal.includes('88.80'), companyCardLoaded);
  ok('小字注明是 Yang 的备用金', companyCardLoaded.cur.includes('Yang'), companyCardLoaded);

  // Yang 垫了钱、余额是负数时：负号不能被 Math.abs() 弄丢（跟【2b】同一类 bug）
  await page.evaluate(()=>{
    pettyState.data[2] = { person:'Yang', status:'ok', balance:-52.25, opened:0, openedDate:'2026-08-01', topups:[], spent:52.25 };
    renderAccCards();
  });
  await page.waitForTimeout(200);
  companyCardLoaded = await page.evaluate(()=>{
    const a = data.accounts.find(x=>x.isCompany);
    const cards = [...document.querySelectorAll('.acc-card')];
    const c = cards.find(el=>(el.textContent||'').includes(a.name));
    return c.querySelector('.acc-card-bal').textContent.trim();
  });
  ok('Yang 垫钱时余额带负号，不是显示成正数', /^[-−]/.test(companyCardLoaded), companyCardLoaded);
  ok('负余额金额本身还是对的（52.25）', companyCardLoaded.includes('52.25'), companyCardLoaded);

  await page.evaluate(()=>{ pettyState.data = null; });
  await page.evaluate(()=>{
    data.transactions = data.transactions.filter(t=>t.id!=='neg2'); saveData();
    ledState.data = null; ledState.month = null;
  });

  console.log('\n【3】类别清单来自服务端，不是 App 里硬编的');
  await page.reload({ waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  const cats = await page.evaluate(()=>getCompanyCats());
  ok('拿到服务端返回的类别（含用户教过的自定义类别）', cats.includes('Car Wash') && cats.includes('Postage'), cats);
  // 车牌类也要在清单里——只能回 Telegram 记的话，App 里公司账户的合计会少一块
  ok('含车牌类（Petrol / Car Wash）', cats.includes('Petrol') && cats.includes('Car Wash'), cats);
  ok('车牌类清单也是服务端给的，不是 App 判断的',
     JSON.stringify(await page.evaluate(()=>getCompanyPlateCats()))===JSON.stringify(['Car Wash','Driver Meal','Petrol']),
     await page.evaluate(()=>getCompanyPlateCats()));

  console.log('\n【4】记一笔公司账 —— 送出去的内容必须原样，不能在本地算');
  await page.evaluate(()=>showAddTx());
  await until(() => page.evaluate(() => {
    const m = document.getElementById('modal-add-tx');
    return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
  }), { what: '记账弹窗打开' });
  ok('公司字段显示', await page.locator('#tx-company-wrap').isVisible());
  ok('App 的类别宫格隐藏（避免看起来要选两次）', !(await page.locator('#tx-cat-wrap').isVisible()));
  // 描述会给公司看，标签必须说明白，别让用户以为只存在手机里
  ok('描述栏标签写明会进公司 Excel',
     (await page.textContent('#tx-desc-label')).includes('公司 Excel'),
     await page.textContent('#tx-desc-label'));
  ok('说明文字显示出来', await page.locator('#tx-desc-note').isVisible());
  // 「谁报的账」的选项由服务端名册渲染（butler 的 config/people.json）——App 里不写死
  // 人名，所以以后加人/改名只改 butler 一处。这里锁住「服务端说谁在册，下拉就有谁」。
  const repOpts = await page.$$eval('#tx-company-reporter option',
    els => els.map(e => ({ v: e.value, t: e.textContent })));
  // 2026-08-13 用户要求拿掉 Boss：主 App 的使用者是 Yang，以 Boss 身份报账会让他
  // 自己吃的正餐也被判成公司的（Boss 不在名册、没有 ownMeals），等于永远放弃
  // 「这一餐算谁的」这个区分。买给老板的餐改走那个开关，不靠报账人选 Boss。
  ok('下拉框只列名册里的人，不含 Boss',
     JSON.stringify(repOpts.map(o=>o.v))===JSON.stringify(['Seryi','Kuang','Yang']), repOpts);
  ok('预设是 Yang（主 App 的主要使用者）',
     await page.inputValue('#tx-company-reporter')==='Yang',
     await page.inputValue('#tx-company-reporter'));
  // 括号里标出各人哪几餐算自己，省得用户去记规则；Kuang 只有早/午，不能写成早/午/晚
  ok('Seryi 标注早/午/晚餐', repOpts[0].t.includes('自己的 早/午/晚餐进右表'), repOpts[0]);
  ok('Kuang 标注早/午餐（不是三餐）',
     repOpts[1].t.includes('自己的 早/午餐进右表') && !repOpts[1].t.includes('晚'), repOpts[1]);
  ok('清单里没有 Boss（买给老板的餐走「这一餐算谁的」那个开关）',
     !repOpts.some(o=>o.v==='Boss'), repOpts);

  await fillStable(page, '#tx-amount', '12.34');
  await fillStable(page, '#tx-desc', '跟客户午餐');
  await page.selectOption('#tx-company-category', 'Lunch');
  await page.selectOption('#tx-company-reporter', 'Seryi');
  await fillStable(page, '#tx-company-reftag', '7');
  // 送出前再确认一次这几格都还在——重渲染清空过就会在这里被逮到，而不是
  // 让断言在「note 是空的」上假红，看不出真因。
  await until(async () => (await page.inputValue('#tx-desc')) === '跟客户午餐'
    && (await page.inputValue('#tx-amount')) === '12.34',
    { what: '金额与描述在送出前都还在框里' });
  const _sent1 = posted.length;
  await page.evaluate(()=>saveTx());
  await until(() => posted.length > _sent1, { what: '这一笔送到服务端' });
  await untilWriteback(page,
    () => data.transactions[data.transactions.length-1]?.company?.status==='sent',
    '12.34 那笔写回 sent 状态');
  const p = posted[0] || {};
  ok('送出 1 个请求', posted.length===1, posted.length);
  ok('带了密钥', p.token==='test-token-123', p.token);
  ok('reporter 原样送出', p.reporter==='Seryi', p.reporter);
  ok('金额是用户填的原始值（换算交给 butler）', p.items?.[0]?.amount===12.34, p.items?.[0]);
  ok('币种原样送出', p.items?.[0]?.currency==='USD', p.items?.[0]?.currency);
  ok('类别原样送出', p.items?.[0]?.categoryRaw==='Lunch', p.items?.[0]?.categoryRaw);
  ok('收据编号原样送出', p.items?.[0]?.refTag==='7', p.items?.[0]?.refTag);
  // 描述要一并送去公司账本——它会显示在 Excel 的 DETAILS 后面
  ok('描述作为备注送出', p.items?.[0]?.note==='跟客户午餐', p.items?.[0]);
  ok('日期格式 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(p.date||''), p.date);
  const tx = await page.evaluate(()=>data.transactions[data.transactions.length-1]);
  ok('本机也留了一份并标记已送达', tx?.company?.status==='sent', tx?.company);
  ok('自动对应到 App 的类别（用户不用选两次）', tx?.categoryId==='cat_food', tx?.categoryId);
  // Seryi 的 Lunch → 算 Seryi 自己 → Excel 右边。App 只转述服务端算的结果，不自己算。
  ok('存下服务端算的 person（Seryi 的 Lunch → Seryi）', tx?.company?.person==='Seryi', tx?.company);

  console.log('\n【4d】单据号：留空由服务端派，App 只负责转述给用户');
  posted = [];
  await page.evaluate(()=>showAddTx());
  await until(() => page.evaluate(() => {
    const m = document.getElementById('modal-add-tx');
    return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
  }), { what: '记账弹窗打开' });
  await page.fill('#tx-amount', '6.60');
  await page.selectOption('#tx-company-category', 'Dinner');
  // 原本这里选 Boss；Boss 已从清单拿掉（2026-08-13），改用 Kuang——他的 ownMeals
  // 只有早/午餐，选 Dinner 时服务端照样判成 Boss，这一组要验的行为没变
  await page.selectOption('#tx-company-reporter', 'Kuang');
  const _sent2 = posted.length;
  await page.evaluate(()=>saveTx());
  await until(() => posted.length > _sent2, { what: '这一笔送到服务端' });
  await untilWriteback(page,
    () => !!data.transactions.filter(t=>t.amount===6.6).pop()?.company?.refTag,
    '服务端派的单号写回本机');
  ok('留空时不往服务端塞编号', posted[0]?.items?.[0]?.refTag===null, posted[0]?.items?.[0]);
  const numbered = await page.evaluate(()=>data.transactions.filter(t=>t.amount===6.6).pop());
  ok('存下服务端派的单号', !!numbered?.company?.refTag, numbered?.company);
  // 提示只闪 2.2 秒，单号必须能在明细里长期看到，否则抄不到纸上就对不了账
  await page.evaluate(()=>switchTab('transactions'));
  await page.waitForTimeout(600);
  const listText = await page.textContent('#tx-list');
  ok('明细列表里能看到单据号', listText.includes(`📄${numbered.company.refTag}号`), listText?.slice(0,200));
  // 送达是异步的，回来后必须重画——否则入账成功了列表还标着「待送出」
  ok('入账成功后列表不再显示「待送出」', !listText.includes('待送出'), listText?.slice(0,200));
  // toast 不能超出手机屏幕（原本 white-space:nowrap 会直接跑出去）
  const toastFits = await page.evaluate(()=>{
    const el = document.getElementById('toast');
    el.style.whiteSpace='pre-line';
    el.textContent = '✅ 已入账 Boss（左表）\n📄 单据写 12 号';
    el.classList.add('show');
    const r = el.getBoundingClientRect();
    const ok_ = r.left >= 0 && r.right <= window.innerWidth;
    el.classList.remove('show');
    return {ok_, left:Math.round(r.left), right:Math.round(r.right), vw:window.innerWidth};
  });
  ok('长提示不会超出手机屏幕', toastFits.ok_, toastFits);
  ok('单号是服务端给的那个（App 不自己编）',
     numbered?.company?.refTag === serverBook.slice(-1)[0]?.refTag,
     [numbered?.company?.refTag, serverBook.slice(-1)[0]?.refTag]);

  console.log('\n【4a】收据编号只收 1~2 位数字（非数字会让整份月度 Excel 生成失败）');
  posted = [];
  await page.evaluate(()=>showAddTx());
  await until(() => page.evaluate(() => {
    const m = document.getElementById('modal-add-tx');
    return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
  }), { what: '记账弹窗打开' });
  await page.fill('#tx-amount', '10');
  await page.selectOption('#tx-company-category', 'Lunch');
  await page.evaluate(()=>{ document.getElementById('tx-company-reftag').value = 'A1'; });
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1000);
  ok('非数字编号被挡下，什么都没送出', posted.length===0, posted);
  ok('这笔也没被存进本机（保存整个中止）',
     !(await page.evaluate(()=>data.transactions.some(t=>t.amount===10 && t.company))));
  await page.evaluate(()=>{ document.getElementById('tx-company-reftag').value = '12'; });
  const _sent3 = posted.length;
  await page.evaluate(()=>saveTx());
  await until(() => posted.length > _sent3, { what: '这一笔送到服务端' });
  await page.waitForTimeout(120);   // 让 App 把服务端回应写回本机记录
  ok('改成合法编号后正常送出', posted.length===1, posted.length);
  ok('编号原样送到服务端', posted[0]?.items?.[0]?.refTag==='12', posted[0]?.items?.[0]);
  await page.evaluate(()=>closeModal('modal-add-tx'));

  console.log('\n【4c】车牌类项目：选了才出现车牌栏，没填不准送出');
  posted = [];
  await page.evaluate(()=>showAddTx());
  await until(() => page.evaluate(() => {
    const m = document.getElementById('modal-add-tx');
    return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
  }), { what: '记账弹窗打开' });
  ok('一般类别下车牌栏是藏着的', !(await page.locator('#tx-company-plate-wrap').isVisible()));
  await page.selectOption('#tx-company-category', 'Petrol');
  ok('选了汽油，车牌栏出现', await page.locator('#tx-company-plate-wrap').isVisible());
  await page.fill('#tx-amount', '60');
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1000);
  ok('没填车牌不准送出', posted.length===0, posted);
  await page.fill('#tx-company-plate', 'ns6868');
  const _sent4 = posted.length;
  await page.evaluate(()=>saveTx());
  await until(() => posted.length > _sent4, { what: '这一笔送到服务端' });
  await page.waitForTimeout(120);   // 让 App 把服务端回应写回本机记录
  ok('填了车牌就送得出去', posted.length===1, posted.length);
  ok('车牌转成大写送出', posted[0]?.items?.[0]?.plate==='NS6868', posted[0]?.items?.[0]);
  ok('类别原样送出（拼接交给 butler）', posted[0]?.items?.[0]?.categoryRaw==='Petrol', posted[0]?.items?.[0]);
  // 保存成功后弹窗会自动关闭，重开一个再验「换类别时车牌栏跟着收起」
  await page.evaluate(()=>showAddTx());
  await until(() => page.evaluate(() => {
    const m = document.getElementById('modal-add-tx');
    return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
  }), { what: '记账弹窗打开' });
  await page.selectOption('#tx-company-category', 'Petrol');
  ok('重开后选汽油，车牌栏还是会出现', await page.locator('#tx-company-plate-wrap').isVisible());
  await page.selectOption('#tx-company-category', 'Lunch');
  ok('换回一般类别，车牌栏收起来', !(await page.locator('#tx-company-plate-wrap').isVisible()));
  await page.evaluate(()=>closeModal('modal-add-tx'));

  console.log('\n【4d】司机餐：括号里填的是司机名字，不是车牌（2026-08-19 用户要求）');
  // 为什么单独验：这栏原本写死「车牌号」，规则一改就有两个静静出错的地方——
  // 提示还写车牌（同事照着填车牌，Excel 印出 DRIVER MEAL (2AH9988)），
  // 以及名字被车牌那套规则强制大写（Phal → PHAL）／被挡下来（车牌规则不收纯字母外的字）。
  posted = [];
  await page.evaluate(()=>showAddTx());
  await until(() => page.evaluate(() => {
    const m = document.getElementById('modal-add-tx');
    return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
  }), { what: '记账弹窗打开' });
  await page.selectOption('#tx-company-category', 'Driver Meal');
  ok('选了司机餐，那一栏出现', await page.locator('#tx-company-plate-wrap').isVisible());
  ok('标题写的是「司机名字」不是「车牌号」',
     (await page.textContent('#tx-company-plate-label') || '').includes('司机名字'),
     await page.textContent('#tx-company-plate-label'));
  ok('说明里不再提车牌',
     !/车牌/.test(await page.textContent('#tx-company-plate-hint') || ''),
     await page.textContent('#tx-company-plate-hint'));
  await page.fill('#tx-amount', '3');
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(800);
  ok('没填司机名字不准送出', posted.length===0, posted);
  await page.fill('#tx-company-plate', 'Phal');
  const _sentD = posted.length;
  await page.evaluate(()=>saveTx());
  await until(() => posted.length > _sentD, { what: '这一笔送到服务端' });
  await page.waitForTimeout(120);
  ok('名字不被转成大写（送出的是 Phal 不是 PHAL）',
     posted[0]?.items?.[0]?.plate==='Phal', posted[0]?.items?.[0]);
  ok('类别原样送出（拼接交给 butler）', posted[0]?.items?.[0]?.categoryRaw==='Driver Meal',
     posted[0]?.items?.[0]);
  // 切回汽油，那一栏要变回问车牌——两套规矩不能互相沾染
  await page.evaluate(()=>showAddTx());
  await until(() => page.evaluate(() => {
    const m = document.getElementById('modal-add-tx');
    return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
  }), { what: '记账弹窗打开' });
  await page.selectOption('#tx-company-category', 'Petrol');
  ok('换回汽油，标题变回「车牌号」',
     (await page.textContent('#tx-company-plate-label') || '').includes('车牌号'),
     await page.textContent('#tx-company-plate-label'));
  await page.evaluate(()=>closeModal('modal-add-tx'));

  console.log('\n【4b】同一个人报的非正餐要算到 Boss 头上（Excel 换到左边）');
  posted = [];
  await page.evaluate(()=>showAddTx());
  await until(() => page.evaluate(() => {
    const m = document.getElementById('modal-add-tx');
    return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
  }), { what: '记账弹窗打开' });
  await page.fill('#tx-amount', '20');
  await page.selectOption('#tx-company-category', 'Store');
  await page.selectOption('#tx-company-reporter', 'Seryi');
  const _sent5 = posted.length;
  await page.evaluate(()=>saveTx());
  await until(() => posted.length > _sent5, { what: '这一笔送到服务端' });
  await untilWriteback(page,
    () => data.transactions[data.transactions.length-1]?.company?.person==='Boss',
    '服务端算的 person 写回本机');
  const txStore = await page.evaluate(()=>data.transactions[data.transactions.length-1]);
  ok('reporter 仍原样送出 Seryi', posted[0]?.reporter==='Seryi', posted[0]?.reporter);
  ok('但 person 是服务端算的 Boss（→ Excel 左边）', txStore?.company?.person==='Boss', txStore?.company);

  console.log('\n【5】送不出去时不能丢账：进队列，恢复后补送');
  butlerMode = 'offline'; posted = [];
  await page.evaluate(()=>showAddTx());
  await until(() => page.evaluate(() => {
    const m = document.getElementById('modal-add-tx');
    return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
  }), { what: '记账弹窗打开' });
  await page.fill('#tx-amount', '5.60');
  await page.selectOption('#tx-company-category', 'Store');
  // 这一段是断线情境（butlerMode='offline'），请求根本到不了服务端——
  // 所以要等的不是「送出去了」，而是「进了本机的待送队列」
  await page.evaluate(()=>saveTx());
  await until(async () => (await page.evaluate(
       ()=>JSON.parse(localStorage.getItem('expenseTracker_companyQueue')||'[]'))).length === 1,
     { what: '这一笔进了待送队列' });
  ok('进了待送队列', (await page.evaluate(()=>JSON.parse(localStorage.getItem('expenseTracker_companyQueue')||'[]'))).length===1);
  const tx2 = await page.evaluate(()=>data.transactions[data.transactions.length-1]);
  ok('本机记录标成 pending', tx2?.company?.status==='pending', tx2?.company);
  ok('金额没丢', tx2?.amount===5.6, tx2?.amount);
  butlerMode = 'ok';
  const _sent7 = posted.length;
  await page.evaluate(()=>flushCompanyQueue({loud:true}));
  await until(() => posted.length > _sent7, { what: '这一笔送到服务端' });
  await untilWriteback(page,
    () => JSON.parse(localStorage.getItem('expenseTracker_companyQueue')||'[]').length===0,
    '补送后队列清空写回本机');
  ok('恢复后队列清空', (await page.evaluate(()=>JSON.parse(localStorage.getItem('expenseTracker_companyQueue')||'[]'))).length===0);
  ok('补送的正是那笔 5.60 Store', posted.some(x=>x.items?.[0]?.amount===5.6 && x.items?.[0]?.categoryRaw==='Store'), posted);

  console.log('\n【5b】编辑已送出的公司账：两边一起改，但绝不能再 add 一次（会金额翻倍）');
  // 三代契约，别再改回去：
  // - 2026-08-08 之前：只改本机、不动账本 → 两边静静分叉（Seryi 8/2 那笔本机 11.76、
  //   账本 11.78），这是当初出事的写法。
  // - 2026-08-08：整张表单锁死、本机也不许改。挡住了分叉，代价是改一个数字要删掉重记。
  // - 2026-08-13（现在）：服务端有了 action:'edit'，改金额/类别会**先改账本、成功了
  //   才改本机**。分叉照样挡住（失败就整个中止，见【16】那组），而且不用删掉重记。
  // 这一组守住的仍是最要命的那条：不管怎么改，都不许再走一次 add。
  posted = []; edited = [];
  const sentId = await page.evaluate(()=>{
    const t = data.transactions.filter(x=>x.company && x.company.status==='sent').pop();
    return t ? t.id : null;
  });
  ok('找得到一笔已送出的公司账', !!sentId, sentId);
  const amtBefore = await page.evaluate(id=>data.transactions.find(t=>t.id===id)?.amount, sentId);
  await page.evaluate(id=>editTx(id), sentId);
  await page.waitForTimeout(600);
  await page.evaluate(()=>{                        // 硬改金额再保存
    const el = document.getElementById('tx-amount');
    el.disabled = false; el.value = '99.99';
    saveTx();
  });
  await page.waitForTimeout(1500);
  ok('没有再走一次 add（不会重复记账）', posted.filter(x=>!x.action).length===0, posted);
  ok('走的是 edit，而且只送了一次', edited.length===1, edited);
  ok('改的正是账本里那一条（带上了记录编号）', !!edited[0]?.recordId, edited[0]);
  ok('本机金额跟着改成 99.99（两边一致，不分叉）',
     await page.evaluate(id=>data.transactions.find(t=>t.id===id)?.amount, sentId) === 99.99,
     [amtBefore, await page.evaluate(id=>data.transactions.find(t=>t.id===id)?.amount, sentId)]);
  ok('账本那边也真的改了（不是只改本机）',
     serverBook.find(r=>r.id===edited[0]?.recordId)?.amountUsd === 99.99,
     serverBook.find(r=>r.id===edited[0]?.recordId));
  ok('状态仍是 sent（没退回 pending）', await page.evaluate(id=>data.transactions.find(t=>t.id===id)?.company?.status==='sent', sentId));
  await page.evaluate(()=>closeModal('modal-add-tx'));
  ok('也没混进补送队列', (await page.evaluate(()=>JSON.parse(localStorage.getItem('expenseTracker_companyQueue')||'[]'))).length===0);

  console.log('\n【5c】App 里删记录会同步删掉公司账本那条');
  // 确认框：默认一律「确定」。要测「按取消会怎样」时把 dialogAction 改成 'dismiss'
  // ——不能再挂第二个 once 处理器，playwright 会报「dialog already handled」。
  let dialogAction = 'accept';
  page.on('dialog', d => dialogAction === 'dismiss' ? d.dismiss() : d.accept());
  posted = [];
  await page.evaluate(()=>showAddTx());
  await until(() => page.evaluate(() => {
    const m = document.getElementById('modal-add-tx');
    return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
  }), { what: '记账弹窗打开' });
  await page.fill('#tx-amount', '33.33');
  await page.selectOption('#tx-company-category', 'Dinner');
  const _sent8 = posted.length;
  await page.evaluate(()=>saveTx());
  await until(() => posted.length > _sent8, { what: '这一笔送到服务端' });
  await untilWriteback(page,
    () => !!data.transactions.filter(t=>t.amount===33.33).pop()?.company?.recordId,
    '服务端记录 id 写回本机');
  const delTx = await page.evaluate(()=>data.transactions.filter(t=>t.amount===33.33).pop());
  ok('入账后存下了服务端的记录 id', !!delTx?.company?.recordId, delTx?.company);
  const bookBefore = serverBook.length;
  ok('公司账本里确实有这条', serverBook.some(r=>r.id===delTx.company.recordId), serverBook);

  await page.evaluate(id=>deleteTxById(id), delTx.id);
  await page.waitForTimeout(1500);
  ok('本机已删除', !(await page.evaluate(id=>data.transactions.some(t=>t.id===id), delTx.id)));
  ok('公司账本那条也删了', !serverBook.some(r=>r.id===delTx.company.recordId), serverBook);
  ok('账本少了一条（没误删别的）', serverBook.length===bookBefore-1, serverBook.length);

  console.log('\n【5d】连不上时不准只删本机（那正是要消灭的状态）');
  await page.evaluate(()=>showAddTx());
  await until(() => page.evaluate(() => {
    const m = document.getElementById('modal-add-tx');
    return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
  }), { what: '记账弹窗打开' });
  await page.fill('#tx-amount', '44.44');
  await page.selectOption('#tx-company-category', 'Dinner');
  const _sent9 = posted.length;
  await page.evaluate(()=>saveTx());
  await until(() => posted.length > _sent9, { what: '这一笔送到服务端' });
  await untilWriteback(page,
    () => !!data.transactions.filter(t=>t.amount===44.44).pop()?.company?.recordId,
    '服务端记录 id 写回本机');
  const keepTx = await page.evaluate(()=>data.transactions.filter(t=>t.amount===44.44).pop());
  butlerMode = 'offline';
  await page.evaluate(id=>deleteTxById(id), keepTx.id);
  await page.waitForTimeout(1500);
  ok('连不上时本机这条保留着', await page.evaluate(id=>data.transactions.some(t=>t.id===id), keepTx.id));
  ok('公司账本那条也还在', serverBook.some(r=>r.id===keepTx.company.recordId), serverBook);
  butlerMode = 'ok';
  await page.evaluate(id=>deleteTxById(id), keepTx.id);
  await page.waitForTimeout(1500);
  ok('恢复后两边都删掉', !(await page.evaluate(id=>data.transactions.some(t=>t.id===id), keepTx.id))
     && !serverBook.some(r=>r.id===keepTx.company.recordId), serverBook);

  console.log('\n【5e】删掉的记录不许被云端合并回来（「删了又出现」的真正病根）');
  // 合并是取并集：本机删掉后，只要云端那份还带着这条（推送失败、并发被挡、或另一台
  // 设备的旧副本先上传），下次启动一合并就并回来。墓碑机制就是堵这个洞。
  // 这里直接测 mergeData 这个纯函数——它是同步路径上唯一决定「谁活下来」的地方。
  const tombOk = await page.evaluate(()=>{
    const gone = data.deletedTxIds.map(x=>x.id);
    if(gone.length === 0) return {err:'删除后没有留下墓碑'};
    const deadId = gone[gone.length-1];
    // 云端那份是删除之前的旧副本：还带着那条已删的，另外多一条别的设备记的新账
    const cloud = {
      accounts: data.accounts, categories: data.categories, recurring: [],
      deletedTxIds: [],
      transactions: [
        {id: deadId, amount: 33.33, date: '2026-08-03', type:'expense'},
        {id: 'from_other_device', amount: 7.77, date: '2026-08-03', type:'expense'}
      ]
    };
    const merged = mergeData(data, cloud);
    return {
      resurrected: merged.transactions.some(t=>t.id===deadId),
      newKept: merged.transactions.some(t=>t.id==='from_other_device'),
      tombKept: merged.deletedTxIds.some(x=>x.id===deadId),
      deadId
    };
  });
  ok('删除时留下了墓碑', !tombOk.err, tombOk);
  ok('云端的旧副本不会把删掉的那条并回来', tombOk.resurrected===false, tombOk);
  ok('别的设备新记的账照样合并进来（没把并集改坏）', tombOk.newKept===true, tombOk);
  ok('墓碑本身也会同步出去（另一台设备才会跟着删）', tombOk.tombKept===true, tombOk);
  // 墓碑无限增长会把 localStorage 和云端 payload 撑大，180 天后要自动清掉
  ok('过期墓碑会被清掉（不会无限膨胀）', await page.evaluate(()=>{
    const old = {id:'ancient', at: Date.now() - 200*24*3600*1000};
    const merged = mergeData({...data, deletedTxIds:[...data.deletedTxIds, old]},
                             {transactions:[], deletedTxIds:[]});
    return !merged.deletedTxIds.some(x=>x.id==='ancient');
  }));
  // 删整个账户走的是另一条代码路径，漏了同样会复活
  ok('删账户时旗下记录也留墓碑', await page.evaluate(()=>{
    // 用一个临时账户测，别动主流程用到的那两个
    data.accounts.push({id:'acc_tmp_del', name:'临时', currency:'USD', color:'#888', createdAt:Date.now()});
    data.transactions.push({id:'tmp_for_acc_del', accountId:'acc_tmp_del', amount:1, date:'2026-08-03', type:'expense'});
    deleteAccount('acc_tmp_del');
    return data.deletedTxIds.some(x=>x.id==='tmp_for_acc_del')
        && !data.transactions.some(t=>t.id==='tmp_for_acc_del');
  }));

  console.log('\n【6】普通账户完全不受影响');
  await page.evaluate(()=>{ const a=data.accounts.find(x=>!x.isCompany); data.currentAccountId=a.id; saveData(); });
  await page.evaluate(()=>showAddTx());
  await until(() => page.evaluate(() => {
    const m = document.getElementById('modal-add-tx');
    return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
  }), { what: '记账弹窗打开' });
  ok('公司字段隐藏', !(await page.locator('#tx-company-wrap').isVisible()));
  ok('App 的类别宫格回来了', await page.locator('#tx-cat-wrap').isVisible());
  ok('普通账户下描述栏标签恢复原样',
     (await page.textContent('#tx-desc-label')) === '描述（选填）',
     await page.textContent('#tx-desc-label'));
  posted = [];
  await page.fill('#tx-amount', '88');
  await page.evaluate(()=>selectCat(data.categories.find(c=>c.type==='expense').id));
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1200);
  ok('普通账不会送去公司账本', posted.length===0, posted.length);
  ok('普通账正常保存', await page.evaluate(()=>data.transactions.some(t=>t.amount===88 && !t.company)));
  console.log('\n【6b】首屏的「公司账本（全员）」：同事记的账也要看得到');
  // 为什么要有这组：同事改用 App 记账之后，他们记的账在他们自己的手机里，
  // 这台手机上一笔都没有。老板每天要拿「当天合计」跟纸单核对，看不到就等于没法对账。
  await page.evaluate(()=>{ const a=data.accounts.find(x=>x.isCompany); data.currentAccountId=a.id; saveData(); });
  await page.evaluate(()=>{ ledState.data=null; ledState.fetchedAt=0; });
  await page.evaluate(()=>fetchCompanyLedger(null,{force:true}));
  await page.evaluate(()=>switchTab('overview'));
  await page.waitForTimeout(600);
  ok('首屏出现公司账本卡', await page.locator('#ov-company').isVisible());
  const ovTxt = await page.textContent('#ov-company');
  ok('卡上写着「今天」', /今天/.test(ovTxt), ovTxt);
  // 服务端算的合计，App 一个数都不许自己算（单号/合计要跟月底 Excel 完全一致）
  const srvTotal = await page.evaluate(()=>ledState.data.total);
  ok('卡上的本月合计跟服务端给的一致', ovTxt.includes(srvTotal.toFixed(2)), {ovTxt, srvTotal});
  await page.click('#ov-company');
  await page.waitForTimeout(900);
  ok('点开是完整清单', await page.locator('#modal-company-ledger').isVisible());
  const ledTxt = await page.textContent('#led-body');
  const srv = await page.evaluate(()=>ledState.data);
  // 取具体那几个元素来比，不能用「整段文字里出现过这个数」——只有一天时
  // 当天小计跟月合计是同一个数，那种写法删掉小计也照样通过（踩过，负向测试才发现）
  const dayTotals = await page.$$eval('.led-day-total', els => els.map(e => e.textContent.trim()));
  const dayDates = await page.$$eval('.led-day-date', els => els.map(e => e.textContent.trim()));
  ok('每天一个分组，日期按服务端的顺序',
     dayDates.length === srv.days.length && srv.days.every((d,i) => dayDates[i].startsWith(d.date)),
     {dayDates, srv: srv.days.map(d=>d.date)});
  ok('每天都有当天小计，数值跟服务端一致',
     dayTotals.length === srv.days.length
     && srv.days.every((d,i) => dayTotals[i].includes(d.total.toFixed(2))),
     {dayTotals, srv: srv.days.map(d=>d.total)});
  const nos = await page.$$eval('.led-no', els => els.map(e => e.textContent.trim()));
  // 顺序跟着页面走：一天里先按「谁记的」分块，块内才是那几笔（2026-08-07 起的排法）
  const srvNos = srv.days.flatMap(d => d.byReporter.flatMap(g => g.records.map(r => r.billNo)));
  ok('单号照抄服务端给的（App 不自己编）',
     JSON.stringify(nos) === JSON.stringify(srvNos), {nos, srvNos});
  // 2026-08-07 起：一天里按「谁记的」分块，一个人一块（他那几笔＋他的小计），
  // 最后才是当天总账（用户明确要的顺序，对账是一个人一叠纸单地对）
  const reporters = [...new Set(srv.days.flatMap(d => d.records.map(r => r.reporter)))];
  ok('看得到是谁记的（每个人自成一块）',
     reporters.length > 0 && reporters.every(n => ledTxt.includes(n)), {reporters, ledTxt: ledTxt.slice(0,200)});
  ok('当天总账排在人的后面，不是摆最前面',
     srv.days.every(() => true) && ledTxt.indexOf('当天总账') > ledTxt.indexOf(reporters[0]),
     ledTxt.slice(0,200));
  ok('每块的小计加起来等于当天总账',
     srv.days.every(d => Math.abs(d.byReporter.reduce((t,g)=>t+g.total,0) - d.total) < 0.005),
     srv.days.map(d => [d.total, d.byReporter.map(g=>g.total)]));
  await page.evaluate(()=>closeModal('modal-company-ledger'));

  // 同事的钥匙调这个会被服务端拒（forbidden）——那就不该摆这张卡出来
  await page.evaluate(()=>{ ledState.data=null; ledState.error='forbidden'; renderOvCompany(); });
  await page.waitForTimeout(200);
  ok('钥匙是同事的（服务端拒绝）→ 不摆这张卡', !(await page.locator('#ov-company').isVisible()));
  await page.evaluate(()=>{ ledState.error=null; });

  console.log('\n【14】备用金：老板在 App 里看余额、转钱给同事');
{
  // 这块直接改钱，而且写进去同事那边当场就看得到。守三条：
  // 1. 余额照抄服务端（App 一个数都不算）
  // 2. 送出去的 person/type/amount 必须是他填的那个（人选错、金额少个小数点都是钱的事故）
  // 3. 每一次写入都要经过确认框；取消就一个请求都不许发
  await page.evaluate(()=>{ pettyState.data = null; pettyState.fetchedAt = 0; });
  await page.evaluate(()=>fetchPetty({force:true}).then(()=>renderOvPetty()));
  await page.waitForTimeout(600);
  const card = page.locator('#ov-petty');
  ok('还没设起点：卡在，但给的是「去设定」而不是一堆 0',
     (await card.isVisible()) && /还没设起点/.test(await card.textContent() || ''),
     await card.textContent());
  ok('这时候不许出现任何金额', !/US\$/.test(await card.textContent() || ''), await card.textContent());

  // 设起点：Seryi 手上还剩 320
  await page.evaluate(()=>pettyOpenAdd('Seryi','open'));
  await page.waitForTimeout(300);
  await page.fill('#petty-amount', '320');
  const _pev1 = pettyEvents.length;
  await page.evaluate(()=>pettySubmit());
  await until(() => pettyEvents.length > _pev1, { what: '备用金这一笔写进服务端' });
  ok('起点写进服务端了', pettyEvents.length===1 && pettyEvents[0].type==='open'
     && pettyEvents[0].person==='Seryi' && pettyEvents[0].amountUsd===320, pettyEvents);
  await page.evaluate(()=>renderOvPetty());
  ok('卡上出现余额', /US\$320\.00/.test(await card.textContent() || ''), await card.textContent());

  // 转钱：金额用逗号打（手机键盘打不出小数点那台）
  await page.evaluate(()=>pettyOpenAdd('Seryi','topup'));
  await page.waitForTimeout(250);
  await page.fill('#petty-amount', '12,50');
  const _pev2 = pettyEvents.length;
  await page.evaluate(()=>pettySubmit());
  await until(() => pettyEvents.length > _pev2, { what: '备用金这一笔写进服务端' });
  const ev = pettyEvents[pettyEvents.length-1];
  ok('逗号当小数点，12,50 = 12.5（不是 1250）', ev.amountUsd===12.5, ev);
  ok('人和类型都对', ev.person==='Seryi' && ev.type==='topup', ev);
  await page.evaluate(()=>renderOvPetty());
  ok('余额跟着变成 332.50', /US\$332\.50/.test(await card.textContent() || ''), await card.textContent());

  // 确认框按取消：一个请求都不许发
  const before = pettyEvents.length;
  dialogAction = 'dismiss';
  await page.evaluate(()=>pettyOpenAdd('Kuang','open'));
  await page.waitForTimeout(250);
  await page.fill('#petty-amount', '999');
  await page.evaluate(()=>pettySubmit());
  await page.waitForTimeout(600);
  ok('取消确认后什么都没写进去', pettyEvents.length===before, pettyEvents.length);
  dialogAction = 'accept';
  await page.evaluate(()=>closeModal('modal-petty-add'));

  // 转钱不许负数——挡在送出之前
  await page.evaluate(()=>pettyOpenAdd('Seryi','topup'));
  await page.waitForTimeout(250);
  const callsBefore = pettyCalls.add;
  await page.fill('#petty-amount', '-50');
  await page.evaluate(()=>pettySubmit());
  // 这里断言的是「负数根本没送出去」——等一件不会发生的事只能真的等
  await page.waitForTimeout(500);
  // 数请求次数而不是数事件数：假服务端也会拒负数，只看「账本没变」的话，
  // App 那道闸拿掉了这条依然是绿的（2026-08-08 验假绿灯时抓到）。
  ok('负数根本没送出去（不是靠服务端拒）', pettyCalls.add===callsBefore, [pettyCalls.add, callsBefore]);
  ok('账本也确实没变', pettyEvents.length===before, pettyEvents.length);
  ok('并且当场说明为什么',
     /负数/.test(await page.textContent('#petty-add-note') || ''),
     await page.textContent('#petty-add-note'));
  await page.evaluate(()=>closeModal('modal-petty-add'));

  // 负数起点：上个月他垫了钱，结转过来是负的（2026-08-08 用户实际遇到的场景——
  // 一开始把负起点也挡掉了，他填 -52.25 存不进去，卡片也就不出现）
  const negBefore = pettyCalls.add;
  await page.evaluate(()=>pettyOpenAdd('Yang','open'));
  await page.waitForTimeout(250);
  await page.fill('#petty-amount', '-52.25');
  const _pev4 = pettyEvents.length;
  await page.evaluate(()=>pettySubmit());
  await until(() => pettyEvents.length > _pev4, { what: '备用金这一笔写进服务端' });
  ok('负数起点送得出去（不再被前端挡）', pettyCalls.add===negBefore+1, [pettyCalls.add, negBefore]);
  const negEv = pettyEvents[pettyEvents.length-1];
  ok('存进去的就是 -52.25', negEv && negEv.person==='Yang' && negEv.amountUsd===-52.25, negEv);
  await page.evaluate(()=>renderOvPetty());
  await page.waitForTimeout(250);
  const negTxt = await card.textContent() || '';
  ok('卡片出得来（不是空白）', await card.isVisible());
  ok('负余额说的是「垫了」不是「快用完了」',
     /Yang 垫了 US\$52\.25/.test(negTxt), negTxt);
  ok('垫的数写成正的，不让人对着两个负号读', !/垫了 US\$-/.test(negTxt), negTxt);
  // 「转钱」仍然不许负数——那是往回收钱，该走「调整」
  const t2 = pettyCalls.add;
  await page.evaluate(()=>pettyOpenAdd('Yang','topup'));
  await page.waitForTimeout(250);
  await page.fill('#petty-amount', '-10');
  await page.evaluate(()=>pettySubmit());
  // 这里断言的是「负数根本没送出去」——等一件不会发生的事只能真的等
  await page.waitForTimeout(500);
  ok('转钱依旧挡负数，且没送出去', pettyCalls.add===t2, [pettyCalls.add, t2]);
  await page.evaluate(()=>closeModal('modal-petty-add'));
  // 撤销掉这两笔实验，别影响后面的断言
  await page.evaluate(()=>pettyUndo());
  await page.waitForTimeout(600);

  // 撤销：把刚才那笔 12.50 撤掉，余额回到 320
  await page.evaluate(()=>pettyUndo());
  await page.waitForTimeout(700);
  ok('撤销真的从服务端拿掉了', pettyEvents.length===1, pettyEvents);
  await page.evaluate(()=>renderOvPetty());
  ok('余额回到 320', /US\$320\.00/.test(await card.textContent() || ''), await card.textContent());

  // 见底要点名（老板一眼看出该给谁转钱）
  await page.evaluate(()=>pettyOpenAdd('Kuang','open'));
  await page.waitForTimeout(250);
  await page.fill('#petty-amount', '42.5');
  const _pev6 = pettyEvents.length;
  await page.evaluate(()=>pettySubmit());
  await until(() => pettyEvents.length > _pev6, { what: '备用金这一笔写进服务端' });
  await page.evaluate(()=>renderOvPetty());
  const txt = await card.textContent() || '';
  ok('余额低的那位被点名', /Kuang[^]*快用完/.test(txt) || /快用完[^]*Kuang/.test(txt), txt);
  ok('余额够的那位不被点名', !/Seryi\s*快用完/.test(txt), txt);
  ok('无 JS 报错', errs.length===0, errs.slice(0,3));
}

  console.log('\n【15】买给老板的餐：要能标出来，且真的记到 Boss 头上');
  // 2026-08-08 用户发现：同事买了老板的午餐也只能选 Lunch，会按 ownMeals 记成他自己的，
  // 老板的餐费算进了同事那栏。这一组守的是「钱记对人」。
  {
    await page.evaluate(()=>switchTab('transactions'));
    posted = [];
    await page.evaluate(()=>showAddTx());
    await until(() => page.evaluate(() => {
      const m = document.getElementById('modal-add-tx');
      return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
    }), { what: '记账弹窗打开' });
    // 非正餐类别不该问这个问题——问了会让人以为有得选
    await page.selectOption('#tx-company-category', 'Store');
    await page.waitForTimeout(200);
    ok('选 Store 时不出现「这一餐算谁的」',
       !(await page.locator('#tx-company-whose-wrap').isVisible()));
    await page.selectOption('#tx-company-category', 'Lunch');
    await page.waitForTimeout(200);
    ok('选 Lunch 时出现「这一餐算谁的」',
       await page.locator('#tx-company-whose-wrap').isVisible());
    ok('默认是「自己吃的」（不改变原来的行为）',
       await page.evaluate(()=>state.companyWhose==='self'), await page.evaluate(()=>state.companyWhose));
    // 正餐清单是服务端给的，App 不许自己补：假服务端只给了 Lunch/Dinner
    ok('餐别清单照服务端给的（Breakfast 不在里面就不问）', await page.evaluate(()=>{
      document.getElementById('tx-company-category').value='Lunch';
      return bossRawFor('Lunch')==='老板午餐' && bossRawFor('Breakfast')===null && bossRawFor('Store')===null;
    }));

    await page.fill('#tx-amount', '8.80');
    await page.selectOption('#tx-company-reporter', 'Seryi');
    await page.evaluate(()=>setCompanyWhose('boss'));
    await page.waitForTimeout(150);
    ok('点了「老板的」按钮会亮起来',
       await page.evaluate(()=>document.getElementById('whose-boss').classList.contains('active')));
    const _sent10 = posted.length;
    await page.evaluate(()=>saveTx());
    await until(() => posted.length > _sent10, { what: '这一笔送到服务端' });
    await untilWriteback(page,
      () => data.transactions.filter(x=>x.amount===8.8).pop()?.company?.person==='Boss',
      '服务端算的 person 写回本机');
    const pb = posted[0] || {};
    ok('送出去的 categoryRaw 是服务端给的「老板午餐」',
       pb.items?.[0]?.categoryRaw==='老板午餐', pb.items?.[0]?.categoryRaw);
    ok('服务端据此算成 Boss（不是 Seryi）', await page.evaluate(()=>{
      const t = data.transactions.filter(x=>x.amount===8.8).pop(); return t?.company?.person;
    })==='Boss');
    const txBoss = await page.evaluate(()=>data.transactions.filter(x=>x.amount===8.8).pop());
    ok('本机的 categoryEn 仍是标准类别 Lunch（App 自己的分类才对得上）',
       txBoss?.company?.categoryEn==='Lunch', txBoss?.company);
    ok('对应到 App 的餐饮类别，不是「其他」', txBoss?.categoryId==='cat_food', txBoss?.categoryId);
    ok('存下 forBoss，重开 App 也看得出来', txBoss?.company?.forBoss===true, txBoss?.company);
    await page.evaluate(()=>{ switchTab('transactions'); renderTxList(); });
    await page.waitForTimeout(400);
    ok('明细列表上标出「老板的」',
       (await page.textContent('#tx-list') || '').includes('👔老板的'));

    // 对照组：同一个类别不点「老板的」，仍要记回 Seryi 自己（别把原行为改坏）
    posted = [];
    await page.evaluate(()=>showAddTx());
    await until(() => page.evaluate(() => {
      const m = document.getElementById('modal-add-tx');
      return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
    }), { what: '记账弹窗打开' });
    await page.fill('#tx-amount', '7.70');
    await page.selectOption('#tx-company-category', 'Lunch');
    await page.selectOption('#tx-company-reporter', 'Seryi');
    const _sent11 = posted.length;
    await page.evaluate(()=>saveTx());
    await until(() => posted.length > _sent11, { what: '这一笔送到服务端' });
    await untilWriteback(page,
      () => data.transactions.filter(x=>x.amount===7.7).pop()?.company?.person==='Seryi',
      '服务端算的 person 写回本机');
    ok('对照：不点「老板的」就送标准类别 Lunch',
       posted[0]?.items?.[0]?.categoryRaw==='Lunch', posted[0]?.items?.[0]?.categoryRaw);
    ok('对照：仍记到 Seryi 头上', await page.evaluate(()=>{
      const t = data.transactions.filter(x=>x.amount===7.7).pop(); return t?.company?.person;
    })==='Seryi');

    // 换成非正餐类别时，「老板的」这个选择必须被清掉——留着就是个看不见的错默认值
    await page.evaluate(()=>showAddTx());
    await until(() => page.evaluate(() => {
      const m = document.getElementById('modal-add-tx');
      return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
    }), { what: '记账弹窗打开' });
    await page.selectOption('#tx-company-category', 'Lunch');
    await page.evaluate(()=>setCompanyWhose('boss'));
    await page.selectOption('#tx-company-category', 'Store');
    await page.waitForTimeout(250);
    ok('切到非正餐类别后，选择被清回「自己吃的」',
       await page.evaluate(()=>state.companyWhose==='self'), await page.evaluate(()=>state.companyWhose));
    await page.evaluate(()=>closeModal('modal-add-tx'));
  }

  console.log('\n【16】已经报进账本的那笔不给改（改了两边会静静分叉）');
  // 2026-08-08 真出过事：Seryi 8/2 那笔本机 11.76、账本 11.78，靠肉眼比对才发现。
  // 根因是公司账本没有「改」这个操作（saveRecords 是追加，重送会翻倍），所以以前
  // 编辑已送出的记录只改本机、不动账本。现在从源头断掉：锁住表单，只留删除。
  {
    posted = [];
    await page.evaluate(()=>showAddTx());
    await until(() => page.evaluate(() => {
      const m = document.getElementById('modal-add-tx');
      return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
    }), { what: '记账弹窗打开' });
    await page.fill('#tx-amount', '11.78');
    await page.selectOption('#tx-company-category', 'Store');
    await page.selectOption('#tx-company-reporter', 'Seryi');
    const _sent12 = posted.length;
    await page.evaluate(()=>saveTx());
    await until(() => posted.length > _sent12, { what: '这一笔送到服务端' });
    await untilWriteback(page,
      () => data.transactions.filter(x=>x.amount===11.78).pop()?.company?.status==='sent',
      '11.78 那笔写回 sent 状态');
    const txId = await page.evaluate(()=>{
      const t = data.transactions.filter(x=>x.amount===11.78).pop(); return t && t.id;
    });
    ok('先记一笔并确认已送达',
       await page.evaluate(id=>{
         const t = data.transactions.find(x=>x.id===id); return t && t.company && t.company.status;
       }, txId) === 'sent');

    await page.evaluate(id=>editTx(id), txId);
    await page.waitForTimeout(600);
    ok('打开编辑：顶上说明哪些能改哪些不能', await page.locator('#tx-sent-lock').isVisible());
    // 2026-08-13 起金额和类别可以改（会同步改账本），锁的只剩服务端 edit 不给改的那三栏
    ok('金额栏可以改', !(await page.evaluate(()=>document.getElementById('tx-amount').disabled)));
    ok('类别可以改', !(await page.evaluate(()=>document.getElementById('tx-company-category').disabled)));
    ok('日期、单据号、报账人仍锁着（服务端 edit 不给改这三样）', await page.evaluate(()=>
      ['tx-date','tx-company-reftag','tx-company-reporter']
        .every(id=>document.getElementById(id).disabled)));
    ok('保存键在（现在按下去是有用的）', await page.locator('#tx-save-btn').isVisible());
    ok('删除键还在', await page.locator('#tx-delete-wrap').isVisible());

    // 最要紧的一条：账本那边改失败时，本机绝不能偷偷改掉——那就又回到两边分叉了。
    // 用 butlerMode='offline' 制造失败，再确认本机原封不动。
    // 「记一笔」的请求带 items，edit/delete/ledger 都不带——用它数 add 最直接
    const addsBefore = posted.filter(x=>x.items).length;
    butlerMode = 'offline';
    await page.evaluate(()=>{ document.getElementById('tx-amount').value = '99.99'; saveTx(); });
    await page.waitForTimeout(800);
    ok('账本改不成时：本机金额没变（宁可不改，也不许分叉）',
       await page.evaluate(id=>{
         const t = data.transactions.find(x=>x.id===id); return t && t.amount;
       }, txId) === 11.78);
    ok('账本改不成时：状态仍是 sent',
       await page.evaluate(id=>data.transactions.find(x=>x.id===id)?.company?.status==='sent', txId));
    ok('全程没有再走一次 add（重送会翻倍）',
       posted.filter(x=>x.items).length===addsBefore,
       [posted.filter(x=>x.items).length, addsBefore]);
    butlerMode = 'ok';
    await page.evaluate(()=>closeModal('modal-add-tx'));

    // 还没送出去的（排队中）必须照旧能改——队列送出去的是改完那一版
    butlerMode = 'offline';
    await page.evaluate(()=>showAddTx());
    await until(() => page.evaluate(() => {
      const m = document.getElementById('modal-add-tx');
      return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
    }), { what: '记账弹窗打开' });
    ok('新增记录时锁是解开的（别把锁留在上一笔的状态）',
       !(await page.locator('#tx-sent-lock').isVisible()) &&
       !(await page.evaluate(()=>document.getElementById('tx-amount').disabled)));
    await page.fill('#tx-amount', '3.33');
    await page.selectOption('#tx-company-category', 'Store');
    await page.evaluate(()=>saveTx());
    await page.waitForTimeout(1200);
    const pendId = await page.evaluate(()=>{
      const t = data.transactions.filter(x=>x.amount===3.33).pop(); return t && t.id;
    });
    ok('这笔是排队中', await page.evaluate(id=>{
      const t = data.transactions.find(x=>x.id===id); return t && t.company && t.company.status;
    }, pendId) === 'pending');
    await page.evaluate(id=>editTx(id), pendId);
    await page.waitForTimeout(500);
    ok('排队中的可以改（账本里还没有这一笔）',
       !(await page.locator('#tx-sent-lock').isVisible()) &&
       !(await page.evaluate(()=>document.getElementById('tx-amount').disabled)));
    await page.evaluate(()=>closeModal('modal-add-tx'));
    butlerMode = 'ok';
  }

  console.log('\n【17】照片认出来的金额，没人核对过不准保存');
  // 2026-08-08 用户要求「不要再有数目不对」。识别把 77.76 认成 77.78 这种错不会报错、
  // 不会变色，只会静静进账本，最后要靠人拿收据比对才发现——而账本收下了就只能删掉重记。
  // 所以这里是一道硬闸门，不是一句提示。
  {
    posted = [];
    await page.evaluate(()=>showAddTx());
    await until(() => page.evaluate(() => {
      const m = document.getElementById('modal-add-tx');
      return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
    }), { what: '记账弹窗打开' });
    await page.selectOption('#tx-company-category', 'Store');
    // 模拟识别填进去的金额（真实路径是 OCR/AI 填完调 markAmountUnconfirmed）
    await page.evaluate(()=>{
      document.getElementById('tx-amount').value = '77.78';
      markAmountUnconfirmed();
    });
    await page.waitForTimeout(200);
    ok('金额栏旁边出现「请跟收据核对」', await page.locator('#tx-amount-check').isVisible());
    await page.evaluate(()=>saveTx());
    await page.waitForTimeout(900);
    ok('没核对就保存 → 挡下来，什么都没送出去', posted.length===0, posted);
    ok('也没存进本机（保存整个中止）',
       !(await page.evaluate(()=>data.transactions.some(t=>t.amount===77.78))));
    ok('保存键上方写清楚为什么按不动',
       /核对/.test(await page.textContent('#tx-save-note') || ''),
       await page.textContent('#tx-save-note'));

    // 按「对的」＝核对过了
    await page.click('#tx-amount-ok');
    await page.waitForTimeout(200);
    ok('按了「对的」提示就收起来', !(await page.locator('#tx-amount-check').isVisible()));
    const _sent13 = posted.length;
    await page.evaluate(()=>saveTx());
    await until(() => posted.length > _sent13, { what: '这一笔送到服务端' });
    await page.waitForTimeout(120);   // 让 App 把服务端回应写回本机记录
    ok('核对过之后存得进去', posted.length===1, posted.length);
    ok('金额原样送出（闸门不许改数字）', posted[0]?.items?.[0]?.amount===77.78, posted[0]?.items?.[0]);

    // 自己动手改金额也算核对过——不该逼他多按一次
    posted = [];
    await page.evaluate(()=>showAddTx());
    await until(() => page.evaluate(() => {
      const m = document.getElementById('modal-add-tx');
      return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
    }), { what: '记账弹窗打开' });
    await page.selectOption('#tx-company-category', 'Store');
    await page.evaluate(()=>{
      document.getElementById('tx-amount').value = '77.78';
      markAmountUnconfirmed();
    });
    await page.fill('#tx-amount', '77.76');      // 照着收据改成对的那个数
    await page.waitForTimeout(200);
    ok('自己改过金额就算核对过（提示自动收起）',
       !(await page.locator('#tx-amount-check').isVisible()));
    const _sent14 = posted.length;
    await page.evaluate(()=>saveTx());
    await until(() => posted.length > _sent14, { what: '这一笔送到服务端' });
    await page.waitForTimeout(120);   // 让 App 把服务端回应写回本机记录
    ok('改完存得进去，送的是改后的 77.76', posted[0]?.items?.[0]?.amount===77.76, posted[0]?.items?.[0]);

    // 闸门不能留到下一笔（新增/编辑都要复位）
    await page.evaluate(()=>showAddTx());
    await until(() => page.evaluate(() => {
      const m = document.getElementById('modal-add-tx');
      return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
    }), { what: '记账弹窗打开' });
    ok('开新记录时闸门是解开的',
       !(await page.locator('#tx-amount-check').isVisible()) &&
       !(await page.evaluate(()=>state.amountFromOcr)));
    await page.evaluate(()=>closeModal('modal-add-tx'));
  }

  console.log('\n【18】双击「保存」不能生出两条一样的记录');
  // 2026-08-08 用户实机遇到：用主记账 App 记账会出现两条一样的。saveTxInner() 全程
  // 同步，双击时第一下点击的事件处理函数会完整跑完（含把按钮重新变回可点）后，
  // 浏览器才轮到派发第二下点击——这就是「两条一样的」的成因，跟网络快慢无关。
  //
  // 测试手法：用 DOM 原生 el.click()（不是 page.click()，Playwright 的高阶 click 会
  // 帮你等按钮变回可点再点，那样永远测不出「按钮当下是 disabled」这件事）连打两下，
  // 这才是真实双击的样子：disabled 的按钮浏览器根本不会把 click 派给它，
  // 第二下 onclick 都不会被调用——这行为不看 JS 代码是测不出来的，只能真浏览器测。
  {
    posted = [];
    await page.evaluate(()=>showAddTx());
    await until(() => page.evaluate(() => {
      const m = document.getElementById('modal-add-tx');
      return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
    }), { what: '记账弹窗打开' });
    await page.fill('#tx-amount', '4.44');
    await page.selectOption('#tx-company-category', 'Store');
    await page.evaluate(()=>{
      const btn = document.getElementById('tx-save-btn');
      btn.click(); btn.click();   // 同一拍连打两下，模拟真实双击
    });
    await page.waitForTimeout(1500);
    const matches = await page.evaluate(()=>data.transactions.filter(t=>t.amount===4.44));
    ok('本机只留一笔，不是两笔', matches.length===1, matches.length);
    ok('公司账本也只收到一次（不会金额翻倍）',
       posted.filter(r=>!r.action && r.items?.[0]?.amount===4.44).length===1,
       posted.filter(r=>!r.action).map(r=>r.items?.[0]?.amount));

    // 按钮短暂锁住之后要能解开——不是永久锁死，改完东西还得点得动
    await page.waitForTimeout(500);
    ok('短暂延迟之后按钮解锁了',
       !(await page.evaluate(()=>document.getElementById('tx-save-btn').disabled)));

    // 开新记录时强制解锁（保底，理由见 showAddTx 里的注释）
    await page.evaluate(()=>{ document.getElementById('tx-save-btn').disabled = true; });
    await page.evaluate(()=>showAddTx());
    await page.waitForTimeout(400);
    ok('新开一笔时保存键保底解锁',
       !(await page.evaluate(()=>document.getElementById('tx-save-btn').disabled)));
    await page.evaluate(()=>closeModal('modal-add-tx'));
  }

  console.log('\n【19】公司账户没有「收入」——记了会被当成一笔支出静静塞进 Excel');
  // 2026-08-08 用户问「用老板 App 记收入会不会出现在 Excel 里」，查代码发现：
  // butler 的公司账本（Boss_Expenses.xlsx）从数据结构到 Excel 整个是纯支出报表，
  // 没有收入这个字段——选「收入」保存，会跟支出走同一条路送进账本，被当成一笔
  // 支出记进去，money 记错方向、月底按公式对总数会对不上，而且没有任何报错。
  {
    ok('公司账户下「收入/支出」切换整块藏起来', await page.evaluate(()=>{
      const a = data.accounts.find(x=>x.currency==='USD' && x.isCompany);
      data.currentAccountId = a.id; saveData();
      showAddTx();
      return document.getElementById('tx-type-tabs').style.display === 'none';
    }));
    ok('打开公司账户的新增记录，类型强制是「支出」', await page.evaluate(()=>state.txType==='expense'));

    // 绕过 UI 把类型硬掰成「收入」，模拟切换被绕过的情况——闸门必须还是挡得住
    posted = [];
    await page.fill('#tx-amount', '55.55');
    await page.selectOption('#tx-company-category', 'Store');
    await page.evaluate(()=>{ state.txType = 'income'; });
    await page.evaluate(()=>saveTx());
    await page.waitForTimeout(800);
    ok('绕过切换硬记「收入」→ 挡下来，一个字都没送出去',
       posted.filter(r=>!r.action).length===0, posted);
    ok('也没存进本机', !(await page.evaluate(()=>data.transactions.some(t=>t.amount===55.55))));
    await page.evaluate(()=>closeModal('modal-add-tx'));

    // 切回个人账户，收入/支出切换要恢复正常，不能被公司账户那次隐藏卡住
    await page.evaluate(()=>{
      const a = data.accounts.find(x=>!x.isCompany);
      data.currentAccountId = a.id; saveData();
      showAddTx();
    });
    await page.waitForTimeout(300);
    ok('个人账户下切换正常显示（没被公司账户那次隐藏卡住）',
       (await page.evaluate(()=>document.getElementById('tx-type-tabs').style.display)) !== 'none');
    await page.click('#type-inc');
    ok('个人账户下能正常选「收入」', await page.evaluate(()=>state.txType==='income'));
    await page.evaluate(()=>closeModal('modal-add-tx'));
  }

  console.log('\n【20】对账：三人余额+本月开销+待claim 加起来该等于固定盘子');
  // 2026-08-08 用户自己描述的月度对账法：三块加起来应该正好等于公司给的一万。
  // 前两块（备用金余额、本月开销）系统本来就有，待claim 是新加的第三块——
  // App 是那天才开始用的，之前欠着没结清的钱（还有老板自己垫的钱）系统看不到，
  // 只能他自己记一笔。这里守四样：算术对不对、missing 警告对不对、
  // 记一笔/撤销之后数字有没有正确联动、还没设起点的人不该被算进「三人余额」。
  {
    await page.evaluate(()=>{
      const a = data.accounts.find(x=>x.currency==='USD' && x.isCompany);
      data.currentAccountId = a.id; saveData();
    });
    // 先给 Seryi、Kuang 设起点（Yang 故意不设——要测「missing」那条警告）
    for(const [person, amt] of [['Seryi', 200], ['Kuang', 300]]){
      await page.evaluate(p=>pettyOpenAdd(p,'open'), person);
      await page.waitForTimeout(200);
      await page.fill('#petty-amount', String(amt));
      await page.evaluate(()=>pettySubmit());
      await page.waitForTimeout(600);
    }
    await page.evaluate(()=>closeModal('modal-petty'));

    await page.evaluate(()=>openReconcile());
    await page.waitForTimeout(1200);
    const r0 = await page.evaluate(()=>reconcileCompute());
    ok('三人余额只算 Seryi+Kuang（Yang 没起点不算）', r0.pettySum===500, r0);
    ok('missing 里点名 Yang', JSON.stringify(r0.missing)==='["Yang"]', r0.missing);
    ok('待claim 一开始是 0', r0.claim===0, r0.claim);
    ok('合计 = 三块加起来（算术不是编的）',
       r0.sum === Math.round((r0.pettySum+r0.monthTotal+r0.claim)*100)/100, r0);
    ok('差额 = 一万 - 合计', r0.diff === Math.round((10000-r0.sum)*100)/100, r0);
    const bodyTxt0 = (await page.textContent('#reconcile-body') || '');
    ok('明细里显示 missing 警告', bodyTxt0.includes('Yang') && bodyTxt0.includes('还没设起点'), bodyTxt0.slice(0,300));

    console.log('\n【20b】记一笔待claim（上个月的历史欠账），数字要正确联动');
    await page.evaluate(()=>reconcileOpenAdd());
    await until(() => page.evaluate(() => {
      const el = document.getElementById('modal-reconcile-add');
      return !!el && el.classList.contains('open');
    }), { what: '对账弹窗打开' });
    await page.fill('#reconcile-add-amount', '3123.45');
    await page.fill('#reconcile-add-note-input', '上个月开销，还没claim');
    await page.evaluate(()=>reconcileSubmit());
    await page.waitForTimeout(1200);
    const r1 = await page.evaluate(()=>reconcileCompute());
    ok('待claim 变成 3123.45', r1.claim===3123.45, r1.claim);
    ok('合计跟着涨了 3123.45', Math.round((r1.sum-r0.sum)*100)/100===3123.45, [r0.sum, r1.sum]);
    ok('差额跟着少了 3123.45（离一万更近了）',
       Math.round((r0.diff-r1.diff)*100)/100===3123.45, [r0.diff, r1.diff]);
    const bodyTxt1 = (await page.textContent('#reconcile-body') || '');
    ok('明细里的历史记录带备注', bodyTxt1.includes('上个月开销，还没claim'), bodyTxt1.slice(0,400));

    console.log('\n【20c】0 不许记——闸门要挡住，不能留一条没意义的历史');
    await page.evaluate(()=>reconcileOpenAdd());
    await until(() => page.evaluate(() => {
      const el = document.getElementById('modal-reconcile-add');
      return !!el && el.classList.contains('open');
    }), { what: '对账弹窗打开' });
    await page.fill('#reconcile-add-amount', '0');
    await page.evaluate(()=>reconcileSubmit());
    await page.waitForTimeout(500);
    ok('0 被挡下来，弹窗还开着（没当成保存成功关掉）',
       await page.locator('#modal-reconcile-add').isVisible());
    ok('总数没被 0 打扰', (await page.evaluate(()=>reconcileCompute())).claim===3123.45);
    await page.evaluate(()=>closeModal('modal-reconcile-add'));

    console.log('\n【20d】撤销：只撤最后一笔，数字退回去');
    await page.evaluate(()=>reconcileUndo());
    await page.waitForTimeout(1000);
    const r2 = await page.evaluate(()=>reconcileCompute());
    ok('撤销后待claim退回 0', r2.claim===0, r2.claim);
    ok('合计也退回去了', r2.sum===r0.sum, [r0.sum, r2.sum]);

    console.log('\n【20d2】claim 回来了不许在这边再记一笔——同一笔钱不能数两次');
    // 2026-08-09 做过一版「顺手记进自己账户」的勾选框，当天撤掉：butler 那边
    // pendingClaimAdjust 收到负数时，已经自动给 Yang 的备用金记一笔等额加款
    //（butler-bot/src/handlers/pending_claim.js），而首屏「公司」那张卡显示的就是
    // Yang 的余额——钱已经回到公司户口了。再在 App 这边记一笔收入就是重复计账，
    // 而且是那种月底对账才会发现、发现了也查不出哪来的错。
    // 这条守的是「别再长回来」：弹窗里不许出现任何往账户记账的入口。
    {
      await page.evaluate(()=>reconcileOpenAdd());
      await until(() => page.evaluate(() => {
        const el = document.getElementById('modal-reconcile-add');
        return !!el && el.classList.contains('open');
      }), { what: '对账弹窗打开' });
      await page.fill('#reconcile-add-amount', '-500');
      await page.waitForTimeout(200);
      ok('弹窗里没有「记进我的账户」那块（重复计账的入口不许回来）',
         await page.evaluate(()=>!document.getElementById('reconcile-transfer-row')));
      const before = await page.evaluate(()=>data.transactions.length);
      await page.evaluate(()=>reconcileSubmit());
      await page.waitForTimeout(1200);
      ok('待claim 扣掉了 500', (await page.evaluate(()=>reconcileCompute())).claim === -500);
      ok('本机账本一笔都没多（钱由服务端镜像进 Yang，不在这边记）',
         (await page.evaluate(()=>data.transactions.length)) === before,
         [before, await page.evaluate(()=>data.transactions.length)]);
      ok('也没有留下 claimBack 标记的旧记录',
         await page.evaluate(()=>!data.transactions.some(t=>t.claimBack)));
      await page.evaluate(()=>reconcileUndo());
      await page.waitForTimeout(900);
      ok('撤销后待claim退回 0', (await page.evaluate(()=>reconcileCompute())).claim === 0);
    }

    console.log('\n【20e】首屏「对账」卡：数字跟明细一致，missing 也要写出来');
    await page.evaluate(()=>closeModal('modal-reconcile'));
    // 前面几步一路操作弹窗，没保证还站在「概览」这个 tab 上——卡片藏在这个 tab 底下，
    // tab 本身不在当前显示时，卡片就算 innerHTML 是对的，isVisible() 也会是 false
    // （这不是 bug，是「你压根没在看那一屏」）。显式切回去，跟真实操作路径一致。
    await page.evaluate(()=>switchTab('overview'));
    await page.evaluate(()=>renderOverview());
    await page.waitForTimeout(300);
    const cardVisible = await page.locator('#ov-reconcile').isVisible();
    ok('公司账户下卡片出现', cardVisible, cardVisible);
    const cardTxt = (await page.textContent('#ov-reconcile') || '').replace(/\s+/g,' ');
    ok('卡片上的合计数字跟明细算的一致', cardTxt.includes(String(r2.sum.toFixed(2))), cardTxt);
    ok('卡片也点名 Yang 没设起点', cardTxt.includes('Yang') && cardTxt.includes('还没设起点'), cardTxt);

    console.log('\n【20f】切到私人账户：卡不出现');
    await page.evaluate(()=>{
      const a = data.accounts.find(x=>!x.isCompany);
      switchAccount(a.id);
    });
    await page.waitForTimeout(300);
    ok('私人账户下对账卡不出现', !(await page.locator('#ov-reconcile').isVisible()));
  }

  ok('全程无 JS 报错', errs.length===0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 场景二：SDK 正常加载时，云同步路径没被上面的兜底改坏 ----------
{
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    const calls = window.__fb = { init:0, authCbs:0 };
    const fakeAuth = { onAuthStateChanged(cb){ calls.authCbs++; setTimeout(()=>cb(null),0); },
      signInWithPopup(){return Promise.resolve();}, signOut(){return Promise.resolve();} };
    function auth(){ return fakeAuth; }
    auth.GoogleAuthProvider = function(){};
    window.firebase = { initializeApp(){calls.init++;}, auth,
      firestore: Object.assign(()=>({collection:()=>({doc:()=>({set:async()=>{},get:async()=>({exists:false})})})}),
        {FieldValue:{serverTimestamp:()=>null}}) };
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`) ? r.continue() : r.abort('failed'));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  console.log('\n【7】Firebase SDK 正常时，云同步照常初始化');
  const st = await page.evaluate(()=>({a:cloudAvailable, auth:!!auth, db:!!db, fb:window.__fb}));
  ok('cloudAvailable = true', st.a===true, st);
  ok('auth / db 都拿到', st.auth && st.db, st);
  ok('initializeApp 调用 1 次', st.fb.init===1, st.fb);
  ok('登录状态监听照常注册', st.fb.authCbs===1, st.fb);
  ok('无 JS 报错', errs.length===0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【22】从公司账本找回某人本月记的账 ----------
// 2026-08-13 用户：Yang 一直用同事版记账，改用主 App 后要「把同事 app yang 的记录
// 同步来主 App」。这一组守住三条：拉回来的一定带 recordId 且标成 sent（少了会被当成
// 还没报过，一编辑就再送一次账本、金额翻倍）、已经有的不重复加、这个动作只拉不推。
{
  console.log('\n【22】从公司账本找回某人本月记的账');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  const posted = [];
  const serverBook = []; let recSeq = 0;
  const todayStr = new Date().toISOString().slice(0,10);   // 上面那个在别的区块作用域里，这边自己来一份
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}`)) return route.continue();
    if (!u.startsWith(BUTLER)) return route.abort('failed');   // 外部网域一律挡掉
    const h = { 'Access-Control-Allow-Origin': '*' };
    if (route.request().method() === 'GET') {
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ categories:['Lunch','Store'], plateCategories:[],
          mealCategories:[{label:'Lunch', bossRaw:'老板午餐'}],
          people:[{code:'Boss',label:'Boss'},
                  {code:'Seryi',label:'Seryi',ownMeals:['Breakfast','Lunch','Dinner']},
                  {code:'Yang',label:'Yang',ownMeals:['Breakfast','Lunch','Dinner']}] }) });
    }
    const req = JSON.parse(route.request().postData() || '{}');
    posted.push(req);
    if (req.action === 'mine') {
      const who = req.reporter || 'Boss';
      const rows = serverBook.filter(r => r.reporter === who).map(r => ({
        id: r.id, date: todayStr, categoryEn: r.categoryEn,
        billNo: r.refTag, side: r.person === 'Boss' ? 'boss' : 'assist',
        amountUsd: r.amountUsd, note: null,
      }));
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'ok', reporter: who, records: rows }) });
    }
    if (req.action) return route.fulfill({ status:200, contentType:'application/json', headers:h,
      body: JSON.stringify({ status:'ok' }) });
    // 记一笔：照 butler 的规则算归属（自己吃的正餐算自己，其余算 Boss）
    const cat = String(req.items?.[0]?.categoryRaw || '');
    const person = (!/老板|boss/i.test(cat) && ['Breakfast','Lunch','Dinner'].includes(cat))
      ? req.reporter : 'Boss';
    const id = 'rec' + (++recSeq);
    serverBook.push({ id, person, reporter: req.reporter, categoryEn: cat,
                      refTag: String(recSeq), amountUsd: Number(req.items?.[0]?.amount) || 0 });
    return route.fulfill({ status:200, contentType:'application/json', headers:h,
      body: JSON.stringify({ status:'ok', records:[{ id, person, refTag:String(recSeq) }], total:0 }) });
  });
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  await page.evaluate(() => {
    localStorage.setItem('expenseTracker_companyToken', 'boss-token');
    const acc = data.accounts[0]; acc.isCompany = true; saveData();
  });
  await page.reload({ waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 重新启动完成' });

  // 先用 Seryi 的名义记两笔进假账本，再清掉本机记录，模拟「换了台手机/换了个 App」
  for (const [amt, cat] of [['4.49','Lunch'], ['20','Store']]) {
    await page.evaluate(()=>showAddTx());
    await until(() => page.evaluate(() => {
      const m = document.getElementById('modal-add-tx');
      return !!m && m.classList.contains('open') && !!document.getElementById('tx-amount');
    }), { what: '记账弹窗打开' });
    await page.fill('#tx-amount', amt);
    await page.selectOption('#tx-company-category', cat);
    await page.selectOption('#tx-company-reporter', 'Seryi');
    const n = posted.length;
    await page.evaluate(()=>saveTx());
    await until(() => posted.length > n, { what: '这一笔送到服务端' });
    await page.waitForTimeout(120);
  }
  await page.evaluate(()=>{ data.transactions = []; saveData(); });
  ok('前提：本机清单已经清空', await page.evaluate(()=>data.transactions.length)===0);

  // 「记一笔」的请求带 items，mine/edit/delete 都不带——用它数 add 最直接
  const addsBefore = posted.filter(x=>x.items).length;
  await page.evaluate(()=>{
    document.getElementById('import-reporter-select').value = 'Seryi';
    return importMyCompanyRecords();
  });
  await page.waitForTimeout(400);
  const txs = await page.evaluate(()=>data.transactions);
  ok('找回两笔', txs.length===2, txs.length);
  ok('金额对得上', JSON.stringify(txs.map(t=>t.amount).sort())===JSON.stringify([20,4.49].sort()), txs.map(t=>t.amount));
  ok('每一笔都带着账本那条的 id（删除/去重都靠它）',
     txs.every(t=>t.company && t.company.recordId), txs.map(t=>t.company?.recordId));
  ok('每一笔都标成 sent（不标的话一编辑就会再送一次、金额翻倍）',
     txs.every(t=>t.company && t.company.status==='sent'), txs.map(t=>t.company?.status));
  ok('报账人记成 Seryi', txs.every(t=>t.company?.reporter==='Seryi'), txs.map(t=>t.company?.reporter));
  ok('自己吃的午餐算他自己、Store 算 Boss',
     txs.some(t=>t.company?.person==='Seryi') && txs.some(t=>t.company?.person==='Boss'),
     txs.map(t=>t.company?.person));
  ok('只拉不推：没往账本写任何东西',
     posted.filter(x=>x.items).length===addsBefore,
     [posted.filter(x=>x.items).length, addsBefore]);

  // 再按一次不该变成四笔
  await page.evaluate(()=>importMyCompanyRecords());
  await page.waitForTimeout(400);
  ok('再按一次不会重复（还是两笔）', await page.evaluate(()=>data.transactions.length)===2,
     await page.evaluate(()=>data.transactions.length));
  ok('无 JS 报错', errs.length===0, errs);
  await ctx.close();
}

// ---------- 【21】同事投递箱：把同事记的账收进来 ----------
// 同事版的「老板账」页面把账写进 Firestore 的 inbox_boss，这台 App 收走、并进账户、
// 清空箱子。要守的是三件「静静出错」的事：收两次不能变两笔、删掉的不能复活、
// 别人能写的地方一定会收到垃圾数据（箱子不设防会被一条坏数据堵住）。
console.log('\n【21】同事投递箱：把同事记的账收进来');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d => d.accept());
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  // 假投递箱。docs = 箱子里现在有哪几条，deleted = 收完之后哪几条被清掉了
  await page.evaluate(() => {
    window.__box = { docs: [], deleted: [], mode: 'ok' };
    window.__put = (id, d) => window.__box.docs.push({
      id, data: () => d, ref: { delete: async () => { window.__box.deleted.push(id); } } });
    cloudAvailable = true;
    currentUser = { uid: 'boss' };
    db = { collection: (c) => ({
      limit: () => ({ get: async () => {
        if (window.__box.mode === 'denied') { const e = new Error('nope'); e.code = 'permission-denied'; throw e; }
        window.__box.readFrom = c;
        return { docs: window.__box.docs };
      } }),
      // 照片备份走 users/{uid}/attachments，这里给个空壳免得 uploadAttachmentToCloud 报错
      doc: () => ({ collection: () => ({ doc: () => ({ set: async () => {} }) }) }),
    }) };
  });

  const seed = (id, tx, from) => page.evaluate(([id, tx, from]) =>
    window.__put(id, { k:'x', from, tx: JSON.stringify(tx) }), [id, tx, from]);
  const fetchNow = () => page.evaluate(() => fetchInbox());
  const bossAcc = await page.evaluate(() => getInboxAccountId());
  ok('默认收进 Boss（USD）那个账户', bossAcc === 'acc_boss', bossAcc);

  await seed('d1', { srcId:'s1', date:'2026-08-09', amount:12.34, type:'expense',
                     categoryId:'cat_food', description:'老板的咖啡' }, 'Seryi');
  await fetchNow(); await page.waitForTimeout(300);
  let tx = await page.evaluate(() => data.transactions.find(t => t.id === 'ix_s1'));
  ok('收进来了，id 用同事那条的 srcId', !!tx, tx);
  ok('金额原样', tx?.amount === 12.34, tx?.amount);
  ok('进了指定账户', tx?.accountId === 'acc_boss', tx?.accountId);
  ok('记下是谁记的', tx?.fromStaff?.by === 'Seryi', tx?.fromStaff);
  ok('收完把箱子里那条清掉', (await page.evaluate(() => window.__box.deleted)).includes('d1'));
  ok('列表上标出「Seryi记的」',
     (await page.evaluate(() => staffTxNote(data.transactions.find(t=>t.id==='ix_s1')))).includes('Seryi'));

  // 同一笔再送一次（同事重送、或上次删文档失败）：只能覆盖，不能变两条
  await seed('d1b', { srcId:'s1', date:'2026-08-09', amount:12.34, type:'expense',
                      categoryId:'cat_food', description:'老板的咖啡（改过）' }, 'Seryi');
  await fetchNow(); await page.waitForTimeout(300);
  const n = await page.evaluate(() => data.transactions.filter(t => t.id === 'ix_s1').length);
  ok('收两次还是一笔，不是两笔', n === 1, n);
  ok('内容跟着更新（同事改过再送）',
     (await page.evaluate(() => data.transactions.find(t=>t.id==='ix_s1').description)).includes('改过'));

  // 删掉之后不许再被收回来——「删了又出现」是这个 App 栽过的坑，别从新路径长回来
  await page.evaluate(() => { deleteTxById('ix_s1'); });
  await page.waitForTimeout(300);
  await seed('d1c', { srcId:'s1', date:'2026-08-09', amount:12.34, type:'expense',
                      categoryId:'cat_food', description:'老板的咖啡' }, 'Seryi');
  await fetchNow(); await page.waitForTimeout(300);
  ok('删掉的不会被再收回来（墓碑挡住）',
     (await page.evaluate(() => data.transactions.some(t => t.id === 'ix_s1'))) === false);

  // 箱子是别人能写的地方，一定会收到垃圾——坏数据要丢掉，而且不能堵住后面的好数据
  const before = await page.evaluate(() => data.transactions.length);
  await seed('bad1', { srcId:'b1', date:'不是日期', amount:5, type:'expense', categoryId:'cat_food' }, 'X');
  await seed('bad2', { srcId:'b2', date:'2026-08-09', amount:'很多钱', type:'expense', categoryId:'cat_food' }, 'X');
  await seed('good', { srcId:'g1', date:'2026-08-09', amount:9.99, type:'expense', categoryId:'cat_food' }, 'Kuang');
  await fetchNow(); await page.waitForTimeout(300);
  const after = await page.evaluate(() => data.transactions.length);
  ok('两条坏数据都没入账', after - before === 1, { before, after });
  ok('坏数据后面的好数据照收', await page.evaluate(() => data.transactions.some(t => t.id === 'ix_g1')));
  ok('坏数据也从箱子里清掉，不会堵着',
     (await page.evaluate(() => window.__box.deleted)).filter(x => x.startsWith('bad')).length === 2);

  // 不认得的类别退回「其他」，不是丢掉——账不能因为类别对不上就消失
  await seed('d2', { srcId:'s2', date:'2026-08-09', amount:1, type:'expense',
                     categoryId:'cat_不存在', description:'' }, 'Seryi');
  await fetchNow(); await page.waitForTimeout(300);
  ok('认不得的类别退回「其他」而不是丢掉',
     (await page.evaluate(() => (data.transactions.find(t=>t.id==='ix_s2')||{}).categoryId)) === 'cat_other_exp');

  // 规则没贴好 vs 没网，要分开说——不然用户对着「连不上」在 WiFi 里瞎找
  await page.evaluate(() => { window.__box.mode = 'denied'; });
  await fetchNow(); await page.waitForTimeout(300);
  ok('权限被拒时说的是「规则没设好」',
     (await page.evaluate(() => inboxState.error)).includes('权限规则'),
     await page.evaluate(() => inboxState.error));

  // 没登录不收（也收不到——规则那边只认老板的 uid）
  await page.evaluate(() => { window.__box.mode = 'ok'; currentUser = null; window.__box.readFrom = null; });
  await seed('d3', { srcId:'s3', date:'2026-08-09', amount:2, type:'expense', categoryId:'cat_food' }, 'Seryi');
  await fetchNow(); await page.waitForTimeout(300);
  ok('没登录时根本不去读投递箱',
     (await page.evaluate(() => window.__box.readFrom)) === null);

  // ---- 同事把自己那笔删了，这边也要跟着删（2026-09-01 用户要求）----
  // 在这之前删除只删同事手机上那条，老板账本里那条一直留着：
  // 「刚刚让他们删了记录还在」就是这个。
  await page.evaluate(() => { currentUser = { uid:'boss' }; window.__box.docs = []; });
  await seed('e1', { srcId:'k1', date:'2026-08-10', amount:8.80, type:'expense',
                     categoryId:'cat_food', description:'替老板买的水' }, 'Kuang');
  await fetchNow(); await page.waitForTimeout(300);
  ok('先收进来一笔', await page.evaluate(() => !!data.transactions.find(t => t.id === 'ix_k1')));

  await page.evaluate(() => { window.__box.docs = []; });
  await seed('e1del', { op:'delete', srcId:'k1' }, 'Kuang');
  await fetchNow(); await page.waitForTimeout(300);
  ok('同事删了，这边也删掉了',
     (await page.evaluate(() => data.transactions.some(t => t.id === 'ix_k1'))) === false);
  ok('删除请求也从箱子里清掉',
     (await page.evaluate(() => window.__box.deleted)).includes('e1del'));
  ok('落了墓碑（别的设备同步时也会删）',
     await page.evaluate(() => (data.deletedTxIds || []).some(d => d.id === 'ix_k1')));

  // 同一批里「加」和「删」一起来：删的那条不管排在前排在后，结果都必须是删掉。
  // 没有先加后删这个顺序的话，删的先跑、加的后跑，那笔会当场复活——
  // 而这是最难发现的一种：箱子清空了、账却还在。
  await page.evaluate(() => { window.__box.docs = []; });
  await seed('e2del', { op:'delete', srcId:'k2' }, 'Kuang');            // 删的先放进箱子
  await seed('e2', { srcId:'k2', date:'2026-08-11', amount:3.30, type:'expense',
                     categoryId:'cat_food', description:'同一批里加又删' }, 'Kuang');
  await fetchNow(); await page.waitForTimeout(300);
  ok('同一批里加又删：最后是删掉，不会复活',
     (await page.evaluate(() => data.transactions.some(t => t.id === 'ix_k2'))) === false);

  // 删除请求没有 amount/date——不能被「坏数据」那道闸当垃圾丢掉
  ok('删除请求不会被当成坏数据丢掉（上面两条已证明它真的生效了）',
     (await page.evaluate(() => window.__box.deleted)).includes('e2del'));

  // ---- 该付同事多少：投递箱这些是他们垫的钱 ----
  await page.evaluate(() => {
    // 重来一份干净的：两个人、三笔垫付，外加一笔老板自己记的（不该算进去）
    data.transactions = [
      { id:'ix_p1', accountId:'acc_boss', amount:10, type:'expense', categoryId:'cat_food',
        date:'2026-08-01', fromStaff:{ by:'Seryi', at:1 } },
      { id:'ix_p2', accountId:'acc_boss', amount:5.5, type:'expense', categoryId:'cat_food',
        date:'2026-08-02', fromStaff:{ by:'Seryi', at:1 } },
      { id:'ix_p3', accountId:'acc_boss', amount:7, type:'expense', categoryId:'cat_food',
        date:'2026-08-03', fromStaff:{ by:'Kuang', at:1 } },
      // 老板给的现金＝钱进同事口袋，不是垫付，不能算进「该付他多少」
      { id:'ix_p4', accountId:'acc_boss', amount:50, type:'income', categoryId:'cat_other_inc',
        date:'2026-08-04', fromStaff:{ by:'Seryi', at:1 } },
      // 老板自己记的那笔跟投递箱无关
      { id:'own1', accountId:'acc_boss', amount:99, type:'expense', categoryId:'cat_food',
        date:'2026-08-05' },
    ];
    renderInboxOwed();
  });
  let owed = await page.evaluate(() => inboxOwedByPerson());
  ok('按人分开算', owed.length === 2, owed);
  ok('Seryi 垫了 15.50（两笔）',
     owed[0].who === 'Seryi' && owed[0].total === 15.5 && owed[0].count === 2, owed[0]);
  ok('Kuang 垫了 7.00', owed[1].who === 'Kuang' && owed[1].total === 7, owed[1]);
  ok('老板自己记的那笔不算进去',
     owed.reduce((n, r) => n + r.total, 0) === 22.5, owed);
  const owedHtml = await page.innerHTML('#inbox-owed');
  ok('画出来了，写着人名和金额',
     owedHtml.includes('Seryi') && owedHtml.includes('15.50'), owedHtml.slice(0, 300));

  // 「已付」只盖时间戳：金额一分不动、也不会新增一笔支出（那会把同一笔钱数两次）
  // 直接把 confirm 打桩成「按了确定」。不用 Playwright 的 dialog 事件——
  // 这一页别处已经挂过 dialog 处理，两个都去 accept 会互相打架。
  await page.evaluate(() => { window.confirm = () => true; });
  const beforeN = await page.evaluate(() => data.transactions.length);
  const beforeSum = await page.evaluate(() =>
    data.transactions.filter(t=>t.type==='expense').reduce((n,t)=>n+t.amount,0));
  await page.evaluate(() => inboxMarkPaid(0));
  await page.waitForTimeout(200);
  owed = await page.evaluate(() => inboxOwedByPerson());
  ok('标了已付之后 Seryi 不再出现', !owed.some(r => r.who === 'Seryi'), owed);
  ok('Kuang 的 7.00 不受影响', owed.length === 1 && owed[0].total === 7, owed);
  ok('没有新增任何记录', await page.evaluate(() => data.transactions.length) === beforeN);
  ok('支出总额一分没变（不是又记一笔）',
     await page.evaluate(() =>
       data.transactions.filter(t=>t.type==='expense').reduce((n,t)=>n+t.amount,0)) === beforeSum);
  ok('那两笔身上盖了 paidAt',
     await page.evaluate(() =>
       ['ix_p1','ix_p2'].every(id => !!data.transactions.find(t=>t.id===id).fromStaff.paidAt)));

  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【23】换机准备：把只存在这台手机的几样列得出来 ----------
{
  console.log('\n【23】换机准备：公司密钥 / AI key / 交易密码要列得出来');
  // 为什么要验：这三样的正本在 Cloudflare 的 secret 里，谁都读不回来；输入框又是
  // password 型的、不回填。这块要是列不出来，用户换机之后就真的只能全部重新申请。
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });
  await page.evaluate(() => {
    localStorage.setItem('expenseTracker_companyToken', 'company-key-abc');
    localStorage.setItem('expenseTracker_aiKey_mistral', 'mistral-key-xyz');
    localStorage.setItem('tradingAnalyzerPw', 'ibkr-pw-789');
  });
  await page.evaluate(()=>switchTab('settings'));
  ok('没点开之前不显示', !(await page.locator('#migrate-keys').isVisible()));

  await page.click('#migrate-toggle');
  await page.waitForTimeout(200);
  const shown = (await page.textContent('#migrate-keys')) || '';
  ok('列出公司报账密钥', shown.includes('company-key-abc'), shown.slice(0,200));
  ok('列出 AI key', shown.includes('mistral-key-xyz'), shown.slice(0,200));
  ok('列出交易分析器密码', shown.includes('ibkr-pw-789'), shown.slice(0,200));
  // 光给一串字没用——他要知道新手机填到哪里去
  ok('每一样都写了新手机填在哪', (shown.match(/新手机/g) || []).length >= 3, shown.slice(0,300));

  // 收起来要真的清掉，别留在 DOM 里让人截图时误拍进去
  await page.click('#migrate-toggle');
  await page.waitForTimeout(200);
  ok('收起来之后不显示', !(await page.locator('#migrate-keys').isVisible()));
  ok('收起来之后 DOM 里也不留',
     !((await page.evaluate(() => document.getElementById('migrate-keys').innerHTML)) || '').includes('company-key-abc'));

  // 没设过的那几样要说「不用抄」，不能显示成空白让人以为坏了
  await page.evaluate(() => { localStorage.removeItem('tradingAnalyzerPw'); });
  await page.click('#migrate-toggle');
  await page.waitForTimeout(200);
  const shown2 = (await page.textContent('#migrate-keys')) || '';
  ok('没设过的写明「不用抄」', shown2.includes('不用抄'), shown2.slice(0,300));
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【24】清单空的时候要说清楚「为什么空」 ----------
{
  console.log('\n【24】空清单：分清「真的没记」和「这台设备没接上云端」');
  // 为什么要验：2026-08-23 用户在备用机上看到一片空白，第一反应是「记录丢了」。
  // 帐其实好好在云端，差的只是那台设备没登录。空清单只写「这个月还没有记录」，
  // 等于把一个一键可解的问题伪装成数据丢失。
  const ctx = await browser.newContext();
    // 只放行本地那台 http server：CI 的 runner 有外网，Firebase SDK 会真的从 gstatic
  // 载进来、把 cloudAvailable / db / currentUser 抢回去，本地沙盒却连不出去——同一份
  // 测试在两边跑出不同结果（2026-08-24 就是这样 CI 红、本地绿）。这两组要自己摆布
  // 云同步的状态，所以把外网整个掐掉，两边环境一致。
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  const emptyText = async () => (await page.textContent('#tx-list')) || '';

  // ① 连得上云端、没登录 → 要说「没登录」，还要给得出登录按钮
  await page.evaluate(() => { cloudAvailable = true; currentUser = null; switchTab('transactions'); renderTxList(); });
  let t = await emptyText();
  ok('没登录时说明帐在云端', t.includes('还没登录'), t.slice(0,160));
  ok('没登录时给得出登录按钮',
     await page.locator('#tx-list button:has-text("登录")').count() > 0);

  // ② 登录了但云端也空 → 要把当前帐号显示出来（登错帐号是最常见的原因）
  await page.evaluate(() => { currentUser = { email:'someone@example.com' }; renderTxList(); });
  t = await emptyText();
  ok('登录后显示当前帐号', t.includes('someone@example.com'), t.slice(0,160));
  ok('登录后不再叫人去登录', !t.includes('还没登录'), t.slice(0,160));

  // ③ 连不上 Google → 别叫人重记一遍（重记会变成两笔）
  await page.evaluate(() => { cloudAvailable = false; currentUser = null; renderTxList(); });
  t = await emptyText();
  ok('连不上时叫人别急着重记', t.includes('别重记'), t.slice(0,160));
  ok('连不上时不叫人去登录（登不了）', !t.includes('还没登录'), t.slice(0,160));

  // ④ 有记录时不要出现这些话
  await page.evaluate(() => {
    cloudAvailable = true; currentUser = null;
    const acc = data.accounts[0];
    data.transactions.push({ id:'t_hint', accountId:acc.id, type:'expense', amount:1,
      date:new Date().toISOString().slice(0,10), categoryId:(data.categories[0]||{}).id, desc:'' });
    saveData(); renderTxList();
  });
  t = await emptyText();
  ok('有记录时不显示这些提示', !t.includes('还没登录') && !t.includes('别重记'), t.slice(0,160));
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【25】拉云端失败时，绝不许把本机这份推上去覆盖 ----------
{
  console.log('\n【25】没成功读到云端，就一次都不许往上推（推上去=整份覆盖）');
  // 这一组守的是**丢账**那条路，不是显示问题：saveToCloud 是 .set 整份 payload，
  // 不是合并。开 App → 拉云端失败 → data 还是空的 → 随手记一笔 → 空的那份盖掉云端 →
  // 从此每台设备拉下来都是空的，并集合并也救不回来（空 ∪ 空 还是空）。
  // 2026-08-24 用户回报「主机 Chrome 里过往记录一笔都没有」之后补的。
  const ctx = await browser.newContext();
    // 只放行本地那台 http server：CI 的 runner 有外网，Firebase SDK 会真的从 gstatic
  // 载进来、把 cloudAvailable / db / currentUser 抢回去，本地沙盒却连不出去——同一份
  // 测试在两边跑出不同结果（2026-08-24 就是这样 CI 红、本地绿）。这两组要自己摆布
  // 云同步的状态，所以把外网整个掐掉，两边环境一致。
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  // 装一个假的 Firestore：记下每一次 set 上去的内容
  await page.evaluate(() => {
    window.__pushes = [];
    window.__pullMode = 'fail';          // 先演「拉不到」
    // saveToCloud 里会用 firebase.firestore.FieldValue.serverTimestamp()；
    // 沙盒里没载入 Firebase SDK，不打桩的话它抛错、被 saveToCloud 自己的 catch 吞掉，
    // 于是「没推上去」这件事会因为错的理由成立——假绿灯。
    window.firebase = { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } };
    currentUser = { uid:'u1', email:'y@example.com' };
    cloudAvailable = true;
    cloudPulledOk = false;
    db = { collection: () => ({ doc: () => ({
      get: async () => {
        if(window.__pullMode === 'fail') throw new Error('unavailable');
        return { exists:true, data: () => ({ payload: JSON.stringify(window.__cloud) }) };
      },
      set: async (o) => { window.__pushes.push(JSON.parse(o.payload)); },
      collection: () => ({ doc: () => ({ set: async()=>{}, get: async()=>({exists:false}) }) }),
    }) }) };
  });

  // ① 拉失败之后记一笔：本机要存下来，但一个字都不许上传
  await page.evaluate(async () => { await syncFromCloud(); });
  await page.waitForTimeout(200);
  ok('拉失败后闸门是关着的', await page.evaluate(()=>cloudPulledOk === false));
  await page.evaluate(() => {
    const acc = data.accounts[0];
    data.transactions.push({ id:'t_local', accountId:acc.id, type:'expense', amount:9,
      date:new Date().toISOString().slice(0,10), categoryId:(data.categories[0]||{}).id, desc:'' });
    saveData();
  });
  await page.waitForTimeout(300);
  ok('拉失败后没有往云端推任何东西', await page.evaluate(()=>window.__pushes.length) === 0,
     await page.evaluate(()=>window.__pushes.length));
  ok('但本机确实存下来了（不是把这笔丢掉）',
     await page.evaluate(()=>JSON.parse(localStorage.getItem('expenseTracker_v2')).transactions.some(t=>t.id==='t_local')));

  // ② 云端恢复得上之后：拉下来要合并，且推上去的那份必须两边都在
  await page.evaluate(async () => {
    window.__cloud = { accounts:data.accounts, categories:data.categories, recurring:[],
      transactions:[{ id:'t_cloud', accountId:data.accounts[0].id, type:'expense', amount:5,
        date:new Date().toISOString().slice(0,10), categoryId:(data.categories[0]||{}).id, desc:'' }],
      deletedTxIds:[], currentAccountId:data.accounts[0].id };
    window.__pullMode = 'ok';
    await syncFromCloud();
  });
  await page.waitForTimeout(300);
  ok('拉成功后闸门打开', await page.evaluate(()=>cloudPulledOk === true));
  const pushed = await page.evaluate(()=>window.__pushes[window.__pushes.length-1]);
  const ids = (pushed?.transactions || []).map(t=>t.id);
  ok('推上去的那份带着云端原有那笔', ids.includes('t_cloud'), ids);
  ok('推上去的那份也带着刚才攒下的那笔', ids.includes('t_local'), ids);

  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【26】一台空设备的预设账户，不许把「公司账户」这个身份洗掉 ----------
{
  console.log('\n【26】空设备的预设账户不许盖掉云端的账户设定');
  // 账户和类别在 mergeById 里是「本机无条件盖过云端」。一台本机还空着的设备，data 是
  // 内建 DEFAULT_DATA，那份 acc_boss 身上没有 isCompany——它盖过云端之后「公司账户」
  // 这个身份就没了，而且会被推回云端：从此每台设备的公司账那块都不见了，私人记录却
  // 完好无损。2026-08-24 用户回报的正是这个症状。
  const ctx = await browser.newContext();
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  const merged = await page.evaluate(() => {
    // 本机＝刚开机的空设备（内建预设，acc_boss 没有 isCompany）
    const fresh = JSON.parse(JSON.stringify(DEFAULT_DATA));
    // 云端＝他真正在用的那份：acc_boss 被设成公司账户、还改了名
    const cloud = JSON.parse(JSON.stringify(DEFAULT_DATA));
    cloud.accounts = cloud.accounts.map(a => a.id === 'acc_boss'
      ? { ...a, isCompany: true, name: '公司账' } : a);
    cloud.transactions = []; cloud.deletedTxIds = []; cloud.recurring = [];
    fresh.transactions = []; fresh.deletedTxIds = []; fresh.recurring = [];
    const out = mergeData(fresh, cloud);
    return out.accounts.find(a => a.id === 'acc_boss');
  });
  ok('公司账户的身份没被空设备洗掉', merged && merged.isCompany === true, merged);
  ok('账户名也保住了', merged && merged.name === '公司账', merged && merged.name);

  // 反过来：他自己按了「取消公司」，那是真的改动，必须赢过云端
  const afterOptOut = await page.evaluate(() => {
    const local = JSON.parse(JSON.stringify(DEFAULT_DATA));
    local.accounts = local.accounts.map(a => a.id === 'acc_boss'
      ? { ...a, name: '公司账' } : a);          // 动过名字＝不是原封不动的预设
    const cloud = JSON.parse(JSON.stringify(DEFAULT_DATA));
    cloud.accounts = cloud.accounts.map(a => a.id === 'acc_boss'
      ? { ...a, isCompany: true, name: '公司账' } : a);
    for(const d of [local, cloud]){ d.transactions=[]; d.deletedTxIds=[]; d.recurring=[]; }
    return mergeData(local, cloud).accounts.find(a => a.id === 'acc_boss');
  });
  ok('他自己取消公司时，本机那份仍然赢', afterOptOut && !afterOptOut.isCompany, afterOptOut);

  // 记录本身照旧取并集，不受这条影响
  const txIds = await page.evaluate(() => {
    const local = JSON.parse(JSON.stringify(DEFAULT_DATA));
    local.transactions = [{id:'t_a', accountId:'acc_boss', amount:1}];
    local.deletedTxIds = []; local.recurring = [];
    const cloud = JSON.parse(JSON.stringify(DEFAULT_DATA));
    cloud.transactions = [{id:'t_b', accountId:'acc_boss', amount:2}];
    cloud.deletedTxIds = []; cloud.recurring = [];
    return mergeData(local, cloud).transactions.map(t=>t.id).sort();
  });
  ok('记录仍然取并集（两边的都在）', JSON.stringify(txIds) === '["t_a","t_b"]', txIds);

  // 删掉的账户不许从云端并回来——用户 2026-08-24 回报「我没建，是无端端跑出来的
  // 两个公司账」，病根就是这个：账户删除没有墓碑，下次同步原样并回来，还被推给每台设备。
  const afterDelete = await page.evaluate(() => {
    const local = JSON.parse(JSON.stringify(DEFAULT_DATA));
    local.accounts = local.accounts.filter(a => a.id !== 'acc_boss');   // 这台删掉了
    local.deletedAccountIds = [{ id:'acc_boss', at: Date.now() }];
    local.transactions=[]; local.deletedTxIds=[]; local.recurring=[]; local.deletedCategoryIds=[];
    const cloud = JSON.parse(JSON.stringify(DEFAULT_DATA));   // 云端还留着
    cloud.transactions=[]; cloud.deletedTxIds=[]; cloud.recurring=[];
    cloud.deletedAccountIds=[]; cloud.deletedCategoryIds=[];
    const out = mergeData(local, cloud);
    return { ids: out.accounts.map(a=>a.id), tombs: (out.deletedAccountIds||[]).map(t=>t.id) };
  });
  ok('删掉的账户没有被云端并回来', !afterDelete.ids.includes('acc_boss'), afterDelete.ids);
  ok('没删的那个还在（不是把账户全清了）', afterDelete.ids.includes('acc_yang'), afterDelete.ids);
  ok('墓碑本身也跟着同步（其他设备才知道要删）',
     afterDelete.tombs.includes('acc_boss'), afterDelete.tombs);
  // 类别同理
  const catAfter = await page.evaluate(() => {
    const local = JSON.parse(JSON.stringify(DEFAULT_DATA));
    local.categories = local.categories.filter(c => c.id !== 'cat_food');
    local.deletedCategoryIds = [{ id:'cat_food', at: Date.now() }];
    local.transactions=[]; local.deletedTxIds=[]; local.recurring=[]; local.deletedAccountIds=[];
    const cloud = JSON.parse(JSON.stringify(DEFAULT_DATA));
    cloud.transactions=[]; cloud.deletedTxIds=[]; cloud.recurring=[];
    cloud.deletedAccountIds=[]; cloud.deletedCategoryIds=[];
    return mergeData(local, cloud).categories.map(c=>c.id);
  });
  ok('删掉的类别也没有被并回来', !catAfter.includes('cat_food'), catAfter.slice(0,4));
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【27】发给老板（billUpload 直送 /boss）----------
// 2026-08-27 新功能：账户明细 PDF 生成后旁边多一个「📤 发给老板」，直接 POST 到
// butler 的 /boss（action:billUpload），省掉「导出→存手机→开老板App→找文件→上传」。
// buildStatementPDF() 依赖 html2canvas / jsPDF 两个 CDN 库——这份自检的基线是把
// localhost 以外全部断掉（模拟白名单 WiFi），真去连 cdnjs 在这个环境里本来就连不上，
// 所以用 addInitScript 打两个最小桩替身：只实现 buildStatementPDF() 真正调用到的
// 几个方法（没有收据附件时用不到 addPage 之外的绘图细节），行为本身（发不发请求、
// 发的是什么、失败提示说什么）才是这份自检要守的，不是 PDF 渲染像不像。
const BOSS_API = 'https://butler-bot.jarixhew.workers.dev/boss';
function stubPdfLibs(ctx){
  return ctx.addInitScript(() => {
    window.__pdfSaves = 0;
    window.html2canvas = async () => ({
      width: 100, height: 100,
      toDataURL: () => 'data:image/jpeg;base64,ZmFrZQ=='
    });
    function FakeJsPDF(){}
    FakeJsPDF.prototype.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    // 记下每一张嵌进 PDF 的图（【30】要靠它量体积和像素尺寸；对 27 那几块无影响）
    window.__pdfImages = [];
    FakeJsPDF.prototype.addImage = function(d, fmt, x, y, w, h){
      window.__pdfImages.push({ d: String(d || ''), fmt, x, y, w, h });
    };
    FakeJsPDF.prototype.addPage = function(){};
    FakeJsPDF.prototype.setDrawColor = function(){};
    FakeJsPDF.prototype.setLineWidth = function(){};
    FakeJsPDF.prototype.rect = function(){};
    // 真实的 datauristring 会带 data:application/pdf;base64, 前缀——
    // sendStatementToBoss() 自己会 slice 掉，这里保留前缀正是为了验证那一步真的做了。
    FakeJsPDF.prototype.output = function(type){
      return type === 'datauristring' ? 'data:application/pdf;base64,ZmFrZXBkZg==' : '';
    };
    FakeJsPDF.prototype.save = function(){ window.__pdfSaves++; };  // 不触发真实下载
    window.jspdf = { jsPDF: FakeJsPDF };
  });
}
/** 挂路由：localhost 放行，/boss 按 bossMode 给假回应，其余（含另一个公司账 API）一律挡掉。 */
function mountBossRoutes(ctx, calls, bossModeRef){
  return ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}`)) return route.continue();
    if (u.startsWith(BOSS_API)) {
      calls.push(JSON.parse(route.request().postData() || '{}'));
      const h = { 'Access-Control-Allow-Origin': '*' };
      if (bossModeRef.v === '401')
        return route.fulfill({ status:401, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'error', message:'access denied' }) });
      if (bossModeRef.v === '400big')
        return route.fulfill({ status:400, contentType:'application/json', headers:h,
          body: JSON.stringify({ status:'error', message:'账单文件太大，服务器拒收了这份' }) });
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'ok' }) });
    }
    return route.abort('failed');
  });
}
async function setupCompanyAccount(page, token){
  await page.evaluate((tk) => {
    if (tk) localStorage.setItem('expenseTracker_companyToken', tk);
    const acc = data.accounts[0]; acc.isCompany = true; saveData();
  }, token);
  await page.reload({ waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 重新启动完成' });
}
async function gotoAnalyticsWithBossBtn(page){
  await page.click('#nav-analytics');
  await page.waitForSelector('button[onclick="sendStatementToBoss()"]', { state:'visible' });
}
/** 包一层 toast()，记下最后一次弹的文字——toast 只显示 2.2 秒，
 * #send-boss-status 常驻栏位有时只留精简版，「可以手动发」这句完整版只在 toast 里。 */
async function installToastSpy(page){
  await page.evaluate(() => {
    window.__lastToast = null;
    const orig = window.toast;
    window.toast = (m) => { window.__lastToast = m; return orig(m); };
  });
}
async function lastToast(page){ return page.evaluate(() => window.__lastToast); }

// ---- 27a：点「发给老板」会发出 action:billUpload，字段形状对得上 ----
{
  console.log('\n【27a】点「发给老板」：billUpload 请求的字段形状');
  const ctx = await browser.newContext();
  await stubPdfLibs(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const calls = []; const bossMode = { v:'ok' };
  await mountBossRoutes(ctx, calls, bossMode);
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what:'App 启动完成' });
  await setupCompanyAccount(page, 'boss-token');
  await gotoAnalyticsWithBossBtn(page);

  await page.click('button[onclick="sendStatementToBoss()"]');
  await until(() => calls.length > 0, { what:'billUpload 请求送出' });

  ok('只发了一个请求', calls.length === 1, calls.length);
  const req = calls[0];
  ok('action 是 billUpload', req.action === 'billUpload', req.action);
  ok('period 形如 YYYY-MM（两位月份）', /^\d{4}-\d{2}$/.test(req.period || ''), req.period);
  ok('kind 是 month', req.kind === 'month', req.kind);
  ok('contentBase64 非空', typeof req.contentBase64 === 'string' && req.contentBase64.length > 0, req.contentBase64);
  ok('contentBase64 不含 data:application/pdf;base64, 前缀（已经 slice 掉了）',
     !(req.contentBase64 || '').includes('data:application/pdf;base64,'), req.contentBase64);
  // 2026-08-28 修：calls.length>0 只说明请求被 route 拦截、进了 calls 数组——
  // 这发生在 route.fulfill() 把假回应送回页面**之前**。真正的状态栏文字要等
  // sendStatementToBoss() 里 `await fetch(...)` 拿到回应、走到 setStatus() 才写上。
  // 原本这里拦截后立刻同步读 #send-boss-status，机器不忙时两件事间隔够小看不出来，
  // 机器忙（并发跑很多个 chromium）时 JS 事件循环被抢占，读的时候文字还没写上，
  // 这条断言就稳定复现失败——单独跑永远绿，并发跑偶发红，正是这个原因。改成轮询
  // 实际状态，而不是假设"请求进了 calls 数组=页面已经处理完响应"。
  await untilWriteback(page,
    () => (document.getElementById('send-boss-status')?.textContent || '').includes('已发给老板'),
    '状态栏写上「已发给老板」');
  const statusText = await page.textContent('#send-boss-status');
  ok('状态栏显示已发给老板', (statusText || '').includes('已发给老板'), statusText);
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---- 27b：只点「导出账户明细」——不许有任何请求打到 /boss（导出是自己看的草稿）----
{
  console.log('\n【27b】不点「发给老板」就不发：只导出不该有任何 /boss 请求');
  const ctx = await browser.newContext();
  await stubPdfLibs(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const calls = []; const bossMode = { v:'ok' };
  await mountBossRoutes(ctx, calls, bossMode);
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what:'App 启动完成' });
  await setupCompanyAccount(page, 'boss-token');
  await gotoAnalyticsWithBossBtn(page);

  await page.click('button[onclick="exportStatementPDF()"]');
  await until(() => page.evaluate(() => window.__pdfSaves > 0), { what:'PDF 导出完成（save 被调用）' });
  // 断言「没有发生」只能真的等一下，等不到条件就用固定等待（跟本文件其它地方同一个理由）
  await page.waitForTimeout(500);

  ok('导出账户明细本身会走到 pdf.save()', await page.evaluate(() => window.__pdfSaves) > 0);
  ok('没有任何请求打到 /boss', calls.length === 0, calls);
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---- 27c：服务端回 401 —— 提示说钥匙问题，且告诉用户 PDF 已下载可以手动发 ----
{
  console.log('\n【27c】服务端 401：提示是钥匙问题，且说明 PDF 已下载、能手动发');
  const ctx = await browser.newContext();
  await stubPdfLibs(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const calls = []; const bossMode = { v:'401' };
  await mountBossRoutes(ctx, calls, bossMode);
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what:'App 启动完成' });
  await setupCompanyAccount(page, 'wrong-token');
  await gotoAnalyticsWithBossBtn(page);
  await installToastSpy(page);

  await page.click('button[onclick="sendStatementToBoss()"]');
  await until(() => calls.length > 0, { what:'billUpload 请求送出' });
  await until(() => page.evaluate(() =>
    (document.getElementById('send-boss-status').textContent || '').startsWith('❌')),
    { what:'状态栏出现失败提示' });

  const statusText = await page.textContent('#send-boss-status');
  const toastText = await lastToast(page);
  ok('提示说的是钥匙问题', (statusText || '').includes('钥匙'), statusText);
  ok('状态栏说明 PDF 已下载到本机', (statusText || '').includes('已下载'), statusText);
  ok('toast 完整版告诉用户可以手动发（2.2 秒那条比常驻栏位多这句话）',
     (toastText || '').includes('已下载') && (toastText || '').includes('手动发'), toastText);
  ok('确实已经 pdf.save() 过（不是白说）', await page.evaluate(() => window.__pdfSaves) > 0);
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---- 27d：服务端回 400「PDF 太大」—— 提示翻成了人话（不是原始 JSON）----
{
  console.log('\n【27d】服务端 400（PDF 太大）：提示翻成人话，不是甩一坨原始 JSON');
  const ctx = await browser.newContext();
  await stubPdfLibs(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const calls = []; const bossMode = { v:'400big' };
  await mountBossRoutes(ctx, calls, bossMode);
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what:'App 启动完成' });
  await setupCompanyAccount(page, 'boss-token');
  await gotoAnalyticsWithBossBtn(page);

  await page.click('button[onclick="sendStatementToBoss()"]');
  await until(() => calls.length > 0, { what:'billUpload 请求送出' });
  await until(() => page.evaluate(() =>
    (document.getElementById('send-boss-status').textContent || '').startsWith('❌')),
    { what:'状态栏出现失败提示' });

  const statusText = await page.textContent('#send-boss-status');
  ok('提示里带着服务端给的人话原因', (statusText || '').includes('账单文件太大'), statusText);
  ok('不是甩一坨原始 JSON（不含花括号）', !(statusText || '').includes('{'), statusText);
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---- 27e：没配公司钥匙——提示去设置里填，且压根不发请求 ----
{
  console.log('\n【27e】没配公司钥匙：提示去设置里填，且不发请求');
  const ctx = await browser.newContext();
  await stubPdfLibs(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const calls = []; const bossMode = { v:'ok' };
  await mountBossRoutes(ctx, calls, bossMode);
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what:'App 启动完成' });
  // 故意不设公司钥匙——注意账户也不必标 isCompany，未配钥匙本来就该在最前面拦下
  await gotoAnalyticsWithBossBtn(page);

  await page.click('button[onclick="sendStatementToBoss()"]');
  await page.waitForTimeout(500);   // 断言「没发生」，只能真的等（同上）

  const statusText = await page.textContent('#send-boss-status');
  ok('提示说去设置里填', (statusText || '').includes('设置') && (statusText || '').includes('钥匙'), statusText);
  ok('没发任何请求到 /boss', calls.length === 0, calls);
  ok('压根没走到生成 PDF 那一步', await page.evaluate(() => window.__pdfSaves) === 0);
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---- 27f：自订期间导出的（跨月行程）发给老板时，算 trip 不算某个月的账单 ----
{
  console.log('\n【27f】自订期间发给老板：kind 是 trip，period 用起讫日期');
  // butler 的 doBillUpload 只收 kind 'month' 或 'trip'，并按 kind+period 去重。
  // 一段 10/28~11/03 的行程要是照旧报成 kind:'month'、period:'2026-10'，
  // 老板那边会看到一份标着「2026年10月账单」的东西，还会把真正的 10 月账单顶掉。
  const ctx = await browser.newContext();
  await stubPdfLibs(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const calls = []; const bossMode = { v:'ok' };
  await mountBossRoutes(ctx, calls, bossMode);
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what:'App 启动完成' });
  await setupCompanyAccount(page, 'boss-token');
  await gotoAnalyticsWithBossBtn(page);

  await page.check('#stmt-range-on');
  await page.fill('#stmt-range-from', '2026-10-28');
  await page.fill('#stmt-range-to', '2026-11-03');
  await page.fill('#stmt-range-name', '2026 日本行');
  await page.click('button[onclick="sendStatementToBoss()"]');
  await until(() => calls.length > 0, { what:'billUpload 请求送出' });

  const req = calls[0];
  ok('kind 是 trip，不是 month', req.kind === 'trip', req.kind);
  ok('period 用起讫日期（同一段重传会替换掉旧的那份）',
     req.period === '2026-10-28_2026-11-03', req.period);
  ok('抬头带行程名字', (req.title && req.title.zh || '').includes('2026 日本行'), req.title);
  ok('抬头不会写成某年某月的账单', !/^\d{4}年\d{2}月/.test((req.title && req.title.zh) || ''), req.title);
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【27g】发给老板时带上金额摘要 ----------
{
  console.log('\n【27g】发给老板：带上金额摘要（老板那一屏直接看得到花了多少）');
  // 2026-09-05 加。老板的账单列表在这之前一个数字都没有，他得点进 PDF 自己找总额。
  // 这里验的是**那个数字是真的账**——不是随便凑一个：故意在期间前后各埋一笔不该算的，
  // 摘要里的总额必须刚好等于期间内那几笔。**币别也必须带**（Boss 是 USD、Yang 是 HKD，
  // 光一个数字会让人照着错的币别下判断）。
  const ctx = await browser.newContext();
  await stubPdfLibs(ctx);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const calls = []; const bossMode = { v:'ok' };
  await mountBossRoutes(ctx, calls, bossMode);
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what:'App 启动完成' });
  await setupCompanyAccount(page, 'boss-token');

  const seeded = await page.evaluate(() => {
    const acc = data.accounts[0];
    acc.currency = 'USD';
    data.currentAccountId = acc.id;
    const mk = (date, amount, type) => ({ id:'t_'+date+'_'+amount, accountId:acc.id,
      type: type || 'expense', amount, date, categoryId:null, description:'d'+date });
    data.transactions = [
      mk('2026-09-30', 999),          // 上个月，不该算进 10 月这一张
      mk('2026-10-02', 100.25),
      mk('2026-10-11', 20),
      mk('2026-10-20', 5.75),
      mk('2026-11-02', 888),          // 下个月，不该算
      mk('2026-10-05', 500, 'income'),// 收入不算进「花了多少」
    ];
    state.anYear = 2026; state.anMonth = 9;   // 停在 10 月
    if (typeof Chart === 'undefined') {
      window.Chart = function(){ return { destroy(){}, update(){}, data:{}, options:{} }; };
    }
    return { currency: acc.currency };
  });
  await gotoAnalyticsWithBossBtn(page);
  await page.click('button[onclick="sendStatementToBoss()"]');
  await until(() => calls.length > 0, { what:'billUpload 请求送出' });

  const req = calls[0];
  ok('★请求里带了摘要', !!req.summary, req.summary);
  // 100.25 + 20 + 5.75 = 126，前后两笔和那笔收入都不该算进来
  ok('★★金额是期间内支出的真实总额（126，不是把前后那两笔也算进去）',
     req.summary && Math.abs(req.summary.expense - 126) < 0.001, req.summary);
  ok('★收入没有被算成「花了多少」', req.summary && req.summary.expense !== 626, req.summary);
  ok('★笔数对得上（3 笔支出）', req.summary && req.summary.count === 3, req.summary);
  ok('★★币别跟着账户走', req.summary && req.summary.currency === seeded.currency, req.summary);
  ok('顺带把收入和期末结余也带上（以后要用）',
     req.summary && typeof req.summary.income === 'number' && typeof req.summary.closing === 'number', req.summary);
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【28】账户明细可以导一整段行程，不必按月切成两张 ----------
{
  console.log('\n【28】导出账户明细：自订期间（跨月的旅游行程出成一张）');
  // 2026-09-01 用户要求：行程跨月（例如 10/28 出发、11/03 回来）按月导会变成两张单，
  // 期初/期末余额还得自己接。勾「自订期间」填起讫日期，整段出一张。
  // 这里验的是**挑哪些账进这张单**和**抬头/档名怎么写**——PDF 长相不在这份自检范围内。
  const ctx = await browser.newContext();
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  // 造一段跨月行程：10/28 出发、11/03 回来，前后各埋一笔不该被算进去的
  await page.evaluate(() => {
    const acc = data.accounts[0];
    data.currentAccountId = acc.id;
    const mk = (date, amount) => ({ id:'t_'+date+'_'+amount, accountId:acc.id, type:'expense',
      amount, date, categoryId:null, description:'d'+date });
    data.transactions = [
      mk('2026-10-20', 100),   // 行程前，不算（但要进期初余额）
      mk('2026-10-28', 10),    // 出发当天，含头
      mk('2026-10-31', 20),
      mk('2026-11-01', 30),    // 跨到下个月
      mk('2026-11-03', 40),    // 回来当天，含尾
      mk('2026-11-05', 200),   // 行程后，不算
    ];
    state.anYear = 2026; state.anMonth = 9;   // 统计页停在 10 月
  });
  // 导出那一块住在统计分页里，不切过去它是隐藏的，点不到。
  // 统计页会画饼图，而 Chart.js 是 CDN 来的、在这份自检里被断网挡掉了——
  // 打个桩让它别炸；这一块要验的是日期范围，不是图表。
  await page.evaluate(() => {
    if (typeof Chart === 'undefined') {
      window.Chart = function(){ return { destroy(){}, update(){}, data:{}, options:{} }; };
    }
    switchTab('analytics');
  });
  await page.waitForSelector('#stmt-range-on', { state:'visible' });

  // 不勾＝照旧按统计页选的那个月
  const byMonth = await page.evaluate(() => {
    const r = stmtRange();
    return { r, ids: rangeTxs(data.currentAccountId, r.from, r.to).map(t=>t.date) };
  });
  ok('不勾时仍是整月（起讫日对）',
     byMonth.r.from === '2026-10-01' && byMonth.r.to === '2026-10-31', byMonth.r);
  ok('不勾时抬头照旧写月份', byMonth.r.label === '2026年10月', byMonth.r.label);
  ok('不勾时只收当月那几笔',
     JSON.stringify(byMonth.ids) === JSON.stringify(['2026-10-20','2026-10-28','2026-10-31']),
     byMonth.ids);

  // 勾开：起讫日期要预填成当前那个月，省得从空白点起
  await page.check('#stmt-range-on');
  const prefill = await page.evaluate(() => ({
    shown: document.getElementById('stmt-range-box').style.display !== 'none',
    from: document.getElementById('stmt-range-from').value,
    to: document.getElementById('stmt-range-to').value,
  }));
  ok('勾开之后日期栏出现', prefill.shown, prefill);
  ok('起讫日期预填成当前月份', prefill.from === '2026-10-01' && prefill.to === '2026-10-31', prefill);

  // 填成行程的日期
  await page.fill('#stmt-range-from', '2026-10-28');
  await page.fill('#stmt-range-to', '2026-11-03');
  await page.fill('#stmt-range-name', '2026 日本行');
  const trip = await page.evaluate(() => {
    const r = stmtRange();
    return { r, dates: rangeTxs(data.currentAccountId, r.from, r.to).map(t=>t.date) };
  });
  // 这是这一整块的重点：跨月的四笔一次到齐，前后两笔不进来
  ok('跨月四笔一次到齐、含头含尾、前后两笔不算',
     JSON.stringify(trip.dates) === JSON.stringify(['2026-10-28','2026-10-31','2026-11-01','2026-11-03']),
     trip.dates);
  ok('抬头带行程名字和起讫日', trip.r.label === '2026 日本行 · 2026-10-28 ~ 2026-11-03', trip.r.label);
  ok('档名用行程名字', trip.r.fileTag === '2026 日本行', trip.r.fileTag);
  ok('自订期间时文案改用「本期」', trip.r.isMonth === false && trip.r.periodWord === '本期', trip.r);

  // 期初余额＝起始日之前的累计（行程前那笔 100 要算进来，之后的 200 不算）
  const opening = await page.evaluate(() => {
    const r = stmtRange();
    let o = 0;
    data.transactions.forEach(t => {
      if (t.accountId !== data.currentAccountId) return;
      if (t.date < r.from) o += (t.type === 'income' ? t.amount : -t.amount);
    });
    return o;
  });
  ok('期初余额只算起始日之前的（-100）', opening === -100, opening);

  // 名字留空就用日期当抬头和档名
  await page.fill('#stmt-range-name', '');
  const noName = await page.evaluate(() => stmtRange());
  ok('没填名字就用起讫日当抬头', noName.label === '2026-10-28 ~ 2026-11-03', noName.label);
  ok('没填名字时档名也用日期', noName.fileTag === '2026-10-28_2026-11-03', noName.fileTag);

  // 档名里不能留下 Windows 存不下的字元
  await page.fill('#stmt-range-name', 'A/B:C*?"<>|D');
  const dirty = await page.evaluate(() => stmtRange().fileTag);
  ok('档名把非法字元清掉', dirty === 'ABCD', dirty);

  // 填错要挡住，而且要说得出哪里错
  await page.fill('#stmt-range-name', '');
  await page.fill('#stmt-range-to', '');
  ok('少填一头就挡住', (await page.evaluate(() => stmtRange().error || '')).length > 0);
  await page.fill('#stmt-range-from', '2026-11-03');
  await page.fill('#stmt-range-to', '2026-10-28');
  const reversed = await page.evaluate(() => stmtRange().error || '');
  ok('起讫填反了要挡住', reversed.includes('晚'), reversed);

  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【29】「claim 回来了」一键填好，但金额仍然改得动 ----------
{
  console.log('\n【29】对账：一键 claim 回来（填好，不代按保存）');
  // 2026-09-01 用户要求：「claim 回来的再做个一键 claim 回来，输入数额也保留以防数目有错误」。
  // 这一块守的正是那句「也保留」——公司实际给回来的数常常跟系统里的不一样（少给一笔、
  // 汇率差、扣了什么）。要是做成「按一下直接存」，对不上就得先撤销再重记，比手打还麻烦。
  // 所以这颗按钮只负责把数字填好，保存仍走原本那条路（同一个确认框、同一个接口）。
  const ctx = await browser.newContext();
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  // 摆好三块数据：三人余额、本月开销、待claim——对账那块要三样齐了才算得出来
  const setup = (claim) => page.evaluate((c) => {
    pettyState.data = [{ person:'Seryi', status:'ok', balance: 100 }];
    ledState.data = { total: 200 };
    pendingClaimState.total = c;
    pendingClaimState.history = [];
    pendingClaimState.last = null;
    showModal('modal-reconcile');    // 按钮住在对账弹窗里，不开它点不到
    renderReconcile();
  }, claim);

  await setup(1763.59);
  const html = await page.innerHTML('#reconcile-body');
  ok('待claim > 0 时按钮出现，并写着金额',
     html.includes('claim 回来了') && html.includes('1763.59'), html.slice(0, 400));

  await page.click('button[onclick="reconcileOpenClaimBack()"]');
  const filled = await page.evaluate(() => ({
    amount: document.getElementById('reconcile-add-amount').value,
    note: document.getElementById('reconcile-add-note-input').value,
    title: document.getElementById('reconcile-add-title').textContent,
    hint: document.getElementById('reconcile-add-note').textContent,
    disabled: document.getElementById('reconcile-add-amount').disabled,
    readOnly: document.getElementById('reconcile-add-amount').readOnly,
    hidden: document.getElementById('reconcile-add-amount').offsetParent === null,
  }));
  // 这是这一整块的重点：填的是**负数**（负数才是「claim 回来了」），而且是整笔
  ok('金额自动填成负的整笔（-1763.59）', filled.amount === '-1763.59', filled.amount);
  ok('备注也带上了', filled.note === 'claim 回来', filled.note);
  ok('弹窗标题改成「claim 回来了」', filled.title === 'claim 回来了', filled.title);
  // 用户明确要的那半：数目可能有错，所以输入框必须还在、还能改
  ok('金额栏没有被禁用', filled.disabled === false, filled);
  ok('金额栏不是只读', filled.readOnly === false, filled);
  ok('金额栏看得见（不是藏起来只留个按钮）', filled.hidden === false, filled);
  ok('提示告诉他数字可以改', filled.hint.includes('改'), filled.hint);
  // 提示这一栏平时是错误红，填好了不该也印成红的
  const hintColor = await page.evaluate(() =>
    getComputedStyle(document.getElementById('reconcile-add-note')).color);
  const errColor = await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.color = 'var(--exp)'; document.body.appendChild(d);
    const c = getComputedStyle(d).color; d.remove(); return c;
  });
  ok('填好了的提示不是错误红', hintColor !== errColor, { hintColor, errColor });

  // 改成公司实际给的数，仍然走得通原本那条保存路（这里只验它读得到改后的值）
  await page.fill('#reconcile-add-amount', '-1700');
  ok('改得动金额', await page.inputValue('#reconcile-add-amount') === '-1700');

  // 没有待claim时不该出现这颗按钮——按了只会记出一笔莫名其妙的负数
  await page.evaluate(() => closeModal('modal-reconcile-add'));
  await setup(0);
  const html0 = await page.innerHTML('#reconcile-body');
  ok('待claim是 0 时按钮不出现', !html0.includes('claim 回来了'), html0.slice(0, 300));
  // 就算硬调它也要挡住（按钮藏了不等于函数调不到）
  await setup(0);
  const guarded = await page.evaluate(() => {
    reconcileOpenClaimBack();
    return document.getElementById('modal-reconcile-add').classList.contains('open');
  });
  ok('硬调也不会开出一个填了 0 的弹窗', guarded === false, guarded);

  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【30】账户明细 PDF 不把印不出来的像素也塞进去 ----------
{
  console.log('\n【30】账户明细 PDF：收据按印出来的尺寸压过再嵌');
  // 2026-09-02 用户要求「要的都压」。附件多的月份这份 PDF 会到十几 MB，
  // 发给老板那一步要么被服务端 20MB 挡下，要么在手机上传半天。
  // 胖的地方是「塞进去的像素远多于印得出来的像素」，所以这一块守三件事：
  //   1. 收据缩到 A4 上实际占位对应的 120dpi（3000px 宽的手机照片印出来跟 900px 一样）
  //   2. 但不许缩过头——低于目标精度就是把单据压到看不清，账单就废了
  //   3. 本来就小的收据原样通过（只缩不放，放大只会糊）
  // 外加一条底线：压缩这一步出任何差错，账单都还是要生得出来（用原图）。
  //
  // 这份自检验过会红（2026-09-02 实测四种改法）：
  //   · shrinkPhotoForPDF 末行改成 return dataUrl（等于没压）→「宽度已经缩到」「体积明显小于原图」失败
  //   · PDF_PHOTO_DPI 改成 40（压过头）→「但没缩过头」失败
  //   · PDF_BAND_PX 改回 2400 →「横条不再画成 2400px」失败
  // 注：「小图不会被放大」有两道保险（scale 的 `,1` 上限，和「重编码更大就用原图」那一步），
  // 只拆掉其中一道不会红——这是对的，两道都在守同一个结果。
  const ctx = await browser.newContext();
  await stubPdfLibs(ctx);
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  /** 摆一笔带收据的支出，收据是 w×h 的噪点图（噪点压不掉，体积假不了）。
   *  回传原图 base64 长度，好跟嵌进 PDF 的那张比。 */
  const runWithPhoto = (w, h) => page.evaluate(async ({ w, h }) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    const im = cx.createImageData(w, h);
    for (let i = 0; i < im.data.length; i += 4) {
      im.data[i] = Math.random()*255; im.data[i+1] = Math.random()*255;
      im.data[i+2] = Math.random()*255; im.data[i+3] = 255;
    }
    cx.putImageData(im, 0, 0);
    const src = c.toDataURL('image/jpeg', 0.92);

    const acc = data.accounts[0];
    const today = new Date();
    const d = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-15`;
    data.transactions = [{ id:'pdfimg1', accountId:acc.id, type:'expense', amount:12.5,
      date:d, description:'收据压缩测试', categoryId:(data.categories[0]||{}).id,
      attachmentId:'att-pdfimg1' }];
    state.anYear = today.getFullYear(); state.anMonth = today.getMonth();
    state.currentAccountId = acc.id;
    // 附件本来住 IndexedDB，这里直接给回一个 blob，省掉写库那一圈
    window.getAttachmentBlob = async () => await (await fetch(src)).blob();

    window.__pdfImages = [];
    await buildStatementPDF();

    // 量出每张嵌进 PDF 的图的真实像素尺寸
    const sized = [];
    for (const rec of window.__pdfImages) {
      const px = await new Promise(res => {
        const i2 = new Image();
        i2.onload = () => res({ w:i2.naturalWidth, h:i2.naturalHeight });
        i2.onerror = () => res(null);
        i2.src = rec.d;
      });
      sized.push({ len:rec.d.length, mmW:rec.w, mmH:rec.h, px });
    }
    return { srcLen: src.length, srcW: w, images: sized };
  }, { w, h });

  // ---- 大图：手机拍的那种 ----
  const big = await runWithPhoto(2400, 1800);
  // 收据是唯一一张不铺满整页宽（210mm）的图，其余是横幅/标题条/页脚
  const photo = big.images.find(im => im.mmW && Math.abs(im.mmW - 210) > 1);
  // 铺满页宽的图有两种：正表那张长图（html2canvas 是打的桩，解不出像素）和三条中文横条
  const bands = big.images.filter(im => im.mmW && Math.abs(im.mmW - 210) <= 1 && im.px);
  ok('收据确实嵌进 PDF 了', !!(photo && photo.px), big.images.map(i=>i.mmW));
  if (photo && photo.px) {
    const target = photo.mmW / 25.4 * 120;   // 120dpi 下这个占位该有多少像素
    ok('收据宽度已经缩到印得出来的尺寸（≤120dpi）',
       photo.px.w <= Math.ceil(target) + 1, { got: photo.px.w, target });
    ok('但没缩过头——单据还得看得清（≥目标的 80%）',
       photo.px.w >= target * 0.8, { got: photo.px.w, target });
    ok('体积明显小于原图（少于四成）',
       photo.len < big.srcLen * 0.4, { after: photo.len, before: big.srcLen });
    ok('长宽比没被拉歪',
       Math.abs((photo.px.w / photo.px.h) - (2400 / 1800)) < 0.02,
       photo.px);
  }
  ok('三条中文横条都在（横幅/标题条/页脚）', bands.length === 3, bands.length);
  ok('横条不再画成 2400px（210mm 上那是 290dpi，印不出来）',
     bands.every(b => b.px && b.px.w === 1200), bands.map(b => b.px && b.px.w));

  // ---- 小图：本来就小的收据不许被放大糊掉 ----
  const small = await runWithPhoto(120, 90);
  const smallPhoto = small.images.find(im => im.mmW && Math.abs(im.mmW - 210) > 1);
  ok('小图不会被放大（只缩不放）',
     !!(smallPhoto && smallPhoto.px && smallPhoto.px.w <= 120),
     smallPhoto && smallPhoto.px);

  // ---- 底线：压不动也不能让账单生不出来 ----
  const fallback = await page.evaluate(async () => {
    const bogus = 'data:image/jpeg;base64,bm90LWFuLWltYWdl';
    const out = await shrinkPhotoForPDF(bogus, { w:100, h:100 }, 100, 100);
    return out === bogus;
  });
  ok('图片读不出来时退回原图，不让整份账单挂掉', fallback === true, fallback);

  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

// ---------- 【31】给同事现金：首屏卡片＋弹窗（跟备用金同一套体验）----------
// 跟投递箱方向相反、原理相同——这里只守「送出去的东西对不对」和「不该发请求的
// 时候真的不发」，不测 Firestore 规则本身（那份规则只在 Firebase Console 生效，
// 仓库里的 firestore.rules 只是底稿）。
// 2026-09-09 用户追问后改版：UI 从设置页表单搬到 Overview 卡片 + 弹窗，且新增
// 必填的 person（收件人）——老板账口令是共用的，没有 person 会广播给所有持有
// 同一口令的同事，见 firestore.rules 和 build-staff-page.py 里的说明。
{
  console.log('\n【31】给同事现金：首屏卡片 + 弹窗 + 送出去的内容（含 person 收件人）');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d => d.accept());   // sendBossCashGift 会 confirm 一次
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  // ---- 首屏卡片：没设口令时提示去设置，点了能跳过去 ----
  ok('首屏卡片出现（不像备用金要挂公司账户，这张永远在）',
     await page.locator('#ov-boss-cash-gift').isVisible());
  ok('没设口令时提示先去设置口令',
     (await page.innerText('#ov-boss-cash-gift')).includes('去设置口令'));
  await page.click('#ov-boss-cash-gift');
  await page.waitForTimeout(200);
  ok('弹窗打开，提示还没设口令', (await page.innerText('#boss-cash-gift-body')).includes('还没设口令'));
  ok('弹窗里没有金额栏（口令都没有，不该让人填金额）',
     (await page.locator('#boss-cash-gift-amount').count()) === 0);
  await page.click('#boss-cash-gift-body button');   // 「去设置页 →」
  await page.waitForTimeout(200);
  ok('点了直接跳去设置页', await page.evaluate(()=>state.currentTab === 'settings'));
  ok('设置页上看得到口令输入框', await page.locator('#boss-cash-key-input').isVisible());
  ok('设置页不再有金额/币种/备注这几栏（已经搬进弹窗了）',
     (await page.locator('#boss-cash-gift-amount').count()) === 0);

  // ---- 填了口令：卡片和弹窗都要能正常用 ----
  await page.fill('#boss-cash-key-input', 'pass-1234');
  await page.waitForTimeout(200);
  ok('口令即时存住（不用另外按保存）',
     (await page.evaluate(()=>localStorage.getItem('expenseTracker_bossCashKey'))) === 'pass-1234');
  ok('首屏卡片跟着变成可用状态',
     !(await page.innerText('#ov-boss-cash-gift')).includes('去设置口令'));

  await page.evaluate(() => {
    window.__gifts = [];
    cloudAvailable = true; currentUser = null;
    db = { collection: (c) => ({ add: async (p) => { window.__gifts.push({c,p}); return {id:'g1'}; } }) };
    switchTab('overview');   // 上面跳去了设置页，卡片在 overview tab，切回来才点得到
  });
  await page.click('#ov-boss-cash-gift');
  await page.waitForTimeout(200);
  ok('弹窗里出现「给谁」下拉', await page.locator('#boss-cash-gift-person').isVisible());
  // 2026-09-09 那次事故之后追加：「给谁」不再是自由输入框（会打错大小写），改成固定下拉，
  // 选项跟公司报账人共用同一份服务端名册（getCompanyPeople()）——保证同事名字拼法
  // 永远跟 staffIdentity.reporter 对得上，这类打字错误从设计上就不可能发生。
  ok('「给谁」是下拉不是输入框（防止手滑打错名字）',
     (await page.evaluate(()=>document.getElementById('boss-cash-gift-person').tagName)) === 'SELECT');
  ok('下拉选项来自公司报账人名册，且不含 Boss',
     (await page.evaluate(()=>Array.from(document.querySelectorAll('#boss-cash-gift-person option')).map(o=>o.value)))
       .every(v => v !== 'Boss'));
  ok('金额栏在', await page.locator('#boss-cash-gift-amount').isVisible());
  // 2026-09-09 追加：币种不再单独选，改成选账户，币种跟着账户走——从设计上杜绝
  // 「账户是 USD、却选了 HKD 送出去」这种货币对不上的输入错误（那次 KUANG 收错币种
  // 的事故根源就是币种是独立选的，跟哪个账户没关系）。
  ok('不再有独立的币种下拉', (await page.locator('#boss-cash-gift-cur').count()) === 0);
  ok('账户下拉在，选项数等于账户数',
     (await page.locator('#boss-cash-gift-acc option').count()) ===
       (await page.evaluate(()=>data.accounts.length)));
  ok('默认预选第一个非公司账户',
     (await page.evaluate(()=>document.getElementById('boss-cash-gift-acc').value)) ===
       (await page.evaluate(()=>(data.accounts.find(a=>!a.isCompany)||data.accounts[0]).id)));
  // 199 不是 200：Firestore 规则要求 note.size() < 200（严格小于），maxlength 卡在 199
  // 才不会让用户填满 200 字送出去被规则秒拒、却看不懂为什么（2026-09-09 验收查出的边界差一）。
  ok('备注栏在，且限长 199（对齐规则的 note.size()<200）',
     await page.getAttribute('#boss-cash-gift-note', 'maxlength') === '199');

  // ---- 没登录：按钮点了要说清楚，不能发请求 ----
  await page.selectOption('#boss-cash-gift-person', 'Seryi');
  await page.fill('#boss-cash-gift-amount', '50');
  await page.evaluate(()=>sendBossCashGift());
  await page.waitForTimeout(200);
  ok('未登录时不发请求', (await page.evaluate(()=>window.__gifts.length)) === 0);
  ok('未登录时提示要先登录',
     (await page.textContent('#boss-cash-gift-status')||'').includes('登录'));

  // ---- 「给谁」不可能没填：下拉本来就没有空白选项，UI 上做不出这个场景。
  // 用 JS 硬把 value 清空来模拟「万一」，验证服务端防线（sendBossCashGift 里的
  // if(!person) 判断）还留着，不是因为改成下拉就把这道闸拆了。----
  await page.evaluate(() => { currentUser = { uid:'boss' }; });
  await page.evaluate(() => { document.getElementById('boss-cash-gift-person').value = ''; });
  await page.evaluate(()=>sendBossCashGift());
  await page.waitForTimeout(200);
  ok('（防御性闸门仍在）person 为空时不发请求', (await page.evaluate(()=>window.__gifts.length)) === 0);
  ok('（防御性闸门仍在）person 为空时提示先填是给谁的',
     (await page.textContent('#boss-cash-gift-status')||'').includes('哪个同事'));

  // ---- 金额为 0 / 空：不发请求 ----
  await page.selectOption('#boss-cash-gift-person', 'Seryi');
  await page.fill('#boss-cash-gift-amount', '0');
  await page.evaluate(()=>sendBossCashGift());
  await page.waitForTimeout(200);
  ok('金额 0 不发请求', (await page.evaluate(()=>window.__gifts.length)) === 0);

  await page.fill('#boss-cash-gift-amount', '');
  await page.evaluate(()=>sendBossCashGift());
  await page.waitForTimeout(200);
  ok('金额空白不发请求', (await page.evaluate(()=>window.__gifts.length)) === 0);

  // ---- 金额 ≥ 100 万：不发请求（Firestore 规则要求 amount < 1000000，本地要提前挡，
  //      不能让用户填了、送到 Firestore 才被规则拒绝却看不懂为什么，2026-09-09 验收查出）----
  await page.fill('#boss-cash-gift-amount', '1000000');
  await page.evaluate(()=>sendBossCashGift());
  await page.waitForTimeout(200);
  ok('金额 100 万不发请求（对齐规则的 amount<1000000）',
     (await page.evaluate(()=>window.__gifts.length)) === 0);
  ok('金额过大时提示单笔上限',
     (await page.textContent('#boss-cash-gift-status')||'').includes('上限'));

  // ---- 正常送出：内容必须原样，不做汇率换算，且带上 person；账户的币种就是送出的币种 ----
  const balBefore = await page.evaluate(()=>{
    const txs = data.transactions.filter(t=>t.accountId==='acc_boss');
    return txs.reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0);
  });
  await page.selectOption('#boss-cash-gift-person', 'Seryi');
  await page.fill('#boss-cash-gift-amount', '600');
  await page.selectOption('#boss-cash-gift-acc', 'acc_boss');   // acc_boss 币种是 USD
  await page.fill('#boss-cash-gift-note', '给 Seryi 买菜');
  await page.evaluate(()=>sendBossCashGift());
  await page.waitForTimeout(300);
  const sent = await page.evaluate(()=>window.__gifts[0]);
  ok('送进了 boss_cash_gifts 集合', sent && sent.c === 'boss_cash_gifts', sent);
  ok('口令原样', sent?.p.k === 'pass-1234', sent?.p);
  ok('带上收件人 person', sent?.p.person === 'Seryi', sent?.p);
  ok('金额原样，不做任何换算', sent?.p.amount === 600, sent?.p.amount);
  ok('币种取自选中账户（USD），不再单独选', sent?.p.currency === 'USD', sent?.p.currency);
  ok('备注一起送', sent?.p.note === '给 Seryi 买菜', sent?.p.note);
  ok('带上 at 时间戳', typeof sent?.p.at === 'number', sent?.p.at);
  ok('状态行显示已送出',
     (await page.textContent('#boss-cash-gift-status')||'').includes('已送出'));
  ok('送出后金额栏清空',
     (await page.evaluate(()=>document.getElementById('boss-cash-gift-amount').value)) === '');
  ok('选中的账户记住了，下次弹窗打开预填同一个',
     (await page.evaluate(()=>localStorage.getItem('expenseTracker_bossCashGiftAccount'))) === 'acc_boss');

  // ---- 2026-09-09 记账逻辑修正：给现金不是支出，是转到「在 X 手上」代管账户——
  //      本地记一对转账（两条腿，giftId 相同），不是一笔支出。 ----
  const legs = await page.evaluate(()=>data.transactions.filter(t=>t.giftId==='g1'));
  ok('送出成功后本地记了两笔（一对转账，不是一笔支出）', legs.length === 2, legs);
  const srcLeg = legs.find(t=>t.accountId==='acc_boss');
  const holdAccId = await page.evaluate(()=>holdingAccountId('Seryi'));
  const holdLeg = legs.find(t=>t.accountId===holdAccId);
  ok('源账户那条腿是支出，扣在选中的账户上', srcLeg?.type === 'expense', srcLeg);
  ok('源账户那条腿分类是「给同事现金」', srcLeg?.categoryId === 'cat_cash_gift', srcLeg);
  ok('源账户那条腿金额和送出的一致', srcLeg?.amount === 600, srcLeg);
  ok('源账户那条腿描述带上收件人和备注', /Seryi/.test(srcLeg?.description||'') && /买菜/.test(srcLeg?.description||''), srcLeg?.description);
  ok('源账户那条腿打了 xfer:true（转账，不算进收入/支出汇总）', srcLeg?.xfer === true, srcLeg);
  ok('代管账户那条腿是收入，金额一致', holdLeg?.type === 'income' && holdLeg?.amount === 600, holdLeg);
  ok('代管账户那条腿分类是「代管现金转入」', holdLeg?.categoryId === 'cat_cash_gift_in', holdLeg);
  ok('代管账户那条腿也打了 xfer:true', holdLeg?.xfer === true, holdLeg);
  ok('「在 Seryi 手上」代管账户自动建好了，isHolding 标记在',
     (await page.evaluate((id)=>{ const a=getAcc(id); return a && a.isHolding===true && a.currency==='USD' && a.name.includes('Seryi'); }, holdAccId)));

  const balAfter = await page.evaluate(()=>{
    const txs = data.transactions.filter(t=>t.accountId==='acc_boss');
    return txs.reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0);
  });
  ok('源账户余额确实少了这笔（账户余额照算转账，不是只记了 Firestore、本机没变化）',
     balAfter === balBefore - 600, { balBefore, balAfter });
  const holdBal = await page.evaluate((id)=>data.transactions.filter(t=>t.accountId===id)
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), holdAccId);
  ok('代管账户余额涨了同样这笔（他手上现在有 600）', holdBal === 600, holdBal);
  ok('账户卡片上显示的源账户余额也跟着更新了（renderOverview 被调用）',
     (await page.innerText('#acc-cards-row')).includes('−US$600.00')
     || (await page.innerText('#acc-cards-row')).includes('-US$600.00'));

  // ---- 铁律：转账不许污染收入/支出汇总，但明细要照常看得到 ----
  const monthExpNoXfer = await page.evaluate(()=>{
    const now = new Date();
    return monthTxs('acc_boss', now.getFullYear(), now.getMonth())
      .filter(t=>t.type==='expense' && !t.xfer).reduce((s,t)=>s+t.amount,0);
  });
  ok('「本月支出」排除 xfer 之后不含这笔 600（这正是要修的重复计账问题）', monthExpNoXfer === 0, monthExpNoXfer);
  await page.evaluate(()=>{ data.currentAccountId = 'acc_boss'; switchTab('overview'); });
  ok('概览「本月支出」盒子不显示这 600（转账不算花掉）',
     !(await page.innerText('#ov-expense')).includes('600'));
  await page.evaluate(()=>switchTab('transactions'));
  ok('明细列表里这笔转账照常看得到（转账不藏起来，只是不进汇总）',
     (await page.innerText('#tx-list')).includes('给 Seryi 的现金'));
  await page.evaluate(()=>switchTab('overview'));

  await page.evaluate(()=>closeModal('modal-boss-cash-gift'));   // 关掉弹窗，回首屏看卡片
  await page.waitForTimeout(200);
  ok('首屏卡片显示最近送过的那一笔',
     (await page.innerText('#ov-boss-cash-gift')).includes('Seryi'));

  // ---- 权限被拒 / 网络问题：分开说明，且失败时不该有本地支出（送都没送出去）----
  await page.click('#ov-boss-cash-gift');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    db = { collection: () => ({ add: async () => { const e = new Error('nope'); e.code='permission-denied'; throw e; } }) };
  });
  const txCountBefore = await page.evaluate(()=>data.transactions.length);
  await page.selectOption('#boss-cash-gift-person', 'Kuang');
  await page.fill('#boss-cash-gift-amount', '10');
  await page.evaluate(()=>sendBossCashGift());
  await page.waitForTimeout(200);
  ok('权限被拒时提示口令或规则问题',
     (await page.textContent('#boss-cash-gift-status')||'').includes('口令不对'));
  ok('Firestore 送不出去时，本地也没有多出一笔支出',
     (await page.evaluate(()=>data.transactions.length)) === txCountBefore);

  ok('无 JS 报错', errs.length===0, errs);
  await ctx.close();
}

// ---------- 【32】给同事现金：弹窗里的「最近转过」清单 + 撤回 ----------
// 用户手滑打错币种转错钱的真实案例（2026-09-09，boss_cash_gifts/ZgvvM81TZv8X1xrtNs35）
// 之后加的：弹窗里列最近 10 笔，每笔能撤回。这里只守「清单渲染对不对」「确认框真的挡了
// 一下」「确认后真的调 Firestore delete()」「取消不发请求」「删除失败讲清楚原因」——
// 不测 Firestore 规则本身（那份规则只在 Firebase Console 生效）。
{
  console.log('\n【32】给同事现金：最近转过清单 + 撤回（确认框、真的删、取消不发请求、失败讲清楚）');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  let dialogAction = 'accept', dialogMsg = '';
  page.on('dialog', d => { dialogMsg = d.message(); dialogAction === 'dismiss' ? d.dismiss() : d.accept(); });
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  await page.evaluate(() => {
    localStorage.setItem('expenseTracker_bossCashKey', 'pass-1234');
    cloudAvailable = true; currentUser = { uid: 'boss' };
    // 假的云端：两笔记录，g100 是最近那笔。delete() 真的把它从假数据里拿掉，
    // 这样「删除成功后清单刷新」和「失败时清单不变」都能验到。
    window.__docs = [
      { id:'g100', data:()=>({ person:'Seryi', amount:600, currency:'JPY', note:'买菜', at: Date.now()-1000 }) },
      { id:'g99',  data:()=>({ person:'Kuang', amount:50,  currency:'USD', at: Date.now()-2000 }) },
    ];
    window.__deletedIds = [];
    window.__forceDeleteError = null;
    // g100 在这台设备上有对应的本地支出记录（模拟当初就是这台设备送出去的）；
    // g99 没有（模拟"这台设备不是当初发送那台"——删除时要能静默跳过，不报错）。
    data.transactions.push({
      id: 'tx-g100', accountId: 'acc_boss', date: today(), type: 'expense',
      amount: 600, categoryId: 'cat_cash_gift', description: '给 Seryi 的现金：买菜',
      updatedAt: Date.now(), giftId: 'g100'
    });
    saveData();
    db = {
      collection: (name) => ({
        where: () => ({
          where: () => ({}),   // 只有 boss_cash_gifts 会连用两个 where，这里用不到第二层
          orderBy: () => ({ limit: () => ({ get: async () => ({
            empty: window.__docs.length === 0,
            docs: window.__docs.slice(),
          }) }) }),
        }),
        doc: (id) => ({ delete: async () => {
          if (window.__forceDeleteError) {
            const e = new Error('nope'); e.code = window.__forceDeleteError; throw e;
          }
          window.__deletedIds.push(id);
          window.__docs = window.__docs.filter(d => d.id !== id);
        } }),
      }),
    };
  });

  await page.click('#ov-boss-cash-gift');
  await until(async () => (await page.innerText('#boss-cash-gift-recent')).includes('Seryi'),
    { what: '清单载入' });

  ok('弹窗打开时清单自动出现，两笔都在',
     (await page.innerText('#boss-cash-gift-recent')).includes('Seryi')
     && (await page.innerText('#boss-cash-gift-recent')).includes('Kuang'));
  ok('金额+币种格式化正确显示', (await page.innerText('#boss-cash-gift-recent')).includes('¥600.00'));
  ok('备注一起显示', (await page.innerText('#boss-cash-gift-recent')).includes('买菜'));
  ok('每一笔都有撤回按钮', (await page.locator('#boss-cash-gift-recent button[aria-label*="撤回"]').count()) === 2);

  // ---- 取消：不发删除请求，清单不变 ----
  dialogAction = 'dismiss';
  await page.click('#boss-cash-gift-row-g100 button');
  await page.waitForTimeout(200); // 断言「没发生」，只能真的等一下
  ok('取消撤回时弹出确认框', dialogMsg.includes('Seryi') && dialogMsg.includes('撤回'), dialogMsg);
  ok('取消后没有调 delete()', (await page.evaluate(()=>window.__deletedIds.length)) === 0);
  ok('取消后清单里那一笔还在', (await page.innerText('#boss-cash-gift-recent')).includes('Seryi'));

  // bossCashGiftLog() 曾是首屏卡片「最近」那行的数据源，2026-09-10 改版后卡片已经改成
  // 显示代管账户真实余额、不再读这份 log（见 renderOvBossCashGift() 的改版说明）——但
  // log 本身、写入它的 logBossCashGift()、靠它兜底摘除的 forgetBossCashGift()、手动
  // 清空的 clearBossCashGiftLog() 都还在正常工作（deleteBossCashGift() 撤回一笔时仍会
  // 调 forgetBossCashGift 清理这份 log）。以下直接读 localStorage/bossCashGiftLog()
  // 断言这几个函数本身，不再断言卡片文字——卡片文字已经跟这份 log 无关。
  // 带 id 是新版送出时才会写的（见 sendBossCashGift 的 logBossCashGift 调用）。
  await page.evaluate(() => {
    localStorage.setItem('expenseTracker_bossCashGiftLog', JSON.stringify([
      { id: 'g100', person: 'Seryi', amount: 600, currency: 'JPY', at: Date.now() }
    ]));
  });
  ok('撤回前，log 里有这一笔', (await page.evaluate(()=>bossCashGiftLog())).some(e=>e.id==='g100'));

  // ---- 确认：真的调 Firestore delete()，清单刷新掉那一笔 ----
  dialogAction = 'accept';
  await page.click('#boss-cash-gift-row-g100 button');
  await until(() => page.evaluate(()=>window.__deletedIds.length > 0), { what: '撤回请求送出' });
  ok('确认后真的调了 delete()，且删的是对的 doc id',
     (await page.evaluate(()=>window.__deletedIds)).includes('g100'),
     await page.evaluate(()=>window.__deletedIds));
  await until(async () => !(await page.innerText('#boss-cash-gift-recent')).includes('Seryi'),
    { what: '清单刷新掉已撤回那一笔' });
  ok('清单里已经看不到撤回的那一笔', !(await page.innerText('#boss-cash-gift-recent')).includes('Seryi'));
  ok('没删的那笔还在', (await page.innerText('#boss-cash-gift-recent')).includes('Kuang'));
  ok('撤回后，deleteBossCashGift 仍会调 forgetBossCashGift 摘掉 log 里那一条',
     !(await page.evaluate(()=>bossCashGiftLog())).some(e=>e.id==='g100'));

  // ---- 老记录没有 id（在「撤回联动摘卡片」这个机制上线之前送出的）：退回按人名+金额+
  //      币种摘除兜底。直接调 forgetBossCashGift 单测这条兜底路径，不通过真实撤回
  //      按钮——g99（Kuang）这条 fixture 后面的「找不到对应本地交易」场景还要用，
  //      走真实撤回会把它删掉，干扰后面的断言。 ----
  await page.evaluate(() => {
    localStorage.setItem('expenseTracker_bossCashGiftLog', JSON.stringify([
      { person: '老记录同事', amount: 77, currency: 'USD', at: Date.now() }   // 没有 id，模拟旧记录
    ]));
  });
  ok('（老记录兜底）没有 id 的旧记录先在 log 里', (await page.evaluate(()=>bossCashGiftLog())).some(e=>e.person==='老记录同事'));
  await page.evaluate(() => forgetBossCashGift('some-other-doc-id', { person: '老记录同事', amount: 77, currency: 'USD' }));
  ok('（老记录兜底）按人名+金额+币种摘掉了这笔没有 id 的旧记录',
     !(await page.evaluate(()=>bossCashGiftLog())).some(e=>e.person==='老记录同事'));

  // ---- 弹窗里那个手动「清除本机残留显示缓存」的兜底链接（给摘不掉的极端情况用，
  //      2026-09-10 从首屏卡片挪到弹窗，因为卡片已经不显示这份 log 了）----
  await page.evaluate(() => {
    localStorage.setItem('expenseTracker_bossCashGiftLog', JSON.stringify([
      { person: '某个残留', amount: 1, currency: 'USD', at: Date.now() }
    ]));
  });
  ok('（手动清除）点「清除本机残留显示缓存」之前 log 里有内容', (await page.evaluate(()=>bossCashGiftLog())).length > 0);
  await page.evaluate(()=>clearBossCashGiftLog());
  ok('（手动清除）点了之后提示清除成功',
     (await page.textContent('#toast')||'').includes('已清除本机残留的显示缓存'));
  ok('（手动清除）localStorage 里的记录真的清空了',
     (await page.evaluate(()=>localStorage.getItem('expenseTracker_bossCashGiftLog'))) === null);

  // ---- 撤回联动：对应的本地支出记录也要撤销（不是只删了 Firestore、老板自己的
  //      余额还是少的），且要走 tombstoneTx（不然云同步合并时这笔"撤销的支出"会复活）----
  const localTxAfterDelete = await page.evaluate(()=>data.transactions.find(t=>t.id==='tx-g100'));
  ok('本地对应的支出记录被移除了', !localTxAfterDelete, localTxAfterDelete);
  ok('移除时调用了 tombstoneTx（写进了 deletedTxIds，防云同步合并复活）',
     await page.evaluate(()=>(data.deletedTxIds||[]).some(d=>d.id==='tx-g100')));
  const balAfterDelete = await page.evaluate(()=>{
    const txs = data.transactions.filter(t=>t.accountId==='acc_boss');
    return txs.reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0);
  });
  ok('账户余额跟着恢复（那笔支出被撤销了，不是只删了云端）', balAfterDelete === 0, balAfterDelete);

  // ---- 新格式（2026-09-09 之后：一对转账，两条腿）撤回要把两条腿都撤掉 ----
  await page.evaluate(() => {
    window.__docs.push({ id:'g97', data:()=>({ person:'Kuang', amount:300, currency:'USD', at: Date.now()-100 }) });
    const holdId = holdingAccountId('Kuang');
    if(!getAcc(holdId)) data.accounts.push({ id:holdId, name:'在 Kuang 手上', currency:'USD', color:'#f59e0b', isHolding:true, createdAt:Date.now() });
    data.transactions.push(
      { id:'tx-g97-src', accountId:'acc_boss', date:today(), type:'expense', amount:300,
        categoryId:'cat_cash_gift', description:'给 Kuang 的现金', updatedAt:Date.now(), giftId:'g97', xfer:true },
      { id:'tx-g97-hold', accountId:holdId, date:today(), type:'income', amount:300,
        categoryId:'cat_cash_gift_in', description:'从「Boss」转入', updatedAt:Date.now(), giftId:'g97', xfer:true }
    );
    saveData();
  });
  await page.evaluate(()=>refreshBossCashGiftRecent());
  await until(async () => (await page.innerText('#boss-cash-gift-recent')).includes('300.00'),
    { what: 'g97 出现在清单里' });
  await page.click('#boss-cash-gift-row-g97 button');
  await until(() => page.evaluate(()=>window.__deletedIds.includes('g97')), { what: 'g97 撤回请求送出' });
  const g97LegsAfter = await page.evaluate(()=>data.transactions.filter(t=>t.giftId==='g97'));
  ok('新格式（两条腿）撤回时两条都被移除，不是只删了一条', g97LegsAfter.length === 0, g97LegsAfter);
  ok('两条腿都进了 deletedTxIds（都调用了 tombstoneTx）',
     await page.evaluate(()=>{
       const ids = (data.deletedTxIds||[]).map(d=>d.id);
       return ids.includes('tx-g97-src') && ids.includes('tx-g97-hold');
     }));

  // ---- 找不到对应本地交易时撤回不报错（比如这台设备不是当初发送那台）----
  await page.evaluate(() => {
    window.__docs.push({ id:'g98', data:()=>({ person:'Nomatch', amount:20, currency:'USD', at: Date.now()-500 }) });
  });
  await page.evaluate(()=>refreshBossCashGiftRecent());
  await until(async () => (await page.innerText('#boss-cash-gift-recent')).includes('Nomatch'),
    { what: 'g98 出现在清单里' });
  const txCountBeforeG98 = await page.evaluate(()=>data.transactions.length);
  await page.click('#boss-cash-gift-row-g98 button');
  await until(() => page.evaluate(()=>window.__deletedIds.includes('g98')), { what: 'g98 撤回请求送出' });
  ok('本地没有对应交易时，撤回照样成功，也不报错',
     (await page.evaluate(()=>data.transactions.length)) === txCountBeforeG98);
  const noMatchToast = await page.evaluate(()=>document.getElementById('toast').textContent);
  ok('依然显示撤回成功的提示', (noMatchToast||'').includes('已撤回'), noMatchToast);

  // ---- 删除失败：讲清楚原因，不吞掉错误 ----
  const prevToast = await page.evaluate(()=>document.getElementById('toast').textContent);
  await page.evaluate(() => { window.__forceDeleteError = 'permission-denied'; });
  await page.click('#boss-cash-gift-row-g99 button');
  await until(async () => (await page.evaluate(()=>document.getElementById('toast').textContent)) !== prevToast,
    { what: '失败提示出现（toast 内容变化）' });
  const failToast = await page.evaluate(()=>document.getElementById('toast').textContent);
  ok('删除失败时提示讲清楚是权限问题，不是笼统的失败',
     failToast.includes('口令不对') || failToast.includes('老板本人') || failToast.includes('规则'),
     failToast);
  ok('失败时那一笔没被真的删掉', (await page.evaluate(()=>window.__docs.some(d=>d.id==='g99'))));

  ok('无 JS 报错', errs.length===0, errs);
  await ctx.close();
}

// ---------- 【33】给同事现金：弹窗里「给了/花了/还剩」+「他还钱了」----------
// 2026-09-09 记账逻辑修正后重写：「还剩」不再是「给了－花了」现算，而是**直接读代管
// 账户余额**（holdingBalance()，账户余额这类用途照算转账）——这是权威数字，也是
// 「他还钱了」按钮默认带入的金额，两处必须是同一个数。「他花了多少」＝代管账户里
// **非 xfer** 的支出（同事报回来的账，或者老板直接记在这个账户上的支出），不含
// 「他还钱了」那条转账腿。「给了多少」仍然查 Firestore（跨设备权威总数，客户端按
// person 筛、大小写不敏感）。两人（Kuang / Seryi）的代管账户必须彼此独立：改一个人
// 的不能碰到另一个人的——这条贯穿整个测试，不是只测一个人就完事。
{
  console.log('\n【33】给同事现金：弹窗显示「给了/花了/还剩」+ 他还钱了');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  let promptValue = null;      // 下一次 window.prompt() 要回答的值；null＝按取消
  let dialogDefaultSeen = null;
  page.on('dialog', d => {
    if(d.type() === 'prompt'){
      dialogDefaultSeen = d.defaultValue();
      promptValue === null ? d.dismiss() : d.accept(promptValue);
    } else d.accept();
  });
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  await page.evaluate(() => {
    localStorage.setItem('expenseTracker_bossCashKey', 'pass-1234');
    cloudAvailable = true; currentUser = { uid: 'boss' };
    if(!data.accounts.some(a=>a.id==='acc_hkd_test'))
      data.accounts.push({ id:'acc_hkd_test', name:'测试用', currency:'HKD', color:'#999' });

    // Kuang：代管账户已收 700（两笔历史转账）、花了 150（同事报回来的，非 xfer）
    // ——还剩 550。Seryi：代管账户收了 9999、花了 999——还剩 9000。
    const kHold = getOrCreateHoldingAccount('Kuang', 'USD');
    const sHold = getOrCreateHoldingAccount('Seryi', 'USD');
    data.transactions.push(
      { id:'tx-kg1', accountId:kHold.id, type:'income', amount:500, date:today(), categoryId:'cat_cash_gift_in', xfer:true, giftId:'gk1' },
      { id:'tx-kg2', accountId:kHold.id, type:'income', amount:200, date:today(), categoryId:'cat_cash_gift_in', xfer:true, giftId:'gk2' },
      { id:'tx-k1',  accountId:kHold.id, type:'expense', amount:100, date:today(), categoryId:'cat_other_exp', fromStaff:{ by:'Kuang', at:1 } },
      { id:'tx-k2',  accountId:kHold.id, type:'expense', amount:50,  date:today(), categoryId:'cat_other_exp', fromStaff:{ by:'kuang  ', at:2 } },
      { id:'tx-sg1', accountId:sHold.id, type:'income', amount:9999, date:today(), categoryId:'cat_cash_gift_in', xfer:true, giftId:'gs1' },
      { id:'tx-s1',  accountId:sHold.id, type:'expense', amount:999, date:today(), categoryId:'cat_other_exp', fromStaff:{ by:'Seryi', at:3 } }
    );
    saveData();
    window.__giftQueries = [];
    db = { collection: (c) => ({ where: (f,o,v) => ({ get: async () => {
      window.__giftQueries.push(v);
      return { forEach: fn => {
        fn({ data: () => ({ k:'pass-1234', person:'Kuang', amount:500 }) });
        fn({ data: () => ({ k:'pass-1234', person:'KUANG', amount:200 }) });   // 大小写不同也要算
        fn({ data: () => ({ k:'pass-1234', person:'Seryi', amount:9999 }) });  // 不该算进 Kuang
      } };
    } }) }) };
  });
  await page.click('#ov-boss-cash-gift');
  await page.waitForTimeout(200);
  await page.selectOption('#boss-cash-gift-acc', 'acc_boss');
  await page.selectOption('#boss-cash-gift-person', 'Kuang');
  await until(async () => (await page.innerText('#boss-cash-gift-person-summary')).includes('已给'),
    { what: '摘要算完' });
  let summary = await page.innerText('#boss-cash-gift-person-summary');
  ok('「给了多少」按 person 客户端筛、大小写不同也认得出（500+200=700，Seryi 的 9999 不算）',
     summary.includes('US$700.00'), summary);
  ok('「他花了多少」＝代管账户里非 xfer 的支出（100+50=150，大小写/空格不同也认得出，Seryi 的 999 不算）',
     summary.includes('US$150.00'), summary);
  ok('「还剩」直接读代管账户余额（700－150＝550，不再是「给了－花了」现算）',
     summary.includes('US$550.00'), summary);

  // ---- 换个人要重算，且两人数字互不影响（代管账户彼此独立）----
  await page.selectOption('#boss-cash-gift-person', 'Seryi');
  await until(async () => (await page.innerText('#boss-cash-gift-person-summary')).includes('US$9999.00'),
    { what: '换成 Seryi 后摘要重算' });
  summary = await page.innerText('#boss-cash-gift-person-summary');
  ok('换个人，摘要跟着换成那个人的数字（Seryi 给了 9999、花了 999、剩 9000）',
     summary.includes('US$9999.00') && summary.includes('US$999.00') && summary.includes('US$9000.00'), summary);

  // ---- 换「从哪个账户出」不该再影响这个人的摘要——代管账户按人独立，跟当次准备
  //      从哪个账户转钱无关（旧设计才会受选中账户影响，这是这次改版要修掉的行为）----
  await page.selectOption('#boss-cash-gift-acc', 'acc_hkd_test');
  await page.waitForTimeout(150);
  summary = await page.innerText('#boss-cash-gift-person-summary');
  ok('换「从哪个账户出」不影响这个人的花了/还剩（跟旧设计不一样）',
     summary.includes('US$999.00') && summary.includes('US$9000.00'), summary);
  await page.selectOption('#boss-cash-gift-acc', 'acc_boss');

  // ---- 没登录：至少「他花了多少/还剩」这个本机数据还看得到，不用整段消失 ----
  await page.evaluate(() => { currentUser = null; });
  await page.selectOption('#boss-cash-gift-person', 'Kuang');
  await until(async () => (await page.innerText('#boss-cash-gift-person-summary')).includes('登录'),
    { what: '未登录提示出现' });
  summary = await page.innerText('#boss-cash-gift-person-summary');
  ok('没登录时，「他花了多少/还剩」这个本机数据依然看得到（不用整段消失）',
     summary.includes('US$150.00') && summary.includes('US$550.00'), summary);
  ok('没登录时说清楚「给了多少」看不到的原因', summary.includes('登录'), summary);
  await page.evaluate(() => { currentUser = { uid: 'boss' }; });

  // ---- 「他还钱了」：prompt 默认值必须等于屏幕上「还剩」那个数（550），两处不能对不上 ----
  await page.selectOption('#boss-cash-gift-person', 'Kuang');
  await page.waitForTimeout(150);
  ok('摘要里有「他还钱了」按钮', await page.locator('#boss-cash-gift-person-summary button').isVisible());
  const kHoldId = await page.evaluate(()=>holdingAccountId('Kuang'));
  const sHoldId = await page.evaluate(()=>holdingAccountId('Seryi'));
  const holdBal = (id) => page.evaluate((i)=>data.transactions.filter(t=>t.accountId===i)
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), id);

  promptValue = null;   // 先按取消，只为了读 prompt 的默认值，不该产生任何记录
  const txCountBeforeCancel = await page.evaluate(()=>data.transactions.length);
  await page.evaluate(()=>repayBossCashGift());
  await page.waitForTimeout(150);
  ok('prompt 默认带入代管账户当前余额（550，跟屏幕上「还剩」同一个数）',
     dialogDefaultSeen === '550', dialogDefaultSeen);
  ok('取消（dismiss）不记账，笔数不变', (await page.evaluate(()=>data.transactions.length)) === txCountBeforeCancel);

  // ---- 币种不一致要挡住：Seryi 的代管账户是 USD，选了 HKD 账户接收——不许静静按面值记错 ----
  await page.selectOption('#boss-cash-gift-person', 'Seryi');
  await page.selectOption('#boss-cash-gift-acc', 'acc_hkd_test');
  await page.waitForTimeout(150);
  promptValue = '100';
  const txCountBeforeMismatch = await page.evaluate(()=>data.transactions.length);
  await page.evaluate(()=>repayBossCashGift());
  await page.waitForTimeout(150);
  ok('币种不一致时不记账（不静静按 1:1 记错汇率）',
     (await page.evaluate(()=>data.transactions.length)) === txCountBeforeMismatch);
  const mismatchToast = await page.evaluate(()=>document.getElementById('toast').textContent);
  ok('提示讲清楚是币种不一致', (mismatchToast||'').includes('币种不一致'), mismatchToast);
  await page.selectOption('#boss-cash-gift-acc', 'acc_boss');

  // ---- 真的还钱：Kuang 还 550（全部还清），两条腿方向都对，Firestore 完全没碰 ----
  await page.selectOption('#boss-cash-gift-person', 'Kuang');
  await page.waitForTimeout(150);
  promptValue = '550';
  const boBefore = await holdBal(kHoldId);
  const srcBefore = await page.evaluate(()=>data.transactions.filter(t=>t.accountId==='acc_boss')
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0));
  await page.evaluate(()=>repayBossCashGift());
  await page.waitForTimeout(200);
  const boAfter = await holdBal(kHoldId);
  ok('还钱后代管账户余额归零（550 全部还清）', boAfter === 0, { boBefore, boAfter });
  const repayHoldLeg = await page.evaluate((id)=>data.transactions.find(t=>t.accountId===id && t.xfer && t.type==='expense' && t.amount===550), kHoldId);
  ok('代管账户记了一笔 xfer 支出（钱离开代管账户）', !!repayHoldLeg, repayHoldLeg);
  const repaySrcLeg = await page.evaluate(()=>data.transactions.find(t=>t.accountId==='acc_boss' && t.xfer && t.type==='income' && t.amount===550));
  ok('接收账户记了对应的 xfer 收入，金额一致', !!repaySrcLeg, repaySrcLeg);
  const srcAfter = await page.evaluate(()=>data.transactions.filter(t=>t.accountId==='acc_boss')
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0));
  ok('接收账户余额真的多了这 550', srcAfter === srcBefore + 550, { srcBefore, srcAfter });
  ok('还钱全程没碰 Firestore（mock 的 db 完全没有 add()，碰了就会抛错，这里没抛说明没碰）',
     errs.length === 0, errs);

  // ---- Seryi 完全没受 Kuang 还钱影响（两人代管账户互相独立，这是贯穿全测试的关键）----
  const sBalAfterKuangRepay = await holdBal(sHoldId);
  ok('Kuang 还钱不影响 Seryi 的代管余额（还是 9000）', sBalAfterKuangRepay === 9000, sBalAfterKuangRepay);

  ok('无 JS 报错', errs.length===0, errs);
  await ctx.close();
}

// ---------- 【34】代管账户对每个人都通用：自动建/复用 + 投递箱按人路由（含对照组）----------
// 用户明确要求（2026-09-09）：这套机制必须对名册里每一个人都一样，不是只给某一个人做的。
// 这里专门测**两个不同的人**（Kuang / Seryi），每一条都配对照组：动 A 的时候顺手确认
// B 完全没被碰到——只测一个人的话，「所有人共用同一个代管账户」这种严重错误也会全绿。
{
  console.log('\n【34】代管账户对每个人都通用（自动建/复用、投递箱按人路由、跨人隔离）');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d => d.accept());
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  // ---- 懒创建：谁都没转过钱之前，名册里的人一个代管账户都不该有 ----
  ok('还没转过钱时，Kuang/Seryi 都还没有代管账户（懒创建，不预建）',
     await page.evaluate(()=>!getAcc(holdingAccountId('Kuang')) && !getAcc(holdingAccountId('Seryi'))));

  // ---- 第一次转钱给 Kuang：自动建他的代管账户；Seryi 的账户数不受影响 ----
  const accCountBefore = await page.evaluate(()=>data.accounts.length);
  await page.evaluate(()=>{
    localStorage.setItem('expenseTracker_bossCashKey', 'pass-1234');
    cloudAvailable = true; currentUser = { uid:'boss' };
    window.__gifts = [];
    db = { collection:(c)=>({ add: async (p)=>{ window.__gifts.push({c,p}); return {id:'gA'}; } }) };
  });
  await page.click('#ov-boss-cash-gift');
  await page.waitForTimeout(150);
  await page.selectOption('#boss-cash-gift-acc', 'acc_boss');
  await page.selectOption('#boss-cash-gift-person', 'Kuang');
  await page.fill('#boss-cash-gift-amount', '400');
  await page.evaluate(()=>sendBossCashGift());
  await page.waitForTimeout(200);
  ok('第一次转钱给 Kuang，多了一个账户（他的代管账户）',
     (await page.evaluate(()=>data.accounts.length)) === accCountBefore + 1);
  ok('Kuang 的代管账户余额是 400', (await page.evaluate((id)=>data.transactions.filter(t=>t.accountId===id)
     .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), await page.evaluate(()=>holdingAccountId('Kuang')))) === 400);
  ok('（对照组）Seryi 依然没有代管账户——给 Kuang 转钱不该凭空建出 Seryi 的账户',
     !(await page.evaluate(()=>!!getAcc(holdingAccountId('Seryi')))));

  // ---- 再转一次给 Kuang：复用同一个账户，不重复建；Seryi 依然不受影响 ----
  const accCountAfterFirst = await page.evaluate(()=>data.accounts.length);
  await page.fill('#boss-cash-gift-amount', '100');
  await page.evaluate(()=>sendBossCashGift());
  await page.waitForTimeout(200);
  ok('第二次转给 Kuang 不新建账户（复用已有的）',
     (await page.evaluate(()=>data.accounts.length)) === accCountAfterFirst);
  ok('Kuang 的代管账户余额累计到 500（400+100）',
     (await page.evaluate((id)=>data.transactions.filter(t=>t.accountId===id)
       .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), await page.evaluate(()=>holdingAccountId('Kuang')))) === 500);

  // ---- 转给 Seryi：只有 Seryi 的代管账户增加，Kuang 的完全不受影响（这是用户明确要求
  //      的对照断言，"给 A 转钱 → 只有 A 的代管账户增加，B 的代管账户完全不受影响"）----
  const kuangBalBeforeSeryiGift = await page.evaluate((id)=>data.transactions.filter(t=>t.accountId===id)
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), await page.evaluate(()=>holdingAccountId('Kuang')));
  await page.selectOption('#boss-cash-gift-person', 'Seryi');
  await page.fill('#boss-cash-gift-amount', '300');
  await page.evaluate(()=>sendBossCashGift());
  await page.waitForTimeout(200);
  const seryiHoldId = await page.evaluate(()=>holdingAccountId('Seryi'));
  ok('Seryi 的代管账户建好了，余额是 300', (await page.evaluate((id)=>data.transactions.filter(t=>t.accountId===id)
     .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), seryiHoldId)) === 300);
  const kuangBalAfterSeryiGift = await page.evaluate((id)=>data.transactions.filter(t=>t.accountId===id)
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), await page.evaluate(()=>holdingAccountId('Kuang')));
  ok('（对照组）给 Seryi 转钱，Kuang 的代管余额完全不受影响，还是 500',
     kuangBalAfterSeryiGift === kuangBalBeforeSeryiGift && kuangBalAfterSeryiGift === 500,
     { kuangBalBeforeSeryiGift, kuangBalAfterSeryiGift });

  // ---- 规整化跟 person 输入源无关：不同大小写/空格的 person 派生出同一个账户 id
  //      （模拟老板转钱用的 person 拼法和同事端 staffIdentity.reporter 拼法不完全
  //      一致的情况——holdingAccountId 是这套机制唯一的比对依据，必须稳）----
  ok('大小写/空格不同，派生出同一个账户 id（KUANG / kuang / " Kuang " 都对到 Kuang 那个账户）',
     await page.evaluate(()=>{
       const a = holdingAccountId('Kuang'), b = holdingAccountId('KUANG'), c = holdingAccountId('  kuang  ');
       return a === b && b === c;
     }));

  // ---- 投递箱按人路由（2026-09-10 二次改版）：Kuang（有代管账户）报的账现在要落进
  //      「当初转钱出去的那个真实账户」（holdingRealAccountId，这里就是 acc_boss，
  //      因为他两次都是从 acc_boss 转的），并且带两条配平腿；NoHolding（没转过现金、
  //      对照组）报的账仍落回设置页选的默认账户，一条腿都不加，行为跟以前一样不受影响 ----
  await page.evaluate(() => {
    window.__box = { docs: [], deleted: [] };
    window.__put = (id, d) => window.__box.docs.push({
      id, data: () => d, ref: { delete: async () => { window.__box.deleted.push(id); } } });
    db = { collection: (c) => ({
      limit: () => ({ get: async () => ({ docs: window.__box.docs }) }),
      doc: () => ({ collection: () => ({ doc: () => ({ set: async () => {} }) }) }),
    }) };
  });
  const seed = (id, tx, from) => page.evaluate(([id, tx, from]) =>
    window.__put(id, { k:'x', from, tx: JSON.stringify(tx) }), [id, tx, from]);
  await seed('inbox1', { srcId:'r1', date:'2026-09-09', amount:60, type:'expense',
    categoryId:'cat_food', description:'Kuang 买的午饭' }, 'Kuang');
  await seed('inbox2', { srcId:'r2', date:'2026-09-09', amount:40, type:'expense',
    categoryId:'cat_food', description:'没代管账户的人报的账' }, 'NoHoldingPerson');
  const kuangHoldBalBeforeInbox = await page.evaluate((id)=>data.transactions.filter(t=>t.accountId===id)
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), await page.evaluate(()=>holdingAccountId('Kuang')));
  await page.evaluate(()=>fetchInbox());
  await page.waitForTimeout(300);
  const kuangIx = await page.evaluate(()=>data.transactions.find(t=>t.id==='ix_r1'));
  ok('Kuang 报的账明细进了「当初转钱出去的那个真实账户」（acc_boss），不是代管账户本身',
     kuangIx && kuangIx.accountId === 'acc_boss', kuangIx);
  ok('这笔明细带 staffSpendId（等于自己的 id），供撤销/去重用',
     kuangIx && kuangIx.staffSpendId === 'ix_r1', kuangIx);
  ok('这笔明细没有打 xfer（是真支出，不是配平腿）', kuangIx && !kuangIx.xfer, kuangIx);
  const kuangHoldId = await page.evaluate(()=>holdingAccountId('Kuang'));
  const kuangLegs = await page.evaluate(()=>data.transactions.filter(t=>t.staffSpendId==='ix_r1'));
  ok('一共 3 条腿（真支出 + 2 条配平腿）', kuangLegs.length === 3, kuangLegs);
  const balLeg = kuangLegs.find(t=>t.accountId==='acc_boss' && t.type==='income' && t.xfer);
  const holdLeg = kuangLegs.find(t=>t.accountId===kuangHoldId && t.type==='expense' && t.xfer);
  ok('配平腿一：真实账户收入 60（钱早就转出去了，不能再扣一次）', balLeg && balLeg.amount === 60, balLeg);
  ok('配平腿二：代管账户支出 60（他手上代管的钱因此变少）', holdLeg && holdLeg.amount === 60, holdLeg);
  const kuangHoldBalAfterInbox = await page.evaluate((id)=>data.transactions.filter(t=>t.accountId===id)
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), kuangHoldId);
  ok('Kuang 的代管余额少了这 60（配平腿三体现的）',
     kuangHoldBalAfterInbox === kuangHoldBalBeforeInbox - 60, { kuangHoldBalBeforeInbox, kuangHoldBalAfterInbox });
  const noHoldIx = await page.evaluate(()=>data.transactions.find(t=>t.id==='ix_r2'));
  ok('（对照组）没有代管账户的人，账落回设置页选的默认账户，只有一条腿——行为跟以前一样',
     noHoldIx && noHoldIx.accountId === (await page.evaluate(()=>getInboxAccountId())) && !noHoldIx.staffSpendId, noHoldIx);
  ok('（对照组）没有代管账户的人这笔，没有任何配平腿',
     (await page.evaluate(()=>data.transactions.filter(t=>t.staffSpendId==='ix_r2').length)) === 0);
  const seryiHoldBalAfterInbox = await page.evaluate((id)=>data.transactions.filter(t=>t.accountId===id)
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), seryiHoldId);
  ok('（对照组）Kuang 报账不影响 Seryi 的代管余额，还是 300',
     seryiHoldBalAfterInbox === 300, seryiHoldBalAfterInbox);

  // ---- 该付同事名单要排除有 staffSpendId 的支出（那是老板早就转给他的钱，不是他自己垫的）----
  const owed = await page.evaluate(()=>inboxOwedByPerson());
  ok('「该付同事」名单里没有 Kuang（他花的是代管现金，用 staffSpendId 判断，不是自己垫付）',
     !owed.some(r=>r.who==='Kuang'), owed);
  ok('（对照组）没代管账户的人照样出现在「该付同事」名单里，机制没被误伤',
     owed.some(r=>r.who==='NoHoldingPerson'), owed);

  ok('无 JS 报错', errs.length===0, errs);
  await ctx.close();
}

// ---------- 【35】账户明细 PDF：「代管转回」不能被写成「新增注资」----------
// 代管账户改造（2026-09-09）之后，收入里会混进「同事把没花完的现金还回来」这种
// xfer 收入腿。PDF **刻意**把 xfer 算进收支（否则「期初＋收入−支出＝期末」这条恒等式
// 会对不上），这是对的；但「收支汇总」那栏原本笼统写「新增注资 N笔」，会把还回来的钱
// 说成新投进来的本金——看这份 PDF 的人（老板）照着这个数字下判断就错了。
{
  console.log('\n【35】账户明细 PDF：「代管转回」与「新增注资」分开写');
  const ctx = await browser.newContext();
  await stubPdfLibs(ctx);
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  const noteText = await page.evaluate(async () => {
    const acc = data.accounts[0];
    const now = new Date();
    const d = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-15`;
    // 一笔真的注资 + 一笔代管转回（xfer 收入腿）+ 一笔普通支出
    data.transactions = [
      { id:'inc-fund', accountId:acc.id, type:'income',  amount:1000, date:d,
        description:'老板注资', categoryId:'cat_other_inc' },
      { id:'inc-xfer', accountId:acc.id, type:'income',  amount:2000, date:d,
        description:'Kuang 还回来的现金', categoryId:'cat_cash_gift_in', xfer:true },
      { id:'exp-1',    accountId:acc.id, type:'expense', amount:300,  date:d,
        description:'买菜', categoryId:(data.categories[0]||{}).id }
    ];
    state.anYear = now.getFullYear(); state.anMonth = now.getMonth();
    state.currentAccountId = acc.id;
    await buildStatementPDF();
    return document.getElementById('pdf-statement').innerText;
  });

  ok('注资那笔照常写成「新增注资 1笔」', /新增注资\s*1\s*笔/.test(noteText), noteText.slice(0, 600));
  ok('代管转回单独写出来，不混进注资', /代管转回\s*1\s*笔/.test(noteText), noteText.slice(0, 600));
  ok('★不会把两笔笼统算成「新增注资 2笔」（那会把还回来的钱说成新投进来的本金）',
     !/新增注资\s*2\s*笔/.test(noteText), noteText.slice(0, 600));
  ok('无 JS 报错', errs.length===0, errs);
  await ctx.close();
}

// ---------- 【36】一键归还：投递箱收到 op:'repay' 记两条腿转账，不是一笔消费 ----------
// 同事按下「一键归还」送进的还是同一个投递箱（inbox_boss），只是 tx 字符串里多个
// op:'repay'。这不能落进 fetchInbox() 普通消费那条入账路径——那样会把「归还」记成
// 他又花了一笔钱，代管账户余额不减反增，钱凭空消失。要记成跟 repayBossCashGift()
// 一样的两条腿转账（代管账户 expense + 目标账户 income，都打 xfer:true）。
console.log('\n【36】一键归还：投递箱收到 op:repay 记两条腿转账，币种不对/没有代管账户不硬记');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d => d.accept());
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  await page.evaluate(() => {
    window.__box = { docs: [], deleted: [] };
    window.__put = (id, d) => window.__box.docs.push({
      id, data: () => d, ref: { delete: async () => { window.__box.deleted.push(id); } } });
    cloudAvailable = true;
    currentUser = { uid: 'boss' };
    db = { collection: () => ({ limit: () => ({ get: async () => ({ docs: window.__box.docs }) }) }) };
    saveBossCashGiftAccount('acc_boss');            // 目标账户固定成 USD，跟代管账户同币种
    getOrCreateHoldingAccount('Seryi', 'USD');       // 先手动建好代管账户（模拟老板转过现金）
    getOrCreateHoldingAccount('Kuang', 'HKD');       // 故意跟目标账户（USD）不同币种
    data.transactions.push({ id: uid(), accountId: holdingAccountId('Seryi'), date:'2026-09-01',
      type:'income', amount:500, categoryId:'cat_cash_gift_in', description:'给 Seryi 的现金转入',
      updatedAt: Date.now(), xfer:true });
    saveData();
  });

  const seed = (id, tx, from) => page.evaluate(([id, tx, from]) =>
    window.__put(id, { k:'x', from, tx: JSON.stringify(tx) }), [id, tx, from]);
  const fetchNow = () => page.evaluate(() => fetchInbox());
  const holdSeryi = await page.evaluate(()=>holdingAccountId('Seryi'));
  const holdBal = () => page.evaluate((id)=>data.transactions.filter(t=>t.accountId===id)
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), holdSeryi);

  ok('代管账户先有 500（模拟老板早前转过现金）', await holdBal() === 500, await holdBal());

  // ---- 对照组：同一批里的普通消费照旧记成一笔支出，不打 xfer（不能被新逻辑误判成归还）----
  await seed('normal1', { srcId:'n1', date:'2026-09-10', amount:9.99, type:'expense',
                          categoryId:'cat_food', description:'普通消费' }, 'X');
  // ---- 归还：Seryi 归还 200 ----
  await seed('r1', { op:'repay', srcId:'rs1', amount:200, date:'2026-09-10' }, 'Seryi');
  await fetchNow(); await page.waitForTimeout(300);

  const normalTx = await page.evaluate(()=>data.transactions.find(t=>t.id==='ix_n1'));
  ok('对照组：普通消费照旧记成一笔支出，不打 xfer（少了这条对照，「都当归还处理」也会全绿）',
     !!normalTx && normalTx.type==='expense' && !normalTx.xfer, normalTx);

  const legs = await page.evaluate(()=>data.transactions.filter(t=>t.repayId==='ix_repay_rs1'));
  ok('归还记成两条腿，不是一笔消费', legs.length === 2, legs);
  const holdLeg = legs.find(t=>t.accountId===holdSeryi);
  const backLeg = legs.find(t=>t.accountId==='acc_boss');
  ok('代管账户那条是支出，金额正确', holdLeg?.type==='expense' && holdLeg?.amount===200, holdLeg);
  ok('目标账户那条是收入，金额正确', backLeg?.type==='income' && backLeg?.amount===200, backLeg);
  ok('两条都打了 xfer:true（转账，不算进收支汇总）', holdLeg?.xfer===true && backLeg?.xfer===true, {holdLeg, backLeg});
  ok('代管账户余额从 500 减到 300（他手上还剩的变少）', await holdBal() === 300, await holdBal());

  const monthExpNoXfer = await page.evaluate(()=>{
    const now = new Date();
    return monthTxs('acc_boss', now.getFullYear(), now.getMonth())
      .filter(t=>t.type==='expense' && !t.xfer).reduce((s,t)=>s+t.amount,0);
  });
  // 目标账户本来就有对照组那笔普通消费（9.99）——归还的 200 不该加进这个数字，
  // 所以断言是「还是 9.99，没多」，不是断言「等于 0」（这个账户本来就不是 0）。
  ok('目标账户「本月支出」不受归还影响（归还不是花钱，数字还是对照组那笔 9.99，没多）',
     monthExpNoXfer === normalTx.amount, { monthExpNoXfer, normalAmount: normalTx.amount });

  // ---- 幂等：文档没删掉又被收一次（模拟删除失败后重试），不能记两次 ----
  await seed('r1b', { op:'repay', srcId:'rs1', amount:200, date:'2026-09-10' }, 'Seryi');
  await fetchNow(); await page.waitForTimeout(300);
  const legs2 = await page.evaluate(()=>data.transactions.filter(t=>t.repayId==='ix_repay_rs1'));
  ok('同一笔归还重复收到不会记第二次（幂等）', legs2.length === 2, legs2);

  // ---- 币种不一致：不许硬记（那等于编了个假汇率），留在箱子里请老板手动处理 ----
  const beforeLen = await page.evaluate(()=>data.transactions.length);
  await seed('r2', { op:'repay', srcId:'rs2', amount:50, date:'2026-09-10' }, 'Kuang');
  await fetchNow(); await page.waitForTimeout(300);
  const afterLen = await page.evaluate(()=>data.transactions.length);
  ok('代管账户跟目标账户币种不一致时不硬记（不新增交易）', afterLen === beforeLen, {beforeLen, afterLen});
  ok('这份文档没被删掉，留着等下次收件、也等老板手动处理',
     await page.evaluate(()=>window.__box.docs.some(d=>d.id==='r2')));
  ok('提示明确说要用「他还钱了」按钮手动处理',
     (await page.textContent('#toast')||'').includes('他还钱了'));

  // ---- 没有代管账户的人送归还：同样不硬记（理论上不该发生，但要接得住）----
  const beforeLen2 = await page.evaluate(()=>data.transactions.length);
  await seed('r3', { op:'repay', srcId:'rs3', amount:20, date:'2026-09-10' }, '从来没转过钱的人');
  await fetchNow(); await page.waitForTimeout(300);
  const afterLen2 = await page.evaluate(()=>data.transactions.length);
  ok('没有代管账户的人送归还，同样不硬记', afterLen2 === beforeLen2, {beforeLen2, afterLen2});

  // ---- 还的比他手上代管的还多：老板端这道也要挡（金额是同事那台手机报上来的，
  //      本机这份账才是正本）。硬记会把代管账户记成负数，总账就乱了。----
  const balBefore = await holdBal();                       // 此时代管账户剩 300
  const beforeLen3 = await page.evaluate(()=>data.transactions.length);
  await seed('rover', { op:'repay', srcId:'rsover', amount: balBefore + 1, date:'2026-09-10' }, 'Seryi');
  await fetchNow(); await page.waitForTimeout(300);
  ok('归还金额超过代管余额时不入账（老板端第二道关，不信任同事端报的数字）',
     await page.evaluate(()=>data.transactions.length) === beforeLen3,
     { beforeLen3, after: await page.evaluate(()=>data.transactions.length) });
  ok('超额那份文档没被删掉，钱不会因为挡下来就凭空消失',
     await page.evaluate(()=>window.__box.docs.some(d=>d.id==='rover')));
  ok('代管账户余额没被记成负数', await holdBal() === balBefore, await holdBal());
  ok('提示说明是超额，不是币种问题',
     (await page.textContent('#toast')||'').includes('超过'), await page.textContent('#toast'));

  // 对照：刚好等于余额的一笔要放行（否则「全部归还」这个主用例会被自己挡住）
  await seed('rexact', { op:'repay', srcId:'rsexact', amount: balBefore, date:'2026-09-10' }, 'Seryi');
  await fetchNow(); await page.waitForTimeout(300);
  ok('对照组：刚好等于余额的「全部归还」照常入账（挡的是超额，不是全额）',
     (await page.evaluate(()=>data.transactions.filter(t=>t.repayId==='ix_repay_rsexact'))).length === 2);
  ok('全部归还后代管账户归零', await holdBal() === 0, await holdBal());
  // 后面的用例还要再收一笔归还（r4），把余额补回去
  await page.evaluate(()=>{ data.transactions.push({ id: uid(), accountId: holdingAccountId('Seryi'),
    date:'2026-09-01', type:'income', amount:100, categoryId:'cat_cash_gift_in',
    description:'补一笔转入，给后面的用例用', updatedAt: Date.now(), xfer:true }); saveData(); });

  // ---- 坏数据：金额<=0 或日期格式不对，当垃圾丢掉，不堵住箱子 ----
  await seed('rbad', { op:'repay', srcId:'rsbad', amount:-5, date:'不是日期' }, 'Seryi');
  await fetchNow(); await page.waitForTimeout(300);
  // 这个假投递箱的 ref.delete() 只把 id 记进 __box.deleted，不会真的把文档从
  // __box.docs 里摘掉（跟测【21】同一个 mock 的语义）——判断「丢掉了没有」要看
  // deleted 列表，不是看 docs 还在不在。
  ok('坏的归还数据被当垃圾丢掉',
     (await page.evaluate(()=>window.__box.deleted)).includes('rbad'),
     await page.evaluate(()=>window.__box.deleted));

  // ---- 打开「给同事现金」弹窗要顺手静默收一次件，不用手动点「立刻收件」----
  await page.evaluate(()=>{ data.currentAccountId = 'acc_boss'; switchTab('overview'); });
  await seed('r4', { op:'repay', srcId:'rs4', amount:30, date:'2026-09-10' }, 'Seryi');
  await page.click('#ov-boss-cash-gift');
  await until(async ()=> await page.evaluate(()=>data.transactions.some(t=>t.repayId==='ix_repay_rs4')),
    { what: '打开弹窗顺手收件' });
  ok('打开「给同事现金」弹窗会顺手静默收一次件（不用手动点「立刻收件」）',
     await page.evaluate(()=>data.transactions.some(t=>t.repayId==='ix_repay_rs4')));

  ok('无 JS 报错', errs.length===0, errs);
  await ctx.close();
}

// ---------- 【37】首屏「给同事现金」卡片显示真实进度 + 一次性搬旧记录进代管账户 ----------
// 2026-09-10：卡片原本只显示本地"最近转过谁多少"的显示缓存，看不出钱现在的状态，
// 改成直接读代管账户余额（还剩）+ 该账户里非 xfer 支出合计（已花）。同一次顺手做
// 「🧹 整理旧记录」：代管账户是后来才有的，之前投递箱收进来的账落在别的账户，导致
// 「已花多少」从旧记录起就是残缺的。
console.log('\n【37】首屏卡片「还剩/已花」+ 整理旧记录进代管账户');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d => d.accept());
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  await page.evaluate(() => {
    localStorage.setItem('expenseTracker_bossCashKey', 'pass-1234');
  });

  // ---- 没有任何代管账户时，卡片显示兜底文案 ----
  await page.evaluate(()=>renderOverview());
  ok('还没转过钱时，卡片显示兜底文案',
     (await page.textContent('#ov-boss-cash-gift')||'').includes('会自动进他们的「手上现金」卡'));

  // ---- 手算 fixture：Kuang 转入 5000、花 3000（非xfer）、还回 500（xfer，不算已花）----
  await page.evaluate(() => {
    const holdAcc = getOrCreateHoldingAccount('Kuang', 'HKD');
    const now = Date.now();
    data.transactions.push(
      { id: uid(), accountId: holdAcc.id, date:'2026-09-01', type:'income', amount:5000,
        categoryId:'cat_cash_gift_in', description:'转入', updatedAt: now, xfer:true },
      { id: uid(), accountId: holdAcc.id, date:'2026-09-02', type:'expense', amount:3000,
        categoryId:'cat_food', description:'他花的', updatedAt: now, fromStaff:{by:'Kuang', at: now} },
      { id: uid(), accountId: holdAcc.id, date:'2026-09-03', type:'expense', amount:500,
        categoryId:'cat_cash_gift', description:'还回来', updatedAt: now, xfer:true }
    );
    saveData();
    renderOverview();
  });
  const cardTxt1 = await page.textContent('#ov-boss-cash-gift');
  ok('卡片显示 Kuang 还剩 1500（5000-3000-500），手算对得上',
     cardTxt1.includes('Kuang') && cardTxt1.includes('还剩') && /1,?500\.00/.test(cardTxt1), cardTxt1);
  ok('★对照组：还的那笔 500（xfer）不算进"已花"，卡片显示已花 3000 不是 3500',
     /已花[^）]*3,?000\.00/.test(cardTxt1) && !/已花[^）]*3,?500\.00/.test(cardTxt1), cardTxt1);
  ok('卡片上不再有旧版「清除这行显示」链接（那是给本地显示缓存用的，现在显示真实账目）',
     !cardTxt1.includes('清除这行显示'));

  // ---- 余额0且从没花过的人不出现（懒创建的空账户，理论上不该有，但函数要防得住）----
  await page.evaluate(() => { getOrCreateHoldingAccount('NeverUsed', 'USD'); renderOverview(); });
  const cardTxt2 = await page.textContent('#ov-boss-cash-gift');
  ok('余额0且从没花过的人（NeverUsed）不出现在卡片上', !cardTxt2.includes('NeverUsed'), cardTxt2);

  // ---- 人多时最多显示3个，其余用「等 N 人」带过 ----
  await page.evaluate(() => {
    ['A','B','C','D'].forEach(p => {
      const acc = getOrCreateHoldingAccount(p, 'USD');
      data.transactions.push({ id: uid(), accountId: acc.id, date:'2026-09-01', type:'income',
        amount:100, categoryId:'cat_cash_gift_in', description:'转入', updatedAt: Date.now(), xfer:true });
    });
    saveData(); renderOverview();
  });
  const cardTxt3 = await page.textContent('#ov-boss-cash-gift');
  ok('人多（Kuang+A+B+C+D=5人）时最多显示3个，用"等 N 人"带过',
     /等\s*2\s*人/.test(cardTxt3), cardTxt3);

  ok('无 JS 报错（首段）', errs.length===0, errs);
  await ctx.close();
}

{
  console.log('\n【37】整理旧记录（2026-09-10 二次改版，方向反过来了）：从代管账户搬出去、补配平腿，币种不一致跳过，幂等');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  let dialogCount = 0;
  page.on('dialog', d => { dialogCount++; d.accept(); });
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  // ---- 一开始什么都没有：不弹确认框、给「没有需要整理的」提示 ----
  dialogCount = 0;
  await page.evaluate(()=>openBossCashCleanup());
  ok('一笔都没有时不弹确认框', dialogCount === 0, dialogCount);
  ok('提示「没有需要整理的」', (await page.textContent('#toast')||'').includes('没有需要整理的'));

  // ---- 造旧数据：Kuang 的代管账户（HKD）里还直接躺着 2 笔旧格式真消费（没有 xfer、
  //      没有 staffSpendId——2026-09-10 二次改版之前，消费就是这样直接记进代管账户的），
  //      srcAccountId 指向一个真实 HKD 账户，币种对得上，应该能搬；另造一个 Weird 的
  //      代管账户（USD），srcAccountId 却指向一个 HKD 账户（故意币种不一致），里面 1 笔
  //      旧格式消费，应该被跳过 ----
  const txCountBefore = await page.evaluate(() => {
    const now = Date.now();
    data.accounts.push({ id:'acc_hkd_real', name:'真实HKD账户', currency:'HKD', color:'#999' });
    data.accounts.push({ id:'acc_hkd_other', name:'另一个HKD账户', currency:'HKD', color:'#999' });
    const kuangHold = getOrCreateHoldingAccount('Kuang', 'HKD');
    kuangHold.srcAccountId = 'acc_hkd_real';
    const weirdHold = getOrCreateHoldingAccount('Weird', 'USD');
    weirdHold.srcAccountId = 'acc_hkd_other';   // 故意币种不一致（USD 代管账户 → HKD 真实账户）
    data.transactions.push(
      { id:'oldtx1', accountId: kuangHold.id, date:'2026-08-01', type:'expense', amount:120,
        categoryId:'cat_food', description:'旧记录1', updatedAt: now, fromStaff:{by:'Kuang', at: now} },
      { id:'oldtx2', accountId: kuangHold.id, date:'2026-08-02', type:'expense', amount:80,
        categoryId:'cat_food', description:'旧记录2', updatedAt: now, fromStaff:{by:'Kuang', at: now} },
      { id:'oldtx3', accountId: weirdHold.id, date:'2026-08-03', type:'expense', amount:50,
        categoryId:'cat_food', description:'币种不一致的旧记录', updatedAt: now, fromStaff:{by:'Weird', at: now} }
    );
    saveData();
    return data.transactions.length;
  });

  const kuangHoldId = await page.evaluate(()=>holdingAccountId('Kuang'));
  const weirdHoldId = await page.evaluate(()=>holdingAccountId('Weird'));
  const holdBal = (id) => page.evaluate((i)=>data.transactions.filter(t=>t.accountId===i)
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), id);
  const kuangHoldBalBefore = await holdBal(kuangHoldId);
  const realBalBefore = await page.evaluate(()=>data.transactions.filter(t=>t.accountId==='acc_hkd_real')
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0));

  const scan = await page.evaluate(() => bossCashCleanupScan());
  ok('扫描结果：Kuang 有 2 笔能搬（币种对得上）、0 笔跳过', (() => {
    const g = scan.find(x => x.person === 'Kuang');
    return g && g.move.length === 2 && g.skip.length === 0;
  })(), scan);
  ok('扫描结果：Weird 有 1 笔因为币种不一致被跳过、0 笔能搬', (() => {
    const g = scan.find(x => x.person === 'Weird');
    return g && g.move.length === 0 && g.skip.length === 1;
  })(), scan);

  dialogCount = 0;
  await page.evaluate(()=>openBossCashCleanup());
  ok('有能搬的记录时会弹一次确认框', dialogCount === 1, dialogCount);

  const movedToReal = await page.evaluate(()=>['oldtx1','oldtx2']
    .every(id => data.transactions.find(t=>t.id===id).accountId === 'acc_hkd_real'));
  ok('确认后，2 笔旧记录的 accountId 改成了真实账户（不再是代管账户本身）', movedToReal);
  const oldtx1 = await page.evaluate(()=>data.transactions.find(t=>t.id==='oldtx1'));
  ok('搬走的记录带上了 staffSpendId（等于自己的 id）', oldtx1?.staffSpendId === 'oldtx1', oldtx1);
  const legs1 = await page.evaluate(()=>data.transactions.filter(t=>t.staffSpendId==='oldtx1' && t.id!=='oldtx1'));
  const legs2 = await page.evaluate(()=>data.transactions.filter(t=>t.staffSpendId==='oldtx2' && t.id!=='oldtx2'));
  ok('每笔搬走的记录都补上了 2 条配平腿', legs1.length === 2 && legs2.length === 2, {legs1, legs2});
  ok('配平腿一在真实账户、是收入、xfer', legs1.some(t=>t.accountId==='acc_hkd_real' && t.type==='income' && t.xfer && t.amount===120), legs1);
  ok('配平腿二在代管账户、是支出、xfer', legs1.some(t=>t.accountId===kuangHoldId && t.type==='expense' && t.xfer && t.amount===120), legs1);

  const oldtx3StillInWeirdHold = await page.evaluate((id)=>data.transactions.find(t=>t.id==='oldtx3').accountId===id, weirdHoldId);
  ok('币种不一致的那笔（oldtx3）没被搬走，还在原代管账户里', oldtx3StillInWeirdHold);
  ok('这笔没有 staffSpendId（没搬，也没补配平腿）',
     !(await page.evaluate(()=>data.transactions.find(t=>t.id==='oldtx3').staffSpendId)));
  ok('提示里说明跳过了几笔', (await page.textContent('#toast')||'').includes('1'));

  const txCountAfter = await page.evaluate(()=>data.transactions.length);
  ok('交易条数增加了 4 笔（2 笔搬走的各补 2 条配平腿，原记录不删不增）',
     txCountAfter === txCountBefore + 4, {txCountBefore, txCountAfter});

  const kuangHoldBalAfter = await holdBal(kuangHoldId);
  ok('★ 代管账户余额不变（原本直接记在代管账户里的 −金额，换成配平腿在代管账户里，数字没变）',
     kuangHoldBalAfter === kuangHoldBalBefore, {kuangHoldBalBefore, kuangHoldBalAfter});
  const realBalAfter = await page.evaluate(()=>data.transactions.filter(t=>t.accountId==='acc_hkd_real')
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0));
  ok('★ 真实账户净变化为零（配平腿抵消）', realBalAfter === realBalBefore, {realBalBefore, realBalAfter});

  // 旧记录日期是 2026-08（刻意造的历史数据），不一定落在"这个月"，所以不用 monthTxs
  // 卡当月——直接看这个真实账户的非 xfer 支出总额，验证的是同一件事："以前只有代管
  // 账户自己看得到的这 200，现在这个真实账户的支出视角也看得到了"。
  const realExpTotal = await page.evaluate(()=>data.transactions
    .filter(t=>t.accountId==='acc_hkd_real' && t.type==='expense' && !t.xfer)
    .reduce((s,t)=>s+t.amount,0));
  ok('搬完之后，真实账户的支出明细里多出这 200（120+80，以前只有代管账户自己看得到）',
     realExpTotal === 200, realExpTotal);

  // ---- 重复点第二次：能搬的都搬完了，不会重复搬，给「没有需要整理的」（还有1笔跳过的，提示要带上）----
  dialogCount = 0;
  await page.evaluate(()=>openBossCashCleanup());
  ok('第二次点不弹确认框（没有新的可搬）', dialogCount === 0, dialogCount);
  const toast2 = await page.textContent('#toast');
  ok('第二次点提示「没有需要整理的」，且仍提到跳过的那 1 笔', toast2.includes('没有需要整理的') && toast2.includes('1'), toast2);
  const txCountAfter2ndClick = await page.evaluate(()=>data.transactions.length);
  ok('第二次点没有重复搬（交易条数不再变化）', txCountAfter2ndClick === txCountAfter, {txCountAfter, txCountAfter2ndClick});

  ok('无 JS 报错（整理旧记录段）', errs.length===0, errs);
  await ctx.close();
}

// ---------- 【38】同事重送「以前删过」的记录：跳过，但必须讲出来（2026-09-10）----------
// 用户实际反馈：「kuang上传的单子又少两笔」。原因是这些记录以前在老板这边被删过、
// 留了墓碑（tombstoneTx），同事又送了一次——fetchInbox 认出墓碑就把云端文档丢掉、
// 不重复记账（这是对的，否则删过的会复活），但**一声不吭**：同事送了 5 笔只进 3 笔，
// 用户完全查不出另外 2 笔去哪了。修法不是别丢，而是把笔数报出来。
console.log('\n【38】同事重送「以前删过」的记录：跳过不复活，但要讲出来（不能静默吞掉）');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d => d.accept());
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  await page.evaluate(() => {
    window.__box = { docs: [], deleted: [] };
    window.__put = (id, d) => window.__box.docs.push({
      id, data: () => d, ref: { delete: async () => { window.__box.deleted.push(id); } } });
    cloudAvailable = true;
    currentUser = { uid: 'boss' };
    db = { collection: () => ({ limit: () => ({ get: async () => ({ docs: window.__box.docs }) }) }) };
    tombstoneTx('ix_dead1');            // 以前删过这一笔
    saveData();
  });

  // 同事重送那一笔（srcId 对应已删的 ix_dead1）＋ 一笔全新的（对照组）
  await page.evaluate(() => {
    window.__put('d1', { k:'x', from:'Kuang', tx: JSON.stringify({ srcId:'dead1',
      date:'2026-09-10', amount: 120, type:'expense', categoryId:'cat_food', description:'重送的' }) });
    window.__put('d2', { k:'x', from:'Kuang', tx: JSON.stringify({ srcId:'fresh1',
      date:'2026-09-10', amount: 60, type:'expense', categoryId:'cat_food', description:'新的' }) });
  });
  await page.evaluate(() => fetchInbox({ loud:true }));
  await page.waitForTimeout(500);

  ok('以前删过的那笔没有被复活', !(await page.evaluate(()=>data.transactions.some(t=>t.id==='ix_dead1'))));
  ok('对照组：全新的那笔照样收进来（少了这条对照，「整批都不收」也会全绿）',
     await page.evaluate(()=>data.transactions.some(t=>t.id==='ix_fresh1')));
  const tip = (await page.textContent('#toast')) || '';
  ok('提示里讲明了「有几笔是以前删掉过的记录」，不再静默吞掉',
     tip.includes('以前在这边删掉过') && tip.includes('1 笔'), tip);
  ok('提示里同时报了正常收到的笔数', tip.includes('收到同事记的'), tip);
  ok('无 JS 报错', errs.length===0, errs);
  await ctx.close();
}


// ---------- 【39】同事花代管现金：手算 fixture（转 5000→花 3000）+ 对照组 + 同事删除 3 条腿都消失 ----------
// 2026-09-10 二次改版核心场景：用户明确要求「全部整合去对应的账户里，不然这样账会
// 分开」——同事花的钱不再单独记进代管账户，而是记 3 条腿，明细落进「当初转钱出去的
// 那个真实账户」。这里用用户自己举的例子手算断言，一个数都不许对不上。
console.log('\n【39】同事花代管现金：手算 fixture（转5000→花3000）+ 对照组 + 同事删除 3 条腿一起消失');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d => d.accept());
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  const accBossBalBefore = await page.evaluate(()=>data.transactions.filter(t=>t.accountId==='acc_boss')
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0));

  // ---- 转 5000（直接构造转账两条腿，等同 sendBossCashGift() 的效果，省去走 UI）----
  await page.evaluate(() => {
    const holdAcc = getOrCreateHoldingAccount('Kuang', 'USD');
    holdAcc.srcAccountId = 'acc_boss';
    const now = Date.now();
    data.transactions.push(
      { id: uid(), accountId:'acc_boss', type:'expense', amount:5000, date: today(),
        categoryId:'cat_cash_gift', description:'给 Kuang 的现金', updatedAt: now, giftId:'g39', xfer:true },
      { id: uid(), accountId: holdAcc.id, type:'income', amount:5000, date: today(),
        categoryId:'cat_cash_gift_in', description:'从「主账户」转入', updatedAt: now, giftId:'g39', xfer:true }
    );
    saveData();
  });

  // ---- 花 3000：通过投递箱收件（走真实的 fetchInbox() 路径，不是直接塞 3 条腿）----
  await page.evaluate(() => {
    window.__box = { docs: [], deleted: [] };
    window.__put = (id, d) => window.__box.docs.push({
      id, data: () => d, ref: { delete: async () => { window.__box.deleted.push(id); } } });
    cloudAvailable = true; currentUser = { uid:'boss' };
    db = { collection: () => ({ limit: () => ({ get: async () => ({ docs: window.__box.docs }) }) }) };
    window.__put('spend1', { k:'x', from:'Kuang', tx: JSON.stringify({ srcId:'sp1',
      date: today(), amount: 3000, type:'expense', categoryId:'cat_food', description:'旅行开销' }) });
    // 对照组：没有代管账户的人（NoHoldPerson39）报的账，同一批一起收
    window.__put('spend2', { k:'x', from:'NoHoldPerson39', tx: JSON.stringify({ srcId:'sp2',
      date: today(), amount: 40, type:'expense', categoryId:'cat_food', description:'没代管账户的对照组' }) });
  });
  await page.evaluate(()=>fetchInbox());
  await page.waitForTimeout(300);

  const accBossBalAfterSpend = await page.evaluate(()=>data.transactions.filter(t=>t.accountId==='acc_boss')
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0));
  ok('★ A（acc_boss）净变化只有 −5000（不是 −8000 也不是 −2000）：转账 −5000，花钱那笔 −3000+3000 互相抵消',
     accBossBalAfterSpend === accBossBalBefore - 5000 - 40, // 另外还有对照组那笔真支出 40（没有配平腿）
     { accBossBalBefore, accBossBalAfterSpend });

  const kuangHoldId = await page.evaluate(()=>holdingAccountId('Kuang'));
  const holdBalNow = await page.evaluate((id)=>data.transactions.filter(t=>t.accountId===id)
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), kuangHoldId);
  ok('★ 代管余额 ＝ 2000（5000−3000）', holdBalNow === 2000, holdBalNow);

  const monthExpAccBoss = await page.evaluate(()=>{
    const d = new Date();
    return monthTxs('acc_boss', d.getFullYear(), d.getMonth())
      .filter(t=>t.type==='expense' && !t.xfer).reduce((s,t)=>s+t.amount,0);
  });
  ok('★ 本月支出（acc_boss 视角）＝ 3040（3000 花的 + 40 对照组那笔，转账 5000 不算）',
     monthExpAccBoss === 3040, monthExpAccBoss);

  const spendTx = await page.evaluate(()=>data.transactions.find(t=>t.id==='ix_sp1'));
  ok('★ 那笔消费明细出现在 A（acc_boss）的明细里，不是代管账户', spendTx && spendTx.accountId === 'acc_boss', spendTx);
  ok('这笔明细没有打 xfer（是真支出）', spendTx && !spendTx.xfer, spendTx);
  const spendLegs = await page.evaluate(()=>data.transactions.filter(t=>t.staffSpendId==='ix_sp1'));
  ok('一共 3 条腿，共用同一个 staffSpendId', spendLegs.length === 3, spendLegs);

  // ---- 对照组：没有代管账户的人，只记一笔真支出，没有配平腿 ----
  const noHoldTx = await page.evaluate(()=>data.transactions.find(t=>t.id==='ix_sp2'));
  ok('对照组：没有代管账户的人只记一笔真支出', noHoldTx && !noHoldTx.xfer && !noHoldTx.staffSpendId, noHoldTx);
  ok('对照组：没有任何配平腿', (await page.evaluate(()=>data.transactions.filter(t=>t.staffSpendId==='ix_sp2').length)) === 0);

  // ---- 同事删掉那笔已送出的消费：3 条腿一起消失，每条都落墓碑 ----
  const idsBeforeDelete = spendLegs.map(t=>t.id).concat(['ix_sp1']);
  await page.evaluate(() => {
    window.__put('spend1del', { k:'x', from:'Kuang', tx: JSON.stringify({ op:'delete', srcId:'sp1' }) });
  });
  await page.evaluate(()=>fetchInbox());
  await page.waitForTimeout(300);
  const remaining = await page.evaluate((ids)=>ids.filter(id=>data.transactions.some(t=>t.id===id)),
    [...new Set(idsBeforeDelete)]);
  ok('删除后 3 条腿全部消失（每条都被摘除，不留孤儿配平腿）', remaining.length === 0, remaining);
  const tombIds = await page.evaluate(()=>data.deletedTxIds.map(d=>d.id));
  const uniqueIds = [...new Set(idsBeforeDelete)];
  const allHaveTombstone = uniqueIds.every(id => tombIds.includes(id));
  ok('每一条移除的记录都落了墓碑（云端合并不会把它们复活）', allHaveTombstone, { uniqueIds, tombIds });

  ok('无 JS 报错', errs.length===0, errs);
  await ctx.close();
}

// ---------- 【40】代管账户在界面上一律隐藏（对照组：真实账户照常出现）----------
console.log('\n【40】代管账户不出现在账户列表/切换器/首屏卡片/各下拉里（对照组：真实账户照常出现）');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d => d.accept());
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  await page.evaluate(() => {
    const holdAcc = getOrCreateHoldingAccount('HideMe40', 'USD');
    data.transactions.push({ id: uid(), accountId: holdAcc.id, type:'income', amount:100,
      date: today(), categoryId:'cat_cash_gift_in', updatedAt: Date.now(), xfer:true });
    saveData();
    renderOverview();
    renderSettings();
  });

  const accCardsTxt = await page.innerText('#acc-cards-row');
  ok('首屏账户卡片：不出现代管账户（名字含"手上"）', !accCardsTxt.includes('手上'), accCardsTxt);
  ok('（对照组）首屏账户卡片：真实账户（acc_boss）照常出现', accCardsTxt.includes('acc_boss') || /US\$/.test(accCardsTxt), accCardsTxt);

  await page.evaluate(()=>switchTab('settings'));
  const settingsTxt = await page.innerText('#settings-accs');
  ok('设置页账户管理列表：不出现代管账户', !settingsTxt.includes('手上'), settingsTxt);
  ok('（对照组）设置页账户管理列表：真实账户照常出现',
     (await page.evaluate(()=>data.accounts.filter(a=>!a.isHolding).length)) > 0 && settingsTxt.length > 0, settingsTxt);

  await page.evaluate(()=>openAccSwitch());
  await page.waitForTimeout(150);
  const switchTxt = await page.innerText('#acc-switch-list');
  ok('账户切换器：不出现代管账户', !switchTxt.includes('手上'), switchTxt);
  await page.evaluate(()=>closeModal('modal-acc-switch'));

  const recAccOptions = await page.evaluate(()=>{
    showModal('modal-add-recurring');
    return Array.from(document.querySelectorAll('#rec-acc option')).map(o=>o.value);
  });
  const holdAccId40 = await page.evaluate(()=>holdingAccountId('HideMe40'));
  ok('月固定开销账户下拉：不含代管账户', !recAccOptions.includes(holdAccId40), recAccOptions);
  ok('（对照组）月固定开销账户下拉：含真实账户', recAccOptions.includes('acc_boss'), recAccOptions);
  await page.evaluate(()=>closeModal('modal-add-recurring'));

  await page.evaluate(()=>{ switchTab('settings'); renderInboxSettings(); });
  const inboxAccOptions = await page.evaluate(()=>Array.from(document.querySelectorAll('#inbox-acc-select option')).map(o=>o.value));
  ok('投递箱默认收件账户下拉：不含代管账户', !inboxAccOptions.includes(holdAccId40), inboxAccOptions);
  ok('（对照组）投递箱默认收件账户下拉：含真实账户', inboxAccOptions.includes('acc_boss'), inboxAccOptions);

  // ---- 防御性闸门：即使硬调也切不进代管账户/选不中代管账户 ----
  const curBefore = await page.evaluate(()=>data.currentAccountId);
  await page.evaluate((id)=>switchAccount(id), holdAccId40);
  ok('switchAccount() 挡住代管账户 id，currentAccountId 不变',
     (await page.evaluate(()=>data.currentAccountId)) === curBefore);
  await page.evaluate((id)=>setInboxAccount(id), holdAccId40);
  ok('setInboxAccount() 挡住代管账户 id，不写进 localStorage',
     (await page.evaluate(()=>localStorage.getItem('expenseTracker_inboxAccount'))) !== holdAccId40);
  await page.evaluate((id)=>saveBossCashGiftAccount(id), holdAccId40);
  ok('saveBossCashGiftAccount() 挡住代管账户 id，不写进 localStorage',
     (await page.evaluate(()=>localStorage.getItem('expenseTracker_bossCashGiftAccount'))) !== holdAccId40);

  // ---- ensureCurrentAccountUsable()：老状态停在代管账户上的要收口回真实账户 ----
  await page.evaluate((id) => { data.currentAccountId = id; ensureCurrentAccountUsable(); }, holdAccId40);
  ok('ensureCurrentAccountUsable() 把停在代管账户上的 currentAccountId 收口回真实账户',
     (await page.evaluate((id)=>data.currentAccountId !== id && !getAcc(data.currentAccountId).isHolding, holdAccId40)));

  ok('无 JS 报错', errs.length===0, errs);
  await ctx.close();
}

// ---------- 【41】转钱给同事之前先抵掉他垫付的旧欠款（+ 对照组 + 撤回 + 重算旧数据）----------
// 用户真实数据：转 5000 之前 Kuang 已经自己垫付过 189，要求转完之后欠款归零、
// 代管现金是 4811（不是 5000）。
console.log('\n【41】转钱先抵欠款：手算 fixture（欠189转5000）+ 两组对照 + 撤回还原 + 旧数据重算');
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e=>errs.push(e.message));
  page.on('dialog', d => d.accept());
  await ctx.route('**/*', r => r.request().url().startsWith(`http://localhost:${PORT}`)
    ? r.continue() : r.abort('failed'));
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await until(() => page.evaluate(
    () => typeof data !== 'undefined' && Array.isArray(data.accounts) && data.accounts.length > 0),
    { what: 'App 启动完成' });

  await page.evaluate(() => {
    localStorage.setItem('expenseTracker_bossCashKey', 'pass-1234');
    cloudAvailable = true; currentUser = { uid:'boss' };
    window.__gifts = [];
    window.__giftSeq = 0;
    // 每次 add() 都要给不同的 doc id——同一个 id 会让不同人的转账共用一个 giftId，
    // 撤回一笔会连带误删别人的（这里特地测多个人的转账，必须给不同 id）。
    db = { collection: (c) => ({ add: async (p) => { window.__gifts.push({c,p});
      window.__giftSeq++; return {id:'g41_' + window.__giftSeq}; } }) };
  });

  const accBossBalBefore41 = await page.evaluate(()=>data.transactions.filter(t=>t.accountId==='acc_boss')
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0));

  // ---- 欠 189：Kuang 自己垫付的一笔真支出（记在 acc_boss，不是代管账户）----
  await page.evaluate(() => {
    data.transactions.push({ id:'debt189', accountId:'acc_boss', type:'expense', amount:189,
      date: today(), categoryId:'cat_other_exp', description:'Kuang 垫付的车费',
      updatedAt: Date.now(), fromStaff:{ by:'Kuang', at: Date.now() } });
    saveData();
  });
  const owedBefore = await page.evaluate(()=>inboxOwedByPerson().find(r=>r.who==='Kuang'));
  ok('转账前，Kuang 欠款 189', owedBefore && owedBefore.total === 189, owedBefore);

  await page.click('#ov-boss-cash-gift');
  await page.waitForTimeout(150);
  await page.selectOption('#boss-cash-gift-acc', 'acc_boss');
  await page.selectOption('#boss-cash-gift-person', 'Kuang');
  await page.fill('#boss-cash-gift-amount', '5000');
  await page.evaluate(()=>sendBossCashGift());
  await page.waitForTimeout(250);

  const sentPayload41 = await page.evaluate(()=>window.__gifts[0]?.p);
  ok('★ Firestore 记的是净额 4811（5000-189），不是原始输入 5000', sentPayload41?.amount === 4811, sentPayload41);
  ok('Firestore 带上 offsetTxIds，记着抵了哪几笔', Array.isArray(sentPayload41?.offsetTxIds) && sentPayload41.offsetTxIds.includes('debt189'), sentPayload41);

  const owedAfter = await page.evaluate(()=>inboxOwedByPerson().find(r=>r.who==='Kuang'));
  ok('★ 欠款归零（debt189 已标记已付，「该付同事」名单里没有 Kuang 了）', !owedAfter, owedAfter);
  const kuangHoldId41 = await page.evaluate(()=>holdingAccountId('Kuang'));
  const kuangHoldBal41 = await page.evaluate((id)=>data.transactions.filter(t=>t.accountId===id)
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), kuangHoldId41);
  ok('★ 代管现金是 4811，不是 5000', kuangHoldBal41 === 4811, kuangHoldBal41);
  const accBossBalAfter41 = await page.evaluate(()=>data.transactions.filter(t=>t.accountId==='acc_boss')
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0));
  ok('★ 来源账户这次只减少 4811（189 之前已经扣过了，不能再扣一次）',
     accBossBalAfter41 === accBossBalBefore41 - 189 - 4811, { accBossBalBefore41, accBossBalAfter41 });
  const monthExpAfter41 = await page.evaluate(()=>{
    const d = new Date();
    return monthTxs('acc_boss', d.getFullYear(), d.getMonth())
      .filter(t=>t.type==='expense' && !t.xfer).reduce((s,t)=>s+t.amount,0);
  });
  ok('支出统计没有因为这次转账再增加（189 那笔早就算过一次了，转账本身是 xfer）',
     monthExpAfter41 === 189, monthExpAfter41);

  // ---- 对照组一：不欠钱的人，转账拿满整额，没有任何 paidAt 被标记 ----
  await page.selectOption('#boss-cash-gift-person', 'Seryi');
  await page.fill('#boss-cash-gift-amount', '5000');
  await page.evaluate(()=>sendBossCashGift());
  await page.waitForTimeout(250);
  const seryiSent = await page.evaluate(()=>window.__gifts[window.__gifts.length-1]?.p);
  ok('对照组一：不欠钱时净额等于原始输入 5000', seryiSent?.amount === 5000, seryiSent);
  ok('对照组一：没有 offsetTxIds', !seryiSent?.offsetTxIds, seryiSent);
  const seryiHoldId41 = await page.evaluate(()=>holdingAccountId('Seryi'));
  const seryiHoldBal41 = await page.evaluate((id)=>data.transactions.filter(t=>t.accountId===id)
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0), seryiHoldId41);
  ok('对照组一：代管拿到整整 5000', seryiHoldBal41 === 5000, seryiHoldBal41);

  // ---- 对照组二：欠得比转账金额还多（欠 6500：4000+2500 两笔），只转 5000 ----
  //      逐笔累加到不超过 5000：4000 可以（累计4000），再加 2500 会到 6500 超过 5000，
  //      整段停手——只抵 4000，2500 那笔还欠着，不拆单笔 ----
  await page.evaluate(() => {
    data.transactions.push(
      { id:'debtA', accountId:'acc_boss', type:'expense', amount:4000, date:'2026-01-01',
        categoryId:'cat_other_exp', description:'垫付A（较旧）', updatedAt: Date.now(),
        fromStaff:{ by:'DebtHeavy41', at: 1 } },
      { id:'debtB', accountId:'acc_boss', type:'expense', amount:2500, date:'2026-02-01',
        categoryId:'cat_other_exp', description:'垫付B（较新）', updatedAt: Date.now(),
        fromStaff:{ by:'DebtHeavy41', at: 2 } }
    );
    saveData();
  });
  // 「给谁」下拉只认公司报账名册（Seryi/Kuang/Yang），DebtHeavy41 这个名字选不到——
  // 这里直接调算法本身（pickDebtOffset 是纯函数，不改任何数据），端到端走 UI 的部分
  // 已经在上面 Kuang（欠 189 转 5000）和 Seryi（不欠钱）两个场景里覆盖过了。
  const r = await page.evaluate(() => {
    const unpaid = unpaidDebtTxs('DebtHeavy41', 'USD');
    return { picked: unpaid.map(t=>t.id), result: pickDebtOffset(unpaid, 5000) };
  });
  ok('对照组二：只抵 4000（较旧那笔 debtA），不拆单笔、不超额',
     r.result.total === 4000 && r.result.picked.length === 1 && r.result.picked[0].id === 'debtA', r);
  ok('对照组二：不会跳过较旧的去选较新的、也不会两笔都选（6500 超过 5000）',
     r.picked.length === 2 && r.picked.includes('debtA') && r.picked.includes('debtB'), r);

  // ---- 撤回 Kuang 那笔转账：欠款要还原成 189，paidAt 被清掉 ----
  await page.evaluate(()=>closeModal('modal-boss-cash-gift'));
  await page.click('#ov-boss-cash-gift');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    db = { collection: (c) => ({
      doc: () => ({ delete: async () => {} }),
      where: () => ({ orderBy: () => ({ limit: () => ({ get: async () => ({ empty:true, docs:[] }) }) }) }),
    }) };
    bossCashGiftRecentCache['g41_1'] = { person:'Kuang', amount:4811, currency:'USD',
      offsetTxIds:['debt189'], offsetTotal:189 };
  });
  await page.evaluate(()=>deleteBossCashGift('g41_1'));
  await page.waitForTimeout(250);
  const debt189After = await page.evaluate(()=>data.transactions.find(t=>t.id==='debt189'));
  ok('撤回后，debt189 的 paidAt 被清掉（欠款恢复未付）', debt189After && !debt189After.fromStaff.paidAt, debt189After);
  const owedAfterUndo = await page.evaluate(()=>inboxOwedByPerson().find(r=>r.who==='Kuang'));
  ok('撤回后，「该付同事」名单里 Kuang 的欠款恢复成 189', owedAfterUndo && owedAfterUndo.total === 189, owedAfterUndo);

  // ---- 旧数据重算：模拟改版之前已经转出去的钱（代管里有余额，但对应欠款还没抵）----
  await page.evaluate(() => {
    const holdAcc = getOrCreateHoldingAccount('OldGift41', 'USD');
    data.transactions.push(
      { id:'oldgiftIn', accountId: holdAcc.id, type:'income', amount:1000, date:'2026-01-01',
        categoryId:'cat_cash_gift_in', description:'改版前转的', updatedAt: Date.now(), xfer:true },
      { id:'oldDebt41', accountId:'acc_boss', type:'expense', amount:300, date:'2026-01-01',
        categoryId:'cat_other_exp', description:'改版前的垫付', updatedAt: Date.now(),
        fromStaff:{ by:'OldGift41', at: 1 } }
    );
    saveData();
  });
  const holdBalBeforeRecalc = await page.evaluate(()=>{
    const id = holdingAccountId('OldGift41');
    return data.transactions.filter(t=>t.accountId===id).reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0);
  });
  const accBossBalBeforeRecalc = await page.evaluate(()=>data.transactions.filter(t=>t.accountId==='acc_boss')
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0));
  const txCountBeforeRecalc = await page.evaluate(()=>data.transactions.length);

  const scan41 = await page.evaluate(()=>bossDebtRecalcScan());
  ok('重算预览：OldGift41 有 1 笔共 300', (() => {
    const g = scan41.find(x=>x.person==='OldGift41');
    return g && g.picked.length === 1 && g.total === 300;
  })(), scan41);

  await page.evaluate(()=>openBossDebtRecalc());
  await page.waitForTimeout(150);
  const oldDebtAfter = await page.evaluate(()=>data.transactions.find(t=>t.id==='oldDebt41'));
  ok('重算后，oldDebt41 标记已付', oldDebtAfter && !!oldDebtAfter.fromStaff.paidAt, oldDebtAfter);
  const holdBalAfterRecalc = await page.evaluate(()=>{
    const id = holdingAccountId('OldGift41');
    return data.transactions.filter(t=>t.accountId===id).reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0);
  });
  ok('★ 重算前后代管余额不变（只改 paidAt，不碰交易）', holdBalAfterRecalc === holdBalBeforeRecalc, { holdBalBeforeRecalc, holdBalAfterRecalc });
  const accBossBalAfterRecalc = await page.evaluate(()=>data.transactions.filter(t=>t.accountId==='acc_boss')
    .reduce((s,t)=>t.type==='income'?s+t.amount:s-t.amount,0));
  ok('★ 重算前后来源账户余额也不变', accBossBalAfterRecalc === accBossBalBeforeRecalc, { accBossBalBeforeRecalc, accBossBalAfterRecalc });
  const txCountAfterRecalc = await page.evaluate(()=>data.transactions.length);
  ok('重算不新增/删除任何交易', txCountAfterRecalc === txCountBeforeRecalc, { txCountBeforeRecalc, txCountAfterRecalc });

  // ---- 重复点：已经没有可重算的了 ----
  const scan41b = await page.evaluate(()=>bossDebtRecalcScan());
  ok('第二次扫描：没有 OldGift41 了（已经处理过）', !scan41b.some(g=>g.person==='OldGift41'), scan41b);

  ok('无 JS 报错', errs.length===0, errs);
  await ctx.close();
}

await browser.close();
console.log(`\n${fails.length ? '不通过' : '通过'}：${pass} 项通过 / ${fails.length} 项失败`);
if (fails.length) { fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
