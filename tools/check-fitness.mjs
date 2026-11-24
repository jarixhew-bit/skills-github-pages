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
 *  13. 热身／放松换动作（门框拉伸没门框时）：动图／名称／要点／跟练／Garmin／重载／恢复／备份。
 *  14. 点示范放大：同一张图、要点与计时在放大里、跟练下一步跟着换、侧面切换、✕／Esc、放大里记组＝同一份状态。
 *  15. 动图模式下一律用新动图：A/B/C × 三种器材的卡片、跟练每一步（含燃脂收尾两个动作同框）、放大、游泳课，
 *      有 webp 的动作不准退回 3D／简笔画布（2026-11-10 用户抓到燃脂收尾还是旧模型）。
 *  16. 体态：问卷存得住／进备份；红旗挡住小课（红旗一变确认作废；高低肩没做前弯测试也挡）；有红旗不出力量日提醒；推膝碰墙差要超过 2 cm；文案守门；小课按答案与左右测试加组；照片存 IndexedDB、对比画面、进备份；
 *      深蹲提醒只在填了往哪边歪时出现；满 4 周提醒重测；8 个新动作都有动图、规格、来源。
 *  19. 第二次退件：比原文满的说法、BMI <18.5 不给少吃量、急诊红旗没有「医生看过」按钮
 *  18. 脖子前倾＋每日小习惯＋洗髓功后接体态小课：前倾问卷与结果文案、脖子红旗分流（尽快看医生／马上去急诊、不写英国电话）、小课含收下巴、
 *      ?go=posture 直接开小课（有红旗改开体态页）、洗髓功完成画面有连结、训练页早上卡片＋今天做了打勾算进本周、习惯卡标签、侧面照竖线、颅椎角 5° 误差、禁用的吓人数字。
 *  17. 饮食：蛋白 1.6 g/kg、热量按 Jensen 2013（男女区间／缺口）、16/8 分餐、每日记录与每周表、洗髓功 3.3 MET 毛／净 kcal、
 *      平台期提示（3 周没降才出、2 周不出）、燃脂收尾改名心肺收尾、备份来回、文案守门。
 *  20. 力量课后 20 分钟有氧（取代 12 周有氧计划；2026-11-23 由 15 分钟改 20 分钟）：健身房版结尾是有氧、哑铃／徒手照旧心肺收尾；前 2 周全方案3、之后 A3/B1/C2；
 *      40 岁心率手算；各段合计 20:00、kcal 与剧烈／中等分钟对得上手算；语音加速／放慢；放大；记一笔；中等／剧烈分钟（含旧记录）；旧记录照样显示＋备份来回；
 *      自查答「有」只给方案3；C 日换方案3；问年龄；洗髓功 45 分钟数字；文案守门。
 *  21. 两个加量开关（默认关）：「每个动作做 4 组」正常周 4／减量周 2、「加练手臂」三种器材（徒手不加）、跟练／Garmin／全部约几分钟（手算）、
 *      手臂加重建议与新纪录、每周训练量、旧 3 组记录相容、备份来回、文案守门。
 *  22. 有氧时长 15／20 分钟（默认 15）：旧 cfg 没设过＝15、设置与有氧页都能切、重载还在；15 分钟版三方案 900 秒、kcal 110／128／94 手算、
 *      剧烈／中等、每周当量、卡片／跟练／语音／记一笔／Garmin；方案3 仍从 5% 起；20 分钟版 1200 秒；Yin 句随设定切换；20 分钟×开关组合的总时间；备份来回；旧日志不动。
 *  23. 史密斯机算片（50→20＋5、52.5→20＋5＋1.25、凑不出给较轻／较重、杠 15 先减掉）、每个动作各自的休息（默认多关节 90／小动作 60、
 *      超级组取较长者、逐个改、恢复默认、旧 cfg.rest 迁移、总时间手算、跟练／Garmin／卡片倒数、备份来回）、体重卡（每周平均与变化手算、
 *      不足两周只给提示、目标线、备份来回、NHS 原文链接）。
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
  // 2026-11-24 起组间休息按动作分（第 23 段）。既有各段的手算都是按旧版统一的 60 秒写的：给了 opt.cfg 的情境一律当成
  // 「存过旧 cfg.rest＝60 的老用户」（App 迁移成 restBase＝60，跟改版前逐秒一样）；opt.cfg 自带 rest／restV2 的照原样。
  if (opt.cfg && !('rest' in opt.cfg) && !opt.cfg.restV2) opt = { ...opt, cfg: { rest: 60, ...opt.cfg } };
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
  // 全新用户（没给 cfg）：弓步 90＋肩推 90（多关节，默认 90 秒，2026-11-24 起）→ 这轮休息 90 秒
  check(/1:30/.test(await page.textContent('#restT')) && await page.locator('#rest').isVisible(), '第二个动作做完 → 出现这轮超级组的休息倒数（全新用户：弓步／肩推默认 90 秒 → 1:30）');
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
  // 只画看得见的画布：训练页上方卡片变多后第一张画布可能刚好在 844px 折线下，先卷到它（2026-11-19 加饮食那行后撞到）
  await page.evaluate(() => { const c = document.querySelector('#workout canvas'); if (c) c.scrollIntoView({ block: 'center' }); });
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
  await card.locator('.ph img').evaluateAll(a => Promise.all(a.map(i => i.complete && i.naturalWidth ? 1 : new Promise(r => { i.loading = 'eager'; i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); setTimeout(r, 10000); })))); // 等这张卡自己的两张（卡片上面多了体态卡，懒载入的时机会变）
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

// ---- 20. 力量课后 20 分钟有氧（2026-11-22 取代旧的 12 周有氧计划；2026-11-23 由 15 分钟改成 20 分钟） ----
// 守：健身房版力量课结尾是 20 分钟有氧（没有心肺收尾）、哑铃／徒手版照旧心肺收尾；第一次有氧后 2 周内三天都方案3、
// 之后 A→方案3、B→方案1、C→方案2（固定假日期）；40 岁心率（手算：180×85%＝153、95%＝171、70%＝126、80%＝144、90%＝162）；
// 每个方案各段加起来 20:00（1200 秒）、kcal 与剧烈／中等分钟＝手算；语音「加速」「放慢」；放大画面；记一笔（平均心率＋机器）；中等／剧烈分钟分开、旧记录也算；
// 12 周计划的画面不见了但旧记录还在、备份来回不丢；自查答「有」→ 只给方案3＋看医生；C 日可换方案3；洗髓功 45 分钟数字；文案守门。
{
  const T = NOW.getTime();
  const PROF = { profile: { sex: 'M', age: 40, kg: 72, cm: 168 }, mode: 'deficit', tre: { on: false, start: '12:00', end: '20:00', meals: 3 }, qg: { on: true, min: 45, minSet: 1 }, log: {}, setTs: T - 5 * DAY };
  const OLD = [
    { id: 'c_old1', ts: T - 40 * DAY, kind: 'easy', min: 30, rounds: null, feel: 5, note: '跑步机', week: 1 },
    { id: 'c_old2', ts: T - 1 * DAY, kind: 'easy', min: 30, rounds: null, feel: 7, note: '', week: 5 },  // 本周（2026-09-28 周一起）
    { id: 'c_old3', ts: T - 2 * DAY, kind: 'i44', min: 30, rounds: 4, feel: 9, note: '', week: 5 },     // 本周：剧烈 16、中等 14
  ];
  const T2 = { timeout: 3000 };
  async function setup(cardio, diet = PROF, cfgExtra = {}) {
    const o = await openWith([]);
    await o.page.evaluate(([c, d, x]) => {
      localStorage.setItem('fit.cardio', JSON.stringify(c)); localStorage.setItem('fit.diet', JSON.stringify(d));
      const cf = JSON.parse(localStorage.getItem('fit.cfg') || '{}'); Object.assign(cf, { equip: 'gym', cdMin: 20 }, x); /* 这一段验 20 分钟版（2026-11-24 起默认 15，15 分钟版见第 22 段） */ localStorage.setItem('fit.cfg', JSON.stringify(cf));
    }, [cardio, diet, cfgExtra]);
    await o.page.reload(); await o.page.waitForSelector('#workout .ex');
    o.page.setDefaultTimeout(5000);
    return o;
  }
  const first = d => ({ id: 'c_f', ts: T - d * DAY, kind: 'p3', min: 15, vig: 0, mod: 15, hr: 130, machine: '跑步机', day: 'A' });
  // 每一小段各自 try：前面一段炸了不会把后面的检查一起吞掉（修之前每段都该各自红）
  const guard = async (label, fn) => { try { await fn(); } catch (e) { check(false, `${label}：执行出错 ${String(e).split('\n')[0].slice(0, 160)}`); } };
  const picks = page => page.evaluate(() => ['A', 'B', 'C'].map(w => window.__fit.cardio.cdPick(w, null, true).id).join(''));

  // (a) 健身房版：卡片＋跟练都是「力量 → 有氧 20 分钟 → 放松」，没有心肺收尾
  await guard('有氧 (a) 健身房版结尾是有氧', async () => {
  {
    const { ctx, page, errors } = await setup([]);
    for (const wk of ['A', 'B', 'C']) {
      await page.click(`#picker [data-wk="${wk}"]`);
      const heads = await page.locator('#workout h2').allTextContents();
      check(heads.includes('力量课后有氧') && !heads.includes('心肺收尾'), `健身房 ${wk}：训练卡片有「力量课后有氧」、没有「心肺收尾」（${heads.join('／')}）`);
      const st = await page.evaluate(() => { document.getElementById('startPlayer').click(); return window.__fit.player().steps.map(s => ({ k: s.kind, ph: s.phase, sec: s.sec || 0, cdv: !!s.cdv })); });
      const iFirst = st.findIndex(s => s.cdv), iLog = st.findIndex(s => s.k === 'cdlog'), iCool = st.findIndex(s => /^放松/.test(s.ph)), iLastSet = st.map(s => s.k).lastIndexOf('set');
      const cdSec = st.filter(s => s.cdv).reduce((a, s) => a + s.sec, 0);
      check(iFirst > iLastSet && iLog > iFirst && iCool === iLog + 1 && cdSec === 1200 && !st.some(s => /心肺收尾/.test(s.ph)),
        `健身房 ${wk}：跟练在最后一组之后接有氧（合计 ${cdSec} 秒＝20:00）→ 记录 → 放松，没有心肺收尾步骤`);
      await page.click('#plClose');
    }
    check(errors.length === 0, `健身房有氧没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  });
  // (b) 哑铃／徒手版照旧是心肺收尾
  await guard('有氧 (b) 哑铃／徒手版照旧心肺收尾', async () => {
  for (const eq of ['db', 'bw']) {
    const { ctx, page } = await setup([], PROF, { equip: eq });
    const heads = await page.locator('#workout h2').allTextContents();
    const st = await page.evaluate(() => { document.getElementById('startPlayer').click(); return window.__fit.player().steps.map(s => s.phase + '|' + s.kind); });
    check(heads.includes('心肺收尾') && !(await page.locator('#cdBlock').count()) && st.some(x => /^心肺收尾/.test(x)) && !st.some(x => /\|cdlog/.test(x)), `${eq === 'db' ? '哑铃' : '徒手'}版：照旧有心肺收尾（卡片＋跟练），没有 20 分钟有氧`);
    await ctx.close();
  }
  });
  // (c) 前 2 周规则：没记过 → 全方案3；第一次在 13 天前 → 仍全方案3；14 天前 → A3 B1 C2 并出现「已满 2 周」；30 天前 → 配对、不再提示
  await guard('有氧 (c) 前 2 周规则', async () => {
  for (const [cd, want, note, label] of [[null, 'p3p3p3', /前 2 周三天都做方案3/, '还没记过有氧'], [13, 'p3p3p3', /到 9月30日/, '第一次有氧在 13 天前'], [14, 'p3p1p2', /已满 2 周/, '第一次有氧在 14 天前'], [30, 'p3p1p2', null, '第一次有氧在 30 天前']]) {
    const { ctx, page } = await setup(cd == null ? [] : [first(cd)]);
    const got = await picks(page);
    await page.click('#picker [data-wk="B"]');
    const nt = (await page.locator('#cdNote').count()) ? await page.textContent('#cdNote') : '';
    const nm = await page.textContent('#cdPlanName');
    check(got.replace(/p/g, 'p') === want && (note ? note.test(nt) : nt === '') && nm.includes(want === 'p3p3p3' ? '方案3' : '方案1'),
      `前 2 周规则：${label} → A/B/C＝${got}（要 ${want}），B 日卡片「${nm}」，提示「${nt.slice(0, 40)}」`);
    await ctx.close();
  }
  });
  // (d)(e)(f)(g)(h) 40 岁心率、各段合计 20:00、kcal 手算、语音、放大、记一笔
  await guard('有氧 (d–j) 心率／语音／放大／记录／分钟／旧记录／备份', async () => {
  {
    const { ctx, page, errors } = await setup([first(20), ...OLD]);
    const sums = await page.evaluate(() => Object.fromEntries(Object.entries(window.__fit.cardio.CD_PLANS).map(([k, P]) => [k, P.ph.reduce((a, p) => a + p[2], 0)])));
    check(sums.p1 === 1200 && sums.p2 === 1200 && sums.p3 === 1200, `三个方案各段加起来都是 20:00＝1200 秒（${JSON.stringify(sums)}）`);
    // kcal 手算（kcal ≈ MET × 72 kg × 小时；MET 是 Compendium 2024 的码，见 .claude/notes/fitness-cardio-research.md 第 3 节）：
    //   方案1 单车：热身 3×4.0（01214，50 W）＋用力 7×10.3（01232，151–199 W）＋轻踩 7×4.0＋放松 3×4.0
    //              ＝12＋72.1＋28＋12＝124.1 MET·分 × 72 ÷ 60 ＝ 148.92 → 149
    //   方案2 椭圆机：热身 3×5.0（02048 中等）＋快 4×9.0＋4×9.0（02049 剧烈）＋慢 3×5.0＋3×5.0＋放松 3×5.0
    //              ＝15＋72＋30＋15＝132 × 72 ÷ 60 ＝ 158.4 → 158
    //   方案3 坡度走（2026-11-24 改成从 5% 起、按心率调）：热身 2×4.8（17358，跑步机 0%、5.6–6.3 km/h——App 走 5.0，略高估）
    //              ＋坡度走 16×5.3（17034，户外 1–5% 爬坡，按起点 5% 算）＋慢走 2×4.8＝9.6＋84.8＋9.6＝104 × 72 ÷ 60 ＝ 124.8 → 125
    //              （2026-11-24 前是 20×7.0（17035，6–10%）＝140 → 168；坡度一路加到 6–10% 时主段改 7.0：9.6＋112＋9.6＝131.2×1.2＝157.44 → 157）
    // 剧烈／中等分钟（App 的推论）：方案1 用力 7×1＝7、其余 13；方案2 快段 4＋4＝8、其余 12；方案3 保守全算中等 20。
    const HAND = { p1: { kcal: 149, vig: 7, mod: 13 }, p2: { kcal: 158, vig: 8, mod: 12 }, p3: { kcal: 125, vig: 0, mod: 20 } };
    const kc = await page.evaluate(() => Object.fromEntries(Object.entries(window.__fit.cardio.CD_PLANS).map(([k, P]) => [k, {
      kcal: P.kcal, vig: P.vig, mod: P.mod, met: Math.round(P.ph.reduce((a, p) => a + p[2] / 60 * p[6], 0) * 72 / 60),
      upMin: P.ph.filter(p => p[0] === 'up').reduce((a, p) => a + p[2], 0) / 60 }])));
    check(['p1', 'p2', 'p3'].every(k => kc[k].kcal === HAND[k].kcal && kc[k].met === HAND[k].kcal && kc[k].vig === HAND[k].vig && kc[k].mod === HAND[k].mod && kc[k].vig + kc[k].mod === 20),
      `三个方案 kcal＝手算 149／158／125（每段 MET×秒 加总也一样）、剧烈＋中等＝20 分钟（${JSON.stringify(kc)}）`);
    check(kc.p1.upMin === kc.p1.vig && kc.p2.upMin === kc.p2.vig, `剧烈分钟＝「加速」段合计：方案1 ${kc.p1.upMin}、方案2 ${kc.p2.upMin}`);
    // 每周练 2 次（A→B→C 轮着做，任两天相邻）：B+C＝方案1＋方案2 → 中等 13＋12＝25、剧烈 7＋8＝15 → 折合 25＋30＝55
    const wk2 = await page.evaluate(() => { const F = window.__fit.cardio; const a = F.cdMins({ kind: 'p1' }), b = F.cdMins({ kind: 'p2' }), c = F.cdMins({ kind: 'p3' }); return { bc: a.mod + b.mod + 2 * (a.vig + b.vig), ab: c.mod + a.mod + 2 * a.vig, ca: b.mod + c.mod + 2 * b.vig, abc: a.mod + b.mod + c.mod + 2 * (a.vig + b.vig) }; });
    check(wk2.bc === 55 && wk2.ab === 47 && wk2.ca === 48 && wk2.abc === 75, `每周中等当量：2 次 B+C＝55、A+B＝47、C+A＝48，3 次＝75（${JSON.stringify(wk2)}）`);
    for (const [wk, re] of [['A', /约 125 kcal/], ['B', /约 149 kcal/], ['C', /约 158 kcal/]]) {
      await page.click(`#picker [data-wk="${wk}"]`);
      check(re.test(await page.textContent('#cdBlock')) && /20 分钟/.test(await page.textContent('#cdBlock .block-head')), `${wk} 日卡片：标题 20 分钟、写 ${re.source}`);
    }
    check((await page.evaluate(() => window.__fit.cardio.hrMax().v)) === 180, '40 岁 → 最大心率 208 − 0.7×40 ＝ 180');
    for (const [wk, re, label] of [['A', /126–144/, '方案3 坡度快走 70–80% ＝ 126–144'], ['B', /153–171[\s\S]*≤126/, '方案1 用力 85–95% ＝ 153–171、轻踩 ≤126'], ['C', /约 126[\s\S]*162–171/, '方案2 热身／慢段约 126、快段 90–95% ＝ 162–171']]) {
      await page.click(`#picker [data-wk="${wk}"]`);
      check(re.test(await page.textContent('#cdBlock')), `40 岁心率：${wk} 日 ${label}`);
    }
    // 跟练 B（方案1）：每段的目标心率、语音「加速」「放慢」
    await page.click('#picker [data-wk="B"]');
    await page.click('#startPlayer');
    await page.evaluate(() => { const F = window.__fit, st = F.player().steps, i = st.findIndex(s => s.cdv); for (let n = F.player().si; n < i; n++) document.getElementById('plNextBtn').click(); });
    const seen = [];
    for (let n = 0; n < 20; n++) {
      const r = await page.evaluate(() => { const F = window.__fit, { steps, si } = F.player(), s = steps[si]; const said = F.cardio.said(); return { cdv: !!s.cdv, name: s.name, zone: (document.querySelector('#plMain .zone') || {}).textContent || '', big: (document.querySelector('#plPhoto .cdv-w') || {}).textContent || '', say: said[said.length - 1] || '' }; });
      if (!r.cdv) break; seen.push(r);
      await page.click('#plNextBtn');
    }
    const ups = seen.filter(r => /^用力/.test(r.name)), downs = seen.filter(r => /^轻踩/.test(r.name));
    check(seen.length === 16 && ups.length === 7 && downs.length === 7 && seen[0].name === '热身' && seen[15].name === '放松', `方案1 跟练 16 段（热身＋7 用力＋7 轻踩＋放松）（实得 ${seen.length}）`);
    check(ups.every(r => /153–171/.test(r.zone) && r.big === '加速' && /^加速/.test(r.say) && /153到171/.test(r.say)) && downs.every(r => /≤126/.test(r.zone) && r.big === '放慢' && /^放慢/.test(r.say)),
      `方案1 每段：用力显示 153–171、大字＋语音「加速」；轻踩显示 ≤126、大字＋语音「放慢」（例：${JSON.stringify(ups[0] || {})}）`);
    // 放大：回到第一段用力，点 🔍
    await page.evaluate(() => { const F = window.__fit; while (!/^用力 1/.test(F.player().steps[F.player().si].name)) document.getElementById('plPrev').click(); });
    await page.click('#plPhoto [data-zoom]');
    const z1 = await page.evaluate(() => ({ w: (document.querySelector('#zmBox .cdv-w') || {}).textContent, hr: (document.querySelector('#zmBox .cdv-hr') || {}).textContent, t: !!document.getElementById('zmTime'), open: !document.getElementById('zoom').hidden }));
    await page.evaluate(() => document.getElementById('plNextBtn').click());
    const z2 = await page.evaluate(() => (document.querySelector('#zmBox .cdv-w') || {}).textContent);
    check(z1.open && z1.w === '加速' && /153–171/.test(z1.hr || '') && z1.t && z2 === '放慢', `放大：有氧段放大后看得到「加速」＋目标心率＋倒数，下一段跟着变「放慢」（${JSON.stringify(z1)} → ${z2}）`);
    await page.click('#zmClose');
    // 记一笔：跳到记录步骤，填平均心率与机器
    await page.evaluate(() => { const F = window.__fit; while (F.player().steps[F.player().si].kind !== 'cdlog') document.getElementById('plNextBtn').click(); });
    await page.fill('#plCdHr', '142'); await page.selectOption('#plCdMach', '固定单车');
    await page.click('#plAct');
    const rec = (await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cardio')))).find(c => c.kind === 'p1');
    const after = await page.evaluate(() => { const F = window.__fit, { steps, si } = F.player(); return steps[si].phase; });
    check(rec && rec.min === 20 && rec.vig === 7 && rec.mod === 13 && rec.hr === 142 && rec.machine === '固定单车' && rec.day === 'B' && /^放松/.test(after),
      `记一笔：方案1、20 分钟（剧烈 7／中等 13）、平均心率 142、固定单车、B 日，然后接着放松（${JSON.stringify(rec)}；下一步 ${after}）`);
    await page.click('#plClose');
    // (i) 本周分钟：旧 easy 30（中 30）＋旧 4×4 4 轮 30（剧 16、中 14）＋方案1（剧 7、中 13）＝中 57、剧 23、折合 57＋46＝103
    await page.click('nav.tabs [data-tab="cardio"]');
    const wk = [await page.textContent('#cdWkMod'), await page.textContent('#cdWkVig'), await page.textContent('#cdWkEq')].map(x => parseInt(x));
    check(wk[0] === 57 && wk[1] === 23 && wk[2] === 103, `本周有氧分钟：中等 57、剧烈 23、折合中等 103（实得 ${wk.join('／')}）`);
    check(/App 的推论/.test(await page.textContent('#cdWeek')) && /WHO/.test(await page.textContent('#cdWeek')), '本周分钟：「剧烈 1 分钟算 2 分钟中等」标 App 的推论，附 WHO');
    // (j) 12 周计划的画面不见了，旧记录照样读得出来
    const cdTxt = await page.textContent('#tab-cardio');
    check(!(await page.locator('#cdStart, #cdReset, .phase-bar').count()) && !/12 周(有氧)?计划|第 \d+ \/ 12 周|12 周完成|维持期/.test(cdTxt), '有氧页：12 周计划的按钮、阶段条、「第 N / 12 周」都不见了');
    const hist = await page.textContent('#cdHist');
    check(/4×4 间歇（旧计划）/.test(hist) && /轻松有氧（旧计划）/.test(hist) && /方案1 · 单车 1 分钟间歇/.test(hist) && /平均心率 142/.test(hist) && (await page.locator('#cdHist .cd-rec').count()) === 5,
      `有氧记录：旧计划 3 笔＋方案3＋方案1 共 5 笔都列得出来（${(await page.locator('#cdHist .cd-rec').count())} 笔）`);
    // 饮食页的每周活动也分中等／剧烈
    await page.click('nav.tabs [data-tab="train"]'); await page.click('#dietCard [data-open-diet]', T2).catch(() => {});
    check(/有氧 80 分钟（中等 57、剧烈 23）/.test(await page.textContent('#dQg')), '饮食页每周活动：有氧 80 分钟（中等 57、剧烈 23）');
    // 洗髓功 45 分钟：3.3×72×0.75＝178.2 毛、2.3×72×0.75＝124.2 净；×7＝1247.4／869.4 → 显示 1247／869
    const q = await page.evaluate(() => window.__fit.diet.qigong(72, 45));
    const qt = await page.textContent('#dQg'), qn = await page.textContent('#dQg .num');
    check(q.gross === 178.2 && q.net === 124.2 && q.wkGross === 1247.4 && q.wkNet === 869.4 && /178\.2/.test(qt) && /124\.2/.test(qt) && /1247\.4 ≈ 1247/.test(qt) && /869\.4 ≈ 869/.test(qt) && /315 分钟/.test(qt) && /869/.test(qn),
      `洗髓功 45 分钟：178.2／124.2、每周 1247.4≈1247／869.4≈869、315 分钟（${JSON.stringify(q)}；大字 ${qn}）`);
    // 备份来回：旧记录＋新记录＋自查都在，导入到空白手机后照样列得出来
    await page.click('#dietBack'); await page.click('nav.tabs [data-tab="more"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
    const file = await dl.path(); const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
    check(bk.cardio.length === 5 && bk.cardio.some(c => c.kind === 'i44') && bk.cardio.some(c => c.kind === 'p1' && c.hr === 142) && bk.cfg.screen && bk.cfg.screen.hbp === 'no', '备份：旧计划记录、新有氧记录（含平均心率）、运动前自查都在');
    const b2 = await openWith([]);
    await b2.page.click('nav.tabs [data-tab="more"]'); await b2.page.setInputFiles('#bkFile', file);
    await b2.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
    await b2.page.click('nav.tabs [data-tab="cardio"]');
    check((await b2.page.locator('#cdHist .cd-rec').count()) === 5 && /4×4 间歇（旧计划）/.test(await b2.page.textContent('#cdHist')), '备份导入到空白手机：5 笔有氧记录（含旧计划）都还原');
    await b2.ctx.close();
    check(errors.length === 0, `有氧跟练／记录没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  });
  // (k) 自查：预填全「没有」→ B 日方案1；改成高血压「有」→ 全方案3＋看医生；胸痛头晕「有」→ 加「先停下来」；备份带走、导入还原
  await guard('有氧 (k) 运动前自查', async () => {
  {
    const { ctx, page } = await setup([first(20)]);
    check((await picks(page)) === 'p3p1p2', '自查预填全「没有」→ 照配对');
    await page.click('nav.tabs [data-tab="cardio"]');
    check(/2026-11-22/.test(await page.textContent('#cdScrWhen')) && (await page.locator('#cdScreen [data-scrv="no"][aria-pressed="true"]').count()) === 5, '自查：5 题预填「没有」（肾脏病没问过、留空），注明是 2026-11-22 提供的答案');
    check(/不必先看医生/.test(await page.textContent('#cdScrMsg')) && /26473759/.test(await page.innerHTML('#cdScreen')) && /PMC7719906/.test(await page.innerHTML('#cdScreen')), '自查全「没有」：写 Riebe 2015／WHO：不必先看医生、可逐步加到剧烈（附来源）');
    const m0 = await page.textContent('#cdScrMsg');
    check(/^已回答的都没有/.test(m0) && /肾脏病还没回答/.test(await page.textContent('#cdScreen')), `自查：肾脏病没回答时写「已回答的都没有」，不跟「肾脏病还没回答」打架（${m0.slice(0, 12)}）`);
    await page.click('#cdScreen [data-scr="kidney"][data-scrv="no"]');
    const m1 = await page.textContent('#cdScrMsg');
    check(/^都没有/.test(m1) && !/已回答/.test(m1) && !/肾脏病还没回答/.test(await page.textContent('#cdScreen')), `自查：肾脏病也答了「没有」→ 改回「都没有」（${m1.slice(0, 12)}）`);
    await page.click('#cdScreen [data-scr="hbp"][data-scrv="yes"]');
    check((await picks(page)) === 'p3p3p3' && /App 的保守判断/.test(await page.textContent('#cdScrMsg')), '自查：高血压答「有」→ 三天都只排方案3，标 App 的保守判断');
    await page.click('nav.tabs [data-tab="train"]'); await page.click('#picker [data-wk="B"]');
    const nt = await page.textContent('#cdNote');
    check(/高血压/.test(nt) && /医生/.test(nt) && (await page.textContent('#cdPlanName')).includes('方案3') && !(await page.locator('[data-cdalt]').count()), `自查答「有」：训练页 B 日改方案3、提示看医生、没有换方案按钮（${nt.slice(0, 50)}）`);
    await page.click('nav.tabs [data-tab="cardio"]'); await page.click('#cdScreen [data-scr="sym"][data-scrv="yes"]');
    check(/先停下来，看医生/.test(await page.textContent('#cdScrMsg')), '自查：胸痛／头晕答「有」→ 写「先停下来，看医生」');
    await page.click('nav.tabs [data-tab="more"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
    const file = await dl.path();
    const b2 = await openWith([]);
    await b2.page.click('nav.tabs [data-tab="more"]'); await b2.page.setInputFiles('#bkFile', file);
    await b2.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
    const sc = await b2.page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')).screen);
    check(sc && sc.hbp === 'yes' && sc.sym === 'yes' && !sc.preset, '自查：改过的答案随备份带走，导入到还是预填的手机会还原');
    await b2.ctx.close(); await ctx.close();
  }
  });
  // (l) C 日腿太酸：换成方案3（只这次）、跟练跟着换、恢复
  await guard('有氧 (l) C 日换方案3', async () => {
  {
    const { ctx, page } = await setup([first(20)]);
    await page.click('#picker [data-wk="C"]');
    check((await page.textContent('#cdPlanName')).includes('方案2'), 'C 日：方案2 椭圆机 2×4');
    await page.click('[data-cdalt="p3"]');
    const st = await page.evaluate(() => window.__fit.cardio.cdPick('C').id);
    check(st === 'p3' && (await page.textContent('#cdPlanName')).includes('方案3') && /原本是 方案2/.test(await page.textContent('#cdSwapNote')), 'C 日按「换成方案3」→ 卡片变方案3、注明原本是方案2');
    const ph = await page.evaluate(() => { document.getElementById('startPlayer').click(); return window.__fit.player().steps.filter(s => s.cdv).map(s => s.name).join('、'); });
    check(/坡度走/.test(ph) && !/快段/.test(ph), `C 日换成方案3 后跟练也是坡度快走（${ph}）`);
    await page.click('#plClose');
    await page.click('[data-cdalt=""]');
    check((await page.textContent('#cdPlanName')).includes('方案2'), 'C 日按「恢复」→ 回到方案2');
    await ctx.close();
  }
  });
  // (m) 不知道年龄：卡片里问；填 40 → 显示 126–144，也写进饮食页的资料
  await guard('有氧 (m) 问年龄＋洗髓功 45', async () => {
  {
    const { ctx, page } = await setup([], { profile: {}, mode: 'deficit', tre: { on: false, start: '12:00', end: '20:00', meals: 3 }, qg: { on: false, min: 40 }, log: {}, setTs: 0 });
    check(await page.locator('#cdAgeAsk').isVisible() && /先填年龄/.test(await page.textContent('#cdBlock')), '不知道年龄：有氧卡片里问年龄、心率先不乱给');
    await page.fill('#cdAgeIn', '40'); await page.click('#cdAgeSave');
    const d = await page.evaluate(() => JSON.parse(localStorage.getItem('fit.diet')));
    check(/126–144/.test(await page.textContent('#cdBlock')) && d.profile.age === 40 && !(await page.locator('#cdAgeAsk').count()), '填 40 岁 → 卡片显示 126–144、年龄存进饮食资料');
    // 洗髓功：旧的默认 40（没自己选过）→ 改成 45；45 在选项里且被选中
    check((await page.evaluate(() => window.__fit.diet.get().qg.min)) === 45, '洗髓功：旧默认 40 分钟（没自己选过）→ 自动改成 45');
    await page.click('nav.tabs [data-tab="more"]'); await page.click('#cfgQg');
    check((await page.locator('#cfgQgMin [data-qm="45"][aria-pressed="true"]').count()) === 1, '洗髓功设定有 45 分钟选项、默认选中');
    await ctx.close();
  }
  });
  await guard('有氧 (m2) 洗髓功自己选过 40', async () => {
  {
    const { ctx, page } = await setup([], { ...PROF, qg: { on: true, min: 40, minSet: 1 } });
    check((await page.evaluate(() => window.__fit.diet.get().qg.min)) === 40, '洗髓功：自己选过 40 分钟的不改');
    await ctx.close();
  }
  });
  // (o) 方案3 起点（2026-11-24 用户实测：坡度 8–10% 心率一路超标，但还能聊天）：热身 2 → 坡度走 8×2 分钟（从 5% 起、每 2 分钟按心率调、上限 12%）→ 慢走 2；
  //     心率与说话对不上时的说明；最大心率自填 190 时所有方案心率、语音、Garmin、强度界线都重算。
  // 手算（App 取整＝Math.round(HRmax×%÷100)）：
  //   180（40 岁）：70%→126、76%→136.8→137、77%→138.6→139、80%→144；138 在两档之间
  //   190（自填）：70%→133、76%→144.4→144、77%→146.3→146、80%→152、85%→161.5→162、90%→171、95%→180.5→181；145 在两档之间
  await guard('有氧 (o) 方案3 新起点＋最大心率自填重算', async () => {
  {
    const { ctx, page, errors } = await setup([first(20)]);
    const P3 = await page.evaluate(() => window.__fit.cardio.CD_PLANS.p3);
    const types = P3.ph.map(p => p[0]).join(','), secs = P3.ph.map(p => p[2]), mets = P3.ph.map(p => p[6]);
    check(P3.ph.length === 10 && types === 'warm,' + Array(8).fill('chk').join(',') + ',cool' && secs.every(x => x === 120) && mets.join(',') === '4.8,' + Array(8).fill('5.3').join(',') + ',4.8',
      `方案3：热身 2 分钟（MET 4.8）→ 坡度走 8 段×2 分钟（MET 5.3）→ 慢走 2 分钟（4.8）（实得 ${types}／${mets.join(',')}）`);
    const allTxt = JSON.stringify(P3);
    check(/从坡度 5%/.test(P3.sum) && /最高 12%/.test(P3.sum) && /坡度调到 5%、时速 5\.0 km/.test(P3.ph[1][4]) && P3.ph.slice(2, 9).every(p => /减 1%/.test(p[4]) && /加 0\.5%/.test(p[4]) && /最高 12%/.test(p[4])) && /0%/.test(P3.ph[9][4]) && !/8–12/.test(allTxt) && /App 的安排/.test(allTxt),
      `方案3 文案：从坡度 5%、时速 5.0 起，每 2 分钟高于上限减 1%、低于下限加 0.5%、最高 12%，最后慢走坡度 0%，标 App 的安排（${P3.sum}）`);
    await page.click('#picker [data-wk="A"]');
    const card = await page.textContent('#cdBlock');
    check(/坡度太陡心率容易一路升高，宁可从低坡度开始往上加（App 的安排）/.test(card) && /心率超过目标、但还能轻松讲完整句子/.test(card) && /最大心率/.test(card) && /能讲完整句子、但唱不了歌/.test(card) && /82±7%/.test(card) && /App 的推论/.test(card),
      'A 日方案3 卡片：写起点理由（App 的安排）＋心率与说话对不上时的说明（82±7%、App 的推论、去填最大心率）');
    await page.click('#picker [data-wk="B"]');
    check(!/心率超过目标、但还能轻松讲完整句子/.test(await page.textContent('#cdBlock')), 'B 日方案1 卡片不放方案3 的说话测验说明');
    await page.click('nav.tabs [data-tab="cardio"]');
    const why = await page.textContent('#cdWhyBody'), wkT = await page.textContent('#cdWeek'), zones = await page.textContent('#cdZones');
    check(/心率超过目标、但还能轻松讲完整句子/.test(zones) && /Quinn|82±7%/.test(zones), '有氧页「心率区间」：心率与说话对不上时的说明');
    const b180 = ['126–137 属中等', '139–144 已进入剧烈下端', '138 落在两档之间', '分钟数这里取保守的中等计（App 的保守判断）'];
    check(b180.every(b => why.includes(b) && wkT.includes(b)) && /17034/.test(why) && /17034/.test(wkT), `最大心率 180：方案3 强度两处都写 ${b180.join('、')}，MET 写 17034（坡度 5%）`);
    const g180 = await page.evaluate(() => { document.querySelector('[data-cdg="p3"]').click(); return document.getElementById('cdgText').textContent; });
    check(/2:00/.test(g180) && /16:00/.test(g180) && /从坡度 5%/.test(g180) && /最高 12%/.test(g180) && /126–144/.test(g180) && !/8–12/.test(g180), `Garmin 方案3：热身 2:00、坡度走 16:00（从 5% 起、最高 12%、心率 126–144）、慢走（${g180.replace(/\n/g, ' / ')}）`);
    // 自填 190
    await page.fill('#cdHrMax', '190'); await page.click('#cdHrSave');
    check((await page.evaluate(() => window.__fit.cardio.hrMax().v)) === 190 && /最大心率 190（你填的）/.test(await page.textContent('#cdZones')), '最大心率自填 190 → hrMax＝190（你填的）');
    const z = await page.textContent('#cdZones');
    check(/133–152/.test(z) && /162–181/.test(z) && /171–181/.test(z) && /≤133/.test(z), `心率区间（190）：方案3 133–152、方案1 162–181、方案2 171–181、慢段 ≤133（${z.slice(0, 160)}）`);
    const why2 = await page.textContent('#cdWhyBody'), wk2 = await page.textContent('#cdWeek');
    const b190 = ['133–144 属中等', '146–152 已进入剧烈下端', '145 落在两档之间'];
    check(b190.every(b => why2.includes(b) && wk2.includes(b)), `最大心率 190：方案3 强度两处改成 ${b190.join('、')}`);
    const g190 = await page.evaluate(() => { document.querySelector('[data-cdg="p3"]').click(); return document.getElementById('cdgText').textContent; });
    check(/133–152/.test(g190) && !/126–144/.test(g190), 'Garmin 方案3（190）：心率 133–152');
    await page.click('nav.tabs [data-tab="train"]');
    for (const [wk, re, label] of [['A', /133–152/, '方案3 133–152'], ['B', /162–181[\s\S]*≤133/, '方案1 162–181、轻踩 ≤133'], ['C', /约 133[\s\S]*171–181/, '方案2 约 133、快段 171–181']]) {
      await page.click(`#picker [data-wk="${wk}"]`);
      check(re.test(await page.textContent('#cdBlock')), `最大心率 190：${wk} 日卡片 ${label}`);
    }
    // 跟练 A（方案3）：每段的心率与语音
    await page.click('#picker [data-wk="A"]'); await page.click('#startPlayer');
    await page.evaluate(() => { const F = window.__fit, st = F.player().steps, i = st.findIndex(s => s.cdv); for (let n = F.player().si; n < i; n++) document.getElementById('plNextBtn').click(); });
    const seen = [];
    for (let n = 0; n < 14; n++) {
      const r = await page.evaluate(() => { const F = window.__fit, { steps, si } = F.player(), s = steps[si]; const said = F.cardio.said(); return { cdv: !!s.cdv, name: s.name, hr: s.hrTxt || '', big: (document.querySelector('#plPhoto .cdv-w') || {}).textContent || '', say: said[said.length - 1] || '' }; });
      if (!r.cdv) break; seen.push(r); await page.click('#plNextBtn');
    }
    const mid = seen.slice(1, 9);
    check(seen.length === 10 && seen[0].big === '热身' && /^热身/.test(seen[0].say) && mid.every(r => /^坡度走/.test(r.name) && r.hr === '心率 133–152' && r.big === '看心率' && /^看心率/.test(r.say) && /133到152/.test(r.say)) && seen[9].big === '放慢' && /^放慢/.test(seen[9].say),
      `方案3 跟练（190）：热身 → 8 段「看心率」心率 133–152、语音念 133到152 → 慢走「放慢」（${seen.length} 段；例 ${JSON.stringify(mid[0] || {})}）`);
    await page.click('#plClose');
    check(errors.length === 0, `方案3 新起点没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  });
  // (n) 文案守门
  await guard('有氧 (n) 文案守门', async () => {
  {
    const html = fs.readFileSync('fitness/index.html', 'utf8');
    const BANNED = ['12 周有氧计划', '/ 12 周', '12 周完成', '从这周开始', 'cdStart', 'CD_WEEKS', 'CD_PHASE', '4×4 间歇是主力', '提升 VO2max 最主要的一招', '燃脂有氧', '燃烧脂肪', '燃脂区', '有氧减脂', '29086308',
      'Coyle', 'Seiler', 'firstbeat', '+4.9', '本次未重新查证', '几乎没有，要说清楚', '多 6.91%', '有氧也一样',
      // 2026-11-24 起 15／20 分钟可选：两种版本的 Yin 句都写死在 CD_YIN，哪一句出现在画面上由第 22 段验
      '只有方案1 符合',
      // 2026-11-24 方案3 起点改成坡度 5%（用户实测 8–10% 心率超标）
      '8–12%', '连续 20 分钟不另分热身放松', '按 MET 估算也接近剧烈', '15 分钟能练到什么', '缩成 5 次'];
    const hit = BANNED.filter(b => html.includes(b)).concat(/燃脂(?!开关)/.test(html) ? ['燃脂（非「燃脂开关」）'] : []);
    check(hit.length === 0, `有氧文案：旧 12 周计划与「燃脂」说法不再出现${hit.length ? '（还在：' + hit.join('、') + '）' : ''}`);
    const need = ['28917030', '34757594', '22002517', '37939367', '31401727', '17414804', '20100740', '27115137', '26243014', '25010379', '21774751', '35507232', 'PMC7719906', '26473759', '11153730',
      '6.91 个百分点', '很小或没有', '三个方案都不在这个定义里', '方案1 整节 20 分钟、用力共 7 分钟', '方案2 整节 20 分钟、快段共 8 分钟', '户外爬坡', '这里取保守的中等', '心肺与血压（App 的推论）', 'SMD 1.19', 'SMD −0.22', '7.2%', '82% 最大心率', '150–300', '75–150', '这个精确组合没有直接试验', '「2×4」没有直接试验', '剧烈 1 分钟算 2 分钟中等」是 App 的推论',
      '能提升体能，但不能改善身体组成', 'App 的保守判断', '“risk factor profiling is no longer included”'];
    const miss = need.filter(b => !html.includes(b));
    check(miss.length === 0, `有氧文案：查证过的数字、来源与界线标签都在${miss.length ? '（缺：' + miss.join('、') + '）' : ''}`);
    // 方案3 强度的 bpm 界线改成按最大心率现算（2026-11-24），改在 (o) 用画面文字验（180 与 190 两种）
    check(!html.includes('按心率算中等') && html.includes('分钟数这里取保守的中等计（App 的保守判断）'),
      '方案3 强度：不再写「按心率算中等」，标「分钟数这里取保守的中等计（App 的保守判断）」（两处画面由 (o) 验）');
  }
  });
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
    // 加练手臂的两个槽位（2026-11-23，开关默认关）只有哑铃／健身房版，互为替代：各 1 个就够
    for (const id in A.ALTS) for (const eq of ['db', 'bw', 'gym']) { const arm = id === 'curl' || id === 'tri'; if (arm && eq === 'bw') continue; const l = A.altList(id, eq); if (l.length < (arm ? 1 : 3)) out.few.push(id + '/' + eq + '=' + l.length); }
    for (const id in A.ALTS) for (const k of A.ALTS[id]) { if (!A.validKey(k)) { out.bad.push(k); continue; } const x = A.kInfo(k); out.combos.push({ k, file: x.anim + (x.hold ? '-' + x.hold : ''), anim: x.anim, tag: x.tag, name: x.name }); }
    return out; });
  check(st.few.length === 0, `每个槽位在哑铃／徒手／健身房版都有 ≥3 个替代动作（手臂两个槽位 ≥1）${st.few.length ? '（不够：' + st.few.join(', ') + '）' : ''}`);
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

// ---- 热身／放松的替代动作（2026-11-10 用户：「拉伸门框的能不能有 alternative，有时遇到没有门框」） ----
// 守：放松的门框拉伸有「换动作」、换了动图／名称／要点／跟练／Garmin 都跟着换、重载记得、恢复原动作、备份来回；
// 每个热身／放松的替代都有动图与规格。
{
  const { ctx, page, errors } = await openWith([]);
  const st = await page.evaluate(() => { const M = window.__fit.moves, out = { combos: [], few: [] };
    for (const slot in M.MOVE_ALTS) { if (M.MOVE_ALTS[slot].length < 3) out.few.push(slot); for (const n of M.MOVE_ALTS[slot]) { const w = M.MOVEX[n].w; out.combos.push({ n, anim: w[2], sec: w[1], tag: M.MOVEX[n].tag }); } }
    out.origSec = Object.fromEntries(Object.keys(M.MOVE_ALTS).map(slot => [slot, M.WARM.concat(M.COOL).find(w => w[2] === slot)[1]]));
    out.slotOf = Object.fromEntries(Object.entries(M.MOVE_ALTS).flatMap(([slot, l]) => l.map(n => [n, slot])));
    return out; });
  const spec = JSON.parse(fs.readFileSync('tools/lib/fitness-anim-spec.json', 'utf8'));
  check(st.few.length === 0 && st.combos.length >= 3, `门框拉伸至少 3 个替代（${st.combos.length} 个）`);
  const miss = st.combos.filter(c => !fs.existsSync(`fitness/anim/${c.anim}.webp`) || !spec.some(s => s.file === c.anim && s.anim === c.anim && s.type === 'stretch' && (s.sources || []).length >= 2)).map(c => c.n);
  check(miss.length === 0, `每个热身／放松替代都有动图＋拉伸规格（≥2 个来源）${miss.length ? '（缺：' + miss.join(', ') + '）' : ''}`);
  check(st.combos.every(c => c.tag && c.sec === st.origSec[st.slotOf[c.n]]), '每个热身／放松替代都有器材标签、秒数跟原动作一样（计时器总长不变）');
  const cool = () => page.locator('#coolCard .ex[data-mslot="chest"]');
  check(await page.locator('#coolCard [data-mswap]').count() === 1 && await cool().locator('[data-mswap]').count() === 1, '放松只有门框胸部拉伸有「换动作」（其他动作没有需要就不加）');
  await cool().locator('[data-mswap]').click();
  const it = cool().locator('.alts [data-malt]');
  const optTxt = (await it.allTextContents()).join(' | ');
  check(await it.count() === 4 && await cool().locator('.alts .alt img').count() === 4 && /原动作/.test(optTxt) && /墙／柱子/.test(optTxt) && /不用器材/.test(optTxt) && /地板/.test(optTxt) && /30 秒/.test(optTxt),
    `换动作清单：原动作＋3 个替代，各有小动图、名称、器材标签、秒数（${await it.count()} 项）`);
  if (process.env.SHOT_SWAP) await page.screenshot({ path: process.env.SHOT_SWAP, clip: await cool().boundingBox().then(b => ({ x: 0, y: Math.max(0, b.y - 10), width: 390, height: Math.min(844, b.height + 20) })) });
  await cool().locator('.alts [data-malt="wallpec"]').click();
  check(/靠墙单臂胸部拉伸/.test(await cool().locator('h3').textContent()) && /已换/.test(await cool().textContent()) && /原动作：门框胸部拉伸/.test(await cool().textContent()), '选了靠墙版 → 卡片名称换掉，标「已换」与原动作名');
  check((await cool().locator('.ph.anim img').getAttribute('src')) === 'anim/wallpec.webp' && /离开墙/.test(await cool().locator('details p').textContent()), '卡片动图与动作要点都换成靠墙版');
  await page.reload(); await page.waitForSelector('#workout .ex');
  check(/靠墙单臂胸部拉伸/.test(await cool().locator('h3').textContent()) && (await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')).malts)).chest === 'wallpec', '重载后还是靠墙版（存在 cfg.malts）');
  check(/靠墙单臂胸部拉伸/.test(await page.textContent('#gText')) && !/门框/.test(await page.textContent('#gText')), 'Garmin 文字的放松清单用换过的动作');
  // 跟练：走到放松那一步
  await page.click('#startPlayer');
  for (let i = 0; i < 80 && !/靠墙单臂/.test(await page.textContent('#plName')) && await page.isEnabled('#plNextBtn'); i++) await page.click('#plNextBtn');
  check(/靠墙单臂/.test(await page.textContent('#plName')) && /wallpec\.webp/.test(await page.innerHTML('#plPhoto')) && /离开墙/.test(await page.textContent('#plCue')) && /0:30/.test(await page.textContent('#plMain')),
    '跟练放松那一步：名称、动图、要点、30 秒计时都是靠墙版');
  check(/换边/.test(await page.textContent('#plCue')), '单侧替代动作在跟练里会提示「时间过半换边」');
  if (/靠墙单臂/.test(await page.textContent('#plName'))) { // 没走到就别往下点（上面已经报红）
  // 放大看：文字也是替代动作的要点
  await page.click('#plPhoto .zm');
  check(/离开墙/.test(await page.textContent('#zmCue')) && /靠墙单臂/.test(await page.textContent('#zmName')), '放大画面的名称与要点也用换上的替代动作');
  await page.click('#zmClose');
  await page.click('#plMain [data-plmswap]');
  await page.click('#plAlts [data-malt="clasp"]');
  check(/背后十指交扣/.test(await page.textContent('#plName')) && /clasp\.webp/.test(await page.innerHTML('#plPhoto')) && /十指交扣/.test(await page.textContent('#plCue')), '跟练里也能换：当场换成背后十指交扣（名称、动图、要点）');
  }
  await page.click('#plClose');
  check(/背后十指交扣/.test(await cool().locator('h3').textContent()), '跟练里换的，回到清单也是那个');
  await cool().locator('[data-mswap]').click();
  await cool().locator('[data-restore]').click();
  check(/门框胸部拉伸/.test(await cool().locator('h3').textContent()) && !/已换/.test(await cool().textContent()) && !('chest' in (await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')).malts))), '「恢复原动作」→ 回到门框胸部拉伸，设定里那笔删掉');
  // 备份来回
  await cool().locator('[data-mswap]').click();
  await cool().locator('.alts [data-malt="pronepec"]').click();
  await page.click('nav.tabs [data-tab="more"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
  const bfile = `${os.tmpdir()}/fit-malt-backup-${process.pid}.json`; fs.copyFileSync(await dl.path(), bfile);
  check(JSON.parse(fs.readFileSync(bfile, 'utf8')).cfg.malts.chest === 'pronepec', '导出备份包含放松换动作的选择');
  check(errors.length === 0, `热身／放松换动作没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
  const b2 = await openWith([]);
  await b2.page.click('nav.tabs [data-tab="more"]');
  await b2.page.setInputFiles('#bkFile', bfile);
  await b2.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
  await b2.page.click('nav.tabs [data-tab="train"]');
  check(/俯卧单侧胸部拉伸/.test(await b2.page.locator('#coolCard .ex[data-mslot="chest"] h3').textContent()), '另一台设备导入备份 → 放松换的动作也还原');
  await b2.ctx.close(); fs.rmSync(bfile, { force: true });
}

// ---- 点示范放大（2026-11-10 用户：「跟练时动作能不能点击放大」「放大时那些怎么练的提示词也要在放大画面里」
//      「放大时也要能记重量次数」） ----
// 守：点了打开、图跟原来同一张；放大里有名称／时间／要点、计时照走；跟练往下一步时放大的图与文字跟着换；
// 侧面切换在放大里能用；✕／Esc 关、焦点回去；放大里填的重量次数＝原本那组的（同一份状态），存档只存一次。
{
  const { ctx, page, errors } = await openWith(HIST_A);
  await page.click('#picker [data-wk="A"]');
  await page.click('#startPlayer');
  const src0 = await page.getAttribute('#plPhoto img', 'src');
  check(await page.locator('#plPhoto .zm').count() === 1, '跟练的示范图上有 🔍 放大提示钮');
  await page.click('#plPhoto img');
  check(await page.isVisible('#zoom') && (await page.getAttribute('#zmBox img', 'src')) === src0, '点跟练的示范图 → 放大画面打开，是同一张动图');
  const cue0 = await page.textContent('#plCue');
  check((await page.textContent('#zmName')) === (await page.textContent('#plName')) && cue0.startsWith(await page.textContent('#zmCue')), '放大画面有这一步的名称与完整要点');
  const t0 = await page.textContent('#zmTime');
  await page.clock.setFixedTime(new Date(NOW.getTime() + 3000)); await page.waitForTimeout(500);
  const t1 = await page.textContent('#zmTime');
  check(t0 === '0:30' && t1 === '0:27' && (await page.textContent('#plTime')) === '0:27', `放大中计时照走，放大画面也看得到倒数（${t0} → ${t1}）`);
  await page.evaluate(() => document.getElementById('plNextBtn').click()); // 计时到了自动往下一步也是走这里
  const src1 = await page.getAttribute('#plPhoto img', 'src');
  check(src1 !== src0 && (await page.getAttribute('#zmBox img', 'src')) === src1 && (await page.textContent('#zmName')) === (await page.textContent('#plName')), '跟练往下一步 → 放大的图与名称跟着换成新的一步');
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('#zoom')) && await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('zm')), '按 Esc 关闭，焦点回到 🔍 钮');
  // 侧面切换：热身第 5 个「徒手深蹲」有侧面图
  for (let i = 0; i < 3; i++) await page.click('#plNextBtn');
  await page.click('#plPhoto .zm');
  check(await page.locator('#zmBox .vw').count() === 1, '有侧面图的动作，放大画面里也有「正面／侧面」');
  await page.click('#zmBox .vw [data-view="side"]');
  check(/squat-side\.webp$/.test(await page.getAttribute('#zmBox img', 'src')) && /squat-side\.webp$/.test(await page.getAttribute('#plPhoto img', 'src')), '在放大画面按「侧面」→ 换成侧面图（底下的也一起换）');
  await page.click('#zmBox .vw [data-view="front"]');
  await page.click('#zmClose');
  check(!(await page.isVisible('#zoom')), '按 ✕ 关闭');
  // 第一组：放大里记重量次数
  for (let i = 0; i < 4; i++) await page.click('#plNextBtn');
  check(/高脚杯深蹲/.test(await page.textContent('#plName')), '走到第一组（高脚杯深蹲）');
  const sugKg = await page.inputValue('#plKg');
  await page.click('#plPhoto .zm');
  check((await page.inputValue('#zmKg')) === sugKg && sugKg === '14' && /第 1 组/.test(await page.textContent('#zmText')), `放大画面有这组的重量（预填建议 ${sugKg}）、次数、余力、完成钮`);
  if (process.env.SHOT_ZOOM) await page.screenshot({ path: process.env.SHOT_ZOOM }); // 交付用截图（可选）
  await page.fill('#zmKg', '13'); await page.fill('#zmReps', '11'); await page.click('#zmText [data-zrir="2"]');
  await page.click('#zmClose');
  check((await page.inputValue('#plKg')) === '13' && (await page.inputValue('#plReps')) === '11' && (await page.getAttribute('#plMain [data-rir="2"]', 'aria-pressed')) === 'true', '放大里填的 13kg×11、余力 2，关掉后原本的输入框就是这些（同一份）');
  await page.fill('#plReps', '10');
  await page.click('#plPhoto .zm');
  check((await page.inputValue('#zmReps')) === '10', '反过来：原本输入框改的，放大里也看到');
  await page.click('#zmDone');
  const nm2 = await page.textContent('#plName');
  check(await page.isVisible('#zoom') && (await page.textContent('#zmName')) === nm2 && nm2 !== '高脚杯深蹲', `放大里按「完成这组」→ 存下这组、跟练往下走，放大画面换成下一步（${nm2}）`);
  await page.setViewportSize({ width: 844, height: 390 });
  if (process.env.SHOT_ZOOM_L) await page.screenshot({ path: process.env.SHOT_ZOOM_L });
  const lay = await page.evaluate(() => { const a = document.getElementById('zmBox').getBoundingClientRect(), b = document.getElementById('zmText').getBoundingClientRect(); return { side: b.left >= a.right - 1, fit: a.bottom <= innerHeight + 1 && a.right <= innerWidth }; });
  check(lay.side && lay.fit, '横屏：动图在左、文字在右，图整个放得下');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#zmClose');
  await page.click('#plClose');
  // 清单卡片：点卡片示范也能放大，里面记的是下一个没做的组
  const card = page.locator('#workout .ex[data-slot="gsquat"]');
  await card.locator('.ph .zm').click();
  check(/第 2 组/.test(await page.textContent('#zmText')) && /高脚杯深蹲/.test(await page.textContent('#zmName')) && /膝/.test(await page.textContent('#zmCue')), '清单卡片的示范也能放大，里面有动作要点与下一个没做的组（第 2 组）');
  await page.fill('#zmKg', '14'); await page.fill('#zmReps', '12');
  await page.click('#zmDone');
  check(/第 3 组/.test(await page.textContent('#zmText')), '卡片放大里按完成 → 换成第 3 组');
  await page.click('#zmClose');
  check((await page.inputValue('#kg-gsquat_1')) === '14' && (await page.inputValue('#rp-gsquat_1')) === '12' && (await page.getAttribute('[data-done="gsquat_1"]', 'aria-pressed')) === 'true', '关掉后卡片的第 2 组就是放大里填的 14kg×12、已打勾');
  await page.click('#finishBtn');
  const last = (await page.evaluate(() => JSON.parse(localStorage.getItem('fit.sessions')))).pop();
  const g = last.sets.filter(x => x.ex === 'gsquat');
  check(g.length === 2 && g.filter(x => x.set === 1).length === 1 && g[0].kg === 13 && g[0].reps === 10 && String(g[0].rir) === '2' && g[1].kg === 14 && g[1].reps === 12,
    `存档：放大里记的组各只存一次、数值一样（实得：${JSON.stringify(g)}）`);
  check(errors.length === 0, `放大画面没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
}
// ---- 动图模式下一律用新动图（2026-11-10 用户抓到：「day 3 不跳版波比和平板支撑碰肩模型还是旧版」、
//      第 1 天燃脂的深蹲推举＋登山者也是）——燃脂收尾 AMRAP 一步里有两个动作（anim 是阵列），
//      旧码遇到阵列就不找动图、退回 3D 画布（旧模型）。守：A/B/C × 三种器材，卡片清单、全屏跟练每一步
//      （热身、超级组、休息预告、燃脂收尾、放松、完成）、放大画面：只要那个（那些）动作有 webp，
//      就每个动作各一张 <img src="anim/….webp">，而且画布不出现。
{
  const { ctx, page, errors } = await openWith([]);
  const bad = [];
  let multiSeen = 0;
  for (const eq of ['db', 'bw', 'gym']) {
    await page.click(`#eqSeg [data-eq="${eq}"]`);
    for (const wk of ['A', 'B', 'C']) {
      await page.click(`#picker [data-wk="${wk}"]`);
      const nCv = await page.locator('#workout canvas').count();
      if (nCv) bad.push(`${eq}/${wk} 卡片清单有 ${nCv} 个画布`);
      await page.click('#startPlayer');
      for (let guard = 0; guard < 200; guard++) {
        const r = await page.evaluate(() => {
          const F = window.__fit, { steps, si } = F.player(), s = steps[si];
          const src = s.kind === 'rest' ? (steps.slice(si + 1).find(x => x.anim) || {}) : s;
          if (!src.anim || s.noAnim) return null;
          const keys = Array.isArray(src.anim) ? src.anim : [src.anim];
          const holds = keys.map((_, i) => Array.isArray(src.hold) ? src.hold[i] : src.hold);
          const files = keys.map((k, i) => F.animFile(k, holds[i]));
          if (files.some(f => !f)) return null; // 没有动图的才允许画布
          const box = document.getElementById('plPhoto');
          const imgs = box.hidden ? [] : [...box.querySelectorAll('.ph.anim img')].map(i => i.getAttribute('src'));
          return { name: s.phase + '｜' + s.name, files, imgs, cv: !document.getElementById('plCanvas').hidden, multi: keys.length > 1 };
        });
        if (r) {
          const want = r.files.map(f => `anim/${f}.webp`);
          if (r.cv || want.some(w => !r.imgs.includes(w)) || r.imgs.length !== want.length) bad.push(`${eq}/${wk} 跟练「${r.name}」要 ${want.join('+')}，实得 ${r.imgs.join('+') || '无动图'}${r.cv ? '＋画布' : ''}`);
          if (r.multi && !r.name.startsWith('休息')) {
            multiSeen++;
            // 放大画面：两个动作都在、没有画布、要点还在
            await page.click((await page.locator('#plPhoto:not([hidden]) [data-zoom]').count()) ? '#plPhoto [data-zoom]' : '#plCanvas');
            const z = await page.evaluate(() => ({ imgs: [...document.querySelectorAll('#zmBox .ph.anim img')].map(i => i.getAttribute('src')), cv: document.querySelectorAll('#zmBox canvas').length, cue: (document.getElementById('zmCue') || {}).textContent || '', time: !!document.getElementById('zmTime') }));
            if (z.cv || want.some(w => !z.imgs.includes(w)) || !z.cue || !z.time) bad.push(`${eq}/${wk} 放大「${r.name}」要 ${want.join('+')}＋要点＋计时，实得 ${z.imgs.join('+') || '无动图'}${z.cv ? '＋画布' : ''}${z.cue ? '' : '（没要点）'}${z.time ? '' : '（没计时）'}`);
            const lbl = await page.locator('#zmBox .ph-tag').allTextContents();
            if (lbl.length !== want.length || lbl.some(t => !/\d+ 次/.test(t))) bad.push(`${eq}/${wk} 放大「${r.name}」每张动图要标动作名＋次数，实得 ${JSON.stringify(lbl)}`);
            await page.click('#zmClose');
          }
        }
        if (!(await page.isEnabled('#plNextBtn'))) break;
        await page.evaluate(() => document.getElementById('plNextBtn').click());
      }
      await page.click('#plClose');
    }
  }
  await page.click('#eqSeg [data-eq="db"]');
  await page.click('nav.tabs [data-tab="swim"]');
  const swCv = await page.locator('#swimList canvas').count();
  if (swCv) bad.push(`游泳课有 ${swCv} 个画布`);
  check(bad.length === 0 && multiSeen >= 4, `动图模式：A/B/C × 三种器材的卡片、跟练每一步、燃脂收尾两个动作的放大画面、游泳课都用新动图、没有画布（两动作同框 ${multiSeen} 处）${bad.length ? '：' + bad.slice(0, 12).join('；') + (bad.length > 12 ? `…共 ${bad.length} 处` : '') : ''}`);
  // 手机 390px：燃脂收尾两张动图并排不撑破、放大画面两张都在画面里
  await page.click('nav.tabs [data-tab="train"]');
  await page.click('#picker [data-wk="C"]');
  await page.click('#startPlayer');
  for (let i = 0; i < 80 && !(await page.evaluate(() => { const { steps, si } = window.__fit.player(); return steps[si].kind === 'amrap'; })); i++) await page.evaluate(() => document.getElementById('plNextBtn').click());
  await page.evaluate(() => Promise.all([...document.querySelectorAll('#plPhoto img')].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))));
  const lay = await page.evaluate(() => [...document.querySelectorAll('#plPhoto .ph.anim')].map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.right), Math.round(b.width)]; }));
  check(lay.length === 2 && lay.every(b => b[0] >= 0 && b[1] <= 390 && b[2] >= 150), `390px 跟练：燃脂收尾两张动图都在画面内、各至少 150px 宽（${JSON.stringify(lay)}）`);
  await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/finC-player.png' : os.tmpdir() + '/finC-player.png' });
  await page.click((await page.locator('#plPhoto:not([hidden]) [data-zoom]').count()) ? '#plPhoto [data-zoom]' : '#plCanvas');
  await page.evaluate(() => Promise.all([...document.querySelectorAll('#zmBox img')].map(i => i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; }))));
  const zl = await page.evaluate(() => [...document.querySelectorAll('#zmBox .ph.anim')].map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), Math.round(b.width)]; }));
  check(zl.length === 2 && zl.every(b => b[0] >= 0 && b[1] <= 844 && b[2] >= 240), `390px 放大：燃脂收尾两张动图都在画面内、各至少 240px 宽（${JSON.stringify(zl)}）`);
  await page.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/finC-zoom.png' : os.tmpdir() + '/finC-zoom.png' });
  // 放大里也能数轮：按 +1 轮两次、−1 一次＝原本跟练的轮数（同一份状态）
  for (const b of ['+1 轮', '+1 轮', '−1']) await page.locator('#zmText button', { hasText: b }).click();
  const rz = [await page.textContent('#zmRounds'), await page.textContent('#plRounds')];
  check(rz[0] === '1 轮' && rz[1] === '1 轮', `放大里数轮＝跟练的轮数（放大 ${rz[0]}／跟练 ${rz[1]}）`);
  await page.click('#zmClose');
  check(errors.length === 0, `新动图全路径没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
}
// 简笔模式：放大的是画布，不会坏
{
  const { ctx, page, errors } = await openWith([], { width: 390, height: 844 }, { cfg: { media: '2d', mediaV3: 1 } });
  await page.click('#startPlayer');
  await page.click('#plCanvas');
  check(await page.isVisible('#zoom') && await page.locator('#zmCanvas').count() === 1, '简笔／3D 画布模式：点画布也能放大（放大的是画布）');
  await page.click('#zmClose');
  check(errors.length === 0, `画布放大没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
}

// ---- 16. 体态（2026-11-18 用户：「重量深蹲时也会歪一边 而且好像高低肩」「x型腿呢」） ----
// 守：问卷存得住、进备份、导入还原；红旗一成立就挡住小课（只给「先看医生」）；小课内容跟着答案与测试数字走
// （弱侧先做、多一组）；照片存 IndexedDB、对比画面出得来、进备份；深蹲提醒只在填了「往哪边歪」时出现；
// 满 4 周提醒重测；每个新动作都有动图与规格（拉伸／活动度＝蓝光、力量＝红光）。
{
  const SHOT = process.env.POSTURE_SHOTS; // 给交付截图用（可不设）
  const { ctx, page, errors } = await openWith([]);
  // (a) 训练页卡片 → 体态页；还没自查时，深蹲卡片不出现体态提醒
  await page.click('#picker [data-wk="A"]');
  check(await page.locator('#workout [data-pcue]').count() === 0, '体态：没自查前，训练卡片没有体态提醒');
  check(await page.locator('#postCard [data-open-post]').count() === 1, '体态：训练页有「体态」卡片（开始自查）');
  await page.click('#postCard [data-open-post]');
  check(await page.isVisible('#tab-post') && await page.isHidden('#tab-train'), '体态：点卡片打开体态页（不占底部分页）');
  const pick = async (sel, v) => page.click(`${sel} [data-pq][data-v="${v}"] >> nth=0`).catch(() => {});
  const ans = async (k, v, box = '#postQ') => page.click(`${box} [data-pq="${k}"][data-v="${v}"]`);
  await ans('shoulder', 'R'); await ans('shift', 'L'); await ans('gap', 'N'); await ans('valgus', 'L'); await ans('pain', 'no'); await ans('numb', 'no');
  await ans('bend', 'no', '#postRed'); await ans('worse', 'no', '#postRed'); await ans('kneeNew', 'no', '#postRed');
  if (SHOT) await page.screenshot({ path: SHOT + '/questionnaire.png' });
  check(await page.locator('#postRedMsg').count() === 0 && await page.locator('#postRoutine [data-post-go]').count() === 1, '体态：没有红旗 → 小课可以开始');
  // (b) 小课内容跟着答案：深蹲往左歪 → 分腿蹲右脚先、右脚多一组；左膝往内倒 → 蚌式左腿先、左腿多一组
  let st = await page.evaluate(() => window.__fit.posture.postSteps().filter(s => s.kind === 'timed').map(s => ({ pk: s.pk, side: s.side || null, extra: !!s.extra, anim: s.anim })));
  const sp = st.filter(s => s.pk === 'split'), cl = st.filter(s => s.pk === 'clam');
  check(sp.length === 3 && sp[0].side === 'R' && sp[2].extra && sp[2].side === 'R', `体态：深蹲往左歪 → 分腿蹲右脚先做、右脚多一组（${sp.map(s => s.side + (s.extra ? '+' : '')).join(',')}）`);
  check(cl.length === 3 && cl[0].side === 'L' && cl[2].extra && cl[2].side === 'L', `体态：左膝往内倒 → 蚌式左腿先、左腿多一组（${cl.map(s => s.side + (s.extra ? '+' : '')).join(',')}）`);
  check(st.filter(s => s.pk === 'sideplank').length === 2 && st.filter(s => s.pk === 'ankle').length === 1, '体态：没有测试数字时，侧桥与推膝碰墙左右一样多');
  check(new Set(st.map(s => s.pk)).size === 10, `体态：小课 10 个动作（含收下巴、泡沫轴胸椎伸展）（${[...new Set(st.map(s => s.pk))].join(',')}）`);
  // 测试数字：推膝碰墙 左 8 右 11（差 ≥2）→ 左脚多一次；侧桥 左 30 右 45（差 ≥10%）→ 左侧先、多一组
  await page.fill('#ptKL', '8'); await page.fill('#ptKR', '11'); await page.fill('#ptSL', '30'); await page.fill('#ptSR', '45'); await page.click('#ptSave');
  st = await page.evaluate(() => window.__fit.posture.postSteps().filter(s => s.kind === 'timed').map(s => ({ pk: s.pk, side: s.side || null, extra: !!s.extra })));
  const an = st.filter(s => s.pk === 'ankle'), pl = st.filter(s => s.pk === 'sideplank');
  check(an.length === 2 && an[1].extra && an[1].side === 'L', '体态：推膝碰墙左 8 右 11 cm → 左脚多做一次');
  check(pl.length === 3 && pl[0].side === 'L' && pl[2].extra && pl[2].side === 'L', '体态：侧桥左 30 右 45 秒 → 左侧先做、多一组');
  check(await page.locator('#postTests svg.spark').count() === 0 && /记两次以上/.test(await page.textContent('#postTests')), '体态：只有一笔测试时不画走势、提示记两次');
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('fit.posture')); p.tests.unshift({ id: 'pt_old', ts: p.tests[0].ts - 28 * 864e5, ktwL: '6', ktwR: '10.5', spL: '20', spR: '40' }); localStorage.setItem('fit.posture', JSON.stringify(p)); });
  await page.reload(); await page.waitForSelector('#workout .ex');
  check(await page.locator('#postCard [data-post-go]').count() === 1, '体态：重载后问卷还在（训练页卡片直接给「开始体态小课」）');
  // (c) 深蹲提醒只在填了往哪边歪时出现；单侧动作提醒弱侧先做
  await page.click('#picker [data-wk="A"]');
  const gs = page.locator('#workout .ex').filter({ hasText: '高脚杯深蹲' }).first();
  const cue = await gs.locator('[data-pcue]').allTextContents();
  check(cue.some(t => /往左歪就先减重/.test(t)) && cue.some(t => /第二根脚趾/.test(t)), `体态：深蹲卡片出现「往左歪就先减重」与「膝盖对准第二根脚趾」（${cue.join(' / ')}）`);
  check(await page.locator('#workout .ex').filter({ hasText: '卧推' }).first().locator('[data-pcue]').count() === 0, '体态：卧推（不是深蹲类）没有体态提醒');
  await page.click('#picker [data-wk="C"]');
  check(/右脚先做/.test(await page.locator('#workout .ex').filter({ hasText: '分腿蹲' }).first().textContent()), '体态：C 训练的分腿蹲提醒「右脚先做」');
  await page.click('#picker [data-wk="A"]');
  await page.click('#startPlayer');
  for (let i = 0; i < 8; i++) await page.click('#plNextBtn');
  check(/往左歪/.test(await page.textContent('#plMain')), '体态：全屏跟练的深蹲类那组也有提醒');
  await page.click('#plClose');
  // (d) 跟练：每步都有动图（不准退回画布）、换边提醒、做完记一笔
  await page.click('#postCard [data-post-go]');
  check(await page.isVisible('#player'), '体态：小课用全屏跟练打开');
  const pst = await page.evaluate(() => window.__fit.player().steps);
  let noImg = [];
  for (let i = 0; i < pst.length - 1; i++) { const h = await page.innerHTML('#plPhoto'); if (!/anim\/[\w-]+\.webp/.test(h) || !(await page.locator('#plCanvas').isHidden())) noImg.push(i); await page.click('#plNextBtn'); }
  check(noImg.length === 0, `体态：跟练 ${pst.length - 1} 步都显示动图（没有退回画布）${noImg.length ? '（第 ' + noImg.join(',') + ' 步）' : ''}`);
  check(pst[0].half && /换边/.test(pst[0].name), '体态：90/90 每侧 30 秒、时间过半提示换边');
  await page.click('#plAct');
  const pd = await page.evaluate(() => window.__fit.posture.get().done.length);
  check(pd === 1 && await page.isHidden('#player'), '体态：最后一步「完成并记录」记下 1 次、关掉跟练');
  // (e) 照片：存进 IndexedDB、对比画面（格线＋水平线）出得来、重载还在
  await page.click('#postCard [data-open-post]');
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 60; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 60, 80); g.fillStyle = '#fff'; g.fillRect(20, 10, 20, 60); return c.toDataURL('image/png').split(',')[1]; });
  await page.setInputFiles('#ppFront', { name: 'front.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForSelector('#ppCmp-front img');
  await page.setInputFiles('#ppBack', { name: 'back.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForSelector('#ppCmp-back img');
  const ph = await page.evaluate(async () => (await window.__fit.posture.photoAll()).map(p => ({ view: p.view, jpg: /^data:image\/jpeg/.test(p.data) })));
  check(ph.length === 2 && ph.every(p => p.jpg) && ph.some(p => p.view === 'front') && ph.some(p => p.view === 'back'), `体态：正面＋背面照片存进 IndexedDB（${JSON.stringify(ph)}）`);
  check(!(await page.evaluate(() => Object.keys(localStorage).some(k => /data:image/.test(localStorage.getItem(k))))), '体态：照片没有塞进 localStorage');
  check(await page.locator('#ppCmp-front .grid').count() === 2 && await page.locator('#ppCmp-front .hl').count() === 2, '体态：对比画面有格线与红色水平线（两张各一）');
  await page.fill('#ppHl', '62'); await page.dispatchEvent('#ppHl', 'input');
  check((await page.getAttribute('#ppCmp-back .hl >> nth=1', 'style')).includes('62%'), '体态：拉水平线两张一起动');
  if (SHOT) { await page.locator('#postPhotos').scrollIntoViewIfNeeded(); await page.screenshot({ path: SHOT + '/photo-compare.png' }); await page.locator('#postRoutine').scrollIntoViewIfNeeded(); await page.screenshot({ path: SHOT + '/routine-card.png' }); }
  await page.reload(); await page.waitForSelector('#workout .ex'); await page.click('#postCard [data-open-post]');
  await page.waitForSelector('#ppCmp-front img');
  check(true, '体态：重载后照片还在对比画面');
  // (f) 备份：问卷、测试、做过的小课、照片都在；导入到新手机全部还原
  await page.click('#postBack'); await page.click('nav.tabs [data-tab="more"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
  const bf = `${os.tmpdir()}/fit-post-backup-${process.pid}.json`; fs.copyFileSync(await dl.path(), bf);
  const bk = JSON.parse(fs.readFileSync(bf, 'utf8'));
  check(bk.posture && bk.posture.q.shift === 'L' && bk.posture.tests.length === 2 && bk.posture.done.length === 1 && Array.isArray(bk.postPhotos) && bk.postPhotos.length === 2, '体态：备份含问卷、2 笔测试、1 次小课、2 张照片');
  check(errors.length === 0, `体态没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
  const b2 = await openWith([]);
  await b2.page.click('nav.tabs [data-tab="more"]');
  await b2.page.setInputFiles('#bkFile', bf);
  await b2.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
  const p2 = await b2.page.evaluate(async () => ({ q: window.__fit.posture.get().q, t: window.__fit.posture.get().tests.length, ph: (await window.__fit.posture.photoAll()).length }));
  check(p2.q.shift === 'L' && p2.q.valgus === 'L' && p2.t === 2 && p2.ph === 2, `体态：导入备份 → 问卷、测试、照片都还原（${JSON.stringify(p2)}）`);
  check(/2 张体态照片/.test(await b2.page.textContent('#bkMsg')), '体态：导入讯息说明还原了几张照片');
  await b2.ctx.close(); fs.rmSync(bf, { force: true });
}
// 红旗：前弯测试一边隆起（或痛、麻、越来越明显、X 型腿只有一边）→ 只给「建议先给医生或物理治疗师看」，小课不排
{
  const SHOT = process.env.POSTURE_SHOTS;
  const { ctx, page, errors } = await openWith([]);
  await page.click('#postCard [data-open-post]');
  await page.click('#postQ [data-pq="shift"][data-v="R"]');
  await page.click('#postRed [data-pq="bend"][data-v="yes"]');
  const msg = await page.textContent('#postStatus');
  check(/建议先给医生或物理治疗师看/.test(msg) && /不是治疗/.test(msg) && /一边明显比另一边高/.test(msg), '体态红旗：前弯测试一边隆起 → 显示「建议先给医生或物理治疗师看」＋原因＋「不是治疗」');
  check(await page.locator('#postRoutine [data-post-go]').count() === 0 && await page.locator('#postCard [data-post-go]').count() === 0, '体态红旗：小课的开始按钮全部拿掉（体态页与训练页）');
  check(/建议先给医生或物理治疗师看/.test(await page.textContent('#postCard')), '体态红旗：训练页卡片也写「建议先给医生或物理治疗师看」');
  await page.evaluate(() => { try { document.querySelector('[data-post-go]') } catch (e) {} });
  if (SHOT) { await page.locator('#postStatus').scrollIntoViewIfNeeded(); await page.screenshot({ path: SHOT + '/redflag.png' }); }
  for (const [box, k, v, why] of [['#postQ', 'pain', 'yes', '痛'], ['#postQ', 'numb', 'yes', '麻'], ['#postRed', 'worse', 'yes', '越来越明显'], ['#postRed', 'kneeNew', 'yes', 'X 型腿只有一边／成年后出现']]) {
    await page.click('#postRed [data-pq="bend"][data-v="no"]');
    await page.click(`${box} [data-pq="${k}"][data-v="${v}"]`);
    const red = await page.locator('#postRedMsg').count() === 1 && await page.locator('#postRoutine [data-post-go]').count() === 0;
    await page.click(`${box} [data-pq="${k}"][data-v="${k === 'pain' || k === 'numb' || k === 'worse' || k === 'kneeNew' ? 'no' : 'no'}"]`);
    check(red, `体态红旗：「${why}」也会挡住小课`);
  }
  check(await page.locator('#postRedMsg').count() === 0 && await page.locator('#postRoutine [data-post-go]').count() === 1, '体态红旗：全部解除后小课回来');
  await page.click('#postRed [data-pq="bend"][data-v="yes"]');
  await page.click('[data-post-ack]', { timeout: 3000 }).catch(() => {});
  check(await page.locator('#postRedMsg').count() === 1 && await page.locator('#postRoutine [data-post-go]').count() === 1, '体态红旗：确认「医生看过、可以运动」后才给小课，提醒仍留着');
  // 站着两膝并拢脚踝分开（结构性 X 型腿）：讲实话（骨头角度运动改不了），不当红旗；动作中膝盖往内倒才加蚌式
  await page.click('[data-post-unack]', { timeout: 3000 }).catch(() => {}); await page.click('#postRed [data-pq="bend"][data-v="no"]');
  await page.click('#postQ [data-pq="gap"][data-v="Y"]'); await page.click('#postQ [data-pq="valgus"][data-v="N"]');
  const gtxt = await page.textContent('#postStatus');
  check(/骨/.test(gtxt) && /截骨手术/.test(gtxt) && await page.locator('#postRedMsg').count() === 0, `体态 X 型腿（站着）：说明是骨头角度、改角度靠手术，不算红旗（${gtxt.slice(0, 160)}）`);
  const nclam = await page.evaluate(() => window.__fit.posture.postSteps().filter(s => s.pk === 'clam').length);
  check(nclam === 2, `体态 X 型腿：只有站着分开、动作中不内倒 → 蚌式不加组（${nclam}）`);
  await page.click('#postQ [data-pq="valgus"][data-v="B"]');
  const nclam2 = await page.evaluate(() => window.__fit.posture.postSteps().filter(s => s.pk === 'clam' && s.extra).length);
  check(nclam2 === 2 && /有研究显示可能练得改善（研究对象是跑者）/.test(await page.textContent('#postStatus')), `体态 X 型腿：动作中两膝都往内倒 → 两边各多一组蚌式＋说明可能练得改善（${nclam2}）`);
  check(errors.length === 0, `体态红旗没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
}
// 2026-11-18 verifier 抓到的漏洞（修之前这几项都是红的）：
// ① 已确认「医生看过」之后又多一个红旗，确认要作废、小课重新挡住；② 高低肩但前弯测试「还没测」→ 先挡小课、叫你去测；
// ③ 有红旗时，力量日的深蹲／单侧动作不再出现体态提醒（「X脚先做、多一组」）；④ 推膝碰墙差刚好 2.0 cm 不算（Pabau 原文是 above 2 cm），2.1 才算；
// ⑤ 文案守门：verifier 判定「比来源说得更满」或「没有来源」的句子不准再出现在 fitness/index.html。
{
  const { ctx, page, errors } = await openWith([]);
  await page.click('#postCard [data-open-post]');
  await page.click('#postQ [data-pq="shoulder"][data-v="E"]');
  await page.click('#postRed [data-pq="bend"][data-v="yes"]');
  await page.click('[data-post-ack]', { timeout: 3000 }).catch(() => {});
  const okAck = await page.locator('#postRoutine [data-post-go]').count() === 1;
  await page.click('#postQ [data-pq="pain"][data-v="yes"]');
  check(okAck && await page.locator('#postRoutine [data-post-go]').count() === 0 && await page.locator('#postCard [data-post-go]').count() === 0 && await page.locator('[data-post-ack]').count() === 1,
    '体态红旗：确认「医生看过」之后又多一个红旗（痛）→ 确认作废、小课重新挡住、要重新确认');
  await page.click('#postQ [data-pq="pain"][data-v="no"]'); await page.click('#postRed [data-pq="bend"][data-v="no"]');
  check(await page.locator('#postRoutine [data-post-go]').count() === 1, '体态红旗：红旗全部解除后小课回来（不需要确认）');
  for (const bend of ['?', null]) {
    await page.evaluate(b => { const p = JSON.parse(localStorage.getItem('fit.posture')); p.q = { shoulder: 'L', shift: 'N' }; p.red = b ? { bend: b } : {}; p.ack = 0; localStorage.setItem('fit.posture', JSON.stringify(p)); }, bend);
    await page.reload(); await page.waitForSelector('#workout .ex'); await page.click('#postCard [data-open-post]');
    const t = await page.textContent('#postRoutine');
    check(await page.locator('#postRoutine [data-post-go]').count() === 0 && await page.locator('#postCard [data-post-go]').count() === 0 && /前弯测试/.test(t),
      `体态：左肩较高、前弯测试${bend ? '选「还没测」' : '没回答'} → 小课先挡住、提示先做前弯测试`);
  }
  await page.click('#postRed [data-pq="bend"][data-v="no"]');
  check(await page.locator('#postRoutine [data-post-go]').count() === 1, '体态：高低肩做完前弯测试（两边一样）→ 小课回来');
  // ③ 有红旗（即使已确认）→ 力量日没有体态提醒
  await page.evaluate(() => localStorage.setItem('fit.posture', JSON.stringify({ q: { shift: 'L', valgus: 'L', pain: 'yes' }, red: { bend: 'no' }, tests: [], done: [], qTs: Date.now(), ack: Date.now(), ackFor: ['背、髋或膝盖有痛'] })));
  await page.reload(); await page.waitForSelector('#workout .ex');
  await page.click('#picker [data-wk="A"]'); const nA = await page.locator('#workout [data-pcue]').count();
  await page.click('#picker [data-wk="C"]'); const nC = await page.locator('#workout [data-pcue]').count();
  check(nA === 0 && nC === 0, `体态红旗：有红旗时力量日不出现体态提醒（A ${nA}、C ${nC} 条）`);
  // ④ 推膝碰墙：差刚好 2.0 不算，2.1 才算（Pabau：above 2 cm）
  const side = async (l, r) => { await page.evaluate(([a, b]) => localStorage.setItem('fit.posture', JSON.stringify({ q: { shift: 'N' }, red: { bend: 'no' }, tests: [{ id: 'pt1', ts: Date.now(), ktwL: a, ktwR: b }], done: [], qTs: Date.now() })), [l, r]); await page.reload(); await page.waitForSelector('#workout .ex'); return page.evaluate(() => window.__fit.posture.postSides().ankle); };
  const s20 = await side('8', '10'), s21 = await side('8', '10.1');
  check(s20 === null && s21 === 'L', `体态：推膝碰墙左右差 2.0 cm 不算弱侧、2.1 cm 才算（实得 ${s20} / ${s21}）`);
  check(errors.length === 0, `体态漏洞自检没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
  // ⑤ 文案守门
  const html = fs.readFileSync('fitness/index.html', 'utf8');
  const BANNED = ['改不了，要改只能手术', '运动改不了', '杠也更歪', '那里就是你现在的上限', '几周就可能看得到', '静态姿势通常变得很慢', '比较早看得到变化',
    '这是腿骨本身的角度', '大腿前侧上方有拉的感觉就停住', '照片可能变得很慢', '不需要避免（',
    '变化慢', '标准方法', '只能当提醒', '可以练的控制问题', '动作中膝盖往内倒：可以练', '轻轻压墙', '套在膝盖上方加难度'];
  const hit = BANNED.filter(b => html.includes(b));
  check(hit.length === 0, `体态文案：没有来源或比来源说得更满的句子不再出现${hit.length ? '（还在：' + hit.join('、') + '）' : ''}`);
  const need = ['除非医生另有建议', '前弯测试看起来正常也不能完全排除', '手机回放是 App 的做法', 'App 的保守判断', 'App 的推论',
    '医生做脊柱侧弯检查时会用的方法', '自己在家看只能算提醒（App 的保守判断）', '研究对象是跑者', '不往内倒（App 的安排）', '加难度（App 的安排）'];
  const miss = need.filter(b => !html.includes(b));
  check(miss.length === 0, `体态文案：该标明来源界线的地方都标了${miss.length ? '（缺：' + miss.join('、') + '）' : ''}`);
}
// 满 4 周提醒重测（今天固定 2026-09-30）：上次自查 29 天前 → 提醒；10 天前 → 不提醒
for (const [days, want] of [[29, true], [10, false]]) {
  const { ctx, page } = await openWith([]);
  await page.evaluate(d => localStorage.setItem('fit.posture', JSON.stringify({ q: { shift: 'N' }, red: { bend: 'no' }, tests: [], done: [], qTs: Date.now() - d * 864e5 })), days);
  await page.reload(); await page.waitForSelector('#workout .ex');
  const has = await page.locator('#postDue').count() === 1 && /29 天/.test(await page.textContent('#postCard'));
  check(want ? has : await page.locator('#postDue').count() === 0, `体态：上次自查 ${days} 天前 → ${want ? '提醒重测' : '不提醒'}`);
  await ctx.close();
}
// 新动作：每个都有动图与规格；拉伸／活动度＝蓝光（stretch/mobility）、力量＝红光（strength）
{
  const { ctx, page } = await openWith([]);
  const pm = await page.evaluate(() => Object.values(window.__fit.posture.PMOVE).map(m => ({ anim: m.anim, hold: m.hold || null, kind: m.kind })));
  const spec = JSON.parse(fs.readFileSync('tools/lib/fitness-anim-spec.json', 'utf8'));
  const bad = pm.filter(m => { const f = m.anim + (m.hold ? '-' + m.hold : ''), s = spec.find(x => x.file === f);
    return !fs.existsSync(`fitness/anim/${f}.webp`) || !s || (m.kind === 'mob' ? !['stretch', 'mobility'].includes(s.type) : s.type !== 'strength') || !(s.sources || []).length; }).map(m => m.anim);
  check(pm.length === 10 && bad.length === 0, `体态：10 个动作都有动图、规格与来源，拉伸／活动度标蓝光、力量标红光${bad.length ? '（有问题：' + bad.join(',') + '）' : ''}`);
  await ctx.close();
}

// ---- 17. 饮食（2026-11-19 用户：男 40 岁 72 kg、每天洗髓功 40 分钟、在做 16/8） ----
// 守：蛋白目标＝1.6×体重（72 kg → 115.2 → 显示 115 g）；热量按 Jensen 2013（男 1500–1800、女 1200–1500，或每天少 500–750）；
// 16/8 分餐（每餐下限 0.25×72＝18 g；3 餐 115.2÷3＝38.4 → 约 38 g；时间 12:00/15:45/19:30＝窗口 8 小时、最后一餐在关窗前 30 分钟、间隔 3.75 小时）；
// 洗髓功 3.3 MET：毛 3.3×72×40/60＝158.4、净 2.3×72×40/60＝110.4，每周 ×7＝1108.8／772.8 → 显示 1109／773；
// 平台期提示：连续 3 周（4 个周均值）体重和腰围都没往下走才出现，2 周不出现；燃脂收尾已改名心肺收尾；备份来回；文案守门。
// 今天固定 2026-09-30（周三），本周从 9/28（周一）算起。
{
  const { ctx, page, errors } = await openWith([]);
  check(await page.locator('#dietCard [data-open-diet]').count() >= 1, '饮食：训练页有饮食卡片、可以打开饮食页');
  await page.click('#dietCard [data-open-diet]');
  const blank = await page.evaluate(() => ({ age: document.getElementById('dAge').value, kg: document.getElementById('dKg').value }));
  check(blank.age === '' && blank.kg === '', `饮食：资料不预填（年龄「${blank.age}」、体重「${blank.kg}」）`);
  await page.click('#dSex [data-v="M"]');
  await page.fill('#dAge', '40'); await page.fill('#dKg', '72');
  const prot = await page.textContent('#dProt');
  check(/115 g/.test(prot) && /1\.6/.test(prot) && /1\.62/.test(prot), `饮食：72 kg 蛋白目标 1.6×72＝115.2 → 115 g，并引 Morton 1.62（实得：${prot.slice(0, 80)}）`);
  // BMI 门槛（2026-11-19 verifier：体重正常的人不准看到 1500–1800 这种绝对区间）
  // 手算：72 ÷ 1.75² ＝ 23.51 → 23.5；72 ÷ 1.65² ＝ 26.45 → 26.4
  const bmiFn = await page.evaluate(() => window.__fit.diet.bmi ? [window.__fit.diet.bmi(72, 175), window.__fit.diet.bmi(72, 165)] : null);
  check(bmiFn && bmiFn[0] === 23.5 && bmiFn[1] === 26.4, `BMI：72 kg／175 cm＝23.5、72 kg／165 cm＝26.4（实得 ${JSON.stringify(bmiFn)}）`);
  const modeDef = await page.evaluate(() => { const b = document.querySelector('#dMode [aria-pressed="true"]'); return b ? b.dataset.v : null; });
  const kcU = await page.textContent('#dKcal');
  check(modeDef === 'deficit' && !/1500/.test(kcU) && /身高/.test(kcU), `BMI：没填身高 → 默认「比平常少吃」、不出现 1500（模式 ${modeDef}；实得：${kcU.slice(0, 100)}）`);
  await page.click('#dMode [data-v="range"]').catch(() => {});
  check(!/1500/.test(await page.textContent('#dKcal')), 'BMI：没填身高时就算点了「按指南区间」也不出现 1500–1800');
  const hasCm = await page.locator('#dCm').count();
  check(hasCm === 1, '饮食：资料里有身高栏');
  if (hasCm) {
    await page.fill('#dCm', '175');
    const bm = await page.textContent('#dBmi').catch(() => '');
    check(/23\.5/.test(bm) && /25/.test(bm) && /23/.test(bm) && /WHO/.test(bm), `BMI：175 cm → 23.5，并列 WHO（≥25／≥30）与亚洲（23）门槛（实得：${bm.slice(0, 160)}）`);
    await page.click('#dMode [data-v="range"]').catch(() => {});
    const kn = await page.textContent('#dTargets');
    check(!/1500/.test(kn) && /App 的保守判断/.test(kn), `BMI 23.5（体重正常）：点了「按指南区间」也不出现 1500，只给温和的少吃量并标 App 的保守判断（实得：${(await page.textContent('#dKcal')).slice(0, 120)}）`);
    await page.fill('#dCm', '165');
    await page.click('#dMode [data-v="range"]');
    const kc = await page.textContent('#dKcal'), kcN = await page.textContent('#dKcal .num');
    check(/1500–1800/.test(kcN) && /仅适用超重／肥胖成人，体重正常别直接用/.test(kc) && /Jensen|AHA/.test(kc) && /按个人体重调整/.test(kc), `BMI 26.4（超重）、指南区间 → 1500–1800 kcal/日，旁边写「仅适用超重／肥胖成人」与「按体重调整」（实得：${kc.slice(0, 140)}）`);
    await page.click('#dMode [data-v="deficit"]');
    const kc2 = await page.textContent('#dKcal .num');
    check(/500–750/.test(kc2) && !/1500–1800/.test(kc2), `BMI 26.4、少吃模式 → 每天少吃 500–750 kcal（实得：${kc2.slice(0, 80)}）`);
    await page.click('#dSex [data-v="F"]'); await page.click('#dMode [data-v="range"]');
    check(/1200–1500/.test(await page.textContent('#dKcal .num')), 'BMI 26.4、女、区间模式 → 1200–1500 kcal/日');
    await page.click('#dSex [data-v="M"]');
    await page.fill('#dCm', '175');
    check(!/1500/.test(await page.textContent('#dTargets')), 'BMI：区间模式下把身高改回 175（BMI 23.5）→ 1500–1800 马上消失');
    await page.click('#dMode [data-v="deficit"]');
  }
  // 16/8 分餐
  await page.click('#dTre');
  const meal = await page.textContent('#dMeals');
  check(/18 g/.test(meal) && /约 38 g/.test(meal) && /12:00/.test(meal) && /15:45/.test(meal) && /19:30/.test(meal) && /App 的安排/.test(meal),
    `饮食：16/8（12:00–20:00）3 餐 → 每餐下限 18 g、每餐约 38 g、12:00／15:45／19:30，标「App 的安排」（实得：${meal.slice(0, 160)}）`);
  await page.click('#dMealN [data-v="2"]');
  const meal2 = await page.textContent('#dMeals');
  check(/约 58 g/.test(meal2) && /12:00/.test(meal2) && /19:30/.test(meal2), `饮食：改 2 餐 → 115.2÷2＝57.6 → 约 58 g（实得：${meal2.slice(0, 120)}）`);
  check(/改成 3 餐/.test(meal2), '分餐提示：2 餐、每餐 58 g（>40）→ 提示改成 3 餐');
  await page.click('#dMealN [data-v="3"]');
  check(!/改成 3 餐/.test(await page.textContent('#dMeals')) && !/小点心/.test(await page.textContent('#dMeals')), '分餐提示：3 餐、每餐 38 g（≤40）→ 不出提示');
  // 3 餐但每餐 >40：80 kg → 1.6×80＝128 ÷ 3 ＝ 42.7 → 43 g，不能叫人「改成 3 餐」（已经是 3 餐）
  await page.fill('#dKg', '80');
  const meal3 = await page.textContent('#dMeals');
  check(/约 43 g/.test(meal3) && !/改成 3 餐/.test(meal3) && /小点心/.test(meal3) && /App 的安排/.test(meal3), `分餐提示：3 餐、每餐 43 g → 不说「改成 3 餐」，改建议加一份蛋白小点心（App 的安排）（实得：${meal3.slice(0, 220)}）`);
  await page.fill('#dKg', '72');
  const ev = await page.textContent('#dTreWhy');
  check(/Lowe/.test(ev) && /Liu/.test(ev) && /瘦体重/.test(ev), '饮食：16/8 证据摘要写了 Lowe 2020、Liu 2022 与瘦体重');
  check(/摘要没写年龄；受试者是有训练经验的人，没有针对 40 岁以上的专门试验/.test(ev) && !/偏年轻/.test(ev), 'Moro／Tinsley：写明摘要没写年龄、没有 40 岁以上的专门试验（不说「偏年轻」）');
  check(/1 型／妊娠糖尿病数据不足/.test(ev) && /请医生调药（App 的做法）/.test(ev), '低血糖：写 1 型／妊娠糖尿病数据不足，「请医生调药」标 App 的做法');
  // 记一天
  for (const n of [30, 30, 20]) await page.click(`#dToday [data-padd="${n}"]`);
  await page.fill('#dKcalIn', '1700'); await page.click('#dWin');
  const tod = await page.textContent('#dToday');
  check(/80 \/ 115 g/.test(tod), `饮食：今天 +30 +30 +20 → 80 / 115 g（实得：${tod.slice(0, 80)}）`);
  const wk = await page.locator('#dWeek tbody tr').count();
  const wkTxt = await page.textContent('#dWeek');
  check(wk === 7 && /80/.test(wkTxt) && /1700/.test(wkTxt), `饮食：每周表 7 天、今天那行有 80 g 与 1700 kcal（${wk} 行）`);
  // 洗髓功（更多 → 设置）
  await page.click('#dietBack'); await page.click('nav.tabs [data-tab="more"]');
  await page.click('#cfgQg');
  await page.click('#cfgQgMin [data-qm="40"]'); // 2026-11-22 起默认 45；这里选 40 守「自己选的分钟数照算」（45 的数字见第 20 段）
  const q = await page.evaluate(() => window.__fit.diet.qigong(72, 40));
  check(Math.abs(q.gross - 158.4) < 1e-9 && Math.abs(q.net - 110.4) < 1e-9 && Math.abs(q.wkGross - 1108.8) < 1e-9 && Math.abs(q.wkNet - 772.8) < 1e-9,
    `洗髓功：3.3×72×40/60＝158.4 毛、110.4 净；×7＝1108.8／772.8（实得 ${JSON.stringify(q)}）`);
  await page.click('nav.tabs [data-tab="train"]'); await page.click('#dietCard [data-open-diet]');
  const qt = await page.textContent('#dQg');
  check(/158\.4/.test(qt) && /110\.4/.test(qt) && /1109/.test(qt) && /773/.test(qt) && /15670/.test(qt) && /280 分钟/.test(qt),
    `洗髓功：页面写出公式 158.4／110.4、每周 1109／773 kcal、280 分钟、Compendium 15670（实得：${qt.slice(0, 200)}）`);
  const qn = await page.textContent('#dQg .num');
  check(/773/.test(qn) && !/1109/.test(qn) && /低强度（App 的推论）/.test(qt), `洗髓功：大字是净 773 kcal（毛 1109 放小字），并写「按心率约属低强度（App 的推论）」（大字：${qn}）`);
  // 备份来回
  await page.click('#dietBack'); await page.click('nav.tabs [data-tab="more"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
  const file = await dl.path(); const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
  const today = '2026-09-30';
  check(bk.diet && bk.diet.profile && bk.diet.profile.kg === 72 && bk.diet.profile.age === 40 && bk.diet.profile.sex === 'M' && bk.diet.profile.cm === 175 && bk.diet.log[today] && bk.diet.log[today].p === 80 && bk.diet.log[today].kcal === 1700 && bk.diet.log[today].win === true && bk.diet.tre.on === true && bk.diet.qg.on === true,
    '饮食备份：资料、今天的记录、16/8 与洗髓功设定都在备份里');
  const b2 = await openWith([]);
  await b2.page.click('nav.tabs [data-tab="more"]');
  await b2.page.setInputFiles('#bkFile', file);
  await b2.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
  const d2 = await b2.page.evaluate(() => JSON.parse(localStorage.getItem('fit.diet') || 'null'));
  check(d2 && d2.profile.kg === 72 && d2.log[today].p === 80 && d2.tre.on === true && d2.qg.on === true && d2.mode === 'deficit' && d2.profile.cm === 175, '饮食备份：导入到空白手机后资料、记录、设定都还原');
  await b2.ctx.close();
  check(errors.length === 0, `饮食没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
}
// 平台期提示：周均值（周一开始）。4 周＝3 次周与周比较；今天 2026-09-30，记录在 0/7/14/21 天前（各落在不同的周）
for (const [label, rows, want] of [
  ['连续 3 周体重腰围都没降', [[21, 72, 85], [14, 72.3, 85], [7, 72.1, 85.2], [0, 72.2, 85]], true],
  ['只有 2 周没降（3 个周均值）', [[14, 72, 85], [7, 72.3, 85], [0, 72.2, 85]], false],
  ['3 周里体重有降', [[21, 72.5, 85], [14, 72.3, 85], [7, 72.1, 85], [0, 72.0, 85]], false],
  ['体重没降但腰围在降', [[21, 72, 86], [14, 72, 85.5], [7, 72, 85.2], [0, 72.1, 85]], false],
  ['腰围只在中间两周量过', [[21, 72, null], [14, 72.3, 85], [7, 72.1, 85.2], [0, 72.2, null]], 'midW'],
]) {
  const { ctx, page } = await openWith([]);
  await page.evaluate(r => localStorage.setItem('fit.body', JSON.stringify(r.map(([d, kg, w]) => ({ id: 'b' + d, ts: Date.now() - d * 864e5, kg, waist: w })))), rows);
  await page.reload(); await page.waitForSelector('#workout .ex');
  await page.click('#dietCard [data-open-diet]', { timeout: 3000 }).catch(() => {});
  const n = await page.locator('#dPlateau').count();
  const t = n ? await page.textContent('#dPlateau') : '';
  if (want === 'midW') {
    const wk = await page.textContent('#dWeekCard');
    check(n === 1 && !/没有腰围记录/.test(t) && /腰围/.test(t) && !/NaN|null/.test(wk), `平台期提示：${label} → 出现，但不说「没有腰围记录」（3 周前或最近一周没量），周均值不印 NaN（实得：${t.slice(0, 120)}）`);
  } else check(want ? (n === 1 && /App 的安排/.test(t)) : n === 0, `平台期提示：${label} → ${want ? '出现（标 App 的安排）' : '不出现'}（实得 ${n}）`);
  await ctx.close();
}
// 改名与文案守门
{
  const html = fs.readFileSync('fitness/index.html', 'utf8');
  check(!html.includes('燃脂收尾'), '改名：fitness/index.html 里不再有「燃脂收尾」');
  const { ctx, page } = await openWith([]);
  await page.click('#picker [data-wk="A"]');
  check(/心肺收尾/.test(await page.textContent('#workout')), '改名：训练卡片显示「心肺收尾」');
  await ctx.close();
  const BANNED = ['训练日以外多走路', '比多加一次训练更容易累积',
    // 2026-11-19 verifier 退件：比原文满、或没查证的说法
    '才与明显的减重', '让关节和神经恢复，下周回来通常更有力', '不是偷懒，是让身体吸收', '一份手掌大的肉或鱼', '保肌另一半靠',
    '睡眠不足会影响恢复和食欲，尽量睡够。</li>'];
  const hit = BANNED.filter(b => html.includes(b));
  check(hit.length === 0, `饮食／说明文案：没有来源的句子不再出现${hit.length ? '（还在：' + hit.join('、') + '）' : ''}`);
  const need = ['−1.6 kg', '2.1 cm', '150–250', '250 分钟', '500–750', '32986097', '35443107', '28642676', '28698222', '27737674', '31268131', '40298934', '42361830',
    '26817506', '14726171', 'who.int', '仅适用超重／肥胖成人，体重正常别直接用', '（App 的做法，未查证）', '看包装上的蛋白质克数'];
  const miss = need.filter(b => !html.includes(b));
  check(miss.length === 0, `饮食／说明文案：查证过的数字与来源都在${miss.length ? '（缺：' + miss.join('、') + '）' : ''}`);
}

// ---- 18. 脖子前倾＋每日小习惯＋洗髓功后接体态小课（2026-11-19，用户：脖子前倾、每天早上练洗髓功） ----
{
  const POST_OK = { q: { shift: 'N', shoulder: 'E', fhp: 'Y' }, red: { bend: 'no' }, tests: [], done: [], qTs: Date.now() - 2 * 864e5 };
  const T2 = { timeout: 3000 };
  const tx = (pg, sel) => pg.textContent(sel, T2).catch(() => '');
  const seed = async (page, v) => { await page.evaluate(v => localStorage.setItem('fit.posture', JSON.stringify(v)), v); };
  // (a) 问卷有前倾题；选「是」→ 结果写肌力有效、拉伸不改姿势、「常一起出现，但没证明前倾会造成颈痛」、5° 误差
  {
    const { ctx, page, errors } = await openWith([]);
    await page.click('#postCard [data-open-post]', T2).catch(() => {});
    const qt = await tx(page, '#pqFhp');
    check(/站着/.test(qt) && /App 不给正常值/.test(qt) && /只跟自己/.test(qt) && /侧面照/.test(qt), `前倾：问卷有「脖子前倾」题，写站着拍、不给正常值、只跟自己比（实得：${qt.slice(0, 80)}）`);
    await page.click('#postQ [data-pq="fhp"][data-v="Y"]', T2).catch(() => {});
    const res = await tx(page, '#postFhpRes');
    check(/常一起出现，但没证明前倾会造成颈痛/.test(res) && /单纯拉伸不改变姿势/.test(res) && /5°/.test(res) && /Sheikhhoseini/.test(res) && /Correia/.test(res),
      `前倾：结果引 Sheikhhoseini／Warneke／Mahmoud／Richards／Correia，写「常一起出现，但没证明前倾会造成颈痛」与 5° 误差（实得：${res.slice(0, 120)}）`);
    // (b) 红旗分流
    await page.click('#postRed [data-nk="arm"]', T2).catch(() => {});
    check(/^尽快看医生/.test((await tx(page, '#postRedMsg')).trim()), '脖子红旗：手臂刺麻＋颈／臂痛 → 「尽快看医生」');
    check(await page.locator('#postRoutine [data-post-go]').count() === 0, '脖子红旗：有红旗时体态小课按钮拿掉');
    await page.click('#postRed [data-nk="walk"]', T2).catch(() => {});
    check(/^马上去急诊/.test((await tx(page, '#postRedMsg')).trim()), '脖子红旗：走路出现新问题 → 「马上去急诊」（比「尽快看医生」优先）');
    await page.click('#postBack', T2).catch(() => {});
    check(/马上去急诊/.test(await tx(page, '#postCard')) && await page.locator('#postCard [data-post-go]').count() === 0, '脖子红旗：训练页卡片也显示「马上去急诊」、没有小课按钮');
    await page.click('#postCard [data-open-post]', T2).catch(() => {});
    const all = await tx(page, '#tab-post');
    check(!/\b111\b|\b999\b/.test(all), '脖子红旗：不写英国的 111／999（用户在东南亚）');
    for (const k of ['walk', 'arm']) await page.click(`#postRed [data-nk="${k}"]`, T2).catch(() => {});
    check(await page.locator('#postRedMsg').count() === 0 && await page.locator('#postRoutine [data-post-go]').count() === 1, '脖子红旗：取消后小课回来');
    // (c) 小课含收下巴＋胸椎伸展，总长约 12 分钟
    const st = await page.evaluate(() => window.__fit.posture.postSteps().filter(s => s.kind === 'timed'));
    const sec = st.reduce((a, s) => a + s.sec, 0), keys = st.map(s => s.pk);
    check(keys.includes('chintuck') && keys.includes('thoracic') && sec >= 11 * 60 && sec <= 13 * 60, `体态小课：有收下巴与泡沫轴胸椎伸展，总长 ${Math.round(sec / 6) / 10} 分钟（要 11–13）`);
    const ct = st.find(s => s.pk === 'chintuck');
    check(ct && /10 次/.test(ct.name) && /10 秒/.test(ct.name) && /Physitrack/.test(ct.name), `收下巴剂量标出处（Physitrack）（实得：${ct && ct.name}）`);
    const rt = await tx(page, '#postRoutine');
    check(/Physitrack/.test(rt) && /CUH|剑桥/.test(rt), '体态小课：收下巴剂量写 Physitrack 与 CUH 两个来源');
    const thc = await page.evaluate(() => (window.__fit.posture.PMOVE.thoracic || {}).cue || '');
    check(/本 App 没查到研究证明它能改善脖子前倾/.test(thc), '泡沫轴胸椎伸展：写明只是活动度、本 App 没查到研究证明改善前倾');
    // (g) 每日小习惯卡
    const hb = await tx(page, '#habitList');
    check(/✅ 官方建议/.test(hb) && /⚠️ 证据不一/.test(hb) && /App 的建议/.test(hb), '每日小习惯：三种证据标签都在');
    const tags = await page.evaluate(() => [...document.querySelectorAll('#habitList .habit')].map(h => [h.querySelector('.tag').textContent, h.textContent]));
    const appOnly = ['每 30 分钟', '手机举高', '左右轮流'].every(w => tags.some(([t, x]) => x.includes(w) && /App 的建议/.test(t)));
    const okSrc = tags.filter(([t]) => /官方/.test(t)).every(([, x]) => /NHS|HSE|OSHA|CUH|剑桥/.test(x));
    check(appOnly && okSrc, '每日小习惯：没来源的（每 30 分钟、手机举高、包包轮流）标 App 的建议；标 ✅ 的都附官方来源');
    // (i) 侧面照＋竖线；(j) 颅椎角 5° 误差
    const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 60; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#39c'; g.fillRect(0, 0, 60, 80); return c.toDataURL('image/png').split(',')[1]; });
    await page.setInputFiles('#ppSide', { name: 'side.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }, T2).catch(() => {});
    await page.waitForSelector('#ppCmp-side .vl', { timeout: 5000 }).catch(() => {});
    check(await page.locator('#ppCmp-side .vl').count() >= 1 && await page.locator('#ppVl').count() === 1, '照片对比：有侧面照选项，侧面照有可移动的竖线');
    for (const v of ['48', '51']) { await page.fill('#ptCVA', v, T2).catch(() => {}); await page.click('#ptSave', T2).catch(() => {}); }
    const cm = await tx(page, '#ptCvaMsg');
    check(/\+3°/.test(cm) && /5° 以内/.test(cm), `颅椎角：48 → 51，差 +3° → 「5° 以内，可能只是量的误差」（实得：${cm}）`);
    check(errors.length === 0, `前倾／红旗／习惯没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  // (d) 深连结：?go=posture 能做就直接开小课；有红旗开体态页
  {
    const { ctx, page, errors } = await openWith([]);
    await seed(page, POST_OK);
    await page.goto(URL + '?go=posture'); await page.waitForSelector('#workout .ex', { state: 'attached' });
    const st = await page.evaluate(() => ({ pl: !document.getElementById('player').hidden, s0: window.__fit.player().steps[0] && window.__fit.player().steps[0].pk, url: location.search }));
    check(st.pl && st.s0 === 'hip9090' && st.url === '', `深连结：fitness/?go=posture 直接打开体态小课全屏跟练，网址的 ?go 清掉（${JSON.stringify(st)}）`);
    await seed(page, Object.assign({}, POST_OK, { red: { bend: 'no', nk: { arm: true } } }));
    await page.goto(URL + '?x=1'); await page.goto(URL + '#posture'); await page.waitForSelector('#workout .ex', { state: 'attached' });
    const st2 = await page.evaluate(() => ({ pl: !document.getElementById('player').hidden, post: !document.getElementById('tab-post').hidden }));
    check(!st2.pl && st2.post, `深连结：有红旗时不开小课、改开体态页（${JSON.stringify(st2)}）`);
    check(errors.length === 0, `深连结没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  // (e) 洗髓功完成画面有连结
  {
    const xs = fs.readFileSync('xisui/index.html', 'utf8');
    const m = xs.match(/id="completion"[\s\S]*?reset-all-wrap/);
    check(m && /href="\.\.\/fitness\/\?go=posture"/.test(m[0]) && /體態小課/.test(m[0]), '洗髓功：完成画面有「接著做體態小課」按钮，连到 ../fitness/?go=posture');
    const { ctx, page } = await openWith([]);
    await page.goto(`http://localhost:${PORT}/xisui/`);
    await page.evaluate(() => { document.getElementById('completion').classList.add('show'); });
    const href = await page.getAttribute('#nextPosture', 'href', T2).catch(() => null);
    const vis = await page.isVisible('#nextPosture').catch(() => false);
    check(vis && href === '../fitness/?go=posture', `洗髓功：完成时按钮看得到（${vis}，${href}）`);
    await ctx.close();
  }
  // (f) 训练页早上卡片＋今天做了打勾，算进本周；没做的日子不当失败
  {
    const { ctx, page, errors } = await openWith([]);
    await seed(page, POST_OK); await page.reload(); await page.waitForSelector('#workout .ex');
    const h = await tx(page, '#postMorning');
    check(/洗髓功后：体态小课（含脖子）/.test(h) && /本周 0 次/.test(h), `早上卡片：标题「洗髓功后：体态小课（含脖子）」、本周 0 次（实得：${h}）`);
    const card = await tx(page, '#postCard');
    check(/3–5 次/.test(card) && /App 的安排/.test(card) && /不用补/.test(card) && !/失败|漏做|没完成/.test(card), '早上卡片：建议每周 3–5 次（App 的安排），没做的日子不当失败');
    await page.check('#pmDone', T2).catch(() => {});
    const n1 = await page.evaluate(() => window.__fit.posture.get().done.length);
    check(n1 === 1 && /本周 1 次/.test(await tx(page, '#postWeekN')), '早上卡片：打勾「今天做了」→ 记一笔、本周 1 次');
    await page.reload(); await page.waitForSelector('#workout .ex');
    check(await page.isChecked('#pmDone', T2).catch(() => false), '早上卡片：重载后今天仍是打勾');
    await page.uncheck('#pmDone', T2).catch(() => {});
    check(await page.evaluate(() => window.__fit.posture.get().done.length) === 0 && /本周 0 次/.test(await tx(page, '#postWeekN')), '早上卡片：取消打勾 → 本周回到 0 次');
    check(errors.length === 0, `早上卡片没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  // (h) 文案守门：不用「低头族负重」那组吓人数字；Sheikhhoseini 用对的 PMID
  {
    const html = fs.readFileSync('fitness/index.html', 'utf8');
    const BANNED = ['60 磅', '27 磅', '27 公斤', '60 lbs', '27 pounds', 'text neck', '低头族', '29776552', '前倾会导致颈痛', '前倾会造成颈痛。'];
    const hit = BANNED.filter(b => html.includes(b));
    check(hit.length === 0, `脖子文案：没有吓人的低头负重数字、错的 PMID、或把相关说成因果${hit.length ? '（还在：' + hit.join('、') + '）' : ''}`);
    const need = ['30107937', '38834878', '31773477', '33444448', '40845624', '32911612', 'cervical-spondylosis', 'work-routine.htm', 'osha.gov', 'neck-exercises-and-advice', 'chin-tuck'];
    const miss = need.filter(b => !html.includes(b));
    check(miss.length === 0, `脖子文案：查证过的来源都在${miss.length ? '（缺：' + miss.join('、') + '）' : ''}`);
  }
}

// ---- 19. 2026-11-19 verifier 退件：比原文满的说法、BMI 偏低、急诊红旗不能按「医生看过」 ----
{
  const html = fs.readFileSync('fitness/index.html', 'utf8');
  const xs = fs.readFileSync('xisui/index.html', 'utf8');
  const notes = fs.readFileSync('.claude/notes/fitness-fatloss-research.md', 'utf8');
  const BANNED = ['受试者偏年轻', '颈后被拉开', '没有研究证明它能改善脖子前倾', '所以小课里的收下巴是肌力练习', '健康人的研究里'];
  const hit = BANNED.filter(b => html.includes(b)).concat(xs.includes('打開健身 App 直接開始') ? ['打開健身 App 直接開始'] : [])
    .concat(notes.includes('有训练经验的年轻人') ? ['笔记：有训练经验的年轻人'] : []);
  check(hit.length === 0, `退件文案：比原文满的句子不再出现${hit.length ? '（还在：' + hit.join('、') + '）' : ''}`);
  const need = ['摘要没写年龄；受试者是有训练经验的人，没有针对 40 岁以上的专门试验', '感觉颈部被拉开', '头往后平移（App 的描述）',
    '本 App 没查到研究证明它能改善脖子前倾', '收下巴与研究里的颅颈屈肌训练相近（App 的推论）', '39483836', '17 岁追踪到 22 岁', '18–65 岁', '滑手机时的低头角度',
    '只在男性', '枕头研究结果不一', 'BMI 偏低，不建议用这个页面减重（App 的保守判断）', '18.5'];
  const miss = need.filter(b => !html.includes(b));
  check(miss.length === 0, `退件文案：新的标签与限定都在${miss.length ? '（缺：' + miss.join('、') + '）' : ''}`);
  check(xs.includes('約 12 分鐘；已做過自查會直接開始，否則先進自查'), '洗髓功：完成画面说明「已做過自查會直接開始，否則先進自查」');
  check(/18\.5/.test(notes) && /underweight/i.test(notes), '笔记：WHO 体重过轻 <18.5 有原文引句');
  const T2 = { timeout: 3000 };
  // BMI 17.0（50 kg／171.5 cm）→ 不给少吃量
  {
    const { ctx, page, errors } = await openWith([]);
    await page.click('nav.tabs [data-tab="train"]'); await page.click('#dietCard [data-open-diet]');
    await page.click('#dSex [data-v="M"]'); await page.fill('#dAge', '40'); await page.fill('#dKg', '50'); await page.fill('#dCm', '171.5').catch(() => {});
    const bm = await page.textContent('#dBmi', T2).catch(() => '');
    const kc = await page.textContent('#dKcal', T2).catch(() => '');
    check(/17(\.0)?\b/.test(bm) && /BMI 偏低，不建议用这个页面减重（App 的保守判断）/.test(kc) && !/少吃/.test(kc.replace(/BMI 偏低[^。]*。/, '')) && !/500/.test(kc),
      `BMI 17.0：不给少吃量，显示「BMI 偏低，不建议用这个页面减重」（实得：${kc.slice(0, 120)}）`);
    await page.click('#dMode [data-v="range"]').catch(() => {});
    const kc2 = await page.textContent('#dKcal', T2).catch(() => '');
    check(!/1500|1200|500/.test(kc2), `BMI 17.0、点「按指南区间」也不出现任何热量数字（实得：${kc2.slice(0, 120)}）`);
    check(/18\.5/.test(bm), 'BMI 17.0：BMI 区块写出 WHO 体重过轻门槛 18.5');
    check(errors.length === 0, `BMI 偏低没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  // 急诊红旗：没有「医生看过」按钮；旧资料里就算确认过也作废；一般红旗仍有按钮
  {
    const base = { q: { shift: 'N', shoulder: 'E', fhp: 'Y' }, red: { bend: 'no', nk: { walk: true } }, tests: [], done: [], qTs: Date.now() - 864e5 };
    const { ctx, page, errors } = await openWith([]);
    await page.evaluate(v => localStorage.setItem('fit.posture', JSON.stringify(v)), base); await page.reload(); await page.waitForSelector('#workout .ex');
    await page.click('#postCard [data-open-post]', T2).catch(() => {});
    const m = await page.textContent('#postRedMsg', T2).catch(() => '');
    check(/^马上去急诊/.test(m.trim()) && await page.locator('#postRedMsg [data-post-ack]').count() === 0 && /改回答案/.test(m),
      `急诊红旗：只显示「马上去急诊」、没有「医生看过」按钮，写明改了答案才会消失（实得：${m.slice(0, 120)}）`);
    // 旧资料：之前对急诊红旗按过确认
    const sig = await page.evaluate(() => (window.__fit.posture.get ? 1 : 0));
    await page.evaluate(v => localStorage.setItem('fit.posture', JSON.stringify(v)), Object.assign({}, base, { ack: Date.now(), ackFor: ['走路出现新的问题'] }));
    await page.reload(); await page.waitForSelector('#workout .ex');
    check(sig === 1 && await page.locator('#postCard [data-post-go]').count() === 0 && /马上去急诊/.test(await page.textContent('#postCard', T2).catch(() => '')),
      '急诊红旗：旧资料里按过「医生看过」也不算，训练页仍是「马上去急诊」、没有小课');
    await page.evaluate(v => localStorage.setItem('fit.posture', JSON.stringify(v)), Object.assign({}, base, { red: { bend: 'no', nk: { arm: true } } }));
    await page.reload(); await page.waitForSelector('#workout .ex');
    await page.click('#postCard [data-open-post]', T2).catch(() => {});
    check(await page.locator('#postRedMsg [data-post-ack]').count() === 1, '一般红旗（尽快看医生）：仍有「医生看过，说可以运动」按钮');
    check(errors.length === 0, `急诊红旗没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
}

// ---- 21. 两个加量开关（2026-11-23 用户拍板：只要开关、默认关）：「每个动作做 4 组」「加练手臂」 ----
// 守：(a) 默认关＝跟加开关之前完全一样（3 组、没有手臂段、时间不变）；(b) 4 组：正常周 4、减量周 2，跟练／Garmin／时间跟着变；
// (c) 加练手臂：三种器材的卡片／跟练／Garmin／动图对、徒手版不加；减量周 1 轮；(d) 双重进步法：手臂 2 组做满就加重、
// 旧的 3 组记录在 4 组模式照旧算、4 组都做满才加重、miss2 照旧；新纪录与每周训练量含手臂；(e) 备份来回保留开关；(f) 文案守门。
// 时间估算手算（App 的估算：每组 45 秒＋步骤里写死的秒数，休息 60 秒）：
//   健身房（有氧默认 15 分钟，2026-11-24 起）：热身 240＋放松 180＋有氧 900＋12 组×45＋6 次休息×60 ＝ 2220 秒 ＝ 37 分钟
//   ＋4 组：多 4 组×45＋2 次休息×60 ＝ 300 秒 → 2520 ＝ 42；＋手臂（2 轮）：4 组×45＋2×60 ＝ 300 → 42；两个都开 2820 ＝ 47
//   健身房有氧选 20 分钟：各多 300 秒 → 2520＝42／2820＝47／2820＝47／3120＝52（第 22 段验）
//   哑铃 A：热身 240＋放松 180＋心肺收尾 6 分钟 360＋540＋360 ＝ 1680 ＝ 28；＋手臂 33；徒手开手臂仍 28（徒手不加）
//   健身房减量周（2 轮，有氧 15）：1320＋8×45＋4×60 ＝ 1920；＋手臂 1 轮（2×45＋60＝150）→ 2070 秒 ＝ 34.5 → 显示 35（Math.round）
//   （有氧 20：2220／2370＝39.5 → 40）
{
  const guard = async (label, fn) => { try { await fn(); } catch (e) { check(false, `${label}：执行出错 ${String(e).split('\n')[0].slice(0, 160)}`); } };
  const T2 = { timeout: 4000 };
  const steps = (page, wk) => page.evaluate(w => window.__fit.vol.buildSteps(w).map(s => ({ k: s.kind, id: s.id || '', ph: s.phase || '', cdv: !!s.cdv, fin: !!s.fin })), wk);
  const est = page => page.evaluate(() => ['A', 'B', 'C'].map(w => window.__fit.vol.estSec(window.__fit.vol.buildSteps(w))));
  const sets2 = (ex, kg, reps, n = 2, rir = 2) => Array.from({ length: n }, (_, i) => ({ ex, set: i + 1, kg, reps: Array.isArray(reps) ? reps[i] : reps, rir, done: true }));
  const gsess = (id, d, wk, list, extra = {}) => sess(id, d, wk, list, { equip: 'gym', ...extra });

  await guard('加量开关 (a) 默认关', async () => {
    for (const [eq, sec, mins] of [['gym', 2220, 37], ['db', 1680, 28], ['bw', 1680, 28]]) {
      const { ctx, page, errors } = await openWith([], undefined, { cfg: { equip: eq } });
      await page.click('#picker [data-wk="A"]');
      const rows = await page.locator('#workout [data-done^="gsquat_"]').count();
      const st = await steps(page, 'A');
      const e = await est(page);
      const g = await page.textContent('#gText');
      const sub = await page.textContent('#goSub');
      check(rows === 3 && !(await page.locator('#armCard').count()) && st.filter(s => s.k === 'set').length === 12 && !st.some(s => /curl|tri/.test(s.id)),
        `默认关（${eq}）：每个动作 3 组、没有手臂超级组、跟练 12 组（组 ${rows}／跟练 ${st.filter(s => s.k === 'set').length}）`);
      check(e[0] === sec && new RegExp('全部约 ' + mins + ' 分钟').test(sub) && /· 3 轮 ·/.test(sub) && !/手臂/.test(sub), `默认关（${eq}）：全部约 ${mins} 分钟（手算 ${sec} 秒；实得 ${e[0]} 秒、「${sub}」）`);
      check(/重复 3 次/.test(g) && !/重复 4 次|（手臂）|哑铃弯举|绳索弯举|绳索下压|臂屈伸/.test(g), `默认关（${eq}）：Garmin 照旧「重复 3 次」、没有手臂`);
      await page.click('nav.tabs [data-tab="more"]');
      check(await page.getAttribute('#cfgSets4', 'aria-pressed') === 'false' && await page.getAttribute('#cfgArms', 'aria-pressed') === 'false', `默认关（${eq}）：设置里两个开关都是关的`);
      check(errors.length === 0, `默认关（${eq}）没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
      await ctx.close();
    }
  });

  await guard('加量开关 (b) 4 组', async () => {
    const { ctx, page, errors } = await openWith(HIST_A, undefined, { cfg: { equip: 'gym' } });
    await page.click('nav.tabs [data-tab="more"]'); await page.click('#cfgSets4'); await page.click('nav.tabs [data-tab="train"]');
    await page.click('#picker [data-wk="A"]');
    const rows = await page.locator('#workout [data-done^="gsquat_"]').count();
    const st = await steps(page, 'A');
    const e = await est(page);
    check(rows === 4 && st.filter(s => s.k === 'set').length === 16 && st.some(s => /第 4\/4 轮/.test(s.ph)), `开 4 组：正常周每个动作 4 组、跟练 16 组、有「第 4/4 轮」（组 ${rows}）`);
    check(e[0] === 2520 && /全部约 42 分钟/.test(await page.textContent('#goSub')), `开 4 组（健身房，有氧 15）：全部约 42 分钟（手算 2520 秒；实得 ${e[0]}）`);
    check(/重复 4 次/.test(await page.textContent('#gText')), '开 4 组：Garmin 写「重复 4 次」');
    // 4 组中途：第 3 组做完还要再一轮，第 4 组才换下一个超级组
    await page.click('#workout [data-done="bench_2"]');
    check(/接着第 4 轮/.test(await page.textContent('#restNext')), '开 4 组：第 3 轮做完的休息提示「接着第 4 轮」');
    await page.click('#restSkip');
    // 旧的 3 组记录：深蹲 12kg×12×3 有余力 → 照旧 +2 到 14
    await page.click('#eqSeg [data-eq="db"]');
    const sg = await page.locator('#workout .sug').first().textContent();
    check(/14 kg/.test(sg) && /上次 3 组都做到 12/.test(sg), `开 4 组：旧的 3 组记录照旧算——深蹲 12kg×12×3 → 14 kg（实得：${sg}）`);
    check(errors.length === 0, `开 4 组没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
    // 减量周仍 2 轮
    const o = await openWith(HIST_B, undefined, { cfg: { sets4: true } });
    await o.page.click('#picker [data-wk="A"]');
    const r2 = await o.page.locator('#workout [data-done^="gsquat_"]').count();
    check(r2 === 2 && (await steps(o.page, 'A')).filter(s => s.k === 'set').length === 8, `开 4 组：减量周仍每个动作 2 组（实得 ${r2}）`);
    await o.ctx.close();
    // 4 组做满才加重；4 组里有一组没满就维持；两次不到下限 → 9 成
    const four = (kg, reps) => [1, 2, 3, 4].map((n, i) => ({ ex: 'gsquat', set: n, kg, reps: Array.isArray(reps) ? reps[i] : reps, rir: 2, done: true }));
    const o2 = await openWith([sess('s_41', 9, 'A', four(12, [9, 9, 7, 7])), sess('s_42', 2, 'A', four(12, 12))], undefined, { cfg: { sets4: true } });
    const s1 = await o2.page.evaluate(() => window.__fit.suggest('db:gsquat'));
    check(s1.kg === 14 && /上次 4 组都做到 12/.test(s1.text), `开 4 组：上次 4 组都 12 下 → 14 kg（实得 ${s1.kg}：${s1.text}）`);
    await o2.ctx.close();
    const o3 = await openWith([sess('s_43', 9, 'A', four(12, [12, 12, 12, 10])), sess('s_44', 2, 'A', four(12, [12, 12, 12, 11]))], undefined, { cfg: { sets4: true } });
    const s3 = await o3.page.evaluate(() => window.__fit.suggest('db:gsquat'));
    check(s3.kg === 12 && s3.dir === 'same', `开 4 组：第 4 组没到 12 下 → 维持 12 kg（实得 ${s3.kg} ${s3.dir}）`);
    await o3.ctx.close();
    const o4 = await openWith([sess('s_45', 9, 'A', four(20, [9, 8, 7, 6])), sess('s_46', 2, 'A', four(20, [8, 8, 7, 7]))], undefined, { cfg: { sets4: true } });
    const s4 = await o4.page.evaluate(() => window.__fit.suggest('db:gsquat'));
    check(s4.kg === 18 && /连续两次/.test(s4.text), `开 4 组：连续两次有组不到 8 下 → 18 kg（20×0.9；实得 ${s4.kg}）`);
    await o4.ctx.close();
  });

  await guard('加量开关 (c) 加练手臂', async () => {
    for (const [eq, names, files, sec, mins] of [
      ['gym', ['绳索弯举（直杆）', '绳索下压'], ['anim/cablecurl.webp', 'anim/pushdown.webp'], 2520, 42],
      ['db', ['哑铃弯举', '坐姿哑铃过头臂屈伸'], ['anim/curl-hands.webp', 'anim/ohext-one.webp'], 1980, 33]]) {
      const { ctx, page, errors } = await openWith([], undefined, { cfg: { equip: eq, arms: true } });
      await page.click('#picker [data-wk="A"]');
      const card = page.locator('#armCard');
      const nm = await card.locator('h3').allTextContents();
      const srcs = await card.locator('.ph.anim img').evaluateAll(a => a.map(i => i.getAttribute('src')));
      const rows = await card.locator('[data-done]').count();
      check(nm.join('|') === names.join('|') && srcs.join('|') === files.join('|') && rows === 4 && /超级组 3 · 手臂/.test(await card.locator('h2').textContent()),
        `加练手臂（${eq}）：第 3 个超级组＝${names.join('＋')}，各 2 组，动图 ${srcs.join('、')}`);
      const st = await steps(page, 'A');
      const iArm = st.findIndex(s => s.id === 'curl'), iLastMain = st.map(s => /^(gsquat|bench|rdl|row1)$/.test(s.id)).lastIndexOf(true), iEnd = st.findIndex(s => s.cdv || s.fin);
      check(iArm > iLastMain && iArm < iEnd && st.filter(s => s.id === 'curl' || s.id === 'tri').length === 4 && st.some(s => /超级组 3（手臂） · 第 2\/2 轮/.test(s.ph)),
        `加练手臂（${eq}）：跟练在两个超级组之后、${eq === 'gym' ? '有氧' : '心肺收尾'}之前，弯举＋臂屈伸各 2 组`);
      const e = await est(page);
      check(e[0] === sec && new RegExp('全部约 ' + mins + ' 分钟').test(await page.textContent('#goSub')), `加练手臂（${eq}）：全部约 ${mins} 分钟（手算 ${sec} 秒；实得 ${e[0]}）`);
      const g = await page.textContent('#gText');
      check(new RegExp('4\\. 重复 2 次（手臂）：[\\s\\S]*' + names[0].replace(/[()（）]/g, '.') + '[\\s\\S]*' + names[1]).test(g) && /6\. 放松/.test(g), `加练手臂（${eq}）：Garmin 第 4 步是手臂（重复 2 次），放松变第 6 步`);
      // 换动作：手臂两个槽位都有替代，而且有动图
      await card.locator('[data-swap="curl"]').click();
      const alts = await card.locator('#alts-curl .alt').count();
      check(alts === 2 && (await card.locator('#alts-curl .alt img').count()) === 2, `加练手臂（${eq}）：弯举可以换动作（${alts} 个选项、都有小动图）`);
      // 跟练里的手臂步骤用动图
      await page.click('#startPlayer');
      const idx = await page.evaluate(() => window.__fit.player().steps.findIndex(s => s.id === 'tri'));
      for (let i = 0; i < idx; i++) await page.click('#plNextBtn');
      check(new RegExp(files[1].replace('.', '\\.')).test(await page.innerHTML('#plPhoto')) && /全部约 \d+ 分钟/.test(await page.textContent('#plCount')), `加练手臂（${eq}）：跟练手臂步骤用新动图，顶部写全部约几分钟`);
      await page.click('#plClose');
      check(errors.length === 0, `加练手臂（${eq}）没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
      await ctx.close();
    }
    // 徒手：不加，说明为什么
    {
      const { ctx, page } = await openWith([], undefined, { cfg: { equip: 'bw', arms: true } });
      const st = await steps(page, 'A');
      check(!(await page.locator('#armCard').count()) && await page.locator('#armsBwNote').isVisible() && !st.some(s => /curl|tri/.test(s.id)) && !/（手臂）|哑铃弯举|绳索弯举|绳索下压|臂屈伸/.test(await page.textContent('#gText')) && (await est(page))[0] === 1680,
        '加练手臂（徒手）：不加手臂段、跟练／Garmin 都没有、时间仍 28 分钟，并写明为什么');
      await ctx.close();
    }
    // 两个都开（健身房，有氧 15）47 分钟；减量周手臂 1 轮、时间 2070 秒
    {
      const { ctx, page } = await openWith([], undefined, { cfg: { equip: 'gym', arms: true, sets4: true } });
      check((await est(page))[0] === 2820 && /4 轮＋手臂 2 轮 · 全部约 47 分钟/.test(await page.textContent('#goSub')), '两个都开（健身房，有氧 15）：4 轮＋手臂 2 轮，全部约 47 分钟（手算 2820 秒）');
      await ctx.close();
      const o = await openWith(HIST_B.map(s => ({ ...s, equip: 'gym' })), undefined, { cfg: { equip: 'gym', arms: true, sets4: true } });
      await o.page.click('#picker [data-wk="A"]');
      check((await o.page.locator('#armCard [data-done^="curl_"]').count()) === 1 && (await o.page.locator('#workout [data-done^="gsquat_"]').count()) === 2 && (await est(o.page))[0] === 2070 && /全部约 35 分钟/.test(await o.page.textContent('#goSub')),
        '减量周（两个都开，有氧 15）：主动作 2 组、手臂 1 组，全部约 35 分钟（手算 2070 秒＝34.5）');
      await o.ctx.close();
    }
  });

  await guard('加量开关 (d) 手臂的加重建议、新纪录、训练量', async () => {
    const hist = [gsess('s_a1', 9, 'B', sets2('curl', 20, [11, 10])), gsess('s_a2', 2, 'A', [...sets2('curl', 20, 12), ...sets2('tri', 25, [9, 8])])];
    const { ctx, page, errors } = await openWith(hist, undefined, { cfg: { equip: 'gym', arms: true } });
    const c = await page.evaluate(() => window.__fit.suggest('gym:curl'));
    check(c.kg === 22.5 && /上次 2 组都做到 12/.test(c.text), `手臂：上次 2 组都做到 12 下 → 加到 22.5 kg（器械 +2.5；实得 ${c.kg}：${c.text}）`);
    const t = await page.evaluate(() => window.__fit.suggest('gym:tri'));
    check(t.kg === 25 && t.dir === 'same', `手臂：下压有组不到 10 下（只一次）→ 维持 25 kg（实得 ${t.kg} ${t.dir}）`);
    // 新纪录：绳索弯举 25kg×12 > 以前 20kg×12
    await page.click('#picker [data-wk="C"]');
    await page.fill('#kg-curl_0', '25'); await page.fill('#rp-curl_0', '12');
    await page.click('#workout [data-done="curl_0"]');
    await page.click('#finishBtn');
    check(/新纪录：绳索弯举/.test(await page.textContent('#storeNote')), `手臂：弯举 25kg×12 → 储存时报新纪录（${(await page.textContent('#storeNote')).slice(0, 60)}）`);
    // 记录页与每周训练量含手臂
    await page.click('nav.tabs [data-tab="hist"]');
    check(/绳索弯举（直杆）：25kg×12/.test(await page.textContent('#histList')), '手臂：记录页列出这次的绳索弯举');
    await page.click('nav.tabs [data-tab="prog"]');
    const vol = await page.evaluate(() => [...document.querySelectorAll('#volChart path[fill="var(--accent)"]')].length);
    const tips = await page.evaluate(() => { const svg = document.querySelector('#volChart svg'); const r = svg.getBoundingClientRect(); svg.dispatchEvent(new PointerEvent('pointermove', { clientX: r.right - 12, clientY: r.top + 20, bubbles: true })); return document.querySelector('#volChart .tip').textContent; });
    // 本周（9/28 起）：2 天前 20×12×2＋25×9＋25×8 ＝ 480＋225＋200 ＝ 905，今天 25×12 ＝ 300 → 1,205 kg
    check(vol >= 1 && /1,205 kg/.test(tips), `每周训练量含手臂：本周 905＋300 ＝ 1,205 kg（实得：${tips}）`);
    check(errors.length === 0, `手臂建议没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
    // 减量周手臂：9 成、只做 1 轮
    const o = await openWith([...HIST_B, sess('s_b9', 3, 'A', sets2('curl', 10, 12))], undefined, { cfg: { arms: true } });
    const d = await o.page.evaluate(() => window.__fit.suggest('db:curl'));
    check(d.dir === 'down' && /只做 1 轮/.test(d.text) && d.kg === 10, `减量周手臂：12×0.9＝10.8 取整到 2 kg＝10、写「只做 1 轮」（实得 ${d.kg}：${d.text}）`);
    await o.ctx.close();
  });

  await guard('加量开关 (e) 备份来回', async () => {
    const { ctx, page } = await openWith(HIST_A, undefined, { cfg: { sets4: true, arms: true, addSet: 1 } });
    await page.click('nav.tabs [data-tab="more"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
    const bf = os.tmpdir() + '/fit-addvol-backup.json'; fs.copyFileSync(await dl.path(), bf); const bk = JSON.parse(fs.readFileSync(bf, 'utf8'));
    check(bk.cfg.sets4 === true && bk.cfg.arms === true, '备份：cfg 里带着两个开关');
    await ctx.close();
    const b2 = await openWith([]);
    await b2.page.click('nav.tabs [data-tab="more"]');
    await b2.page.setInputFiles('#bkFile', bf);
    await b2.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
    const c2 = await b2.page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')));
    check(c2.sets4 === true && c2.arms === true && await b2.page.getAttribute('#cfgArms', 'aria-pressed') === 'true', '导入到新手机：两个开关都还原成开');
    await b2.ctx.close();
    const b3 = await openWith([], undefined, { cfg: { sets4: false, arms: false, addSet: 1 } });
    await b3.page.click('nav.tabs [data-tab="more"]');
    await b3.page.setInputFiles('#bkFile', bf);
    await b3.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
    const c3 = await b3.page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')));
    check(c3.sets4 === false && c3.arms === false, '导入：本机自己动过开关的，不被备份覆盖');
    await b3.ctx.close();
  });

  await guard('加量开关 (f) 文案守门', async () => {
    const { ctx, page } = await openWith([]);
    await page.click('nav.tabs [data-tab="more"]');
    const w4 = await page.textContent('#sets4Why'), wa = await page.textContent('#armsWhy'), nt = await page.textContent('#addVolNote');
    const need4 = ['默认关', '减量周仍是 2 轮', '0.023', '0.37%', '15 个研究', 'P=0.074', '只有趋势', 'Schoenfeld 2017', 'Schoenfeld 2019', 'App 的安排'];
    const needA = ['默认关', '10–12', '减量周 1 轮', 'App 的保守安排', '徒手版不加', '10 名', '8 周', '11.06%', '5.16%', 'Mannarino 2021', '20 名', '5.2%', '4.0%', '没有差别', 'Barbalho 2018', '已被撤稿', '没查证'];
    const needN = ['App 的保守判断', '先只开一个', '2–3 周', '连续两次推不上去', '超过 3 天', '睡眠变差', '不想去练', '两项以上就关掉'];
    const miss = [...need4.filter(x => !w4.includes(x)), ...needA.filter(x => !wa.includes(x)), ...needN.filter(x => !nt.includes(x))];
    check(miss.length === 0, `加量开关文案：来源数字与「App 的安排／保守判断」标签都在${miss.length ? '（缺：' + miss.join('、') + '）' : ''}`);
    const html = await page.content();
    check(['27433992', '30558493', '31268995', '30662699'].every(id => html.includes('pubmed.ncbi.nlm.nih.gov/' + id)), '加量开关文案：四篇来源都附 PubMed 连结');
    const BANNED = ['显著增加', '证明', '一定会', '更快增肌', '明显更好'];
    const hit = BANNED.filter(b => (w4 + wa).includes(b));
    check(hit.length === 0, `加量开关文案：没有比原文强的说法${hit.length ? '（还在：' + hit.join('、') + '）' : ''}`);
    const notes = fs.readFileSync('.claude/notes/fitness-fatloss-research.md', 'utf8');
    check(['27433992', '30558493', '31268995', '30662699', '31072272', 'Each additional set was associated', 'P = 0.074', '11.06%', 'flexed arm', 'volume-equated'].every(x => notes.includes(x)), '研究笔记：四篇来源的原文引句＋撤稿那篇 PMID 都记下了');
    await ctx.close();
  });
}

// ---- 22. 有氧时长 15／20 分钟（2026-11-24 用户拍板：要 15 分钟或加设定自己调 → 加设定，默认 15） ----
// 守：(a) 默认 15（没设过、旧 cfg 没有 cdMin 都是 15）；设置与有氧页都能切，切 20 后存进 cfg、重载还在；
// (b) 15 分钟版三方案分段（各 900 秒）、kcal 手算、剧烈／中等、每周当量、卡片／跟练／语音／记一笔／Garmin；方案3 仍从 5% 起、没有「8–12%」；
// (c) 20 分钟版各 1200 秒；(d) Yin 2024 句随设定切换；(e) 总时间估算（20 分钟 × 4 组／手臂各组合）；(f) 备份来回、导入规则同「4 组／手臂」；旧日志不动。
// kcal 手算（Σ MET×分钟 ×72÷60，MET 同第 20 段：单车 50 W 4.0、151–199 W 10.3；椭圆机中等 5.0、剧烈 9.0；跑步机 0% 4.8、户外 1–5% 爬坡 5.3、6–10% 7.0）：
//   方案1 15：热身 3×4.0＋用力 5×10.3＋轻踩 5×4.0＋放松 2×4.0 ＝ 12＋51.5＋20＋8 ＝ 91.5 × 1.2 ＝ 109.8 → 110；剧烈 5、中等 10
//   方案2 15：热身 3×5.0＋快 4×9.0＋慢 3×5.0＋快 4×9.0＋放松 1×5.0 ＝ 15＋36＋15＋36＋5 ＝ 107 × 1.2 ＝ 128.4 → 128；剧烈 8、中等 7
//   方案3 15：热身 2×4.8＋坡度走 12×5.3＋慢走 1×4.8 ＝ 9.6＋63.6＋4.8 ＝ 78 × 1.2 ＝ 93.6 → 94；主段 7.0：9.6＋84＋4.8 ＝ 98.4×1.2 ＝ 118.08 → 118；剧烈 0、中等 15
// 每周中等当量（剧烈×2，App 的推论）15 分钟：3 次＝15＋(10＋10)＋(7＋16)＝58；2 次 B+C＝(10＋7)＋2×(5＋8)＝43、A+B＝15＋10＋10＝35、C+A＝7＋16＋15＝38
{
  const guard = async (label, fn) => { try { await fn(); } catch (e) { check(false, `${label}：执行出错 ${String(e).split('\n')[0].slice(0, 160)}`); } };
  const T = NOW.getTime();
  const PROF = { profile: { sex: 'M', age: 40, kg: 72, cm: 168 }, mode: 'deficit', tre: { on: false, start: '12:00', end: '20:00', meals: 3 }, qg: { on: true, min: 45, minSet: 1 }, log: {}, setTs: T - 5 * DAY };
  const OLD20 = { id: 'c_o20', ts: T - 25 * DAY, kind: 'p1', min: 20, vig: 7, mod: 13, hr: 150, machine: '固定单车', day: 'B' }; // 2026-11-24 前的 20 分钟记录，切 15 也不改
  async function setup(cfg) {
    const o = await openWith([], undefined, { cfg });
    await o.page.evaluate(([c, d]) => { localStorage.setItem('fit.cardio', JSON.stringify(c)); localStorage.setItem('fit.diet', JSON.stringify(d)); }, [[OLD20], PROF]);
    await o.page.reload(); await o.page.waitForSelector('#workout .ex'); o.page.setDefaultTimeout(5000);
    return o;
  }
  const plans = page => page.evaluate(() => Object.fromEntries(Object.entries(window.__fit.cardio.CD_PLANS).map(([k, P]) => [k, { sec: P.ph.reduce((a, p) => a + p[2], 0), kcal: P.kcal, hi: P.kcalHi || null, vig: P.vig, mod: P.mod,
    met: Math.round(P.ph.reduce((a, p) => a + p[2] / 60 * p[6], 0) * 72 / 60), up: P.ph.filter(p => p[0] === 'up').reduce((a, p) => a + p[2], 0) / 60, json: JSON.stringify(P) }])));
  const len = page => page.evaluate(() => window.__fit.cardio.cdLen());

  await guard('有氧时长 (a) 默认 15、两处都能切', async () => {
    // 旧用户：cfg 里没有 cdMin（2026-11-24 前存的）
    const { ctx, page, errors } = await setup({ equip: 'gym', sets4: false, arms: false, mediaV3: 1 });
    check((await len(page)) === 15 && /15 分钟/.test(await page.textContent('#cdBlock .block-head')), '有氧时长：旧 cfg 没有 cdMin → 15 分钟，训练卡片标题「15 分钟」');
    await page.click('nav.tabs [data-tab="more"]');
    check((await page.getAttribute('#cfgCdMin [data-cdmin="15"]', 'aria-pressed')) === 'true' && (await page.getAttribute('#cfgCdMin [data-cdmin="20"]', 'aria-pressed')) === 'false' && /默认 15 分钟/.test(await page.textContent('#cdMinRow')),
      '更多 → 设置：「有氧时长（健身房版）」15 分钟被选中、写「默认 15 分钟」');
    check(/37–39/.test(await page.textContent('#helpGymMin')) && (await page.textContent('#helpCdMin')) === '15', '使用说明：健身房版 15 分钟有氧、≈ 37–39 分钟');
    await page.click('#cfgCdMin [data-cdmin="20"]');
    const c1 = await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')));
    check(c1.cdMin === 20 && c1.cdMinSet === 1 && (await len(page)) === 20 && /42–44/.test(await page.textContent('#helpGymMin')), '设置点 20 分钟 → cfg.cdMin＝20（记 cdMinSet）、使用说明改 ≈ 42–44 分钟');
    await page.click('nav.tabs [data-tab="train"]');
    check(/20 分钟/.test(await page.textContent('#cdBlock .block-head')), '切 20 后训练卡片标题「20 分钟」');
    await page.reload(); await page.waitForSelector('#workout .ex');
    check((await len(page)) === 20, '重载后还是 20 分钟');
    await page.click('nav.tabs [data-tab="cardio"]');
    check((await page.getAttribute('#cdLenSeg [data-cdmin="20"]', 'aria-pressed')) === 'true' && /力量课后 20 分钟/.test(await page.textContent('#cdTop')), '有氧页顶端也有「有氧时长」，现在是 20');
    await page.click('#cdLenSeg [data-cdmin="15"]');
    check((await len(page)) === 15 && /力量课后 15 分钟/.test(await page.textContent('#cdTop')) && (await page.getAttribute('#cdLenSeg [data-cdmin="15"]', 'aria-pressed')) === 'true', '有氧页点 15 → 回到 15 分钟，页面跟着换');
    check(errors.length === 0, `有氧时长切换没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
    const n = await openWith([]); // 全新用户
    check((await n.page.evaluate(() => window.__fit.cardio.cdLen())) === 15 && (await n.page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg') || '{}').cdMin)) !== 20, '全新用户：15 分钟');
    await n.ctx.close();
  });

  await guard('有氧时长 (b) 15 分钟版三方案', async () => {
    const { ctx, page, errors } = await setup({ equip: 'gym', mediaV3: 1 });
    const P = await plans(page);
    check(P.p1.sec === 900 && P.p2.sec === 900 && P.p3.sec === 900, `15 分钟版：三个方案各段加起来都是 900 秒（${P.p1.sec}／${P.p2.sec}／${P.p3.sec}）`);
    const HAND = { p1: [110, 5, 10], p2: [128, 8, 7], p3: [94, 0, 15] };
    check(['p1', 'p2', 'p3'].every(k => P[k].kcal === HAND[k][0] && P[k].met === HAND[k][0] && P[k].vig === HAND[k][1] && P[k].mod === HAND[k][2] && P[k].vig + P[k].mod === 15) && P.p3.hi === 118 && P.p1.up === 5 && P.p2.up === 8,
      `15 分钟版 kcal＝手算 110／128／94（每段 MET 重算一样、方案3 加到 6–10% 118），剧烈／中等 5/10、8/7、0/15（${JSON.stringify(Object.fromEntries(Object.entries(P).map(([k, v]) => [k, [v.kcal, v.met, v.hi, v.vig, v.mod]])))}）`);
    const ph = await page.evaluate(() => { const C = window.__fit.cardio.CD_PLANS; return { p1: C.p1.ph.map(p => p[0] + p[2]).join(','), p2: C.p2.ph.map(p => p[0] + p[2]).join(','), p3: C.p3.ph.map(p => p[0] + p[2]).join(','), p3a: C.p3.ph[1][4], p3b: C.p3.ph.slice(2, 7).every(p => /减 1%/.test(p[4]) && /加 0\.5%/.test(p[4]) && /最高 12%/.test(p[4])), p3sum: C.p3.sum }; });
    check(ph.p1 === 'warm180,' + Array(5).fill('up60,down60').join(',') + ',cool120' && ph.p2 === 'warm180,up240,down180,up240,cool60' && ph.p3 === 'warm120,' + Array(6).fill('chk120').join(',') + ',cool60',
      `15 分钟版分段：方案1 热身 3→5×(1＋1)→放松 2；方案2 热身 3→快 4→慢 3→快 4→放松 1；方案3 热身 2→6×2 分钟→慢走 1（${ph.p1} | ${ph.p2} | ${ph.p3}）`);
    check(/坡度调到 5%、时速 5\.0 km/.test(ph.p3a) && ph.p3b && /从坡度 5%/.test(ph.p3sum) && /12 分钟/.test(ph.p3sum) && !/8–12/.test(P.p3.json), `15 分钟版方案3：仍从坡度 5%、5.0 km/h 起、每 2 分钟按心率调（减 1%／加 0.5%／最高 12%），没有「8–12%」（${ph.p3sum}）`);
    const wk = await page.evaluate(() => { const F = window.__fit.cardio; const a = F.cdMins({ kind: 'p1' }), b = F.cdMins({ kind: 'p2' }), c = F.cdMins({ kind: 'p3' }); return { abc: a.mod + b.mod + c.mod + 2 * (a.vig + b.vig), bc: a.mod + b.mod + 2 * (a.vig + b.vig), ab: c.mod + a.mod + 2 * a.vig, ca: b.mod + c.mod + 2 * b.vig }; });
    check(wk.abc === 58 && wk.bc === 43 && wk.ab === 35 && wk.ca === 38, `15 分钟版每周中等当量：3 次 58；2 次 B+C 43、A+B 35、C+A 38（${JSON.stringify(wk)}）`);
    for (const [d, re] of [['A', /约 94 kcal/], ['B', /约 110 kcal/], ['C', /约 128 kcal/]]) {
      await page.click(`#picker [data-wk="${d}"]`);
      const t = await page.textContent('#cdBlock');
      check(re.test(t) && /15 分钟/.test(await page.textContent('#cdBlock .block-head')) && /接这 15 分钟/.test(t) && !/20 分钟/.test(t.replace('15／20 分钟', '')), `15 分钟版 ${d} 日卡片：标题 15 分钟、${re.source}、没有别的「20 分钟」`);
    }
    await page.click('#picker [data-wk="A"]');
    check(/约 118 kcal/.test(await page.textContent('#cdP3Why')), 'A 日方案3：坡度加到 6–10% 约 118 kcal');
    // Garmin（训练页）＋三个方案的 Garmin 文字
    const gt = await page.evaluate(() => { document.querySelector('#gPick [data-g="B"]').click(); return document.getElementById('gText').textContent; });
    check(/有氧 15 分钟：/.test(gt) && /重复 5 次/.test(gt) && /放松：按时间 2:00 · 约 50 W/.test(gt) && !/重复 7 次/.test(gt), '训练页 Garmin（B 日）：「有氧 15 分钟」、方案1 重复 5 次、放松 2:00');
    await page.click('nav.tabs [data-tab="cardio"]');
    const g = {}; for (const k of ['p1', 'p2', 'p3']) g[k] = await page.evaluate(k => { document.querySelector(`[data-cdg="${k}"]`).click(); return document.getElementById('cdgText').textContent; }, k);
    check(/重复 5 次/.test(g.p1) && /3:00/.test(g.p1) && /2:00 · 约 50 W/.test(g.p1) && /5\. 放松：按时间 1:00/.test(g.p2) && !/6\./.test(g.p2) && /12:00/.test(g.p3) && /1:00 · 坡度 0%/.test(g.p3) && /从坡度 5%/.test(g.p3) && /126–144/.test(g.p3),
      `有氧页 Garmin 15 分钟版：方案1 重复 5 次、放松 2:00；方案2 共 5 步、放松 1:00；方案3 坡度走 12:00、慢走 1:00、126–144（${g.p3.replace(/\n/g, ' / ')}）`);
    const wkT = await page.textContent('#cdWeek');
    check(/方案1 用力 5 分钟、方案2 快段 8 分钟算剧烈/.test(wkT), '本周分钟说明：方案1 用力 5 分钟、方案2 快段 8 分钟算剧烈');
    const hist = await page.textContent('#cdHist');
    check(/20 分钟（中等 13、剧烈 7）/.test(hist), '旧日志不动：之前存的 20 分钟方案1 记录照样显示 20 分钟（中等 13、剧烈 7）');
    // 跟练 B（方案1 15 分钟）：12 段、语音、记一笔
    await page.click('nav.tabs [data-tab="train"]'); await page.click('#picker [data-wk="B"]'); await page.click('#startPlayer');
    const st = await page.evaluate(() => window.__fit.player().steps.filter(s => s.cdv).map(s => ({ n: s.name, sec: s.sec, sp: s.speak })));
    check(st.length === 12 && st.reduce((a, s) => a + s.sec, 0) === 900 && st.filter(s => /^用力/.test(s.n)).length === 5 && st.filter(s => /^用力/.test(s.n)).every(s => /^加速/.test(s.sp) && /153到171/.test(s.sp)) && st[11].n === '放松' && st[11].sec === 120,
      `15 分钟版跟练（方案1）：12 段共 900 秒、5 段用力语音「加速…153到171」、最后放松 120 秒（${st.length} 段）`);
    await page.evaluate(() => { const F = window.__fit; while (F.player().steps[F.player().si].kind !== 'cdlog') document.getElementById('plNextBtn').click(); });
    check(/15 分钟有氧做完了/.test(await page.textContent('#plMain')), '跟练记录步骤：「15 分钟有氧做完了」');
    await page.fill('#plCdHr', '140'); await page.click('#plAct');
    const rec = (await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cardio')))).find(c => c.kind === 'p1' && c.id !== 'c_o20');
    check(rec && rec.min === 15 && rec.vig === 5 && rec.mod === 10 && rec.hr === 140, `15 分钟版记一笔：方案1、15 分钟（剧烈 5／中等 10）（${JSON.stringify(rec)}）`);
    await page.click('#plClose');
    check(errors.length === 0, `15 分钟版没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  });

  await guard('有氧时长 (c)(d) 20 分钟版与 Yin 句切换', async () => {
    const { ctx, page } = await setup({ equip: 'gym', mediaV3: 1 });
    await page.click('nav.tabs [data-tab="cardio"]');
    const y15 = await page.textContent('#cdWhyBody');
    const h15 = await page.evaluate(() => document.getElementById('helpCdYin').textContent);
    check(/方案1 整节 15 分钟、用力共 5 分钟，落在这个定义里/.test(y15) && /方案2 快段共 8 分钟，超过「高强度不超过 5 分钟」，不在定义里/.test(y15) && !/三个方案都不在这个定义里/.test(y15) && /这 15 分钟练的是心肺与血压/.test(y15) && /做 5 次/.test(y15) && /放松 2 分钟/.test(y15) && /第二轮快段后直接放松 1 分钟/.test(y15) && /最后 1 分钟坡度 0 慢走/.test(y15),
      '15 分钟：Yin 句写「方案1 整节 15 分钟、用力共 5 分钟，落在这个定义里；方案2 快段 8 分钟不在定义里」，方案1／2／3 的来源说明也是 15 分钟版');
    check(/方案1 整节 15 分钟、用力 5 分钟，落在定义里/.test(h15) && /15 分钟有氧/.test(h15) && !/三个方案都不在/.test(h15), `15 分钟：使用说明的减脂那条也是 15 分钟版（${h15.slice(0, 60)}）`);
    await page.click('#cdLenSeg [data-cdmin="20"]');
    const P = await plans(page);
    check(P.p1.sec === 1200 && P.p2.sec === 1200 && P.p3.sec === 1200 && P.p1.kcal === 149 && P.p2.kcal === 158 && P.p3.kcal === 125, `切 20：三个方案 1200 秒、kcal 149／158／125（${P.p1.sec}/${P.p2.sec}/${P.p3.sec}）`);
    const y20 = await page.textContent('#cdWhyBody');
    const h20 = await page.evaluate(() => document.getElementById('helpCdYin').textContent);
    check(/三个方案都不在这个定义里/.test(y20) && /方案1 整节 20 分钟、用力共 7 分钟/.test(y20) && !/落在这个定义里/.test(y20) && /这 20 分钟练的是心肺与血压/.test(y20) && /做 7 次/.test(y20) && /第二轮快段后也慢 3 分钟/.test(y20) && /最后 2 分钟坡度 0 慢走/.test(y20),
      '20 分钟：Yin 句改成「三个方案都不在这个定义里」，来源说明回到 20 分钟版');
    check(/三个方案都不在这个定义里/.test(h20) && !/落在定义里/.test(h20), '20 分钟：使用说明的减脂那条也改成「三个方案都不在」');
    await ctx.close();
  });

  await guard('有氧时长 (e) 总时间估算（20 分钟）', async () => {
    const est = page => page.evaluate(() => window.__fit.vol.estSec(window.__fit.vol.buildSteps('A')));
    for (const [x, sec, mins] of [[{}, 2520, 42], [{ sets4: true }, 2820, 47], [{ arms: true }, 2820, 47], [{ sets4: true, arms: true }, 3120, 52]]) {
      const { ctx, page } = await openWith([], undefined, { cfg: { equip: 'gym', cdMin: 20, ...x } });
      await page.click('#picker [data-wk="A"]');
      const e = await est(page);
      check(e === sec && new RegExp('全部约 ' + mins + ' 分钟').test(await page.textContent('#goSub')), `总时间（健身房、有氧 20${x.sets4 ? '、4 组' : ''}${x.arms ? '、手臂' : ''}）：全部约 ${mins} 分钟（手算 ${sec} 秒；实得 ${e}）`);
      await ctx.close();
    }
    const o = await openWith(HIST_B.map(s => ({ ...s, equip: 'gym' })), undefined, { cfg: { equip: 'gym', cdMin: 20, arms: true, sets4: true } });
    check((await est(o.page)) === 2370 && /全部约 40 分钟/.test(await o.page.textContent('#goSub')), '减量周（两个都开、有氧 20）：全部约 40 分钟（2370 秒）');
    await o.ctx.close();
  });

  await guard('有氧时长 (f) 备份来回', async () => {
    const { ctx, page } = await openWith([], undefined, { cfg: { equip: 'gym', cdMin: 20, cdMinSet: 1 } });
    await page.click('nav.tabs [data-tab="more"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
    const bf = os.tmpdir() + '/fit-cdmin-backup.json'; fs.copyFileSync(await dl.path(), bf); const bk = JSON.parse(fs.readFileSync(bf, 'utf8'));
    check(bk.cfg.cdMin === 20 && bk.cfg.cdMinSet === 1, '备份：cfg 里带着有氧时长 20');
    await ctx.close();
    const b2 = await openWith([]);
    await b2.page.click('nav.tabs [data-tab="more"]'); await b2.page.setInputFiles('#bkFile', bf);
    await b2.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
    check((await b2.page.evaluate(() => window.__fit.cardio.cdLen())) === 20 && (await b2.page.getAttribute('#cfgCdMin [data-cdmin="20"]', 'aria-pressed')) === 'true', '导入到新手机：有氧时长还原成 20');
    await b2.ctx.close();
    const b3 = await openWith([], undefined, { cfg: { cdMin: 15, cdMinSet: 1 } });
    await b3.page.click('nav.tabs [data-tab="more"]'); await b3.page.setInputFiles('#bkFile', bf);
    await b3.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
    check((await b3.page.evaluate(() => window.__fit.cardio.cdLen())) === 15, '导入：本机自己选过 15 的，不被备份的 20 覆盖');
    await b3.ctx.close();
  });
}

// ---- 23. 史密斯机算片／每个动作各自的休息／体重卡目标线与每周平均（2026-11-24 用户拍板这三项） ----
// 手算：
//   算片（总重量＝杠＋两边；每边＝(总−杠)÷2；片数最少、一样多取大片在前）：
//     50、杠 0、片全选 → 每边 25 ＝ 20＋5（15＋10 也是 2 片，取大片在前）；52.5 → 每边 26.25 ＝ 20＋5＋1.25；
//     51 → 每边 25.5 凑不出（片最小 1.25）→ 较轻每边 25（共 50，20＋5）／较重每边 26.25（共 52.5，20＋5＋1.25）；
//     杠 15、50 → 每边 17.5 ＝ 15＋2.5；杠 15、只剩 20／15／10／5 → 17.5 凑不出 → 较轻每边 15（共 45）／较重每边 20（共 55）；
//     只有 20 的片、50 → 每边 25 → 较轻 20（共 40）／较重 20＋20（共 80）；杠 15、总 15 → 空杠；总 10 < 杠 15 → 比杠还轻。
//   休息（默认：多关节 90、小动作 60；超级组取较长者）：
//     全新用户健身房 A（有氧 15）：热身 240＋放松 180＋有氧 900＋12 组×45＋6 次休息×90 ＝ 2400 ＝ 40 分钟
//     全新用户哑铃 A：240＋180＋心肺收尾 360＋540＋540 ＝ 1860 ＝ 31；健身房 A＋手臂（curl 60／tri 60）：＋4×45＋2×60 ＝ 300 → 2700 ＝ 45
//     哑铃 C 把登阶改 45 秒：[分腿蹲 90, 地板推举 90]→90、[登阶 45, 反向飞鸟 60]→60：240＋180＋360＋540＋3×90＋3×60 ＝ 1770 ＝ 29.5 → 30
//     老用户 cfg.rest＝75：每轮都 75；再把硬拉改 120 → A 的 [硬拉, 划船] 那组 120、其余 75
//     使用说明（训练 A、不开开关）：全新 健身房 40–42、哑铃 31–33、超级组 18 分钟
//   体重（周＝周一开始；固定今天 2026-09-30 周三）：本周 9/28 72.0、9/30 71.6 → 71.8；上周 9/22 72.4、9/24 72.0、9/26 72.2 → 72.2；
//     71.8−72.2 ＝ −0.4。只有上周 9/22 72.4、9/24 72.0（72.2）与前一周 9/15 72.6、9/17 73.0（72.8）→「上周平均 72.2，比前一周 −0.6」。
{
  const guard = async (label, fn) => { try { await fn(); } catch (e) { check(false, `${label}：执行出错 ${String(e).split('\n')[0].slice(0, 160)}`); } };
  const T = NOW.getTime();
  const at = (y, m, d) => new Date(y, m - 1, d, 8).getTime();
  const bodyRow = (y, m, d, kg) => ({ id: 'b_' + at(y, m, d), ts: at(y, m, d), kg, waist: null });
  async function withBody(rows, cfg) {
    const o = await openWith([], undefined, cfg ? { cfg } : {});
    await o.page.evaluate(b => localStorage.setItem('fit.body', JSON.stringify(b)), rows);
    await o.page.reload(); await o.page.waitForSelector('#workout .ex'); o.page.setDefaultTimeout(5000);
    return o;
  }

  await guard('算片 (a) 纯函数手算', async () => {
    const { ctx, page } = await openWith([]);
    const r = await page.evaluate(() => { const S = window.__fit.smith, all = [20, 15, 10, 5, 2.5, 1.25];
      return { a: S.plateCalc(50, 0, all), b: S.plateCalc(52.5, 0, all), c: S.plateCalc(51, 0, all), d: S.plateCalc(50, 15, all), e: S.plateCalc(50, 15, [20, 15, 10, 5]),
        f: S.plateCalc(50, 0, [20]), g: S.plateCalc(15, 15, all), h: S.plateCalc(10, 15, all), k: Object.keys(S.SMITH_K) }; });
    const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    check(r.a.exact && eq(r.a.per, [20, 5]), `算片：50 kg、杠 0、片全选 → 每边 20＋5（实得 ${JSON.stringify(r.a)}）`);
    check(r.b.exact && eq(r.b.per, [20, 5, 1.25]), `算片：52.5 → 每边 20＋5＋1.25（实得 ${JSON.stringify(r.b)}）`);
    check(!r.c.exact && r.c.lo.total === 50 && eq(r.c.lo.per, [20, 5]) && r.c.hi.total === 52.5 && eq(r.c.hi.per, [20, 5, 1.25]), `算片：51 凑不出 → 较轻 50（20＋5）／较重 52.5（20＋5＋1.25）（实得 ${JSON.stringify(r.c)}）`);
    check(r.d.exact && eq(r.d.per, [15, 2.5]), `算片：杠 15、50 → 减掉杠重，每边 15＋2.5（实得 ${JSON.stringify(r.d)}）`);
    check(!r.e.exact && r.e.lo.total === 45 && eq(r.e.lo.per, [15]) && r.e.hi.total === 55 && eq(r.e.hi.per, [20]), `算片：杠 15、没有 2.5／1.25 → 较轻 45（每边 15）／较重 55（每边 20）（实得 ${JSON.stringify(r.e)}）`);
    check(!r.f.exact && r.f.lo.total === 40 && r.f.hi.total === 80 && eq(r.f.hi.per, [20, 20]), `算片：只有 20 的片、50 → 较轻 40／较重 80（实得 ${JSON.stringify(r.f)}）`);
    check(r.g.exact && r.g.per.length === 0 && r.h.under, '算片：总重＝杠重 → 空杠；比杠还轻 → 提示');
    check(eq(r.k.sort(), ['gym:thrust', 'x:smithsquat']), `算片只给 App 里真的用史密斯机的两个动作：史密斯深蹲、健身房版「臀推机或史密斯臀推」（实得 ${r.k}）`);
    await ctx.close();
  });

  await guard('算片 (b) 卡片／设置／跟练／备份', async () => {
    const { ctx, page, errors } = await openWith([], undefined, { cfg: { equip: 'gym', alts: { 'gym:gsquat': 'x:smithsquat' } } });
    await page.click('#picker [data-wk="A"]');
    const pl = () => page.textContent('#workout .ex[data-slot="gsquat"] .plates');
    check(/填了总重量就显示每边挂几片/.test(await pl()) && (await page.locator('#workout .ex[data-slot="bench"] .plates').count()) === 0, '算片：史密斯深蹲卡片有算片行（还没填重量先提示）；坐姿推胸机没有');
    await page.fill('#kg-gsquat_0', '50');
    check(/每边挂：20＋5（共 50 kg）/.test(await pl()) && /杠重没填，按 0 算/.test(await pl()), `算片：填 50 → 「每边挂：20＋5（共 50 kg）」＋杠重没填的提示（实得：${await pl()}）`);
    await page.fill('#kg-gsquat_1', '52.5');
    check(/每边挂：20＋5＋1.25（共 52.5 kg）/.test(await pl()), `算片：改第 2 组 52.5 → 跟着刚改的那组（实得：${await pl()}）`);
    await page.click('nav.tabs [data-tab="more"]');
    await page.click('#smithBox summary');
    check(/不同健身房的史密斯杠重不一样，问工作人员或看杠上标示/.test(await page.textContent('#smithBarHint')) && !/\d+\s*kg 的杠|杠重(通常|一般)/.test(await page.textContent('#smithBody')), '算片设置：杠重留空的提示，且不写具体杠重数字');
    await page.fill('#cfgSmithBar', '15');
    await page.click('#cfgPlates [data-plate="2.5"]'); await page.click('#cfgPlates [data-plate="1.25"]');
    const c = await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')));
    check(c.smithBar === 15 && JSON.stringify(c.plates.slice().sort((a, b) => b - a)) === '[20,15,10,5]' && c.smithSet === 1, `算片设置：杠重 15、取消 2.5／1.25 → 存进 cfg（实得 ${c.smithBar}／${c.plates}）`);
    await page.click('nav.tabs [data-tab="train"]');
    await page.fill('#kg-gsquat_0', '50');
    check(/凑不出 50 kg：较轻 45 kg（每边 15）／较重 55 kg（每边 20）/.test(await pl()) && !/杠重没填/.test(await pl()), `算片：杠 15、没有小片 → 列较轻／较重（实得：${await pl()}）`);
    await page.evaluate(() => { document.querySelector('#cfgPlates [data-plate="2.5"]').click(); }); // 设置页不在画面上，直接点那颗钮
    await page.fill('#kg-gsquat_0', '50');
    check(/每边挂：15＋2.5（共 50 kg）/.test(await pl()), `算片：杠 15、勾回 2.5 → 每边 15＋2.5（实得：${await pl()}）`);
    // 跟练：史密斯深蹲那一步也有
    await page.click('#startPlayer');
    for (let i = 0; i < 8; i++) await page.click('#plNextBtn');
    await page.fill('#plKg', '60');
    check(/每边挂：20＋2.5（共 60 kg）/.test(await page.textContent('#plPlates')), `算片：跟练里填 60、杠 15 → 每边 20＋2.5（实得：${await page.textContent('#plPlates')}）`);
    await page.click('#plMain [data-stp="kg"][data-d="2.5"]');
    check(/凑不出 62.5 kg/.test(await page.textContent('#plPlates')), `算片：跟练按 +2.5 → 62.5（每边 23.75）凑不出（没有 1.25 的片）（实得：${await page.textContent('#plPlates')}）`);
    await page.click('#plClose');
    // 健身房 B 的臀推：注明「用史密斯机做时」
    await page.click('#picker [data-wk="B"]');
    check(/^用史密斯机做时，/.test(await page.textContent('#workout .ex[data-slot="thrust"] .plates')), '算片：健身房版臀推（臀推机或史密斯臀推）写明「用史密斯机做时」');
    // 备份来回
    await page.click('nav.tabs [data-tab="more"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
    const bf = os.tmpdir() + '/fit-smith-backup.json'; fs.copyFileSync(await dl.path(), bf); const bk = JSON.parse(fs.readFileSync(bf, 'utf8'));
    check(bk.cfg.smithBar === 15 && bk.cfg.plates.length === 5, '算片：备份带着杠重与杠片');
    check(errors.length === 0, `算片：没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
    const b2 = await openWith([]);
    await b2.page.click('nav.tabs [data-tab="more"]'); await b2.page.setInputFiles('#bkFile', bf);
    await b2.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
    const c2 = await b2.page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')));
    check(c2.smithBar === 15 && c2.plates.length === 5 && !c2.plates.includes(1.25), '算片：导入到新手机 → 杠重 15、杠片还原');
    await b2.ctx.close();
    const b3 = await openWith([], undefined, { cfg: { smithBar: 20, smithSet: 1 } });
    await b3.page.click('nav.tabs [data-tab="more"]'); await b3.page.setInputFiles('#bkFile', bf);
    await b3.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
    check((await b3.page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')).smithBar)) === 20, '算片：本机自己设过杠重的，不被备份覆盖');
    await b3.ctx.close();
  });

  await guard('休息 (a) 默认与超级组取较长者', async () => {
    const { ctx, page, errors } = await openWith([]);
    const r = await page.evaluate(() => { const R = window.__fit.rest; return ['gym:gsquat', 'db:bench', 'x:smithsquat', 'db:rdl', 'db:rfly', 'gym:rfly', 'bw:rfly', 'x:pullapart', 'db:curl', 'gym:tri', 'gym:rdl'].map(k => R.restOf(k)); });
    check(JSON.stringify(r) === '[90,90,90,90,60,60,60,60,60,60,60]', `休息默认：多关节 90、反向飞鸟／面拉／Y-T／弹力带拉开／二头／三头／腿弯举机 60（实得 ${r}）`);
    const e = await page.evaluate(() => window.__fit.vol.estSec(window.__fit.vol.buildSteps('A')));
    check(e === 1860 && /全部约 31 分钟/.test(await page.textContent('#goSub')), `休息：全新用户哑铃 A 全部约 31 分钟（手算 1860 秒；实得 ${e}）`);
    await page.click('#picker [data-wk="C"]');
    const heads = await page.locator('#workout .block-head .brest').allTextContents();
    check(JSON.stringify(heads) === '["90","90"]', `休息：哑铃 C 两组都是 90（登阶 90＞反向飞鸟 60，取较长的）（实得 ${heads}）`);
    await page.click('nav.tabs [data-tab="more"]'); await page.click('#restBox summary');
    await page.selectOption('#restBody select[data-restk="db:step"]', '45');
    const c = await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')));
    check(c.restBy['db:step'] === 45 && c.restSet === 1, '休息：设置里把登阶改 45 → 存进 cfg.restBy');
    await page.click('nav.tabs [data-tab="train"]');
    const h2 = await page.locator('#workout .block-head .brest').allTextContents();
    const stC = await page.evaluate(() => window.__fit.vol.buildSteps('C').filter(s => s.kind === 'rest').map(s => s.sec));
    const eC = await page.evaluate(() => window.__fit.vol.estSec(window.__fit.vol.buildSteps('C')));
    check(JSON.stringify(h2) === '["90","60"]' && JSON.stringify(stC) === '[90,90,90,60,60,60]', `休息：登阶 45、反向飞鸟 60 → 那组取较长的 60；跟练休息步骤 ${stC}`);
    check(eC === 1770 && /全部约 30 分钟/.test(await page.textContent('#goSub')), `休息：哑铃 C 总时间跟着改（手算 1770 秒＝29.5→30；实得 ${eC}）`);
    await page.evaluate(() => document.querySelector('#gPick [data-g="C"]').click());
    const g = await page.textContent('#gText');
    check((g.match(/休息 1:30/g) || []).length === 1 && (g.match(/休息 1:00/g) || []).length === 1, 'Garmin：C 的两组分别「休息 1:30」「休息 1:00」');
    // 卡片勾完一轮 → 休息倒数＝那组的秒数
    await page.click('nav.tabs [data-tab="train"]');
    await page.click('#workout [data-done="step_0"]'); await page.click('#workout [data-done="rfly_0"]');
    check(/1:00/.test(await page.textContent('#restT')), '卡片：登阶＋反向飞鸟做完一轮 → 休息倒数 1:00');
    await page.click('#restSkip');
    // 恢复默认
    await page.click('nav.tabs [data-tab="more"]'); await page.click('#restReset');
    const c3 = await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')));
    check(Object.keys(c3.restBy).length === 0 && (await page.inputValue('#restBody select[data-restk="db:step"]')) === '90', '休息：「全部恢复默认」→ restBy 清空、登阶回到 90');
    check(/39205815/.test(await page.innerHTML('#restWhy')) && /26605807/.test(await page.innerHTML('#restWhy')) && /App 的安排/.test(await page.textContent('#restWhy')) && /超过 90 秒没再看到明显差别/.test(await page.textContent('#restWhy')),
      '休息说明：Singer 2024／Schoenfeld 2016 的 PMID、「超过 90 秒没再看到明显差别」、分大小动作标 App 的安排');
    // verifier 退件（2026-11-24）：Schoenfeld 2016 只有大腿前侧肌肉厚度显著，不准写成笼统的「肌肉厚度」；加量开关不准再写死「约多 5 分钟」（休息改按动作后 4 组多 6 分钟）
    check(/大腿前侧肌肉厚度/.test(await page.textContent('#restWhy')) && !/力量与肌肉厚度/.test(await page.textContent('#restWhy')), '休息说明：Schoenfeld 2016 只写大腿前侧肌肉厚度（不比原文强）');
    check(!/约多 5 分钟/.test(await page.evaluate(() => document.body.innerHTML)), '加量开关与使用说明不再写死「约多 5 分钟」');
    const help = [await page.textContent('#helpGymMin'), await page.textContent('#helpDbMin'), await page.textContent('#helpSsMin')];
    check(JSON.stringify(help) === '["40–42","31–33","18"]', `使用说明的时间跟着休息走：健身房 40–42、哑铃 31–33、超级组 18（实得 ${help}）`);
    check(errors.length === 0, `休息：没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  });

  await guard('休息 (b) 健身房、手臂、跟练', async () => {
    const { ctx, page } = await openWith([], undefined, { cfg: { equip: 'gym', arms: true, restV2: 1 } });
    const e = await page.evaluate(() => window.__fit.vol.estSec(window.__fit.vol.buildSteps('A')));
    check(e === 2700 && /全部约 45 分钟/.test(await page.textContent('#goSub')), `休息：全新用户健身房 A＋手臂（有氧 15）全部约 45 分钟（手算 2700；实得 ${e}）`);
    const arm = await page.textContent('#armCard .brest');
    await page.click('nav.tabs [data-tab="more"]'); await page.click('#restBox summary');
    const rows = await page.locator('#restBody select[data-restk]').count();
    await page.selectOption('#restBody select[data-restk="gym:tri"]', '90');
    await page.click('nav.tabs [data-tab="train"]');
    check(arm === '60' && rows === 14 && (await page.textContent('#armCard .brest')) === '90', `休息：手臂组默认 60；设置列出 12＋2 个动作（${rows}）；三头改 90 → 手臂组 90`);
    await page.click('#startPlayer');
    const rs = await page.evaluate(() => window.__fit.player().steps.filter(s => s.kind === 'rest').map(s => s.sec + '|' + s.speak));
    check(rs.length === 8 && rs.slice(0, 6).every(x => x === '90|休息90秒') && rs.slice(6).every(x => x === '90|休息90秒'), `跟练：休息步骤与语音按每组的秒数（${rs.join(',')}）`);
    await ctx.close();
  });

  await guard('休息 (c) 旧 cfg.rest 迁移', async () => {
    const o = await openWith([], undefined, { cfg: { equip: 'gym', rest: 75 } });
    const r = await o.page.evaluate(() => { const c = JSON.parse(localStorage.getItem('fit.cfg')); return { c, a: window.__fit.vol.buildSteps('A').filter(s => s.kind === 'rest').map(s => s.sec) }; });
    check(r.c.restBase === 75 && !('rest' in r.c) && r.c.restV2 === 1 && r.a.every(x => x === 75), `迁移：旧 cfg.rest＝75 → restBase 75，每轮照旧 75 秒（实得 ${r.a}）`);
    await o.page.click('nav.tabs [data-tab="more"]'); await o.page.click('#restBox summary');
    check(/全 App 统一 75 秒/.test(await o.page.textContent('#restLegacy')) && /沿用你以前选的 75 秒/.test(await o.page.textContent('#restSum')), '迁移：设置里说明沿用了以前的 75 秒');
    await o.page.selectOption('#restBody select[data-restk="gym:rdl"]', '120');
    const a2 = await o.page.evaluate(() => window.__fit.vol.buildSteps('A').filter(s => s.kind === 'rest').map(s => s.sec));
    check(JSON.stringify(a2) === '[75,75,75,120,120,120]', `迁移后逐个改：腿弯举 120 → 那组 120、其余仍 75（实得 ${a2}）`);
    await o.page.reload(); await o.page.waitForSelector('#workout .ex');
    const a3 = await o.page.evaluate(() => window.__fit.vol.buildSteps('A').filter(s => s.kind === 'rest').map(s => s.sec));
    check(JSON.stringify(a3) === '[75,75,75,120,120,120]', '迁移：重载后不会再迁移一次（仍 75／120）');
    await o.ctx.close();
    const n = await openWith([]);
    const nc = await n.page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg') || '{}'));
    check(nc.restBase == null && nc.restV2 === 1, '迁移：全新用户没有 restBase，直接用按动作分的默认');
    await n.ctx.close();
    const o6 = await openWith([], undefined, { cfg: { equip: 'gym', rest: 60 } });
    const e6 = await o6.page.evaluate(() => window.__fit.vol.estSec(window.__fit.vol.buildSteps('A')));
    check(e6 === 2220, `迁移：旧默认 60 秒的老用户也照旧 60（健身房 A 仍 2220 秒＝37 分钟；实得 ${e6}）`);
    await o6.ctx.close();
  });

  await guard('休息 (d) 备份来回', async () => {
    const { ctx, page } = await openWith([], undefined, { cfg: { restV2: 1, restBy: { 'db:gsquat': 120 }, restSet: 1 } });
    await page.click('nav.tabs [data-tab="more"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
    const bf = os.tmpdir() + '/fit-rest-backup.json'; fs.copyFileSync(await dl.path(), bf); const bk = JSON.parse(fs.readFileSync(bf, 'utf8'));
    check(bk.cfg.restBy['db:gsquat'] === 120, '休息：备份带着逐个动作的休息');
    await ctx.close();
    const b2 = await openWith([]);
    await b2.page.click('nav.tabs [data-tab="more"]'); await b2.page.setInputFiles('#bkFile', bf);
    await b2.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
    check((await b2.page.evaluate(() => window.__fit.rest.restOf('db:gsquat'))) === 120, '休息：导入到新手机 → 高脚杯深蹲 120');
    await b2.ctx.close();
    const b3 = await openWith([], undefined, { cfg: { restV2: 1, restBy: { 'db:gsquat': 45 }, restSet: 1 } });
    await b3.page.click('nav.tabs [data-tab="more"]'); await b3.page.setInputFiles('#bkFile', bf);
    await b3.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
    check((await b3.page.evaluate(() => window.__fit.rest.restOf('db:gsquat'))) === 45, '休息：本机自己改过的，不被备份覆盖');
    await b3.ctx.close();
    // 旧版备份（只有统一的 rest）导入到新手机 → 沿用成 restBase
    const old = { app: 'fitness', v: 1, exported: T, sessions: [], body: [], cfg: { equip: 'db', rest: 75 } }; const of = os.tmpdir() + '/fit-rest-old.json'; fs.writeFileSync(of, JSON.stringify(old));
    const b4 = await openWith([]);
    await b4.page.click('nav.tabs [data-tab="more"]'); await b4.page.setInputFiles('#bkFile', of);
    await b4.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
    check((await b4.page.evaluate(() => window.__fit.rest.restOf('db:rfly'))) === 75, '休息：旧版备份（统一 75 秒）导入 → 每个动作沿用 75');
    await b4.ctx.close();
  });

  await guard('体重 (a) 每周平均与变化', async () => {
    const two = [bodyRow(2026, 9, 28, 72.0), bodyRow(2026, 9, 30, 71.6), bodyRow(2026, 9, 22, 72.4), bodyRow(2026, 9, 24, 72.0), bodyRow(2026, 9, 26, 72.2)];
    let o = await withBody(two);
    await o.page.click('nav.tabs [data-tab="prog"]');
    let w = await o.page.textContent('#bWeek');
    check(/本周平均 71\.8 kg，比上周 −0\.4 kg/.test(w) && /本周 2 笔、上周 3 笔/.test(w), `体重：本周平均 71.8、比上周 −0.4（手算 (72.0+71.6)/2、(72.4+72.0+72.2)/3）（实得：${w}）`);
    await o.ctx.close();
    o = await withBody([bodyRow(2026, 9, 22, 72.4), bodyRow(2026, 9, 24, 72.0), bodyRow(2026, 9, 15, 72.6), bodyRow(2026, 9, 17, 73.0)]);
    await o.page.click('nav.tabs [data-tab="prog"]'); w = await o.page.textContent('#bWeek');
    check(/上周平均 72\.2 kg，比前一周 −0\.6 kg/.test(w) && /本周还没记/.test(w), `体重：本周还没记 → 用上周比前一周（72.2−72.8＝−0.6）（实得：${w}）`);
    await o.ctx.close();
    o = await withBody([bodyRow(2026, 9, 29, 72.0), bodyRow(2026, 9, 15, 72.6)]);
    await o.page.click('nav.tabs [data-tab="prog"]'); w = await o.page.textContent('#bWeek');
    check(/本周平均 72\.0 kg/.test(w) && /上周没有体重记录，还算不出每周变化/.test(w) && !/比上周/.test(w), `体重：上周没记 → 只给本周平均＋提示，不跟两周前比（实得：${w}）`);
    await o.ctx.close();
    o = await withBody([]);
    await o.page.click('nav.tabs [data-tab="prog"]'); w = await o.page.textContent('#bWeek');
    check(/要本周（或上周）与前一周都有体重记录/.test(w) && !/平均 \d/.test(w), '体重：没有记录 → 提示，不乱算');
    check(/每周减 0\.5–1 kg/.test(await o.page.textContent('#bNhs')) && /tips-to-help-you-lose-weight/.test(await o.page.innerHTML('#bNhs')) && /不预测体重/.test(await o.page.textContent('#bNhs')), '体重：NHS 每周 0.5–1 kg 附原文链接，写明不预测');
    await o.ctx.close();
  });

  await guard('体重 (b) 目标线与备份', async () => {
    const { ctx, page } = await withBody([bodyRow(2026, 9, 28, 72.0), bodyRow(2026, 9, 22, 72.4)]);
    await page.click('nav.tabs [data-tab="prog"]');
    check((await page.locator('#bodyChart .goal-line').count()) === 0, '体重：没填目标 → 没有目标线');
    await page.fill('#bGoal', '70'); await page.dispatchEvent('#bGoal', 'change');
    const c = await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')));
    check(c.goalKg === 70 && c.goalSet === 1 && (await page.locator('#bodyChart .goal-line').count()) === 1 && /目标 70/.test(await page.textContent('#bodyChart')), '体重：填目标 70 → 存 cfg.goalKg、走势图画出目标虚线「目标 70」');
    // 目标线在 70 的位置：比 72 的点低
    const ys = await page.evaluate(() => { const l = document.querySelector('#bodyChart .goal-line'), cs = [...document.querySelectorAll('#bodyChart circle')].map(x => +x.getAttribute('cy')); return { g: +l.getAttribute('y1'), c: cs }; });
    check(ys.c.every(y => y < ys.g), '体重：目标线（70）画在 72 的点下面');
    await page.fill('#bGoal', '500'); await page.dispatchEvent('#bGoal', 'change');
    check(/20–300/.test(await page.textContent('#bGoalMsg')) && (await page.evaluate(() => JSON.parse(localStorage.getItem('fit.cfg')).goalKg)) === 70, '体重：目标乱填被挡、原值不变');
    await page.click('nav.tabs [data-tab="more"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkJson')]);
    const bf = os.tmpdir() + '/fit-goal-backup.json'; fs.copyFileSync(await dl.path(), bf);
    check(JSON.parse(fs.readFileSync(bf, 'utf8')).cfg.goalKg === 70, '体重：备份带着目标体重');
    await ctx.close();
    const b2 = await openWith([]);
    await b2.page.click('nav.tabs [data-tab="more"]'); await b2.page.setInputFiles('#bkFile', bf);
    await b2.page.waitForFunction(() => /导入完成/.test(document.getElementById('bkMsg').textContent));
    await b2.page.click('nav.tabs [data-tab="prog"]');
    check((await b2.page.inputValue('#bGoal')) === '70' && (await b2.page.locator('#bodyChart .goal-line').count()) === 1, '体重：导入到新手机 → 目标 70、目标线都在');
    await b2.ctx.close();
  });
}

// ---- 手机宽度：没有横向卷动 ----
{
  const { ctx, page, errors } = await openWith(HIST_A, { width: 360, height: 740 });
  for (const t of ['train', 'cardio', 'swim', 'prog', 'hist', 'more']) {
    await page.click(`nav.tabs [data-tab="${t}"]`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(over <= 0, `360px 宽「${t}」页没有横向卷动（多出 ${over}px）`);
  }
  await page.click('nav.tabs [data-tab="train"]'); await page.click('#postCard [data-open-post]');
  { const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); check(over <= 0, `360px 宽「体态」页没有横向卷动（多出 ${over}px）`); }
  await page.click('#postBack'); await page.click('nav.tabs [data-tab="train"]'); await page.click('#dietCard [data-open-diet]');
  { const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); check(over <= 0, `360px 宽「饮食」页没有横向卷动（多出 ${over}px）`); }
  check(errors.length === 0, `窄屏没有 JS 错误${errors.length ? '：' + errors.join(' | ') : ''}`);
  await ctx.close();
}

await browser.close();
for (const s of ok) console.log('  ✓ ' + s);
for (const s of fails) console.log('  ✗ ' + s);
if (fails.length) { console.log(`\n失败：${fails.length} 项`); process.exit(1); }
console.log(`\n通过：减脂训练 App ${ok.length} 项全部 OK`);
