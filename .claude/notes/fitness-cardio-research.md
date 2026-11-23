<!-- 2026-11-22 由研究员查证（CI 通道读原文），原稿在 session scratchpad；App「力量课后 15 分钟有氧」的文案每句要对得上这里的引句。 -->

# 「力量课后 15 分钟有氧」查证笔记（2026-11-22）

委派问题：用户想把 fitness/ App 单独的 12 周有氧计划，换成每次力量课（每周 3 次、约 30 分钟全身）后接 15 分钟有氧。
用户：男、40 岁、72 kg、168 cm、BMI 25.5、膝盖没问题；健身房有跑步机／固定单车／椭圆机（没有踏步机）；每天洗髓功 45 分钟（3.3 MET）；16/8。
目标：减脂＋心脏健康。本档只记查证，不改 App。

## 0. 查证强度

- 全部走 CI 通道读原文（fetch-url.yml 抓 PubMed E-utilities efetch，mode=html；web-lookup.yml 读网页）。没有绕过任何防护。
- 标记：【已读摘要】／【已读原文】＝CI 抓回原文核对过；【二手】＝只读到二手转述；【推论】＝我算的/我推的；【未查证】＝没拿到。
- 沿用 `.claude/notes/fitness-fatloss-research.md` 已查证的：ACSM 2009（PMID 19127177）、Wewege 2017（PMID 28401638，「骑车类训练没减到脂肪」）、
  Compendium 气功 15670＝3.3 MET、Tanaka HRmax（40 岁＝180）、ACSM 中等 64–76%／剧烈 77–95% HRmax（二手，PMC13210717）。
- **委派给的 PMID 有一个是错的**：29086308 是一篇蛋白质工程论文（Methods Mol Biol），不是 Eddens。Eddens 2018 正确 PMID＝**28917030**（esearch run 44992514842 查到，摘要 run 44992619594 读过）。

run 一览（都是 2026-11-22）：
- fetch-url 44992119183：efetch Wilson 2012、Gillen 2016、Little 2010、Riebe 2015、Vollaard 2017、Bull 2020（＋错的 29086308）
- fetch-url 44992121292：esearch Schumann 2022（→ 34757594）
- fetch-url 44992512800：efetch Schumann 2022、Milanović 2015
- fetch-url 44992514842 / 44992516649 / 44992518690：esearch Eddens、talk test、low-volume HIIT meta
- fetch-url 44992619594：efetch Eddens 2018、Lu 2025、Yin 2024、Peng 2023、Sultana 2019
- fetch-url 44992621335：efetch Reed & Pipe 2014、Lyon 2014、Quinn & Coons 2011、Bok 2022 等 talk test 摘要
- fetch-url 44992623160：WHO 2020 指南 PMC7719906 全文
- fetch-url 44992673869：efetch Helgerud 2007
- web-lookup 44992122996：Compendium 2024 conditioning／walking／running 三页
- web-lookup 44992520361：Compendium bicycling 页＋PMC7719906（关键字）＋LWW Riebe 全文页（无命中，等于没读到）
- web-lookup 44992124730：WHO 身体活动 fact sheet（CDC「measuring intensity」页 HTTP 403，没读到）
- web-lookup 44992672070：ODPHP（美国指南 Top 10）＋ IDEA Fitness 转述 Riebe 2015 的算法表

## 1. 问题 1：有氧放在力量后面，会不会吃掉力量／肌肉？

| # | 研究 | 原文引句 | 状态 |
|---|---|---|---|
| I1 | **Eddens 2018** Sports Med 48:177，PMID 28917030，10 个研究、≥5 周 | "resistance-endurance exercise sequence had a positive effect for lower-body dynamic strength, in comparison to the alternate sequence (weighted mean difference, 6.91% change; 95% confidence interval 1.96, 11.87 change; p = 0.006), with no effect of exercise sequence for lower-body muscle hypertrophy (weighted mean difference, 1.15% change; … p = 0.40), lower-body static strength (… p = 0.98), or the remaining outcomes of maximal aerobic capacity and body fat percentage (p > 0.05)." | 【已读摘要】run 44992619594 |
| I2 | **Wilson 2012** J Strength Cond Res 26:2293，PMID 22002517，21 个研究 | "resistance training concurrently with running, but not cycling, resulted in significant decrements in both hypertrophy and strength."；"Correlational analysis identified significant negative relationships between frequency (-0.26 to -0.35) and duration (-0.29 to -0.75) of endurance training for hypertrophy, strength, and power."；"interference effects of endurance training are a factor of the modality, frequency, and duration of the endurance training selected." | 【已读摘要】run 44992119183 |
| I3 | **Schumann 2022** Sports Med 52:601，PMID 34757594，43 个研究 | "SMD … - 0.06 (95% CI - 0.20 to 0.09; p = 0.446), - 0.28 (95% CI - 0.48 to - 0.08; p = 0.007), and - 0.01 (95% CI - 0.16 to 0.18; p = 0.919) for maximal strength, explosive strength, and muscle hypertrophy"；"Attenuation of explosive strength was more pronounced when concurrent training was performed within the same session (p = 0.043) than when sessions were separated by at least 3 h"；"No significant effects were found for the other moderators, i.e. type of aerobic training (cycling vs. running), … training status (untrained vs. active), and mean age (< 40 vs. > 40 years)."；结论 "Concurrent aerobic and strength training does not compromise muscle hypertrophy and maximal strength development." | 【已读摘要】run 44992512800 |

**两边并列（跑步 vs 骑车）**：Wilson 2012 说跑步才有干扰、骑车没有；较新、较大的 Schumann 2022 说骑车 vs 跑步「没有显著差别」，而且整体上最大力量与肌肥大都不受影响。两篇都是摘要层级。
**顺序**：Eddens 2018 支持「先力量后有氧」（下肢动态力量 +6.91%），肌肥大与体脂不受顺序影响。用户本来就打算放在后面 → 顺序已经是对的。
**15 分钟算不算问题（【推论】）**：Wilson 看到时长、频率越大干扰越大；15 分钟×3 次属于很小的量。Schumann 唯一显著的损失是「爆发力」，且同一节课里更明显——用户目标是减脂＋心脏，不是跳跃/冲刺表现，影响可忽略。
各研究里有氧的具体时长没在摘要里，「15 分钟比研究里的量小」是推论。【未查证】

## 2. 问题 2：15 分钟能练到什么？

| # | 研究 | 原文引句 | 状态 |
|---|---|---|---|
| H1 | **Gillen 2016** PLoS One，PMID 27115137（久坐男性 27±8 岁，12 周，每周 3 次） | "SIT involved 3x20-second 'all-out' cycle sprints (~500W) interspersed with 2 minutes of cycling at 50W, whereas MICT involved 45 minutes of continuous cycling at ~70% maximal heart rate (~110W). Both protocols involved a 2-minute warm-up and 3-minute cool-down at 50W."；"Peak oxygen uptake increased after training by 19% in both groups"；"improved indices of cardiometabolic health to the same extent as traditional endurance training in sedentary men, despite a five-fold lower exercise volume and time commitment." | 【已读摘要】run 44992119183 |
| H2 | **Little 2010** J Physiol，PMID 20100740（7 名 21 岁男性，2 周 6 次） | "Each session consisted of 8-12 x 60 s intervals at approximately 100% of peak power output elicited during a ramp V(O2) peak test (355 + or - 10 W) separated by 75 s of recovery." 结果是肌肉线粒体与计时赛表现，**不是 VO2max、不是减脂**；摘要称 'all out' 冲刺 "may not be safe, practical and/or well tolerated by certain individuals"，所以才设计这个较温和的版本 | 【已读摘要】 |
| H3 | **Yin 2024** Appl Physiol Nutr Metab 49:273，PMID 37939367（21 个研究、849 人；LV-HIIT＝「≤5 min high-intensity exercise within a ≤15 min session」） | "LV-HIIT increased cardiorespiratory fitness (CRF, SMD = 1.19 [0.87, 1.50]) while lowering systolic blood pressure (SMD = -1.44 …), … fat mass (kg) (SMD = -0.22 [-0.44, 0.00]), fat mass (%) (SMD = -0.22 [-0.41, -0.02]), and waist circumference (SMD = -0.53 [-0.75, -0.31]) compared to untrained control"；"there were no statistically significant differences observed for any outcomes in comparisons between LV-HIIT and … (MICT) or high-volume HIIT."；"Performing LV-HIIT at a higher intensity drives higher CRF gains. More repetitions, longer time at high intensity, and total session duration did not augment gains in CRF." | 【已读摘要】run 44992619594 |
| H4 | **Sultana 2019** Sports Med 49:1687，PMID 31401727（47 个研究；low-volume＝≤500 MET-min/周） | "No difference was found between low-volume HIIT and a non-exercising control on total body fat mass (kg) (… p = 0.455)"；"low-volume HIIT significantly improved cardiorespiratory fitness compared with a non-exercising control (p < 0.001) and MICT (p = 0.017)"；"a time-efficient treatment for increasing fitness, but not for the improvement of body composition." | 【已读摘要】 |
| H5 | **Milanović 2015** Sports Med 45:1469，PMID 26243014（18–45 岁健康成人） | "When compared with endurance training, there was a possibly small beneficial effect for HIT (1.2 mL·kg(-1)·min(-1) …)"；结论 "Endurance training and HIT both elicit large improvements in the VO2max … with the gains in VO2max being greater following HIT" | 【已读摘要】run 44992512800（App CD_WHY 已引用，这次补读原文） |
| H6 | **Helgerud 2007** MSSE 39:665，PMID 17414804（40 名中等训练男性，每周 3 次、8 周） | "4 x 4 min of interval running (4 min of running at 90-95% HRmax followed by 3 min of active resting at 70%HRmax)"；"The percentage increases for the 15/15 and 4 x 4 min groups were 5.5 and 7.2%" | 【已读摘要】run 44992673869（App CD_WHY 原写「摘要层级，未读全文」，数字一致） |
| H7 | **Vollaard & Metcalfe 2017** Sports Med，PMID 28391489（观点文章，不是 meta） | "novel SIT protocols with both fewer and shorter sprints are efficacious at improving important risk factors of noncommunicable diseases in sedentary individuals" | 【已读摘要】 |
| H8 | Lu 2025 Front Endocrinol，PMID 39917538（血糖；对象非运动员成人） | "LV-HIIT was more effective in improving insulin sensitivity (SMD=-0.40 …), but there were no differences in FPG, FPI, HbA1c or HOMA-IR" vs MICT | 【已读摘要】（附带，与用户关系较远） |

**减脂两边并列**：Yin 2024 看到 LV-HIIT 比不运动多减一点脂肪（SMD −0.22，CI 上界 0.00 刚好碰线）、腰围 SMD −0.53；Sultana 2019 看到脂肪量与不运动没差。两篇一致的是：**心肺（VO2max）一定有进步**、减脂很小或没有。加上 Wewege 2017「cycling training did not induce fat loss」（旧档已读）。
→ 结论：15 分钟有氧的价值在**心肺与血压**，减脂靠饮食（旧档已有结论）。

**WHO 指南（Bull 2020，PMID 33239350／PMC7719906 全文，run 44992623160）**【已读原文】：
- "Adults should do at least 150–300 min of moderate-intensity aerobic physical activity, or at least 75–150 min of vigorous-intensity aerobic physical activity, or an equivalent combination of moderate-intensity and vigorous-intensity activity throughout the week for substantial health benefits"
- "MVPA bouts of any duration now count towards these recommendations … This recommendation differs from the requirement of bouts of at least 10 min in the previous WHO 2010 guidelines."
- 强度定义（全文 glossary）："moderate-intensity refers to the physical activity that is performed between 3 and <6 times the intensity of rest (METs). On a scale relative to an individual's personal capacity, MPA is usually a 5 or 6 on a rating scale of perceived exertion scale of 0–10."；"vigorous intensity refers to physical activity that is performed at 6.0 or more METs. … VPA is usually a 7 or 8"
- **「剧烈 1 分钟＝中等 2 分钟」这句原话没读到**【未查证】：WHO 只写「equivalent combination」；1:2 是由 150 对 75 的比例推出来的【推论】。美国指南 ODPHP 页（run 44992672070）这次也只命中「150 to 300 minutes of moderate-intensity」那句，没印到「twice」。

**3×15 分钟占多少（【推论】）**：每周 45 分钟。若其中真正达剧烈的约 15 分钟、其余算中等 → 约 60 分钟「中等当量」，占 WHO 下限 150 的约 4 成。

**洗髓功 315 分钟/周算不算——两种口径并列**：
- 按 WHO 绝对口径（3–<6 MET＝中等），气功 3.3 MET（Compendium 15670，旧档已读）**算中等** → 光洗髓功就超过 300 分钟上限。
- 按个人相对口径：100 bpm ÷ 180 ＝ 55.6% HRmax（旧档），低于 ACSM 中等下限 64%（二手）；WHO 相对口径要 RPE 5–6/10，洗髓功体感大概 2–3【推论】→ **不算中等**。
- 【推论】对「心脏健康／VO2max」来说，洗髓功达不到刺激心肺进步的强度；这正是 15 分钟有氧要补的。Compendium 15670 是否为估算值（标红）旧档已记「未查证」。

## 3. 问题 3：跑步机坡度走 vs 单车 vs 椭圆机

**Compendium 2024 原文行**（web-lookup run 44992122996、44992520361）【已读原文】：

| 代码 | MET | 原文描述 |
|---|---|---|
| 17358 | 4.8 | Walking, treadmill, 3.5 to 3.9 mph (5.6 to 6.3 km/h), 0% grade |
| 17361 | 5.8 | Walking, treadmill, 4.0 to 4.4 mph (6.4 to 7.1 km/h), 0% grade |
| 17034 | 5.3 | Climbing hills, no load, 1 to 5% grade, moderate-to-brisk pace |
| 17035 | 7.0 | Climbing hills, no load, 6 to 10% grade, moderate-to-brisk pace |
| 17036 | 8.8 | Climbing hills, no load, 11 to 20% grade, slow-to-moderate pace |
| 01214 | 4.0 | Bicycling, stationary, 50 watts, light effort |
| 01220 | 6.0 | Bicycling, stationary, 90-100 watts, moderate to vigorous |
| 01224 | 6.8 | Bicycling, stationary, 101-125 watts |
| 01228 | 8.0 | Bicycling, stationary, 126-150 watts |
| 01232 | 10.3 | Bicycling, stationary, 151-199 watts |
| 02048 | 5.0 | Elliptical trainer, moderate effort |
| 02049 | 9.0 | Elliptical trainer, vigorous effort |

- 注意：坡度走的 17034–17036 是「Climbing hills」（户外爬坡），Compendium 跑步机条目只有 0% 坡度的；拿来套跑步机坡度走是【推论】。
- 页面注脚原文："Specific Activity Codes in red are estimated MET values. All other values are supported with published literature." 哪些码标红【未查证】（纯文字看不到颜色）。

**15 分钟、72 kg 能量（【推论】：kcal ≈ MET × 72 × 0.25 h，1 MET≈1 kcal/kg/h 旧档已读）**：
- 坡度走 7.0 MET 全程：126 kcal；单车 125–150 W（8.0）：144 kcal；椭圆机中等（5.0）：90、剧烈（9.0）：162 kcal。
- 每周 3 次约 300–450 kcal（毛），扣掉本来坐着的 1 MET 约少 54 kcal/周。≈0.04–0.05 kg 脂肪/周（7700 kcal/kg 换算来源旧档未查证）。**减脂贡献很小**。

**关节负担与腿日干扰**：
- 干扰：Wilson 2012「跑步有、骑车没有」vs Schumann 2022「骑车跑步没差」（见第 1 节）。坡度走不是跑步、没有腾空冲击——它比较像哪一边【未查证】，我推论接近骑车/椭圆这类低冲击。
- 关节冲击力的数字（走 vs 椭圆 vs 单车）这次没查【未查证】；常识层面三者都比跑步低冲击【推论】。
- 腿日后的实用性（【推论】）：单车坐着、负重在机器上，深蹲/硬拉日之后最好控；坡度走会再用到臀与小腿，但离心负担小；椭圆机全身参与、可以推拉把手分担腿部。

## 4. 问题 4：不进实验室怎么抓强度

- HRmax：Tanaka 208−0.7×40＝**180**（旧档已读 PMID 11153730）。
- ACSM：中等 64–76% → **115–137 bpm**；剧烈 77–95% → **139–171 bpm**（二手 PMC13210717，旧档；Garber 2011 原表仍【未查证】——这次又试了 LWW 全文页，无命中）。
- Helgerud 4×4：快段 90–95% → **162–171 bpm**；慢段 70% → **126 bpm**（H6 已读）。
- Gillen MICT 约 70% HRmax → 126 bpm（H1 已读）。
- **说话测验（talk test）**：
  - Reed & Pipe 2014 Curr Opin Cardiol，PMID 25010379【已读摘要 run 44992621335】："comfortable speech is likely possible … when exercise intensity is below the ventilatory or lactate threshold, and not likely possible … when exercise intensity exceeds the ventilatory or lactate threshold."；"consistent across various modes of exercise (i.e., walking, jogging, cycling, elliptical trainer and stair stepper). It may not be practical for high-intensity interval training."
  - Quinn & Coons 2011 J Sports Sci，PMID 21774751（15 人、18–35 岁、跑步机）【已读摘要】："Participants were exercising at 64 ± 5% VO2max, 82 ± 7% maximal heart rate, and 12 ± 2% RPE … at the +Talk Test, and 71 ± 6% VO2max, 90 ± 6% maximal heart rate, and 15 ± 2% RPE at the +/-Talk Test"
  - Bok 2022 Sports Med，PMID 35507232（综述）【已读摘要】："Equivocal stage of the TT, RPE of 10-11, … are reflective of the ventilatory threshold, while negative stage of the TT, RPE of 13-15 … are reflective of the respiratory compensation threshold."
  - 两边并列：Quinn 测到「还能舒服说话」时心率已经 82% HRmax（约 148），比 ACSM 中等上限 76% 高；年轻受试者、跑步机，套到 40 岁【推论】。
- WHO 相对强度：中等＝RPE 5–6/10、剧烈＝7–8/10（第 2 节已读原文）。

## 5. 问题 5：40 岁男性做 HIIT 的安全

- **Riebe 2015**（ACSM 体检筛查更新），PMID 26473759【已读摘要 run 44992119183】："The roundtable proposed a new evidence-informed model for exercise preparticipation health screening on the basis of three factors: 1) the individual's current level of physical activity, 2) presence of signs or symptoms and/or known cardiovascular, metabolic, or renal disease, and 3) desired exercise intensity"；"risk factor profiling is no longer included in the exercise preparticipation health screening process."
- 算法细节（全文没读到，LWW 页无命中）【二手：IDEA Fitness 转述，run 44992672070，"Tables adapted from Riebe et al. 2015."】：
  - 有规律运动、无心血管/代谢/肾脏疾病、无症状："Medical clearance is not necessary. Continue moderate- or vigorous-intensity exercise, progressing by ACSM guidelines."
  - 有已知疾病、无症状："Medical clearance (within the last 12 months if there has been no change in signs/symptoms) is recommended before engaging in vigorous-intensity exercise."
  - 有任何症状："Stop exercise and seek medical clearance."
  - 症状定义："pain and/or discomfort in the neck, chest, arms, jaw, or other areas from ischemia …; shortness of breath at rest or with mild exertion; dizziness or syncope …; unusual fatigue or shortness of breath with usual activities"
  - 转述原文另有 "there is no evidence that age is a strong predictor of SCD or AMI (Riebe et al. 2015)"。
  - 「规律运动者」的精确定义（每周几天、几分钟、多少个月）：转述该行被截断【未查证】。
- **WHO 2020**（PMC7719906 全文）【已读原文】："Pre-exercise medical clearance is generally unnecessary. … An individual who is habitually engaging in moderate-intensity activity can gradually increase to vigorous intensity activity without needing to consult a healthcare provider. Those who develop new symptoms when increasing their levels of activity should consult a healthcare provider."
- 对这位用户（【推论】）：每周力量 3 次＋每天气功，若已持续数月可视为「规律运动」；没有已知心血管/代谢/肾病（**用户未告知血压、血糖、家族史——要问**）→ 按 ACSM 转述与 WHO，可逐步上到剧烈强度不必先体检；出现胸闷胸痛、头晕、异常喘 → 停、看医生。
  App 现有 CD_SAFE 写法（ideafit 二手）与此一致。BMI 25.5 本身不在 2015 筛查条件里（risk factor profiling 已移除）。

## 6. 三个 15 分钟方案（机器设定标「App 的安排」者无来源）

共同点：都放在力量课**之后**（Eddens 2018）；热身用 App 的安排（力量课已经热过身，所以只要 2–3 分钟）。

### 方案 1：单车 1 分钟间歇（「低量 HIIT」）
- 结构：热身 3 分钟轻踩（约 50 W，Gillen 的热身强度）→ **5 × (1 分钟用力 + 1 分钟轻踩)** → 放松 2 分钟。共 15 分钟、用力 5 分钟。
  - 「≤15 分钟课里 ≤5 分钟高强度」正好落在 Yin 2024 的 LV-HIIT 定义；1 分钟用力段的形式取自 Little 2010（他们是 8–12 次、休 75 秒）；次数缩成 5 次＝App 的安排。
- 目标：用力段最后 20 秒心率到 **153–171 bpm（85–95%）**、RPE 8/10、说不出完整句子；轻踩段回落到 ≤126（70%）。85% 下限＝App 的安排（Helgerud 4×4 用 90–95%）。
- 阻力：用力段先试 150–200 W／踏频 80–90（App 的安排，起点猜测；Compendium 151–199 W＝10.3 MET），以心率为准调整；轻踩 50 W。
- 能量（推论）：(3×4.0 + 5×10.3 + 5×4.0 + 2×4.0) MET-min ×72/60 ≈ **110 kcal**。
- 优：证据最贴（Yin 2024：心肺 SMD 1.19、血压下降、跟持续有氧一样好；更高强度＞更多次数）；坐着、对膝盖最友善；Wilson 说骑车不干扰。
- 缺：累；Reed & Pipe 说说话测验不适合 HIIT，要看心率；减脂效果小（Sultana 2019）。

### 方案 2：短版 4×4 → 「2×4」（椭圆机或坡度跑步机）
- 结构：热身 3 分钟（心率到约 126）→ **4 分钟 90–95%（162–171 bpm）→ 3 分钟 70%（约 126 bpm）→ 4 分钟 90–95%** → 放松 1 分钟。共 15 分钟。
  - 快段/慢段的强度与时长来自 Helgerud 2007（H6）；**只做 2 轮**＝App 的安排（研究是 4 轮、每周 3 次）。用力 8 分钟，超过 Yin 的「≤5 分钟」定义，属于介于 LV-HIIT 与标准 4×4 之间，**没有直接试验**。
- 机器：椭圆机用阻力/坡度调到快段 RPE 8/10（App 的安排）；或跑步机坡度 10–12%、5.5–6.5 km/h 快走（App 的安排；Compendium 只有户外爬坡 11–20% 的 8.8 MET 可参考）。
- 能量（推论）：(3×5.0 + 8×9.0 + 3×5.0 + 1×5.0) ×72/60 ≈ **128 kcal**（椭圆机）。
- 优：最接近 App 原本 4×4 的设计，CD_WHY 的理由能沿用；4 分钟段比 1 分钟段好控心率。
- 缺：8 分钟在 90% 以上，力量课后最难熬；2 轮效果多少没研究。

### 方案 3：坡度走稳态（中等偏上）
- 结构：热身 2 分钟（0–3%、5.0 km/h）→ **12 分钟 坡度 8–12%、5.0–5.5 km/h，心率 126–145 bpm（70–80%）** → 放松 1 分钟（坡度归零）。App 的安排：坡度与速度。
- 强度：能讲完整句子但不能唱歌（说话测验「还能舒服说话」的上缘；Quinn 2011 测到此时约 82% HRmax、RPE 12）。
- 能量（推论）：(12×7.0 + 3×4.0) ×72/60 ≈ **115 kcal**（7.0＝Compendium 17035，户外 6–10% 爬坡）。
- 优：最轻松、最好坚持，最不影响隔天力量；Gillen 的 MICT 组也是 70% HRmax（但他们做 45 分钟）。
- 缺：15 分钟中等强度的心肺刺激最弱（Yin/Milanović：高强度对 VO2max 较好）；不要抓扶手（抓了耗能会掉——常识，【未查证】）。

## 7. A／B／C 怎么配（App 的 PLAN：A 深蹲＋推（gsquat、bench、rdl、row1）、B 弓步＋肩（lunge、ohp、thrust、row2）、C 单腿＋背（split、fpress、step、rfly））

| 日 | 腿部负担（推论） | 建议 | 理由 |
|---|---|---|---|
| A | 最重：高脚杯深蹲＋罗马尼亚硬拉 | **方案 3 坡度走** | 腿最累的一天用最温和的；照样凑中等分钟数 |
| B | 中：弓步＋臀推（臀部为主） | **方案 1 单车 1 分钟间歇** | 每周一次真正的高强度，坐着骑、不加冲击 |
| C | 股四头较累：分腿蹲＋登阶 | **方案 2 「2×4」椭圆机**；腿太酸就改方案 3 | 第二次高强度；椭圆机可用手臂分担 |

- 注意 App 的力量课已经有 6 分钟「燃脂收尾」（A/C AMRAP、B 40/20×6，旧档第 1 节）。再接 15 分钟间歇等于每次两段高强度——**建议有接方案 1/2 的那天省掉收尾，或收尾改轻**（App 的安排，未查证）。
- 起步（App 的安排）：前 2 周三天都做方案 3，确认没有不适症状后再把 B、C 换成间歇（对应 WHO「gradually increase」原则）。
- 每周合计（推论）：约 45 分钟、其中剧烈约 13 分钟 → 约 58 分钟中等当量；加上力量课，离 WHO 150 仍差。若想更接近，最便宜的是休息日多快走（旧档：此说法来源未查证）。

## 8. 未查证清单

- 「剧烈 1 分钟＝中等 2 分钟」的原句（WHO 只写 equivalent combination；美国指南原文没印到）。
- Garber 2011 %HRmax 原表（又试一次 LWW，无命中）。
- Riebe 2015 全文算法（只读到摘要＋IDEA Fitness 二手表格）；「规律运动者」定义被截断。
- 坡度走/椭圆/单车的关节受力数字；坡度走在干扰效应里属于「跑步」还是「低冲击」。
- Compendium 坡度码用在跑步机上（户外爬坡码，推论）；哪些码是估算值（标红）。
- 「2×4」与「5×1 分钟」这两个**精确**组合没有直接试验，是按 Helgerud／Little／Yin 缩出来的。
- Eddens／Schumann 纳入研究里有氧的时长（摘要没写）。
- CDC 说话测验页（HTTP 403）。

## 9. 写进 App 时的更正与取舍（2026-11-22）

- **Eddens 2018 的 PMID＝28917030**（委派时给的 29086308 是别的论文，见第 0 节）。App 里的链接一律用 28917030。
- 方案 3 的心率区间按 70–80% × 180 算是 **126–144**（第 6 节写的 145 是 80.6%，四舍五入口径不一）；App 以百分比现算，显示 126–144。
- 剧烈／中等分钟的分类（方案1 用力 5 分钟、方案2 快段 8 分钟算剧烈，其余算中等）与「剧烈 1 分钟＝中等 2 分钟」都标「App 的推论」。
- 旧版「12 周有氧计划」的说明（Coyle 1984 停训、Seiler 2010 两极化、Garmin VO2max 更新条件、Milanović「+4.9 vs +5.5」）随计划一起拿掉；Milanović 改用本档 H5 的引句。

## 10. 2026-11-23 用户拍板改成 20 分钟（没有新查证，只重算）

- 新结构（App 的安排）：方案1 热身 3 → 7×(1 分钟用力 153–171＋1 分钟轻踩 ≤126) → 放松 3；方案2 热身 3 → 4 分钟 162–171 → 3 分钟约 126 → 4 分钟 162–171 → 3 分钟约 126 → 放松 3；
  方案3 坡度 8–12%、5.0–5.5 km/h、心率 126–144 连续 20 分钟。各 1200 秒。
- kcal（【推论】，同第 3 节算法 Σ MET×分钟 ×72÷60）：方案1 (3×4.0＋7×10.3＋7×4.0＋3×4.0)＝124.1 → **149**；方案2 (3×5.0＋8×9.0＋6×5.0＋3×5.0)＝132 → **158**；方案3 20×7.0＝140 → **168**。
- 剧烈／中等分钟（App 的推论）：方案1 7／13、方案2 8／12、方案3 0／20（保守全算中等）。中等当量（剧烈×2）：每周 3 次＝75；每周 2 次按 A→B→C 轮：B+C 55、A+B 47、C+A 48；前 2 周全方案3：40。
- **对 Yin 2024 的影响**：LV-HIIT 定义是「≤15 min session、≤5 min high-intensity」，改成 20 分钟后方案1（用力 7 分钟）也不在定义内——App 文案改写为「三个方案都不在这个定义里」。
- Gillen 2016 的放松是 "3-minute cool-down at 50W"（H1 引句），方案1 放松 3 分钟约 50 W 与之相同；热身 3 分钟（Gillen 是 2 分钟）是 App 的安排。
