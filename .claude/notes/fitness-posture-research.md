# 体态查证笔记：深蹲歪一边、高低肩、X 型腿（2026-11-18）

委派问题：用户 YANG「重量深蹲时也会歪一边 而且好像高低肩」，追问「x型腿呢 体态调整也能帮助到？」。
用户每天早上练 40 分钟洗髓功，另跟 App 的力量（每周 3 次）＋有氧计划。本档是 App「体态」功能
（fitness/index.html 的 `SRC`／`PMOVE`／`postStatusHTML`／`POST_WHY`）里每一句事实的出处正本：**App 文案里的事实一律要能在这里找到已读原文的来源**；
查不到的不准写成事实（用户 2026-11-18 对未查证说法不满）。

## 0. 查证方式与标记

- 沙盒挡外站，全部走 CI：`fetch-url.yml` 抓 PubMed E-utilities `efetch.fcgi?db=pubmed&rettype=abstract&retmode=text&id=…`
  （**mode 要用 `html`**：text 模式会把摘要里的「p < 0.05 … >50°」当成标签删掉，整段消失——本次第一轮就这样丢了 9 篇，run 44246548028 作废，
  改 html 重抓 run 44246641802）；搜 PMID 用 `web-lookup.yml` 跑 `esearch.fcgi?…&retmode=json`（一次最多 3 个网址，第 4 个起 NCBI 回 429）。
  网页原文用 `web-lookup.yml`（带关键字）。acefitness／exrx 挡机器人，不用。没有绕过任何防护。
- run 编号：摘要 44246641802、44246800070、（Crossley/Knutson/2D 影像）第三批；网页 44246498844（动作要领）、44246758896（X 型腿、蚌式）、
  44247019283（NHS 脊柱侧弯、SRS、MedlinePlus）、AAOS 脊柱侧弯（最后一批）。
- 标记：【已读摘要】【已读原文】＝CI 抓回原文核对过；【转述】＝只有搜索引擎摘要；【推论】＝我推的；【未查证】＝没拿到。

## 1. 深蹲往一边歪：常见原因与自查

| 说法 | 状态 | 来源 | 原文引句 |
|---|---|---|---|
| 站立左右重量分配不均的人，背蹲时左右地面反作用力也不均、杠倾斜／旋转更大；应先处理再大量训练 | 【已读摘要】 | Sato & Heise 2012，PMID 22228110 | "the unequal WtD group displayed a higher vertical GRF SI score (p < 0.05) and greater degrees of the tilting (p < 0.05) and rotational (p < 0.05) angular bar displacements"；"The unequal WtD captured at the WtD test carried over to the SI score during the back squat test… The lack of postural control to distribute body weight evenly should be treated properly to gain levelness before participating in high volume of resistance training" |
| 即时视觉回馈能减少未受训者深蹲左右重量差 | 【已读摘要】 | McGough 2012，PMID 22158262 | "WBA exists in healthy untrained adults, and these asymmetries can be reduced using real-time visual feedback" |
| 脚踝背屈受限 → 深蹲膝内倒增加（楔形板模拟） | 【已读摘要】 | Macrum 2012，PMID 22100617 | "Altering ankle-dorsiflexion starting position during a double-leg squat resulted in increased knee valgus and MKD" |
| 落地：背屈活动度与膝内倒**无**显著相关（与上一条并列） | 【已读摘要】 | Fong 2011，PMID 21214345 | "All correlations for flexed-knee dorsiflexion ROM and knee-valgus displacement were nonsignificant." |
| 跳远选手深蹲时髋屈曲角与髋力矩左右不同（同一人两侧不对称很常见） | 【已读摘要】 | Kobayashi 2010，PMID 20571445 | "the maximal flexion angle and peak torque at hip showed significant differences between the limbs under all loading conditions" |
| 单侧训练（vs 双侧）减少左右腿差距 | 【已读摘要】 | Gonzalo-Skok 2017，PMID 27140680（22 名青年篮球员） | "only UNI reduced between-limbs asymmetry" |
| 长短脚：90% 的人 X 光量得到差异，平均 5.2 mm；约 20 mm 以上才可能有临床意义 | 【已读摘要】 | Knutson 2005 Part I，PMID 16026625 | "the prevalence of anatomic inequality was found to be 90%, the mean magnitude of anatomic inequality was 5.2 mm (SD 4.1)… does not appear to be clinically significant until the magnitude reaches approximately 20 mm" |
| 疼痛回避造成歪向一边 | 【未查证】（没找到能读的原文；App 不写） | — | — |
| 髋活动度左右不对称造成歪 | 【未查证】（只有机制推论；App 不写成原因） | — | — |

自查（App 用的）：
- **手机拍背面看深蹲**：McGough 研究的是**即时画面回馈**，不是事后回放；「手机拍、回放看」是 App 的做法，效果没有研究——App 文案写明「研究用的是即时画面回馈；手机回放是 App 的做法，效果没有研究」。距离、高度的具体数字没有来源，App 不写。
- **推膝碰墙（weight-bearing lunge test）**：Powden 2015 系统综述（PMID 25704110）【已读摘要】"inter-clinician reliability (ICC = 0.80-0.99) as well as intra-clinician reliability (ICC = 0.65-0.99) of the WBLT is good… average MDC scores of 4.6° or 1.6 cm for inter-clinician and 4.7° or 1.9 cm for intra-clinician"；
  做法与「左右差 >2 cm 当成一个发现」「每 3–4 周重测」：Pabau【已读原文，run 44254390691 重读】"Move the foot farther from the wall in 1 cm increments until the heel lifts or the knee cannot reach. Record the farthest distance at which the knee touched the wall with the heel flat"、"The centimeter method records the distance from the big toe to the wall"、"treat a difference above 2 cm as a finding"、"Re-test every three to four weeks"；
  **Pabau 自己两说**：表格写「Side-to-side difference of 2 cm or more — Asymmetry flag」，正文写「treat a difference above 2 cm as a finding」（对象是术后与回场运动员）。App 取较保守、也是 verifier 指定的「超过 2 cm」（代码 `> 2`，刚好 2.0 不算）；Pabau 另写 MDC 1.4 cm（与 Powden 的 1.6–1.9 cm 不同，App 用 Powden）。
  Prehab Guys【已读原文】也量「how far your big toe is from the wall」；
  Prehab Guys【已读原文】"Make sure your heel stays on the ground"、"The other ideal goal is to have similar ankle range of motion side-to-side"。
  **并列**：Pabau 说 10 cm 以上算正常（转引 Bennell）；Prehab Guys 目标是 5 英寸（约 12.7 cm）。App 不给「正常值」，只比左右。
- **侧桥撑多久**：McGill 1999（PMID 10453772）【已读摘要】"The tests proved reliable, with reliability coefficients of >.97"。App「差 10% 以上算弱侧」是 App 自己的门槛，**没有来源**，文案写明「App 用…来判断」。
- **单腿蹲／下台阶看膝盖**：App 文案引的是 Munro 2012（单腿蹲、落地）与 Lally 2022（明写 "SLS and SD"＝单腿蹲与下台阶都在内），不是 Crossley。Crossley 2011（PMID 21335344）【已读摘要】"Clinical assessment of performance on the single-leg squat task is a reliable tool that may be used to identify people with hip muscle dysfunction"（表现差者髋外展力矩与躯干侧屈力较低）。

## 2. 高低肩：习惯性 vs 结构性、运动能不能改静态姿势、什么时候看医生

| 说法 | 状态 | 来源 | 原文引句 |
|---|---|---|---|
| 高低肩、一边肩胛／肋骨突出、一边髋高是脊柱侧弯的征象 | 【已读原文】 | AAOS OrthoInfo | "Tilted, uneven shoulders, with one shoulder blade protruding more than the other"、"Prominence of the ribs on one side" |
| 前弯测试做法：两脚并拢、膝盖打直、手自然垂下，从背后看两边肋骨 | 【已读原文】 | AAOS OrthoInfo | "your child will bend forward with feet together, knees straight and arms hanging free. The doctor will observe your child from the back, looking for a difference in the shape of the ribs on each side" |
| 肋骨隆起是最明显征象；肩高不对称也是 | 【已读原文】 | SRS | "Rib "hump"… the most visible sign of scoliosis"、"Shoulder height asymmetry is indicated when one shoulder appears higher than the other" |
| 一边肋骨突出、一边肩或髋突出 → 看家庭医生；确诊照 X 光；成年后通常不变、变了要看 | 【已读原文】 | NHS 脊柱侧弯 | "1 shoulder or hip sticking out"、"the ribs sticking out on 1 side"、"See a GP if you think you or your child has scoliosis"、"An X-ray of your back will be carried out"、"tends to stay the same after you stop growing – see a GP if it gets any worse" |
| 背部运动能不能改善侧弯不清楚，但一般运动不必避免——**除非医生另有建议**（App 文案已照原文补上这半句） | 【已读原文，run 44253874372 重读】 | NHS | "It's not clear whether back exercises help improve scoliosis, but general exercise is good for overall health and should not be avoided unless advised by your doctor." |
| 前弯测试准确度：对胸段 ≥20° 比 scoliometer 敏感 | 【已读摘要】 | Côté 1998，PMID 9563110 | "Adam's forward bend test is more sensitive than the Scoliometer in detecting thoracic curves measuring 20 degrees or more" |
| **并列（反面）**：单靠前弯测试会漏 | 【已读摘要】 | Grossman 1995，PMID 7560050 | "Of 954 sixth graders… 123 and 13… were found to be abnormal on scoliometer examination but appeared normal on the Adams test" |
| 学校筛检的阳性预测值低（>10° 为 32.3%） | 【已读摘要】 | Altaf 2017，PMID 28882347 | "The pooled positive predictive values for detecting curves >10° and >20° were 32.3% and 6.5%" |
| 神经异常或明显疼痛时才做 MRI（＝要医生处理的信号） | 【已读原文】 | SRS | "An MRI is usually ordered if your physician finds some subtle neurologic abnormalities on physical examination, or if you have significant pain" |
| **运动改变静态姿势**：单纯拉伸无效；肌力训练对胸椎、颈椎有效（d≈1.04），对腰椎／骨盆无显著效果 | 【已读摘要】 | Warneke 2024 系统综述（23 篇、969 人），PMID 38834878 | "Neither acute (d = 0.01, p = 0.97) nor chronic stretching (d=-0.19, p = 0.16) had an impact on posture… strengthening to be effective in the thoracic and cervical spine (d=-1.04, p = 0.005) but not in the lumbar and lumbopelvic region" |
| 头前伸：运动能改善颅椎角 | 【已读摘要】 | Sheikhhoseini 2018，PMID 30107937 | "Level 1a evidence (strong) indicates exercise training can effectively modify CVA" |
| 上交叉综合征：运动改善头前伸、圆肩、驼背（并列：品质参差，含 Google Scholar 来源） | 【已读摘要】 | Sepehri 2024，PMID 38302926 | "therapeutic exercises were effective in improving forward head, rounded shoulders, and thoracic kyphosis angles" |
| 专门针对「高低肩（肩高不对称）」的运动介入研究 | 【未查证】——esearch 没找到；App 文案写「没找到，所以不承诺练平」 | — | — |
| 「高低肩多数是习惯性」「惯用手那边较低」 | 【未查证】，App 不写 | — | — |

## 3. X 型腿（2026-11-18 coordinator 追加）

**结构性（站着两膝并拢、脚踝分开＝骨头角度，膝外翻）vs 动态膝内倒（深蹲、下台阶、落地时膝盖往内倒＝动作控制）。**

| 说法 | 状态 | 来源 | 原文引句 |
|---|---|---|---|
| 定义：两膝碰在一起、两踝分开 | 【已读原文】 | patient.info | "Knock knees is when your knees touch but your ankles are apart when standing." |
| 到青春期多数人不勉强就能膝、踝都碰在一起 | 【已读原文】 | MedlinePlus | "By puberty, the legs straighten out and most children can stand with the knees and ankles touching (without forcing the position)." |
| 看医生：只有一边、痛或走路困难、成年后才出现 | 【已读原文】 | patient.info | "See a doctor if only one leg is affected, or if there is pain or difficulty walking."、"You develop knock knees as an adult."、"If an adult develops knock knees, it's recommended to see a doctor." |
| 成人可能越来越严重；非手术处理＝降低关节炎风险（体重、体能、少高冲击）；矫正靠截骨手术 | 【已读原文】 | HSS 骨科医院 | "In adults the medial ligaments of the knee can stretch and cause greater deformity."、"The best nonsurgical treatments for patients with knock knees are aimed at reducing other risks of arthritis development in the knee. This includes maintaining a normal body weight, keeping fit while avoiding high impact activities"、"There are two main surgeries to treat knock knees: A distal femoral osteotomy (DFO), or a DFO combined with a high tibial osteotomy" |
| **并列（反面）**：运动可以帮成人「重新对齐」膝盖 | 【已读原文】但**没有附研究**，2017 年旧文 | Healthline | "For older children and adults with genu valgum, a course of physical therapy and exercises can help realign their knees." |
| 儿童 PT「帮他们把腿撑得更直」（对象是儿童、讲的是肌力支撑，不是改骨） | 【已读原文】（2026-11-18 首轮；网址没记下，重抓未成，见第 8 节） | Cleveland Clinic | "A physical therapist will give your child exercises and stretches to strengthen the muscles in their legs. This can help them hold their legs straighter." |
| Healthline：两踝间距 ≥3 英寸算膝外翻 | 【已读原文】（单一网站说法，App 不用这个门槛） | Healthline | "there's a gap of 3 inches or more between their ankles" |
| 成人结构性膝外翻**能否靠运动改骨角** | 【未查证】——没找到任何研究证明能；HSS 只列手术。App 写法：「要改角度只能手术（HSS）；也有健康网站说运动能帮忙对齐，但没有附研究」 | — | — |
| **动态膝内倒能练**：8 周功能性髋外展肌训练（＋常规 PT）使跑者下蹲膝 FPPA 与骨盆下坠变小（RCT，40 人） | 【已读摘要】 | Lashien 2024，PMID 39468623 | "8 weeks of functional hip abductor strength training, combined with traditional physical therapy, effectively improves lower extremity kinematics in runners with MTSS by reducing dynamic knee valgus and contralateral pelvic drop" |
| 系统综述（35 篇、1095 人）：膝内倒明显者，下肢肌力＋膝位置控制训练可能减少膝内倒；无对线问题者，技术训练与核心最有效 | 【已读摘要】 | Cömert & Gruber 2025，PMID 39997983 | "Combining lower extremity strengthening with knee position control training may reduce knee valgus in individuals with increased knee valgus." |
| 热身计划（STOP-X，8 周）改善有膝内倒的女篮球员落地 | 【已读摘要】（准实验，不是 RCT） | Rostami 2025，PMID 40745375 | "Implementing the warm-up injury prevention program significantly improves jump-landing pattern" |
| 效果量的具体数字（例如几度） | Lashien 摘要没给度数；Cömert 只给定性结论 → App 不写度数 | — | — |
| 手机 2D 拍膝盖角度：可重复，但不能取代 3D | 【已读摘要】 | Munro 2012（PMID 22104115）；Lally 2022（PMID 34996031）；Lopes 2018（PMID 29895235） | Munro："between-days ICCs were good to excellent, ranging from .72 to .91"；Lally："Knee frontal plane projection angle is reliable for analyzing the SLS and SD; however, it does not serve as a substitute for 3D motion analysis"；Lopes："The current evidence does not support the use of 2-D video analysis… when accurate measures are required" |
| 蚌式 vs 侧躺外展哪个练臀中肌好：**两说** | 【已读摘要】 | Sidorkewicz 2014（PMID 25246373）："Both exercises remained gluteus medius-dominant… the clamshell may be the preferred rehabilitative exercise… when minimal tensor fascae latae muscle activation is desired"；McBeth 2012（PMID 22488226）："The ABD exercise is preferred if targeted activation of the GMed is a goal" | — |

**跟深蹲歪、高低肩的关系**：【推论】都是「左右／额状面的控制」问题，评估方式相同（手机正面／背面拍、单侧测试）；
但**站着的 X 型腿**是骨头角度，跟深蹲歪、高低肩没有已查证的因果关系（未找到研究）——App 不写因果。
脚踝背屈不足同时与深蹲膝内倒有关（Macrum，见第 1 节；Fong 的落地研究则无关，两说并列）。

## 4. 动作与剂量（App 体态小课用）

动作要领逐条已读原文，引句写在 `tools/lib/fitness-anim-spec.json` 各动作的 `note`：
90/90（Cleveland Clinic＋HSS）、半跪髋屈肌（HSS＋Motra＋Physitrack）、推膝碰墙（Physitrack＋Pabau＋Prehab Guys）、
靠墙滑臂（Catalyst Athletics＋Prehab Guys）、侧桥（Kent and Medway NHS＋University of Calgary）、
蚌式（Physitrack 两页）、单手提哑铃原地踏步（Harvard Health＋kettlebellsworkouts＋Rehab Hero）、分腿蹲（App 原有）。

| 剂量 | 状态 | 来源 |
|---|---|---|
| 拉伸每侧 30 秒 | 【已读原文】 | HSS "Hold each stretch for 30 seconds on each side"；Cleveland 90/90 "20 to 60 seconds" |
| 侧桥每侧 20–30 秒 | 【已读原文】 | Calgary "Work up to 20-30 second holds each side"（KMPT 另写 5–10 秒 × 8–10 次——两说，App 取 Calgary） |
| 提重踏步每侧 20–30 秒 | 【已读原文】 | kettlebellsworkouts "20–30 seconds per side" |
| 拉伸长期能增加活动度（中等效果）；静态／PNF 比弹震好；**量、强度、频率都不影响效果** | 【已读摘要，run 44253989012 重读】 | Konrad 2024（77 篇），PMID 37301370："stretch training can increase ROM with a moderate effect"、"proprioceptive neuromuscular facilitation and static stretching produced greater ROM than did ballistic/dynamic stretching"、"neither volume, intensity, nor frequency of stretching were found to play a significant role in ROM yields" |
| 负重肌力训练也能增加活动度（与拉伸无差） | 【已读摘要】 | Alizadeh 2023，PMID 36622555："Resistance training increased range of motion (effect size [ES] = 0.73…)… no significant range of motion improvement with resistance training using only body mass" |
| 每周 3–5 次 | **App 的安排**，没有来源；文案写明「这是 App 的安排」并附 Konrad「做多做少影响不大」 | — |
| 弱侧多一组 | **App 的安排**（依据 Gonzalo-Skok 的单侧训练减少左右差；「多一组」本身没有研究） | — |
| 靠墙滑臂 8–10 次、蚌式 12–15 次 | 【转述】／App 安排（Prehab 的 1–3×8–10、Merck 的 3×10 只在搜索摘要里） | — |

## 5. 多久重测、合理期待

- 每 3–4 周重测推膝碰墙（Pabau【已读原文】）；Pabau 另一处写物理治疗「every four to six weeks」——两说，App 用 4 周（28 天）提醒。
- 推膝碰墙前后差 1.6–1.9 cm 以内可能是测量误差（Powden【已读摘要】）。
- 研究的介入期：Lashien 8 周（【已读摘要】）；其他研究的周数本次没有逐篇核对 → App 只举 Lashien。
- 静态姿势照片变化慢、不一定变（Warneke：拉伸无效、肌力只对胸颈有效）；脊柱侧弯运动效果不明（NHS）。
- 「几周内一定看到」之类的承诺：【未查证】，App 不写（2026-11-18 verifier 抓到 POST_WHY 标题「关节活动度：几周就可能看得到」——已删，改「规律拉伸能增加」）。
- 照片／静态姿势「变得很慢」、「左右测试的数字比较早看得到变化」：**没有来源讲速度**——已删，改写「照片多久看得出变化，我们没找到研究；App 的预期是看不出变化也正常」。

## 6. App 落地对照（改文案前先看这里）

- `SRC`：App 里每个来源链接的清单，都在上面表格里。
- 红旗（`redList()`）：前弯一边隆起（NHS／SRS／AAOS）、痛（Cleveland 90/90 的「pain or a pinching feeling… stop… seek out some advice」＋patient.info；「拉完痛不退」没有直接来源→文案标「App 的保守判断」）、
  麻（SRS 只说医生发现神经异常时会安排 MRI，不是「发麻就要看医生」→文案标「App 的保守判断」）、越来越明显（NHS＋HSS）、X 型腿只有一边或成年后才出现（patient.info）。
- 红旗确认（`post.ack`＋`post.ackFor`）：确认只对当下那几个红旗有效；红旗清单一变（问卷点击时比对 `redSig()`）就作废，`acked()` 也会对旧资料再核一次。
- 高低肩但前弯测试「还没测」或没回答（`needBend()`）：挡小课、提示先做前弯测试（AAOS 把 "Tilted, uneven shoulders" 列为征象）——这是 App 的保守判断。
- 有任何红旗（就算已确认）或 `needBend()`：力量日的体态提醒（`postCueHTML`）一律不出。
- 门槛：推膝碰墙差**超过** 2 cm（Pabau "above 2 cm"；代码 `> 2`）；侧桥差 ≥10%（App 自定、文案已标明）。
- 「App 的安排／做法／推论／保守判断」标签：次数组数（8–10、12–15、8 次、多一组、每周 3–5 次）、手机回放、手机胸口高度、穿贴身衣服、
  「往 X 偏就先减重」、「X 脚先做」、高低肩前弯正常后「先当成一般体态」、「所以也练推膝碰墙」（并列 Fong 2011 落地研究无关联）。
- 文案守门：`tools/check-fitness.mjs` 第 16 段末的 BANNED／need 清单（verifier 判定说过头或没来源的句子不准回来；该有的界线标签必须在）。

## 7. 来源网址总表（App 里每个外链与本档每个网页来源）

| 来源 | 网址 | 用在 |
|---|---|---|
| NHS 脊柱侧弯 | https://www.nhs.uk/conditions/scoliosis/ | 红旗、POST_WHY |
| 脊柱侧弯研究学会 SRS | https://www.srs.org/patients/conditions/scoliosis/idiopathic-scoliosis | 红旗 |
| AAOS OrthoInfo 脊柱侧弯 | https://orthoinfo.aaos.org/en/diseases--conditions/idiopathic-scoliosis-in-children-and-adolescents/ | 前弯测试、高低肩 |
| patient.info X 型腿 | https://patient.info/bones-joints-muscles/knock-knees | 红旗 |
| HSS 成人 X 型腿 | https://www.hss.edu/health-library/conditions-and-treatments/surgery-knock-knee-correction-adults | X 型腿 |
| HSS 髋屈肌拉伸（90/90、半跪） | https://www.hss.edu/health-library/move-better/hip-flexor-stretch | 动作要点、30 秒 |
| Healthline 膝外翻 | https://www.healthline.com/health/genu-valgum | X 型腿（反面并列） |
| MedlinePlus X 型腿 | https://medlineplus.gov/ency/article/001263.htm | 问卷 |
| Cleveland Clinic 90/90 | https://health.clevelandclinic.org/90-90-stretch/ | 动作要点、痛就停 |
| Cleveland Clinic X 型腿（儿童 PT） | 网址待补（见第 8 节） | 只在本档并列，App 不引用 |
| Pabau 推膝碰墙 | https://pabau.com/blog/knee-to-wall-test/ | 测试做法、门槛、重测 |
| Prehab Guys 推膝碰墙 | https://library.theprehabguys.com/vimeo-video/knee-to-wall-ankle-dorsiflexion-assessment | 测试做法 |
| Prehab Guys 靠墙滑臂 | https://library.theprehabguys.com/vimeo-video/wall-slide/ | 动作要点 |
| Physitrack 半跪推膝 | https://ca.physitrack.com/home-exercise-video/ankle-dorsiflexion-rom-in-half-kneeling | 动作要点 |
| Physitrack 髋屈肌 | https://ca.physitrack.com/home-exercise-video/hip-flexor-kneeling-stretch | 动作要点 |
| Physitrack 蚌式 | https://ca.physitrack.com/home-exercise-video/side-lying-clam | 动作要点 |
| Physitrack 弹力带蚌式 | https://us.physitrack.com/home-exercise-video/resisted-clam-shells | 动作要点 |
| Motra 半跪髋屈肌 | https://www.motra.com/exercises/halfKneelingHipFlexorStretch | 动作要点 |
| Catalyst Athletics 靠墙滑臂 | https://www.catalystathletics.com/exercise/783/Wall-Slide/ | 动作要点 |
| Kent and Medway NHS 侧桥 | https://www.kentmedwaymentalhealth.nhs.uk/pdf-documents/coronavirus-documents/coronavirus-page-documents/physiotherapy-strength-exercise-guide/introduction/elbow-plank-and-side-plank/ | 动作要点 |
| University of Calgary 侧桥 | https://live-ucalgary.ucalgary.ca/shred-injuries/all-sports/soccer/side-plank | 20–30 秒 |
| Harvard Health 核心 | https://www.health.harvard.edu/staying-healthy/how-to-build-a-better-core | 提重踏步 |
| kettlebellsworkouts 提重 | https://kettlebellsworkouts.com/kettlebell-suitcase-carry/ | 提重踏步、20–30 秒 |
| Rehab Hero 提重走 | https://www.rehabhero.ca/exercise/suitcase-carry | 提重踏步 |
| PubMed 各篇 | https://pubmed.ncbi.nlm.nih.gov/＜PMID＞/（PMID 见上面各表） | 研究 |

## 8. 查证状态（2026-11-18 verifier 退件后重抓，CI 通道）

| 来源 | 重抓 run | 结果 |
|---|---|---|
| Sato & Heise，PMID 22228110 | fetch-url 44253869901（efetch，html 模式） | ✔ 引句一字不差；另确认摘要有 "greater degrees of the tilting… and rotational… angular bar displacements" ——所以「杠倾斜／旋转较大」有来源，文案改成「杠的倾斜和旋转也比较大」 |
| Knutson，PMID 16026625 | 同上 | ✔ 90%、5.2 mm、约 20 mm 两句都在 |
| Powden，PMID 25704110 | 同上 | ✔ ICC 与 MDC 1.6／1.9 cm 都在 |
| Warneke，PMID 38834878 | 同上 | ✔ |
| Lashien，PMID 39468623 | 同上 | ✔（40 位娱乐跑者、MTSS） |
| Cömert，PMID 39997983 | 同上 | ✔ |
| McGough，PMID 22158262 | 同上 | ✔（是 real-time visual feedback——文案已改，不再暗示回放有效） |
| Macrum，PMID 22100617 | 同上 | ✔ |
| Fong，PMID 21214345 | 同上 | ✔（现已并列进 App 文案） |
| Grossman，PMID 7560050 | 同上 | ✔（现已进 App：前弯测试看起来正常也不能完全排除） |
| Altaf，PMID 28882347 | 同上 | ✔（只在本档；讲的是阳性预测值低＝误报多，不是漏报，所以 App 不拿来支持「正常也不能排除」） |
| Crossley 21335344、Konrad 37301370、Munro 22104115、Lally 34996031、Gonzalo-Skok 27140680、Alizadeh 36622555 | fetch-url 44253989012 | ✔ 全部引句都在；Konrad 另确认「静态／PNF 比弹震／动态拉伸好」原句；Lally 明写 SLS 与 SD（下台阶）——问卷保留下台阶、加单腿蹲 |
| NHS 脊柱侧弯 | web-lookup 44253874372 | ✔ 原句结尾确实是 "should not be avoided unless advised by your doctor"——App 原本漏了后半句，已补 |
| HSS 成人 X 型腿 | web-lookup 44253983734（旧网址 hss.edu/conditions_knock-knees.asp 404，用 App 里的新网址） | ✔ "In adults the medial ligaments of the knee can stretch and cause greater deformity"、非手术处理、两种截骨手术都在；HSS 没写「运动改不了」——App 原本「运动改不了，要改只能手术」比原文说得满，已改成「没找到运动能改骨头角度的研究；HSS 列出的矫正方式是截骨手术」 |
| AAOS | web-lookup 44253983734 | ✔ "Tilted, uneven shoulders…"、前弯测试做法；**原文没提「穿贴身衣服」**——已从前弯测试删掉（照片那里保留，标「App 的做法」） |
| Pabau、Prehab Guys、patient.info | web-lookup 44254390691 | ✔ 1 cm 逐步后移、量大脚趾到墙、above 2 cm、每 3–4 周重测、patient.info 看医生三条；Pabau 门槛自己两说（见第 1 节） |
| SRS、MedlinePlus | web-lookup 44254804102 | ✔ SRS 肋骨隆起、肩高不对称、MRI 那句都在；MedlinePlus「By puberty…」在 |
| Cleveland Clinic X 型腿（儿童 PT） | web-lookup 44254804102 | ✗ 原始网址当初没记下；猜的 my.clevelandclinic.org/health/diseases/22097-knock-knees 回 404。**该行降级为「网址待补」**；App 没有引用它，所以不影响任何文案 |
| Côté，PMID 9563110 | fetch-url 44285195902（efetch，html 模式，2026-11-18 第三轮） | ✔ "Adam's forward bend test is more sensitive than the Scoliometer in detecting thoracic curves measuring 20 degrees or more" 一字不差；结论原句是 "it remains the best noninvasive clinical test"——原文没说「标准方法」，App 改写成「医生做脊柱侧弯检查时会用的方法」（比原文弱，不比原文满） |
| McGill，PMID 10453772 | 同上 fetch-url 44285195902 | ✔ "The tests proved reliable, with reliability coefficients of >.97" 在；「差 10% 以上算弱侧」仍是 App 自己的门槛 |
| Healthline 膝外翻 | web-lookup 44285202059 | ✔ "For older children and adults with genu valgum, a course of physical therapy and exercises can help realign their knees" 与 "a gap of 3 inches or more between their ankles" 都在 |
| Cleveland Clinic 90/90 | web-lookup 44285207817 | ✔ 两膝 90°、"Hold this pose for 20 to 60 seconds"、"if you're having pain or a pinching feeling during the stretch or discomfort that lingers afterward, stop doing the stretch and seek out some advice" 都在 |
| 动作要点（Physitrack、Motra、Catalyst、Kent and Medway、Calgary、Harvard、kettlebellsworkouts、Rehab Hero、HSS 髋屈肌、Cleveland 90/90） | 未重抓，首轮已读（run 44246498844／44246758896）；引句在 `tools/lib/fitness-anim-spec.json` 各动作 `note`（Cleveland 90/90 已于上一行单独重抓） | 本轮没重抓；verifier 点名的两句没有原文：半跪髋屈肌「大腿前侧上方有拉的感觉就停住」、靠墙滑臂「一要耸肩或拱腰…就是上限」——**都已从 App 删掉** |


**第三轮 verifier 复查的 6 处小修（2026-11-18）**：「变化慢」删（Warneke 只说拉伸无效／肌力训练对胸椎颈部有改善，没讲快慢）；
前弯测试「标准方法」→「医生做脊柱侧弯检查时会用的方法」、「自己在家看只能算提醒」标 App 的保守判断；
膝内倒「可以练」→「有研究显示可能练得改善（研究对象是跑者）」（Lashien 是跑者，Cömert 是 "may reduce"）；
分腿蹲「膝盖对准第二根脚趾、不往内倒」标 App 的安排（Pabau 那句是推膝碰墙的，分腿蹲没抓到原文；推膝碰墙那句保留不标）；
靠墙滑臂「轻轻压墙」→「压墙」（Prehab Guys 原文 "Push into the wall"，没说轻轻）；蚌式弹力带「加难度」标 App 的安排
（Physitrack 只写 "place a band above your knees"）。这些字都进了 check-fitness 第 16 段的 BANNED／need 清单。

## 头前伸（脖子前倾）＋日常小习惯（2026-11-19 查证）

委派问题：用户（男 40 岁 72 kg，已知高低肩、深蹲歪一边）又说「脖子前倾」，问 (1) 体态训练能不能帮到头前伸，
(2) 平时要养成哪些小习惯。本档格式照 `.claude/notes/fitness-posture-research.md`：**每一句事实都附来源＋已读原文引句＋CI run 编号**，
查不到的写【未查证】，互相矛盾的并列。（2026-11-19 由 scratchpad 研究稿搬进本档；App 文案依这节查证。）

> **PMID 更正**：委派里给的 Sheikhhoseini 2018 PMID 29776552 是错的（efetch 回来是整形外科社论），正确是 **30107937**。App 一律用 30107937。

### 0. 查证方式与标记

- 沙盒挡外站，全部走 CI（ref `main`）：PubMed `efetch.fcgi?…&rettype=abstract&retmode=text`（fetch-url.yml，mode `html`）；
  `esearch`／网页原文用 `web-lookup.yml`（带关键字）。没有绕过任何防护。WebSearch 只用来**找** PMID／网址，不当来源。
- run 编号：
  - esearch：44453676374（头前伸×颈痛综述、头前伸×运动综述、Richards）、44453682441（手机测 CVA、枕头、深颈屈肌）、
    44453757540（背包、低头族、久坐打断）、44453975120（墙测、肩胛／胸肌 RCT、前瞻研究）
  - 摘要：**44453703080**（Mahmoud、Sheikhhoseini、Warneke、Hansraj、Paluch、Diaz 2017、Dunstan）、
    **44453749152**（Javdaneh、Saini、Szczygieł、Liang、Szikszay、Andias、Norasteh、Richards 2016、Gallego-Izquierdo、Aafreen、Ghosh、Chun-Yiu、Khosrokiani）、
    **44453946939**（Bettany-Saltikov、Parry Cochrane、Hoe Cochrane、Karbalaeimahdi、Tatsios）、
    **44454134414**（Correia、Richards 2021、Bertozzi、Diaz 2019、Nazwar、Anwar）
  - 网页：44453692763（NHS 颈痛、OSHA 屏幕）、44453699210（HSE 姿势）、44453811715（CUH 颈部运动、NHS 颈痛、HSE 休息）、
    44453815447＋44453926108（Physitrack／Rehab Hero 胸椎伸展、Physitrack 收下巴）、44453931182（NHS 颈椎病、Versus Arthritis）、
    44453967138（Hansraj PubMed 页／NPR）、44454087060（NHS 成人运动指南）
- 标记：【已读摘要】【已读原文】＝CI 抓回原文核对过；【转述】＝只有搜索引擎摘要；【推论】＝我推的；【未查证】＝没拿到。
- **委派里给的 PMID 29776552 是错的**：efetch 回来是整形外科社论「EURAPS Editorial: BIA-ALCL, a brief overview」（run 44453703080）。
  Sheikhhoseini 2018 正确 PMID 是 **30107937**（与旧笔记一致）。

### A. 头前伸是什么、怎么自查、什么时候看医生

| 说法 | 状态 | 来源 | 原文引句 |
|---|---|---|---|
| 头前伸是矢状面最常见的颈部姿势偏差，几乎所有人群都有、程度不同 | 【已读摘要】 | Mahmoud 2019，PMID 31773477 | "Forward head posture (FHP) is the most common cervical postural fault in the sagittal plane that is found with different severity levels in almost all populations." |
| 颅椎角（CVA）的量法：耳屏（tragus）与第七颈椎（C7）贴标记、侧面拍照量角 | 【已读摘要】 | Gallego-Izquierdo 2020，PMID 32911612 | "evaluated in the standing position with markers on the tragus and cutaneous prominence of seventh cervical vertebra (C7)" |
| 手机 App 量 CVA：信度好；**但最小可侦测变化约 5°**（量两次差 5° 以内可能只是误差） | 【已读摘要】 | Gallego-Izquierdo 2020，PMID 32911612（44 人，量的人是两位受训物理治疗师） | "Intra-rater reliability … intraclass correlation coefficient of 0.88… The minimum detectable change was 4.96° for intra-rater and 5.52° for inter-rater reliability." |
| 并列：另一款 App（Surgimap）MDC 只有 1.3–1.7°；**站着量比坐着量好**，坐姿 CVA 明显较小 | 【已读摘要】 | Aafreen 2023，PMID 37810069（90 名颈痛者） | "CVA measurement in the sitting position was significantly lower than in the standing position"、"The minimum detectable change (MDC) values ranged from 1.3 to 1.733"、"standing posture was found to be better than sitting posture while measuring the CVA" |
| 系统综述：手机照相 App 量 CVA，合并 ICC 再测 0.904、不同人量 0.889 | 【已读摘要】 | Karbalaeimahdi 2025，PMID 41398198（29 篇、1910 人） | "The pooled ICCs demonstrated excellent test-retest reliability (ICC = 0.904) and inter-rater reliability (ICC = 0.889) for the craniovertebral angle"；限制："heterogeneity in methods, small sample sizes, and inconsistent reporting" |
| **「几度以下算头前伸」没有统一门槛** | 【已读摘要】 | Norasteh 2025，PMID 40966220 | "diagnostic inconsistencies, such as variations in craniovertebral angle thresholds used to define FHP" → **App 不给正常值，只跟自己比、且变化 <5° 不当真**【推论，依 Gallego MDC】 |
| 网上常说的「CVA <50°/53° 算头前伸」 | 【转述】（只在 WebSearch 摘要看到，没读到原文）→ App 不用 | — | — |
| 靠墙站测试（后脑勺碰不碰得到墙）用来判断头前伸 | 【未查证】——esearch「occiput-to-wall」49 篇多是强直性脊柱炎／驼背量法，没读到用于一般人头前伸的信度或门槛；App 若用，只能写「App 的做法」 | — | — |
| 研究用的标记都是物理治疗师贴的；**自己在家拍侧面照**的准确度 | 【未查证】【推论】：以上研究都不是本人自拍，App 只能写「研究是由治疗师贴点量的，自己拍只当参考」 | — | — |

**红旗（看医生）**：

| 说法 | 状态 | 来源 | 原文引句 |
|---|---|---|---|
| 颈痛几周不好、或伴手臂发麻／发冷 → 看 GP；睡低而硬的枕头、别趴睡、别长时间维持同一姿势 | 【已读原文】 | NHS 颈痛 https://www.nhs.uk/conditions/neck-pain/ | "neck pain or stiffness does not go away after a few weeks"、"you have other symptoms, like pins and needles or a cold arm – this could be something more serious"、"use a low, firm pillow"、"do not keep your neck in the same position for a long time – for example, when sitting at a desk"、"do not sleep on your front" |
| 急：突然剧痛或快速加重、手脚沉重无力、手臂刺麻伴颈／臂痛、两肩胛之间痛 → 尽快 GP／111；**走路出新问题、大小便失禁、突然手不协调（扣扣子）→ 999** | 【已读原文】 | NHS 颈椎病 https://www.nhs.uk/conditions/cervical-spondylosis/ | "Ask for an urgent GP appointment or get help from NHS 111 if you have: … severe neck pain that starts suddenly, or pain that is getting worse quickly / heaviness or weakness in your arms or legs / pins and needles in an arm, as well as pain in your neck or arm / pain between your shoulder blades"；"Call 999 if you have any of these: new problems walking / loss of bladder or bowel control / sudden lack of co-ordination – for example, with tasks like buttoning a shirt" |
| 手脚痛、刺麻、麻木或无力 → 找专业人员；突然颈僵＋两手举不过头 | 【已读原文】 | Versus Arthritis 颈痛 https://versusarthritis.org/about-arthritis/conditions/neck-pain/ | "have pain, tingling, numbness or weakness in your arms or legs"、"suddenly develop neck stiffness along with difficulty lifting both arms above your head" |
| 做颈部伸展时头晕就停 | 【已读原文】 | CUH 颈部运动 https://www.cuh.nhs.uk/patient-information/neck-exercises-and-advice/ | "Stop this exercise if dizziness occurs." |

### B. 运动能不能改善头前伸（证据）

| 说法 | 状态 | 来源 | 原文引句 |
|---|---|---|---|
| 运动能有效改善 CVA（强证据）、中度改善疼痛；**但头前伸与疼痛、以及两者一起改善的关系仍未确立** | 【已读摘要】 | Sheikhhoseini 2018，PMID 30107937（7 篇 RCT、627 人） | "Level 1a evidence (strong) indicates exercise training can effectively modify CVA, and level 1b evidence (moderate) indicates exercise may improve pain but not CA"；"The precise nature of the relationship between FHP and musculoskeletal pain, and improvements in both after therapeutic exercise, remains to be established." 注意：效果用的是 odds ratio「6.7 (CI = 2.53-17.9)」，不是度数 |
| 健康人：**拉伸不改变姿势；肌力训练对胸椎、颈椎有效（d≈1.04）**，腰骨盆无效 | 【已读摘要】 | Warneke 2024，PMID 38834878（23 篇、969 人） | "Neither acute (d = 0.01, p = 0.97) nor chronic stretching (d=-0.19, p = 0.16) had an impact on posture"、"strengthening to be effective in the thoracic and cervical spine (d=-1.04, p = 0.005)"、"Moderate-certainty evidence does not support the use of stretching as a treatment of muscle imbalance" |
| 慢性颈痛者做颅颈屈肌（收下巴类）训练：疼痛中到大幅改善、CVA 中度改善（SMD 0.51）；异质性大、结论属提示性 | 【已读摘要】 | Javdaneh 2026，PMID 42348285（25 篇 RCT、1166 人） | "CCF exercises produced a moderate-to-large reduction in pain (SMD: -0.97)"、"CVA moderate improvement (SMD: 0.51)"、"due to substantial heterogeneity, variable risk of bias, and diverse protocols, findings are suggestive rather than definitive" |
| 颈稳定训练（12 篇 RCT）：减痛、改善功能与头前伸；6–8 周最有效 | 【已读摘要】 | Saini 2025，PMID 40286070 | "CSEs significantly reduce pain… and correct postural abnormalities such as forward head posture"、"Intervention duration of 6-8 weeks was most effective." |
| **并列（反面）**：一篇综述的合并结果，矫正运动 vs 常规运动改善头前伸风险差 0.00、训练 vs 不治疗 0.09（CI 跨 0） | 【已读摘要】（期刊较弱、结论与数字不一致） | Nazwar 2024，PMID 39483836 | "corrective exercise and conventional exercise in improving forward head posture risk difference 0.00 (-0.09, 0.09)"、"training and no treatment showed risk difference 0.09 (-0.01, 0.20)" |
| 并列：小型 RCT 深颈屈肌训练 4 周，CVA 没变（活动度与耐力有变） | 【转述】（Kang 2015，PMC4668167，只看到搜索摘要） | — | — |
| 无症状头前伸者的颈部本体感觉：稳定训练「可能」改善 | 【已读摘要】 | Norasteh 2025，PMID 40966220（9 篇 RCT） | "cervical stabilization exercises… may improve cervical proprioception" |
| 上交叉综合征：运动改善头前伸、圆肩、驼背 | 【已读摘要】（旧笔记已收，未重读） | Sepehri 2024，PMID 38302926 | 见 `.claude/notes/fitness-posture-research.md` 第 2 节 |
| 具体哪种组合最好（深颈屈肌 vs 肩胛后缩肌力 vs 胸肌拉伸 vs 胸椎伸展）、各自剂量与效果量 | 【未查证】——本轮只读到上面的综述层级；肩胛／胸肌 RCT 的 esearch 有 8 篇（run 44453975120）没逐篇读。依 Warneke：**胸肌拉伸对「姿势」本身不会有效**，只能当舒服／活动度用 | — | — |
| CVA 变化与疼痛变化是否相关 | 【已读摘要】只能引 Sheikhhoseini 的「remains to be established」；**没找到直接证明两者同步的研究** | — | — |

**剂量（收下巴，两说并列）**：

| 说法 | 状态 | 来源 |
|---|---|---|
| 每天至少 2 次、每次 10–15 下、每下停 10–15 秒 | 【已读原文】（商业平台 FAQ，非研究） | Physitrack https://www.physitrack.com/fi/exercise-library/how-to-perform-the-chin-tuck-exercise-exercise："at least twice a day, for 10-15 repetitions each time"、"The recommended amount of time to hold the chin tuck position is 10-15 seconds." |
| NHS 医院单张：停留秒数、次数**留空由治疗师填** | 【已读原文】 | CUH："Hold at the end position and feel the stretch in your neck. Repeat ___ times." |
| WWL NHS 单张：停 1–2 秒 ×10 次；Calderdale 单张：停 5–10 秒 | 【转述】（PDF 没抓成） | — |
| 研究里的介入期 6–8 周 | 【已读摘要】 | Saini 2025（上表） |

### C. 头前伸和颈痛真的有关吗？（两边并列）

**支持有关**：

| 说法 | 状态 | 来源 | 原文引句 |
|---|---|---|---|
| 成人／老人：颈痛者头前伸较明显，头前伸与疼痛强度、失能相关（r≈−0.55、−0.42）；**青少年没有关联**；年龄是重要干扰因素 | 【已读摘要】 | Mahmoud 2019，PMID 31773477（15 篇**横断面**研究） | "adults with neck pain show increased FHP when compared to asymptomatic adults and that FHP is significantly correlated with neck pain measures in adults and older adults. No association was found between FHP and most of neck pain measures in adolescents."、"age played an important role as a confounding factor" |
| 紧张型头痛者头前伸较多（低信心） | 【已读摘要】 | Liang 2019，PMID 31054485 | "participants with TTH had greater forward head posture (FHP) (MD = -6.18°…)"、"levels of confidence in findings were low" |
| 头位置影响肌肉活动、本体感觉、呼吸、颈痛（综述，作者说法较强） | 【已读摘要】 | Szczygieł 2020，PMID 32713947（16 篇） | "abnormal head position changes affect muscle activity, proprioception, the pattern of breathing and neck pain" |

**不支持／反面**：

| 说法 | 状态 | 来源 | 原文引句 |
|---|---|---|---|
| 1108 名 17 岁：四种坐姿群组之间颈痛、头痛机率无差异 | 【已读摘要】 | Richards 2016，PMID 27174256 | "There was no significant difference in the odds of neck pain or headache across the clusters"、"challenges widely held beliefs about the role of posture in adolescent neck pain"；限制："may not be applicable to adults" |
| 同一群人追到 22 岁：17 岁坐姿**不是**男性持续颈痛的风险因子；女性较放松（含头前伸）的坐姿反而较少颈痛 | 【已读摘要】 | Richards 2021，PMID 33444448（前瞻） | "sitting neck posture at 17 was not a risk factor for PNP at 22 years of age in males, whereas in females, more relaxed postures (slumped thorax/forward head and Intermediate postures) were protective"、"generic public health messages to sit up straight to prevent neck pain needs rethinking" |
| 18–65 岁、追踪 12 个月：滑手机时低头角度**不是**颈痛风险因子；睡眠差、活动量不足才是 | 【已读摘要】 | Correia 2025，PMID 40845624（457 人、无颈痛起始） | "Cervical flexion posture during smartphone use was not a risk factor for NP or frequency of NP, but low sleep quality and insufficient levels of physical activity were." |
| 大学生：滑手机姿势与时间和颈痛无关 | 【已读摘要】 | Bertozzi 2021，PMID 33992248（横断面） | "the use of smartphones was not correlated with neck pain and disability" |
| 青少年：有无颈痛者头前伸无差异 | 【已读摘要】 | Andias 2019，PMID 30629325 | "those with NP showed no differences in cervicothoracic posture or FHP" |

**我的读法**【推论】：成人横断面研究看到「有关」，但横断面分不出谁因谁果；两个前瞻研究（Richards 2021、Correia 2025）都**没**看到姿势预测日后颈痛，
反而睡眠与活动量有关。对 40 岁男性用户可以说：「头前伸和颈痛在成人身上常一起出现，但没有证据证明前倾会『造成』颈痛；练它主要是为了颈部和上背更有力、更舒服，不保证照片里的角度一定变。」

### D. 日常小习惯（逐条，诚实标证据强度）

| 习惯 | 状态 | 来源 | 原文引句／说明 |
|---|---|---|---|
| **久坐要打断**（官方建议） | 【已读原文】 | NHS 成人运动指南 https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/ | "reduce time spent sitting or lying down and break up long periods of not moving with some activity" |
| 屏幕工作：短而频繁的休息，比长而少的好（每小时 5–10 分钟优于每 2 小时 20 分钟）；休息要起身走动或至少伸展换姿势 | 【已读原文】 | HSE https://www.hse.gov.uk/msd/dse/work-routine.htm | "There is no legal guidance about how long and how often breaks should be for DSE work."、"Take short breaks often, rather than longer ones less often. For example 5 to 10 minutes every hour is better than 20 minutes every 2 hours."、"Breaks or changes of activity should allow users to get up from their workstations and move around, or at least stretch and change posture." |
| 「每 30 分钟起来一次」 | 【未查证】——没找到用 30 分钟当建议的官方原文。研究里：Dunstan 每 20 分钟走 2 分钟降餐后血糖（代谢指标，不是颈）；Diaz 2017 久坐片段越长死亡风险越高 | Dunstan 2012，PMID 22374636："seated with 2-min bouts of light-intensity walking every 20 min… Interrupting sitting time with short bouts of light- or moderate-intensity walking lowers postprandial glucose and insulin levels in overweight/obese adults"；Diaz 2017，PMID 28892811："Both the total volume of sedentary time and its accrual in prolonged, uninterrupted bouts are associated with all-cause mortality" |
| 并列：只把久坐切短、**不换成活动**，没好处——要真的动 | 【已读摘要】 | Diaz 2019，PMID 30551177 | "short sedentary bouts still carry mortality risk and are not a healthful alternative to prolonged sedentary bouts. Instead, physical activity of any intensity is needed" |
| **对颈／肩症状**：站坐两用桌等增加站立的措施，没证明减少肌肉骨骼症状；额外休息对上肢不适只有极低品质证据 | 【已读摘要】 | Parry 2019 Cochrane，PMID 31742666；Hoe 2018 Cochrane，PMID 30350850 | Parry："limited evidence does not show that interventions to increase standing or walking in the workplace reduced musculoskeletal symptoms among sedentary workers"；Hoe："For organisational interventions, in the form of supplementary breaks, there is very low-quality evidence of an effect on upper limb discomfort." |
| **屏幕高度**：屏幕顶端与眼同高或略低；中心约在水平视线下 15–20°；距离 50–100 cm | 【已读原文】 | OSHA https://www.osha.gov/etools/computer-workstations/components/monitors | "Place monitor so top line of screen is at or below eye level."、"The top of the monitor should be at or slightly below eye level. The center of the computer monitor should normally be located 15 to 20 degrees below horizontal eye level"、"between 20 and 40 inches (50 and 100 cm)" |
| 同上：屏幕顶与眼同高、约一臂距离；笔电长时间用要外接键鼠把屏幕垫高 | 【已读原文】 | HSE https://www.hse.gov.uk/msd/dse/good-posture.htm | "Top of screen level with eyes, about an arm's length away"、"Keyboard and mouse separate from the laptop so screen can be elevated on a laptop riser or similar" |
| 屏幕调高能不能**预防颈痛**（研究层级） | 【已读摘要】→ 证据弱 | Hoe 2018 Cochrane | "For other physical ergonomic interventions there is no evidence of an effect."（指扶手＋特殊滑鼠以外的人体工学介入）→ 屏幕高度是**官方建议、合理**，但别承诺能防痛 |
| 避免下巴往前伸、圆肩（电脑／开车时） | 【已读原文】 | CUH | "Try to avoid poking your chin forwards and rounding your shoulders when, for example, working at a computer or driving." |
| **低头族负重数字（15° 约 27 磅、60° 约 60 磅）** | 【已读原文，新闻】＋【已读摘要只有前言】 | NPR 2014（报道 Hansraj）https://www.npr.org/sections/thetwo-way/2014/11/20/365473750/keep-your-head-up-text-neck-can-take-a-toll-on-the-spine；Hansraj 2014，PMID 25393825 | NPR："tilting the head forward just 15 degrees can increase the force on the cervical spine to 27 pounds"；PubMed 摘要只有前言："The purpose of this study is to assess the forces incrementally seen by the cervical spine as the head is tilted forward"。**这是电脑模型算出来的、不是实测**——「用 Cosmosworks 有限元模型」只在 WebSearch 摘要看到【转述】，CI 抓 PubMed 页没印出方法段。**而且 Correia 2025 前瞻研究发现低头角度不预测颈痛**（见 C 节）→ App 不要拿这组数字吓人；若要提，写「电脑模型估算，不是量出来的；实际追踪研究没发现低头角度会导致颈痛」 |
| 手机举高一点 | 【未查证】——没找到「把手机举高」能减少颈痛或头前伸的介入研究；只能当「App 的建议／减少长时间低头」 | — | — |
| **每天多走路／活动量** | 【已读摘要】 | Paluch 2022，PMID 35247352（15 个世代、47471 人）；Correia 2025；Tatsios 2025，PMID 40700206 | Paluch："risk of mortality … among adults younger than 60 years until 8000-10 000 steps per day"（这是死亡率，不是颈）；Correia：活动量不足是颈痛风险因子；Tatsios（横断面、颈痛者）："Significantly lower forward head posture was noted in subjects with a high level of physical activity relative to those with a low level of physical activity" |
| NHS 指南：每周 150 分钟中强度＋至少 2 天肌力训练 | 【已读原文】 | NHS 成人运动指南 | "do strengthening activities that work all the major muscle groups… on at least 2 days a week"、"do at least 150 minutes of moderate intensity activity a week" |
| **睡姿／枕头**：低而硬的枕头、别趴睡（NHS）；一颗枕头、头在中间、填满颈部凹处（CUH）；太硬太厚会更痛（Versus Arthritis） | 【已读原文】（指引，非研究） | NHS 颈痛；CUH；Versus Arthritis | NHS："use a low, firm pillow"、"do not sleep on your front"；CUH："One pillow is advisable so that your head does not tilt to the side, forwards or backwards."；Versus Arthritis："If your pillow is too firm or thick, it can make neck pain worse." |
| 枕头研究：乳胶／弹簧枕对慢性颈痛小幅有效（SMD −0.26） | 【已读摘要】 | Chun-Yiu 2021，PMID 33895703 | "significant differences favouring the use of rubber pillows to reduce neck pain [standardized mean difference (SMD): -0.263"、"the cervical alignment may be significantly impacted by the shape and height of the pillow" |
| 并列：另一篇说证据有限、没有哪种枕头明显较好 | 【已读摘要】 | Ghosh 2025，PMID 40633255（5 篇、239 人） | "limited evidence supports the use of specific pillows as adjunctive therapy for chronic neck pain, with no particular type (latex, foam or standard) demonstrating clear superiority" |
| 枕头会不会改善**头前伸** | 【未查证】——两篇都只讲颈痛者的疼痛，没讲白天姿势 | — | — |
| **包包左右轮流背** | 【未查证】——没找到「轮流」的研究。只有：单肩／手提包（15% 体重、25 名大学生、背 5 分钟）造成多方向姿势偏移，前背包较对称 | Bettany-Saltikov 2012，PMID 22744472 | "Unilateral carriage however produces an asymmetrical deviation away from the load"、"The shoulder and handheld bags produce postural deviations in all planes"。注意：急性、样本小、15% 体重很重；作者说「may…lead to pain and progressive postural scoliosis」是推测，没长期数据 → App 只能写「重的包用双肩背或两手分提（App 的建议）」 |
| **深蹲录影自查** | 沿用旧笔记 | McGough 2012，PMID 22158262（即时画面回馈） | 见 `.claude/notes/fitness-posture-research.md` 第 1 节：研究是即时回馈，手机回放是 App 的做法 |
| 维持同一姿势太久、要常换姿势（不是「坐得越直越好」） | 【已读原文】 | NHS 颈痛；CUH | NHS："do not keep your neck in the same position for a long time"；CUH："Change positions regularly. It's healthy to move into all the different positions." ＋ Richards 2021「sit up straight」讯息需要重新思考 |

### E. 可加进 App 体态小课的动作（每个 ≥2 个已读来源）

App 现况（fitness/index.html `PMOVE`）：90/90、半跪髋屈肌、推膝碰墙、**靠墙滑臂**、侧桥、蚌式、提铃踏步、分腿蹲；
门框胸部拉伸在热身／放松清单（L968，另有无门框替代），**不在**体态小课里。

### E1. 收下巴（chin tuck／颈部后缩）——建议新增（证据最直接：Javdaneh CCF、Sheikhhoseini）

| 要点 | 来源 | 原文引句 |
|---|---|---|
| 坐直、下巴往内收，颈和背保持直、**头不要往前低** | CUH（NHS 医院） | "Sitting straight-backed, pull your chin in, keeping your neck and back straight (not tipping your head forwards). Hold at the end position and feel the stretch in your neck." |
| 坐直、轻轻收下巴；可用手指把下巴轻轻往后推辅助 | Physitrack | "Sit up straight and slightly tuck your chin in."、"You can assist the movement direction by slightly pressing your chin backward with your fingers" |
| 站、坐、躺都能做 | Physitrack | "The exercise is simple and can be done standing, sitting, or lying down." |
| 进阶：躺着收下巴再把头微微抬离床面（深颈屈肌） | Physitrack 另一页 https://us.physitrack.com/home-exercise-video/chin--tuck | "Lying on your back with the jaw relaxed, tuck your chin then lift your head so it is slightly off the surface your laying on." |
| 剂量 | 两说（见 B 节剂量表）；App 若定数字须标「App 的安排」 | — |
| 「像做出双下巴」这个口诀 | 【转述】（Calderdale NHS 单张、Physitrack 美国页，只在搜索摘要） | — |
| 头晕就停 | CUH（针对颈部伸展那一项，借用要标「App 的保守判断」） | "Stop this exercise if dizziness occurs." |

### E2. 胸椎伸展（泡沫轴）——可新增（对应 Warneke「胸椎肌力有效」只算间接；这是活动度动作，**没有研究证明它改善头前伸**）

| 要点 | 来源 | 原文引句 |
|---|---|---|
| 仰躺，泡沫轴横放在上背下，双手交叉胸前；吐气时上背往轴上伸直、吸气回来；把轴上下移动逐段做 | Physitrack https://ie.physitrack.com/home-exercise-video/thoracic-extension-using-a-foam-roller | "Lie on your back with a foam roller placed horizontally under your upper back and hands crossed on your chest."、"Straighten your thoracic spine (upper back) against the roller when exhaling. Return to the starting position when inhaling."、"Go through the whole thoracic spine vertebrae-by-vertebrae by moving the roll up/down the upper back." |
| 收下巴、**下背不要拱** | Physitrack 同页 | "Keep your chin tucked in."、"Do not let your lower back arch." |
| 骨盆贴地、上背往轴上伸、手往头上伸 | Rehab Hero https://www.rehabhero.ca/exercise/foam-roller-thoracic-extension | "Lay on a foam roller placed below your upper back. Keep the pelvis on the floor as your extend your upper back over the foam roller and reach overhead with your arms." |
| 坐姿版（斜椅＋泡沫轴） | Rehab Hero https://www.rehabhero.ca/exercise/seated-foam-roller-thoracic-extension | "First set up an incline bench at an angle that is comfortable for you. Place a foam roller between your back and the bench's back support"（原文后半被 CI 截断） |
| 没有泡沫轴改用卷起的毛巾 | 【转述】（搜索摘要，某诊所） | — |
| 剂量 | 【未查证】（Physitrack／Rehab Hero 页面没印出次数） | — |

### E3. 靠墙滑臂（已存在）、门框胸部拉伸（已存在于热身）

- 不需新增。注意 **Warneke：拉伸不改变姿势** → 若把胸肌拉伸搬进体态小课，文案不能写「拉开胸口就能改善头前伸」，只能写「舒服／活动度」。
- 肩胛后缩肌力（划船类）：App 力量计划里本来就有；本轮**没**读到针对头前伸的肩胛 RCT 原文 →【未查证】，不写效果量。

### F. 给 App 文案的结论（一句话版）

1. 能不能练好？**运动（尤其肌力类、收下巴）能改善颈椎角度，证据算强（Sheikhhoseini、Warneke）；单纯拉伸不改姿势（Warneke）。**
2. 会不会痛？**成人里头前伸和颈痛常一起出现（Mahmoud），但前瞻研究没证明前倾会导致颈痛（Richards 2021、Correia 2025）**——不要吓用户。
3. 自查：侧面照量 CVA 可以，但要站着、每次同条件，**差 5° 以内当误差**（Gallego MDC），**不给正常门槛**（Norasteh）。
4. 红旗：手臂麻／无力、走路变差、大小便失控、手突然不灵活、突然剧痛 → 看医生／急诊（NHS 颈椎病原文）。
5. 习惯：常换姿势、短而频繁的休息（HSE）、屏幕顶与眼同高（OSHA／HSE）、每天多动（NHS 指南、Correia、Tatsios）、低而硬枕头不趴睡（NHS，指引级）。
   「每 30 分钟」「手机举高」「包包轮流背」都**没有来源**，要写就标「App 的建议」。

### G. 来源网址总表

| 来源 | 网址 |
|---|---|
| NHS 颈痛 | https://www.nhs.uk/conditions/neck-pain/ |
| NHS 颈椎病（红旗） | https://www.nhs.uk/conditions/cervical-spondylosis/ |
| NHS 成人运动指南 | https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-for-adults-aged-19-to-64/ |
| Versus Arthritis 颈痛 | https://versusarthritis.org/about-arthritis/conditions/neck-pain/ |
| CUH 颈部运动与建议 | https://www.cuh.nhs.uk/patient-information/neck-exercises-and-advice/ |
| OSHA 屏幕 | https://www.osha.gov/etools/computer-workstations/components/monitors |
| HSE 姿势 | https://www.hse.gov.uk/msd/dse/good-posture.htm |
| HSE 休息 | https://www.hse.gov.uk/msd/dse/work-routine.htm |
| Physitrack 收下巴 | https://www.physitrack.com/fi/exercise-library/how-to-perform-the-chin-tuck-exercise-exercise |
| Physitrack 仰躺收下巴抬头 | https://us.physitrack.com/home-exercise-video/chin--tuck |
| Physitrack 胸椎伸展 | https://ie.physitrack.com/home-exercise-video/thoracic-extension-using-a-foam-roller |
| Rehab Hero 胸椎伸展 | https://www.rehabhero.ca/exercise/foam-roller-thoracic-extension |
| NPR（Hansraj 报道） | https://www.npr.org/sections/thetwo-way/2014/11/20/365473750/keep-your-head-up-text-neck-can-take-a-toll-on-the-spine |
| PubMed 摘要 | 31773477、30107937、38834878、42348285、40286070、39483836、40966220、32713947、31054485、30629325、27174256、33444448、40845624、33992248、32911612、37810069、41398198、40700206、25393825、35247352、28892811、30551177、22374636、31742666、30350850、33895703、40633255、22744472 |

### 第二次 verifier 退件后的修正（2026-11-19）

- Warneke 2024 重读摘要：fetch-url **44493899906**（PubMed efetch 38834878）。纳入对象原文："We included controlled clinical trials investigating the effects of stretching or strengthening on spinal and lumbopelvic posture (e.g., pelvic tilt, lumbar lordosis, thoracic kyphosis, head tilt) in healthy individuals." → UI 写「23 篇研究的综述（对象是健康人）」有据。
- 「运动改善颈椎角度证据强」旁边并列 Nazwar 2024（风险差 0.00／0.09，CI 含 0）——反面不能省。
- 前倾 vs 颈痛：Richards 2021＝17 岁追踪到 22 岁，「不是风险因子」**只在男性**（女性坐姿较放松的反而较少颈痛）；Correia 2025＝18–65 岁、12 个月、看的是**滑手机时颈屈角度**，不是头前伸；Mahmoud 只用于「常一起出现」（横断面）。「没证明前倾会造成颈痛」标 App 的推论。
- 收下巴：不说「是肌力练习」，改「与研究里的颅颈屈肌训练相近（App 的推论）」（Javdaneh 2026 的 CCF 训练）。动作提示「感觉颈部被拉开」照 CUH 原文 "feel the stretch in your neck"；「头往后平移」是 App 的描述。
- 泡沫轴胸椎伸展：「本 App 没查到研究证明它能改善脖子前倾」（不说「没有研究」——我们只是没查到）。
- 枕头：✅ 保留（NHS 原文是指引），后面加「枕头研究结果不一」并列 Chun-Yiu 2021（橡胶枕小幅有效）与 Ghosh 2025（证据有限、没有哪种明显较好）。选 ✅＋附注而不是 ⚠️：卡片的 ✅ 定义是「官方指引原文」，NHS 这句确实是原文；研究分歧用附注写清楚。
- 急诊级红旗（走路新问题、大小便失控、手突然不灵活）：**没有**「医生看过，说可以运动」按钮，一直显示「马上去急诊」直到用户改回答案；旧资料里对急诊红旗按过的确认也不算（App 的保守判断）。尽快看医生那四项仍可确认。


## 枕头与侧睡（2026-11-25 查证）

背景：用户 40 岁男，BMI 25.5，仰睡为主、半夜固定转**左侧**睡；换用中间凹、两边高的造型记忆枕
（ErgoLab Deep Sleep 2.0）后醒来较精神，但每次左侧颈肩酸像落枕，换回旧枕就没事；Garmin 睡眠分数无稳定差别。
通道：fetch-url（CI）。标记：【已读原文】= 读到网页/摘要原文；【已读摘要】= 只读到 PubMed 摘要；【转述】= 搜索引擎摘要、未亲读；【未查证】。
下列 run ID 为 fetch-url 工作流 run（日志公开）。

### 来源与 run ID
| 内容 | run ID |
|---|---|
| PubMed esearch ×6、esummary ×3（找 PMID） | 45551662656、45551679910、45551696797、45551713464、45551730465、45551747363；45551866852、45551882702、45551899413 |
| efetch 摘要：33895703、22608285、37662509、12531174、20970004、37722317、31041813、23669094、28127672、39063969、36617387、28012784、9041902 | 45551996679 |
| efetch 摘要（text 模式，`<` 符号会被吃掉，只用于 34683013、39412632、21966226、23875624、22372306、38328528） | 45552179542 |
| efetch 摘要（html 模式）：39625641、24707087、22316896、31906363、26209581、20036076、30470225、35753151、26599679、33527254、21075238 | 45552401338 |
| NHS 颈痛（网址已改为 /symptoms/neck-pain-and-stiff-neck/，页尾 Page last reviewed: 27 April 2023） | 45552196250 |
| NHS 打鼾 https://www.nhs.uk/symptoms/snoring/ | 45552210955 |
| NHS 睡眠呼吸暂停 https://www.nhs.uk/conditions/sleep-apnoea/ | 45552228396 |
| CUH 颈部运动与建议 | 45552245125 |
| Versus Arthritis 颈痛（网址已改到 arthritis-uk.org/…/neck-pain/） | 45552264989 |
| Versus Arthritis 肩痛（同上改网址 …/shoulder-pain/） | 45552284440 |
| ErgoLab 马来西亚官网 https://ergolab.com.my/products/pillow | 45552510992 |
| tryergolab.com／eBay 商品页 | 45552533141（SSL 错误）、45552549610（HTTP 403）——失败，未读到 |

### 逐条结论

**1. 侧睡枕高要让头颈与脊椎成一直线；太高太低会致颈部不适——部分成立**
- 官方指引成立【已读原文】：
  - NHS（预防颈痛）："when sleeping, make sure your head is the same height as the rest of your body"；同页："use a low, firm pillow"（缓解颈痛）。https://www.nhs.uk/symptoms/neck-pain-and-stiff-neck/
  - CUH："Keep your head in the middle, in line with your spine. One pillow is advisable so that your head does not tilt to the side, forwards or backwards. Mould the contents of your pillow to provide extra support for your neck where it dips in compared to your head." https://www.cuh.nhs.uk/patient-information/neck-exercises-and-advice/
  - Versus Arthritis："If your pillow is too firm or thick, it can make neck pain worse. ... Your head and neck should be supported so your head is level with your body in a neutral position. The pillow should fill in the natural hollow between the neck and shoulders"；致病因素清单里也有 "a pillow that's uncomfortably hard or soft"。https://www.arthritis-uk.org/information-and-support/understanding-arthritis/conditions/neck-pain/
  - 三份指引**都没有侧睡专属的说法**（没写侧睡要多高），只讲「头与身体同高／中立」。
- 研究【已读摘要】：
  - Sacco 2015（n=21 无症状，侧卧，5／10／14 cm）：5 cm 时下侧中斜方肌 EMG 最高、最不舒服；10 与 14 cm 肌电无差；10 cm 最舒服。PMID 26209581
  - Jiao 2024（n=15 无症状 18–30 岁，侧卧，枕高=0.5／1.0／1.5×肩宽）："both the sternocleidomastoid and trapezius muscle exhibited the lowest EMG activity in the height 2"，1.0×肩宽最舒服。PMID 39625641（先导研究）
  - Tian 2025（n=9，侧卧 8–14 cm，有无颈托）：枕高与肩宽有关，"Medium individualized height pillow (Hφ 9.74-11.76 cm) with neck support showed a cervical curve closest to natural standing and the lowest musculoskeletal internal force"。PMID 39412632
  - Chun-Yiu 2021（35 篇的系统综述＋荟萃）："the cervical alignment may be significantly impacted by the shape and height of the pillow"；同时 "there may be no change in the alignment of the cervical spine in the side-lying position, regardless of the use of rubber or feather pillows"。PMID 33895703
  - 反面／限制：Lei 2021 综述 "the suggested range for achieving optimal cervical spine alignment ... cannot yet be identified considering the lack of sufficient evidence. Moreover, there remain no firm conclusions about the optimal pillow height for the supine and lateral positions." PMID 34683013
  - Gordon 2011（RCT 实验室，侧卧）：凹形泡棉枕与普通形泡棉枕的颈胸段斜率"similar"；羽毛枕与其他枕差异大。**造型凹不等于排列更好**。PMID 21966226
- 小结：「头颈与身体同高／中立」是官方指引；「太高→不适」仅有 Versus Arthritis（针对已有颈痛者）与小样本肌电／生物力学研究支持；没有找到「太高导致落枕」的 RCT。最佳高度**没有公认数字**，且与肩宽有关（Jiao、Tian）。

**2. 侧睡与仰睡所需枕高不同（侧睡较高）——方向成立，数值未定**
- Her 2014（n=40）【已读摘要】：侧卧时脸到肩平均 9 cm，颈中部离地 11 cm，肩关节从仰卧变侧卧平均上移 4.4 cm；结论 "Pillows with uniform heights are not suitable for a supine or side-lying position." PMID 24707087
- Chen & Cai 2012（台湾人体测量，n=20）【已读摘要】：设计提案 "The middle area of the pillow is for supine position and the both side areas are for lateral positions"，中间／两侧高度男性 4／14 cm、女性 2／12 cm（这是尺寸设计建议，不是疗效结果）。PMID 22316896
- 反面：Lei 2021（见第 1 条）"no firm conclusions about the optimal pillow height for the supine and lateral positions"。
- 小结：「侧睡要比仰睡高、中间低两边高的枕型正是针对此设计」有人体测量依据；但没有研究验证它能减少颈痛，数字（12 cm／14 cm）勿当标准写进 App。

**3. 长期固定同一侧侧睡与该侧肩痛有关——证据弱，只能写「有相关报告、因果未知」，与用户的颈痛不是同一件事**
- Kempf & Kongsted 2012（83 名单侧肩痛患者，横断面）【已读摘要】："67% of those sleeping on one side lying on the painful shoulder (P = .02)"；"It is unknown whether the observed associations are causal"。PMID 22608285
- Zenian 2010【已读摘要】：假说文章，"shoulder pain is caused by postural immobility in the decubitus or side position during sleep"，自称 preliminary。PMID 20036076
- 2024 病例系列（58 例肩袖撕裂，Level IV）【已读摘要】："52 of the patients were side sleepers"；"there appeared to be a relationship"。PMID 38328528（doi 10.1016/j.asmr.2024.100886；标题本次没读到）
- **反面**：Holdaway 2018（761 名工人，横断面）【已读摘要】："The sleep position anticipated to have the highest risk of glenohumeral pain and RCT was paradoxically associated with a decreased prevalence"，作者提醒可能是病人学会避开该姿势（反向因果）。PMID 30470225
- Cine 2023（72 例颈椎间盘突出手术患者）【已读摘要】："Sleeping positions do not affect the shoulder/arm pain before and after the operation"。PMID 37662509
- 没有找到「固定侧睡→该侧颈痛」的研究；没有前瞻研究。

**4. 侧睡抱枕／胸前放枕头能减少肩部受压——只有对「已疼的肩」的指引，机制与预防作用未查证**
- Versus Arthritis 肩痛页【已读原文】（针对"肩膀躺下时会痛"的人）："lying on your good side with a pillow under your neck"；"using a folded pillow to support your painful arm in front of your body"；"placing another pillow behind your back to stop yourself rolling onto your painful side"。https://www.arthritis-uk.org/information-and-support/understanding-arthritis/conditions/shoulder-pain/
- 「减少肩部受压」这个机制说法、以及对没痛的人的预防效果：【未查证】（esearch 查 pillow＋hug／between＋shoulder 只回一篇无关的哺乳姿势研究）。可写「肩痛指引建议用枕头托住手臂」，不要写「研究证明减少受压」。

**5. 仰睡比侧睡更易打鼾／睡眠呼吸暂停——成立；枕头能否改善打鼾——证据少且有利益相关**
- NHS 睡眠呼吸暂停【已读原文】：风险因素清单有 "sleeping on your back"；建议 "sleep on your side – try taping a tennis ball to the back of your sleepwear, or buy a special pillow or bed wedge to help keep you on your side"。https://www.nhs.uk/conditions/sleep-apnoea/
- NHS 打鼾【已读原文】：同样建议 "sleep on your side ..." https://www.nhs.uk/symptoms/snoring/
- Joosten 2014 综述【已读摘要】："more than half of all obstructive sleep apnea (OSA) patients can be classified as supine related OSA"。PMID 23669094；Landry 2023【已读摘要】："Increased airway collapsibility is reliability observed supine relative to lateral position"。PMID 37722317
- 澳洲睡眠学会 2023 立场文件【已读摘要】："Positional therapy should be considered in supine dominant snorers"。PMID 36617387
- Cochrane 2019【已读摘要】：体位疗法优于无干预（AHI MD −7.38），CPAP 更强；证据 low–moderate，"All the studies were of short duration"。PMID 31041813
- 枕头与打鼾：Cazan 2017 随机交叉（n=22，BMI≤30，已排除 OSA）【已读摘要】："significant reduction in the snoring index (p = 0.03)"；**注意**：这是「改变头位的专用防鼾枕」，作者单位含防鼾产品经销商（Nitetronic GmbH／Sissel），样本小。PMID 28127672。Moffa 2024 系统综述【已读摘要】："Studies show that PT and HOBE reduce snoring" 但 "further comparative studies between the different devices are needed"。PMID 39063969
- 没有研究直接测过 ErgoLab 或「中间凹造型枕」是否减少打鼾；商品页「Helps keep airways open to reduce snoring」是**厂商宣传**【已读原文】，其 FAQ 也承认 "If your snoring is caused by allergies or other health issues, results may be limited."
- 用户是否打鼾、是否有 OSA：未知（无数据）。

**6. 「醒来比较精神」可能来自打鼾减少或从浅睡醒来——sleep inertia 机制成立，但归因到枕头无证据**
- Tassi & Muzet 2000【已读摘要】："Abrupt awakening during a slow wave sleep (SWS) episode produces more sleep inertia than awakening in stage 1 or 2, REM sleep being intermediate."；"in the absence of major sleep deprivation, the duration of sleep inertia rarely exceeds 30 min." PMID 12531174。Matchock 2010 同向（"deleterious effects most pronounced when awakened from biological night"）PMID 20970004。
- 张力：McCarter 2022 scoping review【已读摘要】："Slow wave sleep was moderately correlated with better performance ... as well as better subjective sleep quality and feeling well-rested ... However, these findings were inconsistent across studies." 主观精神与客观睡眠分期相关性「弱到中等」。PMID 35753151
- 枕头对睡眠质量：Chun-Yiu 2021 "Pillow designs did not influence sleep quality (SMD = 0.047; P = 0.703) in patients with chronic neck pain."（对象是慢性颈痛患者，不是健康人）PMID 33895703；加上 Garmin 两种枕头无稳定差别。
- 小结：「从浅睡醒来」「打鼾减少」都是**假说**；没有证据显示该枕头让他更常在浅睡时醒来。另一个同样讲得通的解释（我的推论，非来源）：换新枕的期望效应／新鲜感。

**7. ErgoLab Deep Sleep 2.0 是否可拆内芯／可调高度、前后高度不同——前后不同高：官网有写；可拆内芯／可调高度：官网未见**
- 官网 FAQ【已读原文】https://ergolab.com.my/products/pillow ：
  - "One edge is lower and the other higher, so you can choose the height that suits you."
  - "Side sleepers get the raised wings to support the neck, with room to rest your arm. Stomach sleepers use the lower edge so the neck doesn't bend upwards. Try both edges to find the height that suits you."
  - 软硬："Medium to medium-firm"；适应期："Give it about a week so your neck can get used to the new support"（厂商说法）。
  - 保养："If the foam core gets dirty, wipe it with a damp cloth ... Don't machine wash the core. The pillowcase unzips and is machine washable." —— 只有可拆**枕套**，页面没提可拆内芯／可加减层／可调高度（没写≠没有，但页面读不到）。
  - 退货：官网 "90-night money-back guarantee ... We even cover return shipping."；页面说 Shopee／Lazada 有官方店，但**Shopee 店的退货条款未查证**。
- 尺寸：页面文字未读到 cm；搜索引擎摘要称 "12 x 60 x 36 cm"【转述，未亲读原文】。
- 其它：tryergolab.com 与 eBay 商品页 CI 抓取失败（SSL 错误／403）；Shopee 本身为 JS 页面未抓。

### 对给用户建议的修改建议
1. 第 1 条保留，但写成「官方指引：头与身体同高、中立（NHS／CUH／VA）」；不要写成「研究证明太高会引起落枕」。App 里不要给「X cm」标准。
2. 第 2 条：只说「侧睡通常需要比仰睡高（人体测量）」，加「最佳高度没有公认数字」（Lei 2021）；可提示高度与肩宽有关（Jiao 2024、Tian 2025，均为小样本）。
3. 第 3 条降级：「有少数研究发现侧睡那一侧与肩痛相关，因果未知，也有相反结果」（Kempf 2012 vs Holdaway 2018）；**别拿它解释他的左侧颈痛**。
4. 第 4 条：只引 Versus Arthritis 的「肩痛时用枕头托手臂」，不写「减少受压」。
5. 第 5 条：保留「仰睡更易打鼾／呼吸暂停」（NHS＋综述）；删掉「该枕头能减少打鼾」类说法（只有厂商宣传＋一篇有利益相关的专用枕研究）。他若打鼾或白天嗜睡，建议看医生（NHS 同样写）。
6. 第 6 条改成「可能的解释之一」并标假说；加一句「枕头研究多半没改善睡眠质量（Chun-Yiu 2021）」。
7. 可新增的实用建议（来自官网原文）：这款枕**前后两边高度不同**，官方说「两边都试」——他可以翻到较低那一边再试几晚（注意：官网写低边主要是给趴睡者，**我无法保证对他有效**）；官网自称 90 天退款，但从 Shopee 买是否适用未查证。
8. 「左侧颈肩酸」用户为何固定在左边：没有来源可答（高低肩与侧睡颈痛的研究未找到）→ 标【未查证】，只能建议他请人从背后拍侧睡照看头颈是否水平。红旗症状照原有规则走。


## 金边物理治疗候选（2026-11-26）

调查方式：CI 通道 fetch-photos.yml（取 Google Maps 评分／营业时间／精准 place_url，已对照 place_title 与地址）＋ web-lookup.yml／fetch-url.yml 读官网（沙盒挡了多数外站）。Google 评论正文**读不到**（抓图器只回评分与评论数），所以「评论里颈肩／姿势的正负面」除 Movement 官网嵌入的 Google 评论外一律【未查证】。语言：所有候选**都没查到中文服务**。

### 候选表（评分 ≥4.2、有物理治疗师资历证据者）

| 名称 | Google 评分（评论数） | 区／地址 | 治疗师资历证据 | 语言 | 价格 | 营业时间 | 预约 | 精准地图链接 |
|---|---|---|---|---|---|---|---|---|
| **Studio On. Physiotherapy**（Yannick Sarton） | 5.0（24） | BKK1，WH Residence，#20 Street 302，Level 1，12303 | 官网：「Yannick Sarton / Master in Physiotherapy UCL- Belgium / Master of research (MSc.) in Osteopathy University of Bedfordshire - UK」（https://www.studiohealthon.com/home ）；Confluences 博客：「He holds a first Master's degree in Physiotherapy from Belgium and studied a second Master's (MSc) in Research in Osteopathy in London」「specialist with 20 years of experience」（https://www.confluences.asia/blog/studio-on-opens-in-cambodia-with-confluences-support ） | 英、法（「Consultations are available in English and French」https://www.studiohealthon.com/fr-contact ）；中文未查证 | 官网 $50／次，首诊含完整评估＋治疗，复诊同价（https://www.studiohealthon.com/en-booking ）；官网写 60 分钟（同页另一处写约 50 分钟） | **矛盾**：官网「Monday to Saturday from 9 AM to 6 PM」；Google：周一休、周二至周六 9–18、周日 9–12 | 「Consultations by appointment only」；网上预约／WhatsApp／Telegram +855 71 631 2793 | https://www.google.com/maps/place/Studio+On.+Physiotherapy/@11.5530845,104.9271859,17z/data=!3m1!4b1!4m6!3m5!1s0x310951b3f32608b1:0x29be85d8c9e349e1!8m2!3d11.5530845!4d104.9271859!16s%2Fg%2F11wc6myhjg |
| **Physiotherapy Phnom Penh**（Google 名：Physiotherapy Phnom Penh II） | 4.7（11） | Boeung Tumpun，LH Aroma Building 4 楼，Street 242 转角 107，12202 | 官网：「All therapists working at our clinic are trained and licensed in accordance with Western standards.」（https://www.physiotherapy-phnompenh.com/welcome ）；团队页例：Daniel Aguilar「graduated from the Universidad Del Valle de Mexico with a Bachelor Degree in physiotherapy」（https://www.physiotherapy-phnompenh.com/our-team ）；另有 Robbert van Hoven 页（内容未读全）。个别治疗师执照号未查证 | 英文（官网英／高棉）；中文未查证 | 未公开（第三方 Well Frog：「Contact for rates」https://thewellfrog.com/kh/phnom-penh/physiotherapy-phnom-penh ）；初诊 45 分钟、复诊约 40 分钟（https://www.physiotherapy-phnompenh.com/physiotherapy ） | Google：周一至五 8–19，周六 8–12，周日休（官网未列） | 电话 +855 17 223 105／info@physiotherapy-phnompenh.com；官网写「contact us… for scheduling an appointment」 | https://www.google.com/maps/place/Physiotherapy+Phnom+Penh+II/@11.5570447,104.8425356,13z/data=!4m10!1m2!2m1!1sPhysiotherapy+Phnom+Penh!3m6!1s0x3109515d2e6df4f1:0x45e3642582e1ef6c!8m2!3d11.5570447!4d104.9187533!15sChhQaHlzaW90aGVyYXB5IFBobm9tIFBlbmhaGiIYcGh5c2lvdGhlcmFweSBwaG5vbSBwZW5okgEUcGh5c2lvdGhlcmFweV9jZW50ZXKaASRDaGREU1VoTk1HOW5TMFZKUTBGblNVTTNNbVY2ZEhsUlJSQULgAQD6AQQIABAw!16s%2Fg%2F11g8wd96z_ |
| **Physio ONE PP - TTP** | 4.8（30） | Toul Tom Poung 一带，1H Street 480，12310 | **资历未查证**：LinkedIn 仅写「Our experts have over 10 years experience in exercise rehabilitation and fitness development」「Physiotherapy and exercise rehabilitation available in a gym setting」（https://kh.linkedin.com/company/physio-one-phnom-penh ）；官网没找到；治疗师姓名／学历／执照均未查到 | 未查证 | 未公开（Well Frog：「Pricing Not publicly listed」https://thewellfrog.com/kh/phnom-penh/physio-one ）；同站指南称金边整体 $30–50／次（泛泛估计，非该店报价） | Google：周一至五 6:30–19:30，周六日 7–13 | Facebook 页／电话；**电话矛盾**：Facebook 摘要 +855 16 236 086，Well Frog +855 89 259 733 | https://www.google.com/maps/place/Physio+ONE+PP+-+TTP/@11.5346871,104.9177136,17z/data=!3m1!4b1!4m6!3m5!1s0x310951d009ab8aad:0x94ab2d9b1e05bc88!8m2!3d11.5346871!4d104.9177136!16s%2Fg%2F11t9wlg9vh |
| **Movement: Physiotherapy and Fitness**（⚠ Google 标「永久停业」） | 4.9（208） | 79 Street 350（The Office），120101 | 官网团队页：「Mark Chen — Physiotherapist, Nutritionist, Fitness Trainer … Over 15 years of experience」；「Ritesh Saojal — Musculoskeletal Physiotherapist … Fluent in English and Hindi」；「Nearida Siv … Clinical Master's Degree in Continence and Women's Health from Curtin University… APA-titled」（https://movementphysiofitness.com/team/ ）。学历／执照号未查证 | 英（Ritesh：英、印地）；中文未查证（不要因姓名推断） | 官网 contact 页：「Initial Evaluation: 60 minutes / $70」「Ongoing Sessions: 40 minutes / $50」（https://movementphysiofitness.com/contact/ ） | 官网未列；搜索摘要称周一至五 8–18、周六日 8–14（来自 10web 测试站，未证实）；Google 无时间 | 官网 Book Now／Calendly | https://www.google.com/maps/place/Movement:+Physiotherapy+and+Fitness/@11.5486145,104.9135009,17z/data=!3m1!4b1!4m6!3m5!1s0x31095141baefb28f:0x4ee1939e9683e32c!8m2!3d11.5486145!4d104.9135009!16s%2Fg%2F11fqsc71qy |

**Movement 矛盾（两说并陈）**：Google Maps 状态＝permanently_closed（连续 3 次抓取一致）；但官网 2026-11-26 仍可开、列有价格／团队／地址／Calendly，官网首页称「204+ Google reviews」。无法裁决，去之前必须先确认还在营业。
电话号码冲突：Movement 官网首页 HTML 的 tel 链接是 +855 17 223 105（日志 h45771384244）；Well Frog 的 Physiotherapy Phnom Penh 条目也列同一号码 +855 17 223 105（https://thewellfrog.com/kh/phnom-penh/physiotherapy-phnom-penh ）。两处来源指向不同诊所却同号，打之前先确认接的是谁（也可能 Well Frog 录错）。

### 评论摘要（评论原文只在 Movement 官网有；其余未查证）
- Movement 官网嵌入的 Google 评论（诊所自选，非全量）：正面「Approached Ritesh at Movement Physio when I was struggling with limited movement range in my left arm. He … was able to explain clearly his diagnosis, treatment protocol and the support exercises」（肩）；另一则「after a session to assess me he tailored a physio regime for me that I can do at home」（居家动作）。负面：未读到（该组评论本就是挑选过的）。
- Studio On、Physiotherapy Phnom Penh、Physio ONE：Google 评论正文未读到 → 颈肩／姿势评估的正负面均【未查证】。

### 与「带动作回 App」相关的证据
- Studio On 官网：「After your session, you get access to a rehab app so you can continue at home with clear instructions and videos.」「Each program is designed during your appointment and delivered straight to your smartphone」；「Sessions combine hands-on therapy, movement analysis, and guided rehabilitation」；列有 Neck pain。（https://www.studiohealthon.com/home ）
- Physiotherapy Phnom Penh 手法治疗页：「a physical evaluation will take place in which the therapist will assess your posture, movements, and examine the joints」（https://www.physiotherapy-phnompenh.com/manual-therapy ）；物理治疗页：「Exercise may be prescribed for you to complete between treatments」。
- Movement：「tailored a physio regime … I can do at home」（评论，见上）；官网有「I am trying to correct my posture」入口。

### 排除项
- Sen Sok Hospital（Google 4.1/85）：低于 4.2。Raffles Medical Clinic（3.4/194）：低于 4.2。International SOS（5.0/2）：不是物理治疗、评论仅 2 则。
- Royal Phnom Penh Hospital（4.3/675，24 小时，https://www.google.com/maps/place/Royal+Phnom+Penh+Hospital/@11.562302,104.8617139,15z/data=!4m10!1m2!2m1!1sRoyal+Phnom+Penh+Hospital+rehabilitation+physiotherapy!3m6!1s0x310951a354c389d9:0xd07843ea8349e8c1!8m2!3d11.562302!4d104.8807683!15sCjZSb3lhbCBQaG5vbSBQZW5oIEhvc3BpdGFsIHJlaGFiaWxpdGF0aW9uIHBoeXNpb3RoZXJhcHlaOCI2cm95YWwgcGhub20gcGVuaCBob3NwaXRhbCByZWhhYmlsaXRhdGlvbiBwaHlzaW90aGVyYXB5kgEIaG9zcGl0YWyaAURDaTlEUVVsUlFVTnZaRU5vZEhsalJqbHZUMnR3VEdFeU9ERmpSMnhPVmxWa1NFeFZiM2RUUkdSbVlXdGtkbHBYWXhBQuABAPoBBAgeED0!16s%2Fg%2F1pv0lsc9n ）：评分合格，但**没查到它的复健科／物理治疗师信息**（搜索只得到「rehabilitation services」一般性描述），不列入候选。
- J-Physio（日本人物理治疗师工作室）：Google 抓取两次都落到 Physio ONE，没有独立地点页；评分与精准链接未查证，不列入。Physiotherapy Clinic International（Street 288，法籍）：只在 b2b 目录出现，Google 抓取两次都落到 Physiotherapy Phnom Penh II，未找到独立地点页，不列入；「The Physio」（BKK1 Street 63）同样落到别家，未查证。
- 纯按摩／盲人按摩（Movement 团队页另列一位按摩师）、脊骨神经（International Chiropractic Clinic）不算。

### 未查证清单
1. 各治疗师的执照／注册号（柬埔寨卫生部注册）——所有来源都没公开；只能到诊所当面问。
2. Google 评论正文（颈肩／姿势评估的正负面）——抓取器不回评论。
3. 中文服务——所有候选均无来源提及。
4. Physio ONE 的治疗师学历、语言、价格——官网没找到。
5. Physiotherapy Phnom Penh 的价格。
6. Movement 是否真的已停业（Google vs 官网矛盾）。
7. Studio On 周一是否营业（官网 vs Google 矛盾）。
8. 被挡的域名：phnompenhpost.com（沙盒 DNS 不通；CI 抓取其文章也失败），Instagram（HTTP 429），physioone 官网域名（猜了数个均不存在）。
