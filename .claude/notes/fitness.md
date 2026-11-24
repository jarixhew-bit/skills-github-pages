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
  - 器材 `band`（辅助引体的弹力带：杆→胸前→膝前→绕过脚底）与 `cable`（坐姿划船机：底座＋脚踏板＋低滑轮＋配重塔，钢索拉到两手间把手；人用 `lift:20` 坐上矮凳）——2D 引擎、`anim3d.js`、渲染台三处各画一次。2D 画布会按 `bounds().y1` 缩小，引体向上这类比人高的动作才放得下横杆。
  - `bridge2` 只给热身「臀桥」（地板）；臀推三处（哑铃／徒手／臀推机）用 `thrust`（上背靠凳，哑铃版 hold=one 横放髋上）。
  - **运动内衣压平（2026-11-04，用户：胸前别有轮廓，要像有支撑的运动内衣）**：渲染台载入模型后 `flattenBra()` 改静止网格——
    内衣正面整片拟合一张左右对称、上下平顺的曲面并把正面顶点拉上去（胸点往里、乳沟补平），底下的身体同步退到内衣面后 7mm（不穿模），
    法线重算＋接缝合并＋平滑；内衣另用全哑光材质 `braM`（roughness 1＋一点自身底色＝正面柔光）。模型档 glb 没动（不用重跑 Blender）。
    `?bra=orig` 关掉它做对照。发光逻辑没改。
  - **侧面版动图（2026-11-04）**：膝盖、背角度要从侧面看的动作多一张 `anim/<file>-side.webp`（纯侧面 `VIEW.profile`＝yaw 90°、俯角 5°，
    字幕与部位小图照旧）。清单正本是 App 的 `SIDE_VIEW`（14 个，含史密斯深蹲），`sideCombos()` 给渲染脚本，跑全部时一起渲染。
    App 里有侧面图的动图右下角有「正面／侧面」切换（卡片、全屏跟练、换上的替代动作都有；换动作清单的小图没有），选择存 `cfg.view`
    全 App 共用、进备份，导入时本机没选过才用备份的。史密斯深蹲侧面版不画近镜头那根轨道（`PROFILE`），免得挡住背的线条。
    新增侧面动作：加进 `SIDE_VIEW` 再渲染 `<file>-side`，自检会抓缺图。
  - **改了 ANIM 里任何动作就要重渲染那几张**，并升 sw.js 的 CACHE——图片走缓存优先，档名没变的话手机会一直看旧图。
- **替代动作（2026-11-04，用户：「健身房没有器材，能不能每次多选 alternative」）**：
  - 动作「身份」＝ `"器材:槽位"`（借现成动作，如 `db:gsquat`＝高脚杯深蹲）或 `"x:名字"`（`ALTX` 的新动作）。
    `ALTS[槽位]` 是替代清单（越前越接近）；`GYM_TAG` 是健身房版的器材标签。用户的选择存 `cfg.alts`（键 `"器材:槽位"`，
    每个槽位、每种器材版各记各的），随 cfg 进备份，导入时补回本机没设过的。
  - 记录：换过的组多存 `k`（身份）；旧记录没有 `k`＝那次的器材＋槽位。`setKey(s,x)` 是唯一的取身份入口——
    `histFor`／`suggest`／`lastText`／`findPRs`／进度页 `exSeries`／记录页／CSV 都按身份算，**不要再用 `x.ex+equip` 比**。
    同一个动作从别的槽位或器材版换来，身份一样、历史接得上（健身房版换成高脚杯，会接哑铃版高脚杯的重量）。
  - 只记次数的替代（`eq:"bw"`）：弹力带拉开、辅助引体向上（辅助机的「重量」是减轻，不能当负重加）。
  - 史密斯深蹲 `smithsquat`（2026-11-04，用户健身房没有腿举机）：`ALTX`（eq gym＝按健身房加重单位、标签「器械」），排在高脚杯深蹲槽位替代清单第一个、
    弓步／分腿蹲／登阶清单里排在腿举机前；**健身房版原动作仍是腿举机**（旧记录没有 k 靠它）。器材 `smith`（两根轨道＋背上的杠）2D／anim3d／渲染台各画一次，
    渲染台握杠用 `OV.smithsquat.after` 把手腕 IK 到杠下、握拳。要领来源见规格 sources／note（2026-11-05 读 PMC 全文＋摘要原文查证，已去掉未查证）。
  - 新动作（5 个，动作要领查证来源写在 `tools/lib/fitness-anim-spec.json` 的 sources）：单腿罗马尼亚硬拉 `sldl`、
    哑铃臀桥 `dbbridge`、辅助引体向上 `pullup`、弹力带拉开 `pullapart`、坐姿哑铃肩推 `ohpseat`。新增替代动作要：
    ALTX＋ANIM `def()`＋规格＋渲染动图（`animCombos()` 已把 ALTX 算进去，自检会抓缺图／缺规格）。
  - UI：卡片上「换动作」→ 清单（小动图、名称、器材标签、次数）→ 点一个就换；「已换」标记＋原动作名；「恢复原动作」。
    全屏跟练每组也有「换动作」（换完 `steps=buildSteps()` 重排，步骤结构不变）。这次训练里该槽位没打勾的组会清掉；
    已打勾的组保留当时的身份（`vals[key].k`）。
- **热身／放松的替代动作（2026-11-10，用户：「拉伸门框的能不能有 alternative，有时遇到没有门框」）**：
  - 通用机制，现在只有放松的门框胸部拉伸用到：`MOVEX`（新动作，`w` 跟 WARM/COOL 同格式＋`tag` 器材标签＋`half` 时间过半换边）、
    `MOVE_ALTS[原动画 key]`（替代清单，越前越接近）、`MOVE_TAG`（原动作器材标签）。选择存 `cfg.malts`（`{chest:"wallpec"}`），
    随 cfg 进备份、导入时补回本机没设过的。**秒数必须跟原动作一样**（计时器总长写死 3:00／4:00），自检会抓。
  - `curMove(w)` 是唯一的取用入口：清单 `moveList`、跟练 `buildSteps`（timed 步骤带 `mslot`，有就显示「换动作」）、Garmin 文字
    （热身／放松后面括号列出动作名）都经过它。没有重量历史，换动作不影响加重建议。
  - 三个替代：靠墙单臂胸部拉伸 `wallpec`（墙／柱子，每侧 15 秒）、背后十指交扣扩胸 `clasp`（不用器材）、俯卧单侧胸部拉伸
    `pronepec`（地板，每侧 15 秒）。来源与原文引句在规格 `note`。2D／anim3d 只画得出侧面，墙用一根柱子 `post` 代表；
    渲染台 `OV.wallpec`（左手肘固定在墙上一点、脊椎往右转 30°，墙 `M.room`）、`OV.clasp`（两手拉到中线扣住、肩胛后缩）、
    `OV.pronepec`（整个人绕长轴翻 75°、右腿屈起踩到左腿后、右手推地）。`turnChecked()` 转完量方向，不对就反转。
- **点示范放大（2026-11-10，用户：「跟练时动作能不能点击放大」「放大时提示词也要在」「放大时也要能记组」）**：
  - 任何示范（卡片／热身放松／跟练的 `.ph` 动图或照片，或 3D／简笔画布）点一下＝`openZoom()`；`.ph` 上有 🔍 钮（`ZMB`）。
    `#zoom` 全屏：上面 4:3 动图（横屏时左边）、下面（横屏右边）`#zmText`：阶段、名称、次数／时间、即时倒数 `#zmTime`、记组、要点。
  - 跟练里开的（`zm.pl`）会跟着步骤走：`showStep()` 结尾 `zoomFollow()` 换图换字；倒数由跟练的 200ms 计时器同步写进 `#zmTime`。
  - **记组不另存状态**：放大里的输入框／按钮都是代理（`data-proxy`＝原控件选择器），输入就写进原输入框并触发它的 input 事件，
    「完成这组」就点原本的 `#plAct`（跟练）或 `[data-done]`（卡片）。别在这里另写一份 `val()`／`markDone()` 逻辑。
  - 关闭：✕、点空白、Esc、手机返回（`history.pushState` + `popstate`）；焦点回到 🔍 钮。`closePlayer()` 会先关放大。
- **一步里有几个动作（2026-11-10，用户抓到燃脂收尾 C 波比＋碰肩、A 深蹲推举＋登山者还是旧模型）**：跟练的 AMRAP 步骤 `anim`／`hold`
  是阵列（两个动作同一步），旧码遇到阵列直接不找动图、退回 3D 画布（`anim3d.js` 的旧胶囊人偶）。现在 `photoOf()` 收到阵列且每个都有
  webp 就回 `{multi:[file…]}`，`photoHTML()` 画成 `.phm`（两张 `.ph.anim` 并排、左下角标签＝`step.labels`，即「不跳版波比 6 次」）；
  放大（`#zmBox.multi`）上下叠两张，下方仍有要点、倒数，另有 `+1 轮／−1`（代理按原本的 `#plRound`／`#plRoundMinus`）。
  **原则：`cfg.media==="anim"` 时只要有 webp 就不准出画布**——自检第 15 段走遍 A/B/C × 三种器材的卡片、跟练每一步（含休息预告）、放大、游泳课。
  `anim3d.js` 只在用户选「3D」或没有 webp 时才出现，它画的仍是程序生成的胶囊／球体人偶（青绿上衣、深色短裤），不是运动风 glb 模型。
- **力量课后有氧 15／20 分钟可选（2026-11-22 取代 2026-10-02 的 12 周有氧计划；2026-11-23 改 20 分钟；2026-11-24 用户拍板加设定，默认 15）**：
  - **时长设定（2026-11-24）**：`cfg.cdMin`（15／20，`CFG_DEF` 默认 15；不是这两个值＝15，所以旧用户没设过显示 15），点过记 `cfg.cdMinSet`。
    入口两处：「更多 → 设置」的「有氧时长（健身房版）」`#cdMinRow`／`#cfgCdMin`，以及「有氧」页顶端 `#cdLenRow`／`#cdLenSeg`（都是 `data-cdmin` 按钮 → `setCdMin()`）。
    结构：`CD_P15`／`CD_P20` 两套方案，`CD_BY={15,20}`；`CD_PLANS` 是**同一个物件**，`cdSync()`（`renderAll()` 开头）把当前时长的三套填进去，所以旧码与自检拿到的引用不用改。
    每个方案多一个 `g:H=>[...]`（Garmin 步骤），`cdGarminText` 只拼名称＋`P.g(H)`。跟时长有关的文案：卡片标题／记录按钮／跟练「N 分钟有氧做完了」／Garmin「有氧 N 分钟」／
    `cdWhy()` 的 `%YIN%`（`CD_YIN`：15＝方案1 落在 Yin 定义、方案2 不在；20＝三个都不在）、`%LEN%`、`%P1ARR%`／`%P2ARR%`／`%P3COOL%`（`CD_ARR`）、本周分钟说明（读 `CD_PLANS.p1.vig`）、
    使用说明 `#helpCdMin`／`#helpGymMin`（37–39／42–44）／`#helpCdYin`（`renderCdLen()`）。备份：cfg 整包导出；导入同 4 组开关的规则（本机没选过 `cdMinSet` 才用备份的）。旧日志照存的 min／vig／mod 算。
    15 分钟版（App 的安排）：p1 热身 3 → 5×(1＋1) → 放松 2（kcal 110、剧烈 5／中等 10）；p2 热身 3 → 快 4 → 慢 3 → 快 4 → 放松 1（128、8／7）；
    p3 热身 2 → 6×2 分钟（同样从 5% 起按心率调）→ 慢走 1（94，加到 6–10% 118；0／15）。每周中等当量 3 次 58；2 次 B+C 43、A+B 35、C+A 38。总时间（健身房 A）：15＝37／4 组 42／手臂 42／都开 47／减量周都开 35；20＝42／47／47／52／40。
    自检：check-fitness 第 22 段；第 20 段的 `setup()` 固定 `cdMin:20` 验 20 分钟版；第 21 段的时间已改成 15 分钟默认。
  以下是 20 分钟版（`CD_P20`）当初的说明：查证正本 `.claude/notes/fitness-cardio-research.md`
  （每句事实对得上那里的引句＋PMID＋run ID，否则标「App 的安排／推论／保守判断／做法」；Eddens 2018 的 PMID 是 28917030，不是 29086308）。
  - 只在**健身房版**（`cfg.equip==="gym"`）：训练卡片的「心肺收尾」换成 `cdCardHTML(wk)`（`#cdBlock`），跟练 `buildSteps()` 在最后一组后接 `cdSteps(id,wk)`
    （每段一个 timed 步骤、到点自动接下一段，`cdv:true`，最后一步 `kind:"cdlog"` 记一笔）再接放松。哑铃／徒手版完全不变（仍是 `FIN` 心肺收尾）。
  - 三个方案 `CD_PLANS`（p1 单车：热身 3 → 7×(用力 1＋轻踩 1) → 放松 3／p2 椭圆机：热身 3 → 快 4 → 慢 3 → 快 4 → 慢 3 → 放松 3／p3 坡度快走：热身 2（0%、5.0）→ 坡度走 8×2 分钟（从 5%、5.0 km/h 起，每 2 分钟看心率：高于上限坡度减 1%、低于下限加 0.5%，上限 12%）→ 慢走 2（0%）；2026-11-24 前是连续 20 分钟 8–12%，见下方「方案3 起点」）：
    `ph`＝[类型 warm/up/down/cool, 名称, 秒, 心率 %, 机器设定, 要点, MET]，每个方案合计 1200 秒（自检守）；
    `kcal`＝Σ(MET×分钟)×72÷60 写死（p1 149、p2 158、p3 125；p3 另有 `kcalHi` 157＝主段加到 6–10% 时），`vig`／`mod`＝p1 7／13、p2 8／12、p3 0／20——自检用每段 MET 重算并对手算值，改段落就要一起改；`rows` 是卡片表格与说明用的摘要。心率＝`hrMax()`（填了实测最大心率优先，否则 208−0.7×年龄；年龄取饮食页 `diet.profile.age`，
    其次旧的 `cfg.age`；都没有→卡片里问 `#cdAgeAsk`，存进 `diet.profile.age`）。方案3 70–80%＝126–144（研究笔记写的 145 是口径不一）。
  - **方案3 起点（2026-11-24 用户拍板）**：用户实测坡度 8–10%、5.0–5.5 km/h、刚练完力量、手表 33°C，15 分钟平均心率 154、最高 172（目标 126–144），但「还能聊天」。
    改成从 5% 起按心率往上加（App 的安排，理由「坡度太陡心率容易一路升高，宁可从低坡度开始往上加」，不写用户数据）；主段 8 段 `chk` 类型（大字／语音「看心率」，`CD_WORD.chk`）。
    MET：热身／慢走 4.8（17358 跑步机 0% 5.6–6.3 km/h，App 走 5.0 → 略高估），主段 5.3（17034 户外 1–5% 爬坡）；kcal 104×1.2＝124.8→125，主段若到 6–10%（17035 7.0）→157。剧烈／中等仍 0／20，每周当量不变。
    心率与说话对不上 → `CD_TALK`（方案3 卡片 `#cdP3Talk`、有氧页「心率区间」`#cdTalk`、`CD_WHY` 末条）：叫用户到「有氧」页 →「心率区间」→「最大心率」（`#cdHrMax`，存 `cfg.hrMax`）填 Garmin 数值；
    依据 Quinn & Coons 2011（82±7%）＋Reed & Pipe 2014，套到用户是 App 的推论。不教用户自己测最大心率。
    方案3 强度界线（中等／剧烈下端／两档之间）改成 `cdP3Int()` 按 `hrMax()` 现算（以前写死 40 岁的 126–137／139–144）；`CD_WHY` 变成 `cdWhy()`。自检 check-fitness 第 20 段 (o) 验 180 与自填 190 两种。
  - 配对 `cdPick(wk,now,noSwap)`：自查有「有」→ 全 p3（`why:"screen"`）；第一笔新有氧记录那天起 14 天内（`cdFirst()`）全 p3（`intro`）；之后 A→p3、B→p1、C→p2，
    满 14–21 天显示「已满 2 周」提示（`fresh`）。非 p3 的日子可「换成方案3」（只记在这次草稿 `current.cdAlt`）。
  - 语音：每段开头 `speak` 以「加速」（up）或「放慢」（down/cool）或「热身」开头并念心率；`say()` 会把字记进 `sayLog`（自检读 `__fit.cardio.said()`）。
    大字画面 `cdVisHTML`（`.ph.cdv`，`data-cd`）可点 🔍 放大，`zmFill` 认得它，`zoomFollow` 跟着换段。
  - 记录 `fit.cardio`：新的 `{kind:"p1|p2|p3",min:20,vig,mod,hr,machine,day}`（2026-11-23 前存的是 min:15＋当时的 vig／mod，`cdMins` 照记录里存的算，旧日志不动）；旧计划的 `easy/i44/i3030` 照样列在有氧页 `#cdHist`（名称加「旧计划」）、照样进备份。
    中等／剧烈分钟 `cdMins()`（App 的推论：p1 用力 7、p2 快段 8 算剧烈；旧 i44 每轮 4 分钟、i3030 每回 0.5 分钟算剧烈）、`cdWeekMins()`；
    「剧烈 1 分钟＝中等 2 分钟」是 App 的推论（WHO 原文只写等量组合）。饮食页每周活动也分开写中等／剧烈。
  - 有氧分页保留在底部（理由：本周分钟、记录、自查、心率、VO2max、Garmin 都还在这里），内容：`#cdTop`（A/B/C 配对＋三方案心率）、`#cdWeek`、`#cdHist`、
    `#cdScreen`（运动前自查 `cfg.screen`，预填用户 2026-11-22 的答案：5 题「没有」、肾脏病没问过留空、`preset:1`；改过就去掉 preset；导入时本机还是 preset 才用备份的）、
    VO2max、心率区间、Garmin（三个方案）、`CD_WHY`、`CD_IQOS`（旧的，未动）、`CD_SAFE`。12 周计划的 `CD_WEEKS`／`CD_PHASE`／`cdStart` 全删，旧的 `cfg.cardioStart` 留在存储里没人读。
  - 洗髓功默认改 45 分钟（选项 30/40/45/60）：旧默认 40 而且没自己选过（没有 `diet.qg.minSet`）的自动改 45；自己点过的记 `minSet`。
  - 自检：check-fitness 第 20 段（每小段各自 `guard`，一段炸了不吞掉后面的）。第 15 段「两动作同框」下限从 6 改 4（健身房版不再有 AMRAP 收尾）。
- **真人写实版动图（2026-11-10，用户选的参考人物 A：高马尾、珊瑚色套装）**：17 张（热身 8、放松 4、高脚杯深蹲、史密斯深蹲、坐姿推胸机、
  哑铃罗马尼亚硬拉、哑铃俯身划船），清单正本 `tools/lib/fitness-anim-real.json`；`render-fitness-anim.mjs` 全量重跑会跳过它们。
  - 做法：渲染台渲染「去字幕、不发光、体型调瘦」的 3D 来源影片（720×960）→ Higgsfield `seedance_2_0_mini`（480p、5 秒、每支 2.5 点，
    参考图＋来源影片当 video_references，prompt 写明动作与「保持参考图的脸／身材／衣服」）→ 合成：旧动图顶部字幕带原样保留，下面换成真人画面
    （按人物范围裁切、背景用画面自身模糊铺满）→ 12 格／秒 animated WebP 480×360，档名不变所以 App 不用改。
  - 坑：来源影片里人物的体型、画风、背景会被一起带过去——直接用运动风 glb 出来是宽臀；用简笔画出来变插画。调瘦要改网格顶点
    （缩骨头会让弯曲时子骨头被拉歪）。`hf_mult_motion_control`（Genjutsu）也能做但 480p 要 15 点、地垫会变成厚台子。
  - 沙盒连不上 Higgsfield 的上传与下载域名：来源影片在 Higgsfield 自己的云端工作区（`sandbox_exec`）里重渲染后上传；成品打成 zip
    传到 Higgsfield，再由 `.github/workflows/fetch-file.yml`（推 `.fetch/request.json` 触发）抓回分支。
  - **侧面版（`-side.webp`）还是 3D 人物**；其余 66 张也还是 3D 人物。
- **体态（2026-11-18，用户：「重量深蹲时也会歪一边 而且好像高低肩」「x型腿呢」）**：查证正本 `.claude/notes/fitness-posture-research.md`，
  **App 文案里的事实都要对得上那份笔记里已读原文的来源**（`SRC` 清单）；App 自己定的门槛／次数写明「App 的安排」。
  - 入口：训练页 `#postCard`（开始按钮下面）＋「更多」的「打开体态」；体态页 `#tab-post` 不占底部分页（`openPost()`／`closePost()`）。
  - 资料：localStorage `fit.posture`＝`{q 问卷, red 红旗, tests[推膝碰墙 cm 与侧桥秒数 L/R], done[做过的小课], qTs, ack, ackFor[确认当下的红旗标题]}`；
    照片在 IndexedDB `fit-posture`/`photos`（`{id,ts,view:front|back,data:jpeg dataURL}`，上传时缩到 900px）。都进备份（`posture`／`postPhotos`），导入只补本机没有的。
  - 红旗 `redList()`：前弯测试一边隆起、痛、麻、越来越明显、X 型腿只有一边或成年后才出现 → 只显示「建议先给医生或物理治疗师看」，小课按钮全部拿掉；
    用户按「医生／物理治疗师看过，说可以运动」（`post.ack`＋`ackFor`）才给小课，提醒仍留着；**红旗清单一变确认就作废**（`acked()`）。
    高低肩（`q.shoulder` L/R）而前弯测试「还没测」或没回答（`needBend()`）也挡小课、提示先做前弯测试。挡不挡统一看 `postBlocked()`。
  - 体态小课 `postSteps()`（8 个动作 `PMOVE`，约 10 分钟，全屏跟练 `plMode="posture"`，最后一步 `pdone` 记一笔）：弱侧 `postSides()`——
    推膝碰墙差**超过** 2 cm（`> 2`，刚好 2.0 不算；Pabau above 2 cm）、侧桥差 ≥10%、深蹲往 X 歪 → 另一侧的分腿蹲先做＋多一组、动作中膝内倒 → 蚌式那侧多一组。
  - 力量日提醒 `postCueHTML(anim)`：深蹲类（`SQUAT_ANIMS`）只在填了「往哪边歪」或「膝内倒」才出现；单侧动作（`UNI_ANIMS`）知道弱侧才出现。卡片与跟练都有。有任何红旗（就算已确认）或 `needBend()` 时一律不出。
  - 满 28 天提醒重测（`postDue()`）。
  - 新动图 7 张：`hip9090`／`hipflex`／`ankle`（蓝光）、`wallslide`／`sideplank`／`clam`／`suitcase-one`（红光）；分腿蹲用原有的 `split`。
    渲染台新机制：`OV.x.rollMode='torso'`（只把身体绕长轴转 90°、四肢照 2D 在同一平面＝侧桥从正面看）、`'rigid'`（整个人含四肢转 90°：趴着摆好的屈髋屈膝转成侧躺＝蚌式）；
    墙 `wallK`（脚尖前 `WALLK`）／`wallH`（前臂前）在第 0 格定位 `PROPX` 之后不动，2D／anim3d／渲染台三处都有。侧躺两张机位要 yaw 负值（脸朝 −z）。
    anim3d.js（3D 模式）不懂侧躺，只有用户选「3D」时会看到未转过来的姿势。
  - 文案规矩（2026-11-18 verifier 退件后）：每句事实要对得上研究笔记里的引句与网址，否则标「App 的安排／做法／推论／保守判断」或删掉；
    说法不能比原文满。第 16 段末有 BANNED（不准再出现的句子）与 need（必须在的界线标签）两张清单——改文案撞到它们先回研究笔记查证。
  - 自检：check-fitness 第 16 段（含 verifier 抓到的四个漏洞：确认作废、高低肩先测前弯、红旗时不出提醒、2.0 cm 边界）。
- **饮食（2026-11-19，用户：男 40 岁 72 kg、每天洗髓功 40 分钟、在做 16/8）**：查证正本 `.claude/notes/fitness-fatloss-research.md`
  最后一节「16/8 限时进食…」（每句事实对得上那里的引句＋PMID＋run ID，否则标「App 的安排／推论」）。
  - 入口：训练页「本周进度」卡片最下面一行 `#dietCard`（今天蛋白 x / 目标）＋「更多」的「打开饮食」；饮食页 `#tab-diet` 不占底部分页（`openDiet()`／`closeDiet()`，同体态页做法）。
    **训练页别再往上方加高卡片**：3D 模式只画看得见的画布，自检那段已先卷到第一张画布，但用户手机上也会被推到折线下。
  - 资料：localStorage `fit.diet`＝`{profile{sex,age,kg}, mode:"range"|"deficit", tre{on,start,end,meals}, qg{on,min}, log{"YYYY-MM-DD":{p,kcal,win}}, setTs}`；
    进备份（`diet`），导入：本机没设过（`setTs` 为 0）才用备份的资料与设定，记录按日期补本机没有的。资料不预填。
  - 算法：蛋白 1.6×kg（`protTarget`，显示四舍五入）；热量男 1500–1800／女 1200–1500 或每天少 500–750（Jensen 2013）；
    分餐 `mealPlan()`：第一餐开窗、最后一餐关窗前 30 分钟、中间平分，每餐＝目标÷餐数、下限 0.25×kg（ISSN）；
    平台期 `plateauInfo()`：周一开始的周平均，最近一周（本周或上周）往前连续 4 周都要有记录，最近一周 ≥ 3 周前（体重，且有腰围时腰围也是）才提示；
    洗髓功 `qigong(kg,min)`：3.3 MET（Compendium 15670），毛＝3.3×kg×h、净＝2.3×kg×h、每周 ×7；开关在「更多 → 设置」（`#cfgQg`，存 `diet.qg`；2026-11-22 起默认 45 分钟）。
  - 「燃脂收尾」已全面改名「心肺收尾」（UI 文字、步骤 phase、Garmin 文字；规格 json 的 note 也改了）。旧记录里没有存这个字，不影响相容。
  - 说明「减脂的关键」删掉无来源的「多走路…更容易累积」，换成 Thorogood 2011／ACSM 2009／Jensen 2013 的查证数字。
  - 自检：check-fitness 第 17 段（手算 fixture、平台期 3 周出／2 周不出、改名、备份来回、BANNED／need 文案守门）。
  - **BMI 门槛（2026-11-19 verifier 退件后）**：资料多身高 `profile.cm`，`bmi(kg,cm)`；`#dBmi` 并列 WHO（≥25／≥30）与 WHO 2004 亚洲（23 行动点）。
    默认模式改成「比平常少吃」（`mode:"deficit"`）；Jensen 固定区间**只在 BMI ≥25** 才显示（`over`），大字旁有「仅适用超重／肥胖成人，体重正常别直接用」；
    BMI <25 或没身高：大字「最多约 500 kcal」（App 的保守判断），就算存的 mode 是 range 也不显示区间。
    分餐提示：2 餐且每餐 >40 g 才叫人改 3 餐；3 餐每餐 >40 g 改建议加蛋白小点心。洗髓功大字＝净 kcal。
    自检第 17 段手算 72/1.75²＝23.5、72/1.65²＝26.4，正常 BMI 绝不出现 1500。
- **脖子前倾＋每日小习惯＋洗髓功后接小课（2026-11-19，用户：脖子前倾、每天早上 40 分钟洗髓功）**：查证在 `.claude/notes/fitness-posture-research.md`
  最后一节「头前伸」（Sheikhhoseini 正确 PMID 30107937，不是 29776552）。
  - 问卷 `q.fhp`（`#pqFhp`）：侧面照、站着拍、**不给正常值**、只跟自己比；左右测试多一栏颅椎角 `tests[].cva`，跟上一次差 <5° 当误差（Gallego MDC）。
    照片多「侧面照」（`view:"side"`），侧面那组画蓝色竖线 `.vl`（`pv.vl`、`#ppVl`）。
  - 脖子红旗 `NECK_RED`（NHS 颈椎病原文）：存 `post.red.nk={key:true}`；`redList()` 第三栏是等级 `urgent`／`er`，`redLevel()`＋`RED_HEAD` 决定标题
    （马上去急诊 > 尽快看医生 > 建议先给医生看）。**不写英国的 111／999**（用户在东南亚）。一样挡小课、改红旗清单会让「医生看过」作废。
    **急诊级（`lv==='er'`）没有「医生看过」按钮**，`acked()` 遇到 er 一律 false、点击处理也挡（2026-11-19 第二次退件，App 的保守判断）。
    饮食页 BMI <18.5（WHO GHO）→ 不给任何热量差额、隐藏「热量怎么定」切换。
  - 小课 10 个动作、约 12 分钟：多了泡沫轴胸椎伸展 `thoracic`（活动度，**不能写成改善前倾**）与收下巴 `chintuck`（120 秒＝10 次×停 10 秒，剂量出处 Physitrack，CUH 留给治疗师填）。
  - 训练页 `#postCard` 在能做小课时就是早上卡片：「洗髓功后：体态小课（含脖子）」、`#pmDone`「今天做了」打勾（写进 `post.done`，`manual:true`；取消＝删掉今天的），本周次数 `#postWeekN`；没做的日子不显示失败。
  - 深连结：`fitness/?go=posture` 或 `#posture` → 能做就 `openPosture()`，有红旗／没自查就 `openPost()`，然后 `history.replaceState` 清掉参数。
    洗髓功 `xisui/index.html` 完成画面 `#nextPosture`（繁体「接著做體態小課」）连过来。
  - 「每日小习惯」卡 `#postHabits`（`HABITS`：ok＝✅ 官方原文、mix＝⚠️ 证据不一、app＝App 的建议）；「每 30 分钟」「手机举高」「包包轮流」没来源，只能标 App 的建议。
    **不准写低头族负重数字（60 磅／27 磅）**。
  - ANIM 引擎多一个关键帧参数 `hx`（头前后平移，2D／anim3d 都跟着 `hd` 走）；渲染台 `OV.chintuck`（颈往后、头往前点，视线保持水平）、`OV.thoracic`（上背伸展＋双手交叉胸前）、
    器材 `roller`（2D／anim3d／渲染台三处，渲染台第 0 格定在 Spine2→Neck 40% 处）、肌肉代码 `neck_flex`。
  - 自检：check-fitness 第 18 段。
- **加量开关（2026-11-23，用户拍板：只要开关、默认关、自己想用再开）**：查证正本 `.claude/notes/fitness-fatloss-research.md` 最后一节「加量开关」。
  - `cfg.sets4`（每个动作做 4 组）：`rounds()`＝减量周 2、否则 `sets4?4:3`。`cfg.arms`（加练手臂）：`armsOn(eq)`（徒手版一律不加）、`armRounds()`＝减量周 1、否则 2。
    两个都随 cfg 进备份；动过开关记 `cfg.addSet`，导入时本机没动过才用备份的。设置在「更多 → 设置」的 `#cfgSets4`／`#cfgArms`，说明 `#sets4Why`／`#armsWhy`／`#addVolNote`。
  - **超级组一律经过 `blocksFor(wk,eq)`**（`[{pair,R,arms}]`）：训练卡片、跟练 `buildSteps(wk)`、Garmin 都用它，别再直接 `PLAN[wk].blocks`＋`rounds()`。
    手臂槽位 `curl`／`tri`（`ARM_SLOTS`）在 `EX` 里只有 db／gym 版：健身房＝绳索弯举（直杆）`cablecurl`＋绳索下压 `pushdown`；哑铃＝哑铃弯举 `curl`（hands）＋坐姿哑铃过头臂屈伸 `ohext`（one，两手捧一只）。
    `ALTS.curl/tri` 互为替代（换成另一种器材版）。卡片勾组的休息提示看按钮的 `data-rn`（这一组的轮数）。
  - 双重进步法：`suggestBase` 的「做满」要求上次至少 3 组（手臂 2 组）且每组到上限——4 组模式下就是 4 组都要满；旧的 3 组记录照旧算。减量周文字写「只做 2 轮」（手臂 1 轮）。
  - 全部约几分钟：`estSec(steps)`＝跟练步骤秒数加总、每组按 `SET_SEC`＝45 秒（App 的估算）；`#goSub` 与跟练 `#plCount` 显示。手算：健身房 42、＋任一开关 47、两个 52；哑铃 28／33／38；减量周健身房＋手臂 2370 秒＝40。
  - 动图 4 张（`curl-hands`／`cablecurl`／`pushdown`／`ohext-one`）：渲染台 `OV.curl/cablecurl/pushdown/ohext`；绳索两张的钢索、直杆、配重塔只在渲染台画（`KEY===...`，同面拉），机位用 side（正面会被配重塔挡住）；过头臂屈伸用 front34（椅背会挡）。
  - 自检：check-fitness 第 21 段（默认关＝原样、4 组、手臂三种器材、时间手算、建议／新纪录／训练量、备份来回、文案守门）。
- **史密斯机算片／每个动作各自的休息／体重卡目标线与每周平均（2026-11-24，用户拍板；点子来自 openGym，只借思路不碰代码）**：查证正本
  `.claude/notes/fitness-fatloss-research.md` 最后一节（引句＋PMID＋run ID）。
  - **休息**：旧的全局 `cfg.rest` 废掉。`restDef(k)`（多关节 90／小动作 60：`REST_SMALL` 槽位 rfly/curl/tri＋`REST_SMALL_K` x:pullapart、gym:rdl 腿弯举机）、
    `restOf(k)`＝`cfg.restBy[k]` ?? `cfg.restBase` ?? 默认；`blockRest(pair,eq)`＝两动作取较长。**卡片标题 `.brest`、勾组倒数（按钮 `data-rs`）、跟练休息步骤与语音、Garmin「休息 m:ss」、
    `estSec` 都经过 `blockRest`**，别再写死秒数。设置「更多 → 设置 → 组间休息」`#restBox`（按当前器材列 A/B/C 的 12 个＋手臂 2 个，换过的动作照换过的列，`select[data-restk]`）、`#restReset` 全部恢复默认。
    迁移：本机存过旧 `rest`（60／75／90，含旧默认 60——分不出是不是自己选的）→ `restBase`＝那个值、所有动作照旧（体验不突变），设置里 `#restLegacy` 提示可按恢复默认改用新默认；全新用户直接用新默认。`restV2` 标记只迁移一次。
    使用说明的时间 `#helpSsMin`／`#helpDbMin`／`#helpGymMin` 由 `ssSec()`／`helpRange()` 现算（训练 A、不开开关，「N–N+2」）。全新用户：健身房 A 40、哑铃 A 31、健身房＋手臂 45 分钟。
    备份导入：本机没动过（`restSet`）才用备份的；旧版备份只有 `rest` → 当 restBase。
  - **算片**：`SMITH_K`＝`x:smithsquat`、`gym:thrust`（后者文案前缀「用史密斯机做时，」）。`plateCalc(total,bar,plates)`（0.05 kg 为单位 DP：片数最少、同数取大片在前；凑不出回 lo/hi），
    `plateText`、`platesHTML`、`refreshPlates()`（卡片跟最近改的那组 `data-plast`，跟练 `#plPlates` 跟 `#plKg`／步进钮）。设置 `#smithBox`：`cfg.smithBar`（空＝按 0 算，0–60）、`cfg.plates`（默认全选 20/15/10/5/2.5/1.25），`smithSet` 管导入。**不准写具体杠重数字**（没来源）。
  - **体重卡**：`#bGoal`→`cfg.goalKg`（20–300，`goalSet` 管导入），`drawChart(...,{goal})` 画 `.goal-line` 虚线＋「目标 N」；`weekAvgInfo(now)`（周一开始，跟 `plateauInfo` 同一套：本周有记录用本周否则上周，跟前一周比，
    两周缺一只给提示），显示用四舍五入后的平均相减；`#bNhs` NHS 每周 0.5–1 kg 原文链接（BMI <18.5 隐藏），不做预测。
  - 自检：check-fitness 第 23 段（手算写在段首注释）。`openWith` 给了 `cfg` 的情境自动当「存过 rest＝60 的老用户」，既有各段的 60 秒手算不用改。
- **页首总时长不写死（2026-11-24，用户抓到页首「每次约 30 分钟」、健身房版实际约 40）**：没有训练记录时页首 `#cycleLine` 由 `headMin()` 写
  「每周 2–3 次 · 每次约 N 分钟」，N＝`estMin(selWk)`（跟开始按钮下 `#goSub` 同一个数，随器材／4 组／手臂／休息／有氧时长／换动作现算；`renderHeader` 与 `renderPicker` 都会调，
  换替代动作也会重画 picker）。有记录时照旧写第几周、不写时长。meta description 与 manifest 不写分钟数（改成「时长按你的设置显示在开始按钮下」）；
  使用说明 `#helpSsMin`／`#helpDbMin`／`#helpGymMin` 的 HTML 初值改成「…」（`renderCdLen()` 现算覆盖），别再填数字。全新用户：哑铃 A 31、健身房 A 40（有氧 20＝45、加手臂＝45）。
  自检：check-fitness 第 24 段（含禁用词：`每次约 30 分钟`／`30 分钟全身`／`28–30`／`37–39`，画面与原始码都查）。
- `sw.js` — 离线缓存。**改 index.html 或 manifest 必须升 `CACHE` 版本号**（check-sw-version 会拦）。
- `manifest.webmanifest`、`icon*.png`、`icon.svg`。

## 锚点
- 加重建议：`suggest(k)`（k＝动作身份 `curKey(槽位,器材)`；双重进步法；减量周的训练不算进历史 `histFor`）。
- 减量周：`cycleInfo()`，以第一笔训练那周为第 1 周，每第 4 周减量（2 轮、9 成重量）。**停练整周不算**（`gapWeeks()`），
  回归训练那周也不排减量（`hold`，减量往后挪一周）。没停练时与旧公式逐日一致（自检 (a) 守着）。
  **存过减量训练（`s.deload`）的那周是锚点**：那周就是减量周、之后从第 1 周重数——停练扣周只往后影响，
  不会把已做过的减量推到下一周（2026-11-05 用户抓到「上周减量、这周又减量」，自检 (f1)(f2)(f3) 守着）。
- **回归模式（2026-11-05，用户选方案 A）**：`gapsOf(now)` 找停练＝两次训练中间（或最后一次到今天）**整整空 ≥7 天**
  （不算练的那两天；每周固定练一次＝空 6 天，不会误触）。`retInfo()`：最近一段停练后的头 2 次（`RET_N`）是回归训练，
  停 7–20 天 9 折、≥21 天 8 折。`suggest()` 外包一层：底数＝min(一般建议 `suggestBase()`, 停练前重量)＝**绝不加重**，再打折按
  加重单位取整；徒手动作只给提示。存档标 `ret`（折扣）/`retN`，`histFor` 像减量周一样跳过 ret（只有回归时才练过的动作才退而用它）。
  横幅 `#retBanner`（为什么＋原因 生病/出差/其他，存 `cfg.gapWhy[停练前最后一次的 session id]`）；记录页 `.gap-row` 分隔行；
  进度页「每周训练量」柱状图停练周淡灰底（进步曲线 x 轴按次数不按日期，没涂）。开关 `cfg.returnMode`（`returnSet`＝用户动过，
  导入备份时本机没动过才用备份的）；原因随 cfg 进备份、导入补回本机没有的。
- localStorage key：`fit.sessions` / `fit.body` / `fit.draft` / `fit.cfg`。
- 自检挂钩：`window.__fit`；3D 画了几格：`window.ANIM3D.frames`。
- 新增动作：在 ANIM 里 `def()` 一个 key 就同时有 2D 与 3D；游泳动作带 `pool:POOL`，
  漂浮高度用帧里的 `lf`、往前滑用 `dx`。器材名（bench/seat/wallR/board…）两边都要各画一次。
- 游泳课：`SWIM_STAGES` / `SWIM`（12 课），进度 localStorage `fit.swim`，也进备份。

## 坑
- 数据只在本机浏览器，没有云端。换手机靠「更多 → 导出/导入备份」。
- 原 artifact 的数据存在 claude.ai 那边，不同网域，**无法自动搬过来**。
- 自检：`tools/check-fitness.mjs`（真浏览器＋SwiftShader 软件 WebGL，固定日期 2026-09-30）。替代动作那一段守（另有热身／放松换动作、点示范放大、动图模式不准退回画布三段，见脚本开头清单 13、14、15）：
  换了会记住（重载／跟练／Garmin／备份导入）、建议与新纪录不混（腿举 80kg 不会喂给高脚杯）、恢复原动作、每个替代都有动图与规格。
- SW 对 anim3d.js 与 three 是「缓存优先」：改 anim3d.js 一定要升 `CACHE`（check-sw-version 已盯着）。
