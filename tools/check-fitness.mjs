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
 *   1. 上次 3 组都做到上限（12 下）且有余力 → 建议 +2 kg（哑铃默认一次加 2 kg）；
 *   2. 连续两次同重量都有组不到下限 → 建议减到约 9 成（按加重单位取整）；
 *   3. 第 4 周是减量周 → 横幅出现、每个动作只剩 2 组、重量再打 9 折；
 *   4. 实际走一遍：勾一组 → 储存 → 记录页多一笔、下次轮到 B；
 *   5. 全屏跟练能打开、显示建议重量、按「完成这组」会往下走；
 *   6. 进度页曲线画得出来（点数＝有这动作的训练次数），体重乱填会被挡；
 *   7. 导出备份是合法 JSON，同一份再导入不会重复加；
 *   8. 手机宽度（360px）没有横向卷动、全程没有 JS 错误。
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

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function openWith(hist, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.clock.setFixedTime(NOW);
  await page.addInitScript(h => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('fit.sessions', JSON.stringify(h)); sessionStorage.setItem('seeded', '1'); } }, hist);
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

// ---- 手机宽度：没有横向卷动 ----
{
  const { ctx, page, errors } = await openWith(HIST_A, { width: 360, height: 740 });
  for (const t of ['train', 'prog', 'hist', 'more']) {
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
