/**
 * 老板 App 的 Service Worker（boss/boss-sw.js）行为自检。
 *
 * 为什么单独一份：check-boss.mjs 是真浏览器跑页面，但**推送事件没法从 Playwright
 * 那边发出来**，所以 SW 里最要紧的那段（收到推送怎么弹通知）一直没有任何东西守着。
 * 2026-08-29 就是这么漏的：后端一直在发 tag，SW 直接丢掉，同一类通知在通知栏
 * 堆成一长列，没人发现。
 *
 * 做法跟 check-gamebot-logic.mjs 同一路子：把 self / registration / navigator 打桩，
 * 用 vm 真跑一遍 SW 源码，再手工派发一个假的 push 事件，看它到底调了什么。
 *
 * 跑法：node tools/check-boss-sw.mjs
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let pass = 0; const fails = [];
const ok = (n, c, got) => {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fails.push(n); console.log(`  ❌ ${n} — 实际: ${JSON.stringify(got)}`); }
};

const SRC = readFileSync(new URL('../boss/boss-sw.js', import.meta.url), 'utf8');

/** 跑一遍 SW，回传「派发一个 push 事件」的函数和记录下来的调用。 */
function loadSw() {
  const listeners = {};
  const shown = [];
  const badges = [];
  const self = {
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    registration: { showNotification: (title, opts) => { shown.push({ title, opts }); return Promise.resolve(); } },
    skipWaiting: () => {},
    clients: { claim: () => {}, matchAll: async () => [], openWindow: async () => {} },
  };
  const sandbox = {
    self,
    caches: { open: async () => ({ addAll: async () => {}, put: async () => {}, match: async () => null }),
              keys: async () => [], delete: async () => true, match: async () => null },
    clients: self.clients,
    fetch: async () => ({ ok: true }),
    navigator: { setAppBadge: (n) => { badges.push(n === undefined ? 'no-arg' : n); } },
    console,
    URL, Response, Request, Promise, setTimeout,
  };
  sandbox.self.caches = sandbox.caches;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'boss-sw.js' });

  async function firePush(payloadObj) {
    const fns = listeners.push || [];
    if (!fns.length) throw new Error('SW 没有注册 push 监听器');
    const waits = [];
    const evt = {
      data: payloadObj === undefined ? null : { json: () => {
        if (payloadObj === '__BAD__') throw new Error('不是 JSON');
        return payloadObj;
      } },
      waitUntil: (p) => waits.push(p),
    };
    for (const fn of fns) fn(evt);
    await Promise.all(waits);
  }
  return { firePush, shown, badges, listeners };
}

console.log('【1】收到推送要弹通知，标题/正文/点击网址都照载荷来');
{
  const sw = loadSw();
  await sw.firePush({ title: '行程有更新', body: '新加坡小旅行', url: './#trips', tag: 'trips' });
  ok('弹了一条通知', sw.shown.length === 1, sw.shown.length);
  ok('标题用载荷里的', sw.shown[0].title === '行程有更新', sw.shown[0].title);
  ok('正文用载荷里的', sw.shown[0].opts.body === '新加坡小旅行', sw.shown[0].opts);
  ok('点击网址带进 data 里（notificationclick 要用）',
     sw.shown[0].opts.data && sw.shown[0].opts.data.url === './#trips', sw.shown[0].opts.data);
  ok('顺手标了角标', sw.badges.length === 1, sw.badges);
}

console.log('\n【2】tag 必须传给 showNotification —— 不传的话同一类通知会在通知栏堆成一长列');
// 2026-08-29 真实缺陷：后端一路在发 tag，SW 收下却不用。行程改三次 = 三条一样的通知。
{
  const sw = loadSw();
  await sw.firePush({ title: '行程有更新', body: 'A', url: './#trips', tag: 'trips' });
  ok('tag 原样传给 showNotification', sw.shown[0].opts.tag === 'trips', sw.shown[0].opts);
  ok('带 tag 时要 renotify，替换旧通知也得出声（否则新消息被无声盖掉）',
     sw.shown[0].opts.renotify === true, sw.shown[0].opts);
}

console.log('\n【3】对照组：载荷里没有 tag 时，不许自己编一个');
// 编一个的话，两条本来该并列的通知会互相replace，后来的把前面的顶掉。
{
  const sw = loadSw();
  await sw.firePush({ title: '甲', body: 'A', url: './' });
  ok('没给 tag 就不设 tag', sw.shown[0].opts.tag === undefined, sw.shown[0].opts);
  ok('没有 tag 时也不设 renotify（规范里它依赖 tag）',
     sw.shown[0].opts.renotify === undefined, sw.shown[0].opts);
}

console.log('\n【4】要带 App 图标 —— 不带的话安卓只显示一个通用小铃铛，看不出是哪个 App');
{
  const sw = loadSw();
  await sw.firePush({ title: '甲', body: 'A', url: './' });
  ok('带了 icon', !!sw.shown[0].opts.icon, sw.shown[0].opts.icon);
  ok('icon 指向仓库里真实存在的那个文件（icon-192.png）',
     String(sw.shown[0].opts.icon).includes('icon-192.png'), sw.shown[0].opts.icon);
}

console.log('\n【5】载荷坏掉/没有载荷时，也要弹一条，不能整个静默');
// 静默失败最糟：后端以为发了、用户什么都没收到，两边都不知道出了事。
{
  const sw = loadSw();
  await sw.firePush('__BAD__');
  ok('载荷不是 JSON 时照样弹一条', sw.shown.length === 1, sw.shown.length);
  ok('退回默认标题', sw.shown[0].title === '老板 App', sw.shown[0].title);

  const sw2 = loadSw();
  await sw2.firePush(undefined);
  ok('压根没有载荷时也弹一条', sw2.shown.length === 1, sw2.shown.length);
}

console.log('\n【6】showNotification 抛错也不能让整个 push 处理炸掉');
{
  const sw = loadSw();
  sw.shown.length = 0;
  // 直接把 registration 换成会抛的版本，重跑一次
  const boom = loadSw();
  boom.listeners.push.length = 0;
  // 用 vm 再跑一遍太绕，这里换个法子：验源码里那两处都包了 try
  const src = SRC.slice(SRC.indexOf("addEventListener('push'"));
  const seg = src.slice(0, src.indexOf('notificationclick'));
  ok('showNotification 包在 try 里', /try\s*\{\s*await self\.registration\.showNotification/.test(seg), seg.slice(0, 200));
  ok('setAppBadge 也包在 try 里（不是所有平台都支持）',
     /try\s*\{\s*navigator\.setAppBadge/.test(seg), seg.slice(0, 400));
}

console.log(`\n结果：${pass} 通过，${fails.length} 失败`);
if (fails.length) { console.log('失败项：' + fails.join('；')); process.exit(1); }
console.log('全绿');
