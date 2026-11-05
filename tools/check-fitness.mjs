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
 *  10. 替代动作：换了会记住（重载、跟练、Garmin、备份），换上的动作有自己的历史／建议／新纪录，不跟原动作混。
 *  11. 侧面机位：清单里每张侧面图都在、切换钮只出现在有侧面图的动作、按了换图、重载记得、进备份。
 *  12. 回归模式（停练 ≥7 天）：没停练时周期与旧公式逐日一致；停 10 天九成、25 天八成（手算取整）、
 *      回归不加重；练满 2 次后照停练前的重量往上加；停练整周不算进周期、回归那周不排减量；
 *      停练原因存得住、记录页有分隔行；关掉开关不打折；备份带开关与原因。
 * 「今天」用 page.clock 固定住，结果不随跑的日子改变。
 */
import { chromium } from 'playwright';
import fs from 'fs';
import os from 'os';

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
// （中间两周也有练：没有停练，才是单纯的减量周情境；停练的情境见「回归模式」）
const HIST_B = [
  sess('s_10', 23, 'A', sets('gsquat', 12, 12, 2)),
  sess('s_10b', 16, 'B', sets('lunge', 8, 10, 2)),
  sess('s_10c', 9, 'C', sets('split', 10, 8, 1)),
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
  await page.click('#exPick [data-exk="db:gsquat"]');
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

// ---- 回归模式（2026-11-05 用户选方案 A：停练 ≥7 天，回来头 2 次自动降重） ----
// 「停了 X 天」＝两次训练中间整整没练的天数（不算练的那两天）。今天＝2026-09-30（周三）。
{
  const SHOT = process.env.FIT_SHOT_DIR; // 有设就顺手截图（给人看横幅长相，自检本身不需要）
  const pre = (a, b) => [ // 停练前两次：深蹲该加重（14）、卧推连续不到下限（18）、硬拉维持（16）
    sess('s_r1', a, 'A', [...sets('gsquat', 12, [10, 10, 9], 2), ...sets('bench', 20, [8, 7, 6], 0), ...sets('rdl', 16, [10, 10, 10], 2)]),
    sess('s_r2', b, 'A', [...sets('gsquat', 12, 12, 2), ...sets('bench', 20, [8, 7, 7], 0), ...sets('rdl', 16, [11, 10, 10], 2)]),
  ];
  const sugsOf = async page => { await page.click('#picker [data-wk="A"]'); return page.locator('#workout .sug').allTextContents(); };

  // (a) 没有停练：cycleInfo 跟旧公式（第一笔训练那周起算，每第 4 周减量）逐日一致、不出现回归模式
  {
    const weekly = Array.from({ length: 12 }, (_, i) => sess('s_w' + i, 7 * i + 1, 'ABC'[i % 3], sets('gsquat', 12, 10, 2))); // 每 7 天练一次＝中间只空 6 天
    const { ctx, page, errors } = await openWith(weekly);
    const diff = await page.evaluate(() => {
      const ss = JSON.parse(localStorage.getItem('fit.sessions')), first = Math.min(...ss.map(s => s.ts)), out = [];
      const ws = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.getTime(); };
      for (let t = first; t <= Date.now(); t += 864e5 / 2) {
        const w = Math.round((ws(t) - ws(first)) / (7 * 864e5)), old = { week: w + 1, pos: (w % 4) + 1, deload: (w % 4) === 3 }, now = window.__fit.cycleInfo(t);
        if (old.week !== now.week || old.pos !== now.pos || old.deload !== now.deload) out.push(new Date(t).toISOString().slice(0, 10));
      }
      return { out, ret: window.__fit.retInfo() };
    });
    check(diff.out.length === 0 && diff.ret === null, `没有停练（每周练一次）→ 减量周期逐日都跟旧公式一样、不进回归模式${diff.out.length ? '（不一致：' + diff.out.slice(0, 5).join(',') + '）' : ''}`);
    check(await page.locator('#retBanner').isHidden(), '没有停练 → 不出现回归横幅');
    check(errors.length === 0, `回归 (a) 没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  // (b) 停 10 天：最后一次在 11 天前（9/19），9/20–9/29 整整 10 天没练 → 九成
  {
    const { ctx, page, errors } = await openWith(pre(18, 11));
    check(await page.locator('#retBanner').isVisible(), '停 10 天 → 出现回归横幅');
    const t = await page.textContent('#retTitle');
    check(/停了 10 天/.test(t) && /九成/.test(t) && /第 1\/2 次/.test(t), `横幅写「停了 10 天…九成…第 1/2 次」（实得：${t}）`);
    check(/为什么/.test(await page.textContent('#retBanner summary')), '横幅有「为什么」可展开');
    const s = await sugsOf(page);
    // 一般建议：深蹲 14（加重）、卧推 18、硬拉 16。回归不加重 → 底数取 min(一般建议, 停练前重量)：12、18、16
    // × 0.9 再按 2kg 取整：10.8→10、16.2→16、14.4→14
    check(/^\D*10 kg/.test(s[0]) && /回归第 1\/2 次/.test(s[0]), `深蹲：本该加到 14，回归不加重 → 12×0.9=10.8 取整 10 kg（实得：${s[0]}）`);
    check(/^\D*16 kg/.test(s[1]), `卧推：一般建议 18 × 0.9 = 16.2 → 16 kg（实得：${s[1]}）`);
    check(/^\D*14 kg/.test(s[2]), `硬拉：一般建议 16 × 0.9 = 14.4 → 14 kg（实得：${s[2]}）`);
    check((await page.inputValue('#kg-gsquat_0')) === '10', '深蹲第 1 组预填回归重量 10');
    check(!s.some(x => x.startsWith('↑')), '回归模式没有任何「加重」建议');
    if (SHOT) { await page.locator('#retBanner details').evaluate(d => { d.open = true; }); await page.screenshot({ path: SHOT + '/return-banner.png' }); await page.locator('#retBanner details').evaluate(d => { d.open = false; }); }
    // (f) 原因：选「生病」→ 存起来、重载还在、记录页显示
    await page.click('#retWhy [data-why="sick"]');
    check((await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')).gapWhy.s_r2)) === 'sick', '选「生病」→ 存进设定（以停练前最后一次训练为键）');
    await page.reload(); await page.waitForSelector('#workout .ex');
    check((await page.getAttribute('#retWhy [data-why="sick"]', 'aria-pressed')) === 'true', '重载后「生病」仍是选中');
    // 练一次：存档带 ret 标记，横幅变第 2/2 次
    await page.click('#picker [data-wk="A"]');
    await page.click('#workout [data-done="gsquat_0"]');
    await page.click('#restSkip').catch(() => {});
    await page.click('#finishBtn');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('fit.sessions')).pop());
    check(st.ret === 0.9 && st.retN === 1, `回归第 1 次存档标 ret=0.9（实得：ret=${st.ret} retN=${st.retN}）`);
    check(/第 2\/2 次/.test(await page.textContent('#retTitle')), '练完第 1 次 → 横幅变「第 2/2 次」');
    await page.click('nav.tabs [data-tab="hist"]');
    const rowsTxt = await page.locator('#histList .gap-row').allTextContents();
    check(rowsTxt.length === 1 && /停练 10 天（生病）/.test(rowsTxt[0]), `记录页有分隔行「停练 10 天（生病）」（实得：${rowsTxt.join('|')}）`);
    const order = await page.evaluate(() => [...document.querySelectorAll('#histList .hist-item, #histList .gap-row')].map(e => e.className));
    check(order.join(',') === 'hist-item,gap-row,hist-item,hist-item', `分隔行排在停练后那次与停练前那次中间（实得：${order.join(',')}）`);
    check(/回归（九成）/.test(await page.locator('#histList .hist-item').first().textContent()), '回归那次在记录里标「回归（九成）」');
    if (SHOT) await page.locator('#histList').screenshot({ path: SHOT + '/return-history.png' });
    check(errors.length === 0, `回归 (b) 没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  // (c) 停 25 天：最后一次在 26 天前（9/4）→ 八成
  {
    const { ctx, page, errors } = await openWith(pre(33, 26));
    const t = await page.textContent('#retTitle');
    check(/停了 25 天/.test(t) && /八成/.test(t), `停 25 天 → 横幅写八成（实得：${t}）`);
    const s = await sugsOf(page);
    // 12×0.8=9.6→10、18×0.8=14.4→14、16×0.8=12.8→12（2kg 取整）
    check(/^\D*10 kg/.test(s[0]) && /^\D*14 kg/.test(s[1]) && /^\D*12 kg/.test(s[2]), `八成：深蹲 10、卧推 14、硬拉 12 kg（实得：${s.slice(0, 3).join(' / ')}）`);
    check(errors.length === 0, `回归 (c) 没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  // (d) 回归 2 次练完 → 横幅消失；下次建议照停练前的 12kg×12 算（加到 14），不是照回归时的 10kg（那会变 12）
  {
    const h = [
      sess('s_d1', 30, 'A', sets('gsquat', 12, 12, 2)),
      sess('s_d2', 9, 'A', sets('gsquat', 10, 12, 2), { ret: 0.9, retN: 1 }),
      sess('s_d3', 5, 'A', sets('gsquat', 10, 12, 2), { ret: 0.9, retN: 2 }),
    ];
    const { ctx, page, errors } = await openWith(h);
    check(await page.locator('#retBanner').isHidden(), '回归 2 次练完 → 横幅消失');
    const s = await sugsOf(page);
    check(/14 kg/.test(s[0]) && /加到 14/.test(s[0]), `回归结束后按停练前的 12kg 加到 14（不是按回归的 10kg 加到 12）（实得：${s[0]}）`);
    check(errors.length === 0, `回归 (d) 没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  // (e) 减量周往后挪
  {
    // E1：8/10、8/17 练，停到 9/7（8/24、8/31 两整周没练），之后每周都练。
    //   日历上 8/10→9/28 是第 8 周（旧算法＝第 4/4 周减量），扣掉 2 个空周 → 第 6 周 → (6-1)%4+1 = 第 2/4 周，不减量
    const e1 = [51, 44, 23, 21, 16, 9, 2].map((d, i) => sess('s_e' + i, d, 'ABC'[i % 3], sets('gsquat', 12, 10, 2), i === 2 || i === 3 ? { ret: 0.9, retN: i - 1 } : {}));
    let o = await openWith(e1);
    let line = await o.page.textContent('#cycleLine');
    check(/第 6 周 · 本周期第 2\/4 周/.test(line) && await o.page.locator('#deloadBanner').isHidden(), `停练 2 整周 → 周期往后挪 2 周：第 6 周、第 2/4 周、不减量（实得：${line}）`);
    check(o.errors.length === 0, `回归 (e1) 没有 JS 错误`); await o.ctx.close();
    // E2：8/17、8/24、8/31 练（周期第 1–3 周），停到 9/21；9/21 本该是第 4 周减量，但那周是回归训练 → 减量挪到这周（9/28）
    const e2 = [44, 37, 30, 9, 7].map((d, i) => sess('s_f' + i, d, 'ABC'[i % 3], sets('gsquat', 12, 10, 2), i >= 3 ? { ret: 0.9, retN: i - 2 } : {}));
    o = await openWith(e2);
    line = await o.page.textContent('#cycleLine');
    check(/第 5 周/.test(line) && await o.page.locator('#deloadBanner').isVisible(), `回归那周不减量 → 减量周挪到下一周（第 5 周减量）（实得：${line}）`);
    const before = await o.page.evaluate(() => window.__fit.cycleInfo(Date.now() - 7 * 864e5));
    check(before.week === 4 && before.pos === 4 && !before.deload, `回归那周（9/21）是第 4 周但不减量（实得：${JSON.stringify(before)}）`);
    check(o.errors.length === 0, `回归 (e2) 没有 JS 错误`); await o.ctx.close();
    // E3：8/17、8/24、8/31 练完就停到今天（整整 29 天）→ 这周按周期是第 4 周，但正在回归 → 回归优先，不减量
    o = await openWith([44, 37, 30].map((d, i) => sess('s_g' + i, d, 'ABC'[i], sets('gsquat', 12, 10, 2))));
    check(await o.page.locator('#retBanner').isVisible() && await o.page.locator('#deloadBanner').isHidden(), '轮到减量周但正在回归 → 只出回归横幅（八成），减量周往后挪');
    check(/停了 29 天/.test(await o.page.textContent('#retTitle')), '8/31 之后没练 → 停了 29 天');
    check(o.errors.length === 0, `回归 (e3) 没有 JS 错误`); await o.ctx.close();
  }

  // (f) 已经做过的减量周是锚点（2026-11-05 用户抓到：上周减量、#756 之后这周又显示减量周）
  //   病根：早期一个整周没练的空周被扣掉，整个 4 周周期往后挪一周，上周（已按减量练过、存了 deload）的减量位落到这周。
  //   今天 9/30（周三），这周还没练。都是周三练（相隔 6 天＝不算停练），只有 7/15→7/27 停了 11 天、7/20 那周整周空。
  {
    const W = (id, d, extra) => sess(id, d, 'ABC'[d % 3], sets('gsquat', 12, 10, 2), extra);
    const DL = { deload: true };
    // 旧算法（日历周）从 7/6 起第 4、8、12 周减量＝7/27、8/24、9/21 那几周，当时就照减量练、存了 deload:true
    const F1 = [
      W('s_h0', 84), W('s_h1', 77),                         // 7/8、7/15
      W('s_h2', 65, DL), W('s_h3', 63, DL),                 // 7/27、7/29（回归那周，正好是旧算法的减量周）
      W('s_h4', 56), W('s_h5', 49), W('s_h6', 42),          // 8/5、8/12、8/19
      W('s_h7', 35, DL),                                    // 8/26 减量
      W('s_h8', 28), W('s_h9', 21), W('s_h10', 14),         // 9/2、9/9、9/16
      W('s_h11', 7, DL),                                    // 9/23 上周减量
    ];
    // 手算：7/6 起 13 个日历周，扣掉 7/20 空周＝第 12 周；最近一次减量是上周（9/21 那周）→ 这周是新周期第 1/4 周，不减量
    //   （修之前：扣周后 7/6、7/13、7/27、8/3… 数下去，8/3、8/31、9/28 是第 4 周 → 这周显示减量周）
    let o = await openWith(F1);
    let ci = await o.page.evaluate(() => window.__fit.cycleInfo());
    let line = await o.page.textContent('#cycleLine');
    check(!ci.deload && ci.pos === 1 && ci.week === 12 && !/减量/.test(line) && await o.page.locator('#deloadBanner').isHidden(), `早期空周＋上周已减量 → 这周第 12 周、第 1/4 周、不减量（实得：${line} ${JSON.stringify(ci)}）`);
    const lastWk = await o.page.evaluate(() => window.__fit.cycleInfo(Date.now() - 7 * 864e5));
    check(lastWk.deload && lastWk.pos === 4, `上周（存过减量训练）仍算减量周（实得：${JSON.stringify(lastWk)}）`);
    check(o.errors.length === 0, `减量锚点 (f1) 没有 JS 错误`); await o.ctx.close();

    // (f2) 同上，但中间几周练的日子前后挪几天（每段都 <7 天、不算停练）→ 结论一样
    const F2 = [
      W('s_k0', 84), W('s_k1', 77), W('s_k2', 65, DL), W('s_k3', 63, DL), W('s_k4', 56),
      W('s_k5', 51), W('s_k6', 47), W('s_k7', 42),          // 8/10 周一、8/14 周五（空 4 天、3 天、4 天）
      W('s_k8', 35, DL), W('s_k9', 28),
      W('s_k10', 22), W('s_k11', 16), W('s_k12', 12),       // 9/8 周二、9/14 周一、9/18 周五
      W('s_k13', 7, DL),
    ];
    o = await openWith(F2);
    ci = await o.page.evaluate(() => window.__fit.cycleInfo());
    line = await o.page.textContent('#cycleLine');
    check(!ci.deload && ci.pos === 1 && !/减量/.test(line), `短暂几天没练（<7 天）＋上周已减量 → 这周不减量（实得：${line}）`);
    check(o.errors.length === 0, `减量锚点 (f2) 没有 JS 错误`); await o.ctx.close();

    // (f3) 减量位那周整周没练（没做过减量，就不算做过）：9/2、9/9、9/16 练＝第 1–3 周，9/21 那周空 → 减量位挪到这周；
    //   但这周刚停练回来（停 13 天）→ 回归模式开着就不减量，关掉回归模式才轮到减量
    const F3 = [W('s_m0', 28), W('s_m1', 21), W('s_m2', 14)];
    o = await openWith(F3);
    ci = await o.page.evaluate(() => window.__fit.cycleInfo());
    check(ci.pos === 4 && !ci.deload && await o.page.locator('#retBanner').isVisible(), `减量位那周没练、这周回归 → 第 4/4 周但不减量（实得：${JSON.stringify(ci)}）`);
    await o.ctx.close();
    o = await openWith(F3, undefined, { cfg: { returnMode: false, mediaV3: 1 } });
    ci = await o.page.evaluate(() => window.__fit.cycleInfo());
    check(ci.pos === 4 && ci.deload && await o.page.locator('#deloadBanner').isVisible(), `减量位那周没练、没开回归模式 → 减量挪到这周（实得：${JSON.stringify(ci)}）`);
    check(o.errors.length === 0, `减量锚点 (f3) 没有 JS 错误`); await o.ctx.close();
  }

  // (g)(h) 关掉「停练后自动降重」→ 不打折；备份带着开关与原因，导入到新手机还原
  {
    const { ctx, page, errors } = await openWith(pre(18, 11));
    await page.click('#retWhy [data-why="trip"]');
    await page.click('nav.tabs [data-tab="more"]');
    check((await page.getAttribute('#cfgReturn', 'aria-pressed')) === 'true', '「停练后自动降重」默认是开');
    await page.click('#cfgReturn');
    await page.click('nav.tabs [data-tab="train"]');
    const s = await sugsOf(page);
    check(await page.locator('#retBanner').isHidden() && /加到 14/.test(s[0]) && /^\D*18 kg/.test(s[1]), `关掉自动降重 → 没有横幅、照一般建议（深蹲 14、卧推 18）（实得：${s.slice(0, 2).join(' / ')}）`);
    await page.click('nav.tabs [data-tab="more"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
    const bf = `${os.tmpdir()}/fit-ret-backup-${process.pid}.json`; fs.copyFileSync(await dl.path(), bf);
    const bk = JSON.parse(fs.readFileSync(bf, 'utf8'));
    check(bk.cfg.returnMode === false && bk.cfg.gapWhy && bk.cfg.gapWhy.s_r2 === 'trip', '备份含开关（关）与停练原因（出差）');
    check(errors.length === 0, `回归 (g) 没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
    const b2 = await openWith(pre(18, 11));
    check(await b2.page.locator('#retBanner').isVisible(), '新手机（开关默认开）先出现回归横幅');
    await b2.page.click('nav.tabs [data-tab="more"]');
    await b2.page.setInputFiles('#bkFile', bf);
    await b2.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
    const c2 = await b2.page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')));
    check(c2.returnMode === false && c2.gapWhy.s_r2 === 'trip' && (await b2.page.getAttribute('#cfgReturn', 'aria-pressed')) === 'false', '导入备份 → 开关（关）与原因（出差）都还原');
    await b2.page.click('nav.tabs [data-tab="hist"]');
    check(/停练 10 天（出差）/.test(await b2.page.textContent('#histList')), '导入后记录页显示「停练 10 天（出差）」');
    check(b2.errors.length === 0, `回归 (h) 没有 JS 错误${b2.errors.length ? '：' + b2.errors.join(' | ') : ''}`);
    await b2.ctx.close(); fs.rmSync(bf, { force: true });
  }
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
  // 动图规格（tools/lib/fitness-anim-spec.json）：每个组合都要有一条、每条都要有图、肌肉代码渲染台都认得
  // ——少了规格，渲染脚本会跳过那张（图停在旧版）；规格写了渲染台没定义的肌肉，那块就不会发光
  const spec = JSON.parse(fs.readFileSync('tools/lib/fitness-anim-spec.json', 'utf8'));
  const noSpec = combos.filter(c => !spec.some(s => s.file === c.file && s.anim === c.anim)).map(c => c.file);
  check(noSpec.length === 0, `${combos.length} 个动作组合在 fitness-anim-spec.json 都有规格（file＋anim 对得上）${noSpec.length ? '（缺：' + noSpec.join(', ') + '）' : ''}`);
  const orphan = spec.filter(s => !combos.some(c => c.file === s.file) || !fs.existsSync(`fitness/anim/${s.file}.webp`)).map(s => s.file);
  check(orphan.length === 0, `每条规格都对应 App 用到的组合与一张存在的动图${orphan.length ? '（对不上：' + orphan.join(', ') + '）' : ''}`);
  const rhtml = fs.readFileSync('tools/lib/fitness-render.html', 'utf8');
  const mblock = (rhtml.match(/const MUSCLES = \{([\s\S]*?)\n\};/) || [])[1] || '';
  const known = new Set([...mblock.matchAll(/^\s*(\w+):/gm)].map(m => m[1]));
  const unknown = [...new Set(spec.flatMap(s => [...(s.primary || []), ...(s.secondary || [])]).filter(m => !known.has(m)))];
  check(known.size >= 21 && unknown.length === 0, `规格用到的肌肉代码渲染台都有定义（渲染台认得 ${known.size} 个）${unknown.length ? '（没定义：' + unknown.join(', ') + '）' : ''}`);
  const badField = spec.filter(s => !s.title_zh || !s.cue_zh || !['strength', 'cardio', 'stretch', 'mobility', 'swim'].includes(s.type) || !['side', 'front34', 'back34', 'front'].includes(s.view)).map(s => s.file);
  check(badField.length === 0, `每条规格都有标题、要领、合法的 type 与 view${badField.length ? '（有问题：' + badField.join(', ') + '）' : ''}`);
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

// ---- 侧面机位（2026-11-04 用户：膝盖、背的角度要从侧面看）：「正面／侧面」切换 ----
// 清单正本是 App 的 SIDE_VIEW；每张都要有 anim/<file>-side.webp。切换钮只在有侧面图的动作出现，按了换图、重载后记得、进备份。
{
  const { ctx, page, errors } = await openWith([]);
  const list = await page.evaluate(() => window.__fit.SIDE_VIEW);
  const sideC = await page.evaluate(() => window.__fit.sideCombos());
  const hasSide = f => fs.existsSync(`fitness/anim/${f}-side.webp`);
  check(list.length >= 14 && sideC.length === list.length, `侧面清单 ${list.length} 个都是 App 实际用到的动图（对得上 ${sideC.length} 个）`);
  const noSide = list.filter(f => !hasSide(f));
  check(noSide.length === 0, `侧面清单每个动作都有 anim/<file>-side.webp${noSide.length ? '（缺：' + noSide.join(', ') + '）' : ''}`);
  const bigSide = list.filter(f => hasSide(f) && fs.statSync(`fitness/anim/${f}-side.webp`).size > 400 * 1024);
  check(bigSide.length === 0, `侧面动图都在 400KB 以内${bigSide.length ? '（超过：' + bigSide.join(', ') + '）' : ''}`);
  await page.click('#picker [data-wk="A"]');
  const phs = await page.$$eval('.ph.anim[data-f]', els => els.map(e => ({ f: e.dataset.f, vw: !!e.querySelector('.vw [data-view]') })));
  const wrong = phs.filter(x => x.vw !== hasSide(x.f)).map(x => x.f + (x.vw ? '（有钮没图）' : '（有图没钮）'));
  check(phs.some(x => x.vw) && phs.some(x => !x.vw) && wrong.length === 0, `「正面／侧面」切换只出现在有侧面图的动作上（${phs.filter(x => x.vw).length} 张有、${phs.filter(x => !x.vw).length} 张没有）${wrong.length ? '：' + wrong.join(', ') : ''}`);
  const card = page.locator('#workout .ex').filter({ hasText: '高脚杯深蹲' }).first();
  await card.locator('.vw [data-view="side"]').click();
  const img = card.locator('.ph.anim img');
  await img.evaluate(i => i.complete && i.naturalWidth ? 1 : new Promise(r => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }));
  check(await img.getAttribute('src') === 'anim/squatG-one-side.webp' && await img.evaluate(i => i.naturalWidth) > 0, `按「侧面」→ 卡片换成侧面动图并载入成功（${await img.getAttribute('src')}）`);
  check(await card.locator('.vw [data-view="side"]').getAttribute('aria-pressed') === 'true', '「侧面」钮标成已选');
  check(await page.locator('#workout .ex').filter({ hasText: '哑铃卧推' }).first().locator('.ph.anim img').getAttribute('src') === 'anim/bench-hands-side.webp', '选择全 App 共用：卧推卡片也跟着换成侧面');
  await page.reload(); await page.waitForSelector('#workout .ex'); await page.click('#picker [data-wk="A"]');
  check(await page.locator('#workout .ex').filter({ hasText: '高脚杯深蹲' }).first().locator('.ph.anim img').getAttribute('src') === 'anim/squatG-one-side.webp'
    && (await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')).view)) === 'side', '重载 App 后仍是侧面（存在 cfg.view）');
  // 全屏跟练：有切换钮，按「正面」换回来
  await page.click('#startPlayer');
  for (let i = 0; i < 8; i++) await page.click('#plNextBtn');
  check(/squatG-one-side\.webp/.test(await page.innerHTML('#plPhoto')) && await page.locator('#plPhoto .vw [data-view]').count() === 2, '全屏跟练显示侧面动图与切换钮');
  await page.click('#plPhoto .vw [data-view="front"]');
  check(/anim\/squatG-one\.webp/.test(await page.innerHTML('#plPhoto')) && await page.locator('#player').isVisible(), '跟练里按「正面」→ 换回正面，播放器不受影响');
  await page.click('#plClose');
  // 换动作：健身房版腿举换成史密斯深蹲，替代动作也有切换钮
  await page.click('#eqSeg [data-eq="gym"]'); await page.click('#picker [data-wk="A"]');
  const g = page.locator('#workout .ex[data-slot="gsquat"]');
  await g.locator('[data-swap]').click();
  const first = await g.locator('.alts [data-alt]').nth(1).getAttribute('data-alt');
  check(first === 'x:smithsquat', `健身房没有腿举机：替代清单第一个就是史密斯深蹲（实得 ${first}）`);
  await g.locator('.alts [data-alt="x:smithsquat"]').click();
  check(/史密斯深蹲/.test(await g.locator('h3').textContent()) && await g.locator('.vw [data-view]').count() === 2, '换成史密斯深蹲 → 卡片有自己的动图与「正面／侧面」切换');
  await g.locator('.vw [data-view="side"]').click();
  check(await g.locator('.ph.anim img').getAttribute('src') === 'anim/smithsquat-side.webp', '替代动作按「侧面」→ smithsquat-side.webp');
  for (const sl of ['lunge', 'split', 'step']) { const l = await page.evaluate(sl => window.__fit.alts.ALTS[sl], sl);
    check(l.indexOf('x:smithsquat') >= 0 && l.indexOf('x:smithsquat') < l.indexOf('gym:gsquat'), `${sl} 的替代清单里史密斯深蹲排在腿举机前面`); }
  // 备份：带着示范角度
  await page.click('nav.tabs [data-tab="more"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
  const bf = `${os.tmpdir()}/fit-view-backup-${process.pid}.json`; fs.copyFileSync(await dl.path(), bf);
  check(JSON.parse(fs.readFileSync(bf, 'utf8')).cfg.view === 'side', '导出备份包含示范角度（cfg.view）');
  check(errors.length === 0, `侧面切换没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
  const b2 = await openWith([]);
  await b2.page.click('nav.tabs [data-tab="more"]');
  await b2.page.setInputFiles('#bkFile', bf);
  await b2.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
  check((await b2.page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')).view)) === 'side', '另一台设备导入备份 → 示范角度也还原成侧面');
  await b2.ctx.close(); fs.rmSync(bf, { force: true });
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

// ---- 替代动作（2026-11-04 用户：「健身房没有器材，能不能每次多选 alternative」） ----
// 守三件事：① 换了会记住（重载、跟练、Garmin、备份都用换过的）；② 换上的动作是「它自己」——
// 腿举的重量绝不会拿去建议高脚杯深蹲，新纪录也只跟同一个动作比；③ 每个替代动作都有动图与规格。
{
  const HIST_ALT = [
    sess('s_a1', 9, 'A', sets('gsquat', 12, 12, 2)), // 哑铃版：高脚杯深蹲 12kg×12×3 → 下次 14
    sess('s_a2', 5, 'A', sets('gsquat', 80, 12, 2), { equip: 'gym' }), // 健身房版：腿举 80kg×12×3 → 下次 82.5
  ];
  const { ctx, page, errors } = await openWith(HIST_ALT);
  // 静态：每个槽位在三种器材版都至少 3 个替代，每个替代都有动图与规格
  const st = await page.evaluate(() => { const A = window.__fit.alts, out = { few: [], bad: [], combos: [] };
    for (const id in A.ALTS) for (const eq of ['db', 'bw', 'gym']) { const l = A.altList(id, eq); if (l.length < 3) out.few.push(id + '/' + eq + '=' + l.length); }
    for (const id in A.ALTS) for (const k of A.ALTS[id]) { if (!A.validKey(k)) { out.bad.push(k); continue; } const x = A.kInfo(k); out.combos.push({ k, file: x.anim + (x.hold ? '-' + x.hold : ''), anim: x.anim, tag: x.tag, name: x.name }); }
    return out; });
  check(st.few.length === 0, `每个槽位在哑铃／徒手／健身房版都有 ≥3 个替代动作${st.few.length ? '（不够：' + st.few.join(', ') + '）' : ''}`);
  check(st.bad.length === 0, `替代清单里的动作身份都有效${st.bad.length ? '（无效：' + st.bad.join(', ') + '）' : ''}`);
  const spec = JSON.parse(fs.readFileSync('tools/lib/fitness-anim-spec.json', 'utf8'));
  const noAnim = st.combos.filter(c => !fs.existsSync(`fitness/anim/${c.file}.webp`) || !spec.some(s => s.file === c.file && s.anim === c.anim)).map(c => c.k);
  check(noAnim.length === 0, `每个替代动作都有示范动图与 fitness-anim-spec.json 规格（${st.combos.length} 项）${noAnim.length ? '（缺：' + [...new Set(noAnim)].join(', ') + '）' : ''}`);
  check(st.combos.every(c => c.tag && c.name), '每个替代动作都有名称与器材标签');

  await page.click('#eqSeg [data-eq="gym"]');
  await page.click('#picker [data-wk="A"]');
  const card = () => page.locator('#workout .ex[data-slot="gsquat"]');
  check(/腿举机/.test(await card().locator('h3').textContent()) && /82\.5 kg/.test(await card().locator('.sug').textContent()), '健身房版原动作是腿举机，建议 82.5 kg（80＋2.5）');
  await card().locator('[data-swap]').click();
  const opts = card().locator('.alts [data-alt]');
  const n = await opts.count(), imgs = await card().locator('.alts .alt img').count();
  const optTxt = (await opts.allTextContents()).join(' | ');
  check(n >= 4 && imgs === n && /高脚杯深蹲/.test(optTxt) && /哑铃/.test(optTxt) && /原动作/.test(optTxt), `「换动作」列出原动作＋≥3 个替代，每个都有小动图、名称、器材标签（${n} 项）`);
  await card().locator('.alts [data-alt="db:gsquat"]').click();
  const swTxt = await card().textContent();
  check(/高脚杯深蹲/.test(await card().locator('h3').textContent()) && /已换/.test(swTxt) && /原动作：腿举机/.test(swTxt), '选了高脚杯深蹲 → 卡片换成它，并标「已换」与原动作名');
  const sugSw = await card().locator('.sug').textContent();
  check(/14 kg/.test(sugSw) && !/82|80/.test(sugSw), `换成高脚杯深蹲后的建议用它自己的历史（14 kg），不拿腿举的 80 kg（实得：${sugSw}）`);
  check((await page.locator('#workout .ex[data-slot="gsquat"] .ph.anim img').getAttribute('src')) === 'anim/squatG-one.webp', '换了之后卡片动图也换成高脚杯深蹲');
  // 记住：重载后还在；只影响健身房版
  await page.reload(); await page.waitForSelector('#workout .ex');
  await page.click('#picker [data-wk="A"]');
  check(/高脚杯深蹲/.test(await card().locator('h3').textContent()), '重载 App 后仍是换过的动作（每个槽位、每种器材版记住）');
  check((await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')).alts))['gym:gsquat'] === 'db:gsquat', '选择存在设定 cfg.alts（"gym:gsquat" → "db:gsquat"）');
  await page.click('#eqSeg [data-eq="db"]');
  check(!/已换/.test(await card().textContent()), '哑铃版不受健身房版的选择影响');
  await page.click('#eqSeg [data-eq="gym"]');
  // Garmin 文字
  check(/高脚杯深蹲（Goblet Squat）/.test(await page.textContent('#gText')) && !/腿举机/.test(await page.textContent('#gText')), 'Garmin 步骤文字用换过的动作');
  // 全屏跟练：名称、动图、建议都用换过的；跟练里也能换
  await page.click('#startPlayer');
  for (let i = 0; i < 8; i++) await page.click('#plNextBtn');
  check(/高脚杯深蹲/.test(await page.textContent('#plName')) && /squatG-one\.webp/.test(await page.innerHTML('#plPhoto')) && await page.inputValue('#plKg') === '14', '跟练第一组：名称、示范动图、预填重量（14）都用换过的动作');
  await page.click('#plMain [data-plswap]');
  await page.click('#plAlts [data-alt="db:split"]');
  check(/保加利亚分腿蹲/.test(await page.textContent('#plName')) && /已换/.test(await page.textContent('#plMain')), '跟练里按「换动作」→ 当场换成保加利亚分腿蹲');
  await page.click('#plMain [data-plswap]');
  await page.click('#plAlts [data-alt="db:gsquat"]');
  await page.fill('#plKg', '14'); await page.fill('#plReps', '12');
  await page.click('#plAct'); // 完成这组
  await page.click('#plClose');
  await page.click('#finishBtn');
  const last = (await page.evaluate(() => JSON.parse(localStorage.getItem('fit.sessions')))).pop();
  const x0 = last.sets.find(x => x.ex === 'gsquat');
  check(last.equip === 'gym' && x0 && x0.k === 'db:gsquat' && x0.kg === 14 && x0.reps === 12, `换动作后记录的组存成替代动作的身份（ex=gsquat、k=db:gsquat、14kg×12）（实得：${JSON.stringify(x0)}）`);
  check(/新纪录：高脚杯深蹲/.test(await page.textContent('#storeNote')), '新纪录只跟同一个动作比：高脚杯 14kg×12 胜过上次 12kg×12（不拿腿举 80kg 比）');
  // 恢复原动作：腿举的建议仍是 82.5（没被 14 kg 污染）
  await page.click('#picker [data-wk="A"]');
  await card().locator('[data-swap]').click();
  await card().locator('[data-restore]').click();
  check(/腿举机/.test(await card().locator('h3').textContent()) && !/已换/.test(await card().textContent()) && /82\.5 kg/.test(await card().locator('.sug').textContent()), '「恢复原动作」→ 回到腿举机，建议仍是 82.5 kg（换动作的记录没混进来）');
  check(!('gym:gsquat' in (await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')).alts))), '恢复后设定里那一笔删掉');
  // 哑铃版的高脚杯：最新一笔是健身房版里换来的 14kg（同一个动作，历史接得上）
  await page.click('#eqSeg [data-eq="db"]');
  check(/14 kg/.test(await card().locator('.sug').textContent()), '同一个动作在不同器材版的历史接得上：哑铃版高脚杯也看到上次 14 kg');
  // 记录页、进度页：各算各的
  await page.click('nav.tabs [data-tab="hist"]');
  check(/高脚杯深蹲：14kg×12/.test(await page.locator('#histList .hist-item').first().textContent()), '记录页显示换过的动作名');
  await page.click('nav.tabs [data-tab="prog"]');
  check(await page.locator('#exPick [data-exk="gym:gsquat"]').count() === 1 && await page.locator('#exPick [data-exk="db:gsquat"]').count() === 1, '进度页腿举机与高脚杯深蹲是两条不同的曲线');
  await page.click('#exPick [data-exk="db:gsquat"]');
  check((await page.locator('#exChart circle').count()) === 2, '高脚杯深蹲曲线 2 个点（哑铃版那次＋健身房换来的那次），腿举不算进来');
  await page.click('#exPick [data-exk="gym:gsquat"]');
  check((await page.locator('#exChart circle').count()) === 1, '腿举机曲线只有 1 个点');
  // 备份：换动作的选择跟着走
  await page.click('nav.tabs [data-tab="train"]');
  await page.click('#eqSeg [data-eq="gym"]');
  await page.click('#picker [data-wk="B"]');
  const r2 = page.locator('#workout .ex[data-slot="row2"]');
  await r2.locator('[data-swap]').click();
  await r2.locator('.alts [data-alt="x:pullup"]').click();
  check(/辅助引体向上/.test(await r2.locator('h3').textContent()) && /anim\/pullup\.webp/.test(await r2.innerHTML()), '高位下拉没器材 → 换成新动作「辅助引体向上」，有自己的动图');
  await page.click('nav.tabs [data-tab="more"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
  const bfile = `${os.tmpdir()}/fit-alt-backup-${process.pid}.json`; fs.copyFileSync(await dl.path(), bfile); // 关掉这个浏览器后下载档会被删，先拷一份
  const bk = JSON.parse(fs.readFileSync(bfile, 'utf8'));
  check(bk.cfg && bk.cfg.alts && bk.cfg.alts['gym:row2'] === 'x:pullup', '导出备份包含换动作的选择');
  check(errors.length === 0, `替代动作没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
  // 新手机：导入备份 → 选择还原
  const b2 = await openWith([]);
  await b2.page.click('nav.tabs [data-tab="more"]');
  await b2.page.setInputFiles('#bkFile', bfile);
  await b2.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
  await b2.page.click('nav.tabs [data-tab="train"]');
  await b2.page.click('#eqSeg [data-eq="gym"]');
  await b2.page.click('#picker [data-wk="B"]');
  check(/辅助引体向上/.test(await b2.page.locator('#workout .ex[data-slot="row2"] h3').textContent()), '在另一台设备导入备份 → 换动作的选择也还原');
  check(b2.errors.length === 0, `导入备份没有 JS 错误${b2.errors.length ? '：' + b2.errors.join(' | ') : ''}`);
  await b2.ctx.close(); fs.rmSync(bfile, { force: true });
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
