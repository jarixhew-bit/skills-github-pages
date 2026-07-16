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
  工作指示 → 本 repo 的 `.claude/rules/`（唯一正本；workspace repo 的制度副本
  已于 2026-07-03 作废）。本 repo 是**公开仓库**，私密内容一律不放。
- **新专项必须开独立文件夹**（参照 `xisui/`、`trading/`），禁止把新文件散放在
  根目录。根目录现有旧页面为保住网址不搬动。
- **分支不用于分类**：分支只是合并前的临时工作区，合并后即删（网页版自动产生的
  `claude/*` 分支合并后应删除）。分类靠仓库和文件夹，不靠分支。

## 分支策略
- Claude 将改动推送到功能分支，然后**自动创建 PR 并合并到 main**
- 合并方式：squash merge
- 如有冲突先 merge origin/main 解决后再合并

## 上传流程
1. 用户上传修改好的文件（或直接说明需求）
2. Claude 修改文件并 commit push 到功能分支
3. Claude 创建 PR 并自动合并到 main → 内容上线到 GitHub Pages

## 现有项目
- `xisui/` — 洗髓功法练习 App（PWA）
- `japan-trip-2026.html` — 日本旅游手册（2026-07 已将 v2 设计转正，v2 文件已删除）
- `restaurant-guide.html` — 餐厅指南
- `usj-disney-restaurants.html` — USJ/迪士尼后餐厅（2026-07 已将 v2 设计转正，v2 文件已删除）
- `expense-tracker.html` — 记帐工具（PWA）
- `fortune.html` — 运势页面
- `trading/` — IBKR 交易脚本与页面
- **`butler-bot`（独立私有仓库 jarixhew-bit/butler-bot，2026-07-14 建立）** — Telegram 私人
  管家 bot（酒库存/航班追踪/提醒/记账/手册查询）。架构：Cloudflare Worker（webhook＋cron）
  ＋该仓库 data/ 当数据库＋Gemini 免费档＋AeroDataBox 航班数据，全免费。要改它时先用
  add_repo 把它加进 session（本地直接 clone/pull），代码与数据都直接推 main 不走 PR。
- **`ai-vault`（独立私有仓库 jarixhew-bit/ai-vault，2026-07-07 建立）** — AI 个人知识库
  （第二大脑）。用户说「存进 vault」「查 vault」时：网页版先用 add_repo 把它加进
  session，本地直接 clone/pull；管理规则见该仓库自己的 CLAUDE.md，直接推 main 不走 PR。
  **主动归档**：不等用户开口——任务收尾时若对话中出现值得长期记住的信息（决定、
  数字、经验、偏好），主动存进 vault 并告知一句；细则见该仓库 CLAUDE.md 核心任务 0。

## AI 工作制度（2026-07-03 建立，正本在本 repo 的 .claude/rules/）

### 用户与沟通
- YANG，非工程师，中文使用者（回复用中文，简繁跟随用户）。少术语、先结论后细节，
  交付「能直接用」的成品；视觉产出优先用 Artifact 或部署成 Pages 页面。
- **提到任何地点都要附地图链接**（2026-07-16 用户明确要求）：回复里推荐/提及餐厅、
  景点、店铺等具体地点时，一律附 Google 地图链接（有 cid/place 链接最好，没有就用
  地址生成 `https://www.google.com/maps/search/?api=1&query=编码后的地址或店名`）；
  派 researcher 查地点类问题时，委派 prompt 里也要求它带回地图链接。
- **推荐地点一律要求 Google 评分 4.2 以上**（2026-07-16 用户明确要求）：找餐厅、景点、
  游乐场所等具体地点时，筛选门槛设为 Google Maps 评分 ≥4.2；派 researcher 查地点类
  问题时，委派 prompt 里要写明这条门槛，并让它带回每个候选的评分数字。

### 三条铁律（违反任一条就是做错了）
1. **指挥官不下场**：大量读取、扫目录、爬网页、批次改档、浏览器多步操作，一律派
   subagent，主对话只收结论。预期塞进主对话超过约 200 行就算「大量」。
2. **验证不自验**：档案改动 read-back 抽查；重要产出派 fresh-context 的 `verifier`
   agent 验收（定义在 `.claude/agents/verifier.md`）。
3. **失败两次就换路**：同一方法失败 2 次，禁止第 3 次原样重试——换工具、换写法、
   查文件、或升级模型。

### 路由表（遇到左边情况，先读右边档案再动手）
| 情况 | 读这个档 |
|---|---|
| 要派 subagent、选模型、任务较大需拆解 | `.claude/rules/dispatch.md` |
| 不确定该升级模型／算不算完成／该不该问用户 | `.claude/rules/judgment.md` |
| 派工时要写委派 prompt | `.claude/rules/templates.md`（填好的真实范例在 `examples.md`） |
| 要改现有项目（页面/xisui/trading） | `.claude/notes/` 对应结构笔记（锚点、改哪几处、坑） |
| 想修改制度档或本档 | `.claude/rules/maintenance.md` |
| 新 session 开始较大工作之前 | `.claude/rules/letter.md`（背景与注意事项） |
| 选浏览器／爬网工具拿不定主意 | `.claude/rules/diagnosis.md` 问题 #2 的路由表 |

### 制度档的同步与分支
- 本地与网页版共用这套制度，靠 git 同步：开工前 `git pull`，改完必推送。
- 制度档改动的推送方式跟随本 repo 分支策略（功能分支 + PR + squash merge）；
  本地 CLI 没有 PR 工具时可直接 commit 到 main，但要在回复里说明。
