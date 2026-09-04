/**
 * 老板 App 自检的**共用工具**：打桩接口、假数据、计分、等待、切分页。
 *
 * 为什么会有这个档案（2026-09-05 拆的）：check-boss 长到 3600 行、566 项断言、
 * 跑一次三分半，是 check-all 的瓶颈——改一行就要等三分半，一天下来等掉半小时。
 * 拆成前后两半各自成档，并行跑，墙上时间砍一半。
 *
 * ⚠️ 拆的是**场景**，不是断言：两份加起来必须还是 566 项。少一项就是漏了一条，
 * 而漏掉的那条正好可能是守着「老板只能看」的那一条。
 *
 * 这份自检要守的安全不变量：
 * **viewer 身份下，页面渲染出来的 DOM 里绝不能出现任何写操作控件**——上传账单、
 * 删账单、改行程。这条一旦回归（比如管理面板被改成 CSS 隐藏而不是不渲染），
 * 老板就能改数据了，而且没人会发现，因为界面看起来一切正常。
 * 所以 check-boss.mjs 的第 1、2 两节必须成对存在：第 1 节测「viewer 没有」，
 * 第 2 节测「admin 有」——没有对照组，第 1 节的 0 可能只是因为整个功能坏了。
 *
 * 打桩接口：/boss（合约字段 status/who/role/updated/trips/bills/inventory），
 * ctx.route 拦所有外部请求，只有 /boss 给假回应，其余一律 abort，
 * 保证自检不打真实网络。
 */
import { chromium } from 'playwright';

export const PORT = process.env.CHECK_PORT || 8899;
export const URL = `http://localhost:${PORT}/boss/index.html`;
export const API = 'https://butler-bot.jarixhew.workers.dev/boss';
export const GOOD_TOKEN = 'boss-good-token';

export let pass = 0;
export const fails = [];
export const ok = (n, c, got) => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fails.push(n); console.log(`  ❌ ${n} — 实际: ${JSON.stringify(got)}`); }
};

/**
 * 等条件成立，而不是死等固定时间。
 *
 * ⚠️ **超时不抛异常**，改成记一条红继续跑（2026-09-05 改）。
 * 原本超时是 throw，一超时整份自检当场中断——后面几十条断言根本没跑到。
 * 平常还好，**回退验证时是致命的**：故意退掉一处之后，看到的是一行崩溃信息，
 * 而不是「哪几条会红」，等于假红验证白做。2026-09-03 和 09-04 各踩过一次，
 * 两次都是在出事的那个 until 上单独打补丁——治标不治本，所以这次改在源头。
 * 超时之后继续往下跑，后面的断言会拿真实状态（多半也红）把症状一起报出来。
 */
export async function until(fn, { timeout = 8000, interval = 20, what = '条件' } = {}) {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return true;
    if (Date.now() - t0 > timeout) {
      ok(`★等不到「${what}」（超时 ${timeout}ms）`, false, what);
      return false;
    }
    await new Promise(r => setTimeout(r, interval));
  }
}

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
export const browser = await chromium.launch(launchOpts);

/* ---------- 假数据：跟真接口形状一致 ---------- */
export function fakeUpdated(){
  const now = new Date().toISOString();
  return { trips: now, bills: now, inventory: now, restaurants: now };
}
export function fakeTrips(){
  return [{
    id: 't1', title: { zh: '大阪行', en: 'Osaka trip' }, start: '2026-01-01', end: '2026-01-03',
    location: { zh: '大阪', en: 'Osaka' },
    guideUrl: 'https://example.com/guide',
    items: [
      { date: '2026-01-01', time: '10:00', title: { zh: '入住酒店', en: 'Check in' }, note: { zh: '', en: '' }, mapUrl: 'https://maps.example.com/a' },
    ],
  }];
}
export function fakeBills(){
  return [{
    id: 'b1', title: { zh: '8月账单', en: 'August bill' },
    period: '2026-08', uploadedAt: '2026-08-01T00:00:00Z', kind: 'month', filename: 'aug.pdf',
    account: 'Boss', summary: { expense: 3240.5, currency: 'USD', count: 47 },
  }];
}
/** 三份不同账户的账单 ＋ 一份**没有摘要的老账单**（summary 这个字段 2026-09-05 才有）。
 *  最后那一份是这一节最要紧的对照组：它绝不能被印成 0.00。 */
export function fakeBillsMixed(){
  return [
    { id: 'b1', title: { zh: '2026年08月 Boss 账单', en: '' }, period: '2026-08', kind: 'month',
      account: 'Boss', filename: 'a.pdf', uploadedAt: '2026-09-01T03:00:00Z',
      summary: { expense: 3240.5, currency: 'USD', count: 47 } },
    { id: 'b2', title: { zh: '2026年08月 Xiamen trip 账单', en: '' }, period: '2026-08', kind: 'month',
      account: 'Xiamen trip', filename: 'b.pdf', uploadedAt: '2026-09-01T02:00:00Z',
      summary: { expense: 860, currency: 'HKD', count: 12 } },
    { id: 'b3', title: { zh: '旧的那份（没有摘要）', en: '' }, period: '2026-07', kind: 'month',
      account: 'Boss', filename: 'c.pdf', uploadedAt: '2026-08-01T02:00:00Z' },
  ];
}
// 收藏餐厅：后端 restaurantsForBoss() 出来的形状（备注里的链接已经摘成 mapUrl）。
// 第二家刻意用长店名 + 全角括号——窄屏排版那一节要靠它。
export function fakeRestaurants(){
  return [
    { id: 'r1', name: '胖姐领头羊', region: '西港', category: '火锅', note: '',
      mapUrl: 'https://maps.app.goo.gl/mWSd7EYvVpVSbKie9', added_at: '2026-08-01T11:36:09' },
    { id: 'r2', name: '快乐小羊火锅餐厅（半岛湾店）', region: '西港', category: '火锅',
      note: '老板说这家汤底好，要提前订位',
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=%E5%BF%AB%E4%B9%90%E5%B0%8F%E7%BE%8A%20%E8%A5%BF%E6%B8%AF',
      added_at: '2026-08-20T09:00:00' },
    { id: 'r3', name: 'Chhne Meas', region: '金边', category: '柬式', note: '',
      mapUrl: 'https://maps.app.goo.gl/abc', added_at: '2026-08-21T09:00:00' },
  ];
}
// 备忘：admin 拿到全部（带 audience/notify），viewer 只拿到「给老板看」而且没勾掉的那些。
export function fakeMemosAdmin(){
  return [
    { id: 'g1', text: '周三 8:30 见客户', datetime: '2026-09-10T08:30', repeat: null,
      audience: 'boss', notify: { telegram: true, boss: true, me: false }, done: false },
    { id: 'g2', text: '护照放在保险箱第二层', datetime: null, repeat: null,
      audience: 'boss', notify: { telegram: false, boss: false }, done: false },
    { id: 'p1', text: '给老婆买生日礼物', datetime: '2026-09-20T18:00', repeat: null,
      audience: 'me', notify: { telegram: true, boss: false }, done: false },
    { id: 'd1', text: '已经办好的事', datetime: null, repeat: null,
      audience: 'boss', notify: { telegram: false, boss: false }, done: true },
  ];
}
export function fakeMemosBoss(){
  return [
    { id: 'g1', text: '周三 8:30 见客户', datetime: '2026-09-10T08:30', repeat: null },
    { id: 'g2', text: '护照放在保险箱第二层', datetime: null, repeat: null },
  ];
}
// 真实形状：id/name/count/unit/location/note/added_at，count 是整数、location 是字符串
export function fakeInventory(){
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
export function forceZh(ctx){
  return ctx.addInitScript(() => { try{ localStorage.setItem('siteLangUser', 'cn'); }catch(e){} });
}

// 真的 4 页 PDF（pypdf 生成的空白页）。**不能用假字符串**：假的 PDF 会让 PDF.js
// 解析失败、直接走错误分支，等于账单预览这条路径从来没被测过——2026-08-27
// 「账单只显示一页、滑不动」就是这样漏出去的。
export const FOUR_PAGE_PDF_B64 = 'JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgKHB5cGRmKQo+PgplbmRvYmoKMiAwIG9iago8PAovVHlwZSAvUGFnZXMKL0NvdW50IDQKL0tpZHMgWyA0IDAgUiA1IDAgUiA2IDAgUiA3IDAgUiBdCj4+CmVuZG9iagozIDAgb2JqCjw8Ci9UeXBlIC9DYXRhbG9nCi9QYWdlcyAyIDAgUgo+PgplbmRvYmoKNCAwIG9iago8PAovVHlwZSAvUGFnZQovUmVzb3VyY2VzIDw8Cj4+Ci9NZWRpYUJveCBbIDAuMCAwLjAgNTk1IDg0MiBdCi9QYXJlbnQgMiAwIFIKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1Jlc291cmNlcyA8PAo+PgovTWVkaWFCb3ggWyAwLjAgMC4wIDU5NSA4NDIgXQovUGFyZW50IDIgMCBSCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9SZXNvdXJjZXMgPDwKPj4KL01lZGlhQm94IFsgMC4wIDAuMCA1OTUgODQyIF0KL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKNyAwIG9iago8PAovVHlwZSAvUGFnZQovUmVzb3VyY2VzIDw8Cj4+Ci9NZWRpYUJveCBbIDAuMCAwLjAgNTk1IDg0MiBdCi9QYXJlbnQgMiAwIFIKPj4KZW5kb2JqCnhyZWYKMCA4CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDU0IDAwMDAwIG4gCjAwMDAwMDAxMzEgMDAwMDAgbiAKMDAwMDAwMDE4MCAwMDAwMCBuIAowMDAwMDAwMjc0IDAwMDAwIG4gCjAwMDAwMDAzNjggMDAwMDAgbiAKMDAwMDAwMDQ2MiAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDgKL1Jvb3QgMyAwIFIKL0luZm8gMSAwIFIKPj4Kc3RhcnR4cmVmCjU1NgolJUVPRgo=';

// flightLookupFlight：不传就默认「查不到」（{status:'ok'} 没带 flight 字段，
// 走 adminFlightLookup() 的 !f 分支）——这正是最常见、最该守住的场景：
// 一打开自检默认就是「查不到」，逼着断言必须去处理失败可见性，不能靠巧合蒙混过关。
export function mountRoutes(ctx, { role = 'viewer', who = 'YANG', inventory = fakeInventory(), flightLookupFlight = null, trips = null, ticketParseResult = null, dental = null, bills = null, pushTestResult = null, seen = null, leaveToday = null, leaveUpcoming = null, restaurants = null, memos = null, itineraryResult = null } = {}){
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
            ...(seen ? { seen } : {}),
            ...(leaveToday ? { leaveToday } : {}),
            ...(leaveUpcoming ? { leaveUpcoming } : {}),
            trips: trips || fakeTrips(), bills: bills || fakeBills(), inventory,
            restaurants: restaurants || fakeRestaurants(),
            // 服务端已经按身份筛过了：viewer 拿到的**只有**「给老板看」的那些，
            // 而且不带 audience/notify。这里照实模拟，别让自检活在一个更宽松的世界里。
            memos: memos || (role === 'admin' ? fakeMemosAdmin() : fakeMemosBoss()),
            dental: dental || { lastVisit: null, nextVisit: null, intervalMonths: 3, note: '' } }) });
      }
      if (req.action === 'bill'){
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify({ status: 'ok', contentBase64: FOUR_PAGE_PDF_B64, mime: 'application/pdf' }) });
      }
      if (req.action === 'pushTest'){
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify(pushTestResult || { status: 'ok', sent: 0, total: 0, results: [] }) });
      }
      if (req.action === 'accessCode'){
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify({ status: 'ok', code: 'fake-access-code' }) });
      }
      if (req.action === 'itineraryParse'){
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify(itineraryResult || { status: 'ok', title: '', items: [] }) });
      }
      if (req.action === 'ticketParse'){
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify(ticketParseResult || { status:'ok', title:'', start:null, end:null, legs: [], stays: [] }) });
      }
      if (req.action === 'flightLookup'){
        // byNo：按航班号给不同结果，用来一次跑出「查得到」和「查不到」两种分支
        const f = (flightLookupFlight && flightLookupFlight.byNo)
          ? (flightLookupFlight.byNo[req.no] || null)
          : flightLookupFlight;
        return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
          body: JSON.stringify(f ? { status: 'ok', flight: f } : { status: 'ok' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: h,
        body: JSON.stringify({ status: 'ok' }) });
    }
    return route.abort('failed');
  });
  return rec;
}

/** 点一个「应该在」的控件：不在就记一条红并回 false，**绝不让整份自检崩掉**。
 *  2026-09-02 学过一次：回退验证时测量块抛错，整个 run 当场中断，看不出哪几条会红，
 *  等于假红验证白做。凡是「按钮不在就会 timeout」的点击都要走这里。 */
export async function clickHere(page, sel, what){
  const n = await page.locator(sel).count();
  if(n === 0){ ok(`★${what}（按钮不在，后面几条等于没测）`, false, sel); return false; }
  await page.locator(sel).first().click();
  return true;
}

export async function gotoTab(page, tab){
  await page.click(`.nav-btn[data-tab="${tab}"]`);
  await until(() => page.evaluate(t => {
    const pane = document.getElementById('tab-' + t);
    return !!pane && pane.classList.contains('active');
  }, tab), { what: `切到 ${tab} 分页` });
}

/** 一份自检跑完之后的收尾：关浏览器、印结果、按成败决定退出码。
 *  两份自检各自印自己的小计，check-all 会把两行都列出来。 */
export async function finish(label) {
  await browser.close();
  console.log(`\n结果（${label}）：${pass} 通过，${fails.length} 失败`);
  if (fails.length) {
    console.log('失败项：' + fails.join('；'));
    process.exit(1);
  }
  console.log('全绿');
}
