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
  const serverBook = []; let recSeq = 0;   // 假的公司账本，用来验证删除真的删到了远端
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`http://localhost:${PORT}`)) return route.continue();
    if (u.startsWith(BUTLER)) {
      if (butlerMode === 'offline') return route.abort('failed');
      const h = { 'Access-Control-Allow-Origin': '*' };
      if (route.request().method() === 'GET')
        return route.fulfill({ status:200, contentType:'application/json', headers:h,
          body: JSON.stringify({
            categories:['Beverage','Car Wash','Dinner','Lunch','Petrol','Postage','Store'],
            plateCategories:['Car Wash','Petrol'],
            // 人员名册由服务端给（butler 的 config/people.json），App 的下拉框照它渲染
            people:[
              {code:'Boss', label:'Boss（老板自己）'},
              {code:'Seryi', label:'Seryi', ownMeals:['Breakfast','Lunch','Dinner']},
              {code:'Kuang', label:'Kuang', ownMeals:['Breakfast','Lunch']},
              {code:'Yang', label:'Yang', ownMeals:['Breakfast','Lunch','Dinner']},
            ],
          }) });
      const req = JSON.parse(route.request().postData() || '{}');
      posted.push(req);
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
      const mine = (OWN_MEALS[rep] || []).includes(cat);
      const person = mine ? rep : 'Boss';
      const id = 'rec' + (++recSeq);
      // 照 butler 的规则派号：一个月从 1 排到底，左右两张表分开排
      const table = person === 'Boss' ? 'boss' : 'assist';
      const refTag = req.items?.[0]?.refTag
        || String(serverBook.filter(r => r.table === table).length + 1);
      serverBook.push({ id, person, table, refTag, amount: req.items?.[0]?.amount });
      return route.fulfill({ status:200, contentType:'application/json', headers:h,
        body: JSON.stringify({ status:'ok', records:[{id, person, refTag}], total:0 }) });
    }
    return route.abort('failed');
  });
  const errs = []; page.on('pageerror', e => errs.push(e.message));

  console.log('【1】所有外部网域被挡时，App 仍能完整启动');
  await page.goto(URL, { waitUntil:'domcontentloaded' });
  await page.waitForTimeout(2500);
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

  console.log('\n【3】类别清单来自服务端，不是 App 里硬编的');
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForTimeout(2000);
  const cats = await page.evaluate(()=>getCompanyCats());
  ok('拿到服务端返回的类别（含用户教过的自定义类别）', cats.includes('Car Wash') && cats.includes('Postage'), cats);
  // 车牌类也要在清单里——只能回 Telegram 记的话，App 里公司账户的合计会少一块
  ok('含车牌类（Petrol / Car Wash）', cats.includes('Petrol') && cats.includes('Car Wash'), cats);
  ok('车牌类清单也是服务端给的，不是 App 判断的',
     JSON.stringify(await page.evaluate(()=>getCompanyPlateCats()))===JSON.stringify(['Car Wash','Petrol']),
     await page.evaluate(()=>getCompanyPlateCats()));

  console.log('\n【4】记一笔公司账 —— 送出去的内容必须原样，不能在本地算');
  await page.evaluate(()=>showAddTx());
  await page.waitForTimeout(600);
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
  ok('下拉框照服务端名册渲染（Boss + 3 位同事）',
     JSON.stringify(repOpts.map(o=>o.v))===JSON.stringify(['Boss','Seryi','Kuang','Yang']), repOpts);
  ok('Boss 排第一且标注是老板自己', repOpts[0].t.includes('老板自己'), repOpts[0]);
  // 括号里标出各人哪几餐算自己，省得用户去记规则；Kuang 只有早/午，不能写成早/午/晚
  ok('Seryi 标注早/午/晚餐', repOpts[1].t.includes('自己的 早/午/晚餐进右表'), repOpts[1]);
  ok('Kuang 标注早/午餐（不是三餐）',
     repOpts[2].t.includes('自己的 早/午餐进右表') && !repOpts[2].t.includes('晚'), repOpts[2]);
  ok('Boss 不带餐别标注（他没有 ownMeals）', !repOpts[0].t.includes('进右表'), repOpts[0]);

  await page.fill('#tx-amount', '12.34');
  await page.fill('#tx-desc', '跟客户午餐');
  await page.selectOption('#tx-company-category', 'Lunch');
  await page.selectOption('#tx-company-reporter', 'Seryi');
  await page.fill('#tx-company-reftag', '7');
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1500);
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
  await page.waitForTimeout(500);
  await page.fill('#tx-amount', '6.60');
  await page.selectOption('#tx-company-category', 'Dinner');
  await page.selectOption('#tx-company-reporter', 'Boss');
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1500);
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
  await page.waitForTimeout(500);
  await page.fill('#tx-amount', '10');
  await page.selectOption('#tx-company-category', 'Lunch');
  await page.evaluate(()=>{ document.getElementById('tx-company-reftag').value = 'A1'; });
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1000);
  ok('非数字编号被挡下，什么都没送出', posted.length===0, posted);
  ok('这笔也没被存进本机（保存整个中止）',
     !(await page.evaluate(()=>data.transactions.some(t=>t.amount===10 && t.company))));
  await page.evaluate(()=>{ document.getElementById('tx-company-reftag').value = '12'; });
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1500);
  ok('改成合法编号后正常送出', posted.length===1, posted.length);
  ok('编号原样送到服务端', posted[0]?.items?.[0]?.refTag==='12', posted[0]?.items?.[0]);
  await page.evaluate(()=>closeModal('modal-add-tx'));

  console.log('\n【4c】车牌类项目：选了才出现车牌栏，没填不准送出');
  posted = [];
  await page.evaluate(()=>showAddTx());
  await page.waitForTimeout(500);
  ok('一般类别下车牌栏是藏着的', !(await page.locator('#tx-company-plate-wrap').isVisible()));
  await page.selectOption('#tx-company-category', 'Petrol');
  await page.waitForTimeout(300);
  ok('选了汽油，车牌栏出现', await page.locator('#tx-company-plate-wrap').isVisible());
  await page.fill('#tx-amount', '60');
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1000);
  ok('没填车牌不准送出', posted.length===0, posted);
  await page.fill('#tx-company-plate', 'ns6868');
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1500);
  ok('填了车牌就送得出去', posted.length===1, posted.length);
  ok('车牌转成大写送出', posted[0]?.items?.[0]?.plate==='NS6868', posted[0]?.items?.[0]);
  ok('类别原样送出（拼接交给 butler）', posted[0]?.items?.[0]?.categoryRaw==='Petrol', posted[0]?.items?.[0]);
  // 保存成功后弹窗会自动关闭，重开一个再验「换类别时车牌栏跟着收起」
  await page.evaluate(()=>showAddTx());
  await page.waitForTimeout(500);
  await page.selectOption('#tx-company-category', 'Petrol');
  await page.waitForTimeout(300);
  ok('重开后选汽油，车牌栏还是会出现', await page.locator('#tx-company-plate-wrap').isVisible());
  await page.selectOption('#tx-company-category', 'Lunch');
  await page.waitForTimeout(300);
  ok('换回一般类别，车牌栏收起来', !(await page.locator('#tx-company-plate-wrap').isVisible()));
  await page.evaluate(()=>closeModal('modal-add-tx'));

  console.log('\n【4b】同一个人报的非正餐要算到 Boss 头上（Excel 换到左边）');
  posted = [];
  await page.evaluate(()=>showAddTx());
  await page.waitForTimeout(500);
  await page.fill('#tx-amount', '20');
  await page.selectOption('#tx-company-category', 'Store');
  await page.selectOption('#tx-company-reporter', 'Seryi');
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1500);
  const txStore = await page.evaluate(()=>data.transactions[data.transactions.length-1]);
  ok('reporter 仍原样送出 Seryi', posted[0]?.reporter==='Seryi', posted[0]?.reporter);
  ok('但 person 是服务端算的 Boss（→ Excel 左边）', txStore?.company?.person==='Boss', txStore?.company);

  console.log('\n【5】送不出去时不能丢账：进队列，恢复后补送');
  butlerMode = 'offline'; posted = [];
  await page.evaluate(()=>showAddTx());
  await page.waitForTimeout(500);
  await page.fill('#tx-amount', '5.60');
  await page.selectOption('#tx-company-category', 'Store');
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1500);
  ok('进了待送队列', (await page.evaluate(()=>JSON.parse(localStorage.getItem('expenseTracker_companyQueue')||'[]'))).length===1);
  const tx2 = await page.evaluate(()=>data.transactions[data.transactions.length-1]);
  ok('本机记录标成 pending', tx2?.company?.status==='pending', tx2?.company);
  ok('金额没丢', tx2?.amount===5.6, tx2?.amount);
  butlerMode = 'ok';
  await page.evaluate(()=>flushCompanyQueue({loud:true}));
  await page.waitForTimeout(1500);
  ok('恢复后队列清空', (await page.evaluate(()=>JSON.parse(localStorage.getItem('expenseTracker_companyQueue')||'[]'))).length===0);
  ok('补送的正是那笔 5.60 Store', posted.some(x=>x.items?.[0]?.amount===5.6 && x.items?.[0]?.categoryRaw==='Store'), posted);

  console.log('\n【5b】编辑已送出的公司账，绝不能重复送（butler 是追加落档，会金额翻倍）');
  posted = [];
  const sentId = await page.evaluate(()=>{
    const t = data.transactions.filter(x=>x.company && x.company.status==='sent').pop();
    return t ? t.id : null;
  });
  ok('找得到一笔已送出的公司账', !!sentId, sentId);
  await page.evaluate(id=>editTx(id), sentId);
  await page.waitForTimeout(600);
  await page.fill('#tx-amount', '99.99');          // 改金额后重新保存
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1500);
  ok('没有再送一次（不会重复记账）', posted.length===0, posted);
  ok('本机金额已更新', await page.evaluate(id=>data.transactions.find(t=>t.id===id)?.amount===99.99, sentId));
  ok('状态仍是 sent（没退回 pending）', await page.evaluate(id=>data.transactions.find(t=>t.id===id)?.company?.status==='sent', sentId));
  ok('也没混进补送队列', (await page.evaluate(()=>JSON.parse(localStorage.getItem('expenseTracker_companyQueue')||'[]'))).length===0);

  console.log('\n【5c】App 里删记录会同步删掉公司账本那条');
  page.on('dialog', d => d.accept());   // 删除确认弹窗一律确定
  posted = [];
  await page.evaluate(()=>showAddTx());
  await page.waitForTimeout(500);
  await page.fill('#tx-amount', '33.33');
  await page.selectOption('#tx-company-category', 'Dinner');
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1500);
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
  await page.waitForTimeout(500);
  await page.fill('#tx-amount', '44.44');
  await page.selectOption('#tx-company-category', 'Dinner');
  await page.evaluate(()=>saveTx());
  await page.waitForTimeout(1500);
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
  await page.waitForTimeout(500);
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
  await page.waitForTimeout(2500);
  console.log('\n【7】Firebase SDK 正常时，云同步照常初始化');
  const st = await page.evaluate(()=>({a:cloudAvailable, auth:!!auth, db:!!db, fb:window.__fb}));
  ok('cloudAvailable = true', st.a===true, st);
  ok('auth / db 都拿到', st.auth && st.db, st);
  ok('initializeApp 调用 1 次', st.fb.init===1, st.fb);
  ok('登录状态监听照常注册', st.fb.authCbs===1, st.fb);
  ok('无 JS 报错', errs.length===0, errs.slice(0,3));
  await ctx.close();
}

await browser.close();
console.log(`\n${fails.length ? '不通过' : '通过'}：${pass} 项通过 / ${fails.length} 项失败`);
if (fails.length) { fails.forEach(f=>console.log('  - '+f)); process.exit(1); }
