# 健身 App 示范动图：动作规格与关键帧审核（研究笔记）

建立：2026-11-03。规格正本：`tools/lib/fitness-anim-spec.json`（59 条，顺序＝渲染组合清单；与 `window.__fit.animCombos()` 逐一比对一致）。本档只记公开资料。

## 方法与限制（必读）

- **只用到 WebSearch**：本 session 的网络白名单不含 exrx.net、acefitness.org、pubmed.ncbi.nlm.nih.gov 等，WebFetch/curl 一律被拒（`ENOTFOUND` / proxy 403）。所以每条 `sources` 网址都是搜索结果里真实出现的网址，但**内容是搜索引擎摘要，不是我逐页读过的原文**。重要结论（肌肉分工、角度建议）以 2 个以上来源一致者为准；只有单一来源或只出现在转引里的数字，都在下文标「转引/未查证」。

- 若要更严谨：在 session 网络设定里放行 acefitness.org、exrx.net、pubmed.ncbi.nlm.nih.gov、nasm.org，再逐页核对。
  （2026-11-05 实测：acefitness.org、exrx.net 放行后仍回 403——站方挡机器人，别绕过、换来源；沙盒连不上的 PMC 全文与论文摘要改走 CI 抓取通道 `fetch-url.yml`：PMC 文章页直接读，摘要用 OpenAlex API（`api.openalex.org/works?filter=doi:…&select=abstract_inverted_index`）——PubMed 网页对 CI 回 cookie 墙，NCBI esearch／Europe PMC 当天回 500／503。）

- 例外：`deadbug` 的第三个 Hinge Health 网址是把搜索结果的 /fr/fr/、/gb/en/ 路径换成英区版本的推论路径，已在该条 note 注明。`incline` 的 doi 网址由搜索结果里的 doi 路径（10.3390/ijerph17197339）组成。

## 角度约定（审核时用的读法）

- ANIM 是侧视 2D，面向右（+x 向前，y 向下为正）。每个角是**该段的绝对方向**：0＝竖直向下、+90＝向前、180＝向上、-90＝向后。躯干 t：0＝直立、正＝前倾；t=90 俯卧头朝前、t=-90 仰卧头朝后。

- 我用 `node` 把 ANIM 那段原样执行（含 IK 解算 `H/Hn/fF`），算出每帧的关节点座标与「膝内角、髋角（躯干-大腿）、肘内角、肩-上臂夹角」，下文每个动作都附上。内角 180＝伸直。长度单位：躯干 34、大腿/小腿 24、上臂 18、前臂 17，约 1 单位≈1.5 cm（推论比例，供估距离用）。

- 2D 引擎把四肢全长投影在侧面平面，表达不了手臂/腿往两侧开合（外展）、转体与脊椎弯曲；这类动作在 JSON 标 `plane: frontal/mixed`，并在 `plane_detail` 写出 3D 该摆的关节角。

## 判定有错的关键帧（汇总）

- **legpress**：有错：f1 把腿推到 ns=nt=112、膝内角 180°（完全锁死），与 App 要领「推起时膝盖不要完全锁死」相反。应改为终点膝内角约 165–170°（例如 nt≈115、ns≈100）。f0 膝内角 90° 正确。
- **bench-hands**：有错：f0（底部）a=30、f=175，上臂朝下 60°（比水平低 60°），手肘会穿过长凳、肩关节过度伸展。应为上臂约水平到低 15°（侧视 a≈75–90）、前臂垂直（f≈180），哑铃落在胸口高度。f1（a=180 直臂、哑铃在肩上方）正确。
- **seatpush**：小错：f0 手在肩下约 9 单位（胸口中段，正确），但 f1 a=88、f=90 手抬到肩膀高度（高了约 8 单位≈12 cm）且肘内角 178° 锁死。应：终点手维持胸口中段高度（约 a≈75、f≈80），肘内角约 170°。
- **hinge-hands**：有错：f1（t=75、nt=12、ns=-8）髋关节仍在脚踝正上方（髋 x=0、脚 x=2），没有「屁股往后推」；手臂垂直下垂使哑铃悬在小腿前方约 28 单位（≈45 cm），是弯腰驼背式而非髋铰链，重心也会往前倒。应：髋往后移到脚踝后方约 8–10 单位（大腿 nt≈20–25、小腿接近垂直 ns≈-2），膝弯约 20–25°，躯干约 t≈60–70，手臂略往后（a≈-20）让哑铃贴着大腿/小腿，最低到膝下至小腿中段。示例 f1≈{t:65,nt:22,ns:-2,a:-20,f:-20}（推论值，渲染时请目视确认哑铃贴腿）。
- **bridge**：有错：f1 t=-120、nt=100 → 肩-髋-膝不在一直线，而是髋「超过」直线约 20°（髋过伸＝腰椎代偿拱起），且 ns=-15 使膝屈约 115°（脚太靠近屁股）。应：f1 约 {t:-110, nt:110, ns:+20}（肩-髋-膝一直线、膝屈约 90°），抬起的那条腿伸直并与支撑腿大腿平行（ft≈fs≈110）。f0 抬起腿是弯的（膝内角 135°），建议起点就伸直。
- **row1-one**：有错：①支撑手（fa=ff=35）伸直悬在半空、离膝盖约 44 单位，既没撑在长凳也没撑在大腿上，等于没有支撑；应撑在长凳（加 bench 道具，同侧膝也跪凳）或撑在前腿大腿上。②下半身同 row：髋在脚踝正上方（nt=18、ns=-12），应髋往后、小腿近垂直（nt≈22、ns≈-2）。拉的那只手 f0→f1（na 0→-75、nf 0→-10，肘拉到腰侧、前臂垂直）正确。
- **invrow**：有错：f1 用 IK bend=1 解出 na=-96（上臂朝头顶方向）、肩-躯干夹角 161°、肘内角 54°，画面像「手臂过头的仰卧臂屈伸」，不是划船。应：顶点上臂沿躯干指向髋部、手肘在身体下方（肩-躯干夹角约 20–40°）、肘约 90°、前臂接近垂直、胸口离横杆约 5 单位以内（改 bend=-1 或把横杆位置移到下胸上方）。f0 身体一直线、手臂垂直正确，但建议手臂略偏向脚（a≈165）让横杆对准下胸。
- **seatrow**：有错：躯干方向反了——f0（手臂前伸）t=-5 后仰、f1（拉到腰侧）t=+8 前倾，与 App 要领「挺胸坐直，身体不要前后晃」相反。应两帧都 t≈0（最多起点 +5 前倾、终点回 0）。f1 手拉到上腹、肘在身后（a=-60、f=88）正确。小建议：腿 ns=nt=88 膝完全伸直，可改膝微弯（内角约 160°）。
- **ohp-hands**：有错（委派方已定案）：现有 f0 a=10/f=172 → f1 a=178/f=180，侧视插值中段上臂水平前伸、前臂竖直，等于「直臂前平举式」弧线，哑铃轨迹向前绕大弧；正确是手肘在肩胛骨平面（身体前方约 30–45°）向上推，哑铃大致垂直上下。
- **pike**：有错：f1 头部落点在两手「后方」约 15 单位（头 x≈28、手 x≈43），上臂朝前（na=100），与 App 要领「头往两手前方下放」相反。应：底部头落在两手连线前方约 5–10 单位（与两手成三角形），肩在手腕正上方或略前，前臂接近垂直、肘约 90° 且手肘指向脚的方向。起点可更陡（躯干 t≈145–155、髋角约 60–80°），来源指出越陡越偏三角肌前束。
- **seatohp**：有错：同 ohp——f0 a=10/f=172 → f1 a=178/f=180，侧视中段变成前平举弧线；另 f1 肘内角 178° 锁死，App 要领为「推到手臂接近伸直」，终点应留约 170°。
- **bridge2-hands**：有错：①f1 t=-120、nt=100 → 髋过伸约 20°（同 bridge）。②App 写「上背靠在沙发边」，但动画是肩膀贴地的地板臀桥、没有凳子/沙发道具。臀推正确顶点：上背靠凳缘、躯干约水平（t≈-90）、大腿水平（nt≈90）、小腿垂直（ns≈0）→ 肩-髋-膝一直线、膝约 90°；底部髋屈约 80–100°、臀部接近地面。手扶压在髋部的哑铃（现有 f1 手在髋部正确）。
- **bridge2**：有错：f1 t=-120、nt=100 → 髋过伸约 20°（肩-髋-膝应一直线：地板版约 {t:-110,nt:110,ns:+20}）。另：这张图被三处共用——徒手臀推（背靠沙发）、健身房臀推机、热身「臀桥」（仰躺地上）。前两者要上背靠凳，后者肩膀贴地，一张图无法同时正确，需委派方决定（见笔记）。
- **row-hands**：小错：①髋在脚踝正上方（nt=18、ns=-12，髋 x=0、脚 x=2），躯干与哑铃都在前方、重心会往前倒；应髋往后、小腿近垂直（nt≈22、ns≈-2）。②躯干 t=60（离水平 30°）比 App 写的「屈髋俯身约 45°」更低约 15°，不算错但与文字不一致，可改 t≈45–50。f1 肘拉到腰侧（a=-75、f=-10）正确。
- **pulldown**：有错（平面）：f0 a=175 → f1 a=15，侧视插值中段上臂水平前伸、手肘甩到身体正前方，像直臂前下压；宽握下拉是手肘从两侧往下往后收（额状面内收）。f1 终点（横杆在锁骨、躯干后仰 8°）本身合理。
- **incline-hands**：有错：①躯干 t=-45 是 45° 上斜，App 写「椅背调约 30°」，应 t≈-60。②f0（a=60、f=165）哑铃停在离躯干线约 19 单位处，比落到上胸两侧（约 12 单位）高约 7 单位≈10 cm，下放不够深；应约 a≈40、f≈170（手肘到躯干线或略低）。f1（a=135 垂直于躯干）可接受，建议介于 135–160 让哑铃在肩上方。
- **rfly-hands**：有错（平面）：f1 a=-70、f=-75 把直臂往后甩向臀部（肩伸展），练的是背阔肌/肱三头肌长头，不是三角肌后束；反向飞鸟是往两侧打开。另髋在脚踝正上方（同 row），应髋往后（nt≈22、ns≈-2）；躯干 t=60 可再低到 t≈70–80（来源：越直立越偏中束）。
- **yraise**：部分有错：动画只有手臂往头前方抬（a 95→118，抬离地约 28°≈25 cm 偏高），缺 App 名称里的「T 字」；Y 字的「斜外开 30°」侧视看不出。应依 plane_detail 做 Y、T 两段，抬臂幅度降到约 10–15°。胸抬 5°（t 90→85）合理。
- **facepull**：有错（平面）：f1 a=-95、f=175 把上臂画成「往正后方水平伸出」18 单位（≈28 cm），肩关节不可能在肩高做这么大的后伸；正确是手肘往两侧抬高、前臂竖起。f0 手在胸口高度，滑轮应在脸的高度，手应略高（a≈95–100）。
- **thruster-hands**：小错：f0 底部（蹲到大腿平行、哑铃在肩）正确；但从 f0 直接插值到 f1，中段上臂水平前伸、手在肩前约 18 单位，推举轨迹往前绕大弧（同 ohp 的问题）。建议加中间帧：站到膝约 150° 时手仍在肩、上臂 a≈20；终点手在肩正上方；推举平面同 ohp。
- **thruster**：小错：f0 底部（蹲到大腿平行、哑铃在肩）正确；但从 f0 直接插值到 f1，中段上臂水平前伸、手在肩前约 18 单位，推举轨迹往前绕大弧（同 ohp 的问题）。建议加中间帧：站到膝约 150° 时手仍在肩、上臂 a≈20；终点手在肩正上方；推举平面同 ohp。
- **swing-one**：小错：f0（后摆最低点）a=-25，手在膝盖前方约 6 单位，哑铃没有从两腿之间往后「穿过去」；正确后摆是前臂贴大腿内侧、哑铃在两腿之间、手在膝盖后方靠近胯下（约 a≈-50）。f1 站直、髋完全伸展、手臂摆到胸高（a=90）正确，属俄式摆荡。
- **jack**：有错（平面）：f1 a=175 让手臂从「前方」举起（前平举路线），腿 nt=+10/ft=-10 是前后剪刀步；开合跳的手脚都应在身体两侧开合（额状面）。
- **burpee**：小错：f1（蹲下手撑地）→ f2（平板）两只脚同时从蹲姿移到身后，看起来是「双脚跳回」；App 是不跳版，应加中间帧让脚一只一只往后踩（先近侧腿伸到 -65，再远侧腿），回来时也一只一只。站立回到 f4 没有跳，正确。f2 平板身体一直线正确。
- **tap**：有错：f1 na=30、nf=-150 → 肘内角 0°（前臂完全折回上臂、手落在同侧肩关节上），人体肘关节最多屈约 145°，做不到；且应碰「对侧」肩（横越身体中线，侧视看不出）。应按 plane_detail 摆。
- **march**：小错：抬腿侧大腿 nt=60（髋屈 60°），膝盖只到大腿中段高度；App 写「膝盖抬到约腰的高度」，应 nt≈80–90（大腿接近水平）。手脚对侧摆动（抬右腿时左手在前）正确。
- **catcow**：有错（表达不到）：两帧只把一根直线躯干从 t=68 转到 76，脊椎没有「拱起/塌下」的弯曲，手的位置还从 y=22 沉到 27（手离开地面原位）。应：手、膝固定在地（手在肩下、膝在髋下），猫式＝胸腰椎屈曲往上拱、低头；牛式＝腰椎伸展往下塌、胸口前送、抬头；骨盆跟着前后倾。3D 模型需要可弯的脊椎骨。
- **lungeT**：小错：f1 远侧手臂掉到 fa=40、ff=60（弯着往下），只有一只手前伸；App 写「双手向前伸直」，两只手都应 a≈90、f≈90。弓步下肢同 lunge（前膝约 90°、后膝近地），正确。
- **scap**：有错：f1 用 IK 把肘弯到内角 125°（屈 55°），看起来是小幅度俯卧撑；App 要领「手肘全程不弯」。应：肘内角始终 180°，只让胸口在两手之间下沉约 2–3 cm（肩胛内收）再推高（肩胛前伸）。2D 火柴人无法表现肩胛滑动，3D 需用肩胛/锁骨骨骼。
- **wgs**：有错：①f0/f1 支撑手 a=5 垂在肩下，手在 y=9、地面约 y=29，手离地约 20 单位≈30 cm，没有「撑地」。②后膝内角 115°、后膝离地仅 6 单位，比较像跪姿弓步；来源要领是后腿尽量伸直以拉伸髋屈肌。③上举手 na=175 只是往头顶方向举，缺「胸椎旋转、胸口转开」。应：躯干更低（t≈70–80）让支撑手着地，后腿近伸直，按 plane_detail 做旋转。
- **fig4**：有错：①交叉腿脚踝（近侧脚 (28,-26)）离支撑腿膝盖（(12,-21)）约 16 单位≈25 cm，没有「放在膝盖上」。②支撑腿（远侧）脚还踩在地上（屈膝 120°），App 写「双手抱住下面那条大腿往胸口拉」，应离地拉向胸口。③双手在腹部上方 (-10,-24) 悬空，没抱到大腿。
- **chest**：有错（平面）：na=-80、nf=-170 把上臂画成「往正后方水平伸出」18 单位，肩关节做不到这么大的后伸；正确是上臂往两侧外展、手肘与肩同高、身体前倾让胸口穿过门框。前倾 6°（t 0→6）方向对，可稍大并加一脚前跨。
- **backfloat**：有错：手臂 a=-100 画成「伸直过头放在头顶后方」，App 写「手臂往两侧张开」，应为两侧外展（额状面）。身体与腿水平、髋 180° 正确。

## frontal / mixed 平面清单

- **bench-hands**（mixed）：俯视上臂与躯干夹角约 45°（来源给 45–60° 区间）；底部上臂比躯干线低 0–15°、前臂垂直地面、哑铃在胸口下缘两侧；顶部双臂垂直、哑铃在肩关节正上方。
- **hpush**（mixed）：手在肩正下方略宽；下放时俯视上臂与躯干约 45°、前臂接近垂直地面；头-髋-脚跟全程一直线；窄距版手肘更贴身体（约 20–30°）。
- **seatpush**（mixed）：把手在胸口中段高度；上臂与躯干约 45°；推出时手保持同一高度水平前推，终点肘留 5–10° 不锁死。
- **ohp-hands**（mixed）：起点：上臂约在水平线下 10°（手肘略低于肩）、前臂垂直、哑铃在耳朵高度两侧；终点：上臂上举约 170–180°、肘伸直、哑铃在肩上方略向内；全程手肘在身体额状面前方约 30–45°（肩胛骨平面），不是完全向两侧打开，也不是向正前方平举。
- **seatohp**（mixed）：把手起点在肩膀高度；起点上臂约在水平线下 10°、前臂垂直；终点上臂上举约 170°、肘留 5–10° 不锁死；手肘在身体前方约 30–45°（多数推肩机把手在身体前方略外）。
- **pulldown**（frontal）：握距约肩宽 1.5 倍、正手；上臂从上举外展约 170°（手臂近伸直、略外开）拉到外展约 20–30°（手肘在体侧略后、低于肩）；前臂全程接近垂直；横杆到锁骨；躯干后仰不超过约 10–15°。
- **fpress-hands**（mixed）：上臂与躯干约 45°；底部上臂外侧（肘）碰地即推、前臂垂直；顶部双臂垂直、哑铃在肩上方。
- **incline-hands**（mixed）：椅背约 30°（躯干离水平 30°，ANIM 的 t≈-60）；上臂与躯干约 45°；底部哑铃落到上胸两侧、手肘略低于躯干线；顶部哑铃在肩上方。
- **rfly-hands**（mixed）：躯干接近水平（离水平 0–30°），背平；手臂从垂直下垂往身体两侧打开到约与地面平行（肩水平外展约 90°），肘全程微弯约 160–170°；手臂在肩的正侧方横向打开，不往后摆向臀部。
- **yraise**（mixed）：Y：俯卧，手臂与身体中线约 30°（肩外展约 120–150°）、拇指朝上，抬离地面约 5–10 cm 停 1 秒；T：手臂向两侧约 90°、拇指朝上抬离地面停 1 秒；胸口只微离地。
- **facepull**（mixed）：起点手臂向前伸、指向与脸同高的滑轮（a≈95–100）；终点上臂外展约 90°（手肘与肩同高、在身体两侧略后约 10–20°），肘约 90°、前臂竖直向上（肩外旋），手在耳朵两侧。
- **thruster-hands**（mixed）：下蹲段同深蹲（大腿约平行、躯干前倾约 30–35°），哑铃扛在肩上、手肘在前下方；起身过半时开始推，推举段同 ohp：手肘在身体前方约 30–45°，哑铃沿接近垂直的路线推到头顶（上臂上举约 170–180°），不往前绕弧。
- **thruster**（mixed）：下蹲段同深蹲（大腿约平行、躯干前倾约 30–35°），哑铃扛在肩上、手肘在前下方；起身过半时开始推，推举段同 ohp：手肘在身体前方约 30–45°，哑铃沿接近垂直的路线推到头顶（上臂上举约 170–180°），不往前绕弧。
- **jack**（frontal）：手臂从体侧（外展 0–10°）经身体两侧举到头顶（外展约 170–180°），肘伸直；双脚从并拢跳开到约 1.5 倍肩宽（每腿外展约 15–20°）；落地膝微弯、前脚掌先着地。
- **tap**（mixed）：高平板、手在肩正下方、双脚比髋略宽；碰肩手的上臂向身体中线内收约 30–45°、肘弯约 100–120°，指尖碰对侧肩；骨盆与肩保持水平不转。
- **wgs**（mixed）：大弓步，前脚异侧（或依 App 文字）一手撑在前脚内侧地面，后腿尽量伸直、后膝离地；转体时上方手臂从地面经侧面转向天花板，胸椎旋转约 45–60°，两手臂成一直线，眼睛看上方的手。
- **fig4**（mixed）：仰卧；支撑腿（下面那条）离地、屈髋约 90–110°、屈膝约 90°；交叉腿外旋、外踝放在支撑腿膝盖上方的大腿处，交叉腿膝盖朝外（与身体中线约 45–60°）；双手从两腿间与外侧抱住支撑腿大腿后侧往胸口拉；头肩贴地。
- **chest**（mixed）：上臂外展约 90°（手肘与肩同高或略低）、肘约 90°、前臂竖直贴门框；一脚前跨、身体往前倾，使上臂落在身体额状面后方约 15–30°。
- **backfloat**（frontal）：仰躺水面、耳朵在水里、脸露出；手臂往两侧张开（肩外展约 60–90°）贴着水面；髋伸直与身体一直线（肚子往上挺）；腿并拢或略开。

## 需要委派方决定的事

- `bridge2`（无哑铃）被三处共用：徒手臀推「背靠沙发」、健身房臀推机、热身「臀桥」（仰躺地上）。前两者上背要靠凳，后者肩膀贴地，一张图无法同时正确。建议：拆两个 key，或让 bridge2 画臀推（两处）并让热身改用另一张地板臀桥图。
- `squat` 同时是徒手深蹲（15–20 次）与热身（30 秒、不求深）；`bob` 同时是吐泡泡（10 次）与水里睁眼（5 秒）——reps 栏我把两种写法都放进去，委派方可改。
- `starfloat`：App 文字是「双手往前伸直」（俯漂），key 名是 star float（海星漂、手脚张开）。规格照 App 文字画俯漂。
- `wgs` 哪只手撑地：App 写「同侧手撑地，另一只手往天花板」；我印象中常见版本是前脚**异侧**的手撑地、前脚**同侧**的手往上转，但这个细节在本次搜索摘要里**没有查证到**，规格不替 App 改字。
- `yraise` 的 App 名称是「俯身 Y-T 字」，现有动画只有 Y；要不要做 Y、T 两段。
- `armcircle` 单张循环图只能示范一个方向（现为前→上→后）；App 要求前后各 15 秒。
- 规格多加了两个字段：`plane_detail`（frontal/mixed 的关节角）与 `note`（共用、来源注意事项），渲染器不用可忽略。

## 逐个动作

### squatG-one（高脚杯深蹲）

- 肌肉：主 quads, glutes；次 adductors, hamstrings, lower_back, abs。机位 front34，平面 sagittal。
- 依据：ACE 动作库有高脚杯深蹲条目（搜索未带出内容）；Sussex 大学讲义：主力臀大肌、股四头肌，次要竖脊肌、腹直肌/腹横肌。ACE 徒手深蹲条目：膝对第二趾、脚跟着地。
- 审核：ok（f1：躯干前倾 35°、大腿近水平（nt=85）、膝内角 65°、手在胸前肩高处；高脚杯可再直立一点，t≈25–30 亦可，非错误）
- 我看过的关键帧角度（`squatG`）：
  - f0：`t=0 nt=0 ns=0 ft=0 fs=0 na=15 nf=165 fa=15 ff=165`；膝内角 N180 F180、髋角 N180 F180、肘内角 N30 F30、肩-上臂夹角 N15 F15；座标 hand N(9,-33) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
  - f1：`t=35 nt=85 ns=-30 ft=85 fs=-30 na=35 nf=170 fa=35 ff=170`；膝内角 N65 F65、髋角 N60 F60、肘内角 N45 F45、肩-上臂夹角 N70 F70；座标 hand N(33,-30) sh(20,-28) nfoot(12,23) ffoot(12,23) nk(24,2)
- 来源：https://acefitness.org/resources/everyone/exercise-library/362/goblet-squat；https://www.sussex.ac.uk/sport/documents/goblet-squat.pdf；https://www.nasm.org/resource-center/exercise-library/goblet-squat

### squat（徒手深蹲）

- 肌肉：主 quads, glutes；次 adductors, hamstrings, lower_back。机位 front34，平面 sagittal。
- 依据：ACE 徒手深蹲：膝对第二趾、脚跟着地、髋与躯干同时起。**矛盾**：一份转述 ACE 的摘要说「膝盖不要超过脚尖」，Squat University 认为膝盖过脚尖可以接受（称「不过脚尖」源自 NSCA 教学指引）。两说并列，本规格不画「膝不过脚尖」。深度「大腿平行」未查到 ACE/NSCA 原文。
- 审核：ok（f1：t=35、nt=85、ns=-30，大腿约平行地面、躯干与小腿大致平行、脚跟在地；双手前平举作平衡合理）
- 备注：同一张图被徒手版（15–20 次）与热身（30 秒、不求深）共用。
- 我看过的关键帧角度（`squat`）：
  - f0：`t=0 nt=0 ns=0 ft=0 fs=0 na=10 nf=10 fa=10 ff=10`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N10 F10；座标 hand N(6,0) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
  - f1：`t=35 nt=85 ns=-30 ft=85 fs=-30 na=90 nf=90 fa=90 ff=90`；膝内角 N65 F65、髋角 N60 F60、肘内角 N180 F180、肩-上臂夹角 N125 F125；座标 hand N(55,-28) sh(20,-28) nfoot(12,23) ffoot(12,23) nk(24,2)
- 来源：https://www.acefitness.org/resources/everyone/exercise-library/135/bodyweight-squat/；https://squatuniversity.com/2016/01/29/can-the-knees-go-over-the-toes-debunking-squat-myths

### legpress（腿举机）

- 肌肉：主 quads, glutes；次 adductors, hamstrings。机位 side，平面 sagittal。
- 依据：多为健身网站：股四头肌为主、臀大肌次之；约 90° 屈膝为常见建议。**矛盾**：脚放高是否偏臀/腘绳——一说偏臀腿后侧，一说放太高会过度屈膝；Worrell 2001（转引）称臀在髋伸末端最活跃，未读原文。
- 审核：有错：f1 把腿推到 ns=nt=112、膝内角 180°（完全锁死），与 App 要领「推起时膝盖不要完全锁死」相反。应改为终点膝内角约 165–170°（例如 nt≈115、ns≈100）。f0 膝内角 90° 正确。
- 我看过的关键帧角度（`legpress`）：
  - f0：`t=-55 nt=150 ns=60 ft=150 fs=60 na=30 nf=60 fa=30 ff=60`；膝内角 N90 F90、髋角 N85 F85、肘内角 N150 F150、肩-上臂夹角 N25 F25；座标 hand N(-4,5) sh(-28,-20) nfoot(33,-9) ffoot(33,-9) nk(12,-21)
  - f1：`t=-55 nt=112 ns=112 ft=112 fs=112 na=30 nf=60 fa=30 ff=60`；膝内角 N180 F180、髋角 N123 F123、肘内角 N150 F150、肩-上臂夹角 N25 F25；座标 hand N(-4,5) sh(-28,-20) nfoot(45,-18) ffoot(45,-18) nk(22,-9)
- 来源：https://www.fitnessavenue.ca/blogs/post/leg-press-muscles-worked；https://powerliftingtechnique.com/leg-press-foot-placement/；https://www.setforset.com/blogs/news/leg-press-foot-placement

### bench-hands（哑铃卧推）

- 肌肉：主 pec；次 ant_delt, triceps。机位 front34，平面 mixed。
- 依据：健身网站一致：胸大肌主力、三角肌前束与肱三头肌协同。手肘角度：Motra 写底部 45–60°，另一来源写 45–70°；一则博客转述「孟菲斯大学研究 90° 比 45–75° 肩压力高 40%」——未查证，不采用数字。NASM 博客只说肘位依负重而定。
- 审核：有错：f0（底部）a=30、f=175，上臂朝下 60°（比水平低 60°），手肘会穿过长凳、肩关节过度伸展。应为上臂约水平到低 15°（侧视 a≈75–90）、前臂垂直（f≈180），哑铃落在胸口高度。f1（a=180 直臂、哑铃在肩上方）正确。
- 我看过的关键帧角度（`bench`）：
  - f0：`t=-90 nt=100 ns=5 ft=100 fs=5 na=30 nf=175 fa=30 ff=175`；膝内角 N85 F85、髋角 N170 F170、肘内角 N35 F35、肩-上臂夹角 N60 F60；座标 hand N(-24,-1) sh(-34,0) nfoot(26,20) ffoot(26,20) nk(24,-4)
  - f1：`t=-90 nt=100 ns=5 ft=100 fs=5 na=180 nf=180 fa=180 ff=180`；膝内角 N85 F85、髋角 N170 F170、肘内角 N180 F180、肩-上臂夹角 N90 F90；座标 hand N(-34,-35) sh(-34,0) nfoot(26,20) ffoot(26,20) nk(24,-4)
- 来源：https://www.muscleandstrength.com/exercises/dumbbell-bench-press.html；https://motra.com/exercises/dumbbellBenchPress；https://blog.nasm.org/uncategorized/elbow-position-bench-press；https://www.strengthlog.com/dumbbell-chest-press

### hpush（俯卧撑）

- 肌肉：主 pec, triceps；次 ant_delt, serratus, abs。机位 front34，平面 mixed。
- 依据：ACE 俯卧撑条目（搜索带出网址）；PubMed 26488636（俯卧撑变式选择性激活）：窄距时胸大肌与肱三头肌更高；综述称 push-up plus 时前锯肌最高。
- 审核：ok（f0：t=65、腿 -65 成一直线，手在肩正下方；f1：身体降到离水平 12°、肘内角 63°、上臂指向脚的方向，胸离地约一拳）。2D 侧视看不出手肘外展角，3D 模型请按 plane_detail 摆。
- 备注：同一张图也被「窄距俯卧撑」共用（App 写手肘贴近身体）。
- 我看过的关键帧角度（`hpush`）：
  - f0：`t=65 nt=-65 ns=-65 ft=-65 fs=-65 na=0 nf=0 fa=0 ff=0`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N65 F65；座标 hand N(31,21) sh(31,-14) nfoot(-44,20) ffoot(-44,20) nk(-22,10)
  - f1：`t=78 nt=-78 ns=-78 ft=-78 fs=-78 na=-75 nf=42 fa=-75 ff=42`；膝内角 N180 F180、髋角 N180 F180、肘内角 N63 F63、肩-上臂夹角 N3 F3；座标 hand N(27,10) sh(33,-7) nfoot(-47,10) ffoot(-47,10) nk(-23,5)
- 来源：https://www.acefitness.org/resources/everyone/exercise-library/25/push-up/；https://pubmed.ncbi.nlm.nih.gov/26488636/

### seatpush（坐姿推胸机）

- 肌肉：主 pec；次 ant_delt, triceps。机位 front34，平面 mixed。
- 依据：ACE 与 NASM：把手对齐胸口中段（约乳头高度）；NASM：顶端锁肘会卸掉目标肌张力；ACE：推太远肩胛离开靠垫会不稳。
- 审核：小错：f0 手在肩下约 9 单位（胸口中段，正确），但 f1 a=88、f=90 手抬到肩膀高度（高了约 8 单位≈12 cm）且肘内角 178° 锁死。应：终点手维持胸口中段高度（约 a≈75、f≈80），肘内角约 170°。
- 我看过的关键帧角度（`seatpush`）：
  - f0：`t=-5 nt=90 ns=0 ft=90 fs=0 na=-60 nf=90 fa=-60 ff=90`；膝内角 N90 F90、髋角 N95 F95、肘内角 N30 F30、肩-上臂夹角 N65 F65；座标 hand N(-2,-25) sh(-3,-34) nfoot(24,24) ffoot(24,24) nk(24,0)
  - f1：`t=-5 nt=90 ns=0 ft=90 fs=0 na=88 nf=90 fa=88 ff=90`；膝内角 N90 F90、髋角 N95 F95、肘内角 N178 F178、肩-上臂夹角 N83 F83；座标 hand N(32,-33) sh(-3,-34) nfoot(24,24) ffoot(24,24) nk(24,0)
- 来源：https://www.acefitness.org/resources/everyone/exercise-library/188/seated-chest-press/；https://www.nasm.org/resource-center/exercise-library/chest-press-machine

### hinge-hands（哑铃罗马尼亚硬拉）

- 肌肉：主 hamstrings, glutes；次 lower_back, adductors, forearm。机位 side，平面 sagittal。
- 依据：NASM：腘绳肌、臀、内收肌群（groin），髋铰链；Bodybuilding.com：腘绳、臀、上下背、核心；Exercise.com：主腘绳、次臀/下背。**分歧**：Lyfta 把竖脊肌列为主力，其他来源列次要；本规格采多数（lower_back 列 secondary）。
- 审核：有错：f1（t=75、nt=12、ns=-8）髋关节仍在脚踝正上方（髋 x=0、脚 x=2），没有「屁股往后推」；手臂垂直下垂使哑铃悬在小腿前方约 28 单位（≈45 cm），是弯腰驼背式而非髋铰链，重心也会往前倒。应：髋往后移到脚踝后方约 8–10 单位（大腿 nt≈20–25、小腿接近垂直 ns≈-2），膝弯约 20–25°，躯干约 t≈60–70，手臂略往后（a≈-20）让哑铃贴着大腿/小腿，最低到膝下至小腿中段。示例 f1≈{t:65,nt:22,ns:-2,a:-20,f:-20}（推论值，渲染时请目视确认哑铃贴腿）。
- 我看过的关键帧角度（`hinge`）：
  - f0：`t=0 nt=3 ns=-3 ft=3 fs=-3 na=0 nf=0 fa=0 ff=0`；膝内角 N174 F174、髋角 N177 F177、肘内角 N180 F180、肩-上臂夹角 N0 F0；座标 hand N(0,1) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(1,24)
  - f1：`t=75 nt=12 ns=-8 ft=12 fs=-8 na=0 nf=0 fa=0 ff=0`；膝内角 N160 F160、髋角 N93 F93、肘内角 N180 F180、肩-上臂夹角 N75 F75；座标 hand N(33,26) sh(33,-9) nfoot(2,47) ffoot(2,47) nk(5,23)
- 来源：https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift；https://www.bodybuilding.com/exercises/romanian-deadlift-with-dumbbells；https://www.strengthlog.com/dumbbell-romanian-deadlift/

### bridge（单腿臀桥）

- 肌肉：主 glutes；次 hamstrings, glute_med。机位 side，平面 sagittal。
- 依据：PMC5534144：单腿桥膝屈 135° vs 90°，屈 135° 时股二头肌大降（23% vs 75% MVIC），臀大肌略降；Brookbush 转述：单腿桥臀/腘绳比值高于仰卧抗阻伸髋。传统姿势为膝屈 90°。
- 审核：有错：f1 t=-120、nt=100 → 肩-髋-膝不在一直线，而是髋「超过」直线约 20°（髋过伸＝腰椎代偿拱起），且 ns=-15 使膝屈约 115°（脚太靠近屁股）。应：f1 约 {t:-110, nt:110, ns:+20}（肩-髋-膝一直线、膝屈约 90°），抬起的那条腿伸直并与支撑腿大腿平行（ft≈fs≈110）。f0 抬起腿是弯的（膝内角 135°），建议起点就伸直。
- 我看过的关键帧角度（`bridge`）：
  - f0：`t=-90 nt=145 ns=35 ft=145 fs=100 na=90 nf=90 fa=90 ff=90`；膝内角 N70 F135、髋角 N125 F125、肘内角 N180 F180、肩-上臂夹角 N0 F0；座标 hand N(1,0) sh(-34,0) nfoot(28,0) ffoot(37,-24) nk(14,-20)
  - f1：`t=-120 nt=100 ns=-15 ft=100 fs=100 na=90 nf=90 fa=90 ff=90`；膝内角 N65 F180、髋角 N160 F160、肘内角 N180 F180、肩-上臂夹角 N30 F30；座标 hand N(6,17) sh(-29,17) nfoot(17,19) ffoot(47,-8) nk(24,-4)
- 来源：https://pmc.ncbi.nlm.nih.gov/articles/PMC5534144/；https://brookbushinstitute.com/articles/electromyographic-analysis-of-gluteus-maximus-and-hamstring-activity-during-the-supine-resisted-hip-extension-exercise-versus-supine-unilateral-bridge-to-neutral；https://www.sussex.ac.uk/sport/documents/single-leg-hip-bridge.pdf

### legcurl（俯卧腿弯举）

- 肌肉：主 hamstrings；次 calves。机位 side，平面 sagittal。
- 依据：NASM：主腘绳肌群，次腓肠肌；FitnessVolt/Arvo：髋要贴垫，抬髋是最常见错误。
- 审核：ok（f0 腿伸直；f1 ns=-170、膝屈约 80°，髋角 180° 全程贴垫）
- 我看过的关键帧角度（`legcurl`）：
  - f0：`t=90 nt=-90 ns=-90 ft=-90 fs=-90 na=40 nf=40 fa=40 ff=40`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N130 F130；座标 hand N(56,27) sh(34,0) nfoot(-48,0) ffoot(-48,0) nk(-24,0)
  - f1：`t=90 nt=-90 ns=-170 ft=-90 fs=-170 na=40 nf=40 fa=40 ff=40`；膝内角 N100 F100、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N130 F130；座标 hand N(56,27) sh(34,0) nfoot(-28,-24) ffoot(-28,-24) nk(-24,0)
- 来源：https://www.nasm.org/resource-center/exercise-library/lying-leg-curl；https://fitnessvolt.com/24561/lying-leg-curl/

### row1-one（单臂哑铃划船）

- 肌肉：主 lats, mid_back；次 rear_delt, biceps, forearm。机位 back34，平面 sagittal。
- 依据：多来源：背阔肌、菱形肌、斜方肌、三角肌后束；肱二头肌为次要。排名有分歧（有的只把背阔肌列主力）。凳子支撑可免除下背稳定需求。
- 审核：有错：①支撑手（fa=ff=35）伸直悬在半空、离膝盖约 44 单位，既没撑在长凳也没撑在大腿上，等于没有支撑；应撑在长凳（加 bench 道具，同侧膝也跪凳）或撑在前腿大腿上。②下半身同 row：髋在脚踝正上方（nt=18、ns=-12），应髋往后、小腿近垂直（nt≈22、ns≈-2）。拉的那只手 f0→f1（na 0→-75、nf 0→-10，肘拉到腰侧、前臂垂直）正确。
- 我看过的关键帧角度（`row1`）：
  - f0：`t=65 nt=18 ns=-12 ft=18 fs=-12 na=0 nf=0 fa=35 ff=35`；膝内角 N150 F150、髋角 N97 F97、肘内角 N180 F180、肩-上臂夹角 N65 F100；座标 hand N(31,21) sh(31,-14) nfoot(2,46) ffoot(2,46) nk(7,23)
  - f1：`t=65 nt=18 ns=-12 ft=18 fs=-12 na=-75 nf=-10 fa=35 ff=35`；膝内角 N150 F150、髋角 N97 F97、肘内角 N115 F180、肩-上臂夹角 N10 F100；座标 hand N(10,7) sh(31,-14) nfoot(2,46) ffoot(2,46) nk(7,23)
- 来源：https://www.exercise.com/exercises/one-arm-dumbbell-row/；https://puregym.com/exercises/back/rows/single-arm-dumbbell-row；https://gravitus.com/guides/exercises/one-arm-dumbbell-row

### invrow（桌下反向划船）

- 肌肉：主 lats, mid_back；次 rear_delt, biceps, glutes, abs。机位 side，平面 sagittal。
- 依据：健身网站：背阔、菱形、中下斜方为主；身体绷直靠臀与竖脊肌等长收缩。一则 2009 研究（转引，作者未确认）称反向划船背阔激活最高——未查证。
- 审核：有错：f1 用 IK bend=1 解出 na=-96（上臂朝头顶方向）、肩-躯干夹角 161°、肘内角 54°，画面像「手臂过头的仰卧臂屈伸」，不是划船。应：顶点上臂沿躯干指向髋部、手肘在身体下方（肩-躯干夹角约 20–40°）、肘约 90°、前臂接近垂直、胸口离横杆约 5 单位以内（改 bend=-1 或把横杆位置移到下胸上方）。f0 身体一直线、手臂垂直正确，但建议手臂略偏向脚（a≈165）让横杆对准下胸。
- 备注：同一张图被 A 日「单臂划船」与 B 日「俯身划船」的徒手版共用（都是 8–12）。
- 我看过的关键帧角度（`invrow`）：
  - f0：`t=-80 nt=80 ns=80 ft=80 fs=80 na=180 nf=180 fa=180 ff=180`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N100 F100；座标 hand N(-33,-41) sh(-33,-6) nfoot(47,8) ffoot(47,8) nk(24,4)
  - f1：`t=-65 nt=65 ns=65 ft=65 fs=65 na=-96 nf=138 fa=-96 ff=138`；膝内角 N180 F180、髋角 N180 F180、肘内角 N54 F54、肩-上臂夹角 N161 F161；座标 hand N(-37,-29) sh(-31,-14) nfoot(44,20) ffoot(44,20) nk(22,10)
- 来源：https://fitnessvolt.com/inverted-row/；https://liftvault.com/exercises/inverted-row-benefits-muscles-worked/

### seatrow（坐姿划船）

- 肌肉：主 lats, mid_back；次 rear_delt, biceps。机位 back34，平面 sagittal。
- 依据：NASM（坐姿器械窄握划船）：背阔主力，菱形肌协助，中斜方与三角肌后束次要。几个列出 EMG 百分比的页面数字互相矛盾且无出处，不采用。
- 审核：有错：躯干方向反了——f0（手臂前伸）t=-5 后仰、f1（拉到腰侧）t=+8 前倾，与 App 要领「挺胸坐直，身体不要前后晃」相反。应两帧都 t≈0（最多起点 +5 前倾、终点回 0）。f1 手拉到上腹、肘在身后（a=-60、f=88）正确。小建议：腿 ns=nt=88 膝完全伸直，可改膝微弯（内角约 160°）。
- 我看过的关键帧角度（`seatrow`）：
  - f0：`t=-5 nt=88 ns=88 ft=88 fs=88 na=88 nf=88 fa=88 ff=88`；膝内角 N180 F180、髋角 N97 F97、肘内角 N180 F180、肩-上臂夹角 N83 F83；座标 hand N(32,-33) sh(-3,-34) nfoot(48,2) ffoot(48,2) nk(24,1)
  - f1：`t=8 nt=88 ns=88 ft=88 fs=88 na=-60 nf=88 fa=-60 ff=88`；膝内角 N180 F180、髋角 N84 F84、肘内角 N32 F32、肩-上臂夹角 N52 F52；座标 hand N(6,-24) sh(5,-34) nfoot(48,2) ffoot(48,2) nk(24,1)
- 来源：https://www.nasm.org/resource-center/exercise-library/seated-machine-row-close-grip；https://www.healthline.com/health/seated-row

### lunge-hands（哑铃反向弓步）

- 肌肉：主 quads, glutes；次 hamstrings, adductors, glute_med, calves。机位 side，平面 sagittal。
- 依据：Sussex 讲义与 Doctor Yessis：股四头肌伸膝、臀大肌；长步幅偏臀、短步幅偏股四头肌；Konstanz 会议论文：反向弓步的臀与股四头肌主动肌活动较高。**分歧**：一来源称前弓步股四头肌更高。
- 审核：ok（f1：前大腿 nt=78 近水平、前小腿 ns=-3 近垂直（前膝约 90°），后大腿近垂直、后膝离地约 6 单位≈9 cm，躯干 t=3 直立）
- 我看过的关键帧角度（`lunge`）：
  - f0：`t=3 nt=0 ns=0 ft=0 fs=0 na=0 nf=0 fa=0 ff=0`；膝内角 N180 F180、髋角 N177 F177、肘内角 N180 F180、肩-上臂夹角 N3 F3；座标 hand N(2,1) sh(2,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
  - f1：`t=3 nt=78 ns=-3 ft=-15 fs=-80 na=0 nf=0 fa=0 ff=0`；膝内角 N99 F115、髋角 N99 F168、肘内角 N180 F180、肩-上臂夹角 N3 F3；座标 hand N(2,1) sh(2,-34) nfoot(22,29) ffoot(-30,27) nk(23,5)
- 来源：https://www.sussex.ac.uk/sport/documents/8-reverse-lunge.pdf；https://doctoryessis.com/2013/01/01/reverse-lunge/；https://ojs.ub.uni-konstanz.de/cpa/article/view/6941

### lunge（反向弓步）

- 肌肉：主 quads, glutes；次 hamstrings, adductors, glute_med, calves。机位 side，平面 sagittal。
- 依据：Sussex 讲义与 Doctor Yessis：股四头肌伸膝、臀大肌；长步幅偏臀、短步幅偏股四头肌；Konstanz 会议论文：反向弓步的臀与股四头肌主动肌活动较高。**分歧**：一来源称前弓步股四头肌更高。
- 审核：ok（f1：前大腿 nt=78 近水平、前小腿 ns=-3 近垂直（前膝约 90°），后大腿近垂直、后膝离地约 6 单位≈9 cm，躯干 t=3 直立）
- 关键帧角度：同上方 `lunge`。
- 来源：https://www.sussex.ac.uk/sport/documents/8-reverse-lunge.pdf；https://doctoryessis.com/2013/01/01/reverse-lunge/；https://ojs.ub.uni-konstanz.de/cpa/article/view/6941

### ohp-hands（哑铃站姿肩推）

- 肌肉：主 ant_delt, lat_delt；次 triceps, upper_trap。机位 front34，平面 mixed。
- 依据：委派方已定案（Saeterbakken & Fimland 2013, PubMed 23096062：站姿哑铃三角肌活动最高）。搜索核对到该文 15 名男性、80% 1RM；三角肌后束坐姿比站姿低约 24%。
- 审核：有错（委派方已定案）：现有 f0 a=10/f=172 → f1 a=178/f=180，侧视插值中段上臂水平前伸、前臂竖直，等于「直臂前平举式」弧线，哑铃轨迹向前绕大弧；正确是手肘在肩胛骨平面（身体前方约 30–45°）向上推，哑铃大致垂直上下。
- 我看过的关键帧角度（`ohp`）：
  - f0：`t=0 nt=0 ns=0 ft=0 fs=0 na=10 nf=172 fa=10 ff=172`；膝内角 N180 F180、髋角 N180 F180、肘内角 N18 F18、肩-上臂夹角 N10 F10；座标 hand N(5,-33) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
  - f1：`t=0 nt=0 ns=0 ft=0 fs=0 na=178 nf=180 fa=178 ff=180`；膝内角 N180 F180、髋角 N180 F180、肘内角 N178 F178、肩-上臂夹角 N178 F178；座标 hand N(1,-69) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
- 来源：https://pubmed.ncbi.nlm.nih.gov/23096062/；https://www.bisp-surf.de/Record/PU201311007613

### pike（派克俯卧撑）

- 肌肉：主 ant_delt, triceps；次 upper_trap, lat_delt, serratus。机位 side，平面 sagittal。
- 依据：NASM 有派克俯卧撑条目；多来源：三角肌前束主力、肱三头肌次要、上斜方稳定；越陡越偏前束。「头落在两手前方」无来源明确背书（来源多写「头落到两手之间」，另一来源警告手放太前会偏离三角肌）——**此处与 App 文字有张力**，规格依 App 写「两手前方」并在 form_audit 标出现有画面头落在手后方。
- 审核：有错：f1 头部落点在两手「后方」约 15 单位（头 x≈28、手 x≈43），上臂朝前（na=100），与 App 要领「头往两手前方下放」相反。应：底部头落在两手连线前方约 5–10 单位（与两手成三角形），肩在手腕正上方或略前，前臂接近垂直、肘约 90° 且手肘指向脚的方向。起点可更陡（躯干 t≈145–155、髋角约 60–80°），来源指出越陡越偏三角肌前束。
- 我看过的关键帧角度（`pike`）：
  - f0：`t=130 nt=-22 ns=-22 ft=-22 fs=-22 na=50 nf=50 fa=50 ff=50`；膝内角 N180 F180、髋角 N72 F72、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(53,44) sh(26,22) nfoot(-18,45) ffoot(-18,45) nk(-9,22)
  - f1：`t=140 nt=-35 ns=-35 ft=-35 fs=-35 na=100 nf=13 fa=100 ff=13`；膝内角 N180 F180、髋角 N75 F75、肘内角 N93 F93、肩-上臂夹角 N120 F120；座标 hand N(43,39) sh(22,26) nfoot(-28,39) ffoot(-28,39) nk(-14,20)
- 来源：https://www.nasm.org/resource-center/exercise-library/pike-push-up；https://fitnessvolt.com/pike-push-up/；https://en-gb.hingehealth.com/resources/articles/pike-push-up

### seatohp（坐姿推肩机）

- 肌肉：主 ant_delt, lat_delt；次 triceps, upper_trap。机位 front34，平面 mixed。
- 依据：UWO 校园健身器材指南：三角肌、斜方肌、肱三头肌；其余为健身网站。器械坐姿减少核心稳定需求。
- 审核：有错：同 ohp——f0 a=10/f=172 → f1 a=178/f=180，侧视中段变成前平举弧线；另 f1 肘内角 178° 锁死，App 要领为「推到手臂接近伸直」，终点应留约 170°。
- 我看过的关键帧角度（`seatohp`）：
  - f0：`t=0 nt=90 ns=0 ft=90 fs=0 na=10 nf=172 fa=10 ff=172`；膝内角 N90 F90、髋角 N90 F90、肘内角 N18 F18、肩-上臂夹角 N10 F10；座标 hand N(5,-33) sh(0,-34) nfoot(24,24) ffoot(24,24) nk(24,0)
  - f1：`t=0 nt=90 ns=0 ft=90 fs=0 na=178 nf=180 fa=178 ff=180`；膝内角 N90 F90、髋角 N90 F90、肘内角 N178 F178、肩-上臂夹角 N178 F178；座标 hand N(1,-69) sh(0,-34) nfoot(24,24) ffoot(24,24) nk(24,0)
- 来源：https://uwo.ca/campusrec/orientation/equipment_guides/shoulders.html；https://www.sussex.ac.uk/sport/documents/signature-shoulder-press.pdf；https://pubmed.ncbi.nlm.nih.gov/23096062/

### bridge2-hands（哑铃臀推）

- 肌肉：主 glutes；次 hamstrings, quads, adductors。机位 side，平面 sagittal。
- 依据：Contreras 等 2015（PubMed 26214739，13 名受训女性、估计 10RM）：臀推的上/下臀大肌与股二头肌 EMG 显著高于背蹲，股外侧肌无差异；2023 Plotkin 训练研究：9 周臀肌增长两者相近——EMG 高不等于长得多。
- 审核：有错：①f1 t=-120、nt=100 → 髋过伸约 20°（同 bridge）。②App 写「上背靠在沙发边」，但动画是肩膀贴地的地板臀桥、没有凳子/沙发道具。臀推正确顶点：上背靠凳缘、躯干约水平（t≈-90）、大腿水平（nt≈90）、小腿垂直（ns≈0）→ 肩-髋-膝一直线、膝约 90°；底部髋屈约 80–100°、臀部接近地面。手扶压在髋部的哑铃（现有 f1 手在髋部正确）。
- 我看过的关键帧角度（`bridge2`）：
  - f0：`t=-90 nt=145 ns=35 ft=145 fs=35 na=90 nf=90 fa=90 ff=90`；膝内角 N70 F70、髋角 N125 F125、肘内角 N180 F180、肩-上臂夹角 N0 F0；座标 hand N(1,0) sh(-34,0) nfoot(28,0) ffoot(28,0) nk(14,-20)
  - f1：`t=-120 nt=100 ns=-15 ft=100 fs=-15 na=120 nf=120 fa=120 ff=120`；膝内角 N65 F65、髋角 N160 F160、肘内角 N180 F180、肩-上臂夹角 N0 F0；座标 hand N(1,0) sh(-29,17) nfoot(17,19) ffoot(17,19) nk(24,-4)
- 来源：https://pubmed.ncbi.nlm.nih.gov/26214739/；https://bretcontreras.com/wp-content/uploads/A-Comparison-of-Gluteus-Maximus-Biceps-Femoris-and-Vastus-Lateralis-Electromyography-Amplitude-for-the-Barbell-Band-and-American-Hip-Thrust-Variations-copy.pdf

### bridge2（臀推／臀桥）

- 肌肉：主 glutes；次 hamstrings, quads。机位 side，平面 sagittal。
- 依据：Contreras 等 2015（PubMed 26214739，13 名受训女性、估计 10RM）：臀推的上/下臀大肌与股二头肌 EMG 显著高于背蹲，股外侧肌无差异；2023 Plotkin 训练研究：9 周臀肌增长两者相近——EMG 高不等于长得多。
- 审核：有错：f1 t=-120、nt=100 → 髋过伸约 20°（肩-髋-膝应一直线：地板版约 {t:-110,nt:110,ns:+20}）。另：这张图被三处共用——徒手臀推（背靠沙发）、健身房臀推机、热身「臀桥」（仰躺地上）。前两者要上背靠凳，后者肩膀贴地，一张图无法同时正确，需委派方决定（见笔记）。
- 备注：三处共用：bw 臀推 15–20、gym 臀推机 10–12、热身臀桥 30 秒。
- 关键帧角度：同上方 `bridge2`。
- 来源：https://pubmed.ncbi.nlm.nih.gov/26214739/；https://pmc.ncbi.nlm.nih.gov/articles/PMC5534144/

### row-hands（哑铃俯身划船）

- 肌肉：主 lats, mid_back；次 rear_delt, biceps, lower_back。机位 side，平面 sagittal。
- 依据：Prehab Guys 等：俯身约 45°、背平；ACE 认证教练（Yahoo 转述）：背阔、菱形为主；Physitrack：加斜方肌，二头、前臂、核心次要。**分歧**：Physitrack FAQ 写背与地面平行，其他写约 45°。
- 审核：小错：①髋在脚踝正上方（nt=18、ns=-12，髋 x=0、脚 x=2），躯干与哑铃都在前方、重心会往前倒；应髋往后、小腿近垂直（nt≈22、ns≈-2）。②躯干 t=60（离水平 30°）比 App 写的「屈髋俯身约 45°」更低约 15°，不算错但与文字不一致，可改 t≈45–50。f1 肘拉到腰侧（a=-75、f=-10）正确。
- 我看过的关键帧角度（`row`）：
  - f0：`t=60 nt=18 ns=-12 ft=18 fs=-12 na=0 nf=0 fa=0 ff=0`；膝内角 N150 F150、髋角 N102 F102、肘内角 N180 F180、肩-上臂夹角 N60 F60；座标 hand N(29,18) sh(29,-17) nfoot(2,46) ffoot(2,46) nk(7,23)
  - f1：`t=60 nt=18 ns=-12 ft=18 fs=-12 na=-75 nf=-10 fa=-75 ff=-10`；膝内角 N150 F150、髋角 N102 F102、肘内角 N115 F115、肩-上臂夹角 N15 F15；座标 hand N(9,4) sh(29,-17) nfoot(2,46) ffoot(2,46) nk(7,23)
- 来源：https://library.theprehabguys.com/vimeo-video/bent-over-row-dumbbell/；https://livestrong.com/article/516149-muscles-involved-in-bent-over-dumbbell-rows；https://www.physitrack.com/da/exercise-library/how-to-perform-the-bent-over-dumbbell-row-exercise

### pulldown（高位下拉）

- 肌肉：主 lats；次 biceps, mid_back, rear_delt。机位 back34，平面 frontal。
- 依据：Lusk 2010（PubMed 20543740）：正手握背阔肌高于反手握，握距影响不明显；Signorile 2002（转引）宽握胸前下拉背阔最高；Calcagno 2025（转引）：握法可能不显著改变背阔募集。三说并列。
- 审核：有错（平面）：f0 a=175 → f1 a=15，侧视插值中段上臂水平前伸、手肘甩到身体正前方，像直臂前下压；宽握下拉是手肘从两侧往下往后收（额状面内收）。f1 终点（横杆在锁骨、躯干后仰 8°）本身合理。
- 我看过的关键帧角度（`pulldown`）：
  - f0：`t=0 nt=90 ns=0 ft=90 fs=0 na=175 nf=178 fa=175 ff=178`；膝内角 N90 F90、髋角 N90 F90、肘内角 N177 F177、肩-上臂夹角 N175 F175；座标 hand N(2,-69) sh(0,-34) nfoot(24,24) ffoot(24,24) nk(24,0)
  - f1：`t=-8 nt=90 ns=0 ft=90 fs=0 na=15 nf=170 fa=15 ff=170`；膝内角 N90 F90、髋角 N98 F98、肘内角 N25 F25、肩-上臂夹角 N7 F7；座标 hand N(3,-33) sh(-5,-34) nfoot(24,24) ffoot(24,24) nk(24,0)
- 来源：https://pubmed.ncbi.nlm.nih.gov/20543740/；https://fitnessvolt.com/muscle-activity-pulldowns-pull-ups/

### split-hands（保加利亚分腿蹲）

- 肌肉：主 quads, glutes；次 glute_med, adductors, hamstrings。机位 side，平面 sagittal。
- 依据：多为健身网站：股四头与臀大肌为主，臀中肌稳定骨盆。**矛盾**：躯干前倾角——一说约 60°（与小腿平行），一说髋部前倾 30–45°，另一说直立带微前倾；前脚越远越偏臀。
- 审核：ok（f1：前大腿 nt=80、前小腿 ns=-5 近垂直、前膝约 95°；后膝离地约 4 单位；后脚在前脚后方 42 单位、高 20 单位≈32 cm；躯干前倾 10°，来源允许微前倾）
- 我看过的关键帧角度（`split`）：
  - f0：`t=5 nt=25 ns=-10 ft=-31 fs=-78 na=0 nf=0 fa=0 ff=0`；膝内角 N145 F133、髋角 N150 F154、肘内角 N180 F180、肩-上臂夹角 N5 F5；座标 hand N(3,1) sh(3,-34) nfoot(6,45) ffoot(-36,25) nk(10,22)
  - f1：`t=10 nt=80 ns=-5 ft=-6 fs=-131 na=0 nf=0 fa=0 ff=0`；膝内角 N95 F55、髋角 N90 F176、肘内角 N180 F180、肩-上臂夹角 N10 F10；座标 hand N(6,2) sh(6,-33) nfoot(22,28) ffoot(-20,8) nk(24,4)
- 来源：https://www.sussex.ac.uk/sport/documents/5-bulgarian-split-squat-dumbbell.pdf；https://gravitus.com/guides/exercises/bulgarian-split-squat；https://central.gymshark.com/article/how-to-bulgarian-split-squat

### split（保加利亚分腿蹲）

- 肌肉：主 quads, glutes；次 glute_med, adductors, hamstrings。机位 side，平面 sagittal。
- 依据：多为健身网站：股四头与臀大肌为主，臀中肌稳定骨盆。**矛盾**：躯干前倾角——一说约 60°（与小腿平行），一说髋部前倾 30–45°，另一说直立带微前倾；前脚越远越偏臀。
- 审核：ok（f1：前大腿 nt=80、前小腿 ns=-5 近垂直、前膝约 95°；后膝离地约 4 单位；后脚在前脚后方 42 单位、高 20 单位≈32 cm；躯干前倾 10°，来源允许微前倾）
- 关键帧角度：同上方 `split`。
- 来源：https://www.sussex.ac.uk/sport/documents/5-bulgarian-split-squat-dumbbell.pdf；https://gravitus.com/guides/exercises/bulgarian-split-squat；https://central.gymshark.com/article/how-to-bulgarian-split-squat

### fpress-hands（哑铃地板推举）

- 肌肉：主 pec, triceps；次 ant_delt。机位 front34，平面 mixed。
- 依据：**矛盾**：一派说胸大肌（胸骨部）是主力，另一派说因活动范围受限，肱三头肌才是主力。本规格两者都列 primary。
- 审核：ok（f0：a=85 上臂近水平贴地、f=175 前臂垂直；f1：直臂向上；屈膝脚踩地）
- 我看过的关键帧角度（`fpress`）：
  - f0：`t=-90 nt=150 ns=30 ft=150 fs=30 na=85 nf=175 fa=85 ff=175`；膝内角 N60 F60、髋角 N120 F120、肘内角 N90 F90、肩-上臂夹角 N5 F5；座标 hand N(-15,-15) sh(-34,0) nfoot(24,0) ffoot(24,0) nk(12,-21)
  - f1：`t=-90 nt=150 ns=30 ft=150 fs=30 na=180 nf=180 fa=180 ff=180`；膝内角 N60 F60、髋角 N120 F120、肘内角 N180 F180、肩-上臂夹角 N90 F90；座标 hand N(-34,-35) sh(-34,0) nfoot(24,0) ffoot(24,0) nk(12,-21)
- 来源：https://fitnessvolt.com/dumbbell-floor-press-guide/；https://exercisepick.com/what-muscles-do-dumbbell-floor-press-work/

### incline-hands（上斜哑铃卧推）

- 肌肉：主 pec, ant_delt；次 triceps。机位 front34，平面 mixed。
- 依据：Luczak 2013（PMC4590897，女性哑铃平/45°上斜/肩推）：上斜离心期锁骨部胸大肌较高；Trebs（转引）：倾角越大锁骨部与三角肌前束越高；2022 高密度 EMG（PubMed 34644424）：平板→45° 时激活重心移向锁骨部；Glass & Armstrong（转引）：+30° 与 −15° 上胸相近。未找到 30° 哑铃的直接数据。
- 审核：有错：①躯干 t=-45 是 45° 上斜，App 写「椅背调约 30°」，应 t≈-60。②f0（a=60、f=165）哑铃停在离躯干线约 19 单位处，比落到上胸两侧（约 12 单位）高约 7 单位≈10 cm，下放不够深；应约 a≈40、f≈170（手肘到躯干线或略低）。f1（a=135 垂直于躯干）可接受，建议介于 135–160 让哑铃在肩上方。
- 我看过的关键帧角度（`incline`）：
  - f0：`t=-45 nt=90 ns=0 ft=90 fs=0 na=60 nf=165 fa=60 ff=165`；膝内角 N90 F90、髋角 N135 F135、肘内角 N75 F75、肩-上臂夹角 N15 F15；座标 hand N(-4,-31) sh(-24,-24) nfoot(24,24) ffoot(24,24) nk(24,0)
  - f1：`t=-45 nt=90 ns=0 ft=90 fs=0 na=135 nf=135 fa=135 ff=135`；膝内角 N90 F90、髋角 N135 F135、肘内角 N180 F180、肩-上臂夹角 N90 F90；座标 hand N(1,-49) sh(-24,-24) nfoot(24,24) ffoot(24,24) nk(24,0)
- 来源：https://pmc.ncbi.nlm.nih.gov/articles/PMC4590897/；https://pubmed.ncbi.nlm.nih.gov/34644424/；https://doi.org/10.3390/ijerph17197339

### step-hands（哑铃登阶）

- 肌肉：主 quads, glutes；次 hamstrings, glute_med, calves。机位 side，平面 sagittal。
- 依据：Mahidol 研究（标准化 45° 屈膝台阶）记录臀大肌、股四头、腘绳、腓肠肌；Hertfordshire 论文：登阶的臀大肌/股二头肌比值在康复动作中最高。「不要用下面的脚蹬地」无研究直接检验。
- 审核：ok（f0：上脚踩箱、膝约 95°、躯干前倾 12°、下脚在地；f1：上腿伸直站上、后腿收起不着箱）。「不要用下面的脚蹬地」是发力时机，静态关键帧无法检查。
- 我看过的关键帧角度（`step`）：
  - f0：`t=12 nt=80 ns=-5 ft=10 fs=8 na=0 nf=0 fa=0 ff=0`；膝内角 N95 F178、髋角 N88 F158、肘内角 N180 F180、肩-上臂夹角 N12 F12；座标 hand N(7,2) sh(7,-33) nfoot(22,28) ffoot(7,47) nk(24,4)
  - f1：`t=3 nt=0 ns=0 ft=25 fs=-35 na=0 nf=0 fa=0 ff=0`；膝内角 N180 F120、髋角 N177 F152、肘内角 N180 F180、肩-上臂夹角 N3 F3；座标 hand N(2,1) sh(2,-34) nfoot(0,48) ffoot(-4,41) nk(0,24)
- 来源：https://repository.li.mahidol.ac.th/items/321458e2-d1a6-4dee-a6bb-b6b17ea5071a/full；https://uhra.herts.ac.uk/id/eprint/15782/1/08172034%20-%20Williams%20Megan%20-%20final%20MPhil%20submission.pdf

### step（登阶）

- 肌肉：主 quads, glutes；次 hamstrings, glute_med, calves。机位 side，平面 sagittal。
- 依据：Mahidol 研究（标准化 45° 屈膝台阶）记录臀大肌、股四头、腘绳、腓肠肌；Hertfordshire 论文：登阶的臀大肌/股二头肌比值在康复动作中最高。「不要用下面的脚蹬地」无研究直接检验。
- 审核：ok（f0：上脚踩箱、膝约 95°、躯干前倾 12°、下脚在地；f1：上腿伸直站上、后腿收起不着箱）。「不要用下面的脚蹬地」是发力时机，静态关键帧无法检查。
- 关键帧角度：同上方 `step`。
- 来源：https://repository.li.mahidol.ac.th/items/321458e2-d1a6-4dee-a6bb-b6b17ea5071a/full；https://uhra.herts.ac.uk/id/eprint/15782/1/08172034%20-%20Williams%20Megan%20-%20final%20MPhil%20submission.pdf

### rfly-hands（俯身反向飞鸟）

- 肌肉：主 rear_delt；次 mid_back。机位 back34，平面 mixed。
- 依据：健身资料库：三角肌后束主力，菱形肌与中斜方次要；越直立越偏中束（weighttraining.guide）；建议轻重量。未找到 NASM/ACE 原条目。
- 审核：有错（平面）：f1 a=-70、f=-75 把直臂往后甩向臀部（肩伸展），练的是背阔肌/肱三头肌长头，不是三角肌后束；反向飞鸟是往两侧打开。另髋在脚踝正上方（同 row），应髋往后（nt≈22、ns≈-2）；躯干 t=60 可再低到 t≈70–80（来源：越直立越偏中束）。
- 我看过的关键帧角度（`rfly`）：
  - f0：`t=60 nt=18 ns=-12 ft=18 fs=-12 na=0 nf=0 fa=0 ff=0`；膝内角 N150 F150、髋角 N102 F102、肘内角 N180 F180、肩-上臂夹角 N60 F60；座标 hand N(29,18) sh(29,-17) nfoot(2,46) ffoot(2,46) nk(7,23)
  - f1：`t=60 nt=18 ns=-12 ft=18 fs=-12 na=-70 nf=-75 fa=-70 ff=-75`；膝内角 N150 F150、髋角 N102 F102、肘内角 N175 F175、肩-上臂夹角 N10 F10；座标 hand N(-4,-6) sh(29,-17) nfoot(2,46) ffoot(2,46) nk(7,23)
- 来源：https://weighttraining.guide/exercises/head-supported-bent-over-dumbbell-lateral-raise；https://fitnessvolt.com/dumbbell-reverse-fly/；https://www.rehabhero.ca/exercise/bent-over-reverse-fly

### yraise（俯身Y-T字）

- 肌肉：主 mid_back, rear_delt；次 lower_back。机位 back34，平面 mixed。
- 依据：Ekstrom 2003（PubMed 12774999，30 人表面 EMG）：俯卧「沿下斜方肌方向的过头举」中斜方最高；韩国论文转引：俯卧 120° 外展举臂是最有效的下斜方动作。未找到 Y vs T 的直接比较。
- 审核：部分有错：动画只有手臂往头前方抬（a 95→118，抬离地约 28°≈25 cm 偏高），缺 App 名称里的「T 字」；Y 字的「斜外开 30°」侧视看不出。应依 plane_detail 做 Y、T 两段，抬臂幅度降到约 10–15°。胸抬 5°（t 90→85）合理。
- 备注：代码 mid_back 同时代表中/下斜方肌（清单没有 lower_trap）。
- 我看过的关键帧角度（`yraise`）：
  - f0：`t=90 nt=-90 ns=-90 ft=-90 fs=-90 na=95 nf=95 fa=95 ff=95`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N175 F175；座标 hand N(69,-3) sh(34,0) nfoot(-48,0) ffoot(-48,0) nk(-24,0)
  - f1：`t=85 nt=-90 ns=-90 ft=-90 fs=-90 na=118 nf=118 fa=118 ff=118`；膝内角 N180 F180、髋角 N175 F175、肘内角 N180 F180、肩-上臂夹角 N157 F157；座标 hand N(65,-19) sh(34,-3) nfoot(-48,0) ffoot(-48,0) nk(-24,0)
- 来源：https://pubmed.ncbi.nlm.nih.gov/12774999/；https://fitnessvolt.com/chest-supported-y-raise-guide/

### facepull（绳索面拉）

- 肌肉：主 rear_delt, mid_back；次 lat_delt, upper_trap。机位 back34，平面 mixed。
- 依据：StrengthLog、The Manual、Powerlifting Technique：三角肌后束、菱形、中下斜方、外旋肌群（冈下肌、小圆肌）；高肘＋外旋。一则单一教练观点：拉到胸口偏斜方/中背、拉到脸偏后束与外旋——视为一家之言。
- 审核：有错（平面）：f1 a=-95、f=175 把上臂画成「往正后方水平伸出」18 单位（≈28 cm），肩关节不可能在肩高做这么大的后伸；正确是手肘往两侧抬高、前臂竖起。f0 手在胸口高度，滑轮应在脸的高度，手应略高（a≈95–100）。
- 我看过的关键帧角度（`facepull`）：
  - f0：`t=0 nt=5 ns=-5 ft=5 fs=-5 na=85 nf=85 fa=85 ff=85`；膝内角 N170 F170、髋角 N175 F175、肘内角 N180 F180、肩-上臂夹角 N85 F85；座标 hand N(35,-31) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(2,24)
  - f1：`t=0 nt=5 ns=-5 ft=5 fs=-5 na=-95 nf=175 fa=-95 ff=175`；膝内角 N170 F170、髋角 N175 F175、肘内角 N90 F90、肩-上臂夹角 N95 F95；座标 hand N(-16,-53) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(2,24)
- 来源：https://www.strengthlog.com/face-pull/；https://themanual.com/fitness/how-do-do-face-pulls；https://powerliftingtechnique.com/face-pulls/

### thruster-hands（哑铃深蹲推举）

- 肌肉：主 quads, glutes, ant_delt；次 lat_delt, triceps, hamstrings, abs。机位 front34，平面 mixed。
- 依据：健身网站一致：股四头、臀主导下蹲，三角肌（前束最活跃）与肱三头负责推举。无研究型来源。
- 审核：小错：f0 底部（蹲到大腿平行、哑铃在肩）正确；但从 f0 直接插值到 f1，中段上臂水平前伸、手在肩前约 18 单位，推举轨迹往前绕大弧（同 ohp 的问题）。建议加中间帧：站到膝约 150° 时手仍在肩、上臂 a≈20；终点手在肩正上方；推举平面同 ohp。
- 备注：燃脂收尾 A，6 分钟 AMRAP 的一项。
- 我看过的关键帧角度（`thruster`）：
  - f0：`t=35 nt=85 ns=-30 ft=85 fs=-30 na=10 nf=175 fa=10 ff=175`；膝内角 N65 F65、髋角 N60 F60、肘内角 N15 F15、肩-上臂夹角 N45 F45；座标 hand N(24,-27) sh(20,-28) nfoot(12,23) ffoot(12,23) nk(24,2)
  - f1：`t=0 nt=0 ns=0 ft=0 fs=0 na=178 nf=180 fa=178 ff=180`；膝内角 N180 F180、髋角 N180 F180、肘内角 N178 F178、肩-上臂夹角 N178 F178；座标 hand N(1,-69) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
- 来源：https://fitnessvolt.com/thrusters/；https://www.healthline.com/health/fitness-exercise/thrusters；https://gymkee.com/exercises/quadriceps/dumbbell-thruster/

### climber（登山者）

- 肌肉：主 abs, hip_flexors；次 ant_delt, pec, triceps, serratus。机位 side，平面 sagittal。
- 依据：Gymkee/Healthline：腹肌为主，髋屈肌、肩、胸、肱三头、前锯肌维持平板；Livestrong 转述 ACE：手在肩下、膝离地的平板起始。
- 审核：ok（平板 t=65、手在肩正下方；收腿侧髋屈约 95°、脚离地；伸直腿髋角 180°，臀不翘不塌）
- 备注：App 写「20 次（左右各算1）」。
- 我看过的关键帧角度（`climber`）：
  - f0：`t=65 nt=30 ns=-95 ft=-65 fs=-65 na=0 nf=0 fa=0 ff=0`；膝内角 N55 F180、髋角 N85 F180、肘内角 N180 F180、肩-上臂夹角 N65 F65；座标 hand N(31,21) sh(31,-14) nfoot(-12,19) ffoot(-44,20) nk(12,21)
  - f1：`t=65 nt=-65 ns=-65 ft=30 fs=-95 na=0 nf=0 fa=0 ff=0`；膝内角 N180 F55、髋角 N180 F85、肘内角 N180 F180、肩-上臂夹角 N65 F65；座标 hand N(31,21) sh(31,-14) nfoot(-44,20) ffoot(-12,19) nk(-22,10)
- 来源：https://www.healthline.com/health/fitness/what-do-mountain-climbers-work；https://livestrong.com/article/532142-what-muscles-do-the-exercise-mountain-climbers-work；https://hingehealth.com/resources/articles/mountain-climbers

### thruster（深蹲+双手上举）

- 肌肉：主 quads, glutes, ant_delt；次 lat_delt, triceps, hamstrings, abs。机位 front34，平面 mixed。
- 依据：健身网站一致：股四头、臀主导下蹲，三角肌（前束最活跃）与肱三头负责推举。无研究型来源。
- 审核：小错：f0 底部（蹲到大腿平行、哑铃在肩）正确；但从 f0 直接插值到 f1，中段上臂水平前伸、手在肩前约 18 单位，推举轨迹往前绕大弧（同 ohp 的问题）。建议加中间帧：站到膝约 150° 时手仍在肩、上臂 a≈20；终点手在肩正上方；推举平面同 ohp。
- 备注：燃脂收尾 A，6 分钟 AMRAP 的一项；无哑铃版只是双手上举。
- 关键帧角度：同上方 `thruster`。
- 来源：https://fitnessvolt.com/thrusters/；https://www.healthline.com/health/fitness-exercise/thrusters；https://gymkee.com/exercises/quadriceps/dumbbell-thruster/

### swing-one（单只哑铃摆荡）

- 肌肉：主 glutes, hamstrings；次 lower_back, quads, abs, forearm。机位 side，平面 sagittal。
- 依据：Del Monte 2020（Bond/ACU 等）：髋铰链式摆荡的腘绳肌（内侧与股二头）EMG 高于深蹲式摆荡（n=14）；单人 EMG 博客称臀大肌峰值最高（非对照研究）。俄式摆荡到胸高。来源全是壶铃。
- 审核：小错：f0（后摆最低点）a=-25，手在膝盖前方约 6 单位，哑铃没有从两腿之间往后「穿过去」；正确后摆是前臂贴大腿内侧、哑铃在两腿之间、手在膝盖后方靠近胯下（约 a≈-50）。f1 站直、髋完全伸展、手臂摆到胸高（a=90）正确，属俄式摆荡。
- 备注：来源都是壶铃摆荡；App 用单只哑铃（双手握一头），动作模式相同属推论。燃脂收尾 B：做 40 秒/休 20 秒。
- 我看过的关键帧角度（`swing`）：
  - f0：`t=70 nt=25 ns=-15 ft=25 fs=-15 na=-25 nf=-30 fa=-25 ff=-30`；膝内角 N140 F140、髋角 N85 F85、肘内角 N175 F175、肩-上臂夹角 N45 F45；座标 hand N(16,19) sh(32,-12) nfoot(4,45) ffoot(4,45) nk(10,22)
  - f1：`t=0 nt=0 ns=0 ft=0 fs=0 na=90 nf=90 fa=90 ff=90`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N90 F90；座标 hand N(35,-34) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
- 来源：https://research.bond.edu.au/en/publications/hamstring-myoelectrical-activity-during-three-different-kettlebel/；https://acibademinternational.com/blog/kettlebell-swings-form-benefits-and-the-back-pain-mistake/；https://trainingstation.co.uk/blogs/news/kettlebell-swings

### deadbug（死虫）

- 肌肉：主 abs；次 obliques, hip_flexors。机位 front34，平面 sagittal。
- 依据：Hinge Health 等：仰卧、手朝天、膝 90°，对侧手脚下放、背贴地；一篇综述（转引）称死虫的腹横肌激活在普拉提躯干动作中最高。
- 审核：ok（f0：大腿垂直、膝 90°、双臂朝天；f1：近侧手臂过头放到头后（na=268）、远侧腿伸直到离地约 6 单位，正是对侧手脚）
- 备注：燃脂收尾 B 的 40 秒项。第三个来源网址为推论的英区版本路径（搜索结果给的是 /fr/fr/ 与 /de/de/ 版本），如需严谨可换回 https://www.hingehealth.com/fr/fr/resources/articles/deadbug/。
- 我看过的关键帧角度（`deadbug`）：
  - f0：`t=-90 nt=180 ns=90 ft=180 fs=90 na=180 nf=180 fa=180 ff=180`；膝内角 N90 F90、髋角 N90 F90、肘内角 N180 F180、肩-上臂夹角 N90 F90；座标 hand N(-34,-35) sh(-34,0) nfoot(24,-24) ffoot(24,-24) nk(0,-24)
  - f1：`t=-90 nt=180 ns=90 ft=100 fs=95 na=268 nf=268 fa=180 ff=180`；膝内角 N90 F175、髋角 N90 F170、肘内角 N180 F180、肩-上臂夹角 N178 F90；座标 hand N(-69,-1) sh(-34,0) nfoot(24,-24) ffoot(48,-6) nk(0,-24)
- 来源：https://www.garagegymreviews.com/dead-bug-exercise；https://www.bodyspec.com/blog/post/dead_bug_exercise_form_benefits_and_variations；https://www.hingehealth.com/gb/en/resources/articles/deadbug/

### jack（开合跳）

- 肌肉：主 calves, glute_med, lat_delt；次 quads, adductors, glutes。机位 front，平面 frontal。
- 依据：NASM 开合跳条目：落地膝要弯、避免硬着陆；Livestrong：小腿每次起跳与落地都工作；多来源列髋外展肌、三角肌、股四头。无 EMG 研究。
- 审核：有错（平面）：f1 a=175 让手臂从「前方」举起（前平举路线），腿 nt=+10/ft=-10 是前后剪刀步；开合跳的手脚都应在身体两侧开合（额状面）。
- 我看过的关键帧角度（`jack`）：
  - f0：`t=0 nt=0 ns=0 ft=0 fs=0 na=10 nf=10 fa=10 ff=10`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N10 F10；座标 hand N(6,0) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
  - f1：`t=0 nt=10 ns=0 ft=-10 fs=0 na=175 nf=175 fa=175 ff=175`；膝内角 N170 F170、髋角 N170 F170、肘内角 N180 F180、肩-上臂夹角 N175 F175；座标 hand N(3,-69) sh(0,-34) nfoot(4,48) ffoot(-4,48) nk(4,24)
- 来源：https://www.nasm.org/resource-center/exercise-library/jumping-jacks；https://livestrong.com/article/434676-what-muscles-do-jumping-jacks-work；https://webmd.com/fitness-exercise/how-to-do-jumping-jacks

### burpee（不跳版波比）

- 肌肉：主 quads, glutes；次 abs, ant_delt, pec, triceps, calves。机位 side，平面 sagittal。
- 依据：Get Healthy U、MasterClass、mindbodygreen：不跳版＝脚一只一只往后踩成平板、再一只一只踩回、站起不跳；股四头、臀、小腿、核心、肩（撑地）。
- 审核：小错：f1（蹲下手撑地）→ f2（平板）两只脚同时从蹲姿移到身后，看起来是「双脚跳回」；App 是不跳版，应加中间帧让脚一只一只往后踩（先近侧腿伸到 -65，再远侧腿），回来时也一只一只。站立回到 f4 没有跳，正确。f2 平板身体一直线正确。
- 我看过的关键帧角度（`burpee`）：
  - f0：`t=0 nt=0 ns=0 ft=0 fs=0 na=0 nf=0 fa=0 ff=0`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N0 F0；座标 hand N(0,1) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
  - f1：`t=45 nt=100 ns=-45 ft=100 fs=-45 na=10 nf=10 fa=10 ff=10`；膝内角 N35 F35、髋角 N35 F35、肘内角 N180 F180、肩-上臂夹角 N55 F55；座标 hand N(30,10) sh(24,-24) nfoot(7,13) ffoot(7,13) nk(24,-4)
  - f2：`t=65 nt=-65 ns=-65 ft=-65 fs=-65 na=0 nf=0 fa=0 ff=0`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N65 F65；座标 hand N(31,21) sh(31,-14) nfoot(-44,20) ffoot(-44,20) nk(-22,10)
  - f3：`t=45 nt=100 ns=-45 ft=100 fs=-45 na=10 nf=10 fa=10 ff=10`；膝内角 N35 F35、髋角 N35 F35、肘内角 N180 F180、肩-上臂夹角 N55 F55；座标 hand N(30,10) sh(24,-24) nfoot(7,13) ffoot(7,13) nk(24,-4)
  - f4：`t=0 nt=0 ns=0 ft=0 fs=0 na=0 nf=0 fa=0 ff=0`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N0 F0；座标 hand N(0,1) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
- 来源：https://gethealthyu.com/modified-burpees；https://www.masterclass.com/articles/modified-burpee；https://www.mindbodygreen.com/articles/modified-burpee

### tap（平板支撑碰肩）

- 肌肉：主 obliques, abs；次 ant_delt, serratus, glutes。机位 front34，平面 mixed。
- 依据：StrengthLog 等：腹内外斜肌抗旋转为主、腹直肌抗伸展；髋晃就把双脚放宽。来源质量一般。
- 审核：有错：f1 na=30、nf=-150 → 肘内角 0°（前臂完全折回上臂、手落在同侧肩关节上），人体肘关节最多屈约 145°，做不到；且应碰「对侧」肩（横越身体中线，侧视看不出）。应按 plane_detail 摆。
- 备注：燃脂收尾 C：「平板支撑碰肩 16 次」。
- 我看过的关键帧角度（`tap`）：
  - f0：`t=65 nt=-65 ns=-65 ft=-65 fs=-65 na=0 nf=0 fa=0 ff=0`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N65 F65；座标 hand N(31,21) sh(31,-14) nfoot(-44,20) ffoot(-44,20) nk(-22,10)
  - f1：`t=65 nt=-65 ns=-65 ft=-65 fs=-65 na=30 nf=-150 fa=0 ff=0`；膝内角 N180 F180、髋角 N180 F180、肘内角 N0 F180、肩-上臂夹角 N95 F65；座标 hand N(31,-14) sh(31,-14) nfoot(-44,20) ffoot(-44,20) nk(-22,10)
- 来源：https://www.strengthlog.com/plank-with-shoulder-taps；https://rehabhero.ca/exercise/tall-plank-shoulder-tap；https://www.hsnstore.eu/blog/training-routines/core/anti-rotation/

### march（原地高抬腿踏步）

- 肌肉：主 hip_flexors；次 quads, abs, calves。机位 side，平面 sagittal。
- 依据：Special Olympics 动态伸展指南：膝抬到髋高或以上、手肘弯前后摆；Rehab Hero A-march：髂腰肌、股直肌；对侧手脚同动。
- 审核：小错：抬腿侧大腿 nt=60（髋屈 60°），膝盖只到大腿中段高度；App 写「膝盖抬到约腰的高度」，应 nt≈80–90（大腿接近水平）。手脚对侧摆动（抬右腿时左手在前）正确。
- 我看过的关键帧角度（`march`）：
  - f0：`t=0 nt=60 ns=0 ft=0 fs=0 na=-30 nf=-10 fa=30 ff=60`；膝内角 N120 F180、髋角 N120 F180、肘内角 N160 F150、肩-上臂夹角 N30 F30；座标 hand N(-12,-2) sh(0,-34) nfoot(21,36) ffoot(0,48) nk(21,12)
  - f1：`t=0 nt=0 ns=0 ft=60 fs=0 na=30 nf=60 fa=-30 ff=-10`；膝内角 N180 F120、髋角 N180 F120、肘内角 N150 F160、肩-上臂夹角 N30 F30；座标 hand N(24,-10) sh(0,-34) nfoot(0,48) ffoot(21,36) nk(0,24)
- 来源：https://media.specialolympics.org/resources/health/fitness/Fitness-Dynamic-Streches-Guide.pdf；https://www.rehabhero.ca/exercise/a-marches

### armcircle（手臂大绕环）

- 肌肉：主 ant_delt, lat_delt, rear_delt；次 upper_trap。机位 side，平面 sagittal。
- 依据：Texas A&M Howdy Health：由小圈渐大；Caliverse/Institute of Motion：热身三角肌与旋转肌袖、增加肩关节活动范围。来源对「侧平举画圈」与「直臂大绕环」两种做法都有。
- 审核：ok（直臂 a 0→180→360 在侧面画大圆，属「大绕环」常见做法）。注意：动画只循环一个方向（前→上→后），App 要求前 15 秒往前、后 15 秒往后，单张循环图只能示范一个方向；若改成「手臂侧平举画小圈」则为额状面版本，两者来源都有。
- 我看过的关键帧角度（`armcircle`）：
  - f0：`t=0 nt=0 ns=0 ft=0 fs=0 na=0 nf=0 fa=0 ff=0`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N0 F0；座标 hand N(0,1) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
  - f1：`t=0 nt=0 ns=0 ft=0 fs=0 na=180 nf=180 fa=180 ff=180`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(0,-69) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
  - f2：`t=0 nt=0 ns=0 ft=0 fs=0 na=360 nf=360 fa=360 ff=360`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N0 F0；座标 hand N(0,1) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
- 来源：https://howdyhealth.tamu.edu/a-quick-5-minute-warm-up-routine-for-walkers/；https://www.caliverse.app/exercises/263；https://platform.instituteofmotion.com/library/block/jely178x

### catcow（猫牛式）

- 肌肉：主 lower_back, abs；次 （空）。机位 side，平面 sagittal。
- 依据：Prehab Guys、Acibadem：四足跪姿、脊椎在屈曲（拱背）与伸展（塌腰）间来回，是活动度而非肌力动作；急性腰痛避免。**少数异议**：Gokhale Method 认为极端屈伸交替会给脊椎关节压力。
- 审核：有错（表达不到）：两帧只把一根直线躯干从 t=68 转到 76，脊椎没有「拱起/塌下」的弯曲，手的位置还从 y=22 沉到 27（手离开地面原位）。应：手、膝固定在地（手在肩下、膝在髋下），猫式＝胸腰椎屈曲往上拱、低头；牛式＝腰椎伸展往下塌、胸口前送、抬头；骨盆跟着前后倾。3D 模型需要可弯的脊椎骨。
- 备注：secondary 留空：属脊椎活动度动作，来源只提肩、髋、核心负责维持四足姿势，未指名特定协同肌。
- 我看过的关键帧角度（`catcow`）：
  - f0：`t=68 nt=0 ns=-90 ft=0 fs=-90 na=0 nf=0 fa=0 ff=0`；膝内角 N90 F90、髋角 N112 F112、肘内角 N180 F180、肩-上臂夹角 N68 F68；座标 hand N(32,22) sh(32,-13) nfoot(-24,24) ffoot(-24,24) nk(0,24)
  - f1：`t=76 nt=0 ns=-90 ft=0 fs=-90 na=0 nf=0 fa=0 ff=0`；膝内角 N90 F90、髋角 N104 F104、肘内角 N180 F180、肩-上臂夹角 N76 F76；座标 hand N(33,27) sh(33,-8) nfoot(-24,24) ffoot(-24,24) nk(0,24)
- 来源：https://library.theprehabguys.com/vimeo-video/cat-cow/；https://acibademinternational.com/blog/cat-cow-stretch-why-physios-keep-prescribing-this-simple-flow/；https://gokhalemethod.com/blog/71058

### lungeT（弓步＋双手前伸）

- 肌肉：主 quads, glutes；次 hip_flexors, ant_delt。机位 side，平面 sagittal。
- 依据：Outside（弓步矩阵）：跨步落地时双手上举，拉伸后腿髋屈肌；UPMC 居家热身。注意 App 是「双手向前伸」，来源多为「向上举」——动作意图相同（热身），手臂方向依 App。
- 审核：小错：f1 远侧手臂掉到 fa=40、ff=60（弯着往下），只有一只手前伸；App 写「双手向前伸直」，两只手都应 a≈90、f≈90。弓步下肢同 lunge（前膝约 90°、后膝近地），正确。
- 备注：hip_flexors 列为 secondary＝后腿髋屈肌被拉伸。
- 我看过的关键帧角度（`lungeT`）：
  - f0：`t=3 nt=0 ns=0 ft=0 fs=0 na=90 nf=90 fa=90 ff=90`；膝内角 N180 F180、髋角 N177 F177、肘内角 N180 F180、肩-上臂夹角 N93 F93；座标 hand N(37,-34) sh(2,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
  - f1：`t=3 nt=78 ns=-3 ft=-15 fs=-80 na=90 nf=90 fa=40 ff=60`；膝内角 N99 F115、髋角 N99 F168、肘内角 N180 F160、肩-上臂夹角 N93 F43；座标 hand N(37,-34) sh(2,-34) nfoot(22,29) ffoot(-30,27) nk(23,5)
- 来源：https://www.outsideonline.com/health/running/training-advice/running-101/utilizing-lunge-matrix-become-stronger-runner/；https://www.upmc.com/healthbeat/sports-medicine/at-home-warmups

### scap（肩胛俯卧撑）

- 肌肉：主 serratus；次 mid_back, abs。机位 back34，平面 sagittal。
- 依据：PMC4327800（push-up plus 与肘角）：前锯肌在「plus」（肩胛前伸）阶段活动最高，上/下斜方在俯卧撑阶段较高；PMC4047223 等。未找到「肘锁死」版本的直接研究。
- 审核：有错：f1 用 IK 把肘弯到内角 125°（屈 55°），看起来是小幅度俯卧撑；App 要领「手肘全程不弯」。应：肘内角始终 180°，只让胸口在两手之间下沉约 2–3 cm（肩胛内收）再推高（肩胛前伸）。2D 火柴人无法表现肩胛滑动，3D 需用肩胛/锁骨骨骼。
- 我看过的关键帧角度（`scap`）：
  - f0：`t=65 nt=-65 ns=-65 ft=-65 fs=-65 na=0 nf=0 fa=0 ff=0`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N65 F65；座标 hand N(31,21) sh(31,-14) nfoot(-44,20) ffoot(-44,20) nk(-22,10)
  - f1：`t=68 nt=-68 ns=-68 ft=-68 fs=-68 na=-30 nf=25 fa=-30 ff=25`；膝内角 N180 F180、髋角 N180 F180、肘内角 N125 F125、肩-上臂夹角 N38 F38；座标 hand N(30,18) sh(32,-13) nfoot(-45,18) ffoot(-45,18) nk(-22,9)
- 来源：https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4327800/；https://pmc.ncbi.nlm.nih.gov/articles/PMC4047223

### wgs（世界最伟大伸展）

- 肌肉：主 hip_flexors, adductors；次 hamstrings, obliques, pec。机位 front34，平面 mixed。
- 依据：Equinox（2013）、Prehab Guys：弓步→肘下沉→胸椎旋转（→腘绳伸展）；后腿尽量伸直以拉伸髋屈肌；Fit&Well：对初学者要求高。**未查证**：支撑手与上举手是哪一侧（见下）。
- 审核：有错：①f0/f1 支撑手 a=5 垂在肩下，手在 y=9、地面约 y=29，手离地约 20 单位≈30 cm，没有「撑地」。②后膝内角 115°、后膝离地仅 6 单位，比较像跪姿弓步；来源要领是后腿尽量伸直以拉伸髋屈肌。③上举手 na=175 只是往头顶方向举，缺「胸椎旋转、胸口转开」。应：躯干更低（t≈70–80）让支撑手着地，后腿近伸直，按 plane_detail 做旋转。
- 备注：哪只手撑地：App 写「同侧手撑地」，常见版本是前脚异侧的手撑地、前脚同侧的手往上转——此细节未查证，见笔记。
- 我看过的关键帧角度（`wgs`）：
  - f0：`t=40 nt=78 ns=-3 ft=-15 fs=-80 na=5 nf=5 fa=5 ff=5`；膝内角 N99 F115、髋角 N62 F155、肘内角 N180 F180、肩-上臂夹角 N45 F45；座标 hand N(25,9) sh(22,-26) nfoot(22,29) ffoot(-30,27) nk(23,5)
  - f1：`t=40 nt=78 ns=-3 ft=-15 fs=-80 na=175 nf=178 fa=5 ff=5`；膝内角 N99 F115、髋角 N62 F155、肘内角 N177 F180、肩-上臂夹角 N145 F45；座标 hand N(24,-61) sh(22,-26) nfoot(22,29) ffoot(-30,27) nk(23,5)
- 来源：https://www.equinox.com/articles/2013/04/worlds-greatest-stretch；https://library.theprehabguys.com/vimeo-video/worlds-greatest-stretch-2/；https://www.fitandwell.com/exercise/flexibility/the-worlds-greatest-stretch-is-too-demanding-for-beginners-here-are-six-better-alternatives-according-to-a-certified-stretch-therapist/

### quad（大腿前侧拉伸）

- 肌肉：主 quads；次 hip_flexors。机位 side，平面 sagittal。
- 依据：Physitrack、CommonSpirit、RJAH（NHS 关联医院）博客：单脚站、脚跟拉向臀部、两膝并拢、膝朝下，扶东西保持平衡；停留 15–30 秒（各来源不同）。
- 审核：ok（拉伸腿膝内角约 36°、脚跟贴近臀部；大腿 nt=-14 略在身体后方、膝盖朝下；手抓脚背；站立腿直）
- 我看过的关键帧角度（`quad`）：
  - f0：`t=0 nt=-14 ns=-158 ft=0 fs=0 na=-21 nf=-23 fa=0 ff=0`；膝内角 N36 F180、髋角 N166 F180、肘内角 N177 F180、肩-上臂夹角 N21 F0；座标 hand N(-13,-2) sh(0,-34) nfoot(-15,1) ffoot(0,48) nk(-6,23)
  - f1：`t=3 nt=-18 ns=-160 ft=0 fs=0 na=-25 nf=-28 fa=0 ff=0`；膝内角 N38 F180、髋角 N165 F177、肘内角 N177 F180、肩-上臂夹角 N22 F3；座标 hand N(-14,-3) sh(2,-34) nfoot(-16,0) ffoot(0,48) nk(-7,23)
- 来源：https://www.physitrack.com/exercise-library/how-to-perform-the-quad-stretch-exercise；https://commonspirit.org/conditions-treatments/quad-stretch-standing；https://ourspace.rjah.nhs.uk/?p=1807

### fig4（4字臀部拉伸）

- 肌肉：主 glutes, glute_med；次 （空）。机位 front34，平面 mixed。
- 依据：Hinge Health：仰卧、一脚踝放对侧膝上、把腿拉向胸口，主要放松臀中肌与深层梨状肌；SARCO+：臀大肌为主；简化版可脚踩地。
- 审核：有错：①交叉腿脚踝（近侧脚 (28,-26)）离支撑腿膝盖（(12,-21)）约 16 单位≈25 cm，没有「放在膝盖上」。②支撑腿（远侧）脚还踩在地上（屈膝 120°），App 写「双手抱住下面那条大腿往胸口拉」，应离地拉向胸口。③双手在腹部上方 (-10,-24) 悬空，没抱到大腿。
- 备注：被拉伸的还有梨状肌等深层外旋肌，清单没有对应代码，以 glutes/glute_med 代表；secondary 留空。
- 我看过的关键帧角度（`fig4`）：
  - f0：`t=-90 nt=170 ns=95 ft=150 fs=30 na=120 nf=150 fa=120 ff=150`；膝内角 N105 F60、髋角 N100 F120、肘内角 N150 F150、肩-上臂夹角 N30 F30；座标 hand N(-10,-24) sh(-34,0) nfoot(28,-26) ffoot(24,0) nk(4,-24)
  - f1：`t=-90 nt=175 ns=95 ft=155 fs=35 na=125 nf=155 fa=125 ff=155`；膝内角 N100 F60、髋角 N95 F115、肘内角 N150 F150、肩-上臂夹角 N35 F35；座标 hand N(-12,-26) sh(-34,0) nfoot(26,-26) ffoot(24,-2) nk(2,-24)
- 来源：https://www.hingehealth.com/gb/en/resources/articles/figure-four/；https://akuaku.org/Sarco+/exercise-figure-four-glute-stretch.html

### chest（门框胸部拉伸）

- 肌肉：主 pec；次 ant_delt。机位 front34，平面 mixed。
- 依据：Physitrack、ExRx（搜索带出网址）：手臂放门框肩高、肘约 90°、前臂贴框、一脚前跨；JSES International 2021（PMC8568813）：门框伸展增加胸小肌长度与盂肱内旋。**矛盾**：手肘高低偏重哪一束——一说低偏上胸、高偏下胸与胸小肌，另一说相反。规格采「肩高或略低」。
- 审核：有错（平面）：na=-80、nf=-170 把上臂画成「往正后方水平伸出」18 单位，肩关节做不到这么大的后伸；正确是上臂往两侧外展、手肘与肩同高、身体前倾让胸口穿过门框。前倾 6°（t 0→6）方向对，可稍大并加一脚前跨。
- 我看过的关键帧角度（`chest`）：
  - f0：`t=0 nt=0 ns=0 ft=0 fs=0 na=-80 nf=-170 fa=-80 ff=-170`；膝内角 N180 F180、髋角 N180 F180、肘内角 N90 F90、肩-上臂夹角 N80 F80；座标 hand N(-21,-48) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
  - f1：`t=6 nt=0 ns=0 ft=0 fs=0 na=-88 nf=-172 fa=-88 ff=-172`；膝内角 N180 F180、髋角 N174 F174、肘内角 N96 F96、肩-上臂夹角 N82 F82；座标 hand N(-17,-50) sh(4,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
- 来源：https://exrx.net/Stretches/ChestGeneral/Doorway；https://pmc.ncbi.nlm.nih.gov/articles/PMC8568813/；https://us.physitrack.com/home-exercise-video/pectoralis-stretching

### child（婴儿式）

- 肌肉：主 lats, lower_back；次 glutes。机位 side，平面 sagittal。
- 依据：NASM、Hinge Health、WebMD：跪坐臀向脚跟、手前伸；手前伸版主要拉背阔肌，兼下背、臀、髋。
- 审核：ok（膝屈约 150°、髋屈到躯干贴大腿（髋角 13–17°）、手臂前伸贴地、额头近地）
- 备注：也用作「训练完成」画面。
- 我看过的关键帧角度（`child`）：
  - f0：`t=103 nt=60 ns=-90 ft=60 fs=-90 na=85 nf=90 fa=85 ff=90`；膝内角 N30 F30、髋角 N17 F17、肘内角 N175 F175、肩-上臂夹角 N172 F172；座标 hand N(68,9) sh(33,8) nfoot(-3,12) ffoot(-3,12) nk(21,12)
  - f1：`t=107 nt=60 ns=-90 ft=60 fs=-90 na=88 nf=92 fa=88 ff=92`；膝内角 N30 F30、髋角 N13 F13、肘内角 N176 F176、肩-上臂夹角 N165 F165；座标 hand N(67,10) sh(33,10) nfoot(-3,12) ffoot(-3,12) nk(21,12)
- 来源：https://www.nasm.org/exercise-library/child's-pose；https://www.hingehealth.com/gb/en/resources/articles/childs-pose/；https://www.webmd.com/fitness-exercise/how-to-do-childs-pose

### wwalk（水中行走）

- 肌肉：主 （空）；次 （空）。机位 side，平面 sagittal。
- 依据：Arthritis Foundation：水中运动减痛，倒退走用到更多脊椎周围与股四头、小腿前侧肌群；Arthritis Action 说明书。
- 审核：ok（躯干前倾 4°、步幅小、手脚对侧摆动）
- 备注：游泳入门的水感／安全技能，重点是姿势与呼吸、不是练肌肉，故 primary/secondary 留空、strip 留空。 reps 取自 App 目标文字。
- 我看过的关键帧角度（`wwalk`）：
  - f0：`t=4 nt=40 ns=-5 ft=0 fs=0 na=-35 nf=-20 fa=30 ff=40`；膝内角 N135 F180、髋角 N136 F176、肘内角 N165 F170、肩-上臂夹角 N31 F34；座标 hand N(-14,-3) sh(2,-34) nfoot(13,42) ffoot(0,48) nk(15,18)
  - f1：`t=4 nt=0 ns=0 ft=40 fs=-5 na=30 nf=40 fa=-35 ff=-20`；膝内角 N180 F135、髋角 N176 F136、肘内角 N170 F165、肩-上臂夹角 N34 F31；座标 hand N(22,-5) sh(2,-34) nfoot(0,48) ffoot(13,42) nk(0,24)
- 来源：https://www.arthritis.org/health-wellness/healthy-living/physical-activity/other-activities/hit-the-pool；https://www.arthritisaction.org.uk/wp-content/uploads/2025/07/Water-based-Activity-for-Arthritis.pdf

### bob（吐泡泡·水里睁眼）

- 肌肉：主 （空）；次 （空）。机位 side，平面 sagittal。
- 依据：MySwimPro、Divessi、AACPS 水上安全：在水中持续缓慢吐气、出水只吸气；**分歧**：有的先教只用鼻子吐，有的先口鼻一起吐。
- 审核：ok（站立→深蹲让头没入水面：蹲下时头顶约在水面下 13 单位）
- 备注：游泳入门的水感／安全技能，重点是姿势与呼吸、不是练肌肉，故 primary/secondary 留空、strip 留空。 同一张图被「吐泡泡」（连续 10 次）与「水里睁眼」（看清 5 秒）共用。
- 我看过的关键帧角度（`bob`）：
  - f0：`t=0 nt=0 ns=0 ft=0 fs=0 na=25 nf=35 fa=25 ff=35`；膝内角 N180 F180、髋角 N180 F180、肘内角 N170 F170、肩-上臂夹角 N25 F25；座标 hand N(17,-4) sh(0,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
  - f1：`t=25 nt=100 ns=-45 ft=100 fs=-45 na=70 nf=80 fa=70 ff=80`；膝内角 N35 F35、髋角 N55 F55、肘内角 N170 F170、肩-上臂夹角 N95 F95；座标 hand N(48,-22) sh(14,-31) nfoot(7,13) ffoot(7,13) nk(24,-4)
- 来源：https://blog.myswimpro.com/2022/02/02/4-freestyle-breathing-drills-for-beginner-swimmers/；https://www.divessi.com/blog/swimming-drills-for-beginners-2846；https://sites.google.com/aacps.org/watersafety/personal-water-safety/breathing-and-bubbles

### wallfloat（扶池边漂浮）

- 肌肉：主 （空）；次 （空）。机位 side，平面 sagittal。
- 依据：Swim England Stage 2 视频说明允许扶墙或用浮具；PE Hub 课程：扶墙伸臂、脸入水、松开一手；Rockstar Academy：常见错误是紧张、抬头、乱踢、站太快。
- 审核：ok（双手直臂扶墙、身体水平、脸朝下，腿在水平与下沉 6° 之间轻微浮动）
- 备注：游泳入门的水感／安全技能，重点是姿势与呼吸、不是练肌肉，故 primary/secondary 留空、strip 留空。
- 我看过的关键帧角度（`wallfloat`）：
  - f0：`t=90 nt=-90 ns=-90 ft=-90 fs=-90 na=90 nf=90 fa=90 ff=90`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(69,0) sh(34,0) nfoot(-48,0) ffoot(-48,0) nk(-24,0)
  - f1：`t=90 nt=-84 ns=-84 ft=-84 fs=-84 na=90 nf=90 fa=90 ff=90`；膝内角 N180 F180、髋角 N174 F174、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(69,0) sh(34,0) nfoot(-48,5) ffoot(-48,5) nk(-24,3)
- 来源：https://thepehub.co.uk/free-content/units/beginners-swimming-21/lessons/beginners-swimming-lesson-2-14；https://www.rockstaracademy.com/blog/prone-float；https://video.swimming.org/videos/stage-2-full-length

### jelly（水母漂）

- 肌肉：主 （空）；次 （空）。机位 side，平面 sagittal。
- 依据：Red Cross Level 2（各地方转载）：水母漂（求生漂）、团身漂、俯漂；Livestrong：抱膝团身，身体像球一样浮到水面。
- 审核：ok（抱膝团身、低头，双手抱在小腿中段，背部最高点约在水面附近）
- 备注：游泳入门的水感／安全技能，重点是姿势与呼吸、不是练肌肉，故 primary/secondary 留空、strip 留空。
- 我看过的关键帧角度（`jelly`）：
  - f0：`t=105 nt=35 ns=-120 ft=35 fs=-120 na=-45 nf=-117 fa=-45 ff=-117`；膝内角 N25 F25、髋角 N40 F40、肘内角 N108 F108、肩-上臂夹角 N60 F60；座标 hand N(5,14) sh(33,9) nfoot(-7,8) ffoot(-7,8) nk(14,20)
  - f1：`t=100 nt=38 ns=-118 ft=38 fs=-118 na=-40 nf=-107 fa=-40 ff=-107`；膝内角 N24 F24、髋角 N42 F42、肘内角 N113 F113、肩-上臂夹角 N60 F60；座标 hand N(6,15) sh(33,6) nfoot(-6,8) ffoot(-6,8) nk(15,19)
- 来源：https://www.livestrong.com/article/160048-list-of-things-to-teach-during-swim-lessons/；https://www.alamedaca.gov/ONLINE-SERVICES/Red-Cross-Swim-Level-2

### standup（漂浮后站起来）

- 肌肉：主 （空）；次 （空）。机位 side，平面 sagittal。
- 依据：Calderdale、Derbyshire 学校的 Swim England 进程文件：「从俯漂回到站立」是早期达标项目；Water Safety 标准：俯漂翻成仰漂再回直立。App 的「收膝→压手→抬头→踩地」四步顺序**未查证到原文**。
- 审核：ok（漂浮→收膝同时手往下往后压水、头抬起→站直）。小建议：App 强调顺序「收膝→压手→抬头→踩地」，现有插值四件事同时发生，可把 f1 拆成「先收膝」「再压手抬头」两帧。
- 备注：游泳入门的水感／安全技能，重点是姿势与呼吸、不是练肌肉，故 primary/secondary 留空、strip 留空。 来源只确认「从漂浮回到站立」是 Swim England 早期阶段的达标项目，App 的四步顺序未查证到原文。
- 我看过的关键帧角度（`standup`）：
  - f0：`t=90 nt=-90 ns=-90 ft=-90 fs=-90 na=90 nf=90 fa=90 ff=90`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(69,0) sh(34,0) nfoot(-48,0) ffoot(-48,0) nk(-24,0)
  - f1：`t=45 nt=70 ns=-40 ft=70 fs=-40 na=25 nf=-20 fa=25 ff=-20`；膝内角 N70 F70、髋角 N65 F65、肘内角 N135 F135、肩-上臂夹角 N70 F70；座标 hand N(26,8) sh(24,-24) nfoot(7,27) ffoot(7,27) nk(23,8)
  - f2：`t=2 nt=0 ns=0 ft=0 fs=0 na=10 nf=10 fa=10 ff=10`；膝内角 N180 F180、髋角 N178 F178、肘内角 N180 F180、肩-上臂夹角 N12 F12；座标 hand N(7,0) sh(1,-34) nfoot(0,48) ffoot(0,48) nk(0,24)
  - f3：`t=90 nt=-90 ns=-90 ft=-90 fs=-90 na=90 nf=90 fa=90 ff=90`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(69,0) sh(34,0) nfoot(-48,0) ffoot(-48,0) nk(-24,0)
- 来源：https://www.woodhouse.calderdale.sch.uk/media/4466/swimming-progression.pdf；https://video.swimming.org/water-safety-expected-standards-1

### starfloat（不扶东西漂浮）

- 肌肉：主 （空）；次 （空）。机位 side，平面 sagittal。
- 依据：Sunsational Swim School：先习惯脸入水再练俯漂、逐步减少支撑；Red Cross Level 2：俯漂保持约 5–10 秒（各地不同）。
- 审核：ok（依 App 文字「双手往前伸直、手脚伸直」：身体水平、手臂过头前伸）。注意 key 名为 star float（海星漂，手脚张开成 X），若改画海星漂则属额状面（手外展约 120–150°、腿各外展约 20–30°），需委派方择一。
- 备注：游泳入门的水感／安全技能，重点是姿势与呼吸、不是练肌肉，故 primary/secondary 留空、strip 留空。
- 我看过的关键帧角度（`starfloat`）：
  - f0：`t=90 nt=-90 ns=-90 ft=-90 fs=-90 na=100 nf=100 fa=100 ff=100`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N170 F170；座标 hand N(68,-6) sh(34,0) nfoot(-48,0) ffoot(-48,0) nk(-24,0)
  - f1：`t=90 nt=-86 ns=-86 ft=-86 fs=-86 na=96 nf=96 fa=96 ff=96`；膝内角 N180 F180、髋角 N176 F176、肘内角 N180 F180、肩-上臂夹角 N174 F174；座标 hand N(69,-4) sh(34,0) nfoot(-48,3) ffoot(-48,3) nk(-24,2)
- 来源：https://www.sunsationalswimschool.com/blog/getting-beginners-to-learn-be-comfortable-with-front-and-back-floating；https://www.alamedaca.gov/ONLINE-SERVICES/Red-Cross-Swim-Level-2

### backfloat（仰漂）

- 肌肉：主 （空）；次 （空）。机位 front34，平面 frontal。
- 依据：MySwimPro、Swim Like a Fish：放松、核心收紧防止髋下沉、手在髋旁轻轻划水；「耳朵入水、肚子挺」的具体口令未找到权威原文。**注意**：来源有的写手在髋旁划水，App 写手往两侧张开——规格依 App。
- 审核：有错：手臂 a=-100 画成「伸直过头放在头顶后方」，App 写「手臂往两侧张开」，应为两侧外展（额状面）。身体与腿水平、髋 180° 正确。
- 备注：游泳入门的水感／安全技能，重点是姿势与呼吸、不是练肌肉，故 primary/secondary 留空、strip 留空。
- 我看过的关键帧角度（`backfloat`）：
  - f0：`t=-90 nt=90 ns=90 ft=90 fs=90 na=-100 nf=-100 fa=-100 ff=-100`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N170 F170；座标 hand N(-68,-6) sh(-34,0) nfoot(48,0) ffoot(48,0) nk(24,0)
  - f1：`t=-92 nt=94 ns=94 ft=94 fs=94 na=-96 nf=-96 fa=-96 ff=-96`；膝内角 N180 F180、髋角 N178 F178、肘内角 N180 F180、肩-上臂夹角 N172 F172；座标 hand N(-69,-2) sh(-34,1) nfoot(48,-3) ffoot(48,-3) nk(24,-2)
- 来源：https://blog.myswimpro.com/2020/08/28/learn-to-float-in-10-minutes-or-less/；https://swimlikeafish.org/how-to-float-on-your-back-5-drills

### glide（蹬边滑行）

- 肌肉：主 （空）；次 （空）。机位 side，平面 sagittal。
- 依据：USA Swimming：每次蹬壁锁手、手臂贴耳后流线；MySwimPro：抬头看墙会破坏流线；Divessi：蹬出后不打腿不划手滑到停。**分歧**：手臂放在耳朵上还是耳朵后方，教练说法不一。
- 审核：ok（f0 双脚踩壁屈膝 90°、手臂前伸；f1/f2 身体拉直成一直线向前滑，脸朝下）
- 备注：游泳入门的水感／安全技能，重点是姿势与呼吸、不是练肌肉，故 primary/secondary 留空、strip 留空。
- 我看过的关键帧角度（`glide`）：
  - f0：`t=90 nt=-35 ns=-125 ft=-35 fs=-125 na=90 nf=90 fa=90 ff=90`；膝内角 N90 F90、髋角 N125 F125、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(69,0) sh(34,0) nfoot(-33,6) ffoot(-33,6) nk(-14,20)
  - f1：`t=90 nt=-90 ns=-90 ft=-90 fs=-90 na=90 nf=90 fa=90 ff=90`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(69,0) sh(34,0) nfoot(-48,0) ffoot(-48,0) nk(-24,0)
  - f2：`t=90 nt=-90 ns=-90 ft=-90 fs=-90 na=90 nf=90 fa=90 ff=90`；膝内角 N180 F180、髋角 N180 F180、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(69,0) sh(34,0) nfoot(-48,0) ffoot(-48,0) nk(-24,0)
- 来源：https://www.usaswimming.org/news/2021/10/05/five-freestyle-tips-to-start-your-season；https://www.divessi.com/en/blog/swimming-drills-for-beginners-2846；https://swim-teach.com/how-to-glide-further-without-sinking.html

### kick（扶板打腿）

- 肌肉：主 hip_flexors, quads；次 glutes, hamstrings, calves。机位 side，平面 sagittal。
- 依据：GoSwim：从髋发力、腿窄、脚尖绷；Swimming World：膝弯多会把工作从髋屈肌转到股四头；Dan Daly 教练：下打靠髋屈肌与股四头、上抬靠臀与腘绳。均为教练文章。
- 审核：ok（大腿在水平线上下各约 10° 交替、膝只微弯（内角 170–175°）、两脚上下相差约 22 单位≈35 cm，属小幅打腿）
- 备注：打腿类填了肌肉：来源（教练文章，非研究）指下打腿靠髋屈肌与股四头肌、上抬靠臀与腘绳肌。
- 我看过的关键帧角度（`kick`）：
  - f0：`t=88 nt=-80 ns=-70 ft=-100 fs=-105 na=90 nf=90 fa=90 ff=90`；膝内角 N170 F175、髋角 N172 F168、肘内角 N180 F180、肩-上臂夹角 N178 F178；座标 hand N(69,-1) sh(34,-1) nfoot(-46,12) ffoot(-47,-10) nk(-24,4)
  - f1：`t=88 nt=-100 ns=-105 ft=-80 fs=-70 na=90 nf=90 fa=90 ff=90`；膝内角 N175 F170、髋角 N168 F172、肘内角 N180 F180、肩-上臂夹角 N178 F178；座标 hand N(69,-1) sh(34,-1) nfoot(-47,-10) ffoot(-46,12) nk(-24,-4)
- 来源：https://blog.goswim.tv/post/freestyle-flutter-from-the-hips；https://www.swimmingworldmagazine.com/articles/swimmagazine/articles/199507-02swim_art.asp；https://dan-daly.squarespace.com/train-daly/blog/flutter-kick-technique-muscles-benefits

### kickbreath（扶板打腿换气）

- 肌肉：主 hip_flexors, quads；次 glutes, hamstrings, calves。机位 side，平面 sagittal。
- 依据：USMS「Kick Drills for All」：换气时腿要继续打、每次换气后脸放回水里、头不要抬太高；Human Kinetics 节选：头与身体位置影响换气。
- 审核：ok（换气帧 t=72：上身抬起 18°、下巴前抬出水，腿在换气帧仍在交替打，符合「换气时腿继续打」）
- 备注：同 kick 的肌肉说明。
- 我看过的关键帧角度（`kickbreath`）：
  - f0：`t=90 nt=-80 ns=-70 ft=-100 fs=-105 na=90 nf=90 fa=90 ff=90`；膝内角 N170 F175、髋角 N170 F170、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(69,0) sh(34,0) nfoot(-46,12) ffoot(-47,-10) nk(-24,4)
  - f1：`t=90 nt=-100 ns=-105 ft=-80 fs=-70 na=90 nf=90 fa=90 ff=90`；膝内角 N175 F170、髋角 N170 F170、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(69,0) sh(34,0) nfoot(-47,-10) ffoot(-46,12) nk(-24,-4)
  - f2：`t=72 nt=-80 ns=-70 ft=-100 fs=-105 na=90 nf=90 fa=90 ff=90`；膝内角 N170 F175、髋角 N172 F152、肘内角 N180 F180、肩-上臂夹角 N162 F162；座标 hand N(67,-11) sh(32,-11) nfoot(-46,12) ffoot(-47,-10) nk(-24,4)
  - f3：`t=90 nt=-100 ns=-105 ft=-80 fs=-70 na=90 nf=90 fa=90 ff=90`；膝内角 N175 F170、髋角 N170 F170、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(69,0) sh(34,0) nfoot(-47,-10) ffoot(-46,12) nk(-24,-4)
  - f4：`t=90 nt=-80 ns=-70 ft=-100 fs=-105 na=90 nf=90 fa=90 ff=90`；膝内角 N170 F175、髋角 N170 F170、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(69,0) sh(34,0) nfoot(-46,12) ffoot(-47,-10) nk(-24,4)
- 来源：https://www.usms.org/fitness-and-training/articles-and-videos/articles/kick-drills-for-all；https://us.humankinetics.com/blogs/excerpt/improve-head-and-body-position-to-breathe-more-effectively

### kickfree（滑行打腿）

- 肌肉：主 hip_flexors, quads；次 glutes, hamstrings, calves。机位 side，平面 sagittal。
- 依据：同 glide 与 kick 的来源。
- 审核：ok（无浮板、手臂过头前伸成流线、脸朝下，腿同 kick）
- 备注：同 kick 的肌肉说明。
- 我看过的关键帧角度（`kickfree`）：
  - f0：`t=90 nt=-80 ns=-70 ft=-100 fs=-105 na=90 nf=90 fa=90 ff=90`；膝内角 N170 F175、髋角 N170 F170、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(69,0) sh(34,0) nfoot(-46,12) ffoot(-47,-10) nk(-24,4)
  - f1：`t=90 nt=-100 ns=-105 ft=-80 fs=-70 na=90 nf=90 fa=90 ff=90`；膝内角 N175 F170、髋角 N170 F170、肘内角 N180 F180、肩-上臂夹角 N180 F180；座标 hand N(69,0) sh(34,0) nfoot(-47,-10) ffoot(-46,12) nk(-24,-4)
- 来源：https://www.usaswimming.org/news/2021/10/05/five-freestyle-tips-to-start-your-season；https://blog.goswim.tv/post/freestyle-flutter-from-the-hips

### smithsquat（史密斯深蹲，2026-11-05 补查证）

- 结论：核心要领有 2 个以上**读过原文**的来源一致，去掉未查证。App 要领文字无需改，动图不重渲染。
- Lee 等 2017，Sensors 17(2):299（https://pmc.ncbi.nlm.nih.gov/articles/PMC5336117/ ，全文）：
  「a barbell is horizontally constrained to move up and down while sliding along vertical steel tracks. The machine allows variation in the anterior–posterior foot placement」；
  实验：「At the most posterior position, the ankle was placed directly under the bar」；「The participants performed back squats with their thighs parallel to the floor in the bottom position (i.e., parallel squatting). Their feet were planted straight at the shoulder width」。→ 杠直上直下、脚在杠下到杠前、肩宽站距、蹲到大腿平行。
- Biscarini 等 2011，J Sports Sci 29:457（https://pubmed.ncbi.nlm.nih.gov/21225486/ ，摘要原文经 OpenAlex）：
  「bending the trunk forward, moving the feet forward in front of the knees, and displacing the weight distribution towards the forefoot emphasizes hip and lumbosacral torques, while also reducing knee torque and compressive tibiofemoral and patellofemoral forces」。→ 脚放杠前的理由。
- Cotterman 等 2005，JSCR 19:169（https://pubmed.ncbi.nlm.nih.gov/15705030/ ，摘要原文经 OpenAlex）：「The Smith machine (SM) (vertical motion of bar on fixed path; fixed-form exercise)」，测的是「parallel back squat」。
- Straub & Powers 2024，IJSPT 综述（https://pmc.ncbi.nlm.nih.gov/articles/PMC10987311/ ，全文，泛指深蹲）：「care should be taken to avoid valgus and transverse plane moments at the knee by promoting some degree of toe out」。→ 膝对脚尖、不内扣。
- 仍属通行写法：杠在上斜方肌（来源只写 load on the shoulder）；脚往前「约 8–15 cm」是取 Lee 实验 0／25 cm 两档之间的保守值。
