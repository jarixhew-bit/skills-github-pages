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
| 站立左右重量分配不均的人，背蹲时左右地面反作用力也不均、杠倾斜／旋转更大；应先处理再大量训练 | 【已读摘要】 | Sato & Heise 2012，PMID 22228110 | "The unequal WtD captured at the WtD test carried over to the SI score during the back squat test… The lack of postural control to distribute body weight evenly should be treated properly to gain levelness before participating in high volume of resistance training" |
| 即时视觉回馈能减少未受训者深蹲左右重量差 | 【已读摘要】 | McGough 2012，PMID 22158262 | "WBA exists in healthy untrained adults, and these asymmetries can be reduced using real-time visual feedback" |
| 脚踝背屈受限 → 深蹲膝内倒增加（楔形板模拟） | 【已读摘要】 | Macrum 2012，PMID 22100617 | "Altering ankle-dorsiflexion starting position during a double-leg squat resulted in increased knee valgus and MKD" |
| 落地：背屈活动度与膝内倒**无**显著相关（与上一条并列） | 【已读摘要】 | Fong 2011，PMID 21214345 | "All correlations for flexed-knee dorsiflexion ROM and knee-valgus displacement were nonsignificant." |
| 跳远选手深蹲时髋屈曲角与髋力矩左右不同（同一人两侧不对称很常见） | 【已读摘要】 | Kobayashi 2010，PMID 20571445 | "the maximal flexion angle and peak torque at hip showed significant differences between the limbs under all loading conditions" |
| 单侧训练（vs 双侧）减少左右腿差距 | 【已读摘要】 | Gonzalo-Skok 2017，PMID 27140680（22 名青年篮球员） | "only UNI reduced between-limbs asymmetry" |
| 长短脚：90% 的人 X 光量得到差异，平均 5.2 mm；约 20 mm 以上才可能有临床意义 | 【已读摘要】 | Knutson 2005 Part I，PMID 16026625 | "the prevalence of anatomic inequality was found to be 90%, the mean magnitude of anatomic inequality was 5.2 mm (SD 4.1)… does not appear to be clinically significant until the magnitude reaches approximately 20 mm" |
| 疼痛回避造成歪向一边 | 【未查证】（没找到能读的原文；App 不写） | — | — |
| 髋活动度左右不对称造成歪 | 【未查证】（只有机制推论；App 不写成原因） | — | — |

自查（App 用的）：
- **手机拍背面看深蹲**：回馈有效（McGough）；拍完回放看屁股往哪边偏。距离、高度的具体数字没有来源，App 不写。
- **推膝碰墙（weight-bearing lunge test）**：Powden 2015 系统综述（PMID 25704110）【已读摘要】"inter-clinician reliability (ICC = 0.80-0.99) as well as intra-clinician reliability (ICC = 0.65-0.99) of the WBLT is good… average MDC scores of 4.6° or 1.6 cm for inter-clinician and 4.7° or 1.9 cm for intra-clinician"；
  做法与「左右差 >2 cm 当成一个发现」「每 3–4 周重测」：Pabau【已读原文】"Move the foot farther from the wall in 1 cm increments until the heel lifts… Record the farthest distance"、"treat a difference above 2 cm as a finding"、"Re-test every three to four weeks"；
  Prehab Guys【已读原文】"Make sure your heel stays on the ground"、"The other ideal goal is to have similar ankle range of motion side-to-side"。
  **并列**：Pabau 说 10 cm 以上算正常（转引 Bennell）；Prehab Guys 目标是 5 英寸（约 12.7 cm）。App 不给「正常值」，只比左右。
- **侧桥撑多久**：McGill 1999（PMID 10453772）【已读摘要】"The tests proved reliable, with reliability coefficients of >.97"。App「差 10% 以上算弱侧」是 App 自己的门槛，**没有来源**，文案写明「App 用…来判断」。
- **单腿蹲／下台阶看膝盖**：Crossley 2011（PMID 21335344）【已读摘要】"Clinical assessment of performance on the single-leg squat task is a reliable tool that may be used to identify people with hip muscle dysfunction"（表现差者髋外展力矩与躯干侧屈力较低）。

## 2. 高低肩：习惯性 vs 结构性、运动能不能改静态姿势、什么时候看医生

| 说法 | 状态 | 来源 | 原文引句 |
|---|---|---|---|
| 高低肩、一边肩胛／肋骨突出、一边髋高是脊柱侧弯的征象 | 【已读原文】 | AAOS OrthoInfo | "Tilted, uneven shoulders, with one shoulder blade protruding more than the other"、"Prominence of the ribs on one side" |
| 前弯测试做法：两脚并拢、膝盖打直、手自然垂下，从背后看两边肋骨 | 【已读原文】 | AAOS OrthoInfo | "your child will bend forward with feet together, knees straight and arms hanging free. The doctor will observe your child from the back, looking for a difference in the shape of the ribs on each side" |
| 肋骨隆起是最明显征象；肩高不对称也是 | 【已读原文】 | SRS | "Rib "hump"… the most visible sign of scoliosis"、"Shoulder height asymmetry is indicated when one shoulder appears higher than the other" |
| 一边肋骨突出、一边肩或髋突出 → 看家庭医生；确诊照 X 光；成年后通常不变、变了要看 | 【已读原文】 | NHS 脊柱侧弯 | "1 shoulder or hip sticking out"、"the ribs sticking out on 1 side"、"See a GP if you think you or your child has scoliosis"、"An X-ray of your back will be carried out"、"tends to stay the same after you stop growing – see a GP if it gets any worse" |
| 背部运动能不能改善侧弯不清楚，但一般运动不必避免 | 【已读原文】 | NHS | "It's not clear whether back exercises help improve scoliosis, but general exercise is good for overall health and should not be avoided unless advised by your doctor." |
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
| 儿童 PT「帮他们把腿撑得更直」（对象是儿童、讲的是肌力支撑，不是改骨） | 【已读原文】 | Cleveland Clinic | "A physical therapist will give your child exercises and stretches to strengthen the muscles in their legs. This can help them hold their legs straighter." |
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
| 拉伸长期能增加活动度（中等效果）；静态／PNF 比弹震好；**量、强度、频率都不影响效果** | 【已读摘要】 | Konrad 2024（77 篇），PMID 37301370："stretch training can increase ROM with a moderate effect… neither volume, intensity, nor frequency of stretching were found to play a significant role in ROM yields" |
| 负重肌力训练也能增加活动度（与拉伸无差） | 【已读摘要】 | Alizadeh 2023，PMID 36622555："Resistance training increased range of motion (effect size [ES] = 0.73…)… no significant range of motion improvement with resistance training using only body mass" |
| 每周 3–5 次 | **App 的安排**，没有来源；文案写明「这是 App 的安排」并附 Konrad「做多做少影响不大」 | — |
| 弱侧多一组 | **App 的安排**（依据 Gonzalo-Skok 的单侧训练减少左右差；「多一组」本身没有研究） | — |
| 靠墙滑臂 8–10 次、蚌式 12–15 次 | 【转述】／App 安排（Prehab 的 1–3×8–10、Merck 的 3×10 只在搜索摘要里） | — |

## 5. 多久重测、合理期待

- 每 3–4 周重测推膝碰墙（Pabau【已读原文】）；Pabau 另一处写物理治疗「every four to six weeks」——两说，App 用 4 周（28 天）提醒。
- 推膝碰墙前后差 1.6–1.9 cm 以内可能是测量误差（Powden【已读摘要】）。
- 研究的介入期：Lashien 8 周（【已读摘要】）；其他研究的周数本次没有逐篇核对 → App 只举 Lashien。
- 静态姿势照片变化慢、不一定变（Warneke：拉伸无效、肌力只对胸颈有效）；脊柱侧弯运动效果不明（NHS）。
- 「几周内一定看到」之类的承诺：【未查证】，App 不写。

## 6. App 落地对照（改文案前先看这里）

- `SRC`：App 里每个来源链接的清单，都在上面表格里。
- 红旗（`redList()`）：前弯一边隆起（NHS／SRS／AAOS）、痛（Cleveland 90/90 的「pain or a pinching feeling… stop… seek out some advice」＋patient.info）、
  麻（SRS 的神经异常→医生）、越来越明显（NHS＋HSS）、X 型腿只有一边或成年后才出现（patient.info）。
- 门槛：推膝碰墙差 ≥2 cm（Pabau）；侧桥差 ≥10%（App 自定、文案已标明）。
