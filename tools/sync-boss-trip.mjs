/**
 * 手册 → 老板 App 行程 同步工具（2026-11-21 建，首尔手册第一个用）。
 *
 * 用户：「先把手册跟上次一样上传老板 app，行程照手册排，以后有更变再跟着一起动」。
 * 所以手册是正本：这个工具用老板 App 自己的 parseGuideHtml()（boss/index.html，管理页「从手册导入」
 * 用的同一个函数，不另写一套）把手册解析成条目，跟 butler-bot 的 data/boss-app/trips.json 里
 * **同一个 guideUrl 而且标了 guideSync:true** 的那一趟比对，不一样就改写。
 *
 * 规矩：
 *   - 只动 `guideSync: true` 的行程，而且只动还没走完的（end ≥ 今天，金边时间）。
 *   - 手册来的条目都带 `fromGuide: true`；YANG 在管理页手动加的（没这个标记）原样保留，不会被同步冲掉。
 *   - 航班查过真时刻后存下的 `trackId` 保留（同航班号同日期）。
 *   - 行程的 id / 标题 / 地点不动（那是人取的名字），起讫日期跟手册走。
 *   - 改写时更新顶层 updatedAt（老板 App 的红点靠它），recurring 原样带过。
 *   - 安全阀：解析出来的手册条目比原来少一半以上、或一条航班都没了，就不写、退出码 2——多半是手册改版、
 *     解析器认不出了，该人来看，不能把老板的行程清空。
 *
 * 跑法（本仓库根目录）：
 *   node tools/sync-boss-trip.mjs --trips ../butler-bot/data/boss-app/trips.json            # 只比对，有差异退出码 1
 *   node tools/sync-boss-trip.mjs --trips ../butler-bot/data/boss-app/trips.json --write    # 有差异就改写
 *   新建一趟（第一次上传）：
 *   node tools/sync-boss-trip.mjs --trips … --write --add seoul-trip/ --id trip-seoul-2027-01 \
 *        --title-zh "首尔 · 1月2–8日" --title-en "Seoul · 2–8 Jan"
 * 选项：--pages <本仓库根目录>（默认当前目录）、--today YYYY-MM-DD（测试用）。
 * 需要 playwright＋chromium（有 CHROMIUM_PATH 就用它）。
 * butler-bot 的 workflow「老板 App 跟着手册同步行程」（.github/workflows/boss-guide-sync.yml）每天跑 --write。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const GUIDE_BASE = 'https://jarixhew-bit.github.io/skills-github-pages/';
const args = process.argv.slice(2);
const opt = (k, d = '') => { const i = args.indexOf(k); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const flag = k => args.includes(k);

const tripsPath = opt('--trips');
const pagesRoot = path.resolve(opt('--pages', '.'));
const write = flag('--write');
const today = opt('--today') || new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);   // 金边 UTC+7
if (!tripsPath) { console.error('用法：node tools/sync-boss-trip.mjs --trips <trips.json> [--write] [--add <手册路径> --id … --title-zh … --title-en …]'); process.exit(64); }

const data = JSON.parse(fs.readFileSync(tripsPath, 'utf8'));
if (!Array.isArray(data.trips)) data.trips = [];

const addPath = opt('--add');
if (addPath) {
  const url = GUIDE_BASE + addPath.replace(/^\/+/, '');
  if (!data.trips.some(t => t && t.guideUrl === url)) {
    const id = opt('--id');
    if (!id) { console.error('--add 要配 --id'); process.exit(64); }
    data.trips.push({ id, title: { zh: opt('--title-zh'), en: opt('--title-en') }, start: '', end: '', location: { zh: '', en: '' },
      guideUrl: url, guideSync: true, items: [] });
    console.log(`新建一趟：${id}（${url}）`);
  } else {
    const t = data.trips.find(x => x.guideUrl === url);
    if (!t.guideSync) { t.guideSync = true; console.log(`${t.id} 开启跟着手册同步`); }
  }
}

const targets = data.trips.filter(t => t && t.guideSync === true && typeof t.guideUrl === 'string' && t.guideUrl.startsWith(GUIDE_BASE)
  && (!t.end || t.end >= today));
if (!targets.length) { console.log('没有要跟着手册同步的行程（guideSync:true 且还没走完）。'); process.exit(0); }

function guideFile(url) {
  let rel = url.slice(GUIDE_BASE.length).split(/[?#]/)[0];
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  return path.join(pagesRoot, rel);
}

const launchOpts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage();
await page.route('**/*', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
await page.goto(pathToFileURL(path.join(pagesRoot, 'boss/index.html')).href, { waitUntil: 'domcontentloaded' });
if (!(await page.evaluate(() => typeof parseGuideHtml === 'function' && typeof sortItemsByTime === 'function'))) {
  console.error('boss/index.html 里找不到 parseGuideHtml / sortItemsByTime'); process.exit(3);
}

const flightKey = it => (it.flight && it.flight.no ? `${String(it.flight.no).toUpperCase()}|${it.flight.date || it.date}` : '');
const itemLabel = it => `${it.date} ${it.time || (it.period || '—')} ${(it.title && (it.title.zh || it.title.en)) || ''}`;
let changed = 0, unsafe = 0;

for (const trip of targets) {
  const file = guideFile(trip.guideUrl);
  if (!fs.existsSync(file)) { console.error(`✗ ${trip.id}：手册文件不存在 ${file}`); unsafe++; continue; }
  const parsed = await page.evaluate(([h, u]) => parseGuideHtml(h, u), [fs.readFileSync(file, 'utf8'), trip.guideUrl]);

  const old = Array.isArray(trip.items) ? trip.items : [];
  const oldGuide = old.filter(it => it && it.fromGuide);
  const manual = old.filter(it => it && !it.fromGuide);
  const oldFlights = oldGuide.filter(it => it.flight).length;
  const newFlights = parsed.items.filter(it => it.flight).length;
  if (!parsed.items.length || parsed.items.length < oldGuide.length / 2 || (oldFlights && !newFlights)) {
    console.error(`✗ ${trip.id}：手册解析出 ${parsed.items.length} 条（航班 ${newFlights}），原来 ${oldGuide.length} 条（航班 ${oldFlights}）——` +
      '少太多，多半是手册改版解析器认不出了。不写，请人看一下。');
    unsafe++;
    continue;
  }
  const trackIds = new Map(oldGuide.filter(it => it.flight && it.flight.trackId).map(it => [flightKey(it), it.flight.trackId]));
  const fresh = parsed.items.map(it => {
    const o = { ...it, fromGuide: true };
    if (o.flight) {
      const tid = trackIds.get(flightKey(o));
      if (tid) o.flight = { ...o.flight, trackId: tid };
    }
    return o;
  });
  const items = await page.evaluate(list => sortItemsByTime(list), [...fresh, ...manual]);
  const next = { ...trip, start: parsed.trip.start || trip.start, end: parsed.trip.end || trip.end, items };
  if (!next.location || !(next.location.zh || next.location.en)) next.location = parsed.trip.location;
  if (!next.title || !(next.title.zh || next.title.en)) next.title = parsed.trip.title;

  if (JSON.stringify(next) === JSON.stringify(trip)) { console.log(`✓ ${trip.id}：跟手册一致（${items.length} 条）`); continue; }
  changed++;
  const key = it => JSON.stringify(it);
  const before = new Set(old.map(key)), after = new Set(items.map(key));
  console.log(`△ ${trip.id}：跟手册不一致`);
  if (next.start !== trip.start || next.end !== trip.end) console.log(`   日期 ${trip.start}~${trip.end} → ${next.start}~${next.end}`);
  old.filter(it => !after.has(key(it))).forEach(it => console.log(`   − ${itemLabel(it)}`));
  items.filter(it => !before.has(key(it))).forEach(it => console.log(`   ＋ ${itemLabel(it)}`));
  Object.assign(trip, next);
}
await browser.close();

if (changed && write) {
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(tripsPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`已改写 ${tripsPath}（${changed} 趟），updatedAt=${data.updatedAt}`);
}
process.exit(unsafe ? 2 : changed && !write ? 1 : 0);
