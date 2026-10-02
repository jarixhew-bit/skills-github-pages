/**
 * fitness/index.html（减脂力量训练 App）的自检 —— 真浏览器跑，Playwright。
 *
 * 跑法：
 *   python3 -m http.server 8899 &
 *   node tools/check-fitness.mjs
 * 沙盒里要带 CHROMIUM_PATH=/opt/pw-browsers/chromium。
 * （`python3 tools/check-all.py` 会自动起 server 并带上 CHROMIUM_PATH。）
 *
 * 为什么要真浏览器：这个 App 的价值在「帮你算下次该用多重」，算错了用户会
 * 照着错的重量练——读代码看不出每种历史记录下它到底建议什么。所以用固定的
 * 假历史灌进 localStorage，再看画面上的建议是不是手算得出的那个数：
 *   0. 热身／放松每个动作都有动画、要点与示范（跟练里也显示要点）；
 *   1. 上次 3 组都做到上限（12 下）且有余力 → 建议 +2 kg（哑铃默认一次加 2 kg）；
 *   2. 连续两次同重量都有组不到下限 → 建议减到约 9 成（按加重单位取整）；
 *   3. 第 4 周是减量周 → 横幅出现、每个动作只剩 2 组、重量再打 9 折；
 *   4. 实际走一遍：勾一组 → 储存 → 记录页多一笔、下次轮到 B；
 *   5. 全屏跟练能打开、显示建议重量、按「完成这组」会往下走；
 *   6. 进度页曲线画得出来（点数＝有这动作的训练次数），体重乱填会被挡；
 *   7. 导出备份是合法 JSON，同一份再导入不会重复加；
 *   8. 手机宽度（360px）没有横向卷动、全程没有 JS 错误；
 *   9. 3D 引擎真的载入、每个动作（含游泳）画出来都不是空白；游泳课 12 课、过关打勾、备份含游泳进度。
 * 「今天」用 page.clock 固定住，结果不随跑的日子改变。
 */
import { chromium } from 'playwright';
import fs from 'fs';

const PORT = process.env.CHECK_PORT || 8899;
const URL = `http://localhost:${PORT}/fitness/`;
const NOW = new Date('2026-09-30T10:00:00+08:00');
const DAY = 864e5;

const fails = [];
const ok = [];
function check(cond, label) { (cond ? ok : fails).push(label); }

const sets = (ex, kg, reps, rir) => [1, 2, 3].map((n, i) => ({ ex, set: n, kg, reps: Array.isArray(reps) ? reps[i] : reps, rir, done: true }));
const sess = (id, daysAgo, wk, list, extra = {}) => ({ id, ts: NOW.getTime() - daysAgo * DAY, wk, equip: 'db', dur: 30, fin: '', sets: list, ...extra });

// 情境 A：一般周（第 2 周），深蹲该加重、卧推该减重、硬拉维持
const HIST_A = [
  // 卧推第一次 20kg 有组不到 8 下
  sess('s_1', 9, 'A', [...sets('gsquat', 12, [10, 10, 9], 2), ...sets('bench', 20, [8, 7, 6], 0), ...sets('rdl', 16, [10, 10, 10], 2)]),
  // 卧推第二次同样 20kg 仍不到 8 下；深蹲 12kg 三组都 12 下且余力 2
  sess('s_2', 2, 'A', [...sets('gsquat', 12, 12, 2), ...sets('bench', 20, [8, 7, 7], 0), ...sets('rdl', 16, [11, 10, 10], 2)]),
];
// 情境 B：第一笔训练在 3 周前 → 这周是第 4 周＝减量周
const HIST_B = [
  sess('s_10', 23, 'A', sets('gsquat', 12, 12, 2)),
  sess('s_11', 2, 'C', sets('split', 10, 8, 1)),
];

// 3D 动画要 WebGL：无头浏览器用 SwiftShader（软件算图）提供，CI 与沙盒都一样
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function openWith(hist, viewport = { width: 390, height: 844 }, opt = {}) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.clock.setFixedTime(NOW);
  // opt.cfg：预设设定（例如指定示范方式）；mediaV3 标记表示「已经升级过」，免得被自动改回动图
  await page.addInitScript(([h, c]) => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('fit.sessions', JSON.stringify(h)); if (c) localStorage.setItem('fit.cfg', JSON.stringify(c)); sessionStorage.setItem('seeded', '1'); } }, [hist, opt.cfg || null]);
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto(URL);
  await page.waitForSelector('#workout .ex');
  return { ctx, page, errors };
}

// ---- 情境 A：进步建议 ----
{
  const { ctx, page, errors } = await openWith(HIST_A);
  // 下一次应轮到 B；先切到 A 看这三个动作的建议
  const nextTag = await page.locator('#picker [data-wk="B"] small').nth(1).textContent();
  check(nextTag.includes('下一次'), '上次练 A → 下一次标在 B');
  await page.click('#picker [data-wk="A"]');
  const sugs = await page.locator('#workout .sug').allTextContents();
  check(/14 kg/.test(sugs[0]) && /加到 14/.test(sugs[0]), `深蹲 12kg×12×3 有余力 → 建议 14 kg（实得：${sugs[0]}）`);
  check(/18 kg/.test(sugs[1]) && /连续两次/.test(sugs[1]), `卧推连续两次不到 8 下 → 建议 18 kg（20×0.9=18）（实得：${sugs[1]}）`);
  check(/16 kg/.test(sugs[2]) && /维持/.test(sugs[2]), `硬拉没到上限 → 维持 16 kg（实得：${sugs[2]}）`);
  const kg0 = await page.inputValue('#kg-gsquat_0');
  check(kg0 === '14', `深蹲第 1 组重量预填建议值 14（实得：${kg0}）`);
  const rows = await page.locator('#workout [data-done^="gsquat_"]').count();
  check(rows === 3, `一般周每个动作 3 组（实得：${rows}）`);
  check(await page.locator('#deloadBanner').isHidden(), '一般周不出现减量横幅');
  // 热身/放松：每个动作都要有动画、秒数、要点（2026-09-30 用户要求「热身和放松也放动作」）
  for (const [id, n, label] of [['#warmCard', 8, '热身'], ['#coolCard', 4, '放松']]) {
    const cv = await page.locator(`${id} canvas.thumb, ${id} .ph`).count(); // 动画或真人照片都算
    const cues = await page.locator(`${id} details p`).allTextContents();
    const vids = await page.locator(`${id} a.vid`).count();
    check(cv === n && cues.length === n && cues.every(c => c.length > 8) && vids === n, `${label}清单 ${n} 个动作都有动作示范（真人照片或动画）、要点与影片（示范 ${cv}／要点 ${cues.length}／影片 ${vids}）`);
  }

  // 改成器械每次 +5：切到健身房后深蹲变腿举机，没历史 → 显示第一次试重
  await page.click('#eqSeg [data-eq="gym"]');
  const gymSug = await page.locator('#workout .sug').first().textContent();
  check(/第一次/.test(gymSug), '换到健身房版、没有历史 → 提示先试重');
  await page.click('#eqSeg [data-eq="db"]');

  // ---- 实际走一遍 ----
  await page.click('#picker [data-wk="B"]');
  await page.click('#workout [data-done="lunge_0"]');
  check(await page.locator('#rest').isHidden(), '超级组第一个动作做完不休息（直接接第二个）');
  await page.click('#workout [data-done="ohp_0"]');
  check(/1:00/.test(await page.textContent('#restT')) && await page.locator('#rest').isVisible(), '第二个动作做完 → 出现 60 秒休息倒数');
  await page.click('#restSkip');
  await page.click('#workout [data-feel="7"]');
  await page.click('#finishBtn');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fit.sessions')));
  check(stored.length === 3 && stored[2].sets.length === 2 && stored[2].wk === 'B' && stored[2].feel === 7, '勾两组储存 → 多一笔 B 训练（2 组）并记下感觉');
  const nextAfter = await page.locator('#picker [data-wk="C"] small').nth(1).textContent();
  check(nextAfter.includes('下一次'), '练完 B → 下一次标在 C');
  await page.click('nav.tabs [data-tab="hist"]');
  check((await page.locator('#histList .hist-item').count()) === 3, '记录页显示 3 笔');

  // ---- 进度页 ----
  await page.click('nav.tabs [data-tab="prog"]');
  const pts = await page.locator('#exChart circle').count();
  check(pts === 1 || pts === 2, `进度页有曲线（最近的动作点数：${pts}）`);
  await page.click('#exPick [data-exk="gsquat|db"]');
  check((await page.locator('#exChart circle').count()) === 2, '深蹲练过 2 次 → 曲线 2 个点');
  check((await page.locator('#volChart path').count()) >= 1, '每周训练量柱状图画得出来');
  await page.fill('#bKg', '5');
  await page.click('#bSave');
  check(/20–300/.test(await page.textContent('#bMsg')), '体重填 5 → 被挡下');
  await page.fill('#bKg', '72.46');
  await page.click('#bSave');
  const body = await page.evaluate(() => JSON.parse(localStorage.getItem('fit.body')));
  check(body.length === 1 && body[0].kg === 72.5, '体重 72.46 → 记成 72.5');

  // ---- 备份 ----
  await page.click('nav.tabs [data-tab="more"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
  const file = await dl.path();
  let backup = null; try { backup = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {}
  check(backup && backup.sessions.length === 3 && backup.body.length === 1, '导出备份是合法 JSON，含 3 次训练、1 笔体重');
  await page.setInputFiles('#bkFile', file);
  await page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('fit.sessions')).length);
  check(after === 3, `同一份备份再导入不会重复（仍是 ${after} 笔）`);

  // ---- 全屏跟练 ----
  await page.click('nav.tabs [data-tab="train"]');
  await page.click('#picker [data-wk="A"]');
  await page.click('#startPlayer');
  check(await page.locator('#player').isVisible(), '跟练画面能打开');
  check(/手臂跟着前后摆/.test(await page.textContent('#plCue')) && (await page.locator('#plCue a.vid').count()) === 1, '跟练热身第 1 步显示动作要点与示范链接');
  // 跳过热身 8 步到第一个动作
  for (let i = 0; i < 8; i++) await page.click('#plNextBtn');
  const plKg = await page.inputValue('#plKg');
  check(plKg === '14', `跟练里深蹲预填建议 14 kg（实得：${plKg}）`);
  await page.click('#plMain [data-rir="2"]');
  await page.click('#plAct');
  const phase = await page.textContent('#plPhase');
  check(/B1/.test(phase), `完成这组后跳到同超级组第二个动作（实得：${phase}）`);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('fit.draft')));
  check(draft.vals.gsquat_0.done && draft.vals.gsquat_0.rir === '2', '跟练里的完成与余力写进草稿（中途关掉不丢）');
  await page.click('#plClose');

  check(errors.length === 0, `情境 A 没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// ---- 情境 B：减量周 ----
{
  const { ctx, page, errors } = await openWith(HIST_B);
  check(await page.locator('#deloadBanner').isVisible(), '第 4 周 → 出现减量周横幅');
  check(/第 4 周/.test(await page.textContent('#cycleLine')), '标题行写「第 4 周」');
  await page.click('#picker [data-wk="A"]');
  const rows = await page.locator('#workout [data-done^="gsquat_"]').count();
  check(rows === 2, `减量周每个动作只剩 2 组（实得：${rows}）`);
  const sug = await page.locator('#workout .sug').first().textContent();
  // 12kg×12×3 有余力本该 +2 → 14，减量再 ×0.9=12.6 → 按 2kg 取整 = 12
  check(/12 kg/.test(sug) && /减量周/.test(sug), `减量周深蹲建议 12 kg（14×0.9 取整到 2kg）（实得：${sug}）`);
  // 关掉自动减量 → 恢复 3 组
  await page.click('nav.tabs [data-tab="more"]');
  await page.click('#cfgDeload');
  await page.click('nav.tabs [data-tab="train"]');
  check((await page.locator('#workout [data-done^="gsquat_"]').count()) === 3, '关掉自动减量 → 恢复 3 组');
  check(errors.length === 0, `情境 B 没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// ---- 3D 动画 ＋ 游泳课 ----
{
  const { ctx, page, errors } = await openWith([], undefined, { cfg: { media: '3d', mediaV3: 1 } });
  await page.waitForFunction(() => window.ANIM3D && window.ANIM3D.frames > 0, null, { timeout: 20000 }).catch(() => {});
  const f3 = await page.evaluate(() => ({ on: document.documentElement.dataset.anim, frames: window.ANIM3D ? window.ANIM3D.frames : 0 }));
  check(f3.on === '3d' && f3.frames > 0, `3D 引擎载入并在画（data-anim=${f3.on}，已画 ${f3.frames} 格）`);
  // 每个动作（含游泳）都能用 3D 画出东西，不是空白
  const blank = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 160; c.height = 120; const g = c.getContext('2d'), bad = [];
    for (const k of ANIM.keys()) { g.clearRect(0, 0, 160, 120); ANIM3D.draw(g, 160, 120, k, 0.6, {}); const d = g.getImageData(0, 0, 160, 120).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; if (n < 800) bad.push(k); }
    return { bad, total: ANIM.keys().length };
  });
  check(blank.bad.length === 0, `全部 ${blank.total} 个动作的 3D 画面都有内容${blank.bad.length ? '（空白：' + blank.bad.join(',') + '）' : ''}`);

  await page.click('nav.tabs [data-tab="swim"]');
  const drills = await page.locator('#swimList .swim-drill').count();
  const cvs = await page.locator('#swimList canvas.wide').count();
  check(drills === 12 && cvs === 12, `游泳课 12 课、每课都有动画（课 ${drills}／动画 ${cvs}）`);
  check(await page.locator('#swimSafety').evaluate(d => d.open), '还没过任何一课时，安全须知默认展开');
  check(/水中行走/.test(await page.textContent('#swimTop [data-swgo]')), '第一次打开，「下一课」指向第 1 课水中行走');
  await page.click('#sw-walk [data-swim]');
  const sw = await page.evaluate(() => JSON.parse(localStorage.getItem('fit.swim') || '{}'));
  check(sw.walk > 0, '按「我做到了」→ 记下过关日期');
  check(/1<\/span>/.test(await page.innerHTML('#swimTop')) && /吐泡泡/.test(await page.textContent('#swimTop [data-swgo]')), '过关后进度 1/12、下一课换成吐泡泡');
  await page.click('#sw-walk [data-swim]');
  check(!(await page.evaluate(() => JSON.parse(localStorage.getItem('fit.swim')).walk)), '再按一次可取消过关');
  await page.click('#sw-standup [data-swim]');
  await page.click('nav.tabs [data-tab="more"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
  const bk = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check(bk.swim && bk.swim.standup > 0, '导出备份包含游泳进度');
  // 动作示范切到简笔画 → 设置记住
  await page.click('#cfgMedia [data-media="2d"]');
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')).media)) === '2d', '动作示范改成简笔画会被记住');
  check(errors.length === 0, `3D／游泳没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// ---- 真人示范照片（2026-09-30 用户要求「动图改成真人」） ----
{
  const { ctx, page, errors } = await openWith([], undefined, { cfg: { media: 'photo', mediaV3: 1 } });
  // 每个对应到的照片编号，起始／结束两张都要真的在仓库里（漏放一张，卡片就开天窗）
  const ph = await page.evaluate(() => window.__fit.photos);
  const ids = [...new Set([...Object.values(ph.PH_EN), ...Object.values(ph.PH_ANIM)].map(p => p[0]))];
  const missing = ids.flatMap(id => [0, 1].map(k => `fitness/photos/${id}-${k}.jpg`)).filter(f => !fs.existsSync(f));
  check(missing.length === 0, `${ids.length} 组真人照片的起始／结束两张都在仓库里${missing.length ? '（缺：' + missing.join(', ') + '）' : ''}`);
  await page.click('#picker [data-wk="A"]');
  const card = page.locator('#workout .ex').filter({ hasText: '高脚杯深蹲' }).first();
  await card.locator('.ph img').nth(1).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll('#workout .ph img')].slice(0, 2).every(i => i.complete && i.naturalWidth > 0), null, { timeout: 10000 }).catch(() => {});
  const imgs = await card.locator('.ph img').evaluateAll(a => a.map(i => i.naturalWidth));
  check(imgs.length === 2 && imgs.every(w => w > 0), `默认用真人照片：高脚杯深蹲卡片两张照片都载入（宽 ${imgs.join('/')}）`);
  check((await card.locator('canvas').count()) === 0, '有真人照片的动作不再同时放动画');
  const noteHip = await page.locator('#workout .ex').filter({ hasText: '哑铃罗马尼亚硬拉' }).first().locator('.ph-note').textContent();
  check(/微弯/.test(noteHip), '照片跟动作有差异时，照片上有说明');
  check((await page.locator('#warmCard .ex').filter({ hasText: '原地高抬腿踏步' }).locator('canvas').count()) === 1, '库里没有照片的动作（高抬腿踏步）继续用动画');
  await page.click('#startPlayer');
  for (let i = 0; i < 8; i++) await page.click('#plNextBtn');
  check(await page.locator('#plPhoto .ph').isVisible() && await page.locator('#plCanvas').isHidden(), '全屏跟练的深蹲显示真人照片');
  await page.click('#plClose');
  await page.click('nav.tabs [data-tab="more"]');
  await page.click('#cfgMedia [data-media="3d"]');
  await page.click('nav.tabs [data-tab="train"]');
  check((await page.locator('#workout .ph').count()) === 0 && (await page.locator('#workout canvas.thumb').count()) > 10, '设置改成 3D → 全部换回动画');
  check(errors.length === 0, `真人照片没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// ---- 人体模型示范动图（2026-10-01 用户要「动作的 gif」，选了人体模型风） ----
{
  const { ctx, page, errors } = await openWith([]);
  // App 用到的每个「动作＋拿不拿哑铃」都要有一张动图（新增动作忘了重渲染，卡片就退回旧样子）
  const combos = await page.evaluate(() => window.__fit.animCombos());
  const missing = combos.filter(c => !fs.existsSync(`fitness/anim/${c.file}.webp`)).map(c => c.file);
  check(missing.length === 0, `${combos.length} 个动作组合都有示范动图${missing.length ? '（缺：' + missing.join(', ') + '）' : ''}`);
  const big = combos.filter(c => fs.existsSync(`fitness/anim/${c.file}.webp`) && fs.statSync(`fitness/anim/${c.file}.webp`).size > 400 * 1024).map(c => c.file);
  check(big.length === 0, `每张动图都在 400KB 以内（手机流量）${big.length ? '（超过：' + big.join(', ') + '）' : ''}`);
  await page.click('#picker [data-wk="A"]');
  const card = page.locator('#workout .ex').filter({ hasText: '高脚杯深蹲' }).first();
  await card.locator('.ph.anim img').scrollIntoViewIfNeeded();
  await card.locator('.ph.anim img').evaluate(i => i.complete && i.naturalWidth ? 1 : new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }));
  const src = await card.locator('.ph.anim img').getAttribute('src');
  const w = await card.locator('.ph.anim img').evaluate(i => i.naturalWidth);
  check(src === 'anim/squatG-one.webp' && w > 0, `默认用示范动图：高脚杯深蹲用的是拿一只哑铃那张，且载入成功（${src}，宽 ${w}）`);
  await page.click('#picker [data-wk="B"]'); // 弓步在 B 训练
  const lunge = await page.locator('#workout .ex').filter({ hasText: '反向弓步' }).first().locator('.ph.anim img').getAttribute('src');
  check(lunge === 'anim/lunge-hands.webp', `哑铃版弓步用拿两只哑铃那张（${lunge}）`);
  await page.click('#eqSeg [data-eq="bw"]');
  const lungeBw = await page.locator('#workout .ex').filter({ hasText: '反向弓步' }).first().locator('.ph.anim img').getAttribute('src').catch(() => null);
  check(lungeBw === 'anim/lunge.webp', `徒手版弓步用不拿哑铃的那张（${lungeBw}）`);
  await page.click('#eqSeg [data-eq="db"]');
  await page.click('#picker [data-wk="A"]');
  check((await page.locator('#workout .ex').filter({ hasText: '高脚杯深蹲' }).first().locator('.ph img').count()) === 1, '动图模式下卡片只放一张动图（不同时叠照片）');
  await page.click('#startPlayer');
  for (let i = 0; i < 8; i++) await page.click('#plNextBtn');
  check(/anim\/squatG-one\.webp/.test(await page.innerHTML('#plPhoto')) && await page.locator('#plCanvas').isHidden(), '全屏跟练显示示范动图');
  await page.click('#plClose');
  await page.click('nav.tabs [data-tab="swim"]');
  check((await page.locator('#sw-walk .ph.anim img').getAttribute('src')) === 'anim/wwalk.webp', '游泳课也用示范动图');
  check(errors.length === 0, `动图没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// ---- 有氧（提升 VO2max，2026-10-02 用户要求） ----
{
  const { ctx, page, errors } = await openWith([]);
  await page.click('nav.tabs [data-tab="cardio"]');
  await page.click('#cdStart');
  const w1 = await page.locator('#cdWeek .cd-sess').allTextContents();
  check(w1.length === 3 && w1.every(s => /轻松有氧 · 30 分钟/.test(s)), `第 1 周＝3 次轻松有氧各 30 分钟（实得 ${w1.length} 项）`);
  await page.fill('#cdAge', '38'); await page.click('#cdHrSave');
  // 208 − 0.7×38 = 181.4 → 181；轻松 60–70% = 108.6–126.7 → 109–127；快 90–95% = 162.9–172.0 → 163–172
  const z = await page.textContent('#cdZones');
  check(/最大心率 181/.test(z) && /109–127/.test(z) && /163–172/.test(z), `年龄 38 → 最大心率 181、轻松 109–127、快 163–172（实得：${z.replace(/\s+/g, ' ').slice(0, 120)}）`);
  check(/目标心率 109–127/.test(w1[0] + await page.textContent('#cdWeek')), '本周清单的轻松有氧带出目标心率');
  // 跟练一次轻松有氧 → 记一笔、清单打勾
  await page.click('[data-cdgo="0"]');
  check(/心率 91–109/.test(await page.textContent('#plMain')), '跟练热身显示心率区间（50–60%）');
  for (let i = 0; i < 3; i++) await page.click('#plNextBtn');
  await page.click('#plMain [data-feel="7"]');
  await page.click('#plAct');
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cardio')));
  check(rec.length === 1 && rec[0].kind === 'easy' && rec[0].min === 30 && rec[0].feel === 7, '完成一次轻松有氧 → 记下种类、分钟数、感觉');
  check((await page.locator('#cdWeek .cd-sess.done').count()) === 1 && /1 \/ 3 次/.test(await page.textContent('#cdWeek')), '本周清单变成 1 / 3、那一项打勾');
  // VO2max 记录
  await page.fill('#vVal', '100'); await page.click('#vSave');
  check(/15–90/.test(await page.textContent('#vMsg')), 'VO2max 填 100 → 被挡下');
  await page.fill('#vVal', '40'); await page.click('#vSave');
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('fit.vo2'))))[0].v === 40 && (await page.locator('#vo2Chart circle').count()) === 1, 'VO2max 40 记下并画出一个点');
  // 第 4 周：加 4×4（3 轮）；第 9 周：再加 30/30（10 回合）
  for (const [weeks, expect, label] of [[3, /4×4 间歇 · 3 轮/, '第 4 周出现 4×4（先做 3 轮）'], [8, /30\/30 短间歇 · 10 回合/, '第 9 周加上 30/30（10 回合）']]) {
    await page.evaluate(n => { const c = JSON.parse(localStorage.getItem('fit.cfg')); c.cardioStart = Date.now() - n * 7 * 864e5; localStorage.setItem('fit.cfg', JSON.stringify(c)); }, weeks);
    await page.reload(); await page.click('nav.tabs [data-tab="cardio"]');
    check(expect.test(await page.textContent('#cdWeek')), label);
  }
  // 4×4 跟练的步骤：热身＋4 快＋3 恢复＋收操＋完成 = 10 步（第 9 周是 4 轮）
  await page.locator('#cdWeek .cd-sess').filter({ hasText: '4×4 间歇' }).locator('[data-cdgo]').click();
  check(/1 \/ 10/.test(await page.textContent('#plCount')), `4×4（4 轮）的跟练共 10 步（${await page.textContent('#plCount')}）`);
  await page.click('#plNextBtn');
  check(/163–172/.test(await page.textContent('#plMain')) && /4:00/.test(await page.textContent('#plMain')), '4×4 的「快」显示 4:00 与心率 163–172');
  await page.click('#plClose');
  await page.click('#cdGarmin > summary'); // 默认收起，先展开
  await page.click('#cdgPick [data-cdg="i44"]');
  const gt = await page.textContent('#cdgText');
  check(/重复 4 次/.test(gt) && /4:00/.test(gt) && /3:00/.test(gt) && /163–172/.test(gt), 'Garmin 版 4×4 步骤正确（重复 4 次、4:00 快、3:00 恢复、心率 163–172）');
  check((await page.locator('#cdWhyBody a, #cdIqosBody a').count()) >= 10, '「为什么这样练」与「IQOS」两段都附来源链接');
  await page.click('nav.tabs [data-tab="more"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
  const bk = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check(bk.cardio && bk.cardio.length === 1 && bk.vo2 && bk.vo2.length === 1, '备份包含有氧记录与 VO2max');
  check(errors.length === 0, `有氧没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// ---- 手机宽度：没有横向卷动 ----
{
  const { ctx, page, errors } = await openWith(HIST_A, { width: 360, height: 740 });
  for (const t of ['train', 'cardio', 'swim', 'prog', 'hist', 'more']) {
    await page.click(`nav.tabs [data-tab="${t}"]`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(over <= 0, `360px 宽「${t}」页没有横向卷动（多出 ${over}px）`);
  }
  check(errors.length === 0, `窄屏没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
for (const s of ok) console.log('  ✓ ' + s);
for (const s of fails) console.log('  ✗ ' + s);
if (fails.length) { console.log(`\n失败：${fails.length} 项`); process.exit(1); }
console.log(`\n通过：减脂训练 App ${ok.length} 项全部 OK`);
