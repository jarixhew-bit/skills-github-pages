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

  await page.fill('#tx-amount', '12.34');
  await page.fill('#tx-desc', '跟客户午餐');
  await page.selectOption('#tx-company-category', 'Lunch');
  await page.selectOption('#tx-company-reporter', 'Seryi');
  await page.fill('#tx-company-reftag', '7');
  const _sent1 = posted.length;
  await page.evaluate(()=>saveTx());
  await until(() => posted.length > _sent1, { what: '这一笔送到服务端' });
  await page.waitForTimeout(120);   // 让 App 把服务端回应写回本机记录
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
  await page.waitForTimeout(120);   // 让 App 把服务端回应写回本机记录
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
  await page.waitForTimeout(120);   // 让 App 把服务端回应写回本机记录
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
  await page.waitForTimeout(120);   // 让 App 把服务端回应写回本机记录
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
  await page.waitForTimeout(120);   // 让 App 把服务端回应写回本机记录
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
  await page.waitForTimeout(120);   // 让 App 把服务端回应写回本机记录
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
    await page.waitForTimeout(120);   // 让 App 把服务端回应写回本机记录
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
    await page.waitForTimeout(120);   // 让 App 把服务端回应写回本机记录
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
    await page.waitForTimeout(120);   // 让 App 把服务端回应写回本机记录
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
  ok('无 JS 报错', errs.length === 0, errs.slice(0,3));
  await ctx.close();
}

await browser.close();
console.log(`\n${fails.length ? '不通过' : '通过'}：${pass} 项通过 / ${fails.length} 项失败`);
if (fails.length) { fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
