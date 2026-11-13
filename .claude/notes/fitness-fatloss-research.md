# 「这套训练真的能减脂吗」查证笔记（2026-11-13）

委派问题：fitness/ App 的力量计划＋有氧 12 周＋游泳课，单靠运动能减多少脂？要不要补营养？
本档只记查证，不改 App。

## 0. 查证强度（先读这段）

- 初稿（研究员）只拿到「搜索工具对摘要的转述」：沙盒对 PubMed / PMC / Springer 等一律断线，当时也没有 github 工具。
- **同日复核（2026-11-13）**：走 CI 通道读了原文——`fetch-url.yml` 抓 PubMed E-utilities
  `efetch.fcgi?db=pubmed&id=…&rettype=abstract&retmode=text`（一次抓 11 篇摘要，run 43410371016），
  `web-lookup.yml` 读 Retraction Watch 原文与 2013 AHA/ACC/TOS 指南的 PMC 全文（run 43410438362）。
  没有绕过任何防护。逐条结果见下方「查证状态」表；表里标「已读原文/摘要」的，正文数字以表为准。
- 这个做法可复用：PubMed efetch 的纯文字摘要比 OpenAlex 的倒排索引好读，一次可塞多个 PMID。
- 标记：【已读摘要】／【已读原文】＝CI 抓回原文核对过；【转述】＝仍只是搜索摘要转述；【推论】＝我算的/我推的；【未查证】＝没拿到。

## 查证状态（2026-11-13 复核）

| # | 说法 | 状态 | 来源 | 原文引句 |
|---|---|---|---|---|
| 1 | ACSM 2009：150–250 分/周只带来少量减重；>250 分/周与临床显著减重相关 | 已读原文/摘要 ✔ | PMID 19127177 摘要 | "Moderate-intensity PA between 150 and 250 min wk(-1) will provide only modest weight loss. Greater amounts of PA (>250 min wk(-1)) have been associated with clinically significant weight loss." |
| 1b | （附带）ACSM：力量训练不增加减重，但可能增加去脂体重、多减脂肪 | 已读原文/摘要 ✔ | 同上 | "Resistance training does not enhance weight loss but may increase fat-free mass and increase loss of fat mass" |
| 2 | Wewege 2022：体脂率 −1.46%、脂肪量 −0.55 kg、内脏脂肪 SMD −0.49 | 已读原文/摘要 ✔ 数字一致 | PMID 34536199 摘要 | "resistance training reduced body fat percentage by - 1.46% (95% confidence interval - 1.78 to - 1.14…), body fat mass by - 0.55 kg (… - 0.75 to - 0.34…) and visceral fat by a standardised mean difference of - 0.49 (… - 0.87 to - 0.11…)" |
| 3a | Wewege 2017：HIIT 与 MICT 无显著差、HIIT 省约 40% 时间 | 已读原文/摘要 ✔ | PMID 28401638 摘要 | "There were no significant differences between HIIT and MICT for any body composition measure, but HIIT required ~40% less training time commitment." |
| 3b | Wewege 2017：脂肪量 HIIT −1.7 kg vs MICT −2.1 kg | **仍未查证**（摘要没有 kg 数字，只给跑步组 SMD −0.82／−0.85；全文在 Wiley 付费墙后） | — | 摘要另有："cycling training did not induce fat loss"；"modest body composition improvements … without accompanying body-weight changes" |
| 4 | Viana 2019 已撤稿 | 已读原文 ✔ | Retraction Watch 2020-12-18 原文 | "A sports medicine journal has retracted a widely circulated 2019 meta-analysis…"；撤稿通知原话："This paper has been retracted because the Editor has concerns about: (i) the accuracy of inclusion/exclusion of some studies; (ii) classification of the exercise intensity in some of the studies; (iii) the accuracy of some reported effect sizes; (iv) the veracity of the main conclusions and title." 撤稿通知的确切日期（初稿写 2020-12-15）**未单独查证**；PubMed 记录目前只挂 2019-06 的 expression of concern |
| 5 | Thorogood 2011：6 个月 −1.6 kg、腰围 −2.1 cm | 已读原文/摘要 ✔（腰围精确值 −2.12 cm） | PMID 21787904 摘要 | "Six-month programs were associated with a modest reduction in weight (weighted mean difference [WMD]=-1.6 kg; 95% confidence interval [CI], -1.64 to -1.56) and waist circumference (WMD=-2.12 cm; 95% CI, -2.81 to -1.44)." |
| 6 | Church 2009 DREW：实际 vs 预测减重 | 已读原文/摘要 — **初稿数字有误，已更正** | PMID 19223984 摘要 | "The mean (95% CI) weight loss in the 4, 8 and 12 KKW groups was -1.4 (-2.0, -0.8), -2.1 (-2.9, -1.4) and -1.5 (-2.2, -0.8) kg, respectively. … In the 12 KKW group the actual weight loss was less than the predicted weight loss (-2.7 kg) resulting in 1.2 (0.5, 1.9) kg of compensation" |
| 7 | Donnelly 2013 Midwest Exercise Trial 2：400 组 −3.9 kg、600 组 −5.2 kg；男女差异 | 已读原文/摘要 ✔ 数字一致；**男女差异不显著**（矛盾已裁决） | Obesity 2013;21(3):E219-28，PMID 23592678 摘要 | "Weight loss from baseline to 10 months for the 400 and 600 kcal/session groups was 3.9 ± 4.9 kg (4.3%) and 5.2 ± 5.6 kg (5.7%), respectively, compared with weight gain for controls of 0.5 ± 3.5 kg (0.5%) … differences between men and women within groups were not statistically significant." |
| 8 | Longland 2016：脂肪 −4.8 vs −3.5 kg，瘦体重 +1.2 vs +0.1 kg | 已读原文/摘要 ✔ 数字一致 | PMID 26817506 摘要 | "LBM increased (P < 0.05) in the PRO group (1.2 ± 1.0 kg) and to a greater extent … compared with the CON group (0.1 ± 1.0 kg). The PRO group had a greater loss of fat mass than did the CON group (PRO: -4.8 ± 1.6 kg; CON: -3.5 ± 1.4kg…)" |
| 9 | Morton 2018：约 1.6 g/kg/天 以上不再多长去脂体重 | 已读原文/摘要 ✔（断点精确值 1.62） | PMID 28698222 摘要 | "Protein supplementation beyond total protein intakes of 1.62 g/kg/day resulted in no further RET-induced gains in FFM." |
| 10 | 2013 AHA/ACC/TOS 肥胖指南：缺口 500–750 kcal/天，或女 1200–1500／男 1500–1800 kcal/天 | 已读原文 ✔（PMC 全文，推荐等级 A 强） | Jensen 2013，Circulation 2014;129(25 Suppl 2):S102-38，PMID 24222017，PMC5819889 | "Prescribe 1200–1500 kcal/d for women and 1500–1800 kcal/d for men (kilocalorie levels are usually adjusted for the individual's body weight); Prescribe a 500-kcal/d or 750-kcal/d energy deficit; or Prescribe one of the evidence-based diets…" |
| 11 | Moniz 2020：24 小时 EPOC，HIIT vs MICT | 已读原文/摘要 ✔ — **裁决：说法 A 正确**；另更正文献类型：这是**叙述性综述**，不是 meta 分析 | PMID 31830334 摘要 | "Research to date suggests small differences in EPOC post-HIIT compared to MICT in the immediate (<1 hour) recovery period, but greater EPOC values post-HIIT when examined over 24 hours. Conversely, differences in EPOC post-SIT are more pronounced…" |

## 1. App 现状（已读原档确认，fitness/index.html）

- 力量：A/B/C 三套，每次 热身 4 分＋超级组×2（约 15 分）＋「燃脂收尾」6 分＋放松 3 分≈28–30 分（line 468）。
  `PLAN`（line 872）每套 4 个复合动作；`FIN`（line 857）A=6 分 AMRAP（深蹲推举＋登山者）、B=40/20×6、C=6 分 AMRAP（波比＋碰肩）。
- 有氧：`CD_WEEKS`（line 1941）。每周分钟（用 `cdMinutes` 算：4×4 一次 4 轮=40 分、3 轮=33 分；30/30 做 10–15 回合=25–30 分）：
  第1周 90、第2周 105、第3周 120、第4周 113、第5周 120、第6–8周 130、第9周 155、第10–11周 157–160、第12周 160。
- 营养：**App 里没有任何热量／蛋白／饮食记录**。全档只有一处文字（line 499）。体重／腰围有记录。
  （grep「热量|卡路里|蛋白|nutrition|calorie|protein|meal」：仅 line 499 与 line 510 提到 Garmin 记卡路里。）
- App 里与「减脂」有关的原话：
  1. `<title>减脂力量训练`、`<h1>全身减脂力量训练`、meta「30 分钟全身减脂力量训练」
  2. 「燃脂收尾 6 分钟」（line 468，同名出现在 line 1373 区块标题、1709 步骤名）
  3. 「体重下降主要来自**饮食的热量缺口**；力量训练的作用是减脂期间**保住肌肉**，让瘦下来的是脂肪。」（line 499）
  4. 「训练日以外多走路、多活动，效果比多加一次训练更容易累积。」（line 500，**无来源**）
  5. 「体重几周不动但腰围在变小，也是在进步」（line 502）
  6. 有氧页 CD_WHY：只谈 VO2max，**没有**宣称减脂（好）。

## 2. 问题 1：只运动、不改饮食，能减多少？

| 研究 | 数字 | 状态 |
|---|---|---|
| Thorogood 2011 Am J Med 124:747，14 个 RCT、1847 人，纯有氧 | 6 个月体重 **−1.6 kg**（95%CI −1.64~−1.56）、腰围 **−2.12 cm**；12 个月 −1.7 kg、腰围 −1.95 cm。结论「isolated aerobic exercise is not an effective weight loss therapy」 | 【已读摘要】 |
| Swift 2014 Prog Cardiovasc Dis 56:441 | 「aerobic ET programs consistent with public health recommendations may promote up to modest weight loss (~2 kg)… unless the overall volume of aerobic ET is very high, clinically significant weight loss is unlikely」 | 【转述】 |
| Swift 2018 Prog Cardiovasc Dis 61:206 | 「minimum guidelines for aerobic PA… generally inadequate for clinically significant weight loss or weight maintenance without caloric restriction」 | 【转述】 |
| Church 2009 PLoS ONE（DREW，411 名绝经后女性，6 个月，不限饮食） | 每周消耗 4、8、12 kcal/kg（约 72、136、194 分钟/周），全程监督：实际 **−1.4、−2.1、−1.5 kg**；预测 −1.0、−2.0、**−2.7 kg**。4/8 组与预测相符；12 组只减了预测的约一半，代偿 **1.2 kg**；所有组腰围都降、与体重变化无关 | 【已读摘要】（初稿写「12 组预测 3.9、实际 2.7」是错的：2.7 是**预测值**，实际只有 1.5，已更正） |
| Donnelly 2013 Obesity 21(3):E219-28（Midwest Exercise Trial 2，141 人、平均 22.6 岁，10 个月，每周 5 天、每次 400 或 600 kcal，不限饮食，**有人监督**；只分析完成 ≥90% 课次者） | 400 组 **−3.9 kg**（4.3%）、600 组 **−5.2 kg**（5.7%），对照 +0.5 kg；两运动组之间、组内男女之间差异都**不显著** | 【已读摘要】（男女差异的矛盾已裁决：摘要结论「no significant difference between men and women」） |
| Ross 2000 Ann Intern Med（52 位肥胖男性，约 12 周，每天运动耗 700 kcal，不限饮食） | 体重 −7.5 kg（8%）；脂肪减少比节食组还多 1.3 kg（0.3~2.3） | 【转述】；注意这是**每天 700 kcal 监督下运动**，约是本计划的 5~7 倍 |
| Wewege 2017 Obes Rev 18:635（13 个 RCT、424 人，HIIT vs 持续中强度，18–45 岁超重/肥胖） | 全身脂肪量 HIIT **−1.7 kg**、持续有氧 **−2.1 kg**，腰围各 **−3 cm**，两者无显著差 | 「无显著差、HIIT 省约 40% 时间」【已读摘要】；kg／cm 数字摘要里没有，仍【转述】（全文付费）。摘要另说骑车类训练没减到脂肪、体重本身几乎不变 |

**本计划的运动量（【推论】，MET 值取常见概数：力量 4–6、轻松有氧约 6、间歇平均约 7；体重假设 75 kg，用户实际体重未知）：**
- 力量 2–3 次×约 30 分，净耗约 3–7 kcal/kg/周；有氧第 5–8 周约 11 kcal/kg/周、第 9–12 周约 14 kcal/kg/周。
  合计高峰期约 **14–20 kcal/kg/周，75 kg ≈ 1000–1500 kcal/周**，大致落在 Church 的 12 KKW 档上下。
- 理论（7700 kcal≈1 kg 脂肪，Hall 2011 指出这条规则偏简化）12 周约 1.5–2.3 kg；再按 Church 的代偿（高剂量约打对折）→ 实际更像
  **12 周 1–3 kg 脂肪、腰围 −2~−3 cm**。这是我的估算，不是某篇论文的结论。
- 对照：Midwest Exercise Trial 2 是每周 2000–3000 kcal、有人监督，10 个月才 4–5 kg；本计划量只有它的约一半到三分之一。

结论：单靠这套运动，**能减一点（脂肪 1–3 kg／12 周量级），但不是「明显瘦」；体重秤可能几乎不动**（力量训练同时长肌肉，见问题 2）。

## 3. 问题 2：力量训练减脂／保肌？

- **Wewege 2022 Sports Med 52:287–300**（58 个研究、54 个入 meta；健康成人，≥4 周全身力量训练 vs 不运动对照）【已读摘要，数字一致】：
  体脂率 **−1.46%**（95%CI −1.78~−1.14）、脂肪量 **−0.55 kg**（−0.75~−0.34）、内脏脂肪 SMD −0.49；
  「训练量与训练成分和效应大小无关」；用更准的测量（扫描）时效果偏小。
  → 力量训练**有**减脂效果，但很小（约半公斤量级），且是跟「不运动」比。
- **Willis 2012 J Appl Physiol 113:1831**（STRRIDE AT/RT，119 人、8 个月，不限饮食）【转述】：
  AT（有氧）和 AT/RT 的体重、脂肪量降幅都**大于单练力量 RT**，AT 与 AT/RT 之间无差；RT 与 AT/RT 增加瘦体重**多于 AT**。
  作者结论：「AT is the optimal mode of exercise for reducing fat mass and body mass, while a program including RT is needed for increasing lean mass」。
  具体 kg 值：【未查证】（摘要转述里没有）。
- **保肌（节食时）**：Cava 2017 Adv Nutr 8:511（综述）【转述】：「High protein intake helps preserve lean and muscle mass during weight loss… Both endurance and resistance exercise help preserve muscle mass, and resistance exercise also improves strength」；结论是低热量饮食＋够量（非过量）蛋白＋增加活动、尤其力量型运动。
  Weinheimer 2010 Nutr Rev 68:375（52 个研究，系统综述，无 meta）【转述】：节食组 81% 有 ≥15% 的减重来自去脂体重；节食＋运动组 39%；纯运动组 0% 掉超过 1.5 kg 去脂体重——但该综述的运动**以有氧为主**，不是力量训练。另有评论指其方法学有限制。
  Miller 2013 PLoS ONE 系统综述（只见转述）：节食＋运动比单节食更能多减脂并保住瘦体重，视运动类型而定。【转述，二手的二手】
- 本计划只有「力量」＋「有氧」，**两者并行**：符合 Willis 结论里「有氧管减脂、力量管瘦体重」的分工。

## 4. 问题 3：6 分钟收尾／HIIT 比稳态有氧更「燃脂」？「后燃」？

- **减脂效果相当**：Wewege 2017（见上）HIIT 与 MICT 体成分各项无显著差，HIIT 优势是**省时间**（约少 40% 训练时间）【已读摘要】；−1.7 vs −2.1 kg 两个数【转述，摘要无】。
  同年另一篇 Obes Rev meta（31 个研究，Keating 等；作者名为我的记忆，搜索只给了「31 studies」）：HIIT/SIT 与 MICT 体脂无差，且「neither… produced clinically meaningful reductions in body fat」【转述；作者名【未查证】】。
- **Viana 2019 BJSM 53:655 不能引用**：原摘要结论「Interval training provided 28.5% greater reductions in total absolute fat mass (kg) than MOD」（组间 −2.28 kg）【已读摘要】；该文**已撤稿**【已读原文：Retraction Watch 2020-12-18 报道 https://retractionwatch.com/2020/12/18/i-dropped-the-ball-magic-bullet-falls-short-of-target/ 】。
  撤稿理由（RW 引撤稿通知原文）：纳入/排除研究不准确、部分研究的运动强度分类有误、部分效应量不准确、主结论与标题不可信；
  先前 2019-06 已有 expression of concern，BJSM 博客质疑「组间脂肪差 13.4 kg」的生理合理性。撤稿通知的确切日期（初稿写 12-15）未单独查证。
  → 不要拿 Viana 2019 当「HIIT 更减脂」的证据。
- **EPOC 后燃（已裁决）**：
  - Moniz/Islam/Hazell 2020 Scand J Med Sci Sports 30:638（**叙述性综述，不是 meta 分析**）【已读摘要】：
    HIIT 后 <1 小时内 EPOC 与 MICT 差异小，但 **24 小时尺度上 HIIT 更高**；冲刺间歇（SIT）在各时间点都比 MICT 高。
    原句："small differences in EPOC post-HIIT compared to MICT in the immediate (<1 hour) recovery period, but greater EPOC values post-HIIT when examined over 24 hours"。
  - 初稿的「说法 B」（"similar total O2 values and 24-h energy expenditure"）不是这篇摘要的话，可能是转述混进了某篇单一试验，**作废**。
  - 摘要只说「更高」，没给 24 小时的 kcal 数；所以「后燃有，但量小」的判断仍靠下面的二手量级。
  - 另有 2021 Obes Rev 系统综述（22 个研究）转述：EPOC 能量消耗 HIIE/SIE 大于 MICE。【转述】
  - 量级：流行科普转引 ACE/NSCA「EPOC 约占运动本身能量消耗的 6–15%」；NSCA 文章批评很多节目「以 EPOC 为卖点，而 EPOC 相对于训练本身的消耗很小」。【转述的科普/协会二手，原文【未查证】】
- 【推论】6 分钟收尾本身约耗 60–90 kcal（75 kg，8–10 MET），后燃再多 10–20 kcal；一周 3 次≈250–300 kcal，约 0.03–0.04 kg 脂肪/周。**有益但不是「燃脂主力」。**

## 5. 问题 4：每周分钟数达不达标？

- ACSM 2009 立场声明（Donnelly et al., Med Sci Sports Exerc 41:459；PMID 19127177）【已读摘要】：
  150–250 分/周中等强度：能预防增重、「will provide only modest weight loss」，在「moderate diet restriction but not severe diet restriction」的研究里能加强减重（两种说法摘要里都有，不矛盾）；
  >250 分/周：「have been associated with clinically significant weight loss」，减重后 >250 分/周维持较好（横断面/前瞻研究）。
  另：「Resistance training does not enhance weight loss but may increase fat-free mass and increase loss of fat mass」。
  「每周 225–420 分钟→减 5–7.5 kg」这句不在摘要里，仍【转述】。
- WHO 2020（Bull et al., Br J Sports Med 54:1451）【转述摘要】：成人每周 150–300 分中等强度，或 75–150 分高强度，或等效组合；鼓励规律肌力训练。
  「每周至少 2 天肌力」这句本次摘要里**没出现**，我凭记忆它写的是 ≥2 天——【未查证】。
- 本计划（【推论】）：每周力量 60–90 分＋有氧 90–160 分（见第 1 节）＝约 **150–250 分/周**，第 1–8 周偏低端（约 150–220），**第 9–12 周、每周 3 次力量时才接近 250**。
  力量训练算不算 ACSM 的「中等强度身体活动分钟」有争议，若只算有氧：90–160 分，**低于 150 的占前几周**（WHO 的 150 下限用「有氧」口径时，第 1、2、4 周未达）。
  结论：**达到 WHO 健康门槛（150）的边缘，远未到 ACSM 的「>250 分钟＝显著减重」。**
- 游泳 12 课：入门课（怕水到游 10 米），运动量小，不计入。

## 6. 问题 5：饮食贡献、蛋白质、两者合用

- 节食为主：见 Ross 2000（同样减 7.5 kg，节食要少吃 700 kcal/天；运动要多耗 700 kcal/天——后者实际难做到）；
  Church 2009 显示运动量增大时人会代偿（吃更多/少动）。
- 节食＋运动 vs 单节食：二手转述 2009 meta：加运动多减 **1.14 kg**（95%CI 0.21–2.07），且在 ≥2 年的研究里优势仍在；2014 年的一篇转述「WMD −1.1 kg」。【转述；篇名与作者我没拿到，【未查证】来源】
  Clark 2015 J Diabetes Metab Disord 14:31（66 个研究）结论：要改善体成分和代谢指标，**运动必须与饮食结合**。【转述，kg 数字【未查证】】
- 蛋白质：
  - Morton 2018 Br J Sports Med 52:376（49 个研究、1863 人，**健康成人力量训练增肌**）【已读摘要】：补蛋白使去脂体重多 +0.30 kg（0.09–0.52）；
    总摄入超过 **1.62 g/kg/天**（断点）后「resulted in no further RET-induced gains in FFM」；年纪越大效果越小，有训练经验者效果较大。
    注意：这不是节食期的研究。
  - Longland 2016 Am J Clin Nutr 103:738（40 位年轻男性、每组 20 人，4 周，**热量缺口约 40%**，每周 6 天力量＋HIIT）【已读摘要，数字一致】：
    2.4 g/kg/天比 1.2 g/kg/天——脂肪量 **−4.8 vs −3.5 kg**，瘦体重 **+1.2 vs +0.1 kg**。
    注意：样本是年轻男性、缺口大、训练量远高于本计划，外推要保守。
  - Helms 2014 JISSN 11:20（健美赛备赛综述，**不是随机试验**）【转述】：节食期蛋白 2.3–3.1 g/kg 去脂体重；「缺口越大，来自瘦体重的比例越高」。
  - Cava 2017 的蛋白具体 g/kg：本次摘要里没有 1.2–1.6 这组数；二手博客写约 1.3–1.6 g/kg/天并说需求并不确定。【未查证】
- 缺口大小：2013 AHA/ACC/TOS 肥胖指南（Jensen 2013，Circulation 2014;129(25 Suppl 2):S102-38，PMC5819889）【已读原文，推荐等级 A（强）】：
  三选一——「Prescribe 1200–1500 kcal/d for women and 1500–1800 kcal/d for men」；「Prescribe a 500-kcal/d or 750-kcal/d energy deficit」；或有证据的限制某类食物的饮食。
  同指南证据陈述还写了「500 kcal/d or 750 kcal/d or 30% energy deficit」。注意对象是**超重/肥胖成人**、且在综合生活方式干预里。
- 「节食＋力量＋有氧是证据最强的组合吗」：Cava、Clark、Weinheimer（弱）、Longland 的方向一致，主流立场支持；
  但没有一篇单一证据直接证明「这个具体计划＋某饮食」最优，这是整体共识而非单一试验。【推论】

## 7. 问题 6：App 文字逐条检视

| App 原话 | 证据支持吗 | 建议 |
|---|---|---|
| line 499「体重下降主要来自饮食的热量缺口」 | **支持**（Thorogood、Swift 2018、Church、Midwest） | 保留 |
| 「力量训练的作用是减脂期间保住肌肉，让瘦下来的是脂肪」 | **大致支持但不完整**：Cava 说蛋白＋运动保肌；Wewege 2022 显示力量训练本身也有小幅减脂（−0.55 kg）。「保肌」缺了蛋白这一半 | 补一句：保肌要靠「够蛋白＋有力量训练」 |
| line 500「训练日以外多走路…效果比多加一次训练更容易累积」 | **本次无来源**【未查证】；方向合理（Church 看到代偿），但「比…更容易累积」是断言 | 找来源或软化成「很多人发现…」 |
| 「燃脂收尾」（line 468/1373/1709） | **夸大**：减脂效果与稳态有氧相当（Wewege 2017），后燃只占 6–15%（二手），6 分钟本身耗能很小 | 改名为「心肺收尾／冲刺收尾」，或保留名并在说明里写清它主要练心肺与省时 |
| 标题/H1「全身减脂力量训练」「减脂训练」 | **品牌词偏强**：单靠训练 12 周约 1–3 kg 脂肪（推论）；App 又没有饮食部分 | 不必改标题，**但要给诚实预期＋饮食模块** |
| 「体重几周不动但腰围在变小，也是在进步」 | **支持**：Church 全剂量组腰围都降、与体重无关；Wewege 2017 腰围 −3 cm | 保留；可加上「腰围−2~3 cm／12 周是正常量级」 |
| 有氧页 CD_WHY（只说 VO2max） | 没宣称减脂，**不夸大** | 保留；可补一句「减脂效果与普通有氧差不多，选它是为了心肺」 |

## 8. 结论与建议（按优先级）

1. **加一个轻量营养模块**（最高优先）。不做逐餐热量记录；做：①起步一句话＋表单「蛋白目标 g/天」（建议 1.6 g/kg，依据 Morton 的上限与 Cava 方向；节食期更高的 2.0–2.4 只有年轻男性短期证据，别当默认）；②「温和缺口」说明（依据 2013 AHA/ACC/TOS 指南：每天少吃 500–750 kcal，或女 1200–1500／男 1500–1800 kcal/天；指南对象是超重/肥胖成人，体重正常者可取低端 500）；③每周体重趋势（周均值）＋腰围趋势，3 周不动就提示「检查饮食」。
2. **重写 line 499–502 那一块的预期**：加上「只靠这套运动 12 周约 1–3 kg 脂肪、腰围 2–3 cm，体重秤可能几乎不动」（来源：Thorogood、Church、Wewege；其中「1–3 kg」是我对本计划的推论，写进 App 前需再确认）。
3. **「燃脂收尾」改名或补说明**；同时删去/软化任何后燃暗示（App 目前没写后燃字样，只是名字暗示）。
4. **line 500「更容易累积」补来源或软化**。
5. 有氧计划与力量频率**不必为了「减脂」去加量**：Wewege 2022 称训练量与力量训练减脂效果无关；4×4 的价值在 VO2max（CD_WHY 已如此写）。想拉近 ACSM 250 分钟，较便宜的做法是多走路而不是加训练，但此点的来源**未查证**。
6. 如果日后补自检（制度铁律 4）：写一条 `check-fitness` 断言——App 里不得再出现「后燃」「燃脂」类夸大文字？这是纯审美/措辞判断，难做成可靠脚本；可只守「营养模块里蛋白 g/kg × 体重」的算术（手算 fixture）。

## 9. 未解决／未查证清单

- 已于 2026-11-13 复核 11 项（见「查证状态」表）；以下仍未查证：
- Wewege 2017 的 −1.7／−2.1 kg 与腰围 −3 cm（摘要没有，全文付费）；Viana 撤稿通知的确切日期。
- Willis 2012 的 kg 数值、Cava 2017 的蛋白 g/kg 具体区间、WHO「每周 ≥2 天肌力」原话、
  2009「运动加饮食多减 1.14 kg」meta 的篇名与作者、Keating 2017 作者名：均未查证。
- 「多走路效果比加一次训练更容易累积」无来源。
- 我的 MET/kcal 估算依赖假设体重 75 kg 与概数 MET，没有用户真实体重。

## 10. 来源 URL（「查证状态」表里那 11 项已经 CI 读过原文/摘要；其余仍只见于搜索结果）

- ACSM 2009：https://pubmed.ncbi.nlm.nih.gov/19127177/
- WHO 2020：https://digibug.ugr.es/handle/10481/66573（BJSM 54:1451；原文 https://bjsm.bmj.com/content/54/24/1451 搜索转述提到）
- Wewege 2022：https://link.springer.com/article/10.1007/s40279-021-01562-2 （搜索结果里是 Springer 镜像 PDF；新闻稿 https://www.unsw.edu.au/newsroom/news/2021/09/strength-training-can-burn-fat-too--myth-busting-study-finds ）
- Wewege 2017：https://pubmed.ncbi.nlm.nih.gov/28401638/
- Viana 2019 撤稿：https://retractionwatch.com/2020/12/18/i-dropped-the-ball-magic-bullet-falls-short-of-target ；摘要页 https://pubmed.ncbi.nlm.nih.gov/30765340/
- Midwest Exercise Trial 2：https://pmc.ncbi.nlm.nih.gov/articles/PMC3361612 （搜索转述里标为设计论文，与主结果文章可能不是同一篇；主结果数字来自 Donnelly 2013 Obesity 摘要转述）
- Church 2009 DREW：https://doi.org/10.1371/journal.pone.0004515 ，https://pmc.ncbi.nlm.nih.gov/articles/PMC2639700
- Willis 2012：https://pubmed.ncbi.nlm.nih.gov/23019316/ ，https://pmc.ncbi.nlm.nih.gov/articles/PMC3544497
- Thorogood 2011：https://cris.bgu.ac.il/en/publications/isolated-aerobic-exercise-and-weight-loss-a-systematic-review-and-2/
- Swift 2014：https://pubmed.ncbi.nlm.nih.gov/24438736/ ；Swift 2018：https://repository.lsu.edu/kinesiology_pubs/262
- Ross 2000：https://pubmed.ncbi.nlm.nih.gov/10896648/
- Morton 2018：https://pubmed.ncbi.nlm.nih.gov/28698222/
- Longland 2016：https://pubmed.ncbi.nlm.nih.gov/26817506/
- Helms 2014：https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492
- Cava 2017：https://pmc.ncbi.nlm.nih.gov/articles/PMC5421125
- Weinheimer 2010：https://pubmed.ncbi.nlm.nih.gov/20591106/
- Moniz 2020（EPOC）：https://pubmed.ncbi.nlm.nih.gov/31830334/
- Hall（3500 kcal 规则）：https://pmc.ncbi.nlm.nih.gov/articles/PMC3859816（搜索结果列出，转述未确认到具体论文）
