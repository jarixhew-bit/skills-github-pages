# boss/ 老板专用 App 结构笔记（给 AI 改页面用）

读者：要修改这个只读 App 的模型。行号会漂移，**以函数名/id 锚点为准**。
背景规则：`skills/pwa-pages.md`（PWA 三件套 + SW 版本号）、`skills/bilingual-pages.md`、
CLAUDE.md 的双语与地图链接规则。

一句话：给老板看的只读 PWA——当日行程、未来行程（跳转本仓库的旅游手册）、账单 PDF、
酒茶虫草库存。老板什么都不能改。
URL: https://jarixhew-bit.github.io/skills-github-pages/boss/
配套：`boss/install.html`（给老板的安装说明）、`boss/manifest.webmanifest`、`boss/boss-sw.js`

## 数据在哪（关键：不在本仓库）
本仓库是**公开**的，账单是敏感内容，所以一个字节的数据都不住这里。
全部走 butler-bot（私有仓库）的 `POST /boss`：
- `data/boss-app/trips.json`、`data/boss-app/bills.json`、`data/boss-app/bills/<id>.pdf`
- 后端实现：`src/handlers/boss.js`（`bossHandle`）、`src/index.js` 的 `handleBoss`
- 测试：`tests/boss-http.test.mjs`

## ⚠️ 动它之前必须知道的安全不变量
**老板只能看不能改**，这条由三层保证，改任何一层前先想清楚：
1. 老板的钥匙是独立的 `BOSS_VIEW_TOKEN`（不是复用 `APP_SHARED_TOKEN`），
   它在整个 butler 范围内只能 `feed`/`bill`。
2. 服务端两道闸：`handleBoss` 判身份，`bossHandle` 的 `WRITE_ACTIONS` 再判一次。
   第二道是刻意的冗余——路由改坏了也拦得住，**不要以「重复」为由删掉它**。
3. 前端 viewer 身份下写操作控件**压根不进 DOM**（不是 CSS 隐藏）。
自检 `tools/check-boss.mjs` 守第 3 条，**并带 admin 对照组**——只断言「viewer 下为 0」
的话，整个管理功能坏掉也会显示通过。改自检时别把对照组删了。

## 结构地图（boss/index.html）
- 闸门（首次输入访问码）：`gateSubmit()` —— 调 `bossCall('feed')` 验证，
  **验证通过才 `saveToken`**，错的钥匙不许落地
- 接口封装：`bossCall(action, args)`
- 角色：`role = feed.role === 'admin' ? 'admin' : 'viewer'`（**服务端给的，不是前端算的**）
- 四个 tab 渲染：`renderToday()` / `renderTrips()` / `renderBills()` / `renderInventory()`
- 红点：`updateDots()` / `markSeen()` —— 比对 `feedData.updated.{trips,bills,inventory}`
  与 localStorage 的 seen 时间戳；进 tab 即清除；顺带 `navigator.setAppBadge?.()`
- 管理面板：`ensureAdminUI()` —— 只在 role==='admin' 时才 createElement 注入；
  静态 HTML 里 `#tab-admin` 永远是空容器
- 账单：`openBill()`（base64 → blob → iframe）、`openBillNewTab()`
  （**新分页按钮是必须的**：iOS Safari 的 iframe PDF 常只显示第一页）
- 离线：`init()` 先渲染 localStorage 缓存并 `markOffline(fetchedAt)`，联网成功再 `hideOffline()`

## 高频操作
1. **加行程**：admin 进 App 的管理面板贴 JSON；或直接改 butler 的
   `data/boss-app/trips.json`（字段见下）。用户是非工程师，**他讲中文你帮他填**，
   不要让他自己编 JSON。
2. **Trip 字段**：`{id, title:{zh,en}, start, end, location:{zh,en}, guideUrl, items:[
   {date, time, title:{zh,en}, note:{zh,en}, mapUrl}]}`。`guideUrl` 指向本仓库现有手册。
   按 CLAUDE.md 规则，行程条目**提到地点就要带 `mapUrl`**。
3. **Bill 字段**：`{id, title:{zh,en}, kind:"month"|"trip", period, tripId, filename,
   size, uploadedAt}`。上传上限 8MB。
4. **开通/收回老板权限**：只动 butler-bot 的 GitHub Secret `BOSS_VIEW_TOKEN`，
   再跑一次 `deploy.yml`。删掉 Secret 再跑 = 立刻收回。**不要在代码里做权限开关。**

## 已知坑 / 未做
- **通知只做了一半**：现在是「打开 App 才看到红点」。「不打开也会响」在 iPhone 上
  只有 Web Push 一条路（Worker 里手写 VAPID 签名 + aes128gcm 载荷加密），
  2026-08-27 交付时刻意没做，避免拖住主交付。要补的话当独立任务做。
- 库存字段来自 butler `inventoryHandle({action:"list"})` 的 `normalizeItem`：
  `{id,name,count,unit,location,note,added_at}`。`count` 是整数、`location` 是字符串。
- 库存服务挂掉时 `feed` 仍回 200 且 `inventory:null`，行程账单照常显示——
  这是刻意的，别改成「一处挂掉整个 App 白屏」。
