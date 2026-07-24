# expense-tracker.html 结构笔记（给 AI 改页面用）

读者：要修改这个记账 PWA 的模型。行号会漂移，**以函数名/id/class 锚点为准**。
背景规则：`skills/pwa-pages.md`（PWA 三件套 + SW 版本号规则）、CLAUDE.md 记帐相关规则、
`skills/numbers-and-money.md`（涉及金额改动务必抽验）。

一句话：多账户记账本，PWA（可安装到手机主屏），本地优先存储 + 可选 Google 登录后
Firebase 云同步，含收据扫描 OCR 自动填单。单用户/家庭用，非工程师使用者。
URL: https://jarixhew-bit.github.io/skills-github-pages/expense-tracker.html
配套文件：`expense-tracker-sw.js`（Service Worker）、`expense-tracker.webmanifest`
（PWA manifest）、`expense-tracker-icon.svg`、`expense-tracker-opencv.js`（同源
vendored 的 OpenCV.js 引擎，10MB，见下方"已知坑"，改动前先读那条）。

## 结构地图（expense-tracker.html，3241 行）
- Firebase SDK 引入(:15-17，CDN script) → `<body>`(:342起)
- HEADER(:343) → 四个 TAB 内容区：OVERVIEW(:359)、TRANSACTIONS(:381)、
  ANALYTICS(:396)、SETTINGS(:429)
- FAB 加账按钮(:465) → BOTTOM NAV(:468)
- 各 modal：ADD TRANSACTION(:484)、SCAN WORKFLOW 扫描收据全屏流程(:546)、
  ATTACHMENT VIEWER(:556)、ACCOUNT SWITCHER(:563)、ADD ACCOUNT(:574)、
  ADD CATEGORY(:612)、ADD RECURRING 月固定开销(:642)、PDF REPORT 隐藏模板(:674)
- `<script>`(:680起)：Firebase 初始化(:682-691)、云同步函数(:695-829)、
  `DEFAULT_DATA`默认数据(:1065-1095)、`loadData/saveData`(:1124-1136)、
  各 render 函数(渲染四个 tab)、交易增删改(:1526-1707)、账户/分类管理
  (:1707-1830区间)、OCR 扫描流程(:2549起到文件末尾3215)。

## 高频操作
1. **加一个默认消费分类**：编辑 `DEFAULT_DATA.categories` 数组（:1071-1092），
   加一条 `{id:'cat_xxx', name:'中文名', icon:'emoji', type:'expense'或'income',
   color:'#hex'}`。`migrateCategories()`(:1119)会在每次`loadData()`时把
   `DEFAULT_DATA`里新增的分类自动补进已有用户的本地数据，**不需要额外写迁移代码**。
   若想让「智能识别分类」（`autoDetectCat()`, :1596）认得这个新分类，还要去
   `KEYWORD_MAP`数组（起于:865）加一条 `{catId:'cat_xxx', kw:[中英文关键词...]}`。
   （用户自己在 App 内新增的自定义分类走 Settings 里的「+新增类别」modal，
   直接写入 `data.categories`，不影响 DEFAULT_DATA。）
2. **改云同步逻辑**：Firebase 配置在:682-689（含明文 apiKey，这是 Firebase 客户端
   key，非机密，可公开）。核心函数：`signInWithGoogle()`(:695)、`signOutUser()`
   (:705)、`saveToCloud()`(:711，写入 Firestore `users/{uid}`文档，字段
   `payload`=整份`data`的JSON字符串)、`syncFromCloud(force)`(:727)、冲突处理
   `showSyncConflict()`(:773)。所有本地写入都过`saveData()`(:1133)，它会在
   `currentUser`存在时自动调`saveToCloud()`，否则标记`setPendingSync(true)`
   等下次登录再同步——改同步策略要注意别绕过这条路径。
3. **瑞尔(KHR)输入换算**（2026-07-16 新增）：ADD TRANSACTION modal 金额框旁的
   `#tx-riel-toggle`按钮，开启后`saveTx()`(:1703起)按固定`RIEL_RATE`常量
   （:1165，值4000）把输入数字换算成账户货币金额，原始瑞尔数额附进描述文字里
   （不新增tx字段，走description，改动面小）。`state.rielMode`控制开关，
   `showAddTx()`/`editTx()`都会重置为false。汇率固定写死在常量里，不是实时汇率。
4. **改收据 OCR/扫描流程**：入口`openScanWorkflow()`(:2582)，用 OpenCV.js（懒加载，
   `loadOpenCV()`:2549）做边角检测与透视变换，`Tesseract.js`（懒加载CDN，
   `loadTesseractJS()`:3112）做本地 OCR 识别金额/日期。OCR 全程在浏览器端跑，
   不上传收据到任何服务器（隐私要求，见 `skills/pwa-pages.md` 本专案实例）。
   识别结果只是「预填」，不阻塞保存、不覆盖用户已输入内容（:3093 注释已注明）。

## 牵一发动全身
- `data` 全局对象（结构见`DEFAULT_DATA`:1065）是唯一数据源，`accounts`/
  `categories`/`transactions`/`recurring` 四个数组被几乎所有 render 函数读取；
  改数据结构（加字段/改字段名）要全文搜索该字段名，涉及面广。
- `saveData()`(:1133) 是所有写入的必经路径（本地存 + 触发云同步），新增任何
  改数据的功能都要调它，不要自己单独调 `localStorage.setItem`。
- `CUR_SYMBOLS`(:1139) 货币符号表，加新币种在这里加一条，`fmt()`/`fmtThousands()`
  等格式化函数都依赖它。
- localStorage key 固定为 `expenseTracker_v2`（:1126/:1134），改key名等于让所有
  现有用户数据"消失"（实际还在但读不到），非必要不要动。

## 双语机制
无。纯中文界面（简体），无 cn/en 切换、无 siteLangUser。这是本专案唯一的记账工具，
非双语页面规则的适用范围。

## PWA 关键点
- Service Worker：`expense-tracker-sw.js`。缓存版本号变量 `CACHE`
  （expense-tracker-sw.js:1，当前值 `'expense-tracker-v8'`）。
- **本页缓存策略是 network-first for HTML**（expense-tracker-sw.js:22-27）：
  `document`类型请求（即 expense-tracker.html 本身）优先走网络，只有离线时才退回
  缓存；因此**改 expense-tracker.html 的内容本身不强制要求升版本号**，用户刷新
  即拿到新版。但 `ASSETS`列表里的其他文件（icon、webmanifest，
  expense-tracker-sw.js:2-6）走 cache-first，**改 icon 或 webmanifest 必须把
  `CACHE`常量升级**（如 v8→v9），否则已安装用户的图标/manifest 不会更新。
  这是本页对`skills/pwa-pages.md`通则「改内容必升版本号」的一个例外，务必知悉，
  不要盲目每次改 HTML 都去升版本号（没必要），但改 icon/manifest 时**不要忘记**。
- manifest：`expense-tracker.webmanifest`，`start_url`/`scope`已设为相对路径。
- SW 注册点：expense-tracker.html:2297-2298（`navigator.serviceWorker.register`）。

## 已知坑
- 文件很大（3241行），单次 Read 建议配合 offset/limit 分段读，不要整档读入对话。
- Firebase Firestore 结构是「整份 data 当一个 JSON 字符串存」（`payload:
  JSON.stringify(data)`），不是逐字段存。
- 涉及金额、汇率、分类的改动，按 CLAUDE.md 与 `skills/numbers-and-money.md`
  规则，属于「错一个就毁信任」的类型，改完要抽验几笔真实数据核对。
- **2026-07-23 修复过一次真实数据丢失事故**：原 `syncFromCloud()` 在本机和云端
  都有数据时会跳出英文 `confirm()`，用户选哪边就整份覆盖丢弃另一边——用户在日本
  旅行记账时误点确认，昨天的记录被云端旧快照整个覆盖消失。已改为 `mergeData()`
  做 union-by-id 合并（`mergeById`函数），transactions 按新加的 `updatedAt` 字段
  （`saveTx()`/`addMonthlyRecurring()`写入）取较新版本，不再有整份覆盖的路径。
  权衡：合并不做删除同步（无 tombstone），一台设备删除的交易如果和还没见过这次
  删除的旧云端快照合并，可能被"复活"——这是有意选的取舍（换掉更严重的整批消失），
  以后改同步逻辑时留意这个已知限制，不要绕开 `mergeData()` 另开覆盖式路径。
  同时新增 `expense-tracker-recover.html`（只读恢复工具，扫描 IndexedDB 本机
  收据照片 + Firestore 云端收据照片备份，帮用户找回被覆盖记录的线索）。
- **2026-07-23 同一次事故还查出第二个独立 bug（真正的根因）**：拍收据自动识别日期
  （`ocrExtractDate()`本地OCR / `runReceiptSmartOCR()`AI识别）在识别不清年份时会
  猜错年份——AI 路径的 prompt 原本没告诉模型"今天实际日期"，模型会用训练数据里的
  旧年份瞎猜（例如猜成 2023，而旅行当下是 2026）；本地 OCR 路径也只挡未来日期，
  不挡离谱的过去日期。由于`monthTxs()`（本月支出/明细 tab）严格按 年+月 过滤，
  日期被猜错年份的记录会从当月视图"消失"（数据其实还在，只是被排到别的年份桶里），
  表现为"这个月只剩一笔""新增的账也不见了"。修复：新增 `isReasonableReceiptDate()`
  统一 sanity check（超过 `RECEIPT_DATE_MAX_PAST_DAYS`=60 天前或未来的一律拒绝，
  两条识别路径都过这关），AI prompt 也改为显式传入 `today()`真实日期。**这是这次
  用户报告"账目消失"的真正根因**，之前诊断的云同步整份覆盖是同时存在的另一个独立
  bug（也已修）。已知局限：这次修复只挡未来新扫的收据，已经进错年份的历史记录
  不会自动纠正，需要用户在 明细 tab 翻月份找到、手动改日期。
- **2026-07-23 同一次事故还带出第三个独立 bug（纯 CSS，跟数据无关）**：`.sum-row`
  （收入/支出/结余三个盒子，:94，用户可见于 概览/统计 两个 tab）用 `flex:1` 但没设
  `min-width:0`——金额涨到 7 位数（这次是 老板注资 ¥1,000,000 那笔）之后，盒子内容
  的自然宽度撑爆了 viewport，且没有任何容器兜底，导致**整个页面**变成可横向滚动，
  纪录列表以上的所有内容看起来"整体往左边被裁切"（固定定位的底部 nav 不受影响，
  所以只有 nav 看起来正常）。已加 `min-width:0` 让盒子能缩小、数字换行，并在
  `html`/`body` 补了 `overflow-x:hidden` 当兜底——以后任何地方金额涨到很宽的数字
  都不会再拖垮整页布局。这条教训：**凡是拿"金额"直接塞进 flex 子项的地方，都该有
  `min-width:0`**，改新功能时留意别重犯。（后续 2026-07-24 改了实现方式，见下一条
  最后一句——视觉效果这条描述的"换行"已不准确，教训本身仍成立。）
- **2026-07-24 收据扫描的"图像引擎加载失败"，根因是外部 CDN 依赖，不是代码逻辑
  错误**：`loadOpenCV()`原本只从 `docs.opencv.org/4.x/opencv.js`（文档站路径，
  不是真正 CDN）单一来源加载识别引擎。第一次修复加了两个外部 CDN 镜像
  （jsdelivr/unpkg 的 `@techstark/opencv-js`）做备援，但用户反馈仍然失败，且失败
  是"拍完照立刻报错"而非等了几秒才超时——排除是本地旧代码问题后，问对用户才发现
  当时用的是**酒店/商家 WiFi**：这类网络常见做法是白名单制，只放行少数已知网域，
  任何没在白名单里的外部网域一律秒拒，三个外部 CDN 因此同时失效——加更多外部镜像
  这条路本身就走不通，因为问题不在"选哪个 CDN"，而在"这类网络根本不让连外部网域"。
  真正修法：把 opencv.js 整份 vendor 进本仓库（`expense-tracker-opencv.js`，10MB，
  License 见 `expense-tracker-opencv.LICENSE.txt`，Apache-2.0，来源
  `@techstark/opencv-js@4.10.0-release.1`，是官方 OpenCV.js build 的原始重新发布，
  非改动版），`OPENCV_SOURCES`（`loadOpenCV()`附近）第一顺位改成同源相对路径
  `expense-tracker-opencv.js`——只要这个页面本身能打开，同源文件就一定能连到，
  这类"整个域名白名单"的网络限制才算真正解决；外部 CDN 镜像保留在后面几个顺位，
  当作"同源文件意外 404"这种小概率情况的备援，不删。**教训（比这次具体的 bug 更
  值得记住）**：使用者反馈"还是老样子/没用"时，先问"失败得快不快""换个网络会不会
  好"这类几秒钟能回答的问题，比闷头再叠一层同类型的修法（这次是"再加一个外部
  CDN"）更快找到真根因——同一大类修法用了两次都没解决，就该怀疑问题出在这个大类
  本身（"外部依赖"），而不是这一类里挑得不够好。
- **2026-07-24 记账 FAB 圆形按钮贴右边缘难点**：`.fab`（:465附近）的
  `right:calc(50% - 240px + 20px)` 是照着桌面预览场景（App 外层容器宽度封顶
  480px，`50%`相对居中容器算）写的公式，在真手机（viewport 通常 <480px）上
  `50%`变成相对整个屏幕宽度算，同一条公式会算出负值（如 390px 宽手机上约
  -25px），把按钮往右推出屏幕边缘一截，摸起来贴边难点。改成
  `right:max(20px, calc(50vw - 240px + 20px))`——`max()`保底在"公式算出更小/负值"
  时退回固定 20px 边距。**教训**：凡是用 `calc(50% - Npx)` 或类似公式做定位/尺寸，
  且公式是针对某个封顶宽度的容器（桌面预览、居中卡片）算出来的，套到没有封顶的
  真实窄屏（viewport <该封顶值）上要单独验证会不会算出负值/超界；用 `max()`/
  `min()`包一层做保底是比重新硬编两套公式更省事的通用解法。
