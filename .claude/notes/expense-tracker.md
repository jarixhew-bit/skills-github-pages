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

5. **改公司报账（送进 butler 的公司账本）**：入口在 `saveTx()` 末尾——账户勾了
   `isCompany` 才会走。核心函数集中在文件末尾「公司报账」那一节：
   `submitCompanyTx()`（送一笔）、`flushCompanyQueue()`（补送队列）、
   `syncCompanyTxFields()`（表单显隐与回填）、`renderCompanySettings()`（设置页状态）。
   **铁律：分类归拢、汇率换算、算谁头上，这三件事一个字都不许在 App 里算**——全部
   由 butler 的 `companyExpenseAddFromApp()` 做，App 只把原始输入原样送过去。理由是
   Telegram 和 App 是同一本账的两个入口，规则只住 butler 一处，两边产出才会一致。
   类别下拉也是从 butler 的 `GET /company-expense` 拉的，不硬编（用户在 Telegram
   教过的自定义类别只有服务端知道）。密钥存 localStorage `expenseTracker_companyToken`，
   服务端对应 Worker 的 `APP_SHARED_TOKEN`，设置方法见 butler-bot 的 SETUP.md。
   公司账户强制美元：butler 把非 KHR 金额一律当美元，账户币种是 HKD 会静静记错。

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

## 提示（toast）的约束

`.toast` 原本是 `white-space:nowrap`，长文字会直接跑出手机屏幕外（2026-08-03 用户反馈
「字太长手机看不到完整的」）。现在限宽 `min(100vw-32px, 420px)` ＋ 允许换行，
`toast()` 里设 `white-space:pre-line` 所以消息里的 `\n` 会真的换行。
**写提示时最重要的信息放第二行**（手机上第一行容易被略过）。
另外提示只显示 2.2 秒——**任何用户需要抄下来的信息（如单据号）必须同时在界面上长期可见**，
公司账的单据号就显示在明细列表每条记录的第二行（`companyTxNote()`）。

## 版本排查

设置页最底下显示 `APP_BUILD`（常量在 script 开头），旁边有「检查更新并重载」按钮
（`forceReload()`：清 caches ＋ update SW ＋ 硬重载）。
**用户报「功能没用」时先问版本号**——这个 App 常装在手机主屏，容易停在旧版；
而旧版记的公司账缺 `company.recordId`，删除时同步不了公司账本，看起来就像功能坏了
（2026-08-03 排查过一次）。改动本页功能时顺手把 `APP_BUILD` 改成当天日期。

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
  **2026-08-03 已补上删除同步（tombstone），下面这段"已知限制"已解除**：原本合并
  不记删除，一台设备删掉的交易只要碰上还没见过这次删除的旧云端快照就会"复活"——
  用户报"App 上删除又失效了"就是这个（删了、下次启动 `syncFromCloud()` 一合并又回来）。
  现在 `data.deletedTxIds`（`{id, at}`，180 天后自动清）记下删除，`mergeData()` 把
  墓碑并集算出来后从 transactions 里剔除；墓碑本身也跟着同步，所以另一台设备也会照删。
  **每一处从 `data.transactions` 移除记录的地方都必须调 `tombstoneTx(id)`**（现有三处：
  `deleteTx()` / `deleteTxById()` / `deleteAccount()`），漏一处那条路删的就会复活。
  同一次还修了 `saveToCloud()`：原本"正在推就直接 return"会让那次改动永远没上传
  （删除最容易撞上），改成置脏标记推完再补一次。不要绕开 `mergeData()` 另开覆盖式路径。
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
- **2026-08-02 上一条只修了一半：本地 OCR（tesseract）当时没一起 vendor，白名单 WiFi 下
  照样全挂**。用户又在这种网络下拍收据，报"又是连上 WiFi 就识别不了"。查下来这条路上有
  两道关、在这种网络下**两道全断**：(1) AI 识别要连 butler-bot 转发＋AI 服务商；(2) 退回
  本地 OCR 时，`loadTesseractJS()` 从 CDN 抓主脚本，**而且 tesseract 默认还会另外去抓
  worker、wasm 引擎、语言包（tessdata.projectnaptha.com）三样东西**——总共四个外部网域。
  修法照 2026-07-24 那条：整套 vendor 进 `vendor/tesseract/`，`TESSERACT_SOURCES` 同源
  第一顺位，CDN 留作备援。**关键细节：只把主脚本改成同源没用**，必须把
  `workerPath`/`corePath`/`langPath`/`gzip:false` 一起传给 `recognize()`，否则那三样照旧
  去外部网域抓、照旧被墙。
  **诚实标注**：AI 识别在这种网络下**无解**（它本质就要连外部服务），这次修的是"本地识别
  能正常工作"，不是"AI 识别恢复"。用户在酒店 WiFi 下的预期应该是"能自动填金额日期、
  但没商户名"，而不是恢复到 AI 那种准度。
  另外三个踩过的坑，改这块时别重犯：
  1. **语言包别用 tesseract.js 默认的 `tessdata.projectnaptha.com/4.0.0`**——那是完整模型，
     chi_sim 43MB、eng 23MB，两个 66MB。仓库撑大是其次，真正的问题是**用户手机第一次拍
     收据时要在酒店慢网上把这 66MB 拉下来，比原本的 bug 还难用**。改用 `tessdata_fast`
     （整数量化版）两个一共 6.6MB，认金额/日期完全够。workflow 里有 25MB 闸门挡这条回头路。
  2. **wasm 引擎四个变体都要抓**（`tesseract-core{,-simd}{,-lstm}.wasm.js`）：tesseract 按
     「CPU 支不支持 SIMD」×「语言包是不是 LSTM-only」四选一，而 tessdata_fast 正是
     LSTM-only，浏览器实际要的是 `tesseract-core-simd-lstm.wasm.js`。第一版只抓了前两个，
     浏览器实测直接 404（importScripts failed）——**这个是真跑浏览器才发现的，光看代码看不出来**。
  3. **OCR 超时从 30s 提到 90s**：第一次识别要下载约 11MB（wasm＋语言包），慢网上 30 秒
     会在下载途中被判超时，白白退化成"识别不了"。之后浏览器有缓存，通常 1~2 秒。
  验证方法（以后改这块照抄）：`python3 -m http.server` 起本地服务，Playwright 开
  Chromium 并用 `ctx.route()` **把所有非 localhost 请求全部 abort**，模拟白名单 WiFi，
  再跑一次真实识别看能不能读出金额和日期。注意本环境的 Chromium 已移除 old headless，
  Playwright 1.47 要用 `headless:false + args:['--headless=new']` 才起得来。
  抓取通道：`.github/workflows/vendor-tesseract.yml`（沙盒的出站代理封锁 jsdelivr，
  只能在 CI 上抓；但 `raw.githubusercontent.com` 沙盒**可以**直连，语言包能在本地直接下）。
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
- **2026-07-24 收据校准四角圆点贴屏幕边缘难抓**：`renderCornerStage()`
  （拖动调整四角那一步）原本让画布贴满整个 `#scan-stage`，而 `defaultCorners()`
  默认把四个圆点摆在图片的像素边缘——大多数收据照片本来就是贴边拍的，圆点因此
  经常正好卡在画布边界，可点范围被 `overflow:hidden` 裁掉将近一半，还正好挨着
  屏幕物理边缘，手指难点中。修法：`renderCornerStage()`里画布四周留 24px
  `CORNER_MARGIN`，圆点尺寸从 26px 加大到 36px。**教训**：凡是「默认值/重设值
  刚好落在容器边界」的可拖动 UI（这类通常是有意为之，比如「重设为全图」就是要
  四角对齐边缘），容器不能让内容贴满 0 边距，一定要留够半个可点元素的缓冲，
  不然默认状态自己就是最难用的状态。
- **2026-07-30 Android「分享到」记账本失败，根因是 manifest 里 `share_target.action`
  用了相对路径**：为了让用户拍完收据/选完相册照片能直接从系统分享面板分享进
  App（跳过手动打开 App 选相册），加了 `share_target`（`expense-tracker.webmanifest`）
  ＋ Service Worker 端拦截 POST（`expense-tracker-sw.js`的`handleShareTarget()`，
  把文件塞进跟收据附件共用的 IndexedDB，再跳转回`?share=1`让页面
  `checkShareTarget()`捡起来）。第一版`action`写成相对路径`"expense-tracker.html"`
  ——manifest 规范允许相对路径（相对 manifest 自身 URL 解析），但 Chrome 在
  Android 上把 PWA 注册成系统分享目标（WebAPK）这一步，文档记载**必须用完整绝对
  网址（含 `https://` 和域名）**，写相对路径会静默注册失败——用户重装 App 后分享
  列表里依然没有记账本，查了两篇独立文章才确认这个坑。已改成完整网址修复。
  **教训**：manifest 里任何要给系统（而不是给浏览器自己）用的字段（`share_target`、
  `protocol_handlers`、`file_handlers`这类"注册到 OS"的能力），相对路径不能全信
  规范允许就够用，实际抓紧写绝对网址，出问题时先查是不是这类 OS 注册环节的已知坑，
  别只在自己代码逻辑里找。另外，**改 manifest/SW 后，已安装用户必须卸载重装 PWA
  才会生效**，光刷新网页不够——这条本节前面 PWA 关键点已经提过一次（CACHE 版本号
  那条），这里是它在真实故障排查里踩过的实例，互相印证。
- **2026-08-01 账户明细 PDF 曾只列支出、不列收入(注资)明细**：`exportStatementPDF()`
  (:1954起) 生成的「个人账户明细」一直有「支出明细」逐笔表格，但收入
  (`t.type==='income'`，即注资/资金注入) 只在「收支汇总」栏折成一行汇总数字
  （`新增注资 N笔`），没有像支出一样逐笔列出日期/项目/金额——用户发现"注资的项目"
  在 PDF 里查不到明细。已加「收入明细 / Income Breakdown」表格（插在支出明细和
  收支汇总之间），结构照抄支出明细表（少一个"单据"栏，因为收入没有附件）；同时把
  `incomeTxs`补上按日期排序（原本没排序，跟 `expenseTxs` 不一致）。**教训**：这个
  范本最初是照手工「个人账户明细」单据抄的结构，原件本身可能就只详列支出——照抄
  纸质范本结构时，遇到"这个类目在范本里没有对应逐笔栏位"要留意是范本本身的设计
  选择还是遗漏，此处后来证明是遗漏（用户主动发现才补上），不是有意省略。
- **2026-07-30 月固定开销的批量按钮曾静默报错，因为调用了不存在的
  `renderAll()`**：`addMonthlyRecurring()`（一键录入本月）在`saveData()`之后调用
  `renderAll()`，但全文搜索这个函数根本不存在——`saveData()`已经成功执行（交易
  确实写进去了），但紧接着的`renderAll()`抛 ReferenceError，导致成功提示`toast()`
  和列表刷新从未跑到，用户点了按钮却感觉「什么都没发生」。改成调用当前屏幕真正
  需要的`renderSettingsRecurring()`。同时把「只能整批一起录」拆开：新增
  `addOneRecurring(id)`+ 每个项目一个「录入」按钮，允许单独某一项在它实际发生的
  当天单独录入（不用被批量按钮的"今天日期＋全额"绑死），公用的判重/写入逻辑抽成
  `pushRecurringTx(r)`给两条路径共用。**教训**：改动周边代码时顺手全文搜索一下
  被调用的函数是否真的存在，尤其是`saveData()`/写入操作**之后**才会触发的收尾函数
  ——数据层的 bug 容易被最先测到，UI 反馈层的 bug（写完了但用户看不到反馈）反而
  更隐蔽，因为「重新整理页面后数据是对的」会让人误以为功能一直正常。

- **2026-08-03 Firebase SDK 连不上会让整个 App 打不开（已修，别改回去）**：
  `firebase.initializeApp()` 原本是脚本最上方的裸调用，而 SDK 从 `gstatic.com` 加载。
  白名单 WiFi 挡掉 gstatic 时 `firebase` 是 undefined，这行当场抛错，整个 `<script>`
  停在第一行——本地记账、离线 OCR、离线队列全部陪葬，**只因为「云同步」这一个可选功能
  连不上**。已改成 try/catch + `cloudAvailable` 标志，连不上就退化成纯本地记账；
  `signInWithGoogle()`/`signOutUser()`/`init()` 里的 `auth.onAuthStateChanged` 都加了
  闸门（其余 `db.` 调用本来就被 `currentUser` 挡着，firebase 挂了 currentUser 恒为 null）。
  **教训**：可选功能的初始化代码放在脚本顶层且不设兜底，等于把整个 App 的存活押在
  那个可选功能的网络可达性上。这是 2026-07-24 / 2026-08-02 那两条「外部依赖在白名单
  WiFi 下全挂」的同一类问题，第三次踩到了——以后引入任何外部 SDK，先问一句
  「它连不上的时候，App 是整个死掉还是只少一个功能」。
- **2026-08-03 新增公司报账功能**：账户加 `isCompany` 标记后，该账户下记的账会同时送进
  butler 的公司账本（`data/company-expenses/YYYY-MM.json`），月底跟 Telegram 记的一起
  出同一份 Excel。tx 上多一个 `company` 字段（reporter/categoryEn/refTag/rawAmount/
  rawCurrency/status/error），`status` 为 `sent`/`pending`/`failed`；`pending` 的 id 同时
  进 localStorage 队列 `expenseTracker_companyQueue`，开 App、网络恢复、设置页手动点都会
  补送。**送不出去绝不丢账**：本机永远先存好，网络问题进队列重试，服务端明确拒绝
  （密钥错/类别归不了/日期不合理）才标 `failed` 并在设置页显示原因。
  **车牌类项目（汽油/洗车/汽车保养）**：这几类每次车牌不同、不能记词典，最终标签是
  `Petrol (NS6868)` 这种拼接格式，且一律归 Boss（`forceBoss`）。App 选到这些类别时会
  显示车牌输入框，把 `plate` 一并送过去由 butler 拼接——**App 不拼、也不判断哪些类别
  要车牌**，后者由 `GET /company-expense` 返回的 `plateCategories` 告知（正本是 butler
  的 `PLATE_CATEGORIES`）。2026-08-03 之前这几类被排除在下拉外，导致这些账只能回
  Telegram 记、App 里公司账户的合计跟公司账本对不上（用户指出）。
  **备注就是「描述」栏**（2026-08-03 用户选的，不另加栏位）：公司账户下描述会一并送进
  公司账本，显示在 Excel 的 DETAILS 后面（`LUNCH (BOSS) — 客户A招待`）和账单 PDF 页眉上。
  所以公司账户下这一栏的标签会改写成「描述／备注（会写进公司 Excel）」并显示说明——
  **别让用户以为这段字只存在手机里**。服务端限长 60 字（DETAILS 栏约 57 字符宽）。
  **单据号一般留空，由服务端自动派**（2026-08-03）：butler 的 `assignBillNumbers()` 按
  「一个月从 1 排到底、左右两张表分开排」派号，App 保存后在提示里显示「📄 单据请写 N 号」
  ——用户照着写在纸质单据上，月底 Excel 的 Bill No. 和账单照片 PDF 都用这个号。
  App 只转述服务端派的号，不自己编。用户自己填的号会被尊重、不覆盖。
  **收据编号（refTag）只能是 1~2 位数字**：它会写进 Excel 的 Bill No. 列，生成时
  `int(ref_tag)` 转换，非数字会让**整份月度表生成失败**（一笔坏数据毁掉所有人的表）。
  App 侧 saveTx 先挡一次，butler 的 `companyExpenseAddFromApp` 用 `normalizeTag` 再挡
  一次（那是真闸门），Excel 脚本的 int() 也加了 try/except 兜底。Telegram 那条路还
  支持圆圈数字 ①~⑩（会转成 "1"~"10"），App 的输入框只收阿拉伯数字。
  **`reporter` 不是「算谁头上」**：表单那个下拉是「谁报的账」，最终归属（`person`，
  决定进 Excel 左边 Boss 表还是右边 Assistants 表）由 butler 的
  `classifyCompanyExpensePerson()` 从 reporter＋categoryEn 算出来——只有同事自己吃的
  正餐（XY 的 Lunch/Dinner、G 的 Breakfast/Lunch）算他们自己进右边，其余一律 Boss 进左边。
  所以 XY 报的 Store 会进左边。**App 不准自己算这个**，只把服务端返回的 `person`
  存进 `tx.company.person` 用于显示（保存后的提示会说明进了哪边）。
  Excel 分边实现见 butler-bot `scripts/generate_company_excel.py:140-141`。
  **公司账本没有「改」这个操作**：butler 的 `saveRecords()` 是往月度账本 push 追加，
  不是按 id 覆盖。所以 App 里编辑一笔 `status==='sent'` 的公司账**绝不能再送一次**
  （会多一条重复记录、金额翻倍），代码里已挡住并提示用户去 Telegram 删掉重记。
  **删除则已经同步了**（2026-08-03 用户要求）：入账时把服务端记录 id 存进
  `tx.company.recordId`，删除走 `POST /company-expense` 带 `action:"delete"`。
  **顺序是先删远端、成功了才删本机**（`deleteCompanyRecord()` 返回 false 就整个中止）——
  反过来会留下「本机没了、公司账本还在」，那正是这个功能要消灭的状态。
  `not_found` 视为「先前已在 Telegram 删过」，询问后允许删本机。
  三个删除入口：编辑弹窗 `deleteTx()`、滑动删除 `deleteTxById()`（都已接上），
  以及 `deleteAccount()`——**批量删账户不代删远端**（逐条删太容易删到一半失败），
  只在确认框里说明有几条已进公司账本、要自己去 Telegram 清。
  **删除还有第二道坎在云同步那边**：远端账本删干净了，本机这条也删了，但云端旧快照
  一合并还是会把它并回来（看起来仍是「删除没用」）。修法见上面 tombstone 那段——
  查「删除失效」时两处都要看，只查公司账本那条会漏掉真正的病根。
  月度报表的顺序：Excel 行序与账单 PDF 页序都按日期升序（butler 两个脚本用同一个
  排序 key，CI 有 `tests/check-report-order.py` 守着）；**单据号不跟着重排**——号是
  录入当下派的、用户已照着写在纸质单据上，重排会让已写的号全部作废，所以 Bill No.
  那栏可能出现 2/1/3。
  自检：`node tools/check-expense-company.mjs`（真浏览器 82 项，全程断掉外部网域模拟
  酒店 WiFi），CI 是 `.github/workflows/expense-company-check.yml`，改这个页面就自动跑。
  本地跑法：`npm i playwright` → `python3 -m http.server 8899 &` →
  `CHROMIUM_PATH=/opt/pw-browsers/chromium node tools/check-expense-company.mjs`。

## 同事版 staff/（2026-08-08 补记）

`staff/index.html` **不是手写的**，由 `python3 tools/build-staff-page.py` 从
`expense-tracker.html` 生成——直接改它会在下次生成时被覆盖，且 CI 的
`build-staff-page.py --check` 会红。要改同事版就改生成脚本（HTML 注入在 `build()` 里、
CSS 在 `STAFF_CSS`、脚本在 `STAFF_BOOTSTRAP`），生成后连同 `staff/index.html` 一起提交。
每处注入都锚定「全文只出现一次」的字符串，锚点被源码改动碰掉时脚本抛 `BuildError`，
不会静静生成半份页面。

同目录还有三个**手写**文件（不由脚本生成）：`staff-sw.js`（离线用的 SW）、
`manifest.webmanifest`、`install.html`（安装说明书，中英双语，四步内联 SVG 图解）。

**「装到主屏幕」这件事是数据安全问题，不是体验问题**：iOS 会自行清掉 Safari 里的
站点数据，没装的人记了几笔、隔天打开就全空（2026-08-07 Seryi 实机）。所以
明细页顶上有 `#staff-install-tip` 提示条，`staffShowInstallTip()` 用
`navigator.standalone`（iOS 唯一认的信号）或 `display-mode: standalone` 判断，
没装才显示、装好自动消失，点它去 `install.html`。改动这块要保证「装好的人看不到」——
天天被念的提示等于没有提示。

自检：`node tools/check-staff-page.mjs`（真浏览器 173 项，含【14】提示条与【15】说明书），
CI 是 `.github/workflows/staff-page-check.yml`。**改 `expense-tracker.html` 也要跑这套**
（同事版从它生成），并且 `tools/` 底下两份浏览器自检要一起跑，只跑一份另一份会在 CI 上红。
