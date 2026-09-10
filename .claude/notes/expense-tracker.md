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
  酒店 WiFi），CI 是 `.github/workflows/checks.yml` 里的「公司账（真浏览器）」job，改这个页面就自动跑。
  本地跑法：`npm i playwright` → `python3 -m http.server 8899 &` →
  `CHROMIUM_PATH=/opt/pw-browsers/chromium node tools/check-expense-company.mjs`。

## 库存并进来了：第五个分页（2026-08-10）

原本 `inventory/index.html` 是独立 App，现在整个并进本页成为「📦 库存」分页
（老板不想开两个 App：同一把钥匙、同一个服务端，分两个只是多一个图标多一份代码）。
`inventory/index.html` 已改成跳转页（主屏可能装过它，网址不能失效）；
`inventory/manifest.webmanifest` **保留不动**（已装的 PWA 删了 manifest 会出怪问题）。

- **锚点**：`<!-- INVENTORY TAB -->` / `<div class="tab" id="tab-inventory">`（settings tab
  之后、FAB 之前）、导航 `#nav-inventory`（analytics 与 settings 之间）、三个弹窗
  `#inv-modal-add/edit/log`（在 PDF REPORT 之后）、JS 那一节 `// ===== 库存 =====`。
- **命名铁律**：库存来的 JS 顶层名一律 `inv` 开头、DOM id 一律 `inv-` 开头、CSS 类一律
  `.inv-` 开头。**`state` 尤其致命**（记账全部界面状态在里面），库存用的是 `invState`。
  `toast` / `showModal` / `closeModal` 是**复用记账现成的**，没有另建一份。
- **钥匙**：`getCompanyToken()`，不自己再存一把。老板版读 `expenseTracker_companyToken`，
  同事版由构建脚本换成 `staffExpense_token`——所以**别在库存代码里再写一次那个字符串
  字面量**，`build-staff-page.py` 的 `replace_n` 要求它全文恰好出现 1 次。
- **懒加载**：只有 `switchTab('inventory')` 才拉数据（`invOnTabShow()`），拉过一次就不再拉。
  记账是主要用途，启动速度不能被库存拖慢——自检有一条专门守这个。
- **`.inv-*` 里凡是设了 display 的，都要自己补 `[hidden]{display:none!important}`**：本页
  没有全局 `[hidden]` 规则，`.inv-banner{display:flex}` 当场让错误横幅永远挂着（自检抓到的）。
- **`build-staff-page.py` 的坑**：「设置 tab」那段 `cut_between` 的终点已从 `<!-- FAB -->`
  改成 `<!-- INVENTORY TAB -->`——同事版**要**保留库存，写回 FAB 会把库存一起切掉。
  底部导航那个删除循环按 id 逐个删（overview/analytics/settings），`nav-inventory` 不在
  名单里所以自动保留。导航的中文「库存」在 `LABEL_REWRITES` 里加了 `data-en="Stock"`。
- **已知缺口**：库存分页**内部**的文案只有中文，同事版切成英文时这一块还是中文
  （导航按钮已经会跟着切）。要补的话静态标签加 `data-en`、动态渲染的要包 `tt()`，
  但 `tt()` 只存在于同事版，老板 App 里没有，所以不是加几个属性就完事。

自检：`node tools/check-inventory.mjs`（真浏览器 97 项，老板版＋同事版都覆盖：懒加载、
防连点双击、分组小计、分享文案、空态/错误态/forbidden、操作记录懒加载、
以及「库存的操作不许改到 `data.transactions`」）。跑法同下面那两份。

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

## 请假登记（2026-09-02）

设置页「员工 → 请假登记」和同事版底部导航的「🏖 请假」是**同一个弹窗**
（`#modal-leave` / `renderLeaveBody()`），差别只有一个：「是谁请假」那个输入框
只有服务端说 `scope==='owner'` 时才画进 DOM。弹窗放在 `<!-- PDF REPORT (hidden) -->`
**之后**——放进 ACCOUNT SWITCHER～PDF REPORT 那个区间会被生成脚本整段切掉。
设计理由、数据落在哪、权限怎么分、自检清单，正本在 `.claude/notes/boss-app.md`
的「今天谁请假」那一节。

## 双击「保存」不能生出两条一样的记录（2026-08-08）

用户实机在主 App 遇到「两条一样的」。根因：`saveTxInner()` 全程同步（唯一异步的
`submitCompanyTx().then()` 是 fire-and-forget，不挡后续点击），双击时第一下点击的
事件处理函数会**完整跑完**（包括把按钮重新变回可点）之后，浏览器才轮到派发第二下
点击——JS 单线程，两次点击是两个各自跑到底的独立事件，不是同时发生的竞态。

**第一版闸门是错的**：在 `saveTx()` 里同步 `disabled=true` 再在 `finally` 里同步
`disabled=false`，看起来锁住了，但因为整段在同一个执行栈里完成，等浏览器真的要
派发第二次点击时，锁早就解开了，等于没挡——这个错误做法在把它接上真浏览器测试
（用 `el.click()` 连打两下，不是 `page.evaluate` 直接调函数）时就会立刻现形，
用 `page.evaluate(() => saveTx())` 连调两次测不出来（那是同步顺序调用，不是双击）。

**真正有效的做法**：`disabled=true` 必须**跨过**第一次点击的整个同步执行，留到
浏览器要派发第二次点击的那一刻还是 `true`——disabled 的按钮，浏览器根本不会把
`click` 事件派给它，第二下 `onclick` 都不会被调用。所以解锁要用 `setTimeout` 延后
（400ms），不能在同一拍里做。`showAddTx()` / `editTx()` 里各留一道保底重置，防
万一延迟还没到又开了新记录，按钮却按不动。

自检手法要记住：这类 bug 只能用 `el.click(); el.click();`（原生 DOM 方法，Chromium
会执行「disabled 按钮不派发 click」的规则）模拟真实双击，Playwright 的高阶
`page.click()` 会等按钮变回可点再点，测不出这个窗口。

## 照片认出来的金额要人核对过（2026-08-08）

识别（本地 Tesseract 和 AI 两条路都算）填进金额栏之后，`markAmountUnconfirmed()`
把 `state.amountFromOcr` 立起来、金额栏描橘边、旁边出现「👀 这个数是从照片认出来的，
请跟收据核对一遍」＋一个「对的」按钮。**没核对过 `saveTxInner()` 直接中止**——
不送账本、也不存本机。按「对的」或自己动手改金额（`onAmountInput`）都算核对过。

为什么是闸门不是提示：识别把 11.76 认成 11.78 这种错不会报错、不会变色，只会静静
进账本，而账本收下了就只能删掉重记。原本只有一句 2.2 秒的 toast，错过就没了。
用户 2026-08-08 明确要求「不要再有数目不对」。

复位点有两处：`showAddTx()`（开新记录）和 `editTx()`（旧记录的金额是存过的，不是刚认出来的）。
漏掉任一处，闸门会留在上一笔的状态。

## 已送出的公司账不给改（2026-08-08）

公司账本只有「新增」和「删除」，**没有「改」**——butler 的 `saveRecords` 是往月度账本
追加，同一笔再送一次不会覆盖、只会多一条，钱直接翻倍。所以 App 从一开始就不重送
已送出的记录，只弹一句 2.2 秒的提示。

后果是两边静静分叉：Seryi 2026-08-02 那笔本机 11.76、账本 11.78，靠肉眼比对才发现
（butler-bot `fb1e15d` 已按收据更正）。现在从源头断掉——`applyCompanyLock()` 在
`status==='sent'` 时锁住整张表单、收起保存键、只留「删除此记录」（删除是会同步到
账本的）。`saveTxInner()` 开头还有第二道闸门，防绕过 UI 的路径。

`pending`／`failed` 不锁：账本里还没有这一笔，队列送出去的是改完那一版。
`saveTxInner` 末尾那个 `status === 'sent'` 分支现在走不到了，但**不要删**——它是最后
一道防重复记账的保险。

## 「这一餐算谁的」（2026-08-08）

公司账的归属规则住在 butler（`classifyCompanyExpensePerson`）：同事自己那几餐
（`ownMeals`）算他自己进 Excel 右表，其余一律 Boss 进左表。问题是同事**买给老板**的
午餐也只能选 `Lunch`，于是被记成他自己的——老板的餐费算进了同事那栏。

修法沿用 Telegram 早就有的写法：项目原文带「老板」两字（`forceBoss`）就强制归 Boss，
原文里的餐别词再决定 Excel 标签。表单这边多一个「这一餐算谁的」开关
（`#tx-company-whose-wrap`，只在正餐类别出现），选「老板的」就把服务端给的原文送出去。

**字串由服务端给，App 不许自己拼**：`companyExpenseCategories` 多返回
`mealCategories: [{label, bossRaw}]`，App 存进 `tx.company.bossRaw`、发送时当
`categoryRaw`。理由跟 `plateCategories` 一样——拼错一个字 butler 不会报错，
只会静静把钱记到错的人头上。`tx.company.categoryEn` 保持标准类别，所以
`COMPANY_CAT_TO_APP` 的对应和列表显示都不用跟着改。

备用金不受影响：它按 `reporter` 扣（钱从谁手上出去就扣谁），跟这笔算 Boss 还是
算他自己无关——同事替老板垫的钱照样从他的备用金里扣，这是对的。

自检：`node tools/check-staff-page.mjs`（真浏览器 173 项，含【14】提示条与【15】说明书），
CI 是 `.github/workflows/checks.yml` 里的「同事版（真浏览器）」job（拆成两半并行跑）。
**改 `expense-tracker.html` 也要跑这套**
（同事版从它生成），并且 `tools/` 底下两份浏览器自检要一起跑，只跑一份另一份会在 CI 上红。

## 公司账户没有「收入」（2026-08-08）

用户问「用老板 App 记收入会不会出现在 Excel 里」——查代码发现会，而且是**静静记错**：
butler 的公司账本（`Boss_Expenses.xlsx`）从数据结构到 Excel 整个是纯支出报表
（`companyExpenseAddFromApp` 只有 `amountUsd`/`person`/`categoryEn`，没有收入这个
字段），选「收入」保存会跟支出走同一条路送进 `buildCompanyPayload`，被当成一笔
支出记进账本——钱记错方向，且没有任何报错或提示。这条本来就没人会故意去踩，
但一旦踩到，是用户做月度对账（三人余额+开销+待claim=固定总数）时才会发现的那种
无声错误，损失可以是任意大小。

修法：`<div class="type-tabs" id="tx-type-tabs">`（收入/支出切换）源码里直接带 id
（不再由 `build-staff-page.py` 注入——同事版本来就不需要，源码有了它会跟已存在的
id 冲突报 `BuildError`，第 3 步那条注入已删掉）。`syncCompanyTxFields()` 里公司账户
下整块隐藏这个切换、强制 `state.txType='expense'`；`saveTxInner()` 顶上再挡一次防
绕过（跟今天其它几道闸门同一个思路：UI 隐藏 + 逻辑闸门两道防线）。

自检：`check-expense-company.mjs`【19】，用「把两道闸门都拿掉」验证过——真的会看到
一笔 `amount:55.55` 的"收入"被 POST 进公司账本 payload，不是假设。

## 对账：三人余额 + 本月开销 + 待claim（2026-08-08）

用户自己的月度对账法：三个同事的备用金余额 + 本月公司账本总开销 + 待claim的，
加起来应该正好等于公司给的固定盘子（写死在 `PENDING_CLAIM_TARGET_USD = 10000`）。
前两块系统本来就有；待claim 是新加的第三块——App 是那个月才开始用的，之前欠着
没结清的钱（还有老板自己垫的钱，不同于三个同事，他没有备用金那套）系统完全看
不到，只能他自己记一笔。

**架构完全照抄备用金那一套**（butler-bot `src/handlers/pending_claim.js`）：
append-only 事件流 `data/pending-claim.json`，不存一个「当前待claim多少」的字段，
总数永远现算。跟备用金的差异：这是老板一个人一本账，没有「起点/发放/调整」三种
类型的区分——不需要，第一笔记录本身就是起点（例如「+3123.45 上个月开销」）。
金额正负都行：正=新发现一笔还没结清的开销，负=claim 回来了、冲抵。

**排序坑跟备用金 openIdx 是同一类**：`pendingClaimTotal` 给「最近 20 条」历史时，
一开始用时间戳字符串排序，同一毫秒内连记几笔时间戳会一样，稳定排序全平局时保持
原序（旧的还在前面），等于没排。改成直接 `events.slice().reverse()`——事件流只
追加，数组顺序本来就是真实发生顺序，不用比时间戳。

**App 侧**（`expense-tracker.html`）：`reconcileCompute()` 把三块凑出来，任何一块
拿不到就回 `null`（不给缺角的假数字）；`renderOvReconcile()` 是首屏卡片，
`openReconcile()`/`renderReconcile()` 是明细弹窗（含待claim历史 + 记一笔 + 撤销）。
`missing`：备用金没设起点的人不计入「三人余额」，如实标出来是谁没设，不能悄悄
把他当 0 算。整个功能（卡片 + 两个弹窗）都在 ACCOUNT SWITCHER～PDF REPORT 那段
cut 区间内，同事版生成时自动整块消失；但 `init()` 里拉取数据的三行
（`fetchCompanyLedger().then` / `fetchPetty().then` / `fetchPendingClaim().then`）
是 JS 逻辑，**不在**那段 HTML cut 范围内，必须在 `build-staff-page.py` 里单独
`cut_exact` 掉——漏了这步的话，同事版的 `init()`（`staffStart()` 内部真的会调用它）
会带着同事的钥匙去问一个只认老板的接口，白打一发请求（服务端会拒，不会出错，
但也不该问）。

自检：`check-expense-company.mjs`【20】（算术、missing、记一笔/撤销联动、首屏卡片
跟明细一致）；`check-staff-page.mjs`【21】守「同事版摸不到也碰不到」——DOM 里没有
这几个元素，且全程没有任何 `pendingClaim` 开头的请求被送出去（万一以后谁漏掉
cut_exact，这条会当场变红）；butler-bot `tests/pending-claim.test.mjs` 28 项覆盖
handler 本身的算术、0 值拒绝、撤销、历史截断/排序。

## 同事投递箱：同事帮老板记账（2026-08-09）

同事版多一个「老板账」页面，记的账**不走 butler、不进公司账本**，直接进老板自己的账户。
用户要的是「PDF 和功能都跟主 App 现在一样，不要跟着公司账那套」——所以这条路上
一个字都没改 PDF 和记账表单，只是换了个「账从哪来」。

**为什么隔一个投递箱，而不是让同事直接写老板的账本**：账本在云端是「整份 data 压成
一个 JSON 字符串」存的（`saveToCloud`），两边同时写就是整本互相覆盖——2026-07-23
栽过一次。投递箱（Firestore `inbox_boss` 集合）一条一个文档、只增不改，物理上没有
覆盖账本的路径。

- **权限住 Firestore 规则里**，不在代码里：同事只能 create、不能读/改/删；只有老板那个
  uid 能读能删。规则底稿在仓库根目录 `firestore.rules`（**Console 才是正本**，改了要
  回来同步这份底稿——规则在仓库里查不到是 2026-07-16 栽过的坑）。
- **口令不写在源码里**：网址是公开的 GitHub Pages，写进源码等于没有口令。它只住在
  规则里和同事手机的 localStorage（`staffExpense_bossKey`）。没口令的同事连「老板账」
  这个入口都看不到（`staffSyncMode` 控制），页面跟以前一模一样。
- **身份用匿名登录**（`auth.signInAnonymously`）：规则要求 `request.auth != null`。
  ⚠️ 同事版的 `onAuthStateChanged` 在生成时已被拿掉（build 第 7 步），所以匿名登录
  **不会**让 `currentUser` 变成非 null——改那一段前先确认这条还在，否则同事的账本会被
  推上老板的云端。
- **老板侧**（`fetchInbox()`，设置页「同事投递箱」那一栏）：登录后自动收、也能手动点。
  收进来的 id 固定 `ix_<同事那条的 id>`——收两次只覆盖同一笔；已在墓碑
  （`deletedTxIds`）里的不再收回来（「删了又出现」不许从新路径长回来）。
  收进哪个账户是设置页的下拉（`expenseTracker_inboxAccount`，默认 `acc_boss`），
  **不写死**——账户是用户自己建的。
- **同事侧**（build 脚本注入）：`onTxSaved()` 钩子（钩子本身在 `saveTxInner()` 末尾，
  老板 App 里没这个函数所以什么都不做）→ `submitInboxTx()` → 送不出去进队列
  `staffExpense_bossQueue`，开页面/网络恢复自动补送。**送不出去绝不丢账**。
- **老板账那边表单是个人账本那套**：`syncCompanyTxFields()` 本来就按 `acc.isCompany`
  分岔，所以描述/收入支出/类别宫格自动回来。STAFF_CSS 的隐藏改成
  `body:not(.staff-boss)` 作用域，不是两套 CSS。
- **不能用共用的 `switchAccount()` 切账户**：它末尾 `closeModal('modal-acc-switch')`，
  而那个弹窗在同事版里整块没生成进来，会当场抛 null。用 `staffSwitchAcc()`。
- 送出去的 payload 刻意不带 `createdAt`（那要 `firebase.firestore.FieldValue`，多依赖
  一个全局对象；收到时间由老板侧盖 `fromStaff.at`）。字段必须落在规则的
  `hasOnly(['k','tx','photo','from','createdAt'])` 里，多一个整条会被拒。

自检：`check-expense-company.mjs`【21】（收件：去重、墓碑、坏数据、权限错误分辨、
没登录不读）＋ `check-staff-page.mjs`【22】（口令才可见、表单换成个人那套、payload
字段跟规则对得上、离线进队列）。

### 旅行怎么用这套（2026-08-09 补）

用户问「旅行开新账户给他们，也是这套吗」。**是**：老板端新建一个旅行账户，把设置页
「同事投递箱」的下拉切过去即可——下拉列的是全部账户，切了之后同事记的账就收进新账户，
**代码零改动**。前提是同一批人、时间不重叠。

要给**不同批人**用（旅行伙伴 ≠ 同事）才需要改：让口令决定目的地
（规则写成 `(k=='老板口令' && acc=='boss') || (k=='旅行口令' && acc=='trip')`），
否则给旅行伙伴的口令能往老板私账里塞钱。这块**还没做**。

想让所有人看得见「这趟一共花了多少」是另一件事，投递箱做不到（单向投递，同事读不到
老板的账本，而账本是整份 JSON 没法开局部读权限）——那要抄公司账那套（一条记录一个
文档、大家都能读）。用户当时说不需要，只要看得到手上现金还剩多少，于是做了下面这个。

### 老板账的币种 + 手上现金（2026-08-09）

用户的实际用法：**给同事现金 600，他们花掉并记账，随时看得到还剩多少**。老板那边
「后面才算」，不需要实时。

- **币种可改**（`staffBossCur()` / `staffSetBossCur()`，存
  `staffExpense_bossCur`）。原本 `staffBossAcc()` 把币种写死 `'USD'`，旅行时日元账目
  会显示成 `US$8000`——**差两个数量级，同事会以为自己多打了个零**。
  注意 `staffBossAcc()` 里那段：账户对象第一次建好就存进 `data.accounts` 了，改币种
  必须连存着的那份一起改，否则设定看着变了、列表里还是旧符号。
  ⚠️ 金额本身从来没记错——老板收件时是按**他自己选的目标账户**记的，币种以那边为准，
  这个设定只影响同事屏幕上的符号。
- **手上现金卡**（`#staff-boss-cash` / `renderBossCash()`，存 `staffExpense_bossCash`
  ＝ `{topups:[{date,amount}]}`）。跟公司账那张 `#staff-petty` 是**两套东西**，
  刻意不共用样式类和函数：那张的数由 butler 服务端算（老板的钥匙才拿得到），
  老板账根本没有服务端，只能本机算 `收到 − 支出 + 收入`。
  - **没送出去的账也照扣**：现金离开口袋那一刻就没了，跟送没送到老板那边无关。
    （公司账那张相反，因为那边的权威数在服务端。）送没送到另写一行提醒，不混进余额。
  - 还没填收到多少时**不编一个 0 出来**——那看起来像「花光了」，直接请他填。
  - 花超了显示「超支了 + 你先垫了 X」，不显示负数余额。
- **重画挂在 `renderTxList()` 的包装上**（跟 `staffRenderSummary` 同一个包装，
  别再加第二个 `const _staffRenderTxList` —— 重复声明会当场 `SyntaxError`，
  整页白屏，2026-08-09 踩过）。记账/删除/找回记录全都经过它，逐个入口去补一定会漏，
  漏掉的表现是余额停在旧数字上，那种错要人肉比对才发现。

自检：`check-staff-page.mjs`【23】（币种改得动且列表跟着变、乱填代码不认、余额是真算的、
未送出照扣、超支提示、重填不动账目、公司账页不出现这张卡）。

## 待claim「claim 回来了」——不要在 App 这边补记（2026-08-09 撤回的一版）

2026-08-09 做过一版：对账弹窗填负数时多一个「☑ 同时把这笔钱记进我的账户」，勾了就在
个人账户记一笔收入。**当天用户试用后撤掉**——「回去户口是要回公司户口，不是 boss 账户」。

查下去发现根因不是「记错账户」，是**这一步整个不该存在**：

- butler 的 `pendingClaimAdjust` 收到**负数**（claim 回来了）时，已经自动给 **Yang 的
  备用金**记一笔等额 `type:"adjust"` 加款（`butler-bot/src/handlers/pending_claim.js`，
  2026-08-09 依用户说明「这笔钱实际是进 Yang 手上的」加的）。正数不镜像。
- 首屏「公司」那张卡显示的**就是 Yang 的备用金余额**（`renderAccCards()` 的
  `acc.isCompany` 分支）。

所以填完负数，公司户口那张卡**本来就会自己涨回来**。再在 App 这边记一笔收入 = 同一笔
钱数两次，而且是月底对账才发现、发现了也查不出哪来的那种错。

改完之后：弹窗里只留一句说明（卡会自己涨、不用手动补），并在保存成功且金额为负时
`fetchPetty({force:true}) + renderAccCards()`，否则要等下次切页才看得到卡片变化。

⚠️ **别再把这个功能加回来**。自检【20d2】就是守这条：断言弹窗里**不存在**
`#reconcile-transfer-row`、提交负数后本机账本一笔都不许多。

⚠️ 另一个坑（`pendingClaimUndo` 的已知限制，butler 那边写在注释里）：撤销 claim 事件
**不会**连带撤掉 Yang 那笔镜像加款——要撤得自己去备用金那边手工记一笔「调整」冲回去。

## 给同事现金：反向同步进「手上现金」卡（2026-09-09）

同事投递箱（上面那节）是「同事 → 老板」单向；这个是反过来的「老板 → 同事」，架构完全
照抄同一套原理：新增 Firestore 集合 `boss_cash_gifts`，一条一个文档、只增不改，物理上
没有覆盖任何账本的路径。老板在主 App 记一笔「给了谁多少现金」，同事版「老板账」页
`#staff-boss-cash`（手上现金卡）轮询到这个集合后自动把这笔加进 `topups`——原本这张卡
的钱完全靠同事自己手动按「＋ 收到现金」，现在老板这边转了就自动出现。

**UI 不在设置页表单，在首屏卡片＋弹窗**（跟公司账「💵 备用金」`#ov-petty`/`openPetty()`
同一套体验，2026-09-09 用户看完第一版设置页表单的方案后要求改成这样）：
- `#ov-boss-cash-gift`（Overview tab，`renderOvBossCashGift()`）：永远显示（不像备用金卡
  要挂公司账户才出现），没设口令时提示去设置页、点了直接跳转；设了口令显示最近送过的
  几笔当参考（本机 log，`expenseTracker_bossCashGiftLog`，纯 UI 用，不是权威数据）。
- `#modal-boss-cash-gift`（`openBossCashGift()`/`renderBossCashGiftModal()`）：选同事
  （`#boss-cash-gift-person`，自由文本＋datalist 记住用过的名字，不是正式名册——老板账
  本来就没有花名册）、金额＋币种（`bossCashGiftEcho()` 抄 `pettyEcho()` 的即时回显）、
  备注（可留空，≤200 字）、「转钱给他」按钮＝`sendBossCashGift()`。
- 设置页只留口令输入框（`#boss-cash-key-input`，`oninput="saveBossCashKey(...)"` 即时存，
  不用按保存），口令是一次性设定，跟金额/同事这些每次都要填的东西分开。
- 这个模态放在 `<!-- MODAL: ACCOUNT SWITCHER -->`～`<!-- PDF REPORT (hidden) -->` 那段
  cut 区间内（跟 `modal-petty`/`modal-petty-add` 同一个理由：老板专属，同事版生成时
  整块消失）；`#ov-boss-cash-gift` 卡片在 OVERVIEW TAB 里，同事版**整个 overview tab**
  都被切掉（`cut_between("<!-- OVERVIEW TAB -->", "<!-- TRANSACTIONS TAB -->")`），
  所以也不用另外处理。JS 函数（`renderOvBossCashGift`/`sendBossCashGift` 等）留在同事版
  的 JS 里没关系——DOM 元素不存在，函数只是拿不到 `getElementById`，安全 return，不会
  被同事的 UI 调用到。

**按人分流，不广播（2026-09-09 用户追问后补的关键设计）**：老板账口令是**共用**的——
不止一个同事可能在用同一个口令，而「手上现金」是**每个同事本机各自算**的。第一版方案
里 gift 文档只带口令没带收件人，会让转给 A 的钱被**所有**持有这个口令的同事同时收到、
同时加进各自余额。修法：`boss_cash_gifts` 文档必填 `person`（收件人名字，老板发送时
填的自由文本）；同事版 `staffSyncBossGifts()`（`tools/build-staff-page.py`）借用同事版
已有的身份机制 `staffIdentity.reporter`，只认 `doc.data().person === staffIdentity.reporter`
的那几笔，其余一律忽略（哪怕口令一样也不认）。**过滤是客户端做的**，Firestore 查询本身
仍然只按 `k`（口令）和 `at`（游标）两个字段筛——不为 `person` 另建复合索引，省得还要
请用户去 Firebase Console 建索引；被过滤掉的文档照样推进 `seen.lastAt` 游标（否则下次
轮询会一直重新拉到它，白跑请求）。Firestore 规则的 `create` 校验相应加了
`person is string && size() 在 (0,40)`；`read` 规则不额外按 person 收紧——跟 `inbox_boss`
一样，规则只守口令这一道闸，person 过滤纯粹是前端逻辑。

**币别铁律跟公司账那套一样**：gift 文档的 `currency` 如果跟同事这本账当前设定的
`staffBossCur()` 不一样，**不许悄悄按面值 1:1 加进总额**——那等于编了个错的汇率。做法：
仍然记进 `topups`（带上自己的原始币种 `cur` 字段），`renderBossCash()` 算 `got` 总额时
只累计 `!t.cur || t.cur === cur` 的那些，币种不匹配的那几笔在清单里显示**自己的原始
币种**（不是被当成卡片币种）＋一个 ⚠️ 标记，`staffSyncBossGifts()` 结尾用 toast 明确
提醒「有几笔币别不一样，没算进总额」。

**去重／幂等**：`STAFF_BOSS_GIFTS_SEEN`（`staffExpense_bossGiftsSeen`，`{lastAt, ids}`）——
`ids` 记最近 300 个已处理的 doc id（够去重用，不无限长），`lastAt` 是游标，查询用
`.where('at', '>', seen.lastAt)` 只拉新的。轮询挂在跟 `staffLoadPetty` 一样的触发点
（`saveTx` 之后 2.5 秒、`visibilitychange`、切进「老板账」页时的 `staffSyncMode()`），
不新开计时器。

**App 侧铁律没变**：`sendBossCashGift()` 绝不做任何汇率换算或猜币种，原样把用户填的
数字、币种、收件人送出去——跟公司报账那条「分类归拢、汇率换算…一个字都不许在 App 里
算」是同一条精神。

自检：`check-expense-company.mjs`【31】（首屏卡片状态、跳转设置页、弹窗表单四要素、
未登录/没填收件人/金额 0 或空都不发请求、正常送出内容原样含 person、权限被拒的提示）；
`check-staff-page.mjs`【27】（没设口令零请求、币种匹配计入总额+toast、同一 doc id 幂等、
币种不匹配不计入总额但列清单带警示、**给别人的那笔总额和 topups 都不受影响**、
过滤后游标仍然推进不会重复白跑请求）。

⚠️ **Firestore 规则改动只在仓库里留底稿，真正生效要用户自己去 Firebase Console 贴一次**
——这件事 AI 做不了，`firestore.rules` 里 `boss_cash_gifts` 那个 `match` 块只是底稿，
用户需要把它贴进 Firebase Console（跟 `inbox_boss` 当初一样的位置），并确认
`BOSS_UID_HERE`/`PASSCODE_HERE` 两个占位符已经替换成真值（应该已经在 Console 里替换过
一次，这次只是多加一段规则，不用重新替换）。

**前端校验要跟 Firestore 规则的边界严格对齐，不能只对齐"大概"（2026-09-09 验收查出）**：
第一版 `sendBossCashGift()` 漏了金额上限校验（规则要求 `amount<1000000`），且
`note`/`person` 的 `maxlength`/`slice()` 卡在跟规则相同的数字（200/40）而不是"严格小于"
那个数字（199/39）——后果是用户填到刚好卡在边界的值，前端放行，送到 Firestore 才被规则
拒绝，报错却是「口令不对，或者规则还没加这条」，完全查不出真正原因。已修正：金额校验
`amount>=1000000` 提前挡并提示「单笔上限 999,999」，`note` maxlength 改 199，`person`
`slice(0,39)`。**教训**：任何"前端校验 + 后端/规则再校验一次"的双闸设计，两道闸的边界
数字必须完全对齐（尤其注意"小于"和"小于等于"这种差一错误），否则用户会撞见一种自己
束手无策、错误提示还指错方向的失败——这类边界不对齐的 bug，只测"正常值通过"和"超大值
被拒"两种情况测不出来，要专门测"卡在规则边界那个数字"。

### 撤回：老板转错了能删（2026-09-09）

真实事故起因：用户手滑把币种打错（该给 KUANG 转 USD，选成了 HKD），当时
`boss_cash_gifts` 的规则是 `allow update, delete: if false`——**谁都删不掉，包括老板
本人**，历史记录不能被事后偷改。放宽成「只有老板能删整笔，不能改」：
`allow delete: if request.auth.uid == 'BOSS_UID_HERE'; allow update: if false;`——
不许改金额（防悄悄改账），只许整笔撤回。

**为什么"删 Firestore 文档"不等于"同事手机自动更新"**：没有服务端推送撤回通知这回事，
Firestore 的 `delete()` 只是让那份文档从云端消失，同事那边的手机不会收到任何主动通知
——它只能靠**下次自己核对时发现**「咦，这个 giftId 我记着，但云端查不到了」。这是新增
`staffPruneBossGifts()`（跟 `staffSyncBossGifts()` 反方向：那个是「发现新的就加」，这个
是「发现没了的就删」）的根本原因。

**核对为什么不能挂在 saveTx 后 2.5 秒那个快速轮询上**：那个轮询是为「礼物到账要快」
设计的——老板刚转了钱，同事记账时能尽快看到。撤回不常见、也没那么急，而且每次核对都要
多打一发 Firestore 请求，没必要那么频繁。所以只挂在 `staffSyncMode()`（切进「老板账」
tab 时）和 `visibilitychange`（App 从背景切回前台）这两处，跟 `staffSyncBossGifts()` 放
在一起调用，不新开计时器。

**`giftId` 是唯一的关联桥梁**：`staffSyncBossGifts()` 合并礼物时会把 Firestore doc id
存进 `topup.giftId`；`bossCashAdd()` 手动记的条目完全没有这个字段。`staffPruneBossGifts()`
只处理带 `giftId` 的 topup——本地一笔 `giftId` 都没有时直接 `return`，连请求都不发（比照
"没必要查的时候不要查"那条铁律）。查询故意**不带 `person` 条件**（只按口令 `k` 拉这个
口令下的全部记录，客户端再筛）——原因见下面这条大小写修复，`where('person','==',...)`
是精确匹配，没法做大小写不敏感比对。

主 App 弹窗（`#modal-boss-cash-gift`）里新增「最近转过」清单
（`refreshBossCashGiftRecent()`/`renderBossCashGiftRow()`，弹窗打开和转账成功后都会刷新）
＋ `deleteBossCashGift()`：点 🗑 要 `confirm()`（这是钱，删错了对方就少一笔提醒，跟
`sendBossCashGift()` 同一条规矩），确认后 `db.collection('boss_cash_gifts').doc(id).delete()`，
`permission-denied` 单独讲清楚（不是老板本人操作/规则还没贴），其余失败提示等有网再试。

自检：`check-expense-company.mjs`【32】（清单渲染、撤回按钮的确认框、确认后真调
`delete()`、取消不发请求、清单跟着刷新、删除失败讲清楚原因）；`check-staff-page.mjs`
【28】（`staffPruneBossGifts()`：无 `giftId` 不发请求、云端没了的移除＋toast 用词准确
「收回」不是「扣钱」、云端还在的留着当对照组、手动记录不受影响、触发时机的静态检查——
`saveTx` 后 2.5 秒那行不含它、`visibilitychange`／`staffSyncMode()` 那两行含它）。

### 本地也记一笔支出：老板自己的账户余额要跟着少（2026-09-09，同一天追加）

用户发现的缺口："我那个钱转过去了，我这个余额也要跟着减少啊，就像公司账一样"——原本
`sendBossCashGift()` 只写 Firestore，完全不碰 `data.transactions`，钱明明是从老板自己
口袋出去的，主 App 里任何账户的余额都不会跟着减少。这跟公司账那边"转钱给他"会在**服务端**
镜像 Yang 的备用金余额是类似的效果（`renderAccCards()` 那段"转钱给 Seryi/Kuang 的现金实际
是从 Yang 手上出的"注释），但这次要的是同一个效果发生在**本地 `data.transactions`**——
老板账没有服务端权威余额这回事，只能在发送这台设备上记一笔。

**币种下拉换成账户下拉**：弹窗里原本 `#boss-cash-gift-cur` 是独立的币种 `<select>`
（选项来自 `CUR_SYMBOLS`），这次改成 `#boss-cash-gift-acc`（选项来自 `data.accounts`，
预填 `bossCashGiftAccountId()` 记住的上次选择，没存过默认选第一个非公司账户）——**币种
不再单独选，直接取被选中账户的 `currency`**。这样从设计上就杜绝了"账户是 USD、却选了
HKD 送出去"这种货币对不上的输入错误（那次 KUANG 收错币种的事故，根源正是币种是独立选
的、跟哪个账户没关系，人容易选错）。`bossCashGiftEcho()`（即时回显）也跟着改成读选中
账户的 `currency`。

**新增默认分类 `cat_cash_gift`**（🤝 给同事现金，`DEFAULT_DATA.categories`）：
`migrateCategories()` 会在下次 `loadData()` 时自动帮所有现有用户补上，不用额外写迁移代码
（见"高频操作 1"）。

**`sendBossCashGift()` 送出成功后**（`await db.collection('boss_cash_gifts').add(payload)`
resolve 出的 `docRef` 带 `.id`）紧接着 `data.transactions.push({...giftId: docRef.id})`
记一笔支出，`accountId` 是选中的账户、`categoryId: 'cat_cash_gift'`、描述带收件人和备注、
`saveData()`，然后 `renderOverview()`（不是只调 `renderOvBossCashGift()`——账户卡片
`renderAccCards()` 也要跟着刷新余额）。**`giftId` 字段是关联桥梁**：跟同事版
`staffSyncBossGifts()` 存 `topup.giftId` 是同一个设计语言，这边对应的是本地
`data.transactions` 那条记录。

**撤回联动**：`deleteBossCashGift()` 删掉 Firestore 那份文档成功后，按
`t.giftId === 那个被删的 docId` 在 `data.transactions` 里找回对应的支出，找到就照抄
`deleteTxById()` 的写法 `tombstoneTx(id)` + 从数组里过滤掉 + `saveData()`（**铁律没有
例外**：每一处从 `data.transactions` 移除记录的地方都必须调 `tombstoneTx`，漏了这步云
同步合并时这笔"撤销的支出"会复活）。**找不到就静默跳过，不报错**——可能是这台设备不是
当初发送那台、或者本地记录已经被别的方式清掉，Firestore 那边已经删成功了，本地这步只是
尽力而为的配套动作。

⚠️ **这笔支出只存在发送那台设备上，换一台设备或者本地数据被清过就不会出现在别的设备上**
——这不是 bug，是这个功能从一开始就没有"服务端权威余额"这个设计（跟备用金不一样，备用金
的权威数在 butler 服务端）。以后维护的人别去"修"这个"缺陷"。

自检：`check-expense-company.mjs`【31】追加（账户下拉取代币种下拉、默认预选、选中账户
记住、送出成功后本地多一笔支出且字段都对、账户卡片余额确实少了这笔、Firestore 送不出去
时本地不留痕迹）；【32】追加（撤回联动删掉本地支出、真的走了 `tombstoneTx`、余额恢复、
本地没有对应交易时撤回照样成功不报错）。

### person 大小写不敏感（2026-09-09 生产 bug，同一天补的）

真实故障：老板送礼物时 `person` 填的是 `KUANG`（全大写，弹窗里手打的自由文本），
同事端 `staffIdentity.reporter` 是服务端身份识别给的固定值 `Kuang`（首字母大写）——
两个值来自完全不同的输入源，`staffSyncBossGifts()` 原本用精确字符串比对
（`d.person !== me`），大小写不一致就判定「不是给我的」，**礼物永远同步不过去，且没有
任何提示**：老板以为送了，同事以为没收到，两边都不知道发生了什么。这正是 CLAUDE.md
反复强调要杜绝的"沉默失败"。

修法：新增 `samePersonName(a, b)`（`String(a||'').trim().toLowerCase() === String(b||'')
.trim().toLowerCase()`），`staffSyncBossGifts()` 和 `staffPruneBossGifts()` 两处比对
`person` 的地方都改用它——**以后任何新增比对 `person` 的地方也要走这个函数，不要再直接
用 `!==` 比**。连带把 `staffPruneBossGifts()` 的查询从「服务端 `where('person','==',...)`
精确匹配」改成「只按口令拉全部记录，客户端用 `samePersonName` 筛」，因为 Firestore 查询
做不了大小写不敏感比对（这个人带 `giftId` 的记录量很小，不用担心效率）。主 App 端
`sendBossCashGift()` 存 `person` 时本来就有 `.trim()`（只去空格，不强制大小写，保留用户
输入原样方便他自己认），这次没有再改。

自检：`check-staff-page.mjs`【27】追加一条（云端 `person:'  SERYI  '` 大小写+空格都不
一样，也照样同步进 `staffSyncBossGifts()`）；【28】追加一条（`staffPruneBossGifts()` 同样
场景下也认得出是自己的、不会被误删）。

### 「给谁」改成固定下拉（2026-09-09，同一天再追加）

同一次 KUANG 大小写事故的另一半修法——`samePersonName` 治好了"比对时不分大小写"，
但没治好"一开始就打错"这件事本身。用户明确要求："直接把同事名字固定在名字列表里面吧
我点开就能选，省得手残"。`#boss-cash-gift-person` 从 `<input list=... >`（自由文本 + 自动
补全 datalist）改成 `<select>`，选项来自 `getCompanyPeople()`（跟公司报账人共用同一份
服务端名册，排除 `code==='Boss'`）——从设计上让"打错名字"这件事变得不可能，不是靠比对
兜底。连带删掉不再需要的"记住用过的名字"辅助逻辑（`bossCashGiftNames()`/
`rememberBossCashGiftName()`/`expenseTracker_bossCashGiftNames`），改成固定名册后这套
自由文本辅助完全没用了。

### 首屏卡片「最近」没跟着撤回一起消失（2026-09-09）

用户实机撤回一笔之后，Overview 卡片（`#ov-boss-cash-gift`）「最近」那行还显示已经撤回的
那笔——查下来 `deleteBossCashGift()` 只处理了 Firestore 文档删除和本地那笔支出
（`tombstoneTx`），完全没碰卡片读的那份**独立**本地日志 `bossCashGiftLog()`
（`logBossCashGift()`/`renderOvBossCashGift()`）。

新增 `forgetBossCashGift(id, g)`：优先按 `id` 精确摘除（`sendBossCashGift()` 现在会把
`docRef.id` 一并存进 `logBossCashGift({id: docRef.id, ...})`）；对没有 `id` 的老记录
（这次修复上线之前送出的）退回按「人名+金额+币种」摘除兜底。`deleteBossCashGift()` 撤回
成功后调用它。另外在卡片上加了一个手动「清除这行显示」的兜底链接
（`clearBossCashGiftLog()`）——纯本地显示缓存，不涉及金额，不用二次确认，给万一摘不掉的
极端情况兜底（比如兜底匹配也没对上）。

### 两个必须手动建的 Firestore 复合索引（2026-09-09，容易漏掉，务必记住）

`boss_cash_gifts` 集合上有**两个不同形状的查询**，各自需要一个独立的 Firestore 复合索引，
**Console 不会自动建**，且这类索引缺失在浏览器里的 mock 测试**完全测不出来**（mock
Firestore 不做真实的索引校验），只有连真实 Firestore 才会报 `FAILED_PRECONDITION`：

1. `refreshBossCashGiftRecent()`：`where('k','==',X).orderBy('at','desc').limit(10)` →
   需要 `(k ASC, at DESC)`。
2. `staffSyncBossGifts()`：`where('k','==',X).where('at','>',Y)` → 需要 `(k ASC, at ASC)`
   ——**跟上面那个方向不一样**，Firestore 对索引方向要求很严格，`(k,at DESC)` 那个索引
   救不了这条查询。

这两个索引都**没建**的时候会怎样：`refreshBossCashGiftRecent()` 的 catch 块把
`FAILED_PRECONDITION` 也归类成"连不上云端"（跟真的网络问题显示同一句话），完全看不出是
索引问题；`staffSyncBossGifts()` 的 catch 块更狠——直接 `return`，**安静跳过**，连一个
错误提示都没有。这是 2026-09-09 那次"同事收不到钱"排查里，比 `person` 大小写更隐蔽的
第二个真根因：光修好大小写比对，**这套自动同步从功能上线起就没有真的跑通过一次**，因为
查询本身一直在被 Firestore 拒绝。

排查手法：拿 Firebase 的 REST API（`identitytoolkit.googleapis.com` 匿名登录换
`idToken`，然后打 `firestore.googleapis.com` 的 `runQuery`），照抄前端实际发的查询形状去
跑一遍，`FAILED_PRECONDITION` 的报错里会带一个"点这里建索引"的直达链接
（`console.firebase.google.com/v1/r/project/.../indexes?create_composite=...`），比自己去
Console 手动填字段可靠。**这个排查方法比"看代码猜"快得多，以后同一类"查询在 mock 测试
里全绿、真实环境却报错"的故障都可以先用这招**。

### 并发重复计入（2026-09-09，索引建好之后才第一次显现的 bug）

索引建好、`staffSyncBossGifts()` 第一次真的能拉到数据后，用户实机踩到：转一笔 5000，
同事端卡片显示**两笔**5000、总额变成 10000。根因：这个函数（还有反方向的
`staffPruneBossGifts()`）挂在多个触发点上（2.5 秒轮询、`visibilitychange`、切进「老板账」
tab 的 `staffSyncMode()`），几乎同时触发时，两次调用会各自从 `localStorage` 读到同一份
「还没处理过」的旧 `seen` 状态，都判断「这是新的」各加一次。**这个并发 bug 从函数写出来
那天就存在，只是前面那个索引缺失让查询每次都提前失败、从没有机会真正跑到会重复的那一步
——直到索引修好，这条路径才第一次被真正跑通，也是这条路径的并发问题第一次显现。**
教训：一个必要条件长期不满足会把它依赖的下游 bug 一起"雪藏"起来，修好上游之后要预期
下游可能藏着从没暴露过的问题，不能因为"之前一直没事"就掉以轻心。

修法：加一把两个函数共用的锁 `bossGiftsOpBusy`（module 级变量，函数入口检查+设
true，`finally` 里解开）——任一个在跑时，另一个直接放弃这次，等下一轮触发再试，不需要
排队重跑。两个函数共用同一把锁，因为它们读改的是同一份本机存储
（`loadBossCash()`/`saveBossCash()`），不能让"发现新的就加"和"发现没了的就删"同时改。

自检：`check-staff-page.mjs`【27】追加——故意把 mock 的 `.get()` 拖慢 100ms，
`Promise.all` 同时触发两次 `staffSyncBossGifts()`，验证同一笔礼物只计入一次、总额不翻倍
（不加这个延迟的话，两次 `page.evaluate` 本身的网络往返时间可能刚好错开，测不出没锁时的
真实故障）。

用户实机复位：本地已经重复计入的数据要用卡片上的「重填」按钮清掉重来，索引和锁修好之后
**不会自动改正历史上已经错的本地数据**。

### 弹窗显示「给了多少 / 他花了多少 / 还剩多少」（2026-09-09，⚠️ 下面这套算法已被
「代管账户」那次改版取代，见本节最后新增的大段——「还剩」不再是「给了－花了」现算，
改成直接读代管账户余额；「他花了多少」也不再跟「从哪个账户出」那个下拉挂钩。
这一段留着只是记录当时为什么这样设计，历史脉络，不代表现在的实现）

用户要求：给了现金之后，不想每次都要去问同事或看他手机才知道花了多少。新增
`refreshBossCashGiftPersonSummary()`，「给谁」下拉一变就重算：
- **给了多少**：现查 `db.collection('boss_cash_gifts').where('k','==',k).get()`（只按口令
  一个等值条件，不需要额外建索引），客户端用 `samePersonName` 按选中的人筛加总——**故意
  不在 Firestore 查询里加 `where('person','==',...)`**，理由跟 `staffPruneBossGifts()`
  一样：服务端精确匹配认不出大小写不同的历史记录。
- **他花了多少**：来自同事投递箱收进来的账（`tx.fromStaff.by`），**只统计已经收件、且
  落在「从哪个账户出」那个账户里的部分**——这个数字**没有服务端权威性**，只是"这台设备
  上最后一次点「立刻收件」时看到的情况"，界面文案特地写成「已收件的部分」，不能让人以为
  这跟同事手机上「手上现金」卡那个实时数字是同一回事。锁定同一个账户是因为这个功能设计
  上就假设"投递箱收 Kuang 的账"跟"给现金用"是同一个账户（2026-09-09 用户确认过这个
  假设成立）——如果哪天两者不再是同一账户，这个数字会算错，需要重新设计。
- **还剩** = 给了 − 花了，不做任何汇率换算（两边金额都在同一个账户的币种下）。
- 没登录（`!currentUser`）时，「他花了多少」是纯本机数据依然显示；「给了多少」查不到会
  说明原因，不是整段消失。

自检：`check-expense-company.mjs`【33】（大小写不同也认得出、换人重算、换账户重算且币种
跟着变、未登录时本机数据仍可见）——⚠️ 这条自检**已经被下面「代管账户」那次改版重写**，
【33】现在测的是新算法，不是这里描述的旧算法，别被这段文字误导去改代码对齐旧行为。

## 代管账户：给现金不是支出，是转账（2026-09-09，同一天再改一版，取代上面「弹窗显示」那节）

### 为什么给现金不是支出——重复计账的算式

用户实机发现的记账逻辑错误：`sendBossCashGift()` 原本送出成功后，在「从哪个账户出」
那个账户记一笔**支出**。这是错的：给同事现金不是「花掉」，是「过给他保管」，真正的支出
发生在他花掉的那一刻——而那一笔本来就会经「同事投递箱」（`fetchInbox()`）回到老板账上，
记成**另一笔独立的支出**。于是：

```
给 5000（记支出 5000） + 他花掉 3000 报回来（再记支出 3000） = 账上显示花了 8000
实际只花了 3000，还有 2000 在他口袋里等着还——账上多算了 5000
```

用户原话：「我钱给他不能算是我花掉的，只是过给他，他那个行程结束还是要回来我这里的，
不要搞到到时总账乱掉」。

### 代管账户机制：一进一出，净额为零

给现金＝**从源账户转到一个「在 X 手上」的代管账户**；同事花的钱从代管账户扣（不再扣
老板的主账户）；代管账户余额＝他手上还剩多少＝该还回来的钱；还钱＝转回来。三个函数：

- `normalizePersonKey(person)`：`trim().toLowerCase().replace(/[^a-z0-9]+/g,'_')`——
  跟 `samePersonName()` 同一条精神（大小写/空格不敏感），但这里要产出**可比较的 key**，
  不是布尔比较结果，所以没有让一个函数调另一个，是两个独立实现。
- `holdingAccountId(person)`：`'acc_hold_' + normalizePersonKey(person)`——**稳定可
  推导**：同一个人（不管当次输入的大小写/空格）永远算出同一个 id。这是「同一个人第二次
  转钱复用同一账户、不重复建」的全部依据，没有另外存一张「人名 → 账户 id」的映射表。
- `getOrCreateHoldingAccount(person, currency)`：`getAcc(id)` 命中就直接用，没有才
  `push` 一个新账户（`{id, name:'在 X 手上', currency, color:'#f59e0b', isHolding:true,
  createdAt}`）。**懒创建**：名册里没转过钱的人不会平白多出一个账户（2026-09-09 用户
  明确要求：「没转过钱的人凭空多出一个空账户只会让账户列表变乱」）。

**对名册里每一个人都必须通用，不许写死人名**（2026-09-09 用户中途追加的硬要求）：
账户 id/名称、投递箱路由、还钱按钮，全部按传入的 `person` 参数动态生成，`getCompanyPeople()`
名册（正本 butler `config/people.json`）以后加人/改名，这边不用改一行代码。`holdingAccountId`
函数本身没有任何 if/switch 分支去特判某个具体的人名——这是保证通用性的关键设计，不是
测出来才发现通用，是从函数签名上就不可能写死。

**币种一致性检查**：代管账户的 `currency` 只在第一次创建时按源账户定死。`sendBossCashGift()`
里在真正送出前会检查：如果这个人的代管账户已经存在、且币种跟这次选中的源账户不一致，
直接挡住并说明原因——宁可挡住也不许让转账两条腿的金额同一个数字代表不同货币（那就是
编了个错的 1:1 汇率，CLAUDE.md 记帐铁律不允许）。`repayBossCashGift()` 还钱时同样检查
接收账户币种要跟代管账户一致。

### 送出时记两条腿（`sendBossCashGift()`）

Firestore 那一步完全不变（写 `boss_cash_gifts`，字段不变）。本地记账从「一笔支出」改成
**一对转账**，两笔都带同一个 `giftId`（Firestore doc id）和 **`xfer: true`**：
- 源账户：`type:'expense'`，`categoryId:'cat_cash_gift'`（沿用原有分类），`xfer:true`
- 代管账户：`type:'income'`，`categoryId:'cat_cash_gift_in'`（新增的默认分类，🤝 代管
  现金转入，`migrateCategories()` 自动帮现有用户补上，见"高频操作 1"），`xfer:true`

两笔金额永远相等（同一个 `amount` 变量），这正是"一进一出，净额为零"的实现方式——不是
"净额算出来为零"，是从代码结构上根本没有第三条腿能让它不为零。

### 撤回把两条腿都撤掉（`deleteBossCashGift()`）

原本只 `find` 一笔（`t.giftId === id`），改成 `filter` 找**全部**匹配的记录（会是两笔），
每一笔都过 `tombstoneTx(t.id)` 再从数组移除（铁律没有例外：每一处从 `data.transactions`
移除记录的地方都必须调 `tombstoneTx`）。**这个改动天然兼容新旧两种数据**：老数据（改版
前送出的）只有一条腿、没打 `xfer`，`filter` 照样找到那一条、撤那一条，代码完全不用区分
「这是新格式还是老格式」。

### 投递箱按人路由（`fetchInbox()`）

同事报回来的账带 `fromStaff.by`（人名）。收件落账时：`holdAcc = getAcc(holdingAccountId(
personName))`，有就落进 `holdAcc.id`，没有才落回 `getInboxAccountId()`（设置页配置的
默认账户，行为跟改版前一样）。**这正是修掉重复计账的关键一半**：他花的钱从"他手上那笔
钱"里扣，不是又从老板主账户扣一次。设置页「同事投递箱」说明文字加了一句讲清楚这件事，
免得用户以为下拉选的账户对所有人都生效。

**连带修的一个关联 bug**：`inboxOwedByPerson()`（"该付同事"名单，首屏投递箱设置区块）
原本假设投递箱收进来的支出都是"同事自己先垫的钱"——这个假设在同事有代管账户之后不再
成立（他花的是老板早就转给他的钱，不是自己垫付，老板不欠他这笔）。已加
`(getAcc(t.accountId)||{}).isHolding` 排除，否则同一笔钱会被"该付同事"名单又算一次
"欠他"，是这次代管账户机制要消灭的重复计账问题的另一种变形。**这条不是原始需求列出来
的，是实现过程中顺着既有代码路径查出来的关联正确性问题，一并修了**。

### `xfer` 在三类用途上的区别（这是以后最容易改错的地方，务必谨慎）

带 `xfer:true` 的记录**不能**被算进「本月支出」「本月收入」这类**汇总数字**，但要照常
出现在**明细列表**里。三类用途不能一刀切：

1. **账户余额**（`renderAccCards()`、`holdingBalance()`、PDF 账户明细的期初/期末余额、
   `buildStatementPDF()` 的 `incomeTotal`/`expenseTotal`）：**必须照算 xfer**，不然代管
   账户就没有余额、源账户也不会因为转出去而减少——这是整套设计的地基。**账户明细 PDF
   刻意没有排除 xfer**：那份 PDF 的存在意义就是"期初＋收入－支出＝期末"这条恒等式要
   对得上（读者会核对这几个数字），是彻头彻尾的"账户余额"类用途，不是"这个月我花了
   多少"的印象式汇总——把它也排除 xfer 会让"支出汇总"表的总计跟"期末余额"对不上，
   看起来像做错了账，比不排除更糟。这是**刻意的决定**，不是漏改。
2. **收入/支出汇总**（`renderOverview()` 的 `#ov-income`/`#ov-expense`、`renderAnalytics()`
   的 `#an-income`/`#an-expense`/`#an-net`、分类占比饼图 `expTxs`）：排除 `xfer`。这正是
   用户抱怨的核心那几个数字。
3. **明细列表**（`renderTxList()`、CSV 导出 `exportCSV()`）：照常显示，不做任何过滤——
   用户得看得到这笔钱什么时候过给谁了。

### 还钱不碰 Firestore（`repayBossCashGift()`）

弹窗人员摘要旁边新增「他还钱了」按钮：`prompt()` 问金额（默认带入
`bossCashGiftRemain`——代管账户当前余额，跟屏幕上显示的「还剩」**必须是同一个变量**，
不能一个用旧算法一个用新算法，那种不一致最难查），校验参照 `sendBossCashGift()`（>0、
单笔上限 999,999），币种要跟代管账户一致，`confirm()` 二次确认，然后记一对反向转账
（代管账户 `expense`、接收账户 `income`，都 `xfer:true`）。**全程不碰 `db.*` 任何方法**
——`boss_cash_gifts` 集合记的是"给出去"这件事本身（一条 Firestore 文档对应一次转账
动作，用来同步给同事看），不是一本可以反复改的余额账本；还钱只是本地两个账户之间的
记账动作，没有必要（也没有对应的服务端集合）去同步这件事。**这条决定容易被后来者误会
成"漏同步了"，注释里已经写明白，别加回去**。

### 弹窗摘要改用代管账户余额（`refreshBossCashGiftPersonSummary()`）

「还剩」不再是"给了－花了"现算（那套只测过一个账户绑定的口径，换账户会跟着变、也没有
真实的账户余额撑腰），改成 `holdingBalance()` 直接读代管账户余额——**这是权威数字**，
`repayBossCashGift()` 的默认带入值就是它，两处引用同一个变量 `bossCashGiftRemain`。
「他花了多少」改成"代管账户里非 `xfer` 的支出"（同事报回来的账、或者老板直接记在这个
账户上的支出），不再跟"从哪个账户出"那个下拉挂钩——**换账户不再影响这个人的摘要**，
这是跟改版前刻意不同的行为（代管账户按人独立，天生跟"这次准备从哪个账户转钱"无关）。
「给了多少」不变，仍查 Firestore（跨设备权威总数，客户端按 `person` 筛、大小写不敏感）。

### 老数据兼容（不做自动迁移）

用户账上已经有一笔按旧方式记的「给同事现金」支出（`cat_cash_gift`、有 `giftId`、**没有**
`xfer` 字段、也没有对应的代管账户那条腿）。**没有写自动迁移**（悄悄改用户的账目风险
太高）：
- 这笔老记录不会让任何地方报错——它照常出现在明细列表和账户余额里（没打 `xfer`，所以
  会被"本月支出"算进去，这是它唯一跟新记录不一样的地方：会继续被当成一笔真实支出算，
  直到用户自己处理）。
- 撤回它（`deleteBossCashGift()`）能正常撤掉——`filter(t.giftId===id)` 天然兼容只有
  一条腿的老数据。
- **给用户的建议**（转告他）：那笔旧记录如果对应的同事已经把钱花完/报回来了，直接留着
  当一笔正常支出不用管；如果钱还在同事手上、之后会陆续报账或者还回来，建议手动删掉那笔
  旧记录，改用新版「给同事现金」重新转一次（会自动建代管账户、正确反映"还剩多少"）——
  不建议手工拼凑代管账户的初始余额，容易拼错。

### 自检

`check-expense-company.mjs`【31】（重写）自动建代管账户、两条腿方向和字段都对、源账户
余额减少+代管账户余额增加、汇总排除 xfer 但明细照常显示；【32】追加新格式（两条腿）
撤回场景，跟老格式（一条腿）的场景在同一份测试里对照着跑；【33】（重写）弹窗摘要改用
代管余额、换账户不再影响摘要、「他还钱了」的 prompt 默认值/币种校验/两条腿方向/不碰
Firestore；新增【34】专门测"对每个人都通用"——**同时测 Kuang 和 Seryi 两个人，每一条
都配对照断言**（给 A 转钱只有 A 的余额变、B 完全不受影响；投递箱路由到 B 只扣 B 的、
A 不受影响），因为只测一个人的话"所有人共用同一个代管账户"这种严重错误也会全绿。

## 同事「一键归还」（2026-09-10）

用户要求：同事手上有代管账户余额时，不用等老板在 App 里手动点「他还钱了」，同事自己
一点就能把钱还回去，老板那边（打开「给同事现金」弹窗时）马上看得到。

### 为什么走投递箱，不新开 Firestore 权限

同事的 Firestore 权限只有「往 `inbox_boss` 新增一条」（`firestore.rules`）。投递箱
payload 里的 `tx` 是**一整串 JSON 字符串**，规则只校验它的长度、不校验里面有什么
字段——这正是「同事把自己那笔删了」（`op:'delete'`）当初能够不改规则就上线的原因
（见上面「同事投递箱」那节）。「一键归还」照抄同一条路：payload 形状不变
（`k`/`from`/`tx`），只是 `tx` 字符串里多个 `op:'repay'`。**改规则要用户去 Firebase
Console 手动贴一次，能不改就不改**，这是选这条路而不是新开一个集合/新加字段的
唯一原因。

同事端（`tools/build-staff-page.py`）队列没有复用 `STAFF_BOSS_QUEUE`（那个队列存的是
`data.transactions` 里某笔账的 id，`flushBossQueue()` 靠这个 id 去账本里捞完整交易）
——「归还」这个动作根本不对应 `data.transactions` 里的任何一笔（见下面为什么），所以
新开一个独立队列 `STAFF_BOSS_REPAY_QUEUE`（`loadRepayQueue()`/`saveRepayQueue()`），
存的是归还动作本身的 payload（`{id, amount, date}`），走法完全照抄
`STAFF_BOSS_DEL_QUEUE`（删除请求也不对应本机任何交易，是同一类问题）：
`submitInboxRepay()` 送、`flushRepayQueue()` 补送、`online` 事件和 `staffStart()`
都会触发一次。

### 为什么本机不能记进 `data.transactions`

`saveTxInner()` 末尾有个钩子 `onTxSaved(tx)`——只要 `data.transactions` 里多一笔
`accountId === STAFF_BOSS_ACC_ID` 的记录，它就会自动把这笔账送进投递箱当成「同事记的
一笔账」。如果归还也塞一笔进 `data.transactions`（哪怕类型是收入），会被这个钩子
当成一笔新账**再送一次**投递箱，变成同事凭空多报了一笔账。所以本机余额改用「往
`loadBossCash()`/`saveBossCash()` 的 `topups` 数组里塞一条负数记录」来反映
（`{date, amount: -amount, repay: true}`）——`bossCashLeft()`/`renderBossCash()`
算 `got` 总额时本来就是把 `topups` 全部加总，负数记录自然而然把余额减下去，
不需要额外的减法分支。清单里这条负数记录按 `t.repay` 标记改显示成「归还 −X」的人话，
不是裸露的负数（`renderBossCash()` 的 `rows` 渲染那段）。

`bossCashLeft()` 是从 `renderBossCash()` 里抽出来的独立函数——「按钮要不要出现」
「prompt 默认值」「校验上限」三处都要用**同一个**当前余额数字，不能各自重新算一遍公式
（那种不一致最难查，跟老板端 `bossCashGiftRemain` 的同一条注释是同一个教训）。

### 老板那边不能落进普通消费入账路径（`fetchInbox()`）

同事那边送来的 `tx` 字符串里 `op:'repay'`，老板 `fetchInbox()` 收件时必须在进入
「普通消费」入账分支**之前**认出它，否则会把「他归还了」记成「他又花了一笔钱」——
代管账户余额不减反增，钱凭空消失。正确做法是记一对跟 `repayBossCashGift()`
（老板手动点「他还钱了」）**完全一样**的转账：代管账户 `expense` + 目标账户
（`bossCashGiftAccountId()`，跟手动按钮用的是同一个）`income`，两条都 `xfer:true`。

**幂等**：两条腿都带同一个 `repayId`（`'ix_repay_' + srcId`），收件前先查
`data.transactions.some(t => t.repayId === repayId)`，命中就只清箱子、不重复记账——
理由跟正常收件用 `id='ix_'+srcId` 去重是同一条（`doc.ref.delete()` 可能失败，
同一份文档会被下次收件重新看到）。

**币种不一致 / 没有代管账户，两种都不许硬记**（宁可多按一次也不能记错钱）：
- 代管账户不存在（理论上不该发生，同事手机上有余额就代表老板转过现金、代管账户
  该已经建好了）。
- 代管账户币种 ≠ `bossCashGiftAccountId()` 那个目标账户的币种——记两条腿的转账
  要求两条腿同一个金额数字代表同一种货币，币种不同却硬记等于凭空编了个 1:1 汇率。

两种情况都**不调用 `inboxDrop(doc)`**——文档留在箱子里，下次收件还会再看到、
再次尝试（万一老板换了目标账户币种就能自动补上），并且 toast 明确提示「用
「💰 他还钱了」按钮手动处理」。这是刻意的「留而不删」，别当成 bug 改成丢弃。

### 「马上」看得到的真实时效

`openBossCashGift()`（打开「给同事现金」弹窗）现在会顺手静默调一次 `fetchInbox()`
（不传 `{loud:true}`），收完再刷新弹窗里的「给了/花了/还剩」摘要。**这不是推送**：
同事一点「一键归还」，老板的手机不会自动响、也不会有系统通知——真实时效是「老板下次
登录 / 开 App / 手动点『立刻收件』/ 打开这个弹窗时，会去 Firestore 收一次」。收件
失败（没网/没登录/规则没贴）不会打断弹窗本身的正常使用（`fetchInbox()` 内部本来就
把这些情况都 catch 掉，静默返回，`openBossCashGift()` 外面再包一层 `.catch(()=>{})`
兜底）。

### 老数据 / 边界情况

- 坏数据（金额 ≤0、日期格式不对）当垃圾丢掉（会调用 `inboxDrop`），不堵住箱子——
  跟正常收件的垃圾数据处理是同一条逻辑，只是校验挪到 `op==='repay'` 分支内部做
  （因为归还请求的字段形状跟正常记账不完全一样，不能套用外层那道通用校验）。
- 同一批收件里「归还」和「普通消费」互不干扰：对照组测试专门验证过普通消费不会
  被新逻辑误判成归还（分支判断先看 `raw.op`，不会漏判）。
- **老板端有第二道金额关**（2026-09-10 验收补的）：`amt > holdingBalance(holdAcc) + 0.005`
  就不入账（`repayOver` 计数，弹提示，**不删文档**）。金额是同事那台手机报上来的，
  本机这份账才是正本；硬记会把代管账户记成负数，总账就乱了。时序上不会误挡——同一批
  里归还先处理，他新花的钱还没扣，这时余额只会偏高。
- ⚠️ **版本错位的坑（上线时要提醒老板刷新一次 App）**：`op==='repay'` 的识别是这版
  才加的。如果同事那边已经更新、老板的 App 还停在旧版，旧版看不懂 `op`，会把这份
  文档当成一笔普通消费记掉（不打 `xfer`、也没有转回老板账户那条腿）——钱在代管账户
  里被「花掉」，却从没回到老板任何一个真实账户。协议层没有做最低版本判断，靠的是
  「老板先刷新」这个操作顺序。以后再改投递箱 payload 形状，要么加版本号判断，要么
  同样先让老板端上线、再放同事端的入口。

### 自检

`tools/build-staff-page.py`：新增 `bossCashLeft()`、`staffRepayBossCash()`、
`submitInboxRepay()`、`loadRepayQueue()`/`saveRepayQueue()`、`flushRepayQueue()`；
`renderBossCash()` 按钮列表加「💰 全部归还给老板」（`left>0` 才出现），清单行渲染
加 `t.repay` 分支。

`check-staff-page.mjs`【29】：余额 0/`>0` 时按钮出现与否、prompt 默认值＝当前余额、
payload 带 `op:'repay'`＋正确金额、本机余额立刻反映且不写进 `data.transactions`、
超过余额被挡、没网进队列不丢、网络恢复自动补送。

`check-expense-company.mjs`【36】：归还记成两条腿（不是消费）、金额与方向都对、
代管账户余额减少、目标账户「本月支出」不受影响；**对照组**——同一批收件里的普通消费
照旧记成不带 `xfer` 的支出，防止「把所有收件都当成归还」这种错误也全绿；幂等（同一笔
重复收到不重复记账）；币种不一致/没有代管账户两种情况都不硬记、文档留在箱子里、
toast 提示手动处理；坏数据当垃圾丢掉；打开「给同事现金」弹窗触发一次静默收件。

## 首屏卡片改显示真实进度 + 一次性搬旧记录进代管账户（2026-09-10）

### 卡片从「本地显示缓存」改成「真实账目」

`renderOvBossCashGift()` 原本第二行显示 `bossCashGiftLog()`（本地"最近转过谁多少"的
显示缓存），看不出钱现在的状态。改成遍历 `data.accounts` 里所有 `isHolding` 的账户，
对每个人现算「还剩」（`holdingBalance(acc)`，账户余额类用途照算 xfer）和「已花」
（该账户里 `type==='expense' && !t.xfer` 的合计，跟 `refreshBossCashGiftPersonSummary()`
弹窗摘要同一个口径），全部本地现算、不连网、**不写死任何人名**——这是跟
`holdingAccountId()` 同一条设计铁律。

- 人名从 `getOrCreateHoldingAccount()` 写死的账户名 `在 ${person} 手上` 里正则抠出来
  显示，没有另外存一个 `person` 字段（这个格式完全由我们自己控制，够稳）。
- 过滤条件是 `remain !== 0 || spent !== 0`——余额为 0 且从没花过的人（没转过钱、或
  懒创建但恰好没人用过的历史空账户）不显示，避免卡片被塞满。
- 人多时 `slice(0, 3)`，剩下的用「等 N 人」带过；一个符合条件的人都没有时退回原有的
  兜底文案「转给同事的现金，会自动进他们的「手上现金」卡。」。
- 没设口令那段完全没动。

**「清除这行显示」链接的取舍**：卡片显示的是真实账目、不再是缓存，这个链接不该再出现
在卡片这一行。但 `clearBossCashGiftLog()` 本身不删——`bossCashGiftLog()`／
`logBossCashGift()`／`forgetBossCashGift()` 这一整套仍在正常工作（`deleteBossCashGift()`
撤回一笔时仍会调 `forgetBossCashGift()` 清理这份 log，给"按 id 精确摘除"失败时的老记录
兜底），只是它的显示出口没了。挪到 `renderBossCashGiftModal()` 弹窗表单最下面，跟新增的
「🧹 整理旧记录」放在同一行、字号缩小、不显眼——留给"万一 `forgetBossCashGift()` 的兜底
摘除也没摘干净"这种极端情况手动清一下，不涉及金额，不用二次确认。`clearBossCashGiftLog()`
内部不再调 `renderOvBossCashGift()`（卡片已经跟这份 log 无关），改成 `toast()` 提示。

### 一次性搬家：`bossCashCleanupScan()` / `openBossCashCleanup()`

背景：代管账户是 2026-09-09 才有的。在那之前，投递箱收进来的账（带 `fromStaff.by`）
落在当时设置页配置的默认收件账户里，不在这个人的代管账户——导致「已花多少」从旧记录
开始就是残缺的（`renderOvBossCashGift()`／`refreshBossCashGiftPersonSummary()` 的「已花」
都是按代管账户里的记录现算，旧记录不在那个账户里，自然算不到）。

- **扫描**（`bossCashCleanupScan()`）：遍历 `data.transactions`，挑出「带
  `fromStaff.by`、这个人已经有代管账户（`getAcc(holdingAccountId(person))`）、且这笔
  当前不在那个账户里」的记录，按人分组成 `{person, holdAcc, move:[...], skip:[...]}`。
  `move` 是账户币种跟代管账户一致、真能搬的；`skip` 是币种不一致（或原账户已经不存在）
  不敢搬的——**宁可留着不搬，也不能把不同货币的数字硬凑在一起**，那就是编了个错的
  1:1 汇率，跟 `sendBossCashGift()`/`repayBossCashGift()` 那两道币种检查同一条精神。
- **入口**：弹窗表单最下面「🧹 整理旧记录」，跟「清除本机残留显示缓存」放一起，
  次要、不显眼（按用户要求）。
- **先预览再动手**（`openBossCashCleanup()`）：`confirm()` 里列出「谁、几笔、合计
  多少」，用户不确认什么都不做；一笔都能搬的都没有时**不弹确认框**，直接
  `toast('没有需要整理的旧记录')`（有跳过的会在这句后面附上跳过几笔，不默默吞掉）。
- **只改 `accountId`**：同一笔交易、同一个 id，不删不增——**不涉及 `tombstoneTx()`**
  （那是给"从 `data.transactions` 移除记录"用的，这里没有移除任何记录，只是把它挪到
  另一个账户名下）。改完 `updatedAt = Date.now()`（云端同步靠它）、`saveData()`、
  `renderOverview()`（首屏卡片＋账户余额）、`refreshBossCashGiftPersonSummary()`
  （弹窗摘要，若弹窗正开着）。
- **可重复点**：第二次点，能搬的都搬完了，会走「没有需要整理的」那条分支，不会重复搬
  （`bossCashCleanupScan()` 本身就是每次现扫描现算，扫不到已经在代管账户里的记录）。
- **不做自动迁移的例外**：这个功能本身就是一次性迁移工具，跟「代管账户」那节末尾
  「老数据兼容（不做自动迁移）」并不矛盾——那节说的是"不擅自静默改用户账目"，这个
  功能是用户自己主动点开、看过预览、确认过才动手，两者对"要不要事先给用户看清楚在
  改什么"的要求是一致的。

自检：`check-expense-company.mjs`【37】两段——首屏卡片一段（手算 fixture：转入 5000、
花 3000、还 500，断言"还剩 1500"；**对照组**：还回来的 500 是 xfer，不能被算进"已花"，
断言显示的是"已花 3000"不是"已花 3500"；余额 0 且没花过的人不出现；5 人时最多显示 3 个
+ 「等 2 人」）；整理旧记录一段（一开始什么都没有→不弹确认框+「没有需要整理的」；造
2 笔能搬 + 1 笔币种不一致的旧记录→扫描结果分组对、确认后只有能搬的 2 笔被搬走、
交易条数不变、跳过的那笔原地不动、提示里说明跳过几笔；重复点第二次不再弹确认框、
不再重复搬）。

## 归还后戳一下 butler-bot 发 Telegram 通知（2026-09-10）

同事按「一键归还」之后，老板的 Telegram 立刻收到一条提醒。做法是同事版页面在归还
**成功送进投递箱之后**，顺手打一次 butler-bot 的 `POST /cash-notify`
（`pingBossRepay()`，定义在 `tools/build-staff-page.py` 的 `STAFF_BOOTSTRAP` 里，
就在 `submitInboxRepay()` 上面；调用点在 `flushRepayQueue()` 里 `r.ok` 那一支）。

- **两条路是分开的，别搞混**：钱的记录走 Firestore 投递箱（老板收件才入账），
  通知走 HTTP 打 Worker。通知只是提醒，**跟钱没有关系**。
- **发完就忘**：不 `await`、不重试、不排队、失败一声不吭（`.catch(()=>{})`）。
  没网时通知会掉，但钱照样补送。反过来若为通知做重试队列，就得回答「通知重复了
  怎么办」，为一条提醒不值得。
- **认人靠钥匙，不靠请求里的名字**：送的是公司报账那把 `getCompanyToken()`，
  butler-bot 的 `/cash-notify` 用 `resolveAppCaller()` 按钥匙定人名，**丢掉请求里的
  `person`**——同事之间冒充不了。没填过公司报账钥匙的人就没有这条通知，属于正常降级
  （钱照样送）。
- **`left` 是「还完还剩多少」**：调用点在归还已经记进本地之后，`bossCashLeft()`
  这时算出来的就是还完之后的余额，正是老板要看的数。改动调用位置时要留意这点。
- 端点契约（`kind`/`amount`/`currency`/`left`/`note` 的范围与回应形状）正本在
  butler-bot 仓库的 `SETUP.md`，这里不复述。

自检：`check-staff-page.mjs`【30】——打对端点、带对钥匙与金额/币种、`left` 是还完
之后的数、不送 `person`、只戳一次；**两组对照**：没钥匙时不发通知但**钱照样送**、
通知端挂掉（fetch reject）时归还照样送出且队列不卡住、不冒 JS 报错。
