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

**排版别再借用牙医那张卡的类**（2026-09-02 用户实机看到字顶出框外）：`.dental-k`
是 `flex:none`（牙医左栏是「上次就诊」这种定长标签），拿去放
「9月10日 – 9月17日 · 回国祭拜母亲」这种长度收不了缩，在 360px 的手机上溢出 125px。
现在用自己的 `.leave-row/.leave-name/.leave-meta`，名字一行、日期与事由一行、允许换行。
守它的是 `check-boss.mjs` 场景二十六b——**量真实宽度**（scrollWidth/clientWidth ＋
getBoundingClientRect），不看文字内容，而且钉在 360px 窄屏跑：宽屏上看不出这个问题。

自检：butler `tests/staff-leave.test.mjs`（47 项）＋ `tests/company-expense-http.test.mjs`
【5】（HTTP 层的 person 取舍）＋ `tools/check-boss.mjs` 场景二十六（含「没人请假时
整段不出现」的对照组）＋ `tools/check-staff-page.mjs` 【26】/【26b】
（同事那边没有代录栏 **＋老板 App 那边必须有**的对照组——少了对照组的话，
代录整个坏掉也会显示通过，司机的假就再也录不进去）。

## 牙医：过期的预约不会自己变成就诊记录（2026-09-02）
**没有任何定时任务碰 `dental.json`**，看完诊不会自动更新——用户问过。
而**故意不做成自动的**：日历上排了不等于人真的去了，系统替他认定就诊记录就是在
编数据，医疗记录编错比放着不更新糟得多。

分工：
- 老板那边（`dentalCardHtml()`）：`nextVisit` 已经过去就**不当成「下次预约」**，
  改走「还没约／该约了」那条分支。原本只要有值就照印，于是看完诊的第二天起，
  卡上会一直挂着一个过去的日期当成下次预约。
- YANG 那边（`dentalDonePromptHtml()` / `adminDentalDone()`）：预约日子过了就问
  一句「那次去了吗？」，按一下把它记成上次就诊并清掉下次预约。判断留给人，
  动手的部分省掉。

自检：场景二十七 ＋ 两个对照组。第二个对照组（**预约还没到时不许问「去了吗」**）
不能省：少了它，把提示改成永远显示也会全绿，而那会让 YANG 在预约当天之前
就把它记成已就诊——凭空造一条没发生过的医疗记录。

## 「一键分享去 WhatsApp」（2026-09-03 加）
起因：**老板到现在都还没打开过 App**。他不开，行程就等于没送到。所以先给 YANG
一条「排好了直接发给他」的路——WhatsApp 是他们本来就在用的东西。

按钮在三个地方（`shareDayBtnHtml()`）：今天／明天那两条标题栏、行程分页里**每一天**
的小标题。第三处不是多余的：他常常是排好未来某一天才想发，只给「今天」等于没做。
餐厅那一屏另有单店和整区两颗（`shareRestaurant()` / `shareRestRegion()`）。

**分享只给 YANG**（2026-09-03 用户：「老板不必有分享」）：全部走 `canShare()`
（`role === 'admin'`），老板那边一颗都不进 DOM。**地图链接不在此列**——同一次交代
「地图链接可以有」，老板那边照旧要有，自检里两边各有一条钉着（老板端「每一家都有
能点的地图链接」＋「整页一颗分享按钮都没有」）。
删过头是有前科的（2026-08-28 推送提示从 admin 身上删过头，连他自己都开不了通知），
所以场景二十九c 是必须的对照组：**YANG 那边分享照旧能用**——少了它，把分享整个
删光也会全绿。

四条不许改回去的规矩：
- **先给人看一眼再发**：弹窗里是一个**可以改**的文本框（`#share-text`），不是点了
  就跳出去。发出去收不回来。而且送出去的必须是**文本框当下的内容**——他常常要补
  一句「司机 8 点在楼下等」，改完却发出旧文字的话，这功能就是在骗人。
- **纯文字，不发链接卡片**：老板不用装任何东西、不用登录就看得懂。地图/手册网址
  **原样写在文字里**（不缩短、不包装成「🗺 地图」），WhatsApp 自己会变成能点的链接
  ——这是 CLAUDE.md「提到地点就附地图链接」在分享文字里的落地，自检专门有一条
  「不是『🗺 地图』这种点不了的字」。
- **航班判定只有一处**：`flightTimeParts()` 是屏幕和分享文字共用的核心（原本只有
  `flightTimePartHtml`，2026-09-03 把判定抽出来）。各写一套的话，迟早出现「App 上写
  预计晚 22 分、发给老板的文字说准点」，而这种矛盾没人会去核对。自检里那两条
  （屏幕上有 → 文字里也要有）是成对的，别拆。
- **语言跟当前界面走**：WhatsApp 里没有 CSS 切语言这回事，只能挑一种发出去，所以
  分享文字一律用 `pick()`/`pickObj()`，不是 `bl()`。

`wa.me/?text=` 不带号码 = 由 WhatsApp 自己弹联系人让他选发给谁（老板、司机、群都行）。
自检：场景二十八（含「点了才会去 WhatsApp」「发的是改过之后的内容」）＋二十八b
对照组（**那一天什么都没排时也得是句人话**——少了它，文字生成器整个回空字符串也会全绿）。

## 「收藏餐厅」分页（2026-09-03 加）
YANG 平时用 Telegram 往 butler 的 `data/restaurants.json` 记，老板 App 直接把**同一份**
端出来（`feed.restaurants`），底部导航第 5 个入口。**刻意不另存一份到 `boss-app/` 下**：
两份清单必然分叉。

- 后端：`src/handlers/boss.js` 的 `doFeed` 读 `data/restaurants.json`，经
  `restaurantsForBoss()`（正本在 `src/handlers/restaurant.js`）转形状。地图链接怎么来
  （备注里贴过的优先，没有才用店名+地区拼一条）**只能有一处说了算**，所以那三个
  helper 放在 restaurant.js 里由 boss.js import，不许在 boss.js 另写一份——否则老板看到
  的链接会跟 Telegram 回的不一样。
- 备注里那条长网址会被摘出来当 `mapUrl`，正文里不再重复印。
- 读挂了给空数组，不拖垮 feed（跟库存/请假同一条规矩）。
- 红点用 `updated.restaurants`＝**老板看得到的那些**里最新的 `added_at`；被丢掉的
  记录（比如没名字）不许点亮红点，否则他点进来发现什么都没变。
- **一个写入口都没有开**：要加店回 Telegram 说一句。老板只读这条地基不为一份餐厅
  清单破例，自检里有「这一屏没有任何写入控件／输入框」。

**加／删在管理页**（2026-09-03 用户问「餐厅要在 app 里自己加能吗」）：`#admin-rest-section`
一个表单（店名必填／地区／类别／备注）＋ 现有清单每条一个 🗑。两个动作都在 butler 的
`ADMIN_ACTIONS` 里，**老板那把钥匙打过来是 403**，三层只读一层都没松。
只做加和删——改一条＝删了重加，Telegram 那边本来就有 `restaurant_edit`。
查重跟 Telegram 同一条规矩（`matchKey`：同名同地区算同一家，空格大小写全角都不计较），
所以不会「bot 说重复了、App 却又加进去一条」。存和拉最新分成**两段 try**、确认消息在
`refreshFeed()` 重建之后**重新写一次**——跟行程表单同两个坑。

自检：butler `tests/boss-restaurants.test.mjs`（39 项，含「备注没链接就自动拼一条」
「viewer 增删都 403 且文件没动」「同名不同地区是两家店」「按 id 删不会删错同名那家」
的对照组）＋ `tools/check-boss.mjs` 场景二十九（含窄屏溢出测量、**底部导航多一个按钮
之后 360px 仍塞得下**）＋二十九b 空态对照组＋**场景三十**（管理页那半的对照组——
少了它，增删整个坏掉也会一路绿灯，因为「viewer 下数量为 0」还有「功能坏了」这个解释；
里面那条「confirm 按取消就不发请求」同理，不然确认框形同虚设也会全绿）。

## 空态不该是空的：今天没安排就补一条最近的账单（2026-09-05）
「今天」是老板的默认首屏。今天没安排时他原本看到的只有一句「今天没有安排的行程」
——全 App 最没用的一屏，偏偏是第一眼。现在底下补一条最近的账单（`latestBillCardHtml()`），
**一点就直接打开那份 PDF**（不是跳到账单分页再让他点一次）：他打开这个 App 十次有
八次是为了那个数字。

两条对照组守着「别变成噪音」：今天**有**安排时不出现、一份账单都没有时整段不出现。

⚠️ 它用 `.tbill-*` 一套**自己的类名**（只跟 `.bill-*` 共用样式）。一开始图省事直接
复用 `.bill-row`，结果同一个页面上出现两个 `.bill-row`（一个在账单分页、一个在今天
那屏），自检里 `page.click('.bill-row')` 点到了隐藏的那一个，当场超时崩掉。
**同一个类名在两个分页里各有一份，迟早咬人。**

## 提醒支持「每月」；自检超时不再打断整份（2026-09-05）
- **每月重复**（`advanceMonth()`，butler `src/cron/reminders.js`）：保留「几号」。
  1月31日 → 2月28日（当月最后一天），**不是**滚到 3月3日；而且靠 `anchorDay` 记住
  本来是几号，2 月之后回到 3月31日，不会从此变成每月 28 号。滚过头的话「每月 31 号」
  会一年比一年往后漂，最后跟他心里那个日子对不上。
  已经建好一条每月 1 号的提醒（butler `data/reminders.json` 的 `billmonthly`）：
  提醒 YANG 导出上个月账单发给老板。要改要删都在老板 App 管理页那一块。
- **`check-boss.mjs` 的 `until` 超时不再 throw**，改成记一条红继续跑。
  原本一超时整份自检当场中断，后面几十条断言根本没跑到——平常还好，**回退验证时
  是致命的**：看到的是一行崩溃信息而不是「哪几条会红」，等于假红验证白做。
  2026-09-03、09-04 各踩过一次，两次都是在出事的那个 `until` 上单独打补丁，
  这次改在源头。

## 账单那一行直接显示金额（2026-09-05）
在这之前，老板的账单列表只有期间和档名，**一个数字都没有**——而他打开这一屏想知道的
八成就是那个数字，却得点进去等 PDF 画出来自己找。

现在每一行印「花了多少 · 几笔」，账户名摆出来（`billAmountHtml()` / `billSubHtml()`）。
数字由记账 App 算好跟着 `billUpload` 送上来（`buildStatementPDF()` 回传的 `summary`），
存进 `bills.json` 的 `summary` 字段。butler 那边 `cleanBillSummary()` 当外部输入洗一遍。

四条不许改回去的：
- **币别必须跟金额一起**（Boss 是 USD、Yang 是 HKD）。缺一不可，半吊子的整个丢掉
  ——光一个数字会让老板照着错的币别下判断。
- **不给合计**（2026-09-05 用户拍板）。同一个月常有好几份不同账户的账单，
  币别还不一样，加起来是错的；而**一个看起来完整、其实不完整的数字比没有更糟**。
  也别只显示「主要那条」——藏掉其余的，他会以为那就是全部。
- **没有 summary 的老账单什么都不印**，绝不能退成「0.00」——那是在告诉老板那个月
  一分钱没花。这条是场景三十五的 ★★ 断言。
- **0 是合法金额**（真的一分没花），不能被当成「没有」。

自检：butler `tests/boss-bill-summary.test.mjs`（17 项，洗数据那一层）＋
`check-boss.mjs` 场景三十五（三份不同账户各显示各的、老账单不印数字、360px 不溢出）＋
`check-expense-company.mjs`【27g】（**送出去的金额是期间内的真实总额**——前后各埋一笔
不该算的，收入也不算进「花了多少」）。
回退验证：把老账单退成印 0.00（第一次退法让渲染直接抛错，测到的是「崩了」不是
「显示 0.00」，**不算数**，换了个不崩的退法重来）＋ 把总额算成全部交易，各拿到 1 条
干净的红。

## 交接改成「一条链接」（2026-09-04）
老板到 2026-09-04 还是没打开过。用户的决定：**下个月发账单时直接发链接和访问码，
不再要求他装**（「install 可能对他来说太麻烦了」）。

光发「链接＋访问码」不够稳，所以把码做进链接：`boss/#k=<访问码>`。
理由是 iOS 的行为——**不装到主屏的话，Safari 放着一星期不用会清掉 localStorage**，
存下来的访问码会掉，他下次点开又要重输、又要回去翻那条消息。码在链接里的话，
他每次点同一条消息进来都直接是登入状态。

三条不许改回去的（`readCodeFromHash()` / `init()` 开头那段）：
- **验证通过才落地**：跟手输那条路同一条规矩。错的码存进他那台机器的话，他以后
  每次打开都拿着一把错钥匙失败，而且不知道为什么。
- **进去之后把码从网址栏抹掉**（`history.replaceState`）：不让它一直挂着被截图、
  被转发、被浏览器历史记着。localStorage 里已经有了，不影响下次打开。
- **链接里的码优先于已存的**：轮换访问码之后发新链接，点一下就换成新的。

管理页那一块改成「发给老板的链接」，四颗复制：整条消息（可直接贴 WhatsApp）／
**「账单来了」的消息**／只链接／只访问码。**并且写明「不装到主屏就收不到通知」**
——不写的话他会以为发了链接就万事大吉，而行程改了、新账单来了都不会提醒老板。
`install.html` 保留（老链接还在用，他哪天想装还找得到）。

**链接可以指定落地分页**：`#k=xxx&t=bills`（`readTabFromHash()`，只认
today/trips/bills/inventory/restaurants，看不懂的一律忽略）。发「账单好了」那条消息
却让他落在「今天」那一屏、当天又没安排的话，他第一眼看到的是「今天没有安排的
行程」——一个从没打开过的人很可能就此关掉。`t=admin` 进不了管理页（他不是管理员），
自检里有一条 ★★ 钉着。

**「没装到主屏」从 2026-09-04 起不再报红**：方针改了之后它是**预期中的正常状态**。
原本那条红字会天天亮着把正常说成故障——红灯天天亮的话，以后真出事也没人会看。
现在只剩一句陈述「这样也能看，只是收不到通知」；装好了的话连那句都不出现。
自检场景二十五那两条断言跟着改了（**别再改回去要求 `.err`**）。

自检：场景三十三（免输入进场、码存下来、网址栏抹干净、身份仍是 viewer）／
三十三b（**错的码不许落地**，并说清楚是链接的问题不是他打错）／三十三c（管理页那条
链接真的带得上码、三颗复制键都在、「收不到通知」那句话在）。
回退验证：先落地再验证 ＋ 不抹网址，2 条干净的红。

## 「用讲的」：一段话变成行程条目（2026-09-04 加）
用户：「这些输入行程的有没有办法更加简化一点？」——填一条要碰时间／做什么／展开
「更多」填日期／填地点，一天五个点就是五轮。现在行程管理最上面多一个输入框：
把整天用中文写一段，AI 拆成条目**直接填进表单**（`adminSayParse()`，服务端
`itineraryParse` → `parseItineraryText()`）。

分工跟机票识别那条路**一模一样，原因也一样**：
- **AI 只负责把他自己写的话拆开，不负责补他没写的东西。**「早上」不许变成 08:00、
  没说哪天就 date 留空。提示词里写死了，服务端 `cleanItineraryItem()` 再洗一遍
  （日期不是 `YYYY-MM-DD`、时间不是 `HH:MM` 的一律当没填，没标题的整条丢掉）。
- **航班时刻交给真接口**：AI 只认航班号，填进去之后走既有的 `adminFlightLookup`。
- **只填进表单，不落盘**：他看过一眼按「保存全部行程」才算数。这条有 ★★ 断言守着。
- 地点 → `sayPlaceToMapUrl()` 拼 Google 地图搜索链接（仓库硬规矩：提到地点就要能点）。

落在哪一趟：**正在展开某一趟就加进那一趟**（多半在补当天的安排），没展开才新建一趟；
这条规则写在状态栏里告诉他，不让他猜。

自检：butler `tests/boss-itinerary-parse.test.mjs`（22 项，全在洗数据那一层——
「认得准不准」是 AI 的事测不了，「AI 乱给的进不进得来」才是我们能守的）＋
`check-boss.mjs` 场景三十二（含★★没有偷偷落盘、地点变成地图链接、带航班号的去查真接口）
＋三十二b（老板那边连输入框都没有）。回退验证：偷偷落盘 ＋ 地点不给地图，3 条干净的红。

## 「备忘 / 提醒」（2026-09-03 加）
用户要的是**两边都要**：每条自己选「只有我看」还是「老板也看得到」，到点提醒也自己
选推给谁（我的 Telegram／老板手机／两边）。

**跟 Telegram 那套提醒共用同一份 `data/reminders.json`**——「备忘」不过是「还没定
时间的提醒」，分两份档案的话 YANG 得自己记住哪条记在哪边，迟早两份都不准
（跟餐厅清单不另存一份是同一条道理）。往上加了两个**可选**字段，旧的三十几条
一个字都不用改：`audience`（默认 `me`）、`notify:{telegram,boss}`（默认只推 Telegram）。

⚠️ **默认值这一边不许改**：认错了顶多是「老板少看到一条」，反过来会把 YANG 的私事
（「打电话」「买生日礼物」）直接推到老板手机上。前端和服务端**各筛一次**，
`memoCardHtml()` 那层是刻意的冗余——万一以后有人把 `memosForBoss` 改坏，
漏出去的是私事，而这种错没人会发现。

其他几条不许改回去的：
- **没填时间＝纯备忘**：cron 明确跳过没有 `datetime` 的记录。少了那一行，所有备忘会在
  下一次 cron 全部当成过期、一口气推出去。前端也把「推给谁／重复」灰掉——能按会
  让人以为它会响。
- **老板那边一个写入接口都没多开**：`memoSave/memoDelete/memoDone` 全在
  `ADMIN_ACTIONS` 里，连「勾掉」都不行。
- **备忘卡自己一个 `.memo-card` 类**，别借用 `.dental-card`：那个类被自检拿来数
  「牙医卡有几张」，借用会让那条断言看见两张、当场红。
- 推给谁有**三条独立的路**（2026-09-03 用户追问「如果推去我的 app 行吗」——行，
  他自己那台早就在推送名单里）：`notify.telegram`（Telegram）、`notify.me`
  （`pushToOwnerDevices()`，推 YANG 自己那几台）、`notify.boss`（`pushToBossDevices()`，
  只推老板那几台）。三个各自独立，他要几条响就勾几条。
  两个函数都靠 `s.who !== / === BOSS_REPORTER` 分边——**不是**比对 YANG 的名字：
  订阅名单里只可能有这两种人（同事打 /boss 会 403），而名字改过的话，
  「等于某个名字」会静静地推给零台设备。**推错边＝把私事送到老板手机上**，
  自检里那条「只推我手机的那条没推给老板」就是守它的。
  `BOSS_REPORTER` 是导出常量，`index.js` 判身份时用的是同一个——各写一份字面量的话，
  哪天改了称呼，「推给老板」会静静地推给零台设备。

自检：butler `tests/memo.test.mjs`（42 项，含「旧记录默认私人」「纯备忘永远不会响」
「推给谁照开关走」「reminderList 不因为 null datetime 崩掉」）＋ `check-boss.mjs`
场景三十一（老板端＋窄屏溢出）／三十一b（**服务端漏筛时前端也要挡**）／三十一c
（管理页写改勾删）。回退验证：拿掉前端那层筛选 ＋ 把预设改成「老板也看得到」，
拿到 4 条干净的红。

## 管理页那行版本号必须跟 SW 对齐（2026-09-03）
右上角 `#adminVer` 那行小字存在的唯一意义是「一眼看出他手上是哪一版」。
2026-09-03 发现它停在 v41、SW 已经 v46——落后五版。**会说谎的版本号比没有更糟**：
排查「你改了怎么还是老样子」时，人会照着它下判断。
现在 `check-boss-sw.mjs`【10】钉死 `#adminVer` 的文字 === `boss-sw.js` 的 `CACHE`，
升版时两处一起改，漏一处 CI 就红。

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

## 自检拆成前半／后半两个档并行跑（2026-09-05）
一份 566 项的浏览器自检串起来跑三分半，是 `check-all` 最慢的那一关。现在拆成：
- `tools/lib/boss-check-kit.mjs` —— 共用的打桩接口、假数据、计分（`ok`/`fails`）、
  `until`、`finish(label)`。两份都 import 它。
- `tools/check-boss.mjs` —— **前半**，场景一~十八（权限、红点、分页、账单预览、库存、
  行程表单、航班、牙医），269 项。
- `tools/check-boss-2.mjs` —— **后半**，场景十九~三十六（交接红点重置、机票识别、排序、
  已读、推送、请假、备忘、餐厅、分享、链接带访问码、账单金额），297 项。

⚠️ **拆的是场景，不是断言：269 + 297 必须还是 566。** 少一项就是漏了一条，
而漏掉的那条正好可能是守着「老板只能看」的那一条——那种漏法自检还是全绿。
改动之后要对总数，别只看两边各自「全绿」。

同事版的「拆两半」是假的（同一份档跑两遍，脚本根本不认 `PART`），**别照抄**。
接线三处：`tools/check-all.py`（boss-1 / boss-2）、`tools/ci-decide.py`（"boss" 的
路径 glob 要含 `tools/check-boss-2.mjs` 与 `tools/lib/**`，否则改了 kit 不会触发这关）、
`.github/workflows/checks.yml` 的 `boss` job（matrix，两个不同的 script）。
