# 项目规则

## 用户环境
- **两个环境共用本 repo**：Claude Code 网页版（claude.ai/code，远程容器）+ 本地 CLI
  （Windows，clone 在 `C:\Users\YANG\skills-github-pages`）。（2026-07-03 起，此前仅网页版）
- 网页版 session 里的「本地安装」都是指远程容器内，session 结束会消失
- ⚠️ SessionStart hook 已于 2026-07-05 停用：曾因安装任务过重导致网页版开新对话
  无限转圈数天。**禁止再注册阻塞式启动 hook**；如需持久化容器环境，必须后台执行
  ＋超时，见 `.claude/hooks/session-start.sh` 的停用说明
- 判别方法：环境变量 `CLAUDE_CODE_REMOTE=true` 为网页版容器；Windows 路径为本地

## 媒体文件规则
- **视频**：一律上传到 YouTube，设成「不公开」(unlisted)，用 `<iframe>` 嵌入页面，不直接放进仓库
- **图片**：旅游手册一律用 Google Places 图片链接，不上传图片文件到仓库
- **手册卡片必须带图和中英说明**（2026-07-11 用户明确要求）：新增/替换餐厅、景点卡片时，
  图片和描述一并补齐，不必询问。沙盒抓不到 Google 图片时走 GitHub Actions 抓取
  （参照 dispatch.md 教训 2026-07-10 的 CI 通道做法），仍拿不到才向用户要图。
- **音频**：可以直接放进仓库（文件小，没问题）

## 双语页面规则
- 所有双语（中/英）页面都要加系统语言自动侦测：首次打开时读 `navigator.language`，以 `zh` 开头显示中文，否则显示英文
- 用户手动点过语言切换按钮后，要记住该选择并**全站共用**：统一存 localStorage key `siteLangUser`
  （2026-07-12 起，不再各页独立 key），并监听 `storage` 事件让已开页面即时同步；之后优先于系统语言侦测
- 参考实现见 `japan-trip-2026.html` 和 `usj-disney-restaurants.html` 的 `initLang()` / `toggleLang()`
- **外语行话一律本地化**（2026-07-12 用户明确要求：扫描到直接改，不必询问）：手册只有
  中/英两种语言，读者不懂日语、韩语等第三方语言——描述与标签里的外语词，中文侧翻成中文
  （个室→包厢、握り寿司→手握寿司、おでん→关东煮等），英文侧的罗马字/音译翻成英文
  （karaage→fried chicken、teishoku→set meal 等）。
  例外保留：店名/品牌原文（现场找店要用）、英文已通用的词（sushi/sashimi/ramen/izakaya/
  tempura/bibimbap/kimchi 等词典收录词）。

## 部署
- 所有页面部署到 GitHub Pages
- 网址格式：`https://jarixhew-bit.github.io/skills-github-pages/文件名`
- 发给别人直接发网址，更新后对方刷新自动同步，不需要重发文件

## 专项组织规则（2026-07-05 与用户确认后建立）
- **开新专项前先选仓库**：对外网页/App/手册 → 本 repo；制度规则、给 Claude 的
  工作指示 → 本 repo 的 `.claude/playbook/`（唯一正本；workspace repo 的制度副本
  已于 2026-07-03 作废）。本 repo 是**公开仓库**，私密内容一律不放。
- **新专项必须开独立文件夹**（参照 `xisui/`、`trading/`），禁止把新文件散放在
  根目录。根目录现有旧页面为保住网址不搬动。
- **分支不用于分类**：分支只是合并前的临时工作区，合并后即删（网页版自动产生的
  `claude/*` 分支合并后应删除）。分类靠仓库和文件夹，不靠分支。

## 分支策略与上传流程
- Claude 把改动推到功能分支，然后**自动创建 PR 并合并到 main**，内容随即上线。
  这是用户授权过的自动流程，**不用每次再问**。
- 完整步骤（改完先跑哪些检查、合并方式、删分支、怎么验证、收工动作）见
  skill `publish-pages`（`.claude/skills/publish-pages/SKILL.md`）——那是唯一正本，
  此处只放授权与路由，不复述步骤。

## 现有项目
- `xisui/` — 洗髓功法练习 App（PWA）
- `japan-trip-2026.html` — 日本旅游手册（2026-07 已将 v2 设计转正，v2 文件已删除）
- `restaurant-guide.html` — 餐厅指南
- `usj-disney-restaurants.html` — USJ/迪士尼后餐厅（2026-07 已将 v2 设计转正；
  `usj-disney-restaurants-v2.html` 保留为跳转页，服务已发出去的旧链接，勿删）
- `boss-dinner.html` — 老板晚餐页（结构笔记见 `.claude/notes/travel-pages.md`）
- `expense-tracker.html` — 记帐工具（PWA）
- `fortune.html` — 运势页面
- `trading/` — IBKR 交易脚本与页面（`fund.html` 是作业系统简报页，2026-08-16 建，
  七区块仪表板：绩效／扫描／配置／风险／部位／再平衡／管线，风险指标由前端现算，
  新闻由 `.github/scripts/fetch_news.py` 每小时产出 `news.json`）
- `game-bot/` — 手机游戏每日自动签到脚本（AutoX.js，跑在安卓手机上）＋图文说明页
- **`butler-bot`（独立私有仓库 jarixhew-bit/butler-bot，2026-07-14 建立）** — Telegram 私人
  管家 bot（酒库存/航班追踪/提醒/记账/手册查询）。架构：Cloudflare Worker（webhook＋cron）
  ＋该仓库 data/ 当数据库＋Gemini 免费档＋AeroDataBox 航班数据，全免费。要改它时先用
  add_repo 把它加进 session（本地直接 clone/pull），代码与数据都直接推 main 不走 PR。
- **`ai-vault`（独立私有仓库 jarixhew-bit/ai-vault，2026-07-07 建立）** — AI 个人知识库
  （第二大脑）。用户说「存进 vault」「查 vault」时：网页版先用 add_repo 把它加进
  session，本地直接 clone/pull；管理规则见该仓库自己的 CLAUDE.md，直接推 main 不走 PR。
  **主动归档**：不等用户开口——任务收尾时若对话中出现值得长期记住的信息（决定、
  数字、经验、偏好），主动存进 vault 并告知一句；细则见该仓库 CLAUDE.md 核心任务 0。

## AI 工作制度（2026-07-03 建立，正本在本 repo 的 .claude/playbook/）

### 用户与沟通
- YANG，非工程师，中文使用者（回复用中文，简繁跟随用户）。少术语、先结论后细节，
  交付「能直接用」的成品；视觉产出优先用 Artifact 或部署成 Pages 页面。
- **提到任何地点都要附地图链接**（2026-07-16 用户明确要求）：回复里推荐/提及餐厅、
  景点、店铺等具体地点时，一律附 Google 地图链接（有 cid/place 链接最好，没有就用
  地址生成 `https://www.google.com/maps/search/?api=1&query=编码后的地址或店名`）；
  派 researcher 查地点类问题时，委派 prompt 里也要求它带回地图链接。
- **默认全自动，能自己做的绝不丢回给用户**（2026-08-12 用户明确要求：「以后都搞全自动
  我是负责下命令罢了」）。丢回去之前先问自己：**这真的只有他能做吗？**
  典型的假限制：「凭证在 Secret 里我读不到」——CI 读得到，把测试写成脚本用
  workflow_dispatch 跑（范例：`tools/flex-doctor.py`）。同理，沙盒连不上的外部服务、
  拿不到的数据，先想 CI 通道，不要先想「请用户帮我贴一下」。
  真的只有用户能做的（登入态＋2FA、付费、改他的帐户设定）才给他，而且要**一次讲完**、
  附直达链接、说明做完会怎样。
- **凡是要用户自己动手的，一律附直达链接**（2026-08-11 用户明确要求：「你让我做东西前要把
  网址都给我啊」）。两种情况都算：
  1. **要用户去点/去设置**：给能直接点开的那一页网址（例如 GitHub 仓库设置页
     `https://github.com/jarixhew-bit/skills-github-pages/settings`），再写要点哪个勾。
     只说「去仓库设置里打开某某」＝没交付。
  2. **交付页面**：附上线网址（`https://jarixhew-bit.github.io/skills-github-pages/文件名`），
     不能只说「打开 App 看看」。改的是页面里的一块（例如库存多一个类别）也要附那一页网址；
     老板版和同事版都改了就给两个。还没合并的写明「合并后才生效」。
- **推荐地点一律要求 Google 评分 4.2 以上**（2026-07-16 用户明确要求）：找餐厅、景点、
  游乐场所等具体地点时，筛选门槛设为 Google Maps 评分 ≥4.2；派 researcher 查地点类
  问题时，委派 prompt 里要写明这条门槛，并让它带回每个候选的评分数字。
  **例外**（2026-07-16 查证大阪电玩城/游艺设施时确认并经用户同意）：连锁电玩城、
  保龄球/体感运动馆这类游艺设施，日本本地评分体系普遍偏低（查证时 Round1、namco
  系列全数落在 2.2~4.1，没有一家到 4.2），此类地点门槛单独放宽到 **≥3.8**；
  其余类型（餐厅、景点、一般游乐场所）仍维持 ≥4.2。

### 四条铁律（违反任一条就是做错了）
1. **指挥官不下场**：大量读取、扫目录、爬网页、批次改档、浏览器多步操作、**等 CI／
   盯 PR 到合并**，一律派 subagent，主对话只收结论并**验收**（2026-08-19 用户要求：
   「以后都派 subagent 省 token，你只负责验收」）。预期塞进主对话超过约 200 行就算
   「大量」。清单与委派写法见 `.claude/playbook/dispatch.md` 第 1 节。
2. **验证不自验**：档案改动 read-back 抽查；重要产出派 fresh-context 的 `verifier`
   agent 验收（定义在 `.claude/agents/verifier.md`）。
3. **失败两次就换路**：同一方法失败 2 次，禁止第 3 次原样重试——换工具、换写法、
   查文件、或升级模型。
4. **建东西必配自检**（2026-08-01 用户要求：「以后的都要自检」）：新建长期存在的
   产出时，一并交付「怎么自动确认它还是好的」。做法：能用脚本判定的写成
   `tools/check-*.py`；会随时间腐坏的（外链、定时任务、外部 API、制度档膨胀）
   再挂 CI 定期跑、失效就开 issue。**检测放 CI（零 Claude 用量），只有需要判断力的
   修复才叫 Claude 上场**——拆不开检测与判断时才考虑用 Claude 定时任务。
   交付时告诉用户自检怎么跑。现有二十个，全部挂 CI（2026-08-19 校对过与 `tools/` 一致）：
   静态类 `check-html` / `check-secrets` / `check-rules` / `check-rule-homes`（查同一条规则
   有没有被复述进第二个档案）/ `check-images` / `check-ai-note` /
   `check-pwa-scopes` / `check-workflows` / `check-ci-notify` / `check-morning-positions` /
   `check-generated`（查「生成又提交进仓库」的产物有没有跟源文件脱节）/
   `check-news`（把 requests/feedparser 打桩，验新闻的两处易错：译文分批时**位置不会
   错位**——错位会把 A 公司的消息安到 B 公司头上；以及同一条新闻**跨区块去重**）/
   `check-gamebot`（＋`check-gamebot-logic.mjs`：把安卓 API 打桩，用假屏幕实跑手机脚本，
   查语法查不出的行为问题）；浏览器类 `check-expense-company.mjs` /
   `check-staff-page.mjs` / `check-inventory.mjs` / `check-fund.mjs`（验 `trading/fund.html`
   那些前端现算的钱的数字：夏普、回撤、VaR、再平衡差额，用手算得出答案的 fixture 去对；
   两个数据档全用固定 fixture 拦掉，所以不随每天行情变动而误报）/ `check-weather.mjs`
   （验新加坡手册每日天气条：拦住 open-meteo 造出「有预报／超出预报窗口／API 挂掉」
   三种情境，确认每天读的是自己那一格、不会错位，也不会开天窗）（跑前要先起
   `python3 -m http.server 8899`，沙盒里加 `CHROMIUM_PATH=/opt/pw-browsers/chromium`）；
   线上类 `check-live`（每天验线上页面是不是 main 那一版，**只能在 CI 跑**，
   沙盒连不上 github.io）＋ `fetch-photos`（抓图通道，结果会写回触发分支）。
   **改完 `expense-tracker.html` 要跑全部自检，不是只跑手上那一个**——同一个文件被两份
   浏览器自检覆盖，只跑一个就推，另一个会在 CI 上红（2026-08-07 踩过）。跑法用
   **`python3 tools/check-all.py`**（2026-08-13 建立）：并行跑、自动起 http server、
   自动带 `CHROMIUM_PATH`，实测**79 秒**跑完；一个一个串行跑同样这些要 5~6 分钟。
   它默认不跑 `check-images`（外链体检，独立 105 秒，CI 每周一自己跑）与 `check-live`
   （沙盒连不上 github.io），要外链体检加 `--with-network`。
   跑完全部就够了：生成物脱节由 `check-generated` 守着（2026-08-12 之前那个检查
   叫 `build-staff-page.py --check`，不合命名规则、照着这句话做正好会漏掉，已改名收编）。

### 路由表（遇到左边情况，**必须先 Read 右边档案**再动手）

⚠️ **这些档案不会自动载入**（2026-08-13 起从 `.claude/rules/` 搬到 `.claude/playbook/`，
就是为了让它们不进每个 session 的固定开销）。**你现在手上没有它们的内容，凭印象做
＝违规。** 遇到路由表左边的情况，先 Read 对应档案，再动手。省下的 token 是拿来
换「按需读」的，不是拿来换「不读」的。

| 情况 | 读这个档 |
|---|---|
| 要派 subagent、选模型、任务较大需拆解 | `.claude/playbook/dispatch.md` |
| 不确定该升级模型／算不算完成／该不该问用户 | `.claude/playbook/judgment.md` |
| 派工时要写委派 prompt | `.claude/playbook/templates.md`（填好的真实范例在 `examples.md`） |
| 要改现有项目（页面/xisui/trading） | `.claude/notes/` 对应结构笔记（锚点、改哪几处、坑） |
| 想修改制度档或本档 | `.claude/playbook/maintenance.md` |
| 新 session 开始较大工作之前 | `.claude/playbook/letter.md`（背景与注意事项） |
| 选浏览器／爬网工具拿不定主意 | `.claude/playbook/diagnosis.md` 问题 #2 的路由表 |
| 要动手做具体的事（放媒体、算数字、控范围、组织新档案） | `skills/INDEX.md` 查表选一份 |

### 制度档的同步与分支
- 本地与网页版共用这套制度，靠 git 同步：开工前 `git pull`，改完必推送。
- 制度档改动的推送方式跟随本 repo 分支策略（功能分支 + PR + squash merge）；
  本地 CLI 没有 PR 工具时可直接 commit 到 main，但要在回复里说明。
