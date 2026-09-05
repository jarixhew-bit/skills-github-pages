/**
 * 老板 App 自检 —— **后半**（场景十九 ~ 场景三十六）：交接红点重置、机票/酒店识别、
 * 行程排序、账单已读、推送、请假、备忘、餐厅、分享、链接带访问码、账单金额。
 *
 * 共用的打桩接口与假数据在 tools/lib/boss-check-kit.mjs；前半在 check-boss.mjs。
 * 拆开只是为了并行跑，**两份加起来的断言数必须跟拆之前一样**。
 *
 * 跑法：
 *   python3 -m http.server 8899 &
 *   CHROMIUM_PATH=/opt/pw-browsers/chromium node tools/check-boss-2.mjs
 */
import {
  URL, GOOD_TOKEN, ok, until, browser, forceZh, mountRoutes, clickHere, gotoTab,
  fakeTrips, fakeBills, fakeBillsMixed, fakeRestaurants, fakeMemosAdmin, fakeMemosBoss,
  fakeInventory, finish,
} from './lib/boss-check-kit.mjs';

// ---------- 场景十九：交接给老板时，红点要全部重新亮起来 ----------
// 2026-08-29 用户：「把他的那一版改成全未读」。老板那台机器试用时已经把红点点掉了，
// 交接时他一进来会以为里面没东西。做法是给已读记号加一个版号（SEEN_EPOCH），
// 版号一改，所有设备的已读状态作废一次。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  // 装一份「旧版号」的已读记号：三个分页全标成已读，而且时间比服务端还新
  await page.addInitScript(t => {
    localStorage.setItem('bossApp_token', t);
    localStorage.setItem('bossApp_seen', JSON.stringify({
      __epoch: '2020-01-01', trips: '2099-01-01T00:00:00.000Z',
      bills: '2099-01-01T00:00:00.000Z', inventory: '2099-01-01T00:00:00.000Z',
      restaurants: '2099-01-01T00:00:00.000Z',
    }));
  }, GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !!document.querySelector('.trip-card, .empty-card')),
    { what: '首屏渲染完' });

  console.log('\n【红点重置】');
  ok('旧版号的已读记号一律作废，四个分页全部重新变成未读（含餐厅）',
     await page.locator('.nav-btn.has-dot').count() === 4);

  // 双向验证，都在同一页里做——「更新时间」在打桩接口里每次请求都是当下，
  // 所以不能靠「重开一次」来验已读，只能拿页面自己那份 feedData 的时间来比。
  const both = await page.evaluate(() => {
    const u = feedData.updated;
    saveSeen({ trips: u.trips, bills: u.bills, inventory: u.inventory, restaurants: u.restaurants }); // 会带上当前版号
    updateDots();
    const afterRead = document.querySelectorAll('.nav-btn.has-dot').length;
    const stored = JSON.parse(localStorage.getItem('bossApp_seen') || '{}');
    // 把版号改旧，模拟「下一次交接又要重置」
    localStorage.setItem('bossApp_seen',
      JSON.stringify(Object.assign({}, stored, { __epoch: '2020-01-01' })));
    updateDots();
    return { afterRead, afterEpochChange: document.querySelectorAll('.nav-btn.has-dot').length,
             epoch: stored.__epoch || null };
  });
  // 对照组：没有这一条的话，「loadSeen 永远返回 {}」也能让上面那条变绿——
  // 那样红点就永远消不掉，等于天天在喊狼来了。
  ok('版号对得上时，已读还是已读（红点消得掉）', both.afterRead === 0, both);
  ok('版号一改，四个红点立刻全部重新亮起来', both.afterEpochChange === 4, both);
  ok('写回去的是当前版号，不是那个旧的', both.epoch && both.epoch !== '2020-01-01', both);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十：丢酒店确认单进来也能建行程 ----------
// 2026-08-29 用户：「丢酒店 check in voucher 也能识别」。
// 两条不许破的规矩在这里各有断言：
//   ① 时间不猜——单子没写入住时间就空着，绝不按常识填 15:00（填错了他会吃闭门羹）
//   ② 提到地点必须带地图链接（本仓库硬规矩）
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin', ticketParseResult: {
    status: 'ok', title: '新加坡小旅行', start: '2026-09-23', end: '2026-09-27',
    legs: [],
    stays: [
      { name: 'Marina Bay Sands', address: '10 Bayfront Ave, Singapore',
        check_in: '2026-09-23', check_out: '2026-09-27',
        check_in_time: '15:00', check_out_time: null,
        confirmation: 'ABC12345', room: 'Deluxe King' },
    ],
  } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await page.setInputFiles('#admin-ticket-input', {
    name: 'hotel.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake voucher'),
  });
  await until(() => page.evaluate(() =>
    adminTripsDraft && adminTripsDraft.length && adminTripsDraft[adminTripsDraft.length-1].items.length >= 2),
    { what: '酒店建出入住/退房两条' });

  const trip = await page.evaluate(() => adminTripsDraft[adminTripsDraft.length - 1]);
  console.log('\n【酒店确认单】');
  ok('一段住宿建出「入住」「退房」两条', trip.items.length === 2, trip.items.map(i => i.title.zh));
  const ci = trip.items.find(i => /入住/.test(i.title.zh)) || {};
  const co = trip.items.find(i => /退房/.test(i.title.zh)) || {};
  ok('入住那条日期是入住日', ci.date === '2026-09-23', ci);
  ok('退房那条日期是退房日', co.date === '2026-09-27', co);
  ok('标题带上酒店名', /Marina Bay Sands/.test(ci.title.zh), ci.title);
  ok('单子写了入住时间就用它', ci.time === '15:00', ci);
  // ① 不猜：单子没写退房时间 → 留空，而不是自作主张填 12:00
  ok('单子没写退房时间就留空，不按常识填 12:00', co.time === '', co);
  // ② 地图链接（仓库硬规矩）
  ok('入住那条带 Google 地图链接',
     /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/.test(ci.mapUrl || ''), ci.mapUrl);
  ok('地图链接里带了酒店名和地址', /Marina/.test(decodeURIComponent(ci.mapUrl || ''))
     && /Bayfront/.test(decodeURIComponent(ci.mapUrl || '')), ci.mapUrl);
  ok('退房那条也带地图链接（他退房当天可能还要回去拿行李）', !!co.mapUrl, co.mapUrl);
  ok('确认号和房型放进备注（前台要用）',
     /ABC12345/.test(ci.note.zh) && /Deluxe King/.test(ci.note.zh), ci.note);
  ok('行程起讫按住宿算', trip.start === '2026-09-23' && trip.end === '2026-09-27', trip);
  // 没有航班就不该去打航班接口——那要花 AeroDataBox 额度
  ok('纯酒店单不去查航班接口（省额度）',
     rec.calls.every(c => c.action !== 'flightLookup'), rec.calls.map(c => c.action));
  const status = await page.locator('#admin-ticket-status').innerText();
  ok('状态栏点明「没写时间的有几条，要自己补」', /没写时间/.test(status), status);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}
// ---------- 场景二十之对照组：机票＋酒店混在一起时，两边都要建出来 ----------
// 只验纯酒店的话，「把航班那段代码删了」也能绿。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin', ticketParseResult: {
    status: 'ok', title: '混合行程', start: '2026-09-23', end: '2026-09-27',
    legs: [{ flight_no: 'SQ157', date: '2026-09-23', from: 'KTI', to: 'SIN', dep_time: '18:55', terminal: '3' }],
    stays: [{ name: '樟宜酒店', address: null, check_in: '2026-09-23', check_out: '2026-09-25',
              check_in_time: null, check_out_time: null, confirmation: null, room: null }],
  } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await page.setInputFiles('#admin-ticket-input', {
    name: 'both.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fake'),
  });
  await until(() => page.evaluate(() =>
    adminTripsDraft && adminTripsDraft.length && adminTripsDraft[adminTripsDraft.length-1].items.length >= 3),
    { what: '航班＋住宿都建出来' });
  const trip = await page.evaluate(() => adminTripsDraft[adminTripsDraft.length - 1]);
  console.log('\n【对照组：机票＋酒店混在一起】');
  ok('航班那条还在', trip.items.some(i => i.flight && i.flight.no === 'SQ157'), trip.items);
  ok('住宿也建出来了', trip.items.some(i => /入住 樟宜酒店/.test(i.title.zh)), trip.items.map(i => i.title.zh));
  ok('航班那条排在数组前面（查真数据是按下标走的，不能被住宿挤掉）',
     trip.items[0].flight && trip.items[0].flight.no === 'SQ157', trip.items[0]);
  ok('有航班就照样去查真接口', rec.calls.some(c => c.action === 'flightLookup'),
     rec.calls.map(c => c.action));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十一：行程管理里的行程卡按日期排 ----------
// 2026-08-30 用户：「行程管理里能按照日期顺序排列吗」。以前是按存进去的顺序排，
// 存的时候什么样就什么样。条目在卡片里早就排好了，卡片本身没排。
//
// 这一节最要紧的不是顺序本身，而是**下标不能跟着动**：adminExpandedTrip、
// data-trip、flightLookupState 全按下标寻址，真去 sort 数组会变成「点开甲、改到乙」。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  await ctx.addInitScript(() => {
    const FIXED = Date.parse('2026-09-05T12:00:00Z');   // 让「过去/未来」有确定答案
    const _D = Date;
    // eslint-disable-next-line no-global-assign
    Date = class extends _D {
      constructor(...a){ if(a.length === 0) super(FIXED); else super(...a); }
      static now(){ return FIXED; }
    };
  });
  // 刻意打乱：存进去的顺序跟日期顺序完全不一样
  const messy = [
    { id:'a', title:{zh:'十月槟城',en:''}, start:'2026-10-09', end:'2026-10-17', location:{zh:'',en:''}, items:[] },
    { id:'b', title:{zh:'七月旧行程',en:''}, start:'2026-07-01', end:'2026-07-05', location:{zh:'',en:''}, items:[] },
    { id:'c', title:{zh:'九月新加坡',en:''}, start:'2026-09-23', end:'2026-09-27', location:{zh:'',en:''}, items:[] },
    { id:'d', title:{zh:'还没填日期',en:''}, start:'', end:'', location:{zh:'',en:''}, items:[] },
    { id:'e', title:{zh:'八月旧行程',en:''}, start:'2026-08-24', end:'2026-08-27', location:{zh:'',en:''}, items:[] },
  ];
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  mountRoutes(ctx, { role: 'admin', trips: messy });
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await until(async () => (await page.locator('#admin-trips-list .admin-trip-summary, #admin-trips-list .admin-trip-card').count()) >= 5,
    { what: '五张行程卡都渲染出来' });

  console.log('\n【行程管理：按日期排】');
  // 直接按卡片顺序取标题：卡片是 pick() 出来的纯文字，不是 bl() 的双语 span
  const names = await page.evaluate(() => {
    const titles = ['十月槟城','七月旧行程','九月新加坡','还没填日期','八月旧行程'];
    return Array.from(document.querySelectorAll('#admin-trips-list .admin-trip-summary'))
      .map(el => titles.find(t => el.textContent.includes(t)) || '(认不出)');
  });
  ok('没填日期的排最前（多半正在填）', names[0] === '还没填日期', names);
  ok('未来的按近到远：九月新加坡在十月槟城前面',
     names.indexOf('九月新加坡') < names.indexOf('十月槟城'), names);
  ok('已经结束的垫在未来行程后面',
     names.indexOf('十月槟城') < names.indexOf('八月旧行程'), names);
  ok('过去的按新到旧：八月在七月前面',
     names.indexOf('八月旧行程') < names.indexOf('七月旧行程'), names);
  ok('确实跟存进去的顺序不一样（否则这一节等于没验）',
     JSON.stringify(names) !== JSON.stringify(['十月槟城','七月旧行程','九月新加坡','还没填日期','八月旧行程']),
     names);

  // 关键对照：显示顺序变了，**数据下标不能跟着变**
  console.log('\n【对照组：只换显示顺序，下标一个都不许动】');
  const draftOrder = await page.evaluate(() => adminTripsDraft.map(t => t.title.zh));
  ok('底层数组顺序原封不动',
     JSON.stringify(draftOrder) === JSON.stringify(['十月槟城','七月旧行程','九月新加坡','还没填日期','八月旧行程']),
     draftOrder);
  // 点开显示在最前面的那张（「还没填日期」＝原数组下标 3），改个名字，看改到谁头上
  const firstCardIdx = await page.evaluate(() => {
    const btn = document.querySelector('#admin-trips-list [onclick^="adminExpandTrip("]');
    return btn ? Number(btn.getAttribute('onclick').match(/adminExpandTrip\((\d+)\)/)[1]) : null;
  });
  ok('第一张卡挂的是它在原数组里的下标 3，不是显示位置 0', firstCardIdx === 3, firstCardIdx);
  await page.evaluate(() => adminExpandTrip(3));
  await until(async () => (await page.locator('input[data-trip="3"][data-field="title.zh"]').count()) === 1,
    { what: '展开的是原下标 3 那一张' });
  await page.fill('input[data-trip="3"][data-field="title.zh"]', '改到我了吗');
  const after = await page.evaluate(() => adminTripsDraft.map(t => t.title.zh));
  ok('改的是「还没填日期」那一趟，没改到别人头上',
     after[3] === '改到我了吗' && after[0] === '十月槟城' && after[2] === '九月新加坡', after);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十二：管理页要看得出「哪几份老板已经看了」 ----------
// 2026-08-30 用户：「老板已读的账单PDF管理这边能显示吗？方便我删」。
// readAt 由后端在老板打开账单那一刻写进 bills.json（不是老板 App 上报的，
// viewer 依旧没有任何写入接口）。这里验前端有没有把它显示出来。
{
  const twoBills = [
    { id:'b1', title:{zh:'8月账单',en:''}, period:'2026-08', uploadedAt:'2026-08-01T00:00:00Z',
      kind:'month', filename:'aug.pdf', readAt:'2026-08-30T06:30:00Z' },
    { id:'b2', title:{zh:'9月账单',en:''}, period:'2026-09', uploadedAt:'2026-09-01T00:00:00Z',
      kind:'month', filename:'sep.pdf' },
  ];
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin', bills: twoBills });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'admin');
  await until(async () => (await page.locator('.admin-bill-row').count()) === 2, { what: '两条账单都渲染出来' });

  console.log('\n【管理页：老板看了没】');
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.admin-bill-row')).map(r => ({
    text: r.textContent,
    badge: (r.querySelector('.admin-bill-read') || {}).className || '',
  })));
  const aug = rows.find(r => r.text.includes('8月账单'));
  const sep = rows.find(r => r.text.includes('9月账单'));
  ok('看过的那份标「老板已看」', !!aug && aug.text.includes('老板已看'), aug && aug.text);
  ok('看过的那份带时间，不是光一句话', !!aug && /8月30日|8\/30/.test(aug.text), aug && aug.text);
  ok('没看过的那份标「老板还没看」', !!sep && sep.text.includes('老板还没看'), sep && sep.text);
  ok('两份的标记不一样（否则等于没分辨）',
     !!aug && !!sep && aug.badge !== sep.badge, [aug && aug.badge, sep && sep.badge]);
  ok('两份都还留着删除按钮', (await page.locator('.admin-bill-del').count()) === 2);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十二之对照组：老板自己那边看不到这行字 ----------
// 「老板已看」是给 YANG 看的管理信息，不该出现在老板的账单列表里。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer', bills: [
    { id:'b1', title:{zh:'8月账单',en:''}, period:'2026-08', uploadedAt:'2026-08-01T00:00:00Z',
      kind:'month', filename:'aug.pdf', readAt:'2026-08-30T06:30:00Z' },
  ] });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成（闸门放行）' });
  await gotoTab(page, 'bills');
  await until(async () => (await page.locator('.bill-row').count()) === 1, { what: '老板看到一条账单' });

  console.log('\n【对照组：老板那边不出现「已看」标记】');
  // 只看**渲染出来的**内容：document.body.textContent 会把内联 <script> 的源码
  // 也算进去，那里当然有这几个字（函数就写在那），拿它断言必定误报。
  const shown = await page.evaluate(() => {
    const parts = [];
    document.querySelectorAll('.tab, .app-header, .nav-bar').forEach(el => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('script, style').forEach(n => n.remove());
      parts.push(clone.textContent);
    });
    return parts.join(' ');
  });
  ok('账单还是照常列出来', await page.locator('.bill-row').count() === 1);
  ok('老板看不到「老板已看／还没看」', !/老板已看|老板还没看/.test(shown), shown.slice(0, 200));
  ok('页面上一个 .admin-bill-read 都没有', (await page.locator('.admin-bill-read').count()) === 0);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十三：管理页「发一条到老板手机」 ----------
// 2026-08-30：YANG 手上没有 iPhone，老板那台机器收不收得到没有别的办法验，
// 只能真发一条看推送服务怎么回。这一节验两件事：结果按设备逐台列出来（分得清
// 哪台是 iPhone），以及失效的订阅要说人话（不能只丢一个 410）。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin', pushTestResult: { status: 'ok', sent: 1, total: 2, results: [
    { who: '老板', host: 'web.push.apple.com', ok: true, httpStatus: 201, dead: false, error: null, detail: null },
    { who: 'YANG', host: 'fcm.googleapis.com', ok: false, httpStatus: 410, dead: true, error: null, detail: 'unsubscribed' },
  ] } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-trips-section')),
    { what: 'admin 管理页渲染完' });

  console.log('\n【二十三】管理页能往已登记的设备真发一条测试推送');
  ok('有「发一条到老板手机」按钮', await page.locator('#admin-push-test-btn').count() === 1);
  await gotoTab(page, 'admin');   // 按钮在管理分页里，不切过去它是隐藏的，点不到
  await page.click('#admin-push-test-btn');
  await until(async () => /iPhone|安卓/.test(await page.locator('#admin-push-test-status').innerText()),
    { what: '测试推送结果出来' });
  const txt = await page.locator('#admin-push-test-status').innerText();
  ok('逐台列出来，认得出哪台是 iPhone', /iPhone/.test(txt), txt);
  ok('也认得出安卓那台', /安卓|Android/.test(txt), txt);
  ok('成功那台写明推送服务收下了（带状态码）', /201/.test(txt), txt);
  ok('失效那台说人话，不是只丢一个 410', /失效/.test(txt) && /410/.test(txt), txt);
  ok('提醒「收下了不等于跳出来了」', /收下了不等于/.test(txt), txt);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十三的对照组：老板那边没有这颗按钮 ----------
// 没有对照组的话，这颗按钮哪天漏进 viewer 的 DOM 也不会有人发现——
// 它打的是 admin-only 的 pushTest，老板点了只会 403，但控件本身就不该存在。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.nav-btn')), { what: '老板那边渲染完' });

  console.log('\n【对照组：老板那边没有「发一条到老板手机」】');
  ok('老板看不到这颗按钮', await page.locator('#admin-push-test-btn').count() === 0);
  ok('结果区也不存在', await page.locator('#admin-push-test-status').count() === 0);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十四：老板按掉顶上的横幅之后，仍然有地方能开通知 ----------
// 顶上那条横幅有个 ×，按了永久不再出现（记在 localStorage）——那是刻意的。
// 但只有那一个入口的话，他按完 × 就再也开不了通知，跟 2026-08-29 admin 那次
// 踩的坑一模一样。所以「今天」最底下常驻一行安静的入口，这一节守的就是它。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.nav-btn')), { what: '老板那边渲染完' });
  // 无头浏览器不是「已加到主屏」的 PWA，isStandalonePwa() 必定 false，
  // 那样只会渲染「先加到主屏」的提示，验不到开关。这两个是环境条件，打桩掉。
  await page.evaluate(() => {
    isStandalonePwa = () => true;
    pushSupported = () => true;
    pushSubscription = null;
    ensurePushUI(); renderToday();
  });

  console.log('\n【二十四】老板按掉顶上的通知横幅之后，仍然找得到地方开通知');
  ok('一开始顶上有通知横幅', await page.locator('#pushBar').count() === 1);
  ok('「今天」底下也常驻一行通知入口', await page.locator('#todayPush').count() === 1);
  ok('那一行写着还没开，并且有「开启」按钮',
     /还没开/.test(await page.locator('#todayPush').innerText()) &&
     await page.locator('#todayPushBtn').count() === 1,
     await page.locator('#todayPush').innerText());

  await page.click('.push-dismiss');
  ok('按 × 之后顶上那条真的没了（他的选择要算数）', await page.locator('#pushBar').count() === 0);
  ok('★但底下那一行还在——不然他就永远开不了通知了',
     await page.locator('#todayPush').count() === 1);
  ok('★按钮也还在，点得到', await page.locator('#todayPushBtn').count() === 1);

  // 订阅成功之后：顶上那条本来就不挂了，底下这一行是他唯一能看到状态、也是唯一
  // 能关掉的地方，所以状态必须跟着变。
  await page.evaluate(() => {
    pushSubscription = { endpoint: 'https://web.push.apple.com/x' };
    ensurePushUI();
  });
  ok('开启之后那一行变「通知已开启」',
     /已开启/.test(await page.locator('#todayPush').innerText()),
     await page.locator('#todayPush').innerText());
  ok('并且给得出「关闭」（开了之后要能关）',
     /关闭/.test(await page.locator('#todayPushBtn').innerText()));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十四的对照组：admin 那边不出现这一行 ----------
// 2026-08-28 他连着三轮反映「我去开了通知也还是看得见」——不是他要的东西就别放。
// 没有这个对照组的话，这行字哪天渗回 admin 页面也不会有人发现。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-trips-section')),
    { what: 'admin 管理页渲染完' });
  await page.evaluate(() => { isStandalonePwa = () => true; pushSupported = () => true; ensurePushUI(); renderToday(); });

  console.log('\n【对照组：YANG 自己那边不出现「今天」底下那行通知】');
  ok('admin 的「今天」底下没有那一行', await page.locator('#todayPush').count() === 0);
  ok('admin 仍然有管理页那一行开关（他的入口在那）',
     await page.locator('#admin-push-btn').count() === 1);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十五：管理页看得出「老板到底装上了没有」 ----------
// 2026-08-30 YANG 问「有什么办法知道他已经装上了吗」。三种状态必须分得开：
// 没打开过 / 打开了但还在浏览器里（**通知一定收不到**）/ 已装到主屏。
// 中间那种最容易被忽略，所以它必须带警告，不能跟「装好了」长得一样。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin',
    seen: { firstSeen: '2026-08-20T00:00:00.000Z', lastSeen: '2026-08-30T01:02:03.000Z', standalone: true } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-trips-section')),
    { what: 'admin 管理页渲染完' });

  console.log('\n【二十五】管理页看得出老板装上了没有');
  const feedCall = rec.calls.find(c => c.action === 'feed');
  ok('拉 feed 时带上了 standalone（服务端靠它判断装没装到主屏）',
     feedCall && typeof feedCall.standalone === 'boolean', feedCall);
  // 设备号与机型（2026-09-05 加）：没这两样，管理页就分不出「老板那台」和
  // 「我自己那台借了他钥匙的机器」——YANG 真为这个问过一次，当时只能靠猜。
  ok('拉 feed 时带上了设备号', feedCall && /^[A-Za-z0-9]{6,32}$/.test(String(feedCall.deviceId || '')), feedCall);
  ok('拉 feed 时带上了机型', feedCall && typeof feedCall.platform === 'string' && feedCall.platform.length > 0, feedCall);
  const devAgain = await page.evaluate(() => deviceId());
  ok('★设备号是稳定的，不是每次现编一个（否则每开一次就多出一台设备）',
     devAgain === feedCall.deviceId, { devAgain, sent: feedCall.deviceId });

  ok('有「老板那边」这一块', await page.locator('#admin-seen-section').count() === 1);
  let txt = await page.locator('#admin-seen-section').innerText();
  ok('写出最后一次打开的时间', /8月30日|8\/30/.test(txt), txt);
  ok('装好了就说「已装到主屏」', /已装到主屏/.test(txt), txt);
  ok('装好了就不该有警告', await page.locator('#admin-seen-section .admin-status.err').count() === 0, txt);

  // 打开了、但没装到主屏 —— 这种最容易被当成「装好了」，事实必须摆出来。
  // ⚠️ 2026-09-04 起这**不再报红**：用户改了方针（直接发链接、不再要求他装），
  // 「在浏览器里看」从此是预期中的正常状态。原本那条红字会天天亮着，把正常状态
  // 说成故障——红灯天天亮的话，以后真出事也没人会看。所以这里断言的是
  // 「说清楚 ＋ 不报红」，别再改回去要求 .err（详见 notes 里那一节）。
  await page.evaluate(() => { feedData.seen = { lastSeen: '2026-08-30T01:02:03.000Z', standalone: false }; renderAdmin(); });
  txt = await page.locator('#admin-seen-section').innerText();
  ok('★没装到主屏这件事有说清楚', /没装到主屏/.test(txt), txt);
  ok('★并且点明收不到通知', /收不到通知/.test(txt), txt);
  ok('★但不报红（这是正常状态，不是故障）',
     await page.locator('#admin-seen-section .admin-status.err').count() === 0);

  // 每台设备各自一行：机型 + 在哪开的 + 最后一次什么时候
  await page.evaluate(() => {
    feedData.seen = { lastSeen: '2026-09-04T15:37:10.000Z', standalone: true, devices: [
      { id: 'dev11111', platform: 'iPhone', standalone: true, firstSeen: '2026-09-01T00:00:00.000Z',
        lastSeen: '2026-09-04T15:37:10.000Z', opens: 3 },
      { id: 'dev22222', platform: 'Android', standalone: false, firstSeen: '2026-08-29T00:00:00.000Z',
        lastSeen: '2026-09-02T05:48:00.000Z', opens: 1 },
    ] };
    renderAdmin();
  });
  txt = await page.locator('#admin-seen-section').innerText();
  ok('★两台设备各占一行', await page.locator('#admin-seen-section .seen-dev').count() === 2, txt);
  ok('★iPhone 那台认得出来', /iPhone/.test(txt), txt);
  ok('★Android 那台也认得出来', /Android/.test(txt), txt);
  ok('★分得出一台在主屏、一台在浏览器', /主屏/.test(txt) && /浏览器/.test(txt), txt);
  ok('★次数写「至少 N 次」（服务端 6 小时才记一笔，写死 N 次是骗人）', /至少 3 次/.test(txt), txt);

  // 对照组：服务端没给设备列表（老数据）时，整块不出现，也不能崩
  await page.evaluate(() => {
    feedData.seen = { lastSeen: '2026-09-04T15:37:10.000Z', standalone: true };
    renderAdmin();
  });
  ok('★没有设备列表时那一块整个不出现（不是印一行空的）',
     await page.locator('#admin-seen-section .seen-dev').count() === 0);
  ok('★但上面「最后一次打开」还在（证明上一条不是因为整块坏了）',
     /最后一次打开/.test(await page.locator('#admin-seen-section').innerText()));

  // 从没打开过
  await page.evaluate(() => { feedData.seen = { lastSeen: null, standalone: null }; renderAdmin(); });
  txt = await page.locator('#admin-seen-section').innerText();
  ok('从没打开过时说「还没打开过」', /还没打开过/.test(txt), txt);
  ok('★不会误报成「已装到主屏」', !/已装到主屏/.test(txt), txt);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十五的对照组：老板那边看不到这一块 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer',
    seen: { lastSeen: '2026-08-30T01:02:03.000Z', standalone: true } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.nav-btn')), { what: '老板那边渲染完' });

  console.log('\n【对照组：老板看不到「老板那边」这一块】');
  ok('老板页面里没有这一块', await page.locator('#admin-seen-section').count() === 0);
  const shown = await page.evaluate(() => {
    const parts = [];
    document.querySelectorAll('.tab, .app-header, .nav-bar').forEach(el => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('script, style').forEach(n => n.remove());
      parts.push(clone.textContent);
    });
    return parts.join(' ');
  });
  ok('页面上也看不到「已装到主屏／还没打开过」这些字',
     !/已装到主屏|还没打开过|还在浏览器里/.test(shown), shown.slice(0, 200));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十六：今天谁请假（老板只读，有人才说话）----------
// 2026-09-02 加。同事在报账页自己登记、司机由 YANG 代录，老板这一屏只是显示。
// 两件事必须同时成立，所以对照组是「没人请假时整段不出现」——老板每天开这一屏，
// 天天挂一行「今天没有人请假」是噪音；而漏显示又会让他以为人齐了。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer', leaveToday: [
    { person: '司机 Sok', reason: '回乡', start: '2026-09-02', end: '2026-09-04' },
    { person: 'Seryi', reason: null, start: '2026-09-02', end: '2026-09-02' },
  ] });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.nav-btn')), { what: '老板那边渲染完' });

  console.log('\n【二十六】今天谁请假');
  let txt = await page.locator('#tab-today').innerText();
  ok('★今天请假的人都在', /司机 Sok/.test(txt) && /Seryi/.test(txt), txt.slice(0, 300));
  ok('有事由的把事由也写出来', /回乡/.test(txt), txt.slice(0, 300));
  ok('有「今天请假」这个抬头', /今天请假/.test(txt), txt.slice(0, 300));
  // 老板只读：这一屏不许出现任何登记/销假的控件（不是藏起来，是根本不存在）
  ok('★没有任何登记假的入口进 DOM',
     await page.locator('#modal-leave, #leave-person, [onclick*="leaveSubmit"], [onclick*="openLeaveModal"]').count() === 0);

  // 接下来两周要开始的假也要看得到——2026-09-02 用户当场发现的缺口：他 9/10 起
  // 回国一个星期，只报「今天谁没来」的话老板要到当天早上才知道。
  await page.evaluate(() => {
    feedData.leaveUpcoming = [{ person: 'Yang', reason: '回国祭拜母亲', start: '2026-09-10', end: '2026-09-17' }];
    renderToday();
  });
  txt = await page.locator('#tab-today').innerText();
  ok('★还没到的假也列出来（不用等到当天）', /Yang/.test(txt), txt.slice(0, 400));
  ok('写明是哪几天到哪几天', /9月10日/.test(txt) && /9月17日/.test(txt), txt.slice(0, 400));
  ok('分得出「今天」和「接下来」', /今天/.test(txt) && /接下来/.test(txt), txt.slice(0, 400));

  // 对照组：今天没人、但有将来的假 → 这一段仍要出现（换个抬头）
  await page.evaluate(() => { feedData.leaveToday = []; renderToday(); });
  txt = await page.locator('#tab-today').innerText();
  ok('★今天没人请假，但将来的假仍然看得到', /Yang/.test(txt) && /请假安排/.test(txt), txt.slice(0, 400));
  ok('这时候不该说「今天请假」', !/今天请假/.test(txt), txt.slice(0, 400));

  // 对照组：两边都空 → 整段不出现
  await page.evaluate(() => { feedData.leaveToday = []; feedData.leaveUpcoming = []; renderToday(); });
  txt = await page.locator('#tab-today').innerText();
  ok('★两边都没有时整段不出现（不留一行废话）', !/今天请假|请假安排/.test(txt), txt.slice(0, 300));
  ok('行程本身照常还在', await page.locator('#tab-today').count() === 1);

  // 后端老版本没有这两个字段时也不能炸
  await page.evaluate(() => { delete feedData.leaveToday; delete feedData.leaveUpcoming; renderToday(); });
  txt = await page.locator('#tab-today').innerText();
  ok('后端没给这些字段也不炸', !/今天请假|请假安排/.test(txt) && errs.length === 0, errs.slice(0, 3));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十六b：请假那张卡不许把字顶出框外 ----------
// 2026-09-02 用户实机看到：日期＋事由那一串借用了牙医卡的 .dental-k，而那个类是
// flex:none——收不了缩，长一点就直接冲出卡片。这类毛病肉眼才看得出来，除非**量**
// 真实宽度，所以这一节全部用 scrollWidth/clientWidth 和 getBoundingClientRect 判定，
// 不看文字内容。窄屏（360px，常见手机）跑，宽屏上看不出来的正是这个问题。
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer',
    leaveToday: [{ person: '司机 Sok', reason: '家里有事要回乡下一趟', start: '2026-09-02', end: '2026-09-02' }],
    leaveUpcoming: [{ person: 'Yang', reason: '回国祭拜母亲并处理房产事宜', start: '2026-09-10', end: '2026-09-17' }],
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.leave-row')), { what: '请假卡渲染完' });

  console.log('\n【二十六b】请假卡在窄屏上不许溢出');
  // 量之前先确保不会因为「某个元素不存在」而抛错——测量块崩掉的话，整份自检当场
  // 中断，看不出是哪一条不过；要的是一个干净的红灯（回退验证时确认过这件事）。
  const m = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.leave-row')];
    const card = rows.length ? rows[0].closest('.dental-card') : null;
    if(!card) return { noCard: true };
    const inner = card.getBoundingClientRect().right - parseFloat(getComputedStyle(card).paddingRight);
    let worst = -1e9, rowOverflow = 0;
    for(const row of rows){
      rowOverflow = Math.max(rowOverflow, row.scrollWidth - row.clientWidth);
      for(const el of [row, ...row.querySelectorAll('*')]){
        worst = Math.max(worst, el.getBoundingClientRect().right - inner);
      }
    }
    const meta = document.querySelector('.leave-meta');
    return {
      noCard: false,
      cardOverflow: card.scrollWidth - card.clientWidth,
      rowOverflow,
      worstRight: Math.round(worst * 10) / 10,
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      metaLines: meta ? meta.getBoundingClientRect().height : 0,
    };
  });
  ok('请假卡真的画出来了（没画出来的话下面几条等于没测）', m.noCard === false, m);
  ok('★每一行自己没有横向溢出', m.rowOverflow <= 1, m);
  ok('★卡片内没有横向溢出', m.cardOverflow <= 1, m);
  ok('★每一行都没有超出卡片的内边界', m.worstRight <= 1, m);
  ok('★整页不会变成可以左右拖（溢出会把整屏拖歪）', m.pageOverflow <= 1, m);
  ok('长事由是换行而不是撑宽（第二行占得比一行高）', m.metaLines > 18, m);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十七：过去的预约不许当成「下次预约」 ----------
// 2026-09-02 用户问「牙医今天去完了，他今晚会自动更新吗」——不会，没有任何定时
// 任务碰这份数据。而原本的显示更糟：只要 nextVisit 有值就照印，看完诊的第二天起
// 老板那张卡会一直挂着一个**过去的日期**当成下次预约。
// 刻意**不做成自动**把它转成就诊记录：排了不等于去了，替他认定是在编医疗记录。
// 所以老板那边当成「还没约」，由 YANG 在管理页一键确认。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const past = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  mountRoutes(ctx, { role: 'viewer',
    dental: { lastVisit: '2026-07-13', nextVisit: past, intervalMonths: 3, note: '' } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.dental-card')), { what: '牙医卡渲染完' });

  console.log('\n【二十七】过去的预约不许当成「下次预约」');
  let txt = await page.locator('.dental-card').innerText();
  const pastZh = `${Number(past.slice(5,7))}月${Number(past.slice(8,10))}日`;
  ok('★过期的预约日期不再印在「下次预约」那一行', !txt.includes(pastZh), txt);
  ok('★改口说「还没约／该约了」（那句话才是对的）', /还没约|该约了/.test(txt), txt);
  ok('上次就诊照旧显示', /7月13日/.test(txt), txt);
  ok('老板那边没有任何确认按钮（只读）',
     await page.locator('#admin-dental-done, [onclick*="adminDentalDone"]').count() === 0);

  // 对照组：还没到的预约必须照常显示，而且是高亮那种
  await page.evaluate(f => { feedData.dental.nextVisit = f; renderToday(); }, future);
  txt = await page.locator('.dental-card').innerText();
  const futZh = `${Number(future.slice(5,7))}月${Number(future.slice(8,10))}日`;
  ok('★还没到的预约照常显示（别把好的一起挡掉）', txt.includes(futZh), txt);
  ok('这时候不该再说「还没约」', !/还没约|该约了/.test(txt), txt);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十七的对照组：YANG 那边要问「去了吗」，一键记成就诊 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const past = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const rec = mountRoutes(ctx, { role: 'admin',
    dental: { lastVisit: '2026-07-13', nextVisit: past, intervalMonths: 3, note: '' } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-dental-section')),
    { what: '管理页渲染完' });
  await gotoTab(page, 'admin');

  console.log('\n【对照组：管理页问「那次去了吗」，一键记成就诊】');
  ok('★过期预约时管理页出现提示', await page.locator('#admin-dental-done').count() === 1);
  ok('提示是显眼的那一种，不是一行灰字',
     await page.locator('#admin-dental-done.err').count() === 1);
  await page.click('#admin-dental-done .admin-btn');
  await until(() => rec.calls.some(c => c.action === 'dentalSave'), { what: '存出去' });
  const sent = rec.calls.filter(c => c.action === 'dentalSave').pop();
  ok('★把那一天记成上次就诊', sent.lastVisit === past, sent);
  ok('★同时清掉下次预约（新的还没约）', !sent.nextVisit, sent);
  ok('复诊间隔没被顺手改掉', sent.intervalMonths === 3, sent);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 对照组：预约还没到时不许问「去了吗」 ----------
// 少了这一条的话，把提示改成「永远显示」也会全绿——而那会让 YANG 在预约当天
// 之前就把它记成已就诊，等于凭空造一条没发生过的医疗记录。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const future = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  mountRoutes(ctx, { role: 'admin',
    dental: { lastVisit: '2026-07-13', nextVisit: future, intervalMonths: 3, note: '' } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-dental-section')),
    { what: '管理页渲染完' });

  console.log('\n【对照组：预约还没到，不许问「去了吗」】');
  ok('★还没到的预约不出现确认提示', await page.locator('#admin-dental-done').count() === 0);
  ok('牙医表单本身照旧在', await page.locator('#admin-dental-section').count() === 1);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十八：一键分享当天行程去 WhatsApp ----------
// 2026-09-03 用户：老板到现在都没打开过 App，「你做个一键分享当天行程去 WhatsApp
// 的功能给我，我排好了再分享给他」。三件他点名要的事，这一节逐条量：
//   1. 地图链接要**能点**——所以文字里必须是完整网址原文，不能是「🗺 地图」这种
//      在 WhatsApp 里点不了的字。
//   2. 班机讯息尽量还原——航班号/起降机场/状态/起降时间/航站楼登机口。
//   3. 发出去的是**文本框里当下的内容**（他常常要补一句），不是生成时那一份。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  // 起飞时间就在今天（24 小时内），预计到达比计划晚 22 分——屏幕上会显示「预计晚 22 分」，
  // 分享出去的文字必须说同一件事（两边共用 flightTimeParts()，这一条就是守它的）。
  const trips = [{
    id: 't1', title: { zh: '新加坡', en: 'Singapore' }, start: today, end: tomorrow,
    location: { zh: '新加坡', en: 'Singapore' },
    guideUrl: 'https://jarixhew-bit.github.io/skills-github-pages/singapore-trip/',
    items: [
      { date: today, time: '16:00', title: { zh: '家里出发', en: 'Leave home' },
        note: { zh: '司机楼下等', en: 'Driver waits downstairs' },
        mapUrl: 'https://maps.app.goo.gl/D7Zjz9GAJX9hbVyQA' },
      { date: today, time: '18:55', title: { zh: '金边德崇 KTI → 新加坡 SIN', en: 'KTI → SIN' },
        note: { zh: '', en: '' }, mapUrl: '',
        flight: { no: 'SQ157', date: today, live: {
          from: 'KTI', to: 'SIN', from_name: 'Phnom Penh Techo', to_name: 'Singapore Changi',
          sched_dep: `${today} 18:55+07:00`, est_dep: `${today} 18:55+07:00`, act_dep: null,
          sched_arr: `${today} 22:00+08:00`, est_arr: `${today} 22:22+08:00`, act_arr: null,
          gate: 'C12', terminal: '2', status: 'expected' } } },
      { date: tomorrow, time: '09:00', title: { zh: '滨海湾花园', en: 'Gardens by the Bay' },
        note: { zh: '', en: '' }, mapUrl: 'https://maps.app.goo.gl/gardens' },
    ],
  }];
  mountRoutes(ctx, { role: 'admin', trips });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => {
    localStorage.setItem('bossApp_token', t);
    // 拦下 window.open：要验「点了到底会发出去什么」，不能真的跳出去
    window.__opened = [];
    window.open = (u) => { window.__opened.push(u); return null; };
  }, GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.item-row')), { what: '今天那一屏渲染完' });

  console.log('\n【二十八】一键分享当天行程去 WhatsApp');
  ok('「今天」标题栏上有分享按钮', await page.locator('.sec-hdr .share-btn').count() >= 1);
  await clickHere(page, '.sec-hdr .share-btn', '「今天」那颗分享按钮点得到');
  await until(() => page.evaluate(() => document.getElementById('shareBox').classList.contains('open')),
    { timeout: 3000 }).catch(() => { /* 没开就让下面的断言把内容为空报出来 */ });
  const txt = await page.inputValue('#share-text');
  ok('★弹窗里先给人看到要发的文字（不是点了就直接跳出去）',
     await page.evaluate(() => window.__opened.length) === 0, txt.slice(0, 40));
  const todayZh = `${Number(today.slice(5,7))}月${Number(today.slice(8,10))}日`;
  ok('文字里有日期', txt.includes(todayZh), txt);
  ok('文字里有行程名和第几天', txt.includes('新加坡') && /第 1 天 \/ 共 2 天/.test(txt), txt);
  ok('条目的时间和标题都在', txt.includes('16:00') && txt.includes('家里出发'), txt);
  ok('备注也带上了', txt.includes('司机楼下等'), txt);
  ok('★地图是完整网址原文（WhatsApp 里点得开）',
     txt.includes('https://maps.app.goo.gl/D7Zjz9GAJX9hbVyQA'), txt);
  ok('★不是「🗺 地图」这种点不了的字', !/🗺\s*地图/.test(txt), txt);
  ok('★航班号在', txt.includes('SQ157'), txt);
  // 机场名跟屏幕上同一套（airportLabelZh：中文对照 → 接口名 → 只剩代码），
  // 要的是「不是光秃秃一个 KTI」，老板看得懂那是哪里。
  ok('★起降机场带名字，不是光秃秃的代码', /金边.*KTI/.test(txt) && /新加坡.*SIN/.test(txt), txt);
  ok('★航班状态在', txt.includes('未起飞'), txt);
  ok('★起飞时间在', txt.includes('18:55'), txt);
  ok('★到达时间在', txt.includes('22:00'), txt);
  ok('★航站楼和登机口都还原了', txt.includes('2 号航站楼') && txt.includes('登机口 C12'), txt);
  ok('★手册网址带上了',
     txt.includes('https://jarixhew-bit.github.io/skills-github-pages/singapore-trip/'), txt);
  // 屏幕上写「预计晚 22 分」，发出去的文字也必须这么说——两边各写一套判定的话，
  // 迟早出现「App 说延误、发给老板的说准点」，而这种矛盾没人会去核对。
  const onScreen = await page.locator('.flight-info-times').first().innerText();
  ok('★屏幕上确实显示了预计晚点（不然下一条等于没测）', /预计晚 22 分/.test(onScreen), onScreen);
  ok('★发出去的文字跟屏幕说的是同一件事', /预计晚 22 分/.test(txt), txt);

  // 发出去的是「文本框里当下的内容」
  // 弹窗没开时这两下会 timeout 把整份自检打断——回退验证就白做了（2026-09-02 的教训）。
  // 点不到就让下面的断言用「没发出去」这个事实报红，而不是让 run 当场死掉。
  await page.fill('#share-text', txt + '\n\n（另外：晚餐我另外安排）', { timeout: 3000 }).catch(() => {});
  await page.locator('#share-wa-btn').click({ timeout: 3000 }).catch(() => {});
  const opened = await page.evaluate(() => window.__opened);
  ok('★点了才会去 WhatsApp', opened.length === 1, opened.length);
  ok('★走的是 wa.me（不指定号码，由他自己选发给谁）',
     (opened[0] || '').startsWith('https://wa.me/?text='), opened[0]);
  const sentText = decodeURIComponent((opened[0] || '').split('?text=')[1] || '');
  ok('★发的是改过之后的内容，不是生成时那一份', sentText.includes('晚餐我另外安排'), sentText.slice(-40));
  ok('★网址在发出去的内容里原样保留（没被二次编码毁掉）',
     sentText.includes('https://maps.app.goo.gl/D7Zjz9GAJX9hbVyQA'), sentText.slice(0, 80));

  // 明天、以及行程分页上未来的每一天，都要能发（「我排好了再分享给他」＝常常不是今天）
  await page.locator('.share-box .overlay-close').click().catch(() => {});
  const secBtns = await page.locator('.sec-hdr .share-btn').count();
  ok('「明天」那一栏也有分享按钮', secBtns === 2, secBtns);
  await gotoTab(page, 'trips');
  await page.evaluate(() => document.querySelector('.trip-card').classList.add('expanded'));
  ok('★行程分页里每一天的小标题也有（排好未来某天就能直接发）',
     await page.locator('.trip-day-hdr .share-btn').count() === 2,
     await page.locator('.trip-day-hdr .share-btn').count());
  const dayBtns = page.locator('.trip-day-hdr .share-btn');
  if(await dayBtns.count() > 1) await dayBtns.nth(1).click();
  const txt2 = await page.inputValue('#share-text');
  ok('★发的是那一天的内容，不是今天的', txt2.includes('滨海湾花园') && !txt2.includes('家里出发'), txt2);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十八b：对照组 —— 那一天什么都没排时，发出去的也得是句人话 ----------
// 少了这一条的话，「文字生成器整个坏掉、永远回空字符串」也能让上面几条绿着过
// （上面测的都是「有内容时对不对」）。空白讯息发给老板比不发更糟。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin', trips: [] });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.empty-card')), { what: '空状态渲染完' });

  console.log('\n【二十八b】对照组：这一天没有安排时，分享出来不能是一片空白');
  await clickHere(page, '.sec-hdr .share-btn', '空白那天也有分享按钮');
  const txt = await page.inputValue('#share-text');
  ok('★仍然有日期', /月.*日/.test(txt), txt);
  ok('★明说「还没有排具体安排」，不是空白', txt.includes('还没有排具体安排'), txt);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十九：收藏餐厅（Telegram 那份清单，老板 App 只读 + 可分享） ----------
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => {
    localStorage.setItem('bossApp_token', t);
    window.__opened = [];
    window.open = (u) => { window.__opened.push(u); return null; };
  }, GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成' });

  console.log('\n【二十九】收藏餐厅');
  ok('底部导航多了餐厅入口', await page.locator('.nav-btn[data-tab="restaurants"]').count() === 1);
  await gotoTab(page, 'restaurants');
  ok('按地区分了组', await page.locator('.rest-region-hdr').count() === 2,
     await page.locator('.rest-region-hdr').count());
  ok('三家都在', await page.locator('.rest-row').count() === 3, await page.locator('.rest-row').count());
  const paneText = await page.locator('#tab-restaurants').innerText();
  ok('店名/地区/类别都看得到', /胖姐领头羊/.test(paneText) && /西港/.test(paneText) && /火锅/.test(paneText), paneText);
  ok('备注也看得到', /提前订位/.test(paneText), paneText);
  // CLAUDE.md：提到地点就要有能点的地图链接。少了这条，清单对老板等于半废。
  const maps = await page.evaluate(() =>
    [...document.querySelectorAll('.rest-row')].map(r => {
      const a = r.querySelector('a.item-map');
      return a ? a.getAttribute('href') : null;
    }));
  ok('★每一家都有能点的地图链接', maps.length === 3 && maps.every(h => /^https?:\/\//.test(h || '')), maps);

  // 分享按钮是给 YANG 的工具，老板那边一颗都不该有（2026-09-03 用户：「老板不必有分享」）。
  // 对照组在场景二十九c——没有它，「整个分享功能坏掉」也会让下面这几条绿着过。
  ok('★餐厅这一屏老板看不到任何分享按钮',
     await page.locator('#tab-restaurants .share-btn').count() === 0);
  await gotoTab(page, 'today');
  ok('★「今天」那一屏也没有分享按钮', await page.locator('#tab-today .share-btn').count() === 0);
  await gotoTab(page, 'trips');
  await page.evaluate(() => { const c = document.querySelector('.trip-card'); if(c) c.classList.add('expanded'); });
  ok('★行程分页每一天的小标题上也没有', await page.locator('.trip-day-hdr .share-btn').count() === 0);
  ok('★整个页面一颗分享按钮都没有', await page.locator('.share-btn').count() === 0,
     await page.locator('.share-btn').count());
  await gotoTab(page, 'restaurants');

  // 安全不变量：这一屏也是只读的。老板要加店回 Telegram 说一句，App 不为此开写入口。
  const writeCnt = await page.evaluate(() =>
    [...document.querySelectorAll('#tab-restaurants button')]
      .filter(b => /新增|添加|删除|保存|编辑/.test(b.textContent || '')).length);
  ok('★餐厅这一屏没有任何写入控件（老板只读）', writeCnt === 0, writeCnt);
  ok('★也没有输入框', await page.locator('#tab-restaurants input, #tab-restaurants textarea').count() === 0);
  ok('★管理页那块「加餐厅」的表单压根不在 DOM 里（不是藏起来）',
     await page.locator('#admin-rest-section, #admin-rest-name').count() === 0);

  // 窄屏排版：长店名要换行，不能顶出框外（跟请假卡那次同一种毛病，量真实宽度）
  const m = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.rest-row')];
    let worst = -1e9, rowOverflow = 0;
    for(const row of rows){
      const list = row.closest('.rest-list');
      const inner = list.getBoundingClientRect().right;
      rowOverflow = Math.max(rowOverflow, row.scrollWidth - row.clientWidth);
      for(const el of [row, ...row.querySelectorAll('*')]){
        worst = Math.max(worst, el.getBoundingClientRect().right - inner);
      }
    }
    return { rowOverflow, worstRight: Math.round(worst * 10) / 10,
             pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
             navOverflow: (() => { const n = document.getElementById('bottomNav');
               return n.scrollWidth - n.clientWidth; })() };
  });
  ok('★长店名那一行没有横向溢出', m.rowOverflow <= 1, m);
  ok('★没有任何一格超出卡片边界', m.worstRight <= 1, m);
  ok('★整页不会变成可以左右拖', m.pageOverflow <= 1, m);
  ok('★底部导航多一个按钮之后仍然塞得下（360px 窄屏）', m.navOverflow <= 1, m);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十九c：对照组 —— 分享这件事在 YANG 那边必须是好的 ----------
// 上一节断言「老板那边一颗分享按钮都没有」。少了这一组，把分享整个删掉也会全绿，
// 而那正是 2026-09-03 这次改动最容易改过头的地方（前科：2026-08-28 推送提示
// 从 admin 身上删过头，连他自己都开不了通知）。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成' });
  await gotoTab(page, 'restaurants');

  console.log('\n【二十九c】对照组：YANG 那边分享照旧能用（老板那边为 0 不是因为功能坏了）');
  ok('★餐厅每一家都有分享按钮', await page.locator('.rest-row .share-btn').count() === 3,
     await page.locator('.rest-row .share-btn').count());
  await clickHere(page, '.rest-row .share-btn', '单店分享按钮点得到');
  const one = await page.inputValue('#share-text');
  ok('★单店分享带店名', one.includes('胖姐领头羊'), one);
  ok('★单店分享带地区类别', one.includes('西港') && one.includes('火锅'), one);
  ok('★单店分享带完整地图网址', one.includes('https://maps.app.goo.gl/mWSd7EYvVpVSbKie9'), one);
  await page.locator('.share-box .overlay-close').click().catch(() => {});

  await clickHere(page, '.rest-region-hdr .share-btn', '整区分享按钮点得到');
  const many = await page.inputValue('#share-text');
  ok('★整区分享把那一区都带上', many.includes('胖姐领头羊') && many.includes('快乐小羊'), many);
  ok('★不会把别的地区混进来', !many.includes('Chhne Meas'), many);
  ok('★整区分享每一家都有网址', (many.match(/https?:\/\//g) || []).length === 2, many);
  await page.locator('.share-box .overlay-close').click().catch(() => {});
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景二十九b：对照组 —— 清单是空的（或旧版缓存没这个字段）时的样子 ----------
// 少了这一条，「renderRestaurants 整个不画」也会让上面那些「数量对不对」的断言
// 变成 0===0 之外的红——但空态本身没人测，老板会看到一片空白不知道是坏了还是没有。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer', restaurants: [] });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成' });
  await gotoTab(page, 'restaurants');

  console.log('\n【二十九b】对照组：还没有收藏餐厅时');
  const t = await page.locator('#tab-restaurants').innerText();
  ok('★明说「还没有收藏的餐厅」，不是一片空白', t.includes('还没有收藏的餐厅'), t);
  ok('★这时候没有分享按钮（没东西可分享）',
     await page.locator('#tab-restaurants .share-btn').count() === 0);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三十：管理页自己加／删餐厅（admin only） ----------
// 2026-09-03 用户问「餐厅要在 app 里自己加能吗」。之前只能回 Telegram 说一句。
// 这一节是场景二十九那条「viewer 一个写入控件都没有」的**对照组**：没有它，
// 整个增删功能坏掉也会一路绿灯，而那正是「viewer 下数量为 0」的另一种解释。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-rest-section')),
    { what: '管理页渲染完' });
  await gotoTab(page, 'admin');

  console.log('\n【三十】管理页加／删餐厅（老板那边一个都没有，见场景二十九）');
  ok('★表单在', await page.locator('#admin-rest-name').count() === 1);
  ok('★现有的清单也列出来了', await page.locator('.admin-rest-row').count() === 3,
     await page.locator('.admin-rest-row').count());
  ok('每一条都有删除键', await page.locator('.admin-rest-del').count() === 3);

  // 不填店名：不许发请求，而且要说人话
  const before = rec.calls.filter(c => c.action === 'restaurantAdd').length;
  await page.click('#admin-rest-section .admin-btn');
  ok('★没填店名时一个请求都不发',
     rec.calls.filter(c => c.action === 'restaurantAdd').length === before, rec.calls.length);
  ok('★而且明说要先填店名', /要先填店名/.test(await page.locator('#admin-rest-status').innerText()),
     await page.locator('#admin-rest-status').innerText());

  // 正常新增
  await page.fill('#admin-rest-name', '  阿玛尼海鲜  ');
  await page.fill('#admin-rest-region', ' 金边 ');
  await page.fill('#admin-rest-category', '海鲜');
  await page.fill('#admin-rest-note', '要提前订位');
  await page.click('#admin-rest-section .admin-btn');
  await until(() => rec.calls.some(c => c.action === 'restaurantAdd'), { what: '新增送出去' });
  const sent = rec.calls.filter(c => c.action === 'restaurantAdd').pop();
  ok('★店名送出去了（前后空白修掉）', sent.name === '阿玛尼海鲜', sent);
  ok('★地区也修掉空白', sent.region === '金边', sent);
  ok('类别与备注照送', sent.category === '海鲜' && sent.note === '要提前订位', sent);
  await until(() => page.evaluate(() => {
    const el = document.getElementById('admin-rest-status');
    return !!el && /已加进清单/.test(el.textContent || '');
  }), { what: '重建之后确认消息还在' });
  // 这一条守的是踩过两次的坑：refreshFeed() 会整块重建管理页，确认消息必须在重建
  // **之后**重新写一次，否则人按完保存看不到任何反馈，会以为没存上再存一次。
  ok('★重建管理页之后，确认消息仍然看得到', true);

  // 删除：先按「取消」——这一条不能省，不然「confirm 形同虚设」也会全绿
  page.once('dialog', d => d.dismiss());
  const delBefore = rec.calls.filter(c => c.action === 'restaurantDelete').length;
  await page.click('.admin-rest-del');
  ok('★确认框按取消时，一个删除请求都不发',
     rec.calls.filter(c => c.action === 'restaurantDelete').length === delBefore, delBefore);

  page.once('dialog', d => d.accept());
  await page.click('.admin-rest-del');
  await until(() => rec.calls.some(c => c.action === 'restaurantDelete'), { what: '删除送出去' });
  const del = rec.calls.filter(c => c.action === 'restaurantDelete').pop();
  ok('★删的是那一条的 id（不是名字，同名店才不会删错）', del.id === 'r1', del);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三十一：备忘 —— 老板那屏只看得到「给他看」的那些 ----------
// 2026-09-03 用户要「备忘录 + 提醒模式」，选的是「两边都要（可选给谁看）」。
// 备忘跟提醒共用 butler 那份 reminders.json，而那里面躺着三十几条 YANG 自己的旧记录，
// 所以这一节最要紧的不是「功能有没有坏」，而是**私事有没有漏到老板那屏**。
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.memo-row')), { what: '备忘卡渲染完' });

  console.log('\n【三十一】备忘：老板那屏');
  const pane = await page.locator('#tab-today').innerText();
  ok('给老板看的那两条都在', pane.includes('周三 8:30 见客户') && pane.includes('护照放在保险箱第二层'), pane);
  ok('★有时间的那条印出了时间', /9月10日/.test(pane) && pane.includes('08:30'), pane);
  ok('★老板那屏一个「完成/删除/修改」的按钮都没有（他只能看）',
     await page.evaluate(() => [...document.querySelectorAll('#tab-today button')]
       .filter(b => /完成|删除|修改|保存/.test(b.textContent || '')).length) === 0);
  ok('★管理页那块备忘表单压根不在 DOM 里',
     await page.locator('#admin-memo-section, #admin-memo-text').count() === 0);

  // 窄屏排版：长句子要换行，不能顶出框外（跟请假卡同一种毛病，量真实宽度）
  const m = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.memo-row')];
    const card = rows.length ? rows[0].closest('.memo-card') : null;
    if(!card) return { noCard: true };
    const inner = card.getBoundingClientRect().right - parseFloat(getComputedStyle(card).paddingRight);
    let worst = -1e9, rowOverflow = 0;
    for(const row of rows){
      rowOverflow = Math.max(rowOverflow, row.scrollWidth - row.clientWidth);
      for(const el of [row, ...row.querySelectorAll('*')]){
        worst = Math.max(worst, el.getBoundingClientRect().right - inner);
      }
    }
    return { noCard: false, rowOverflow, worstRight: Math.round(worst * 10) / 10,
             pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  ok('备忘卡真的画出来了', m.noCard === false, m);
  ok('★每一行没有横向溢出', m.rowOverflow <= 1, m);
  ok('★没有超出卡片内边界', m.worstRight <= 1, m);
  ok('★整页不会变成可以左右拖', m.pageOverflow <= 1, m);

  // 一条都没有时整段不出现（老板天天开这一屏，挂一句「暂无备忘」是噪音）
  await page.evaluate(() => { feedData.memos = []; renderToday(); });
  ok('★一条都没有时，整张卡不出现', await page.locator('.memo-row').count() === 0);
  ok('★连「备忘」这两个字都不该留着', !(await page.locator('#tab-today').innerText()).includes('📌'),
     await page.locator('#tab-today').innerText());
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三十一b：对照组 —— 私人那条绝不许出现在老板那屏 ----------
// 这一组是整个功能的安全底线。上一节用的是服务端已经筛过的假数据（照实模拟），
// 这里**故意把私人那条也塞进 viewer 的 feed**：真实世界里服务端漏筛、或者以后有人
// 把 memosForBoss 改坏，前端是最后一道。老板那屏必须自己也认 audience。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer', memos: fakeMemosAdmin() });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('.memo-row')), { what: '备忘卡渲染完' });

  console.log('\n【三十一b】对照组：服务端万一漏筛，前端也不能把私事印给老板');
  const pane = await page.locator('#tab-today').innerText();
  ok('★私人那条没有出现在老板那屏', !pane.includes('给老婆买生日礼物'), pane);
  ok('★已经勾掉的也不出现', !pane.includes('已经办好的事'), pane);
  ok('给老板看的那两条照常在', pane.includes('周三 8:30 见客户') && pane.includes('护照放在保险箱第二层'), pane);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三十一c：管理页那半（写、改、勾、删） ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-memo-section')), { what: '管理页渲染完' });
  await gotoTab(page, 'admin');

  console.log('\n【三十一c】备忘：管理页那半');
  ok('★表单在', await page.locator('#admin-memo-text').count() === 1);
  ok('★四条都列出来了（含私人的和已完成的）', await page.locator('.admin-memo-row').count() === 4,
     await page.locator('.admin-memo-row').count());
  const listText = await page.locator('#admin-memo-section').innerText();
  ok('★哪条老板看得到，一眼看得出来', listText.includes('老板看得到') && listText.includes('只有我看'), listText);

  // 默认必须是「只有我看」——认错这一边会把私事推到老板手机上
  ok('★新写一条预设是「只有我看」',
     await page.inputValue('#admin-memo-audience') === 'me', await page.inputValue('#admin-memo-audience'));
  // 没填时间＝不会响，那几个开关要灰掉（能按会让人以为它会响）
  const disabled = await page.evaluate(() => ({
    nt: document.getElementById('admin-memo-nt').disabled,
    nm: document.getElementById('admin-memo-nm').disabled,
    nb: document.getElementById('admin-memo-nb').disabled,
    rp: document.getElementById('admin-memo-repeat').disabled,
  }));
  ok('★没填时间时「推给谁」和「重复」全是灰的（三个勾都在内）',
     disabled.nt && disabled.nm && disabled.nb && disabled.rp, disabled);

  // 不填内容不许送
  const before = rec.calls.filter(c => c.action === 'memoSave').length;
  await page.click('#admin-memo-save');
  ok('★没写内容时一个请求都不发',
     rec.calls.filter(c => c.action === 'memoSave').length === before, rec.calls.length);

  // 正常新增：纯备忘（不填时间）
  await page.fill('#admin-memo-text', '  记得带黄本  ');
  await page.click('#admin-memo-save');
  await until(() => rec.calls.some(c => c.action === 'memoSave'), { what: '新增送出去' });
  let sent = rec.calls.filter(c => c.action === 'memoSave').pop();
  ok('★内容送出去了（前后空白修掉）', sent.text === '记得带黄本', sent);
  ok('★预设送的是 audience=me', sent.audience === 'me', sent);
  ok('★没填时间就送空的 datetime（服务端据此当成纯备忘）', !sent.datetime, sent);
  ok('★没有偷偷带上 id（这是新增不是修改）', !sent.id, sent);
  // ⚠️ 存完会 refreshFeed() → 整块重建管理页。不等重建结束就填下一条，
  // 填进去的字会被重建清掉，下一次保存看到的是空内容、请求根本不会发出去
  // （第一版就是这么超时的，而且报的是「第二条没送出去」，跟真正的原因隔了一层）。
  const memoSaved = () => page.evaluate(() => {
    const el = document.getElementById('admin-memo-status');
    return !!el && /已保存|已删除/.test(el.textContent || '');
  });
  await until(memoSaved, { what: '第一条存完、管理页重建完' });

  // 带时间 + 推给老板
  await page.fill('#admin-memo-text', '周五交报告');
  await page.selectOption('#admin-memo-audience', 'boss');
  await page.fill('#admin-memo-when', '2026-09-11T09:00');
  await page.evaluate(() => { adminMemoSyncNotify(); });
  await page.check('#admin-memo-nb');
  await page.check('#admin-memo-nm');   // 2026-09-03 用户：「如果推去我的app行吗」
  await page.selectOption('#admin-memo-repeat', 'weekly');
  await page.click('#admin-memo-save');
  await until(() => rec.calls.filter(c => c.action === 'memoSave').length >= 2, { what: '第二条送出去' });
  sent = rec.calls.filter(c => c.action === 'memoSave').pop();
  ok('★时间照送（到分钟）', sent.datetime === '2026-09-11T09:00', sent);
  ok('★「给老板看」送出去了', sent.audience === 'boss', sent);
  ok('★「推老板手机」送出去了', sent.notifyBoss === true, sent);
  ok('★「推我自己手机」也送出去了（跟 Telegram 是两条独立的路）', sent.notifyMe === true, sent);
  ok('★重复也送了', sent.repeat === 'weekly', sent);

  // 修改：点 ✏️ 会把那条填回表单，并且带上 id
  await until(memoSaved, { what: '第二条存完、管理页重建完' });
  await page.click('.admin-memo-row:nth-child(3) button[aria-label="修改"]');
  ok('★点修改会把内容填回表单',
     (await page.inputValue('#admin-memo-text')).length > 0, await page.inputValue('#admin-memo-text'));
  await page.click('#admin-memo-save');
  await until(() => rec.calls.filter(c => c.action === 'memoSave').length >= 3, { what: '修改送出去' });
  sent = rec.calls.filter(c => c.action === 'memoSave').pop();
  ok('★修改时带上了 id（不然会变成又新增一条）', !!sent.id, sent);

  // 勾掉 / 删除
  await page.click('.admin-memo-row:first-child button[aria-label="完成"]');
  await until(() => rec.calls.some(c => c.action === 'memoDone'), { what: '勾掉送出去' });
  ok('★勾掉送的是 done=true', rec.calls.filter(c => c.action === 'memoDone').pop().done === true,
     rec.calls.filter(c => c.action === 'memoDone').pop());

  const delBefore = rec.calls.filter(c => c.action === 'memoDelete').length;
  page.once('dialog', d => d.dismiss());
  await page.click('.admin-memo-row:first-child button[aria-label="删除"]');
  ok('★确认框按取消时不发删除请求',
     rec.calls.filter(c => c.action === 'memoDelete').length === delBefore, delBefore);
  page.once('dialog', d => d.accept());
  await page.click('.admin-memo-row:first-child button[aria-label="删除"]');
  await until(() => rec.calls.some(c => c.action === 'memoDelete'), { what: '删除送出去' });
  ok('★删除带的是 id', !!rec.calls.filter(c => c.action === 'memoDelete').pop().id,
     rec.calls.filter(c => c.action === 'memoDelete').pop());
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三十二：用讲的 —— 一段话变成行程条目 ----------
// 2026-09-04 用户：「这些输入行程的有没有办法更加简化一点？」
// 这一节守的**不是**「AI 认得准不准」（那测不了），而是这条路上真正危险的两件事：
//   1. AI 出来的东西**只进表单、不进仓库**——人看过一眼才按保存；
//   2. 地点要变成**能点的地图链接**（仓库硬规矩），航班时间要去查真接口、不许用 AI 编的。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  const rec = mountRoutes(ctx, { role: 'admin', trips: [],
    itineraryResult: { status: 'ok', title: '新加坡小旅行', items: [
      { date: '2026-09-10', time: '08:30', title: '家里出发去机场', note: '司机楼下等',
        place: '金边德崇国际机场', flightNo: '' },
      { date: '2026-09-10', time: '10:15', title: '金边 → 新加坡', note: '',
        place: '', flightNo: 'SQ157' },
      { date: '', time: '', title: '晚餐 天空餐厅', note: '', place: '滨海湾金沙', flightNo: '' },
    ] },
    flightLookupFlight: { no: 'SQ157', date: '2026-09-10', from: 'KTI', to: 'SIN',
      sched_dep: '2026-09-10 10:15+07:00', sched_arr: '2026-09-10 13:40+08:00', flightStatus: 'scheduled' },
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-say-text')), { what: '管理页渲染完' });
  await gotoTab(page, 'admin');

  console.log('\n【三十二】用讲的：一段话变成行程条目');
  ok('★输入框和按钮都在', await page.locator('#admin-say-text').count() === 1
     && await page.locator('#admin-say-btn').count() === 1);

  // 空文字不许白花一次 AI 额度
  const before = rec.calls.filter(c => c.action === 'itineraryParse').length;
  await page.click('#admin-say-btn');
  ok('★没写字时一个请求都不发',
     rec.calls.filter(c => c.action === 'itineraryParse').length === before, rec.calls.length);
  ok('★而且提示他先写点什么', /先写一段话/.test(await page.locator('#admin-say-status').innerText()),
     await page.locator('#admin-say-status').innerText());

  await page.fill('#admin-say-text', '9月10号早上8点半从家里出发去机场，10点15的 SQ157 去新加坡，晚上在天空餐厅吃饭');
  await page.click('#admin-say-btn');
  await until(() => rec.calls.some(c => c.action === 'itineraryParse'), { what: '送出去' });
  const sent = rec.calls.filter(c => c.action === 'itineraryParse').pop();
  ok('★原话照送（没有在前端先切一刀）', /SQ157/.test(sent.text || ''), sent);

  await until(() => page.locator('.admin-item-row').count().then(n => n >= 3), { what: '条目填进表单' });
  const rows = await page.locator('.admin-item-row').count();
  ok('★三条都填进表单了', rows === 3, rows);
  ok('★时间填对了', await page.inputValue('#admin-item-0-0-time') === '08:30',
     await page.inputValue('#admin-item-0-0-time'));
  ok('★「做什么」填对了', (await page.inputValue('#admin-item-0-0-title-zh')).includes('家里出发'),
     await page.inputValue('#admin-item-0-0-title-zh'));
  ok('★日期填对了', await page.inputValue('#admin-item-0-0-date') === '2026-09-10',
     await page.inputValue('#admin-item-0-0-date'));
  ok('★备注也带上了', (await page.inputValue('#admin-item-0-0-note-zh')).includes('司机'),
     await page.inputValue('#admin-item-0-0-note-zh'));
  // 仓库硬规矩：提到地点就要有能点的地图链接
  const map0 = await page.inputValue('#admin-item-0-0-map');
  ok('★地点变成了能点的 Google 地图链接', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/.test(map0), map0);
  ok('★链接里是那个地点的名字', decodeURIComponent(map0.split('query=')[1] || '').includes('金边德崇'), map0);
  ok('★没提地点的那条不会硬塞一个链接', (await page.inputValue('#admin-item-0-1-map')) === '',
     await page.inputValue('#admin-item-0-1-map'));

  // 航班号交给真接口去查——不许用 AI 编的时间
  ok('★带航班号的那条去查了真航班', rec.calls.some(c => c.action === 'flightLookup' && c.no === 'SQ157'),
     rec.calls.filter(c => c.action === 'flightLookup'));

  // 最要紧的一条：只填进表单，没有落盘
  ok('★★没有偷偷保存进仓库（要他自己按「保存全部行程」）',
     !rec.calls.some(c => c.action === 'tripsSave'), rec.calls.map(c => c.action));
  const st = await page.locator('#admin-say-status').innerText();
  ok('★状态栏说清楚了还要按保存', /保存全部行程/.test(st), st);
  ok('★没说日期的那条被点名出来（不然他不会发现）', /没说是哪一天/.test(st), st);
  ok('★输入框已经清空（免得再按一次重复加一遍）', (await page.inputValue('#admin-say-text')) === '',
     await page.inputValue('#admin-say-text'));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三十二b：对照组 —— 老板那边没有这条路 ----------
// 它要花 AI 额度、而且会改行程。真正的拦截在服务端（itineraryParse 在 ADMIN_ACTIONS
// 里），这一条守前端那层：老板身上连这个输入框都不该存在。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成' });

  console.log('\n【三十二b】对照组：老板那边连这个输入框都没有');
  ok('★#admin-say-text 不在 DOM 里', await page.locator('#admin-say-text').count() === 0);
  ok('★那颗按钮也不在', await page.locator('#admin-say-btn').count() === 0);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三十三：链接里带访问码，点开就是登入状态 ----------
// 2026-09-04 用户：老板到今天还是没打开，「下个月账单发给他，然后直接发链接和访问码
// 就行了，install 对他来说太麻烦」。光发码不够稳——他不装到主屏的话，iOS 放着一周
// 会清掉 localStorage，存的码会掉、下次又要重输。所以码做进链接里。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  // 刻意**不**预先塞 token：模拟老板那台从没打开过的机器
  await page.goto(URL + '#k=' + GOOD_TOKEN);
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: '直接进 App' });

  console.log('\n【三十三】链接里带访问码：老板点开就能看');
  ok('★不用输码就进来了（闸门没挡他）',
     await page.evaluate(() => document.getElementById('gate').classList.contains('off')));
  ok('★访问码存下来了（下次没网也认得他）',
     await page.evaluate(() => localStorage.getItem('bossApp_token')) === GOOD_TOKEN);
  // 码不该一直挂在网址栏：截图、转发、浏览器历史都会带着它
  ok('★进来之后网址栏里的码被抹掉了', !(await page.evaluate(() => location.hash)).includes('k='),
     await page.evaluate(() => location.href));
  ok('★进来的身份仍然是 viewer（链接不会让他变成管理员）',
     await page.locator('#nav-admin-btn').count() === 0);
  ok('★管理页容器仍然是空的',
     (await page.evaluate(() => document.getElementById('tab-admin').innerHTML.trim())) === '');
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三十三b：★错的码不许落地 ----------
// 老坑（gateSubmit 那条路早就守着）：错的码存进这台机器的话，他以后每次打开都拿着
// 一把错钥匙一直失败，而且自己不知道为什么。链接这条路必须守同一条规矩。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL + '#k=wrong-code-123');
  await until(() => page.evaluate(() => !document.getElementById('gate').classList.contains('off')),
    { what: '闸门出现' });

  console.log('\n【三十三b】对照组：链接里的码是错的');
  ok('★错的码没有存进这台机器',
     await page.evaluate(() => localStorage.getItem('bossApp_token')) === null,
     await page.evaluate(() => localStorage.getItem('bossApp_token')));
  ok('★闸门挡下来了，没让他看到任何内容',
     await page.evaluate(() => document.getElementById('app').classList.contains('app-hidden')));
  ok('★说清楚是链接的问题，不是他打错了',
     /链接里的访问码不对/.test(await page.locator('#gate-msg').innerText()),
     await page.locator('#gate-msg').innerText());
  ok('★错的码也从网址栏抹掉了（免得他一直重试同一条坏链接）',
     !(await page.evaluate(() => location.hash)).includes('k='),
     await page.evaluate(() => location.href));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三十三c：管理页给出的那条链接必须是能用的 ----------
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => {
    const el = document.getElementById('admin-boss-link');
    return !!el && /#k=/.test(el.textContent || '');
  }), { what: '链接算出来' });
  await gotoTab(page, 'admin');

  console.log('\n【三十三c】管理页：一条可以直接转出去的链接');
  const link = await page.locator('#admin-boss-link').innerText();
  ok('★链接里带着访问码', link.includes('#k='), link);
  ok('★带的是服务端给的那一串（打桩接口回的是 fake-access-code）',
     link.includes('fake-access-code'), link);
  ok('★指向的是老板 App 本身', /\/boss\//.test(link), link);
  ok('★三颗复制按钮都在（整条消息／只链接／只访问码）',
     await page.evaluate(() => [...document.querySelectorAll('#tab-admin button')]
       .filter(b => /复制/.test(b.textContent || '')).length) >= 3);
  // 不装到主屏就收不到通知——这句必须写在他看得到的地方，不然他会以为发了链接就万事大吉
  const block = await page.evaluate(() => {
    const el = [...document.querySelectorAll('#tab-admin .admin-block')]
      .find(b => /发给老板的链接/.test(b.textContent || ''));
    return el ? el.innerText : '';
  });
  ok('★写明了不装就收不到通知', /收不到通知/.test(block), block);
  ok('★安装说明的链接还留着（他哪天想装还找得到）',
     await page.evaluate(() => !!document.querySelector('#tab-admin a[href="./install.html"]')));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三十四：「账单来了」那条链接要直接落在账单那一屏 ----------
// 发出去的消息写的是「账单好了」，他点开却落在「今天」那一屏；当天没安排的话，
// 第一眼看到的是「今天没有安排的行程」——一个从没打开过的人很可能就此关掉。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL + '#k=' + GOOD_TOKEN + '&t=bills');
  // 等不到就**别把整份自检打断**：让下面的断言把「没落在账单页」这个事实报成红灯。
  // （2026-09-03 学过一次：回退验证时 run 中途死掉，后面几条根本没跑到，等于白验。）
  await until(() => page.evaluate(() => document.getElementById('tab-bills').classList.contains('active')),
    { timeout: 4000 }).catch(() => {});

  console.log('\n【三十四】链接指定落地分页');
  ok('★点开就在账单那一屏', await page.evaluate(() =>
     document.getElementById('tab-bills').classList.contains('active')));
  ok('★不是停在「今天」', !(await page.evaluate(() =>
     document.getElementById('tab-today').classList.contains('active'))));
  ok('★真的看得到账单（不是一个空壳分页）',
     await page.locator('.bill-row').count() >= 1, await page.locator('.bill-row').count());
  ok('★访问码照样存下来了', await page.evaluate(() => localStorage.getItem('bossApp_token')) === GOOD_TOKEN);
  ok('★网址栏抹干净（码和分页参数都不留）', !(await page.evaluate(() => location.hash)).includes('k='),
     await page.evaluate(() => location.href));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三十四b：对照组 —— 不指定就还是「今天」；名字不认得就忽略 ----------
// 少了这一组，「不管给什么都跳账单」也会让上面那几条全绿，而那会把每天开 App 看
// 行程的人天天丢进账单页。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL + '#k=' + GOOD_TOKEN);
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: '进 App' });
  console.log('\n【三十四b】对照组：没指定分页 / 指定了看不懂的分页');
  ok('★没带 t= 时还是落在「今天」', await page.evaluate(() =>
     document.getElementById('tab-today').classList.contains('active')));
  await ctx.close();

  const ctx2 = await browser.newContext();
  await forceZh(ctx2);
  mountRoutes(ctx2, { role: 'viewer' });
  const page2 = await ctx2.newPage();
  page2.on('pageerror', e => errs.push(e.message));
  await page2.goto(URL + '#k=' + GOOD_TOKEN + '&t=admin');
  await until(() => page2.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: '进 App' });
  ok('★★链接里写 t=admin 也进不了管理页（老板不是管理员）', await page2.evaluate(() =>
     !document.getElementById('tab-admin').classList.contains('active')));
  ok('★看不懂的分页名一律忽略，留在「今天」', await page2.evaluate(() =>
     document.getElementById('tab-today').classList.contains('active')));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx2.close();
}

// ---------- 场景三十四c：不装到主屏是「正常」，不是故障 ----------
// 2026-09-04 用户改了方针（直接发链接，不再要求他装）。原本那条红字会天天亮着，
// 把预期中的正常状态报成故障——红灯天天亮的话，以后真出事也没人会看。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'admin',
    seen: { firstSeen: '2026-09-05T01:00:00.000Z', lastSeen: '2026-09-05T01:00:00.000Z', standalone: false } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.getElementById('admin-seen-section')), { what: '管理页渲染完' });
  await gotoTab(page, 'admin');

  console.log('\n【三十四c】老板在浏览器里看 —— 这是正常状态');
  const block = await page.locator('#admin-seen-section').innerText();
  ok('★仍然说清楚他没装到主屏（事实要摆出来）', /没装到主屏/.test(block), block);
  ok('★但不再报红（不是故障）',
     await page.locator('#admin-seen-section .admin-status.err').count() === 0, block);
  ok('★也不再叫他「照安装说明再做一次」', !/再做一次/.test(block), block);
  ok('★仍然点明收不到通知（这件事不能不说）', /收不到通知/.test(block), block);

  // 对照组：装好了的话，那句「收不到通知」就不该再出现
  await page.evaluate(() => { feedData.seen.standalone = true; renderAdmin(); });
  const block2 = await page.locator('#admin-seen-section').innerText();
  ok('★装好了就显示「已装到主屏」', /已装到主屏/.test(block2), block2);
  ok('★装好了就不再说收不到通知', !/收不到通知/.test(block2), block2);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三十五：账单那一行直接显示花了多少 ----------
// 在这之前那一行只有期间，一个数字都没有——而老板打开这一屏，想知道的八成就是那个
// 数字。他得点进去等 PDF 画出来自己找总额。
// 这一节最要紧的是**别显示错的数字**：老账单没有摘要，那时候什么都不印，
// 绝不能退成「0.00」——那是在告诉老板那个月一分钱没花。
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer', bills: fakeBillsMixed() });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !document.getElementById('app').classList.contains('app-hidden')),
    { what: 'App 加载完成' });
  await gotoTab(page, 'bills');

  console.log('\n【三十五】账单列表直接显示金额');
  const rows = await page.locator('.bill-row').count();
  ok('三份都列出来了（不藏起来任何一份）', rows === 3, rows);

  const texts = await page.evaluate(() =>
    [...document.querySelectorAll('.bill-row')].map(r => r.innerText));
  const boss = texts.find(t => /Boss 账单/.test(t)) || '';
  const xm = texts.find(t => /Xiamen/.test(t)) || '';
  const old = texts.find(t => /旧的那份/.test(t)) || '';

  ok('★金额印出来了', /3,240\.50/.test(boss), boss);
  ok('★★币别也印出来了（Boss 是 USD、Xiamen 那份是 HKD，光一个数字是错的）',
     /USD/.test(boss) && /HKD/.test(xm), [boss, xm]);
  ok('★两份不同账户各显示各的金额，没有混在一起', /860\.00/.test(xm) && !/860/.test(boss), [boss, xm]);
  ok('★笔数也有（他一眼知道这个数字是几笔凑出来的）', /47 笔/.test(boss), boss);
  // 2026-09-05 用户：「那个花了多少你要备注，因为我一打开看我以为是结余」。
  // 花费和结余是两个差很远的数字，他照着看错的那个下判断就麻烦了。
  ok('★★数字前面写着「花费」（没有这两个字，他第一眼读成结余）', /花费/.test(boss), boss);
  ok('★没有摘要的老账单不会凭空冒出「花费」两个字', !/花费/.test(old), old);
  ok('★账户名摆出来（不然三份长得一样，分不出谁是谁）', /Boss/.test(boss) && /Xiamen trip/.test(xm), [boss, xm]);

  // 这一条是整节的重点
  ok('★★没有摘要的老账单：一个数字都不印', !/0\.00|NaN|undefined/.test(old), old);
  ok('★老账单其余内容照常显示（不是整行坏掉）', /旧的那份/.test(old) && /2026-07/.test(old), old);
  ok('★金额没有把标题挤掉（点开还是那份 PDF）',
     await page.locator('.bill-row .bill-title').count() === 3);

  // 窄屏不许溢出
  const m = await page.evaluate(() => {
    const list = document.querySelector('.bill-list');
    if(!list) return { noList: true };
    let worst = -1e9;
    for(const el of [list, ...list.querySelectorAll('*')]){
      worst = Math.max(worst, el.getBoundingClientRect().right - list.getBoundingClientRect().right);
    }
    return { noList: false, worst: Math.round(worst * 10) / 10,
             pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  ok('★360px 窄屏上没有溢出', m.noList === false && m.worst <= 1 && m.pageOverflow <= 1, m);
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

// ---------- 场景三十六：今天没安排时，空态底下补一条最近的账单 ----------
// 「今天」是老板的默认首屏。今天没安排时他原本看到的是一句「今天没有安排的行程」
// ——全 App 最没用的一屏，而它正是第一眼。他打开这个 App 十次有八次是为了那个数字。
{
  const ctx = await browser.newContext();
  await forceZh(ctx);
  mountRoutes(ctx, { role: 'viewer', trips: [], bills: fakeBillsMixed() });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(t => localStorage.setItem('bossApp_token', t), GOOD_TOKEN);
  await page.goto(URL);
  await until(() => page.evaluate(() => !!document.querySelector('#tab-today .empty-card')),
    { what: '空态渲染完' });

  console.log('\n【三十六】今天没安排时，空态底下有最近一份账单');
  const txt = await page.locator('#tab-today').innerText();
  ok('★空态底下出现最近一份账单', await page.locator('#tab-today .tbill-row').count() === 1,
     await page.locator('#tab-today .tbill-row').count());
  ok('★带金额（他要的就是这个数字）', /3,240\.50/.test(txt) && /USD/.test(txt), txt);
  ok('★挑的是最新上传的那一份（不是列表里第一条）', /Boss 账单/.test(txt), txt);
  ok('★原本那句「今天没有安排」还在（不是把空态换掉）', /今天没有安排的行程/.test(txt), txt);
  // 一点就打开那份账单：他打开 App 多半就为这个，能少一次点就少一次
  await page.click('#tab-today .tbill-row');
  await until(() => page.evaluate(() =>
    document.getElementById('billOverlay').classList.contains('open')), { what: '账单打开' });
  ok('★一点就直接打开那份账单（不是跳到账单分页再让他点一次）',
     await page.evaluate(() => document.getElementById('billOverlay').classList.contains('open')));
  await page.click('.overlay-close');

  // 对照组一：今天有安排时不该出现（那一屏已经有内容了，再塞一张卡是噪音）
  await page.evaluate(() => {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    feedData.trips = [{ id:'t', title:{zh:'有事',en:''}, start: iso, end: iso,
      items: [{ date: iso, time: '09:00', title:{zh:'开会',en:''}, note:{zh:'',en:''}, mapUrl:'' }] }];
    renderToday();
  });
  ok('★★今天有安排时不出现（不是无条件挂一张卡）',
     await page.locator('#tab-today .tbill-row').count() === 0);
  ok('今天的安排照常显示', /开会/.test(await page.locator('#tab-today').innerText()));

  // 对照组二：一份账单都没有时整段不出现
  await page.evaluate(() => { feedData.trips = []; feedData.bills = []; renderToday(); });
  ok('★一份账单都没有时整段不出现（不挂一句「还没有账单」的废话）',
     await page.locator('#tab-today .tbill-row').count() === 0);
  ok('★空态本身还在', /今天没有安排的行程/.test(await page.locator('#tab-today').innerText()));
  ok('无 JS 报错', errs.length === 0, errs.slice(0, 3));
  await ctx.close();
}

await finish('后半');
