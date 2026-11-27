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

## 洗髓功能量消耗（2026-11-18 查证）

用途：估算洗髓功（站姿慢动作导引，按「太极/气功」类）每次 40 分钟的能量消耗与心率强度。
示范对象：40 岁、72 kg、每次 40 分钟、每周 7 次（**示范假设，不是用户实测**）。

### 1. MET 值——用的是 **2024 Adult Compendium**（网站 pacompendium.com 读得到，没退回 2011 版）

CI 读网页 run **44300187524**（web-lookup.yml）原文行：

| 网址 | 原文（Code / MET / Activity Description） |
|---|---|
| https://pacompendium.com/sports/ | `15670 3.3 Tai chi, qi gong, general` |
| 同上 | `15672 1.5 Tai chi, qi gong, sitting, light effort` |
| 同上 | `15674 6.0 Tai chi chuan, Yang style` |
| https://pacompendium.com/conditioning-exercise/ | `02101 2.3 Stretching, mild` |
| 同上（对照） | `02140 2.5 Video, exercise workouts, TV conditioning programs (e.g., yoga, stretching, seated), light effort` |
| https://pacompendium.com/walking/ | `17190 3.8 Walking, 2.8 to 3.4 mph, level, moderate pace, firm surface` |
| 同上 | `17200 4.8 Walking, 3.5 to 3.9 mph, level, brisk, firm surface, walking for exercise` |
| 同上 | `17220 5.5 Walking, 4.0 to 4.4 mph (6.4 to 7.1 km/h), level, firm surface, very brisk pace` |

- 2024 版**没有**「tai chi / qi gong, moderate」或「vigorous effort」这类分级码；太极/气功只有上面三条（15670 一般、15672 坐姿轻度、15674 杨式太极拳）。
- 页面注脚原文：「Specific Activity Codes in red are estimated MET values. All other values are supported with published literature.」——
  15670 是否标红（估算值）**未查证**（纯文字提取看不到颜色；fetch-url 抓 HTML 原文回 403，run 44300288734）。
- 2024 版适用年龄（PubMed 摘要，run 44300192565）：「This 2024 update was tailored for adults 19-59 years of age by removing data from those ≥60 years.」
- 洗髓功套 15670（3.3）是**归类推论**：Compendium 没有「洗髓功」条目，站姿慢动作导引最接近「Tai chi, qi gong, general」。

### 2. ACSM 心率强度分级（%HRmax）

- Garber 2011（PMID 21694556）正文表格**未能直读**：LWW 全文页只给摘要（run 44300283606），
  唯一开放全文是 URI Digital Commons 的 PDF（https://digitalcommons.uri.edu/kinesiology_facpubs/137 ，OpenAlex/Semantic Scholar 查到，run 44300568696），
  现有 CI 通道不会解析 PDF。
- 二手引用（Sensors 2026, PMC13210717, https://pmc.ncbi.nlm.nih.gov/articles/PMC13210717/ ，run 44300738967）原文：
  「moderate-intensity cycling (64–76% HRmax) and vigorous-intensity cycling (77–95% HRmax)」
  → 中等 64–76%、剧烈 77–95% 有二手佐证；**「很轻 <57%」「轻 57–63%」两档未查证**（常被引用为 Garber 2011 表 2，但这次没读到原文）。
- 摘要里查得到的原句（run 44300192565）：「The ACSM recommends that most adults engage in moderate-intensity cardiorespiratory exercise training for ≥30 min·d on ≥5 d·wk for a total of ≥150 min·wk, vigorous-intensity cardiorespiratory exercise training for ≥20 min·d on ≥3 d·wk (≥75 min·wk) … to achieve a total energy expenditure of ≥500-1000 MET·min·wk.」

### 3. 最大心率公式

Tanaka 2001（PMID 11153730，https://pubmed.ncbi.nlm.nih.gov/11153730/ ，PubMed efetch run 44300192565）原文：
- 「The age-predicted HRmax equation (i.e., 220 - age) is commonly used as a basis for prescribing exercise programs」
- 「CONCLUSIONS: 1) A regression equation to predict HRmax is 208 - 0.7 x age in healthy adults.」
- 「Our findings suggest that the currently used equation underestimates HRmax in older adults.」

### 4. kcal 公式的来源

- pacompendium.com 首页「Definition of Terms」（run 44300283606）：「MET ( Metabolic Equivalent ) : The ratio of the work metabolic rate to the resting metabolic rate. One MET is defined as 1 kcal/kg/hour and is roughly equivalent to the energy cost of sitting quietly.」
- Herrmann 2024 全文 2.5 节（https://pmc.ncbi.nlm.nih.gov/articles/PMC10818145/ ，run 44300283606）：「METs reflect the ratio of a PA's energy cost in mL/kg/min relative to a standardized RMR of 3.5 mL/kg/min or approximately 1.0 kcal/kg/h.」
- 同文 4.1 节：「MET-minutes and MET-hours … are computed by multiplying the Specific Activity MET value by the duration of the reported PA in minutes or hours.」
- 所以 kcal ≈ MET × 体重(kg) × 小时 是由「1 MET ≈ 1 kcal/kg/h」直接推出；文中没有一句话把整条公式写出来（工具每行只印前 300 字，4.3 节「Relative EE and absolute EE」后半段没读到）。
  同文 4.3 节开头提醒：Compendium 原本用于流行病学研究，拿来算个人能量消耗有误差（标准 RMR 3.5 mL/kg/min 不一定合个人）。

### 5. 计算（40 岁、72 kg、40 分钟 = 0.6667 小时）

能量：毛消耗 = MET × 72 × 0.6667；净消耗（扣掉本来坐着也会烧的 1 MET）= (MET − 1) × 72 × 0.6667

| 代码 | MET | 毛 kcal/次 | 净 kcal/次 | 毛 kcal/周（×7） | 净 kcal/周（×7） |
|---|---|---|---|---|---|
| 15670 太极/气功 一般 | 3.3 | 3.3×72×0.6667 = **158.4** | 2.3×72×0.6667 = **110.4** | **1109** | **773** |
| 15672 太极/气功 坐姿轻度 | 1.5 | 72.0 | 24.0 | 504 | 168 |
| 02101 轻度伸展 | 2.3 | 110.4 | 62.4 | 773 | 437 |
| 17190 步行 2.8–3.4 mph（对照） | 3.8 | 182.4 | 134.4 | 1277 | 941 |
| 17200 快走 3.5–3.9 mph（对照） | 4.8 | 230.4 | 182.4 | 1613 | 1277 |

- 主估算取 15670：**每次约 158 kcal（净约 110 kcal），每周约 1109 kcal（净约 773 kcal）**。
- MET·min：3.3 × 40 = 132 MET·min/次，×7 = 924 MET·min/周（落在 ACSM「≥500–1000 MET·min·wk」区间内，但这是按 MET 值算，不代表心率达到中等强度）。
- 【推论】净 773 kcal/周 ÷ 7700 kcal/kg（常用脂肪换算概数，来源未在本节查证）≈ 0.1 kg 脂肪/周，前提是饮食不变、没有代偿。

心率：40 岁
- 220 − 40 = **180** bpm；Tanaka：208 − 0.7×40 = 208 − 28 = **180** bpm（40 岁两式刚好相同；年纪越大两式差越多）。
- 100 ÷ 180 = **55.6% HRmax**（两式相同）。
- 对照 ACSM：低于中等下限 64%（二手佐证），所以**不算中等强度**；若按常被引用的 Garber 表「很轻 <57%」则属「很轻」——此档原文未查证。
- 注意：按常见的「3–5.9 MET＝中等」绝对强度分法（此分法这次**未查证原文**），3.3 MET 会算中等；按个人心率 55.6% 却在中等以下。两种分级在这里不一致，以个人心率为准时它是低强度练习。

### 6. 未查证

- Garber 2011 表格原文（尤其「很轻 <57%」「轻 57–63%」两档）。
- 15670 在 2024 网站上是否标红（估算值）。
- Herrmann 2024 第 4.3 节后半段原文。
- 7700 kcal/kg 脂肪换算的来源。

run 一览：web-lookup 44300187524（Compendium 三页）、44300283606（PMC 全文＋首页定义＋LWW）、44300568696（OpenAlex/S2 开放全文位置）、
44300657838（EuropePMC 检索＋URI 页面）、44300738967（PMC13210717 心率分级）；fetch-url 44300192565（PubMed efetch 4 篇摘要）、44300288734（pacompendium HTML，403 失败）。

## 16/8 限时进食（TRE）、蛋白分餐、安全（2026-11-19 查证）

用途：fitness App 新增「饮食」页。用户（男、40 岁、72 kg）**现在就在做 16/8**（每天 8 小时内吃完）。
通道：全部走 CI 读原文，没有绕过任何防护。PubMed efetch 用 `mode=html`（纯文字模式会把「P < .001 … >」之间当成 HTML 标签吃掉，
run 44452912713 就这样丢了半句；改用 html 模式的 run 44453015577 是完整的）。

run 一览：fetch-url 44453015577（Lowe／Liu／Moro／Tinsley／Jäger 五篇摘要）、44452930206（esearch：TRE meta 2023–2026，11 篇）、
44452934220（esearch：IF＋低血糖综述，14 篇）、44452998720（25 篇 docsum 标题）、44453060939（Fernandes-Alves／Sun／Črešnovar／Yi／Xie／Varady／Santos 七篇摘要）；
web-lookup 44453091164（Lowe 2020 PMC 全文 PMC7522780）。

### 查证状态

| # | 说法 | 状态 | 来源 | 原文引句 |
|---|---|---|---|---|
| T1 | Lowe 2020 TREAT：16:8（12–20 点随意吃）12 周，体重与「一天三餐」组没有差别 | 已读摘要＋全文 ✔ | JAMA Intern Med 2020;180(11):1491，PMID 32986097，https://pubmed.ncbi.nlm.nih.gov/32986097/ | "There was a significant decrease in weight in the TRE (-0.94 kg; 95% CI, -1.68 to -0.20; P = .01), but no significant change in the CMT group (-0.68 kg; 95% CI, -1.41 to 0.05, P = .07) or between groups (-0.26 kg; 95% CI, -1.30 to 0.78; P = .63)."；"CONCLUSIONS AND RELEVANCE: Time-restricted eating, in the absence of other interventions, is not more effective in weight loss than eating throughout the day." |
| T1b | Lowe 2020：TRE 组掉的体重约 65% 是瘦体重；作者强调 TRE 时要吃够蛋白 | 已读全文 ✔（PMC7522780，run 44453091164；工具每行只印前约 300 字） | 同上，Discussion | "In the in-person cohort, the average weight loss in the TRE group was 1.70 kg. Of this, 1.10 kg (approximately 65% of weight lost) was lean mass; only 0.51 kg of weight loss was fat mass."；"Together, these data highlight the importance of adequate protein consumption while adhering to a TRE diet."；摘要："There was also a significant difference in appendicular lean mass index between groups (-0.16 kg/m2; 95% CI, -0.27 to -0.05; P = .005)." |
| T2 | Liu 2022 NEJM：同样限热量（男 1500–1800 kcal），加 8 小时进食窗 12 个月，体重、体脂、瘦体重都没比单纯限热量好 | 已读摘要 ✔ | N Engl J Med 2022;386:1495，PMID 35443107，https://pubmed.ncbi.nlm.nih.gov/35443107/ | "The mean weight loss from baseline at 12 months was -8.0 kg (95% confidence interval [CI], -9.6 to -6.4) in the time-restriction group and -6.3 kg (95% CI, -7.8 to -4.7) in the daily-calorie-restriction group. Changes in weight were not significantly different in the two groups at the 12-month assessment (net difference, -1.8 kg; 95% CI, -4.0 to 0.4; P = 0.11)."；"CONCLUSIONS: Among patients with obesity, a regimen of time-restricted eating was not more beneficial with regard to reduction in body weight, body fat, or metabolic risk factors than daily calorie restriction." |
| T3 | Fernandes-Alves 2026 meta（30 个 RCT、1341 人）：TRE 比对照多减体重与脂肪，但**去脂体重也多掉** | 已读摘要 ✔ | Nutr Rev 2026;84(3):463，PMID 40298934，https://pubmed.ncbi.nlm.nih.gov/40298934/ | "in studies using non-isocaloric controls, the TRE group showed significant reductions in body weight (BW) (mean difference [MD]: -2.82 kg; 95% CI: -3.49, -2.15), fat mass (FM) (MD: -1.36 kg; 95% CI: -2.09, -0.63), and fat-free mass (FFM) (MD: -0.86 kg; 95% CI: -1.23, -0.49). In studies that used isocaloric control strategies, the TRE group showed significant reductions in BW (MD: -1.46 kg; 95% CI: -2.65, -0.26), FM (MD: -1.50 kg; 95% CI: -2.77, -0.24), and FFM (MD: -0.41 kg; 95% CI: -0.79, -0. 03)." |
| T3b | Črešnovar 2023 meta（7 个 RCT）：TRE＋限热量 比 单纯限热量 多减约 2 kg | 已读摘要 ✔ | Nutrients 2023;15:4911，PMID 38068769 | "TRE with CR compared to CR alone resulted in significantly greater reductions in body weight (MD: -2.11 kg, 95% CI: -2.68 kg to -1.54 kg…), body fat mass (MD: -0.75 kg…), and waist circumference (MD: -1.27 cm…)" |
| T3c | Sun 2023 meta（8 个 RCT、579 人）：TRE＋CR 对比 CR 体重 −1.40 kg | 已读摘要 ✔ | Eur J Clin Nutr 2023;77:1014，PMID 37488260 | "TRE with CR reduced the body weight, fat mass, and waist circumference significantly (WMD: -1.40, 95% CI: -1.81 to -1.00…; WMD: -0.73…; WMD: -1.87…)"；"compared with CR alone, TRE plus CR exhibited no significant benefit on the blood pressure, glucose profile, and lipid profile." |
| T3d | Xie 2024 meta（20 个研究、1288 人）：TRE 可能减少瘦体重 | 已读摘要 ✔ | Nutrients 2024;16:3390，PMID 39408357 | "Although it may potentially reduce lean mass and increase LDL, these effects do not pose significant safety concerns." |
| T4 | Moro 2016：有训练的男性，16/8（13、16、20 点三餐）＋力量训练 8 周、热量相同，脂肪下降、去脂体重与最大力量维持 | 已读摘要 ✔ | J Transl Med 2016;14:290，PMID 27737674 | "After 8 weeks, the 2 Way ANOVA (Time * Diet interaction) showed a decrease in fat mass in TRF compared to ND (p = 0.0448), while fat-free mass, muscle area of the arm and thigh, and maximal strength were maintained in both groups. Testosterone and insulin-like growth factor 1 decreased significantly in TRF" |
| T5 | Tinsley 2019：有训练的女性，TRF（12–20 点）＋力量训练＋蛋白 1.6 g/kg/天，8 周，去脂体重增加与对照相当 | 已读摘要 ✔ | Am J Clin Nutr 2019;110:628，PMID 31268131 | "Energy and protein intake (1.6 g/kg/d) did not differ between groups despite different feeding durations (TRF and TRFHMB: ∼7.5 h/d; CD: ∼13 h/d). Comparable fat-free mass (FFM) accretion (+2% to 3% relative to baseline) and skeletal muscle hypertrophy occurred in all groups."；"IF, in the form of TRF, did not attenuate RT adaptations in resistance-trained females." |
| P1 | ISSN 2017 蛋白立场：每餐约 0.25 g/kg 或 20–40 g，每 3–4 小时平均分配；一般运动者每天 1.4–2.0 g/kg；减脂期有训练者可能要 2.3–3.1 | 已读摘要 ✔ | Jäger 2017，J Int Soc Sports Nutr 14:20，PMID 28642676，https://pubmed.ncbi.nlm.nih.gov/28642676/ | "General recommendations are 0.25 g of a high-quality protein per kg of body weight, or an absolute dose of 20-40 g."；"These protein doses should ideally be evenly distributed, every 3-4 h, across the day."；"an overall daily protein intake in the range of 1.4-2.0 g protein/kg body weight/day (g/kg/d) is sufficient for most exercising individuals"；"Higher protein intakes (2.3-3.1 g/kg/d) may be needed to maximize the retention of lean body mass in resistance-trained subjects during hypocaloric periods." |
| S1 | 糖尿病用药者：断食要配合调药，否则有低血糖风险 | 已读摘要 ✔ | Varady 2026，Lancet Diabetes Endocrinol 14(9):778，PMID 42361830（Personal View）；Santos 2024，Nutr Rev 82:1437，PMID 37837312 | Varady："intermittent fasting is as effective as calorie restriction for improving glycaemic control and does not increase the risk of hypoglycaemia when medications are adjusted using simple rules"；"there are insufficient data to recommend its use in people with type 1 or gestational diabetes"。Santos："markers of glycemic control must be constantly monitored in clinical practice to reduce the risk of hypoglycemia and its related complications." |

### 结论（给 App 用）

- **16/8 主要是帮你少吃**：不限热量时（Lowe 2020）12 周跟正常三餐没差；同样限热量（Liu 2022，12 个月、139 人）也没比单纯限热量好。
  小型试验的 meta（Fernandes-Alves 2026、Črešnovar 2023、Sun 2023）算出多减约 1.4–2.8 kg，但同时去脂体重也多掉 0.41–0.86 kg（Fernandes-Alves）。
  → App 说法：「大型试验看不出额外好处；合并小型试验多减 1–3 kg，但瘦体重也多掉一点」。两边都写，不挑一边。
- **配力量训练＋够蛋白时肌肉保得住**：Moro 2016（男、热量相同）、Tinsley 2019（女、蛋白 1.6 g/kg）。对象都是**有训练经验的人**、8 周；两篇摘要都没写年龄，也没有针对 40 岁以上的专门试验。
- **分餐**：ISSN 每餐 0.25 g/kg 或 20–40 g、每 3–4 小时。8 小时窗口内 3 餐（例如 12、16、20 点）正好间隔 4 小时——这个时间表是 Moro 2016 的做法（13/16/20 点），App 写成「App 的安排」。
  72 kg × 0.25 = 18 g（每餐下限）；1.6 × 72 = 115.2 g/天 ÷ 3 ≈ 38 g/餐（落在 ISSN 20–40 g 内）——除法是【推论】。
- **安全**：健康成人没查到需要特别写的；糖尿病（尤其打胰岛素或吃降糖药）先问医生调药（Varady 2026、Santos 2024）。
- **未查证**：16/8 对 40 岁以上、体重正常男性的专门试验（这次没找）；Lowe 2020 全文 lean mass 段后半句（工具截断）。

### 补查（2026-11-19 verifier 退件后）：受试人数、Liu 女性热量与瘦体重、BMI 门槛

通道：fetch-url **44457121566**（PubMed efetch，mode=html：Lowe 32986097、Liu 35443107、Moro 27737674、Tinsley 31268131、WHO 亚洲 BMI 14726171）；
web-lookup **44457124797**（WHO 肥胖与超重 fact sheet）。没有绕过任何防护。

| # | 说法（App 用到的） | 状态 | 来源 | 原文引句 |
|---|---|---|---|---|
| T1c | Lowe 2020：116 人；对象 18–64 岁、BMI 27–43；平均 46.5 岁 | 已读摘要 ✔ | PMID 32986097 | "Overall, 116 participants (mean [SD] age, 46.5 [10.5] years; 70 [60.3%] men) were included in the study."；"men and women aged 18 to 64 years with a body mass index … of 27 to 43" |
| T2b | Liu 2022：139 人；男 1500–1800、**女 1200–1500** kcal；腰围、BMI、体脂、**瘦体重**的分析结果与主结果一致（＝没差别） | 已读摘要 ✔ | PMID 35443107 | "We randomly assigned 139 patients with obesity…"；"instructed to follow a calorie-restricted diet that consisted of 1500 to 1800 kcal per day for men and 1200 to 1500 kcal per day for women."；"Results of analyses of waist circumferences, BMI, body fat, body lean mass, blood pressure, and metabolic risk factors were consistent with the results of the primary outcome." 注意：Liu 的进食窗是 8:00–16:00 |
| T4b | Moro 2016：34 位有训练的男性 | 已读摘要 ✔ | PMID 27737674 | "Thirty-four resistance-trained males were randomly assigned to time-restricted feeding (TRF) or normal diet group (ND)." 摘要没写年龄 |
| T5b | Tinsley 2019：40 人（ITT；PP 24 人） | 已读摘要 ✔ | PMID 31268131 | "Forty participants were included in ITT, and 24 were included in PP." 摘要没写年龄 |
| B1 | WHO：成人 BMI ≥25 超重、≥30 肥胖；BMI＝kg/m² | 已读原文 ✔ | https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight | "overweight is a BMI greater than or equal to 25; and obesity is a BMI greater than or equal to 30."；"body mass index (BMI): weight (kg)/height² (m²)" |
| B2 | WHO 亚洲专家会议 2004：亚洲人 BMI <25 时高风险者已不少；没有统一门槛；行动点 23／27.5／32.5／37.5；国际分类仍用 WHO 门槛 | 已读摘要 ✔ | Lancet 2004;363:157，PMID 14726171 | "the proportion of Asian people with a high risk of type 2 diabetes and cardiovascular disease is substantial at BMIs lower than the existing WHO cut-off point for overweight (> or =25 kg/m2). However, available data do not necessarily indicate a clear BMI cut-off point for all Asians"；"The consultation also agreed that the WHO BMI cut-off points should be retained as international classifications."；"further potential public health action points (23.0, 27.5, 32.5, and 37.5 kg/m2)" |
| B3 | Jensen 2013：固定热量区间「通常按个人体重调整」 | 已读原文 ✔（见上方表第 10 项，run 43410438362） | PMC5819889 | "(kilocalorie levels are usually adjusted for the individual's body weight)" |

App 的判断（标在 UI 上）：
- 固定区间（男 1500–1800／女 1200–1500）**只在 BMI ≥25 时显示**，大字旁写「仅适用超重／肥胖成人，体重正常别直接用」——App 的保守判断（用 WHO 超重门槛；亚洲 23 起风险增加，所以 23–25 也只给温和少吃量）。
- BMI <25 或没填身高：默认「比平常少吃」，大字「最多约 500 kcal」，标 App 的保守判断。
- 年龄：Moro／Tinsley 摘要都没写年龄 → UI 写「摘要没写年龄；受试者是有训练经验的人，没有针对 40 岁以上的专门试验」（2026-11-19 第二次退件：原先「受试者偏年轻」没有引文，删）。
- 睡眠那句没查证，UI 标「App 的做法，未查证」。减量周的用意标「App 的做法」。

### 补查（2026-11-19 第二次 verifier 退件）：BMI 偏低门槛

通道：web-lookup **44493893817**（WHO GHO BMI 主题页＋WHO 营养不良 fact sheet）。没有绕过任何防护。

| # | 说法 | 状态 | 来源 | 原文引句 |
|---|---|---|---|---|
| B4 | WHO：成人 BMI 低于 18.5 算体重过轻（underweight） | 已读原文 ✔ | https://www.who.int/data/gho/data/themes/topics/topic-details/GHO/body-mass-index | "Underweight among adults, BMI < 18.5, prevalence (age-standardized estimate) (%)" |

App 的判断：BMI <18.5 → 不显示任何热量差额与「热量怎么定」切换，大字「BMI 偏低，不建议用这个页面减重（App 的保守判断）」；
「先问医生或营养师」标 App 的做法。自检：check-fitness 第 19 段（50 kg／171.5 cm＝BMI 17.0）。

## 加量开关：每个动作 4 组、加练手臂（2026-11-23 查证）

用户（40 岁男、每周 2 次健身房版、减脂中）拍板：只要两个**默认关**的开关，自己想用再开。App「更多 → 设置」里
`#sets4Why`／`#armsWhy`／`#addVolNote` 的每句事实都要对得上这里的引句；对不上的标「App 的安排／保守判断」。
摘要原文由 CI `fetch-url.yml`（PubMed efetch，run 45200538485，2026-11-23）读回。

| 说法（App 文案） | 来源 | 原文引句 |
|---|---|---|
| 15 个研究的汇总，每周每多做 1 组，效果量 +0.023、肌肉增长百分比 +0.37% | Schoenfeld 2017，PMID 27433992（J Sports Sci） | "The final analysis comprised 34 treatment groups from 15 studies. Outcomes for weekly sets as a continuous variable showed a significant effect of volume on changes in muscle size (P = 0.002). Each additional set was associated with an increase in effect size (ES) of 0.023 corresponding to an increase in the percentage gain by 0.37%." |
| 每周组数分 <5、5–9、10+ 三档只有趋势、未达显著 | 同上 | "Outcomes for weekly sets as a three-level categorical variable (<5, 5-9 and 10+ per muscle) showed a trend for an effect of weekly sets (P = 0.074)." |
| 总量一样时每周练几次不影响增肌 | Schoenfeld 2019，PMID 30558493 | "Results showed no significant difference between higher and lower frequency on a volume-equated basis."、"there is strong evidence that resistance training frequency does not significantly or meaningfully impact muscle hypertrophy when volume is equated." |
| 10 名未训练男性、8 周，一只手臂弯举、另一只划船；弯举那只肘屈肌厚度 +11.06%、划船 +5.16%；每次 4–6 组做到力竭 | Mannarino 2021，PMID 31268995（J Strength Cond Res） | "Ten untrained men were assigned to an 8-week RT program for elbow flexors, one arm performing DR and the other performing BC in a within-subject design."、"(4-6 sets, 8-12 repetitions to concentric failure, 2 sessions per week)"、"Single-joint BC exercise resulted in higher hypertrophy of elbow flexors (11.06%) than the DR (5.16%) multijoint exercise after 8 weeks of RT (p = 0.009)." |
| 20 名未训练男性，多加单关节动作：力量与皮褶没有差别，屈臂围度 +5.2% 对 +4.0% | Barbalho 2018，PMID 30662699（Eur J Transl Myol） | "Twenty untrained men were randomized to MJ or MJ+SJ groups for 8 weeks."、"with no significant difference between them"（10RM）、"skinfolds were significant for both groups, with no difference between them. However, the flexed arm circumference increased significantly more for MJ+SJ (5.2%), than for MJ (4.0%)." |
| 同一第一作者另一篇同类研究已被撤稿；这一篇有没有问题本 App 没查证 | PMID 31072272（撤稿，委派时给的；本轮没再读撤稿公告） | — |

App 自己的安排／判断（没有来源，文案已标）：
- 平常 3 组、开关后 4 组；减量周一律 2 轮（App 的安排）。
- 手臂 2 轮、减量周 1 轮、10–12 下（App 的保守安排；Mannarino 是 4–6 组做到力竭，App 远低于它）。
- 徒手版不加手臂：徒手能练手臂的都是多关节动作（窄距俯卧撑、反手桌下划船），跟课表的推、拉重复；两篇研究比较的是**另外加单关节**动作（App 的判断）。
- 提醒（App 的保守判断）：减脂期先只开一个、观察 2–3 周；重量连续两次推不上去、酸痛超过 3 天、睡眠变差、不想去练，两项以上就关掉。
- 「全部约几分钟」：每组按 45 秒（使用说明原本「超级组 ×2 约 15 分钟」＝12×45＋6×60 秒反推），其余照跟练步骤秒数（App 的估算）。
- 动作要领来源：StrengthLog 的 dumbbell-curl／cable-curl／tricep-pushdown／dumbbell-standing-triceps-extension 页（CI `web-lookup.yml` 读回，引句写在 `tools/lib/fitness-anim-spec.json` 那四条的 note）。坐姿、背靠椅背做过头臂屈伸是 App 的安排（来源写的是站姿）。

## 每个动作各自的休息时间、体重每周速度（2026-11-24 查证）

用户拍板三项新功能（史密斯机算片、每个动作各自的休息、体重卡目标线＋每周平均），点子来自开源项目 openGym（AGPL），**只借思路，没读也没复制它的代码或素材**。
查证走 CI：PubMed esearch（`web-lookup.yml`）→ efetch `retmode=text`、`fetch-url.yml` mode=html。

| 来源 | PMID／网址 | run ID | 原文引句 |
|---|---|---|---|
| Schoenfeld 2016 J Strength Cond Res | 26605807 | 45346071024 | "The study period lasted 8 weeks with subjects performing 3 total body workouts a week comprised 3 sets of 8-12 repetition maximum (RM) of 7 different exercises per session"；"Twenty-one young resistance-trained men were randomly assigned to either a group that performed a resistance training (RT) program with 1-minute rest intervals (SHORT) or a group that employed 3-minute rest intervals (LONG)"；"Maximal strength was significantly greater for both 1RM squat and bench press for LONG compared to SHORT. Muscle thickness was significantly greater for LONG compared to SHORT in the anterior thigh"；"longer rest periods promote greater increases in muscle strength and hypertrophy in young resistance-trained men" |
| Grgic 2017 Eur J Sport Sci（系统综述，6 个研究） | 28641044 | 45346071024 | "Current evidence indicates that both short and long inter-set rest intervals may be useful when training for achieving gains in muscle hypertrophy. Novel findings involving trained participants … suggest a possible advantage for the use of long rest intervals"；短＝"≤60 s"、长＝">60 s" |
| Singer 2024 Front Sports Act Living（Bayesian 统合，9 个研究） | 39205815（PMC11349676） | 45346071024 | "results suggest a small hypertrophic benefit to employing inter-set rest interval durations >60 s, perhaps mediated by reductions in volume load. However, our analysis did not detect appreciable differences in hypertrophy when resting >90 s between sets" |
| ACSM 2009 立场声明（摘要） | 19204579 | 45346146031 | 增肌："emphasis on the 6-12 RM zone using 1- to 2-min rest periods between sets"；重负荷进阶："using 3- to 5-min rest periods" |
| NHS「Tips to help you lose weight」 | https://www.nhs.uk/live-well/healthy-weight/managing-your-weight/tips-to-help-you-lose-weight/ | 45346209569 | "aim to lose 1 to 2lbs, or 0.5 to 1kg, a week" |
| NHS「Obesity – treatment」 | https://www.nhs.uk/conditions/obesity/treatment/ | 45346209569 | "try to lose weight steadily – aim to lose 1 to 2lbs, or 0.5 to 1kg, a week" |

没读到的：NHS `better-health/lose-weight/` 与 `managing-your-weight/` 两页没有速度的句子；`losing-weight/`、`start-the-nhs-weight-loss-plan/` 回 404（run 45346145873／45346209569）。

**App 怎么用（措辞不比原文强）**：
- 默认（**App 的安排**）：多关节大动作 90 秒；小动作（反向飞鸟槽位＝哑铃反向飞鸟／Y-T／绳索面拉、二头、三头、弹力带拉开、健身房版俯卧腿弯举机）60 秒。
  90 秒取自 Singer「>90 s 没再看到明显差别」；**三篇摘要都没有分大小动作比较**，分开定是 App 的安排（ACSM 全文有分「核心／辅助动作」，但只读了摘要，没写进 App）。
- 超级组那一轮休息取两个动作中较长的（**App 的安排**）。推论（没写进 App）：非竞争肌群的超级组里，同一个动作两组之间还隔着另一个动作的一组。
- Schoenfeld 2016 写明是「有训练经验的年轻男性、21 人、8 周、3 分钟比 1 分钟」——用户 40 岁，App 文案照写受试者，不推广；肌肉厚度只有大腿前侧显著（肱三头只有趋势 p＝0.06），App 只写「大腿前侧肌肉厚度」（verifier 2026-11-24 退件后改）。
- 体重卡只引 NHS 一句「每周减 0.5–1 kg」附原文链接，写明「App 只显示数字，不替你判断快慢，也不预测体重」；BMI <18.5 时不显示这句。不做体重预测。
- 史密斯杠重：没查到可靠来源，App 不写任何具体杠重数字，只提示「不同健身房的史密斯杠重不一样，问工作人员或看杠上标示」。

## 食物库数值（2026-11-27 查证）

给 App 饮食页「食物库＋称重记录」用（`fitness/index.html` 的 `FOOD_RAW`）。**每 100 g** 的值；份量来自同一笔资料的 portion 表。

### 资料从哪来、怎么拿到的
- **USDA FoodData Central**（公有领域 CC0）：沙盒连不到 fdc.nal.usda.gov／api.nal.usda.gov（代理 403），改在 CI 上下载官方整包
  `FoodData_Central_sr_legacy_food_csv_2018-04.zip`（SR Legacy，7793 种）与 `FoodData_Central_survey_food_csv_2024-10-31.zip`（FNDDS，5432 种），
  在 runner 上用 Python 读 `food.csv`／`food_nutrient.csv`／`food_portion.csv` 印出比对结果（临时 workflow，跑完已删，没进 main）。
  营养素编号：SR Legacy 用 1008 热量 kcal、1003 蛋白、1005 碳水（差减法）、1004 脂肪；FNDDS 用 208／203／205／204。
  run ID：第一轮 45935624032、第二轮 45935768104、第三轮 45935930445、第四轮 45936117341（日志在 Actions，按 cleanup-runs 规则可能 30 天后被清；数值已全抄进下表）。
- **台湾食药署 食品营养成分资料库**（data.gov.tw 资料集 8543，政府资料开放授权）：同一个 CI 下载
  `https://data.fda.gov.tw/opendata/exportDataList.do?method=ExportData&InfoId=20&logType=3`（zip 里 `20_3.json`，230152 列）。
  每样有「熱量」与「修正熱量」两栏；**App 用修正熱量**。没找到官方对修正熱量算法的说明；用资料反推大致＝4×蛋白＋9×脂肪＋4×（总碳水−膳食纤维）＋2×膳食纤维
  （芡实算出 336＝资料 336、小方豆干 154≈155、茯苓 164≈162），也就是膳食纤维按较低热量算——**这是推论，不是官方文字**。
- **NIST**（https://www.nist.gov/pml/owm/cooking-measurement-equivalencies ，web-lookup run 45936187091）：家用烹饪近似换算「15 mL ＝ 1 tablespoon」。
  橄榄油 10 ml ＝ 10÷15 大匙 × USDA 171413「1 tablespoon ＝ 13.5 g」＝ **9.0 g**。
- **Open Food Facts**（ODbL）：App 只在用户输入条码时即时查 `https://world.openfoodfacts.org/api/v2/product/{条码}.json`，
  用 `product.nutriments["energy-kcal_100g"]` 与 `proteins_100g`；缺任一项就当「资料不全」，不自己由 kJ 换算。回传格式用 web-lookup run 45936187091 实测过。

### 用户的早餐（App 内建两个组合）
- 四神小米粥干料一份 62 g：小米 20 g（USDA 169702：378 kcal／11.02 g）、白米 5 g（USDA 168877：365／7.13）、淮山干 8 g（台湾 B0100101 修正热量 351／5.3）、
  莲子干 8 g（USDA 170149：332／15.41）、芡实 8 g（台湾 C1800101：336／9.9）、茯苓 8 g（台湾 G2100101：162／1.0）、炒薏仁 5 g（台湾 A1000101 生薏仁：375／14.1）。
  一份 ＝ 75.6＋18.25＋28.08＋26.56＋26.88＋12.96＋18.75 ＝ **207.08 kcal**；蛋白 2.204＋0.3565＋0.424＋1.2328＋0.792＋0.08＋0.705 ＝ **5.79 g**。水不算。
- 半生熟鸡蛋：USDA 没有「带壳半熟」，用 **Egg, whole, cooked, poached（FDC 172186）** 143 kcal／12.51 g 近似（同样只用水、不加油）；大号 1 颗 ＝ 50 g（该项 portion）。
  对照：生全蛋 171287 是 143／12.56，全熟水煮 173424 是 155／12.58。
- 核桃：USDA 170187 portion「1 cup, in shell, edible yield (7 nuts) ＝ 28 g」→ 1 颗去壳约 4 g，4 颗 16 g；另有「1 oz (14 halves) ＝ 28.35 g」一致（1 颗＝2 半）。
  核桃大小不一，App 提示用户自己称一次 4 颗。
- 蒸地瓜：USDA 没有蒸；用 **Sweet potato, cooked, boiled, without skin（168484）** 76／1.37 近似（水气加热、不加油）。对照：连皮烤 168483 是 90／2.01。
- **二四六**：粥 207.1＋蛋 100 g 143＋橄榄油 9 g 79.6＋核桃 16 g 104.6 ＝ **534 kcal**；蛋白 5.8＋12.5＋0＋2.4 ＝ **20.7 g**。
- **一三五日**：地瓜 150 g 114＋蛋 143＋核桃 104.6 ＝ **362 kcal**；蛋白 2.1＋12.5＋2.4 ＝ **17.0 g**。（每项先取到 0.1 再加，总热量四舍五入）

### 来源矛盾（并列，App 用哪个）
- 小米：USDA 169702 378 kcal／11.02 g；台湾 A0200101 熱量 370、修正 365／11.3 g。差不多，**App 用 USDA**。
- 莲子干：USDA 170149 332 kcal／**15.41 g**；台湾 C2305101 熱量 334、修正 307／**21.8 g**（膳食纤维 13.1）。蛋白差很多，**App 用 USDA**（照「USDA 有的用 USDA」），食物库备注写了台湾数字。
- 茯苓：台湾 G2100101 熱量 316、修正 162（膳食纤维 80.9 g，几乎全是纤维）。**App 用修正 162**；用熱量栏的话 8 g 会多算约 12 kcal。
- 薏仁：台湾只有生薏仁（A1000101 375／14.1；2025 年取样 A1000102 修正 381／15.0）；用户吃炒薏仁，炒过水分少，每克略高——**未另查，App 按生薏仁算并注明**。
- 淮山：USDA 只有新鲜 Yam（170071，118 kcal，是新鲜块茎、不是干片），干片只能用台湾 B0100101。

### 估算／近似／未查证
- **估算值**（App 名称带「估算」、标估算值）：炒饭四种（FNDDS 2708951／2708953／2708954／2708956）、素炒面／宫保鸡丁／鸡肉炒杂菜（SR Legacy 美国中餐馆样本 167677／167676／167678）、
  汤面泛指（FNDDS 2709145，不是柬式粿条汤）。都是美国资料，做法与油量差很多。
- **近似**（数值查证过，但食物不完全一样，备注写明）：半生熟蛋＝水波蛋、蒸地瓜＝水煮地瓜、粿条／河粉／米粉＝USDA「Rice noodles, cooked」、南瓜（美式橙色南瓜，亚洲南瓜会偏低）、炒薏仁＝生薏仁、初榨橄榄油＝一般橄榄油（纯油热量相同）。
- **未查证、不给数字**：火龙果（USDA SR Legacy 与台湾资料库这次都没搜到）、柬式粿条汤。App 搜到时显示「未查证」，引导用自建食物或照片估算。
- 用台湾资料补的（USDA 没有）：豆干（R4700203）、白馒头（R2400201）、菜心（油菜心 E3201001）、淮山、芡实、茯苓、薏仁。

### 全表（App 的 `FOOD_RAW` 由这张表的数据生成；改数值两边一起改，check-fitness 第 25 段抽 12 项对照）
| id | 名称 | 编号 | 原始描述 | kcal | 蛋白 | 碳水 | 脂肪 | 份量 | run | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|
| `chkbreast` | 鸡胸肉（熟，去皮） | [FDC 171477](https://fdc.nal.usda.gov/food-details/171477/nutrients) | Chicken, broilers or fryers, breast, meat only, cooked, roasted | 165 | 31.02 | 0 | 3.57 | 半块鸡胸（去骨去皮）＝86 g | 45935624032 |  |
| `chkthigh` | 鸡腿肉（熟，去皮去骨） | [FDC 172388](https://fdc.nal.usda.gov/food-details/172388/nutrients) | Chicken, broilers or fryers, thigh, meat only, cooked, roasted | 179 | 24.76 | 0 | 8.15 |  | 45935624032 |  |
| `chkdrum` | 鸡小腿肉（熟，去皮去骨） | [FDC 172376](https://fdc.nal.usda.gov/food-details/172376/nutrients) | Chicken, broilers or fryers, dark meat, drumstick, meat only, cooked, roasted | 155 | 24.24 | 0 | 5.7 |  | 45935768104 |  |
| `chkwing` | 鸡翅肉（熟，去皮去骨） | [FDC 172392](https://fdc.nal.usda.gov/food-details/172392/nutrients) | Chicken, broilers or fryers, wing, meat only, cooked, roasted | 203 | 30.46 | 0 | 8.13 |  | 45935768104 |  |
| `duck` | 鸭肉（熟，去皮） | [FDC 172411](https://fdc.nal.usda.gov/food-details/172411/nutrients) | Duck, domesticated, meat only, cooked, roasted | 201 | 23.48 | 0 | 11.2 |  | 45935768104 |  |
| `porktender` | 猪里脊（熟，瘦肉） | [FDC 168250](https://fdc.nal.usda.gov/food-details/168250/nutrients) | Pork, fresh, loin, tenderloin, separable lean only, cooked, roasted | 143 | 26.17 | 0 | 3.51 |  | 45935624032 |  |
| `porkchop` | 猪排（熟，瘦肉） | [FDC 168240](https://fdc.nal.usda.gov/food-details/168240/nutrients) | Pork, fresh, loin, center loin (chops), bone-in, separable lean only, cooked, broiled | 180 | 26.76 | 0 | 7.29 |  | 45935930445 |  |
| `porkbelly` | 五花肉（生） | [FDC 167812](https://fdc.nal.usda.gov/food-details/167812/nutrients) | Pork, fresh, belly, raw | 518 | 9.34 | 0 | 53.01 |  | 45935624032 | USDA 只有生的；熟的没查到 |
| `porkmince` | 猪绞肉（熟） | [FDC 167903](https://fdc.nal.usda.gov/food-details/167903/nutrients) | Pork, fresh, ground, cooked | 297 | 25.69 | 0 | 20.77 |  | 45935768104 |  |
| `beefshank` | 牛腱（熟，炖，瘦肉） | [FDC 169442](https://fdc.nal.usda.gov/food-details/169442/nutrients) | Beef, shank crosscuts, separable lean only, trimmed to 1/4" fat, choice, cooked, simmered | 201 | 33.68 | 0 | 6.36 |  | 45935930445 |  |
| `beefshankraw` | 牛腱（生，瘦肉） | [FDC 169441](https://fdc.nal.usda.gov/food-details/169441/nutrients) | Beef, shank crosscuts, separable lean only, trimmed to 1/4" fat, choice, raw | 128 | 21.75 | 0 | 3.85 |  | 45935930445 |  |
| `beefflank` | 牛排（侧腹，熟） | [FDC 168611](https://fdc.nal.usda.gov/food-details/168611/nutrients) | Beef, flank, steak, separable lean only, trimmed to 0" fat, choice, cooked, broiled | 194 | 27.82 | 0 | 8.32 |  | 45935768104 |  |
| `beefmince90` | 牛绞肉 90% 瘦（熟） | [FDC 171793](https://fdc.nal.usda.gov/food-details/171793/nutrients) | Beef, ground, 90% lean meat / 10% fat, patty, cooked, pan-broiled | 204 | 25.21 | 0 | 10.68 |  | 45935624032 |  |
| `beefmince85` | 牛绞肉 85% 瘦（熟） | [FDC 174032](https://fdc.nal.usda.gov/food-details/174032/nutrients) | Beef, ground, 85% lean meat / 15% fat, patty, cooked, broiled | 250 | 25.93 | 0 | 15.41 |  | 45935624032 |  |
| `lambleg` | 羊腿肉（熟，瘦肉） | [FDC 172487](https://fdc.nal.usda.gov/food-details/172487/nutrients) | Lamb, leg, shank half, separable lean only, trimmed to 1/4" fat, choice, cooked, roasted | 180 | 28.17 | 0 | 6.67 |  | 45936117341 |  |
| `lambstew` | 羊肉块（炖，瘦肉） | [FDC 172509](https://fdc.nal.usda.gov/food-details/172509/nutrients) | Lamb, cubed for stew or kabob (leg and shoulder), separable lean only, trimmed to 1/4" fat, cooked, braised | 223 | 33.69 | 0 | 8.8 |  | 45936117341 |  |
| `shrimp` | 虾（熟） | [FDC 175180](https://fdc.nal.usda.gov/food-details/175180/nutrients) | Crustaceans, shrimp, cooked | 99 | 23.98 | 0.2 | 0.28 |  | 45935624032 |  |
| `shrimpraw` | 虾（生） | [FDC 175179](https://fdc.nal.usda.gov/food-details/175179/nutrients) | Crustaceans, shrimp, raw | 85 | 20.1 | 0 | 0.51 |  | 45935624032 |  |
| `squid` | 鱿鱼（生） | [FDC 174223](https://fdc.nal.usda.gov/food-details/174223/nutrients) | Mollusks, squid, mixed species, raw | 92 | 15.58 | 3.08 | 1.38 |  | 45935768104 |  |
| `salmon` | 三文鱼（养殖，熟） | [FDC 175168](https://fdc.nal.usda.gov/food-details/175168/nutrients) | Fish, salmon, Atlantic, farmed, cooked, dry heat | 206 | 22.1 | 0 | 12.35 |  | 45935624032 |  |
| `tilapia` | 罗非鱼（熟） | [FDC 175177](https://fdc.nal.usda.gov/food-details/175177/nutrients) | Fish, tilapia, cooked, dry heat | 128 | 26.15 | 0 | 2.65 |  | 45935624032 |  |
| `cod` | 鳕鱼（熟） | [FDC 171956](https://fdc.nal.usda.gov/food-details/171956/nutrients) | Fish, cod, Atlantic, cooked, dry heat | 105 | 22.83 | 0 | 0.86 |  | 45935624032 |  |
| `snapper` | 红鲷鱼（熟） | [FDC 173699](https://fdc.nal.usda.gov/food-details/173699/nutrients) | Fish, snapper, mixed species, cooked, dry heat | 128 | 26.3 | 0 | 1.72 |  | 45935768104 |  |
| `grouper` | 石斑鱼（熟） | [FDC 171963](https://fdc.nal.usda.gov/food-details/171963/nutrients) | Fish, grouper, mixed species, cooked, dry heat | 118 | 24.84 | 0 | 1.3 |  | 45935768104 |  |
| `mackerel` | 马鲛鱼（熟） | [FDC 173674](https://fdc.nal.usda.gov/food-details/173674/nutrients) | Fish, mackerel, spanish, cooked, dry heat | 158 | 23.59 | 0 | 6.32 |  | 45935768104 |  |
| `catfish` | 鲶鱼（养殖，熟） | [FDC 175166](https://fdc.nal.usda.gov/food-details/175166/nutrients) | Fish, catfish, channel, farmed, cooked, dry heat | 144 | 18.44 | 0 | 7.19 |  | 45935768104 |  |
| `milkfish` | 虱目鱼（熟） | [FDC 171995](https://fdc.nal.usda.gov/food-details/171995/nutrients) | Fish, milkfish, cooked, dry heat | 190 | 26.32 | 0 | 8.63 |  | 45935930445 |  |
| `pompano` | 金鲳鱼（熟） | [FDC 173683](https://fdc.nal.usda.gov/food-details/173683/nutrients) | Fish, pompano, florida, cooked, dry heat | 211 | 23.69 | 0 | 12.14 |  | 45935768104 |  |
| `tuna` | 水浸金枪鱼罐头（沥干） | [FDC 173709](https://fdc.nal.usda.gov/food-details/173709/nutrients) | Fish, tuna, light, canned in water, drained solids | 86 | 19.44 | 0 | 0.96 | 1 罐（沥干）＝165 g | 45935768104 |  |
| `crab` | 螃蟹肉（熟） | [FDC 174205](https://fdc.nal.usda.gov/food-details/174205/nutrients) | Crustaceans, crab, blue, cooked, moist heat | 83 | 17.88 | 0 | 0.74 |  | 45935768104 |  |
| `egg` | 鸡蛋（半生熟／水煮，不加油） | [FDC 172186](https://fdc.nal.usda.gov/food-details/172186/nutrients) | Egg, whole, cooked, poached | 143 | 12.51 | 0.71 | 9.47 | 1 颗大号＝50 g | 45935624032 | USDA 没有「半生熟带壳煮」这一项；用同样只用水煮、不加油的水波蛋近似（App 的安排） |
| `egghard` | 鸡蛋（全熟水煮） | [FDC 173424](https://fdc.nal.usda.gov/food-details/173424/nutrients) | Egg, whole, cooked, hard-boiled | 155 | 12.58 | 1.12 | 10.61 | 1 颗大号＝50 g | 45935624032 |  |
| `eggraw` | 鸡蛋（生，全蛋） | [FDC 171287](https://fdc.nal.usda.gov/food-details/171287/nutrients) | Egg, whole, raw, fresh | 143 | 12.56 | 0.72 | 9.51 | 1 颗大号＝50 g；1 颗中号＝44 g | 45935624032 |  |
| `eggwhite` | 蛋白（生） | [FDC 172183](https://fdc.nal.usda.gov/food-details/172183/nutrients) | Egg, white, raw, fresh | 52 | 10.9 | 0.73 | 0.17 | 1 颗大号的蛋白＝33 g | 45935768104 |  |
| `tofufirm` | 板豆腐／老豆腐 | [FDC 172475](https://fdc.nal.usda.gov/food-details/172475/nutrients) | Tofu, raw, firm, prepared with calcium sulfate | 144 | 17.27 | 2.78 | 8.72 |  | 45935624032 |  |
| `tofu` | 豆腐（一般） | [FDC 172476](https://fdc.nal.usda.gov/food-details/172476/nutrients) | Tofu, raw, regular, prepared with calcium sulfate | 76 | 8.08 | 1.87 | 4.78 |  | 45935624032 |  |
| `tofusoft` | 嫩豆腐 | [FDC 172449](https://fdc.nal.usda.gov/food-details/172449/nutrients) | Tofu, soft, prepared with calcium sulfate and magnesium chloride (nigari) | 61 | 7.17 | 1.18 | 3.69 |  | 45935768104 |  |
| `tofufried` | 炸豆腐／豆泡 | [FDC 172451](https://fdc.nal.usda.gov/food-details/172451/nutrients) | Tofu, fried | 270 | 18.82 | 8.86 | 20.18 |  | 45935768104 |  |
| `dougan` | 豆干（小方豆干） | 台湾 R4700203 | 小方豆干（Hard bean curd） | 155 | 17.4 | 3.5 | 8.6 |  | 45936117341 | USDA 没有豆干；用台湾食药署资料库（热量取「修正热量」） |
| `soymilk` | 豆浆（原味，有糖） | [FDC 172446](https://fdc.nal.usda.gov/food-details/172446/nutrients) | Soymilk, original and vanilla, unfortified | 54 | 3.27 | 6.28 | 1.75 | 1 杯＝243 g | 45935624032 |  |
| `soymilkns` | 无糖豆浆 | [FDC 175215](https://fdc.nal.usda.gov/food-details/175215/nutrients) | Soymilk (all flavors), unsweetened, with added calcium, vitamins A and D | 33 | 2.86 | 1.74 | 1.61 | 1 杯＝243 g | 45935624032 |  |
| `edamame` | 毛豆（煮好） | [FDC 168411](https://fdc.nal.usda.gov/food-details/168411/nutrients) | Edamame, frozen, prepared | 121 | 11.91 | 8.91 | 5.2 |  | 45935768104 |  |
| `lentil` | 小扁豆（熟） | [FDC 172421](https://fdc.nal.usda.gov/food-details/172421/nutrients) | Lentils, mature seeds, cooked, boiled, without salt | 116 | 9.02 | 20.13 | 0.38 |  | 45935624032 |  |
| `chickpea` | 鹰嘴豆（熟） | [FDC 173757](https://fdc.nal.usda.gov/food-details/173757/nutrients) | Chickpeas (garbanzo beans, bengal gram), mature seeds, cooked, boiled, without salt | 164 | 8.86 | 27.42 | 2.59 |  | 45935624032 |  |
| `mungbean` | 绿豆（熟） | [FDC 174257](https://fdc.nal.usda.gov/food-details/174257/nutrients) | Mung beans, mature seeds, cooked, boiled, without salt | 105 | 7.02 | 19.15 | 0.38 |  | 45935768104 |  |
| `redbean` | 红腰豆（熟） | [FDC 175194](https://fdc.nal.usda.gov/food-details/175194/nutrients) | Beans, kidney, red, mature seeds, cooked, boiled, without salt | 127 | 8.67 | 22.8 | 0.5 |  | 45935768104 |  |
| `rice` | 白饭（熟） | [FDC 168878](https://fdc.nal.usda.gov/food-details/168878/nutrients) | Rice, white, long-grain, regular, enriched, cooked | 130 | 2.69 | 28.17 | 0.28 | 1 碗（1 杯）＝158 g | 45935930445 |  |
| `riceshort` | 白饭（短粒米，熟） | [FDC 168932](https://fdc.nal.usda.gov/food-details/168932/nutrients) | Rice, white, short-grain, cooked, unenriched | 130 | 2.36 | 28.73 | 0.19 | 1 杯＝205 g | 45935624032 |  |
| `ricebrown` | 糙米饭（熟） | [FDC 169704](https://fdc.nal.usda.gov/food-details/169704/nutrients) | Rice, brown, long-grain, cooked | 123 | 2.74 | 25.58 | 0.97 | 1 杯＝202 g | 45935624032 |  |
| `riceglut` | 糯米饭（熟） | [FDC 169711](https://fdc.nal.usda.gov/food-details/169711/nutrients) | Rice, white, glutinous, unenriched, cooked | 97 | 2.02 | 21.09 | 0.19 |  | 45935930445 |  |
| `riceraw` | 白米（生） | [FDC 168877](https://fdc.nal.usda.gov/food-details/168877/nutrients) | Rice, white, long-grain, regular, raw, enriched | 365 | 7.13 | 79.95 | 0.66 |  | 45935624032 |  |
| `ricenoodle` | 粿条／河粉／米粉（煮熟） | [FDC 168914](https://fdc.nal.usda.gov/food-details/168914/nutrients) | Rice noodles, cooked | 108 | 1.79 | 24.01 | 0.2 | 1 杯＝176 g | 45935624032 | USDA 只有「米制面条，煮熟」一项，粿条、河粉、米粉都用它近似 |
| `ricenoodledry` | 米粉（干） | [FDC 169742](https://fdc.nal.usda.gov/food-details/169742/nutrients) | Rice noodles, dry | 364 | 5.95 | 80.18 | 0.56 |  | 45935624032 |  |
| `eggnoodle` | 鸡蛋面（熟） | [FDC 168919](https://fdc.nal.usda.gov/food-details/168919/nutrients) | Noodles, egg, cooked, enriched, with added salt | 138 | 4.54 | 25.16 | 2.07 | 1 杯＝160 g | 45935624032 |  |
| `pasta` | 意大利面（熟） | [FDC 169737](https://fdc.nal.usda.gov/food-details/169737/nutrients) | Pasta, cooked, enriched, without added salt | 158 | 5.8 | 30.86 | 0.93 |  | 45935624032 |  |
| `pastaww` | 全麦意面（熟） | [FDC 168910](https://fdc.nal.usda.gov/food-details/168910/nutrients) | Pasta, whole-wheat, cooked | 149 | 5.99 | 30.07 | 1.71 |  | 45935930445 |  |
| `soba` | 荞麦面（熟） | [FDC 168907](https://fdc.nal.usda.gov/food-details/168907/nutrients) | Noodles, japanese, soba, cooked | 99 | 5.06 | 21.44 | 0.1 |  | 45935768104 |  |
| `mantou` | 白馒头 | 台湾 R2400201 | 白饅頭 | 246 | 8.1 | 51.3 | 1.2 |  | 45936117341 | USDA 没有馒头；用台湾食药署资料库（热量取「修正热量」） |
| `breadwhite` | 白吐司 | [FDC 174924](https://fdc.nal.usda.gov/food-details/174924/nutrients) | Bread, white, commercially prepared | 266 | 8.85 | 49.42 | 3.33 | 1 片＝29 g | 45935624032 |  |
| `breadww` | 全麦面包 | [FDC 172688](https://fdc.nal.usda.gov/food-details/172688/nutrients) | Bread, whole-wheat, commercially prepared | 252 | 12.45 | 42.71 | 3.5 | 1 片＝32 g | 45935624032 |  |
| `oats` | 燕麦片（干） | [FDC 173904](https://fdc.nal.usda.gov/food-details/173904/nutrients) | Cereals, oats, regular and quick, not fortified, dry | 379 | 13.15 | 67.7 | 6.52 | 1/3 杯＝27 g | 45935624032 |  |
| `oatmeal` | 燕麦粥（水煮） | [FDC 171675](https://fdc.nal.usda.gov/food-details/171675/nutrients) | Cereals, oats, regular and quick and instant, unenriched, cooked with water (includes boiling and microwaving), with salt | 71 | 2.54 | 12 | 1.52 | 1 杯＝234 g | 45935624032 |  |
| `corn` | 甜玉米（煮） | [FDC 169999](https://fdc.nal.usda.gov/food-details/169999/nutrients) | Corn, sweet, yellow, cooked, boiled, drained, without salt | 96 | 3.41 | 20.98 | 1.5 | 1 根中型＝103 g | 45935624032 |  |
| `potato` | 马铃薯（水煮去皮） | [FDC 170440](https://fdc.nal.usda.gov/food-details/170440/nutrients) | Potatoes, boiled, cooked without skin, flesh, without salt | 86 | 1.71 | 20.01 | 0.1 | 1 颗中型＝167 g | 45935624032 |  |
| `potatobaked` | 烤马铃薯（连皮） | [FDC 170093](https://fdc.nal.usda.gov/food-details/170093/nutrients) | Potatoes, baked, flesh and skin, without salt | 93 | 2.5 | 21.15 | 0.13 | 1 颗中型＝173 g | 45935768104 |  |
| `taro` | 芋头（熟） | [FDC 168486](https://fdc.nal.usda.gov/food-details/168486/nutrients) | Taro, cooked, without salt | 142 | 0.52 | 34.6 | 0.11 |  | 45935768104 |  |
| `pumpkin` | 南瓜（煮） | [FDC 168449](https://fdc.nal.usda.gov/food-details/168449/nutrients) | Pumpkin, cooked, boiled, drained, without salt | 20 | 0.72 | 4.9 | 0.07 |  | 45935768104 | USDA 的南瓜是美式橙色南瓜；东南亚常见的日本南瓜（kabocha）淀粉多、热量较高，这里会偏低 |
| `sweetpotato` | 地瓜（蒸／水煮，去皮） | [FDC 168484](https://fdc.nal.usda.gov/food-details/168484/nutrients) | Sweet potato, cooked, boiled, without skin | 76 | 1.37 | 17.72 | 0.14 | 1 条中型＝151 g | 45935624032 | USDA 没有「蒸」；用最接近的水煮去皮近似（同样是水气加热、不加油） |
| `sweetpotatobaked` | 烤地瓜（连皮烤） | [FDC 168483](https://fdc.nal.usda.gov/food-details/168483/nutrients) | Sweet potato, cooked, baked in skin, flesh, without salt | 90 | 2.01 | 20.71 | 0.15 | 1 条中型＝114 g | 45935624032 |  |
| `millet` | 小米（生） | [FDC 169702](https://fdc.nal.usda.gov/food-details/169702/nutrients) | Millet, raw | 378 | 11.02 | 72.85 | 4.22 |  | 45935624032 |  |
| `huaishan` | 淮山（干片） | 台湾 B0100101 | 淮山（樣品狀態：乾貨） | 351 | 5.3 | 82.4 | 0.3 |  | 45935930445 | USDA 只有新鲜山药；干货用台湾食药署资料库（热量取「修正热量」） |
| `lotusseed` | 莲子（干） | [FDC 170149](https://fdc.nal.usda.gov/food-details/170149/nutrients) | Seeds, lotus seeds, dried | 332 | 15.41 | 64.47 | 1.97 | 42 颗中型＝28.35 g | 45935768104 | 台湾食药署的蓮子(乾)蛋白是 21.8 g、修正热量 307，跟 USDA 不同；App 用 USDA |
| `qianshi` | 芡实（干） | 台湾 C1800101 | 芡實 | 336 | 9.9 | 75.4 | 0.1 |  | 45935930445 | USDA 没有；用台湾食药署资料库（热量取「修正热量」） |
| `fuling` | 茯苓（干，白茯苓） | 台湾 G2100101 | 白茯苓（乾貨，去外皮之白色部份） | 162 | 1.0 | 79.9 | 0.2 |  | 45935930445 | USDA 没有；用台湾食药署资料库。茯苓几乎都是膳食纤维，「热量」栏 316、「修正热量」162，App 用修正热量 |
| `yiren` | 薏仁（炒薏仁按生薏仁算） | 台湾 A1000101 | 薏仁（生） | 375 | 14.1 | 66.2 | 6.1 |  | 45935930445 | USDA 没有；用台湾食药署资料库。资料库只有生薏仁，炒过水分少一点，每克会略高（App 的近似） |
| `choysum` | 菜心 | 台湾 E3201001 | 油菜心（生） | 27 | 3.2 | 4.0 | 0.9 |  | 45936117341 | USDA 没有菜心；用台湾食药署资料库（热量取「修正热量」） |
| `kangkung` | 空心菜（煮） | [FDC 169302](https://fdc.nal.usda.gov/food-details/169302/nutrients) | Water convolvulus, cooked, boiled, drained, without salt | 20 | 2.08 | 3.7 | 0.24 |  | 45935930445 |  |
| `kangkungraw` | 空心菜（生） | [FDC 169301](https://fdc.nal.usda.gov/food-details/169301/nutrients) | Water convolvulus,raw | 19 | 2.6 | 3.13 | 0.2 |  | 45935930445 |  |
| `broccoli` | 西兰花（煮） | [FDC 169967](https://fdc.nal.usda.gov/food-details/169967/nutrients) | Broccoli, cooked, boiled, drained, without salt | 35 | 2.38 | 7.18 | 0.41 |  | 45935624032 |  |
| `gailan` | 芥兰（熟） | [FDC 169392](https://fdc.nal.usda.gov/food-details/169392/nutrients) | Broccoli, chinese, cooked | 22 | 1.14 | 3.81 | 0.72 |  | 45935768104 |  |
| `bokchoy` | 小白菜／青江菜（煮） | [FDC 170391](https://fdc.nal.usda.gov/food-details/170391/nutrients) | Cabbage, chinese (pak-choi), cooked, boiled, drained, without salt | 12 | 1.56 | 1.78 | 0.16 |  | 45935624032 |  |
| `napa` | 大白菜（煮） | [FDC 169980](https://fdc.nal.usda.gov/food-details/169980/nutrients) | Cabbage, chinese (pe-tsai), cooked, boiled, drained, without salt | 14 | 1.5 | 2.41 | 0.17 |  | 45935768104 |  |
| `cabbage` | 包菜（生） | [FDC 169975](https://fdc.nal.usda.gov/food-details/169975/nutrients) | Cabbage, raw | 25 | 1.28 | 5.8 | 0.1 |  | 45935624032 |  |
| `spinach` | 菠菜（煮） | [FDC 168463](https://fdc.nal.usda.gov/food-details/168463/nutrients) | Spinach, cooked, boiled, drained, without salt | 23 | 2.97 | 3.75 | 0.26 | 1 杯＝180 g | 45935624032 |  |
| `cucumber` | 黄瓜（连皮） | [FDC 168409](https://fdc.nal.usda.gov/food-details/168409/nutrients) | Cucumber, with peel, raw | 15 | 0.65 | 3.63 | 0.11 |  | 45935624032 |  |
| `tomato` | 番茄 | [FDC 170457](https://fdc.nal.usda.gov/food-details/170457/nutrients) | Tomatoes, red, ripe, raw, year round average | 18 | 0.88 | 3.89 | 0.2 | 1 颗中型＝123 g | 45935624032 |  |
| `greenpepper` | 青椒 | [FDC 170427](https://fdc.nal.usda.gov/food-details/170427/nutrients) | Peppers, sweet, green, raw | 20 | 0.86 | 4.64 | 0.17 |  | 45935768104 |  |
| `carrot` | 胡萝卜（生） | [FDC 170393](https://fdc.nal.usda.gov/food-details/170393/nutrients) | Carrots, raw | 41 | 0.93 | 9.58 | 0.24 | 1 根中型＝61 g | 45935624032 |  |
| `mushroom` | 白蘑菇（生） | [FDC 169251](https://fdc.nal.usda.gov/food-details/169251/nutrients) | Mushrooms, white, raw | 22 | 3.09 | 3.26 | 0.34 |  | 45935624032 |  |
| `shiitake` | 香菇（熟） | [FDC 168437](https://fdc.nal.usda.gov/food-details/168437/nutrients) | Mushrooms, shiitake, cooked, without salt | 56 | 1.56 | 14.39 | 0.22 |  | 45935768104 |  |
| `enoki` | 金针菇（生） | [FDC 169382](https://fdc.nal.usda.gov/food-details/169382/nutrients) | Mushrooms, enoki, raw | 37 | 2.66 | 7.81 | 0.29 |  | 45935768104 |  |
| `oystermush` | 秀珍菇／蚝菇（生） | [FDC 168580](https://fdc.nal.usda.gov/food-details/168580/nutrients) | Mushrooms, oyster, raw | 33 | 3.31 | 6.09 | 0.41 |  | 45935768104 |  |
| `eggplant` | 茄子（煮） | [FDC 169229](https://fdc.nal.usda.gov/food-details/169229/nutrients) | Eggplant, cooked, boiled, drained, without salt | 35 | 0.83 | 8.73 | 0.23 |  | 45935768104 |  |
| `longbean` | 长豆角（煮） | [FDC 169223](https://fdc.nal.usda.gov/food-details/169223/nutrients) | Yardlong bean, cooked, boiled, drained, without salt | 47 | 2.53 | 9.18 | 0.1 |  | 45935768104 |  |
| `greenbean` | 四季豆（煮） | [FDC 169141](https://fdc.nal.usda.gov/food-details/169141/nutrients) | Beans, snap, green, cooked, boiled, drained, without salt | 35 | 1.89 | 7.88 | 0.28 |  | 45935768104 |  |
| `bittergourd` | 苦瓜（煮） | [FDC 168394](https://fdc.nal.usda.gov/food-details/168394/nutrients) | Balsam-pear (bitter gourd), pods, cooked, boiled, drained, without salt | 19 | 0.84 | 4.32 | 0.18 |  | 45935768104 |  |
| `okra` | 秋葵（煮） | [FDC 169261](https://fdc.nal.usda.gov/food-details/169261/nutrients) | Okra, cooked, boiled, drained, without salt | 22 | 1.87 | 4.51 | 0.21 |  | 45935768104 |  |
| `calabash` | 葫芦瓜（煮） | [FDC 169233](https://fdc.nal.usda.gov/food-details/169233/nutrients) | Gourd, white-flowered (calabash), cooked, boiled, drained, without salt | 15 | 0.6 | 3.69 | 0.02 |  | 45935768104 |  |
| `beansprout` | 绿豆芽（生） | [FDC 169957](https://fdc.nal.usda.gov/food-details/169957/nutrients) | Mung beans, mature seeds, sprouted, raw | 30 | 3.04 | 5.94 | 0.18 |  | 45935624032 |  |
| `onion` | 洋葱（生） | [FDC 170000](https://fdc.nal.usda.gov/food-details/170000/nutrients) | Onions, raw | 40 | 1.1 | 9.34 | 0.1 |  | 45935624032 |  |
| `lettuce` | 生菜（罗马生菜） | [FDC 169247](https://fdc.nal.usda.gov/food-details/169247/nutrients) | Lettuce, cos or romaine, raw | 17 | 1.23 | 3.29 | 0.3 |  | 45935624032 |  |
| `cauliflower` | 花椰菜（煮） | [FDC 170397](https://fdc.nal.usda.gov/food-details/170397/nutrients) | Cauliflower, cooked, boiled, drained, without salt | 23 | 1.84 | 4.11 | 0.45 |  | 45935768104 |  |
| `lotusroot` | 莲藕（煮） | [FDC 168430](https://fdc.nal.usda.gov/food-details/168430/nutrients) | Lotus root, cooked, boiled, drained, without salt | 66 | 1.58 | 16.02 | 0.07 |  | 45935768104 |  |
| `celery` | 芹菜（生） | [FDC 169988](https://fdc.nal.usda.gov/food-details/169988/nutrients) | Celery, raw | 14 | 0.69 | 2.97 | 0.17 |  | 45935768104 |  |
| `kelp` | 海带（生） | [FDC 168457](https://fdc.nal.usda.gov/food-details/168457/nutrients) | Seaweed, kelp, raw | 43 | 1.68 | 9.57 | 0.56 |  | 45935768104 |  |
| `banana` | 香蕉 | [FDC 173944](https://fdc.nal.usda.gov/food-details/173944/nutrients) | Bananas, raw | 89 | 1.09 | 22.84 | 0.33 | 1 根中型（去皮）＝118 g | 45935624032 |  |
| `mango` | 芒果 | [FDC 169910](https://fdc.nal.usda.gov/food-details/169910/nutrients) | Mangos, raw | 60 | 0.82 | 14.98 | 0.38 | 1 颗（去皮去核）＝336 g | 45935624032 |  |
| `papaya` | 木瓜 | [FDC 169926](https://fdc.nal.usda.gov/food-details/169926/nutrients) | Papayas, raw | 43 | 0.47 | 10.82 | 0.26 | 1 杯块＝145 g | 45935624032 |  |
| `watermelon` | 西瓜 | [FDC 167765](https://fdc.nal.usda.gov/food-details/167765/nutrients) | Watermelon, raw | 30 | 0.61 | 7.55 | 0.15 | 1 杯丁＝152 g | 45935624032 |  |
| `apple` | 苹果（连皮） | [FDC 171688](https://fdc.nal.usda.gov/food-details/171688/nutrients) | Apples, raw, with skin | 52 | 0.26 | 13.81 | 0.17 | 1 颗中型＝182 g | 45935624032 |  |
| `orange` | 橙 | [FDC 169097](https://fdc.nal.usda.gov/food-details/169097/nutrients) | Oranges, raw, all commercial varieties | 47 | 0.94 | 11.75 | 0.12 | 1 颗＝131 g | 45935624032 |  |
| `guava` | 番石榴 | [FDC 173044](https://fdc.nal.usda.gov/food-details/173044/nutrients) | Guavas, common, raw | 68 | 2.55 | 14.32 | 0.95 | 1 颗（可食部分）＝55 g | 45935768104 |  |
| `pineapple` | 菠萝 | [FDC 169124](https://fdc.nal.usda.gov/food-details/169124/nutrients) | Pineapple, raw, all varieties | 50 | 0.54 | 13.12 | 0.12 | 1 杯块＝165 g | 45935768104 |  |
| `durian` | 榴莲 | [FDC 168192](https://fdc.nal.usda.gov/food-details/168192/nutrients) | Durian, raw or frozen | 147 | 1.47 | 27.09 | 5.33 |  | 45935768104 |  |
| `longan` | 龙眼 | [FDC 169089](https://fdc.nal.usda.gov/food-details/169089/nutrients) | Longans, raw | 60 | 1.31 | 15.14 | 0.1 | 1 颗（可食部分）＝3.2 g | 45935768104 |  |
| `lychee` | 荔枝 | [FDC 169086](https://fdc.nal.usda.gov/food-details/169086/nutrients) | Litchis, raw | 66 | 0.83 | 16.53 | 0.44 | 1 颗（可食部分）＝9.6 g | 45935768104 |  |
| `jackfruit` | 菠萝蜜 | [FDC 174687](https://fdc.nal.usda.gov/food-details/174687/nutrients) | Jackfruit, raw | 95 | 1.72 | 23.25 | 0.64 |  | 45935768104 |  |
| `grapes` | 葡萄 | [FDC 174683](https://fdc.nal.usda.gov/food-details/174683/nutrients) | Grapes, red or green (European type, such as Thompson seedless), raw | 69 | 0.72 | 18.1 | 0.16 |  | 45935624032 |  |
| `kiwi` | 奇异果 | [FDC 168153](https://fdc.nal.usda.gov/food-details/168153/nutrients) | Kiwifruit, green, raw | 61 | 1.14 | 14.66 | 0.52 | 1 颗＝69 g | 45935768104 |  |
| `avocado` | 牛油果 | [FDC 171705](https://fdc.nal.usda.gov/food-details/171705/nutrients) | Avocados, raw, all commercial varieties | 160 | 2 | 8.53 | 14.66 |  | 45935624032 |  |
| `pear` | 梨 | [FDC 169118](https://fdc.nal.usda.gov/food-details/169118/nutrients) | Pears, raw | 57 | 0.36 | 15.23 | 0.14 | 1 颗中型＝178 g | 45935768104 |  |
| `strawberry` | 草莓 | [FDC 167762](https://fdc.nal.usda.gov/food-details/167762/nutrients) | Strawberries, raw | 32 | 0.67 | 7.68 | 0.3 |  | 45935768104 |  |
| `walnut` | 核桃（去壳） | [FDC 170187](https://fdc.nal.usda.gov/food-details/170187/nutrients) | Nuts, walnuts, english | 654 | 15.23 | 13.71 | 65.21 | 1 颗（去壳）＝4 g | 45935624032 | 「1 颗 4 g」来自 USDA 份量「7 颗去壳可食部分＝28 g」（28÷7）；核桃大小不一，最好自己称一次 4 颗 |
| `almond` | 杏仁（生） | [FDC 170567](https://fdc.nal.usda.gov/food-details/170567/nutrients) | Nuts, almonds | 579 | 21.15 | 21.55 | 49.93 | 1 颗＝1.2 g | 45935624032 |  |
| `peanut` | 花生（烤，无盐） | [FDC 173806](https://fdc.nal.usda.gov/food-details/173806/nutrients) | Peanuts, all types, dry-roasted, without salt | 587 | 24.35 | 21.26 | 49.66 | 1 粒＝1 g | 45935624032 |  |
| `cashew` | 腰果（生） | [FDC 170162](https://fdc.nal.usda.gov/food-details/170162/nutrients) | Nuts, cashew nuts, raw | 553 | 18.22 | 30.19 | 43.85 |  | 45935768104 |  |
| `sesame` | 芝麻 | [FDC 170150](https://fdc.nal.usda.gov/food-details/170150/nutrients) | Seeds, sesame seeds, whole, dried | 573 | 17.73 | 23.45 | 49.67 | 1 大匙＝9 g | 45935768104 |  |
| `chia` | 奇亚籽 | [FDC 170554](https://fdc.nal.usda.gov/food-details/170554/nutrients) | Seeds, chia seeds, dried | 486 | 16.54 | 42.12 | 30.74 |  | 45935768104 |  |
| `flax` | 亚麻籽 | [FDC 169414](https://fdc.nal.usda.gov/food-details/169414/nutrients) | Seeds, flaxseed | 534 | 18.29 | 28.88 | 42.16 | 1 大匙（整粒）＝10.3 g | 45935768104 |  |
| `pumpkinseed` | 南瓜子仁 | [FDC 170556](https://fdc.nal.usda.gov/food-details/170556/nutrients) | Seeds, pumpkin and squash seed kernels, dried | 559 | 30.23 | 10.71 | 49.05 |  | 45935768104 |  |
| `sunflower` | 葵花子仁 | [FDC 170562](https://fdc.nal.usda.gov/food-details/170562/nutrients) | Seeds, sunflower seed kernels, dried | 584 | 20.78 | 20 | 51.46 |  | 45935768104 |  |
| `milk` | 全脂牛奶 | [FDC 171265](https://fdc.nal.usda.gov/food-details/171265/nutrients) | Milk, whole, 3.25% milkfat, with added vitamin D | 61 | 3.15 | 4.8 | 3.25 | 1 杯＝244 g | 45935624032 |  |
| `milklow` | 低脂牛奶（1%） | [FDC 170872](https://fdc.nal.usda.gov/food-details/170872/nutrients) | Milk, lowfat, fluid, 1% milkfat, with added vitamin A and vitamin D | 42 | 3.37 | 4.99 | 0.97 | 1 杯＝244 g | 45935624032 |  |
| `milkskim` | 脱脂牛奶 | [FDC 171269](https://fdc.nal.usda.gov/food-details/171269/nutrients) | Milk, nonfat, fluid, with added vitamin A and vitamin D (fat free or skim) | 34 | 3.37 | 4.96 | 0.08 | 1 杯＝245 g | 45935624032 |  |
| `yogurt` | 原味优格（全脂） | [FDC 171284](https://fdc.nal.usda.gov/food-details/171284/nutrients) | Yogurt, plain, whole milk | 61 | 3.47 | 4.66 | 3.25 | 1 盒（6 oz）＝170 g | 45935624032 |  |
| `greek0` | 希腊优格（无脂） | [FDC 170894](https://fdc.nal.usda.gov/food-details/170894/nutrients) | Yogurt, Greek, plain, nonfat | 59 | 10.19 | 3.6 | 0.39 | 1 盒＝170 g | 45935624032 |  |
| `greek` | 希腊优格（全脂） | [FDC 171304](https://fdc.nal.usda.gov/food-details/171304/nutrients) | Yogurt, Greek, plain, whole milk | 97 | 9 | 3.98 | 5 |  | 45935624032 |  |
| `cheddar` | 切达芝士 | [FDC 173414](https://fdc.nal.usda.gov/food-details/173414/nutrients) | Cheese, cheddar | 403 | 22.87 | 3.37 | 33.31 | 1 片＝28 g | 45935624032 |  |
| `mozzarella` | 马苏里拉芝士（部分脱脂） | [FDC 170847](https://fdc.nal.usda.gov/food-details/170847/nutrients) | Cheese, mozzarella, part skim milk | 254 | 24.26 | 2.77 | 15.92 |  | 45935768104 |  |
| `olive` | 初榨橄榄油 | [FDC 171413](https://fdc.nal.usda.gov/food-details/171413/nutrients) | Oil, olive, salad or cooking | 884 | 0 | 0 | 100 | 10 ml＝9 g；1 大匙＝13.5 g；1 小匙＝4.5 g | 45935624032 | 10 ml ＝ 9 g：USDA「1 大匙＝13.5 g」× NIST「1 大匙≈15 ml」。USDA 这一项是一般橄榄油，没有分初榨（同为纯油，热量一样） |
| `peanutoil` | 花生油 | [FDC 171410](https://fdc.nal.usda.gov/food-details/171410/nutrients) | Oil, peanut, salad or cooking | 884 | 0 | 0 | 100 | 1 大匙＝13.5 g；1 小匙＝4.5 g | 45935768104 |  |
| `canola` | 芥花油／菜籽油 | [FDC 172336](https://fdc.nal.usda.gov/food-details/172336/nutrients) | Oil, canola | 884 | 0 | 0 | 100 | 1 大匙＝14 g；1 小匙＝4.5 g | 45935768104 |  |
| `sesameoil` | 麻油 | [FDC 171016](https://fdc.nal.usda.gov/food-details/171016/nutrients) | Oil, sesame, salad or cooking | 884 | 0 | 0 | 100 | 1 大匙＝13.6 g；1 小匙＝4.5 g | 45935768104 |  |
| `coconutoil` | 椰子油 | [FDC 171412](https://fdc.nal.usda.gov/food-details/171412/nutrients) | Oil, coconut | 892 | 0 | 0 | 99.06 | 1 大匙＝13.6 g | 45935768104 |  |
| `butter` | 牛油（有盐） | [FDC 173410](https://fdc.nal.usda.gov/food-details/173410/nutrients) | Butter, salted | 717 | 0.85 | 0.06 | 81.11 | 1 大匙＝14.2 g | 45935768104 |  |
| `soysauce` | 酱油 | [FDC 174277](https://fdc.nal.usda.gov/food-details/174277/nutrients) | Soy sauce made from soy and wheat (shoyu) | 53 | 8.14 | 4.93 | 0.57 | 1 大匙＝16 g；1 小匙＝5.3 g | 45935768104 |  |
| `oystersauce` | 蚝油 | [FDC 174529](https://fdc.nal.usda.gov/food-details/174529/nutrients) | Sauce, oyster, ready-to-serve | 51 | 1.35 | 10.92 | 0.25 | 1 大匙＝18 g | 45935768104 |  |
| `fishsauce` | 鱼露 | [FDC 174531](https://fdc.nal.usda.gov/food-details/174531/nutrients) | Sauce, fish, ready-to-serve | 35 | 5.06 | 3.64 | 0.01 | 1 大匙＝18 g | 45935768104 |  |
| `sugar` | 白糖 | [FDC 169655](https://fdc.nal.usda.gov/food-details/169655/nutrients) | Sugars, granulated | 387 | 0 | 99.98 | 0 | 1 小匙＝4.2 g | 45935768104 |  |
| `brownsugar` | 红糖 | [FDC 168833](https://fdc.nal.usda.gov/food-details/168833/nutrients) | Sugars, brown | 380 | 0.12 | 98.09 | 0 |  | 45935768104 |  |
| `honey` | 蜂蜜 | [FDC 169640](https://fdc.nal.usda.gov/food-details/169640/nutrients) | Honey | 304 | 0.3 | 82.4 | 0 | 1 大匙＝21 g | 45935768104 |  |
| `coconutmilk` | 椰浆 | [FDC 170172](https://fdc.nal.usda.gov/food-details/170172/nutrients) | Nuts, coconut milk, raw (liquid expressed from grated meat and water) | 230 | 2.29 | 5.54 | 23.84 | 1 大匙＝15 g | 45935768104 |  |
| `friedrice_chk` | 鸡肉炒饭（估算） | [FDC 2708953](https://fdc.nal.usda.gov/food-details/2708953/nutrients) | Rice, fried, with chicken | 173 | 7.28 | 27.62 | 3.66 |  | 45936117341 | **估算** 美国全国饮食调查的平均做法；油量、配料差很多 |
| `friedrice_pork` | 猪肉炒饭（估算） | [FDC 2708954](https://fdc.nal.usda.gov/food-details/2708954/nutrients) | Rice, fried, with pork | 179 | 7.56 | 27.62 | 4.16 |  | 45936117341 | **估算** 美国全国饮食调查的平均做法；油量、配料差很多 |
| `friedrice_shrimp` | 虾仁炒饭（估算） | [FDC 2708956](https://fdc.nal.usda.gov/food-details/2708956/nutrients) | Rice, fried, with shrimp | 166 | 6.68 | 27.85 | 2.97 |  | 45936117341 | **估算** 美国全国饮食调查的平均做法；油量、配料差很多 |
| `friedrice_veg` | 蛋炒饭／素炒饭（估算） | [FDC 2708951](https://fdc.nal.usda.gov/food-details/2708951/nutrients) | Rice, fried, meatless | 174 | 3.84 | 32.5 | 3.19 |  | 45936117341 | **估算** 美国全国饮食调查的平均做法；油量、配料差很多 |
| `lomein` | 素炒面（餐馆，估算） | [FDC 167677](https://fdc.nal.usda.gov/food-details/167677/nutrients) | Restaurant, Chinese, vegetable lo mein, without meat | 121 | 4.77 | 20.16 | 2.35 |  | 45935930445 | **估算** 美国中餐馆样本；做法差很多 |
| `kungpao` | 宫保鸡丁（餐馆，估算） | [FDC 167676](https://fdc.nal.usda.gov/food-details/167676/nutrients) | Restaurant, Chinese, kung pao chicken | 129 | 9.76 | 6.87 | 6.98 |  | 45935930445 | **估算** 美国中餐馆样本；做法差很多 |
| `chkveg` | 鸡肉炒杂菜（餐馆，估算） | [FDC 167678](https://fdc.nal.usda.gov/food-details/167678/nutrients) | Restaurant, Chinese, chicken and vegetables | 95 | 8.18 | 5.38 | 4.56 |  | 45935930445 | **估算** 美国中餐馆样本；做法差很多 |
| `noodlesoup` | 汤面（泛指，估算） | [FDC 2709145](https://fdc.nal.usda.gov/food-details/2709145/nutrients) | Soup, noodle, NFS | 90 | 5.48 | 10.08 | 2.99 |  | 45936117341 | **估算** 美国全国饮食调查的「汤面，泛指」，不是柬式粿条汤；汤底、肉量差很多，只能当很粗的参考 |
