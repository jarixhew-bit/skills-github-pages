# fitness/ 减脂力量训练 App 结构笔记

2026-09-30 建。前身是用户上传的 claude.ai artifact（「30分钟全身减脂训练」），动画引擎与
训练内容原样沿用，其余重写成专业版。

## 文件
- `index.html` — 单文件 App。三个 `<script>`：① 火柴人动画引擎 `ANIM`（沿用原版，别动角度约定）；
  ② 训练内容 `EX`/`FIN`/`PLAN`/`WARM`/`COOL`（改动作/次数只改这里）；③ App 逻辑。
- `anim3d.js` — 3D 渲染（ES module，载入 `../vendor/three/three.module.min.js`）。它不定义动作，
  只拿 `ANIM.sample(key,time)` 给的关节世界座标套上人体/哑铃/器材/泳池来画；载入失败或没有 WebGL
  时 index.html 自动退回 2D 火柴人。设置里可关 3D（`cfg.anim3d`）。
- `photos/` — 真人示范照片（Free Exercise DB，公共领域，缩到 480px，共 35 组×2 张）。对应表在
  index.html 的 `PH_EN`（按动作英文名）与 `PH_ANIM`（热身/放松/收尾按动画 key），照片与动作不完全
  一样（器材、坐站）时第二项写说明，会印在照片上。选照片前**先看过图**：库里同名动作常是别的变体。
  设置「动作示范」：真人（默认，没照片的用 3D）／3D／简笔（`cfg.media`）。
- `anim/<动作>[-<hold>].webp` — 示范动图（默认示范方式，480×360 animated WebP）。2026-11-03 换成深色风格，
  2026-11-04 人物换成用户选的样品 C「时尚运动风」：glam 女性体型、小麦肤色、珊瑚色运动内衣＋短裤、白球鞋、马尾
  （`tools/lib/models/fitness-female-sport.glb`＋贴图 `tools/lib/models/sport/`，全部 CC0，授权证据逐项写在
  `tools/lib/models/README.md`）；游泳动作自动光脚（渲染台把 Shoes 网格藏起来、鞋底垫高归零）。旧版雕像白还在：
  `STYLE=classic`（渲染台 `?style=classic`）。深色渐层背景＋顶光、正在用力的肌肉**发红光**（发力／向心阶段最亮）、拉伸与活动度动作是被拉开的部位**发蓝光**
  （拉到最开最亮）、游泳不发光；顶部 6 格部位小图（胸／肩／背／手臂／核心／臀腿）＋标题／次数／要领字幕。
  - 管线：`tools/render-fitness-anim.mjs`（逐格 `page.screenshot`，字幕层一起截）＋渲染台
    `tools/lib/fitness-render.html`。跑法 `python3 -m http.server 8899 &` 后
    `CHROMIUM_PATH=/opt/pw-browsers/chromium node tools/render-fitness-anim.mjs [file 或 key ...]`，全量 60 张约 10 分钟；
    `FRAMES_DIR=<目录>` 会留下每格 PNG 与「最用力是第几格」的 json，给联络表抽查用。
  - 规格正本 `tools/lib/fitness-anim-spec.json`（研究员查证，依据在 `.claude/notes/fitness-anim-research.md`）：
    每张图的 type（strength/cardio＝红、stretch/mobility＝蓝、swim＝不发光）、标题、次数、要领、主／次肌肉代码、
    机位 view、strip。**次数写成「A / B」（同一张图被两处不同次数共用）时图上只写标题。**新增动作要同时加规格，
    自检会核对：每个组合都有规格、每条规格都有图、肌肉代码渲染台都认得（渲染台的 `MUSCLES` 清单）。
  - 动作的关节角度仍以 App 的 ANIM 为准（简笔画／3D 模式同一份）。2D 表达不了的——往身体两侧开合（卧推手肘 45°、
    推举的肩胛骨平面、开合跳、下拉、反向飞鸟、面拉、Y-T、门框拉伸、仰漂）、转体（世界最伟大伸展）、脊椎弯曲（猫牛）、
    肩胛前伸／后缩（肩胛俯卧撑）、两手合握一只哑铃、碰对侧肩——写在渲染台的 `OV`（3D 方向／IK 覆盖），不要硬塞进 2D 引擎。
  - 坑：模型手臂与躯干比 ANIM 短。手撑地的动作（俯卧撑、平板、登山者、波比、猫牛、世界最伟大伸展、派克）用 `OV.plant`：
    以脚尖或膝盖为支点把整个人往下转到手够得到地，再把手 IK 到固定点——不这样手会悬空十几公分。
  - 发光强度：`CONC`（哪一段是发力）／`PEAK`（拉最开是哪一帧）；单侧动作只亮那一侧（`SIDES`）。运动风比雕像白吃光，
    着色器里的混色／自发光倍数调高了（`GLOW_MIX`／`GLOW_EM`，classic 保持原值）。
  - 运动风的坑：腿比较长，派克俯卧撑手会撑不到地——`OV.pike.legs` 把脚再往后放（只对运动风）；引体向上的横杆在渲染台
    另画成细金属杆（`KEY === 'pullup'`），不要用反向划船那张「桌子」。
  - `bridge2` 只给热身「臀桥」（地板）；臀推三处（哑铃／徒手／臀推机）用 `thrust`（上背靠凳，哑铃版 hold=one 横放髋上）。
  - **改了 ANIM 里任何动作就要重渲染那几张**，并升 sw.js 的 CACHE——图片走缓存优先，档名没变的话手机会一直看旧图。
- **替代动作（2026-11-04，用户：「健身房没有器材，能不能每次多选 alternative」）**：
  - 动作「身份」＝ `"器材:槽位"`（借现成动作，如 `db:gsquat`＝高脚杯深蹲）或 `"x:名字"`（`ALTX` 的新动作）。
    `ALTS[槽位]` 是替代清单（越前越接近）；`GYM_TAG` 是健身房版的器材标签。用户的选择存 `cfg.alts`（键 `"器材:槽位"`，
    每个槽位、每种器材版各记各的），随 cfg 进备份，导入时补回本机没设过的。
  - 记录：换过的组多存 `k`（身份）；旧记录没有 `k`＝那次的器材＋槽位。`setKey(s,x)` 是唯一的取身份入口——
    `histFor`／`suggest`／`lastText`／`findPRs`／进度页 `exSeries`／记录页／CSV 都按身份算，**不要再用 `x.ex+equip` 比**。
    同一个动作从别的槽位或器材版换来，身份一样、历史接得上（健身房版换成高脚杯，会接哑铃版高脚杯的重量）。
  - 只记次数的替代（`eq:"bw"`）：弹力带拉开、辅助引体向上（辅助机的「重量」是减轻，不能当负重加）。
  - 新动作（5 个，动作要领查证来源写在 `tools/lib/fitness-anim-spec.json` 的 sources）：单腿罗马尼亚硬拉 `sldl`、
    哑铃臀桥 `dbbridge`、辅助引体向上 `pullup`、弹力带拉开 `pullapart`、坐姿哑铃肩推 `ohpseat`。新增替代动作要：
    ALTX＋ANIM `def()`＋规格＋渲染动图（`animCombos()` 已把 ALTX 算进去，自检会抓缺图／缺规格）。
  - UI：卡片上「换动作」→ 清单（小动图、名称、器材标签、次数）→ 点一个就换；「已换」标记＋原动作名；「恢复原动作」。
    全屏跟练每组也有「换动作」（换完 `steps=buildSteps()` 重排，步骤结构不变）。这次训练里该槽位没打勾的组会清掉；
    已打勾的组保留当时的身份（`vals[key].k`）。
- 有氧分页（2026-10-02）：`CD_KINDS`（三种练法与心率%）、`CD_WEEKS`（12 周每周排什么）、`cdSteps()`（跟练步骤，
  与力量训练共用全屏播放器，`plMode` 区分）；记录 `fit.cardio`、`fit.vo2`，都进备份。说明文字 `CD_WHY`/`CD_IQOS`/`CD_SAFE`
  每条都附来源链接——研究多为摘要层级（沙盒打不开全文），改数字前要重新查证，标「未查证」的别擅自写成定论。
- `sw.js` — 离线缓存。**改 index.html 或 manifest 必须升 `CACHE` 版本号**（check-sw-version 会拦）。
- `manifest.webmanifest`、`icon*.png`、`icon.svg`。

## 锚点
- 加重建议：`suggest(k)`（k＝动作身份 `curKey(槽位,器材)`；双重进步法；减量周的训练不算进历史 `histFor`）。
- 减量周：`cycleInfo()`，以第一笔训练那周为第 1 周，每第 4 周减量（2 轮、9 成重量）。
- localStorage key：`fit.sessions` / `fit.body` / `fit.draft` / `fit.cfg`。
- 自检挂钩：`window.__fit`；3D 画了几格：`window.ANIM3D.frames`。
- 新增动作：在 ANIM 里 `def()` 一个 key 就同时有 2D 与 3D；游泳动作带 `pool:POOL`，
  漂浮高度用帧里的 `lf`、往前滑用 `dx`。器材名（bench/seat/wallR/board…）两边都要各画一次。
- 游泳课：`SWIM_STAGES` / `SWIM`（12 课），进度 localStorage `fit.swim`，也进备份。

## 坑
- 数据只在本机浏览器，没有云端。换手机靠「更多 → 导出/导入备份」。
- 原 artifact 的数据存在 claude.ai 那边，不同网域，**无法自动搬过来**。
- 自检：`tools/check-fitness.mjs`（真浏览器＋SwiftShader 软件 WebGL，固定日期 2026-09-30）。替代动作那一段守：
  换了会记住（重载／跟练／Garmin／备份导入）、建议与新纪录不混（腿举 80kg 不会喂给高脚杯）、恢复原动作、每个替代都有动图与规格。
- SW 对 anim3d.js 与 three 是「缓存优先」：改 anim3d.js 一定要升 `CACHE`（check-sw-version 已盯着）。
