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
1. **加行程**：admin 进 App 的管理面板，那里是**真表单**（行程/条目增删改、日期用
   日历选、手册下拉选、地点填名字自动生成地图链接）。相关函数：`renderAdmin()`、
   `adminTripsSectionHtml()`、`adminSaveTripsForm()`、`adminValidateTripsDraft()`。
   表单下面保留一个默认折叠的「高级：直接编辑 JSON」——一次填一整趟行程时，
   用户讲中文、AI 批量塞进去仍然更快，但那是**多一条路，不是唯一的路**
   （2026-08-27 用户明确反对「每次要回对话找 AI 填」，别再把 JSON 当主入口）。
   也可以直接改 butler 的 `data/boss-app/trips.json`。
2. **Trip 字段**：`{id, title:{zh,en}, start, end, location:{zh,en}, guideUrl, items:[
   {date, time, title:{zh,en}, note:{zh,en}, mapUrl}]}`。`guideUrl` 指向本仓库现有手册。
   按 CLAUDE.md 规则，行程条目**提到地点就要带 `mapUrl`**。
3. **Bill 字段**：`{id, title:{zh,en}, kind:"month"|"trip", period, tripId, filename,
   size, uploadedAt, readAt}`。**上传上限 20MB**（2026-08-30 从 8MB 提上来）。
   这个数字写在**三处**，改一处就要改三处：butler `MAX_BILL_MB`（正本）、
   `expense-tracker.html` 的 `BOSS_BILL_MAX_MB`、`boss/index.html` 的同名常量。
   为什么是 20 不是更大：一次上传路上同一串 base64 同时存在好几份（请求体原文、
   解析出来的对象、再发给 GitHub 的那份），Worker 只有 128MB 内存，20MB ≈ 80MB 峰值。
   还要往上加**先跑 butler 的 workflow「Boss App 账单上限体检」**（真传真读真删），
   拿结果说话，别只改数字。
4. **开通/收回老板权限**：只动 butler-bot 的 GitHub Secret `BOSS_VIEW_TOKEN`，
   再跑一次 `deploy.yml`。删掉 Secret 再跑 = 立刻收回。**不要在代码里做权限开关。**

## 跟记账 app 的连接（2026-08-27 加）
账单 PDF **本来就是 `expense-tracker.html` 自己生成的**（`buildStatementPDF()`），
所以上传口开在那里，不在这个 App：导出账户明细旁的「📤 发给老板」
（`sendStatementToBoss()`）直接 POST `billUpload`，用的是记账 app 已存的
`expenseTracker_companyToken`（YANG 的 admin 钥匙），零额外设置。
记账 app 设置页另有「🧳 行程管理」入口链到 `boss/?admin=1`。
两条硬规则：
- **不点就不发**：导出常是自己看的草稿，绝不能自动推给老板（`check-expense-company.mjs`
  有断言守着）。
- **同事版不给这两个入口**：`staff/index.html` 由 `build-staff-page.py` 生成，里面会
  残留函数体（死代码、无按钮），但同事钥匙打 `/boss` 会被服务端 403（`src/index.js:363`），
  构不成越权。改完 `expense-tracker.html` **必须重跑 `build-staff-page.py`**，
  否则 `check-generated` 会红。

## 「老板看了没」（2026-08-30 加）
管理页每份账单下面一行「老板已看 · 8月30日 14:20」／「老板还没看」，YANG 照这个
决定哪几份可以删。

标记怎么来的：**后端在老板打开账单那一刻写的**，不是老板 App 上报的。
`doBill()` 成功读出 PDF 后往 `bills.json` 那条记录写 `readAt`。这样做的理由和
四条不许改回去的规矩：
- **不新开写入接口**：老板只读是这个 App 的地基（三层拦）。走 `doBill` 的副作用，
  viewer 依旧不能主动写任何东西。
- **只记 viewer**：YANG 自己在管理页预览不算「老板看过」，否则他一验货就变已看。
- **只记第一次**：已经有 `readAt` 就不写——不然老板每翻一次账单就多一个 commit，
  第一次看的时间也会被覆盖掉。
- **不动 `updatedAt`**：那是老板 App 算红点用的，一动老板刚看完的账单又变未读。
- 整段包 `try`：记不上最多是管理页少一行字，绝不能害老板打不开账单。

老板那边**不用更新 App**（后端行为），只有 YANG 的管理页要 ≥v37 才看得到这行字。
自检：`tools/check-boss.mjs` 场景二十二（含「老板那边不出现这行字」的对照组）、
butler-bot `tests/boss-bill-read.test.mjs`（18 项）。

## 「发一条到老板手机」（2026-08-30 加）
管理页通知那一块，除了「开启／关闭」和「试一下本机通知」，还有第三颗
「发一条到老板手机」——打 admin-only 的 `pushTest`，往**所有**已登记设备各发一条，
把每台的 HTTP 状态码原样列出来（`adminTestRemotePush()` / `pushHostLabel()`）。

为什么要有它：YANG 手上**没有 iPhone**，老板那台机器到底收不收得到，除了真发一条
看苹果服务器怎么回，没有别的办法。三颗按钮分工别搞混：
- 开启／关闭 → 这台设备自己的订阅
- 试一下本机通知 → 「这台手机肯不肯**显示**通知」（绕开推送服务）
- 发一条到老板手机 → 「消息**送不送得到**」（201 = 推送服务收下了）

后端只回 endpoint 的**主机名**（完整 endpoint 算设备凭据），所以前端只能靠主机名认
平台：`apple.com`→iPhone/iPad、`googleapis.com`→安卓/Chrome。
自检：`tools/check-boss.mjs` 场景二十三（含「老板那边没有这颗按钮」的对照组）。

## 老板那边的通知入口有两个（2026-08-30 加）
1. 顶上那条横幅（`pushBar`）——带 ×，按了**永久**不再出现（`PUSH_BAR_DISMISS_KEY`）。
2. 「今天」分页最底下常驻一行（`viewerPushFooterHtml()` / `refreshViewerPushFooter()`）
   ——不催、不带 ×、admin 看不到。

第 2 个是必须的，别以为重复了就删：横幅按过 × 之后会永久消失，订阅成功之后也不再挂，
只有一个入口的话老板就**再也开不了／关不了通知**——2026-08-29 admin 那次踩的正是
这个坑（订阅被 FCM 判 410 失效，手上没有任何入口能重开）。
自检：`tools/check-boss.mjs` 场景二十四（按 × 之后底下那行必须还在）＋ admin 对照组。

## 「老板到底装上了没有」（2026-08-30 加）
管理页顶上一块「📱 老板那边」，三种状态：
- 还没打开过 → 链接根本没被点
- **打开了但还在浏览器里** → 点了链接没装到主屏，**通知一定收不到**，这一种带红字警告
- 已装到主屏 → 装好了

数据怎么来：老板每次拉 feed 时服务端落一笔（butler `data/boss-app/seen.json`，
`recordSeen()`）。前端在 feed 参数里带 `standalone: isStandalonePwa()`，这就是
「装到主屏了没有」。四条不许改回去的规矩，跟账单 `readAt` 同一套：
- **不新开写入接口**（走 feed 的副作用，viewer 依旧不能主动写）
- **只记 viewer**（YANG 开管理页不算）
- **节流 6 小时**，但 `standalone` 一变就立刻记（那正是要等的信号）
- **「没来过」是 `standalone: null`，不是 `false`**——跟「来了没装」不是一回事
自检：`tools/check-boss.mjs` 场景二十五（含 viewer 对照组）、butler `tests/boss-seen.test.mjs`（21 项）。

## 「今天谁请假」（2026-09-02 加）
老板 App「今天」那一屏，今天的行程底下多一张卡（`leaveTodayCardHtml()`）。
两段：**今天**谁没来，＋**接下来**两周谁要请假（`feed.leaveToday` / `leaveUpcoming`）。
**两段都空就整段不出现**——老板天天开这一屏，挂一句「没有人请假」是噪音。

「接下来」那一段是 2026-09-02 用户当场逮到的缺口：他 9/10 起回国一星期、假条早就
录好了，老板 App 上却什么都看不到，因为卡片只报今天。**老板要的是提前知道好安排
事情**，当天早上才告诉他已经晚了。窗口 14 天，两端都有断言守着——不设窗口的话
一年后的假会天天挂在他那一屏。今天已经在请的不重复算进「接下来」。

数据从哪来（这一块的设计重点全在这里）：
- **同事自己登记**：同事版报账页底部导航多一个「🏖 请假」。靠人代录的名单必然过期，
  老板看到「今天没人请假」而实际有人没来，比这一栏根本不存在更糟。
- **司机这类人由 YANG 代录**：他们不用同事版页面、也不在名册里，所以主记账 App
  设置页「员工 → 请假登记」那一栏名字是**自由文本**，不限名册。
- 老板那边**一个写入接口都没有多开**：feed 里多一个 `leaveToday` 字段而已，
  三层只读不变（跟账单 `readAt`、`seen.json` 同一条规矩）。

后端：butler `src/handlers/staff_leave.js` + `data/staff-leave.json`
（`{leaves:[{id,person,start,end,reason,createdBy,createdAt}]}`，start/end 含头含尾），
挂在 `/company-expense` 上（`leaveList` / `leaveAdd` / `leaveDelete`），认证沿用报账那一套。
**person 由钥匙决定**：staff 一律用钥匙推出来的名字，请求里写谁都不算数；owner 才读
请求里的名字。前端同一段代码两边共用，差别只有「是谁请假」那个输入框——
**scope==='owner' 时才画进 DOM**，同事那边压根没有它。

弹窗（`#modal-leave`）刻意放在 `<!-- PDF REPORT (hidden) -->` **之后**：
ACCOUNT SWITCHER～PDF REPORT 那一整段生成同事版时会被切掉，而这个弹窗两边都要有。

自检：butler `tests/staff-leave.test.mjs`（40 项）＋ `tests/company-expense-http.test.mjs`
【5】（HTTP 层的 person 取舍）＋ `tools/check-boss.mjs` 场景二十六（含「没人请假时
整段不出现」的对照组）＋ `tools/check-staff-page.mjs` 【26】/【26b】
（同事那边没有代录栏 **＋老板 App 那边必须有**的对照组——少了对照组的话，
代录整个坏掉也会显示通过，司机的假就再也录不进去）。

## 已知坑 / 未做
- **推送已经做完了**（butler `src/push.js`：手写 VAPID 签名 + aes128gcm 载荷加密），
  行程更新和新账单会推。**但 iPhone 上从没在真机验过**（2026-08-30 确认：安卓已验，
  YANG 没有 iPhone）。服务端那边对苹果的要求都对得上（aud 取 endpoint 的 origin、
  exp 12 小时 < 24 小时上限、sub 是 mailto、带 TTL 头）；前端 `togglePush()` 里
  `Notification.requestPermission()` 是点击后的**第一个 await**，用户手势没丢——
  这两处是 iOS 上最常翻车的地方，已经排除。剩下的只能等老板真的开一次通知，
  再用「发一条到老板手机」看状态码。
- 库存字段来自 butler `inventoryHandle({action:"list"})` 的 `normalizeItem`：
  `{id,name,count,unit,location,note,added_at}`。`count` 是整数、`location` 是字符串。
- 库存服务挂掉时 `feed` 仍回 200 且 `inventory:null`，行程账单照常显示——
  这是刻意的，别改成「一处挂掉整个 App 白屏」。
- **保存行程时「存」和「拉最新」必须分成两段 try**（`adminSaveTripsForm()`）：
  合在一起的话，存成功但刷新时断网会被 catch 成「保存失败」，用户以为没存上会再存
  一次。谎报失败比不报还糟。另外 `refreshFeed()` 会整块重建 `#tab-admin`，
  确认消息必须在重建**之后**重新写一次，否则用户点完保存看不到任何反馈。
  （两条都是 2026-08-27 自检查出来的真缺陷，别在重构时改回去。）
