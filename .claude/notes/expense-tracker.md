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
  （expense-tracker-sw.js:1，2026-09-10 最新值 `'expense-tracker-v42'`，会持续往上升，
  以文件里实际值为准，这里数字不必跟着每次改动同步维护）。
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
## 老板账搬进 butler 中央账本（2026-09-11，用户拍板）

用户原话：「如果把这个勾去成公司账…因为公司账的基本上已经是完整的系统了」。
他看对了：这几天所有的乱，根因是**老板账两边各存一份、各自算**（同事手机一份、
老板手机一份），而公司账那套早就是「一本账在服务端」的形态，一个月没出过事。

### 三个要求（用户明确提的）
1. 同事的输入端不变 —— 同事版界面一个字没改
2. 导出的 PDF 保持现在这种 —— **一行都没动**（见下面「为什么同步进 data.transactions」）
3. 转现金套用公司账那一套 —— 用备用金（起点＋发放−开销），负数就是他垫的钱

### 两个自己定的默认
- **老板账和公司账是两本分开的账**（butler 的 `data/boss-expenses/` vs
  `data/company-expenses/`）。老板的私人开销绝不能出现在交给公司的 Excel 里。
- **老板账的备用金也另开一份**（`data/boss-petty.json`）。跟公司备用金混在一起，
  两边余额都会被对方的开销扣掉。

### 数据流
```
同事版 App ──POST /boss-expense──► butler: data/boss-expenses/YYYY-MM.json
                                        │
老板 App ◄──action:"ledger" 同步下来────┘   （唯一真相在 butler）
         └─ 改/删：先动账本，成功了才动本机
```
- 钥匙用**公司报账那把**（`APP_TOKEN_<名字>` / 老板的 `APP_SHARED_TOKEN`），
  服务端按钥匙判定记账人；页面上那个「老板账口令」退化成纯本地开关（填了才显示
  那个页面），同事看到的界面一个字没变。
- 收据照片存在 butler 私有仓库，网页下载不到 → `action:"photo"` 由服务端代取，
  路径死死钉在 `data/boss-expenses/photos/` 下（做 false-red 时发现自检的越界用例
  全是 .json 结尾、会先被副档名那道闸挡下，等于前缀那道闸没验到——已补 .jpg 用例）。

### 为什么同步进 data.transactions，而不是另存一份
明细、统计、月底账单 PDF 全都读 `data.transactions`。同步进去，这三样一个字不用改，
**PDF 的版式原样保住**（用户的要求 2）。这不是「又变回两边各存一份」——本机那份是
只读缓存，写永远先写 butler，冲突时以 butler 为准，而且：
- 账本里没有了的（`t.bossRec` 标记的）才删，**老板自己手记的账绝不碰**（自检有对照组）
- 删除要落 `tombstoneTx`，否则云端旧快照一合并又并回来
- 老板标的 `fromStaff.paidAt`（已付清）不会被同步冲掉——那是他这边的状态，账本不知道

### 第 3 步：转现金 ＝ 备用金（2026-09-11）

用户原话：「转现金那边就套用公司账那一套」。数据在 butler 的 `data/boss-petty.json`，
算法照搬 `petty_cash.js`（在公司账那边跑了一个月没出过事）：

    他手上还剩 =（起点 ＋ 老板转给他的 ＋ 调整）−（起点之后他记的全部开销）

**负数就是他自己先垫了这么多**——这是整次改造最重要的产出：垫付不再需要任何配平
记录、对账调整、抵扣腿（旧版那一套被用户当垃圾删掉过，一删账就乱）。转钱给他时
垫的钱自动被抵掉，也不用另外记一笔还款。

「起点」正好解决他踩过的坑：月中才开始记、之前的历史不在系统里。设起点＝「他现在
手上实际还剩多少」，那一刻之前录进来的开销不再扣（比的是记录的 `createdAt`）。

- **老板端**：设置 → 同事投递箱 那一块多一张「同事手上（老板的钱）」卡，
  点进去设起点／转钱／调整／撤销。函数全部 `bossPetty*` 前缀、DOM 也是独立一组
  （`#modal-boss-petty*`）——**刻意不跟公司备用金共用**：两本账的钱不一样，共用一组
  DOM 迟早会出现「在老板账页面按了转钱、结果记进公司备用金」那种查不出来的错。
  自检【33】有一条专门守这个（「一次都没打到公司账那条路」）。
- **同事端**：老板设了起点之后，「手上现金」卡**照抄服务端的数**，两边从此是同一个
  数字；本机那两颗按钮（收到现金／重填）跟着收起来——按了不会改变这个数，留着只会
  让人困惑。拿不到（没网／还没设起点）才退回本机算法。
- **转钱不收负数**（要往回收钱用「调整」）。**起点收负数，而且必须收**——
  2026-09-11 一度写成不许，当场卡住用户：Kuang 之前垫了钱，那些账在老板自己手机里、
  **不在这本新账本里**，备用金数不到。起点不让填负数的话这笔历史欠款就永远进不来，
  只能手工记在别处，那正是这次改造要消灭的东西。
  正路是：起点填 −（他垫的），再转现金 → 余额＝他手上属于老板的钱，垫的自动抵掉。
  ⚠️ 起点带进来的只该是**上线之前**那些垫付；上线之后同事在新系统记的账会自动扣，
  两边都算就是重复。

自检：`check-expense-company.mjs`【33】＋`check-staff-page.mjs`【29】，都做过 false-red。

### 还没设起点就转钱：一定要挡，不能静静写进去

2026-09-11 用户实机踩到，**这是最值得记住的一种失败形态**：他按了「转钱给 Kuang
5000」，事件确实写进 `data/boss-petty.json` 了，但没有起点就算不出余额（那是刻意的
设计：没有起点宁可空着，也不猜一个数），于是卡片上什么都没变——他以为没成功，
又按了一次，变成两笔 5000。**写得进去、却什么都不显示，最容易让人重复操作。**

三层都要挡：
1. 服务端 `bossPettyRecord()`：`type !== 'open'` 且该人没有 open 事件 → 回
   `needs_open`，一个字不写。（挡在这里是因为 App 那份页面可能开着好几天没重载。）
2. `bossPettySetType()`：没设起点的人选转钱/调整，直接拉回「设起点」并说明原因，
   那两颗按钮画成半透明。
3. `bossPettySubmit()` 收到 `needs_open` 时把人带到「设起点」，**弹窗不关**——
   关掉的话他还得自己找回来，又是一次「按了没用」。

另外 `bossPettyOpenAdd()` 里 `showBossPettyNote('')` 必须在 `bossPettySetType()`
**之前**：反过来的话，第 2 层刚写上的那句提示立刻被擦掉，画面上又变回「按了没反应」。

### 收进哪个账户：只在第一次收的时候决定

用户出国会另开一个账户（例如「日本行程」）再把设置里的收件账户改过去。
`syncBossLedgerMonth()` 里 `accountId` **只在新增那一支写**，更新那一支沿用原来的——
每次同步都写成「当前设定的账户」的话，上个月已经收在 Boss 账户里的记录会在下一次
同步时被整批搬进日本那本（同步窗口是本月＋上月），两个月的账当场混在一起，
而且他不会想到是「改了一个下拉」造成的。自检【21】有这一条＋对照组
（改完之后新收的那笔要进新账户，否则那个下拉等于没作用）。

### `bossRec` 也要进 saveTx 的白名单
`bossRec` ＝「这笔是账本里的哪一条」。它跟 `fromStaff`/`inbox` 一样是本机自己贴上去、
编辑表单管不到的字段，**编辑一笔账时不保住就会被抹掉**——那笔会变成无主记录，
下次同步账本那条又下来，同一笔变两笔。加这个字段时当场撞上这个坑，正是白名单那段
注释预告过的。

自检：`check-expense-company.mjs`【21】（同步/改/删/对照组/照片/连不上不清账）、
`check-staff-page.mjs`【22】（送去 /boss-expense 不是 /company-expense）；
butler 侧 `tests/boss-expense.test.mjs` 57 项。

**「这笔是谁记的」可以手动改**（2026-09-11 用户要求：「你要把我编辑过的改成他的账啊
不然永远少钱」）：编辑弹窗里多一栏 `#tx-fromstaff`（新增记录时不出现）。为什么需要它——
`fromStaff` 这个标记本来只在投递箱收件时自动盖上，一旦丢了（旧版编辑会抹掉它）或者是
老板自己代同事补记的一笔，就**没有任何地方能把它加回来**，欠他的钱永远少一截。
三个函数：`staffNameOptions()`（名单＝账本里出现过的名字＋`getCompanyPeople()`＋当前这笔，
排掉 Yang；**刻意不读 `#tx-company-reporter` 那个下拉**，那个只在公司账户下才渲染，
而要补标记的账多半记在普通账户里，读 DOM 会得到一张空名单）、`renderFromStaffPicker()`、
`fromStaffFromForm()`（回 `undefined`＝这一栏没出现，沿用旧值；`null`＝选了「我自己记的」，
拿掉标记；换人时**不带 `paidAt`**——付给 A 的钱不能算成付给 B，带过去等于白付一次）。
**同事版把这一栏整块删掉**（`build-staff-page.py` 里 `cut_between`）：那标记是老板端的东西，
同事改了也影响不到老板那边。元素没了两个函数都会安全 return，不用另外改代码。
自检：`check-expense-company.mjs`【32】＋`check-staff-page.mjs`【28】（同事版少了这一栏
不会崩）。

**编辑一笔账是「整笔换掉」，不是「改几个字段」**（2026-09-11 用户实机踩到）：
`saveTx()` 编辑分支做的是 `data.transactions[idx] = tx`，`tx` 只由表单拼出来，
所以**表单管不到的字段会被顺手抹掉**。当时的病征是：同事送来的两笔账，老板打开
补了张收据照片，存完「🙋Kuang记的」就没了——而「该付同事多少」正是数 `fromStaff`
算的，标记一丢欠款就少算。现在在那行前面用**白名单**逐个保住 `fromStaff` 和
`inbox`（不能用 `Object.assign` 整份合并：那样用户**故意清掉**的东西——例如按掉
收据照片——会自己回来）。**以后再加这种「本机自己贴上去、表单碰不到」的字段，
记得同步加进这份白名单**，自检 `check-expense-company.mjs`【31】带了对照组守着。

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

<!-- ⚠️⚠️ 从这里到本档末尾，绝大部分描述的是**已经被拿掉的代码** ⚠️⚠️ -->

> # ⚠️ 底下这一整段（到本档末尾）讲的功能在 2026-09-11 整套退回了
>
> 用户拍板：「你退回去 我让你改同事转账前的那个版本」。PR #571 把「给同事现金／
> 代管账户／一键归还／配平腿／paidFrom／本月合计／月底账单不列转账」整套退回到
> 2026-09-08 的状态。他给出的结论是：**「以后先赚钱给他们 不让他们垫付就好」**——
> 先付现金给同事，从源头上不产生垫付，就不需要这一整套。
>
> **所以下面提到的函数名，仓库里多半已经不存在了**（实测 2026-09-11：
> `holdingBalance` / `isPairedSpendLeg` / `staffSpendId` / `sendBossCashGift` /
> `personMonthSpend` / `bossCashLeft` / `paidFrom` / `convertOldOffsetToSettle`
> 全数为 0 处命中）。**动手前先 grep 一次，不要照着这些文字改代码。**
> 留着不删是因为：这套东西前后改了五、六版，每一版为什么被推翻都记在里面，
> 真要重做时这些是最贵的资料。
>
> **退回后仍然活着的，只有这三块**（读这几段可以放心）：
> - 「该付同事多少」：`isUnpaidStaffAdvance()` / `inboxOwedByPerson()` /
>   `inboxMarkPaid()`，靠每笔账上的 `fromStaff` 算（但**不含**上面写的 `staffSpendId` 那层）
> - 「二之一、同事的账有记录但没有账单」那节的收据照片压缩（2026-09-11 单独加回来的，
>   跟转账无关）
> - 投递箱本身（`submitInboxTx()` / `fetchInbox()` 的基本收件路径）

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
币种、收件人送出去——跟公司报账那条「分类归拢、汇率换算…一个字都不许在 App 里算」是
同一条精神。`amount` 也没有例外：写进 Firestore 的就是用户输入的**原始金额**（2026-09-09
到 2026-09-10 之间短暂加过"先抵欠款"规则会把这里改成净额，2026-09-10 用户实机跑完之后
明确要求拿掉，见下面「代管账户」那节——现在这里就是老老实实转述用户输入，跟这条铁律
完全一致，不是例外）。

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

## 代管账户：给现金不是支出，是转账（2026-09-09 建立，2026-09-10 二次改版，本节按最新模型改写）

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

**⚠️ 2026-09-10 用户再纠正一次**：上面这套「一进一出、净额为零」把源账户和代管账户的
余额算对了，但用户明确反对「同事花的钱记在代管账户里」这个设计本身：「我要的是全部整合
去对应的账户里，不然这样账会分开」。所以**同事实际花掉的那笔消费，明细必须出现在
「当初转钱出去的那个真实账户」里**，代管账户只在幕后配平、**不出现在账户列表/账户
切换器/首屏账户卡片**里。下面按这个最终模型描述，旧版本"同事花的钱记在代管账户"的
说法已经不对，别再照那套做。

### 代管账户机制：一进一出，净额为零（这部分没变）

给现金＝**从源账户转到一个「在 X 手上」的代管账户**；代管账户余额＝他手上还剩多少＝
该还回来的钱；还钱＝转回来。三个函数：

- `normalizePersonKey(person)`：`trim().toLowerCase().replace(/[^a-z0-9]+/g,'_')`——
  跟 `samePersonName()` 同一条精神（大小写/空格不敏感），但这里要产出**可比较的 key**，
  不是布尔比较结果，所以没有让一个函数调另一个，是两个独立实现。
- `holdingAccountId(person)`：`'acc_hold_' + normalizePersonKey(person)`——**稳定可
  推导**：同一个人（不管当次输入的大小写/空格）永远算出同一个 id。这是「同一个人第二次
  转钱复用同一账户、不重复建」的全部依据，没有另外存一张「人名 → 账户 id」的映射表。
- `getOrCreateHoldingAccount(person, currency)`：`getAcc(id)` 命中就直接用，没有才
  `push` 一个新账户（`{id, name:'在 X 手上', currency, color:'#f59e0b', isHolding:true,
  createdAt}`）。**懒创建**：名册里没转过钱的人不会平白多出一个账户。

**对名册里每一个人都必须通用，不许写死人名**：账户 id/名称、投递箱路由、还钱按钮，
全部按传入的 `person` 参数动态生成，`getCompanyPeople()` 名册（正本 butler
`config/people.json`）以后加人/改名，这边不用改一行代码。

**币种一致性检查**：代管账户的 `currency` 只在第一次创建时按源账户定死。选了一个不同
币种的源账户转钱会被挡住（`sendBossCashGift()` 里），宁可挡住也不许静静记错
（CLAUDE.md 记帐铁律）。

### `holdAcc.srcAccountId`——找回「当初转钱出去的那个真实账户」（2026-09-10 新增字段）

`sendBossCashGift()` **每次转账都会**把这次选中的源账户 id 写进
`holdAcc.srcAccountId`（不是只在第一次创建时写一次，因为老的代管账户可能一开始就没有
这个字段，每次刷新也顺便补上）。这是「同事花的钱该记进哪个真实账户」的全部依据。

找目标真实账户统一走 `holdingRealAccountId(holdAcc)`：
```
holdAcc.srcAccountId → bossCashGiftAccountId()（「给同事现金」弹窗记住的上次账户）
                     → getInboxAccountId()（投递箱设置的默认收件账户）→ null
```
三层都拿不到（理论上不该发生，账户列表不可能空）才返回 null，调用方（`fetchInbox()`、
`bossCashCleanupScan()`）都会再检查一次目标账户是否存在、币种是否跟代管账户一致，
不一致就当作「记不进去」处理，不硬记。

### 同事花钱现在记 3 条腿（`fetchInbox()`，这是这次改版的核心）

同事报回来的消费（普通消费，非归还非删除），如果这个人有代管账户，`fetchInbox()`
不再把消费单独记一笔进代管账户，而是记 **3 条腿**，共用一个 `staffSpendId`
（值就是这笔账自己的 `id`）：

- **真实账户（`holdingRealAccountId(holdAcc)`）支出**：真支出，**不带 `xfer`**，带
  `fromStaff`（谁报的账）、类别、描述、收据照片——**这就是用户要的"明细在真实账户里"**，
  没有 `staffSpendId` 之外的特殊标记，看起来就是一笔普通记录。
- **同一个真实账户 收入**：`xfer:true`，描述「X 用代管现金支付（配平）」——钱早就
  转出去了，不能因为这笔消费再扣一次真实账户余额，这条腿把上面那条支出抵消掉。
- **代管账户 支出**：`xfer:true`，描述同上——他手上代管的钱因此变少，这才是代管
  账户余额应该反映的东西。

净效果（转 5000、花 3000 为例）：真实账户余额净变化只有 −5000（转账 −5000，花钱那笔
−3000+3000 抵消）；代管余额 5000−3000=2000（他手上还剩多少）；「本月支出」（真实账户
视角）＋3000；消费明细出现在真实账户的明细列表里。

**没有代管账户的人**（老板没转过现金给他）维持改版前的行为：照旧只记一笔真支出进
`getInboxAccountId()`，**不加任何配平腿**——这是必须保留的对照情况，代码里
`if(holdAcc && !isIncome)` 这个分支判断就是两条路径的分岔点。

**收入类型不受影响**（少见，比如老板直接记他收到的钱），维持单笔入账，跟改版前一样。

**币种不一致时不许硬记**：真实账户找不到、或者币种跟代管账户不一致，计入
`holdCurMismatch` 计数、**不 `inboxDrop`**（文档留在箱子里，下次收件还会再看到），
toast 里会讲清楚。

**同事删除已送出的记录**（`op:'delete'`）：现在要连带删掉这 3 条腿——按
`t.id === id || t.staffSpendId === id` 找齐，**每一条移除都要单独调 `tombstoneTx(t.id)`**
（3 个不同的 id，缺一个云端合并时那一条会"复活"）。老格式（改版前送出、只有 1 条腿，
没有 `staffSpendId`）这个 filter 天然兼容，只会命中 1 条。

### `staffSpendId` 是判断"这是配平腿还是真支出/真还钱"的关键字段

这次改版新增的 `staffSpendId` 字段，跟已有的 `xfer`/`repayId` 一起，决定一笔交易在
各处统计里该不该被算进去，务必分清楚：

| 字段组合 | 含义 | 例子 |
|---|---|---|
| 无 `xfer` | 真实的收入/支出 | 消费明细腿一、没有代管账户的人的普通消费 |
| `xfer:true` + `staffSpendId` | 消费的配平腿 | 上面 3 条腿里的腿二、腿三 |
| `xfer:true` + `repayId` | 「一键归还」的配平腿 | 见下面「同事一键归还」那节 |
| `xfer:true`，两者都没有 | 「给同事现金」转账腿、老板手动点「他还钱了」 | `sendBossCashGift()`/`repayBossCashGift()` |

**「已花」要统计腿三**（代管账户里 `type==='expense' && (staffSpendId || !xfer)`
的合计）：`(t.staffSpendId || !t.xfer)` 这个 OR 条件很关键——`staffSpendId` 分支抓新
格式的配平腿，`!t.xfer` 分支当兼容抓还没点过「🧹 整理旧记录」的旧格式（那种消费仍然
直接、非 xfer 地躺在代管账户里）。两支互斥，不会重复计。
`renderOvBossCashGift()`（首屏卡片）和 `refreshBossCashGiftPersonSummary()`（弹窗
摘要）用的是同一个公式。

**「已还」要排除 `staffSpendId`**：代管账户里 `type==='expense' && xfer` 现在有两种：
配平腿（有 `staffSpendId`，代表"他花掉了"）和真正的归还（没有 `staffSpendId`，代表
"他还回来了"）。混在一起统计会把"花掉的钱"误算成"还回来的钱"，`refreshBossCashGiftPersonSummary()`
的 `repaid` 用 `t.type==='expense' && t.xfer && !t.staffSpendId` 分开两者。

### 配平腿不给人看，但余额/统计照旧要算（`isPairedSpendLeg()`，2026-09-10，2026-09-11 扩大覆盖）

用户原话：「我刚才下午把代管现金支付删掉了 我去看了单子也有这些东西 我不要看到这些
东西」——上表里 `xfer:true` + `staffSpendId` 那种「配平腿」（`fetchInbox()` 腿二／
`bossCashCleanupScan()` 补搬时新增的那条：真实账户 income、xfer、`staffSpendId` 指回
那笔真消费）本来就不是给人看的，只是在真实账户里把「代管现金花掉」这件事抵消掉。

`isPairedSpendLeg(t)`（`return !!(t && t.xfer && (t.staffSpendId || (Array.isArray(t.settleAdvanceIds) && t.settleAdvanceIds.length)))`）挡住这两处：
- `renderTxList()`（明细列表）、`renderOverview()` 里首屏「最近」——`.filter(!isPairedSpendLeg(t))`。
- `buildStatementPDF()`（账户明细 PDF）——`incomeTxsShown`/`expenseTxsShown` 两个过滤后
  的数组只给行渲染用，**`incomeTotal`/`expenseTotal`/`closingBalance` 继续用未过滤的
  `incomeTxs`/`expenseTxs`**：这是刻意的——配平腿存在的唯一意义就是抵消余额，隐藏归
  隐藏，账户余额、本月支出、PDF 里的「总计」一分都不能少算，只是明细行看不到它。
- 判断用 `xfer && staffSpendId` 这组明确标记，**不猜描述文字**：真支出腿（腿一）也带
  `staffSpendId`（就是它自己的 id），但没有 `xfer`，不会被误伤；「给同事现金」转账腿
  （`giftId`）、「他还钱了」/「一键归还」（`repayId`）都没有 `staffSpendId`，也继续
  正常显示。
- **2026-09-11 扩大覆盖「结清垫付」那对配平腿**：用户实机又看到一条同类记录混进明细——
  「结清 X 垫付的 N 笔（从代管账户转回）　+189.53」（`sendBossCashGift()`/
  `convertOldOffsetToSettle()` 生成，见上面「转账记全额，结清垫付另开一对配平转账」
  那节，`xfer:true` + `settleAdvanceIds` 数组，没有 `staffSpendId`）。判断思路跟
  `staffSpendId` 那对完全一样，只是多认一种明确标记，同样**只隐藏、不能删**——
  `buildStatementPDF()` 那边不受影响（那里早就换成更宽的 `!t.xfer` 筛，天然盖住这对，
  见「月底账单不列任何转账」那节），只有明细列表／首屏最近这两处窄筛（`isPairedSpendLeg`
  本身）漏了这种腿，这次一并补上。

### 🔧 补回缺失的配平记录（`missingSpendLegs()` / `repairSpendLegs()`，2026-09-10）

配平腿刚隐藏那阵子用户已经手动删掉了一批（看得到就当垃圾删掉了）——后果是真实账户
被多扣了一次（真支出腿扣了，抵消的配平腿没了）。「👔 给同事现金」弹窗最下面加了
「🔧 补回缺失的配平记录」补救：

1. `missingSpendLegs()` 扫真支出腿（`type==='expense'`、不带 `xfer`、`staffSpendId`
   等于它自己的 id）存在，但对应的配平腿缺了哪一条——真实账户那条和／或代管账户那条。
   代管账户本身找不到（账户都被删了）的整条跳过。
2. **先预览再动手**：`confirm()` 讲清楚哪个账户余额会 +多少、几笔，不确认什么都不做。
3. 确认后照原本规则补回缺的那一条或两条（真实账户 income xfer ＋ 代管账户 expense
   xfer，共用同一个 `staffSpendId`、金额/日期跟真支出腿一致）。
4. 一笔都不缺时提示「没有需要修复的」，可重复点。

**补回来的是新的交易 id（`uid()`），跟墓碑无关**：`tombstoneTx()`/`mergeData()` 按 id
精确匹配（`dead.has(x.id)`），当初删掉的是旧 id，新建的 id 不会撞上那份墓碑，云同步
合并时不会被过滤掉——这一点已经对着代码逐行确认过，不是假设。

自检：`check-expense-company.mjs`【46】（明细列表/首屏最近/PDF 都不显示配平腿，对照组
真支出与「给同事现金」照常显示，余额与统计手算 fixture 核对不受隐藏影响）；【45】
（`missingSpendLegs`/`repairSpendLegs`：真实账户腿缺了/代管账户腿缺了/两条都缺三种
组合、补完余额回到删之前、可重复点、完好资料点修复不会凭空多补）；【50】
（用户真实数字端到端，2026-09-11：转5000、垫付189.53被转账当下顺带结清、再用代管
现金花513.44——「结清」那条配平腿在明细列表/首屏最近都看不到，对照组真开销/给同事
现金的转账照常显示；隐藏前后来源账户余额/本月收入/本月支出三个数字不受影响，本月
收入精确是 0.00；`personMonthSpend('Kuang')` 直接返回 `{cash:513.44, own:189.53}`，
跟卡片文字「给了 5000.00　花了 702.97　还剩 4297.03」一致，5000−702.97＝4297.03 这条
恒等式精确成立；对照组：没有任何结清记录的人（Yang），「花了」就是他自己那笔 300，
不会被别人的结清腿带偏）。做过 false-red：把 `isPairedSpendLeg()` 改回旧版（只认
`staffSpendId`，不认 `settleAdvanceIds`），明细列表/首屏最近那两条断言立刻红，其余
723 条（含恒等式那几条）仍然绿——**恒等式本身在这次改动前就已经成立**（`personMonthSpend()`
的 `own` 分支本来就不看 `fromStaff.paidAt`，被转账结清过的垫付本来就照算），这次
真正修的只是「结清」配平腿的隐藏，【50】把这两件事一次性用真实数字钉死，以后谁把
其中任何一处改歪都会当场变红。

### 「该付同事多少」（`inboxOwedByPerson()`）现在跟 `staffSpendId` 挂钩

`isUnpaidStaffAdvance(t)` 是唯一正本判断——`inboxOwedByPerson()`、`inboxMarkPaid()`
两处都调它，保证「欠多少」这个数字处处一致（曾经还有 `unpaidDebtTxs()` 调它，那是
「转钱先抵欠款」规则专用的，规则拿掉后这个函数已经删掉，见下面「转账记全额，结清垫付另开一对配平转账」
那节）：

```
排除：没有 fromStaff / 不是支出 / 已经标过 paidAt
排除：有 staffSpendId（用老板给的代管现金付的，压根不欠他，这次改版新增的判断）
排除：落进 isHolding 账户（旧格式兜底，改版前的消费直接记在代管账户本身）
```

**这条判断在这次改版之前是靠"是不是落进代管账户"来分辨"自己垫的"和"花老板的钱"**，
但改版后同事花代管现金的消费明细也落进真实账户了（`isHolding` 判断落空），必须换成
`staffSpendId` 才分得清——这是改版时顺手修的一个关联 bug（不改的话，所有用代管现金
花的钱会被重新算成"老板欠他的钱"，欠款金额凭空暴涨）。

### 转账记全额，结清垫付另开一对配平转账——用户第三次调整后的最终形态

**这是用户在 2026-09-10 同一天第三次调整这个问题，下面这套才是最终形态**，历史脉络
（为什么会有第一版、第二版）放在本节最后，别照那两版实现。

**第一版**（当天上午）：「转钱给他之前，先拿这笔钱抵掉他垫付的旧欠款」——转 5000、
他垫付过 189，直接**把转账金额改小**，只记 4811 进代管、欠款标已付。用户实机跑完后
反对：

> 「他那边的卡片应该显示 5000−506，我这里应该也是显示 5000 给他，不是 4810.47」
> 「我转个 5000 给他 然后我这边的卡和他那边就是 5000 扣掉这个月他记的就好了不是吗？」

**第二版**（同一天下午）：干脆拿掉抵扣，转现金＝**全额**进代管，欠款独立存在、只有
手动按「已付」才结清——两件事各归各的，不再纠缠。这一版解决了「转账金额跟实际转出去
的现金脱节」的问题，但用户实机再跑一轮之后，还是想要「转账当下就顺手把欠款结清」这个
体验，只是不要「金额被悄悄改小」这个副作用，原话：

> 「我该填 5000 因为我是转了 5000 过去，难道你就不能直接把记录下去的和垫付的直接在
> 5000 里扣吗？」

**第三版（最终形态）**：转账**仍然记全额**——Firestore 的 `boss_cash_gifts.amount`、
两条转账腿（源账户支出 + 代管账户收入）的金额，永远是老板输入的原始数字，不缩水、不
带 `offsetTxIds`/`offsetTotal`。但转账当下如果这个人有未结清的垫付，`sendBossCashGift()`
会**另外新增一对「代管账户→来源账户」的配平转账**把它结清：

- `pickAdvancesToSettle(person, amount, currency)`：从最旧的垫付开始累加、**不拆单笔**
  （加了下一笔就会超过转账金额，就停在它之前，那一笔整笔留着还欠）、抵到不超过这次
  转账金额为止，只挑币种跟这次转账一致的。
- 结清的那部分金额 `settle.total`：**代管账户 expense**（钱从代管余额里扣掉，因为
  这部分实质上不是给他花的新钱，是拿来还他垫付的旧账）＋ **来源账户 income**（把当初
  记那笔垫付时预先扣掉来源账户的钱还原回来，见下面的推导），两条腿都带
  `settleAdvanceIds`（哪几笔垫付被结清，撤回时靠它找回来）和跟转账腿相同的 `giftId`。
  同时把这几笔垫付标上 `fromStaff.paidAt`。

**为什么结清要记成「代管→来源」这一对，不是随便找个地方扣**：关键前提是垫付消费在
`fetchInbox()` 收件当下（`paidFrom==='own'`）就已经记成一笔真支出、**已经扣过来源账户
余额了**（那时钱还在老板口袋，垫付这个事实本身不改变来源账户的记账，只是先记一笔当时
还没真花出去的支出）。现在老板把现金转出去，这笔钱里有一部分实质上是把当初这笔「先扣
了但钱其实没花」的账还原回来，所以要在来源账户补记一笔收入（`+settle.total`），同时
从代管余额里扣掉同样金额（这部分钱不是新给他花的，用户原话「不然我自己也乱」——把它
当作「已经花掉」处理，不再是「还剩」的一部分）。手算核对（欠 189.53、转 5000、之后再
用代管现金花 506）：
- 来源账户净变化 ＝ −189.53（当初记垫付）−5000（转账）＋189.53（结清转回）＝ **−5000**
  ——正好等于老板实际转出去的现金，不多不少。
- 代管余额 ＝ ＋5000（转账）−189.53（结清）−506（花掉）＝ **4304.47**。
- 本月支出（非 xfer）＝ 189.53（垫付那笔）＋506（花的那笔）＝ **695.53**——两条结清
  配平腿都是 xfer，不计入。
- 欠款 ＝ **0**（这次转账顺带结清了）。

**为什么另开一对转账、不沿用第一版「转账金额减去欠款」的写法**：那一版会让 Firestore
记的金额和「实际转出去多少现金」这两件事脱节（转 5000 现金，云端却记 4810.47），正是
用户反对第一版的原因。新写法转账腿永远是老板输入的原始数字，「结清了多少」完全是另
一对独立的转账在做，两件事分得清清楚楚，撤回时也各自独立可逆——撤回一笔转账
（`deleteBossCashGift()`）现在会连这对结清腿一起找回（同一个 `giftId`）、一起删掉，
并把那几笔垫付的 `paidAt` 清掉恢复成还欠着，但**不会**撤销垫付本身那笔真支出（那是
转账之前就已经真实发生的记录，从头到尾没被这次转账动过）。

老板欠同事的垫付款独立存在这件事本身没变（`isUnpaidStaffAdvance()`/`inboxOwedByPerson()`
那一套原样保留），区别只是现在转账会**主动**帮着结清一部分，不用非得等老板去「该付
同事」名单里手动按「已付」——`inboxMarkPaid()` 仍然保留，处理「没转过钱但已经私下还了」
或「转账没结清完那一部分」的情况。`unpaidDebtTxs()`/`pickDebtOffset()` 这两个第一版
遗留的纯函数已经删掉，没有别的调用者，不留死代码。

### 撤销抵扣：给已经被旧规则抵过的资料一条路走回全额（`offsetGiftGroups()` / `undoBossDebtOffset()`）

规则拿掉了，但用户在这条规则存在的那几个小时里已经转出去、被抵过的资料还留着旧格式
（转账腿金额是净额、带 `offsetTxIds`/`offsetTotal`，对应的垫付已经标了 `paidAt`）。
「👔 给同事现金」弹窗最下面原本的「🔁 按新规则重算欠款」已经换成「↩️ 撤销抵扣（改回
全额）」，做的事完全不同（不是"补做抵扣"，是"撤销已经做过的抵扣"）：

1. `offsetGiftGroups()` 扫出本机所有**带 `offsetTxIds` 的转账腿**（按 `giftId` 配对
   源账户腿和代管账户腿，两条都在才收进名单——找不到成对的宁可不动，不猜）。
2. **先预览再动手**：`confirm()` 讲清楚「某人某笔转账会从净额改回全额、被抵掉的 N 笔
   垫付共多少会恢复成还欠着」，不确认什么都不做。
3. 确认后：两条腿的金额都加回 `offsetTotal`（改回全额）、清掉 `offsetTxIds`/
   `offsetTotal`、更新 `updatedAt`；那几笔垫付的 `fromStaff.paidAt` 清掉（恢复成还
   欠着）；云端那份 `boss_cash_gifts` 文档**不能 update**（规则写死
   `allow update: if false`），照抄 2026-09-10 当天「删掉旧的、另建一份新的」那套
   写法——字段只能是 `hasOnly(['k','person','amount','currency','at','note'])` 允许
   的那几个，建好之后把本机两条腿改挂到新的 `giftId` 上（不然以后再撤回这笔转账会
   找不到云端那份）。
4. 可重复点：这一批已经撤销过之后 `offsetGiftGroups()` 就不会再找到它，全局没有可
   撤销的时提示「没有需要撤销的」，不弹确认框。

**改版之前的老状态、以及旧版「🔁 按新规则重算欠款」按钮留下的半吊子状态**（只标了
`paidAt`、没有退回代管余额和来源账户，2026-09-10 补救过一次的那个 bug）现在也**不需要**
另外一条恢复路径——那条按钮和它对应的 `bossDebtRecalcScan()`/`bossCashGiftLegPairs()`/
`applyDebtRecalcOffset()`/`openBossDebtRecalc()` 已经跟着"重算"这个概念一起删掉了（新
规则下压根没有"该抵多少"这件事可重算）。真的遇到那种半吊子历史数据，得先靠
`openUndoMarkPaid()`（撤销标记已付，仍然保留）把 `paidAt` 撤掉，再让 `inboxOwedByPerson()`
正常显示欠款，由老板照常手动结清。

### 🔁 一键把旧格式转成新格式（第三版结清机制上线时新增，`convertOldOffsetToSettle()`）

上面的「撤销抵扣」是把旧格式**撤回**成「全额＋还欠着」；但用户实际的历史资料本来就
是「已经结清」的（垫付早就标了 `paidAt`），撤销之后还得再手动转一次账才能重新达到
「已结清」状态，两步太绕。所以又加了一个**一键转换**的入口，直接把旧格式转成
「转账记全额，结清垫付另开一对配平转账」那节描述的最终格式——转账金额改回全额
（跟撤销一样），但**不清 `paidAt`**，改成**补记新格式的结清配平腿**
（`settleAdvanceIds`），让这笔垫付继续保持"已结清"，只是换了一种记法。两个按钮都
留着，别当成同一个工具的两个名字：
- 真的想让欠款恢复成"还欠着"（比如发现这笔当初就不该算结清）→「↩️ 撤销抵扣」。
- 只是想把旧格式换成新格式、不改变"已经结清"这个事实 → 这个「🔁 把旧格式转成新格式」。

`offsetGiftGroups()` 复用同一份（找带 `offsetTxIds` 的转账腿），两个工具用的是同一批
候选资料，操作过一个之后另一个也扫不到（`offsetTxIds` 被清掉了）。

**先预览再动手**：`confirm()` 按用户要求的四个数字逐个列出改前→改后——
`给了`（从净额变全额，唯一真的会变的数字）、`本月替你花`/`还剩`/`欠他`（这三个转换
前后**不变**，预览里连"不变"也明写出来，不让用户自己猜）。「还剩」/「欠他」不变的
原因是这次转换纯粹是换一种记账方式，不改变任何经济事实——垫付这笔钱本来就已经结清了，
代管余额本来就是净额扣掉花费之后的数字，转换前后算法只是换了个路径，答案一样。

转换步骤（跟 `undoBossDebtOffset()` 前两步一样，第三步开始不同）：
1. 两条转账腿金额加回 `offsetTotal`（改回全额），清掉 `offsetTxIds`/`offsetTotal`。
2. **不碰 `fromStaff.paidAt`**——旧格式本来就标了已付，新机制同样靠 `paidAt` 判断
   已结清，不需要重设。
3. 补记结清那一对配平腿（代管账户 expense + 来源账户 income，金额是 `offsetTotal`，
   带 `settleAdvanceIds`），写法跟 `sendBossCashGift()` 新转账时补记的完全一样，
   只是这里是给历史资料补齐、日期沿用原转账日期（不是今天）。
4. 云端同样走「删旧建新」（规则不许 update），新补的两条配平腿此时还带着旧 `giftId`，
   删旧建新那一步用一次 `forEach` 把这一批（转账腿 + 新配平腿）全部改挂到新 `giftId`
   上，四条腿保持同一个 `giftId`，撤回时才能一次找齐。
5. 可重复点：转换过的批次 `offsetGiftGroups()` 扫不到，不会重复转换。

自检：`check-expense-company.mjs`【49】（手算 fixture：欠 189.53、旧格式转 5000 抵成
净额 4810.47 且已标已付，这个月又用代管现金花 506——转换前代管余额 4304.47/不欠钱；
预览讲清楚"给了 4810.47→5000.00"和三个"不变"；转换后 4 条腿、结清腿
`settleAdvanceIds=[debt49]`、`paidAt` 没被动过、仍然不欠钱、代管余额还是 4304.47
不变、云端删旧建新且新文档是全额 5000；可重复点）。做过 false-red：把补记结清腿那段
改成 `if(false)`（模拟"忘记补记"），3 条断言（4 条腿数量、`settleAdvanceIds`、
转换后代管余额不变）立刻红。


### 「🧹 整理旧记录」现在方向反过来了：从代管账户搬出去，不是搬进去

**这是这次改版最容易搞混的一点，务必看清楚**：这个按钮在 2026-09-09（第一版代管账户
上线）时的语义是「把落在默认收件账户里的旧 `fromStaff` 记录，搬进这个人的代管账户」——
那时候消费本来就该记在代管账户里。**2026-09-10 二次改版之后，消费不该记在代管账户里
了**，所以语义整个反过来：`bossCashCleanupScan()`/`openBossCashCleanup()` 现在扫描
「还留在 `isHolding` 账户里的 `type==='expense' && !xfer`（真消费，没有 `staffSpendId`）」
记录，把它们**搬出**代管账户、搬进 `holdingRealAccountId(holdAcc)` 算出来的真实账户，
并且像 `fetchInbox()` 新记的消费一样**补上两条配平腿**（真实账户 income xfer + 代管
账户 expense xfer，共用 `staffSpendId = 这笔原始交易的 id`）。

只改这笔交易的 `accountId`，**不删不增**（这一步本身不涉及 `tombstoneTx()`，那是给
"移除记录"用的，这里没有移除任何记录），配平腿是**另外新增**的两条。搬完之后：真实
账户净变化为零（配平腿抵消）；代管余额不变（原本记在这笔上的 −金额，从"直接躺在代管
账户里"换成"配平腿躺在代管账户里"，数字没变）；"本月支出"看这个真实账户时会多出这
几笔（以前只有代管账户自己看得到，而代管账户又不在任何 UI 里露出）。

币种不一致（或者一个真实账户都找不到）的跳过、不搬，理由跟其它几处币种检查一样。
可以重复点，第二次点能搬的都搬完了会显示「没有需要整理的旧记录」。

### 代管账户在界面上一律隐藏（2026-09-10 用户明确反对「多一张卡」）

用户看到账户列表/首屏多出代管账户的卡片，明确反对：「我要的是全部整合去对应的账户里，
不然这样账会分开」。所以代管账户（`isHolding`）**只在幕后配平，不出现在任何账户相关
的 UI 里**——这条要求覆盖面很广，全文搜索 `data.accounts` 的每一个遍历点，逐个确认
过滤掉 `isHolding`：

- 首屏账户卡片 `renderAccCards()`
- 设置页账户管理列表 `renderSettingsAccs()`
- 账户切换器 `openAccSwitch()`
- 月固定开销的账户下拉（`rec-acc`）
- 投递箱默认收件账户下拉（`inbox-acc-select`，`renderInboxSettings()`）
- 「给同事现金」弹窗「从哪个账户出」下拉（`renderBossCashGiftModal()`，这条在
  2026-09-09 建代管账户时就已经过滤了，不是这次新加的）

配套的防御性闸门（正常情况下摸不到，但防旧缓存/旧代码路径意外拼出代管账户 id）：
`switchAccount(id)` 开头拦一次；`saveBossCashGiftAccount(id)`、`setInboxAccount(id)`
都拒绝 `isHolding` 的 id；`getInboxAccountId()`/`bossCashGiftAccountId()` 的兜底猜测
逻辑也都排除 `isHolding`。

**`data.currentAccountId` 停在代管账户上的老状态要收口**：2026-09-09 到 2026-09-10
之间，代管账户曾经是可以被手动切换进去、显示在卡片上的（那时用户还没反对），本机数据
如果当时切换过去，`currentAccountId` 会停在那个代管账户上；这次隐藏 UI 之后如果不处理，
首屏会显示一个看不到入口的"幽灵当前账户"。新增 `ensureCurrentAccountUsable()`：账户
不存在或者是代管账户，一律回落到第一个非代管账户；`loadData()`（本地读档后）、
`syncFromCloud()`（云端合并后）、`deleteAccount()`（删账户后）都调它一次。

**代管账户不能被选来记账**：新增/编辑交易走的是 `data.currentAccountId`（本页没有
「新增交易时选账户」的下拉，要先切到某个账户才能往里记账），既然代管账户摸不到切换器，
天然也就选不到——不需要在记账表单里单独再挡一次。

### 自检

`check-expense-company.mjs`【31】自动建代管账户、两条腿方向和字段都对、源账户余额
减少+代管账户余额增加、汇总排除 xfer 但明细照常显示；【32】新旧格式撤回对照；【33】
弹窗摘要用代管余额、「他还钱了」两条腿/币种校验/不碰 Firestore；【34】对每个人都
通用（Kuang/Seryi 互不影响）；【37】首屏卡片真实进度 + 整理旧记录（从代管账户搬出去、
补配平腿、币种不一致跳过、幂等）；【39】同事消费整合进真实账户的 3 条腿模型（手算
fixture：转 5000→花 3000→真实账户净变化只有 −5000、本月支出 3000、代管余额 2000、
消费明细在真实账户里；对照组：没有代管账户的人只记一笔真支出、没有配平腿）；【40】
代管账户 UI 隐藏（对照组：真实账户照常出现在列表里）。
**转账记全额，结清垫付另开一对配平转账**（用户第三次调整后的最终形态）的覆盖挪到【41】：
欠 189.53 转 5000→确认框讲清楚会结清 1 笔 189.53→Firestore 记全额 5000、两条转账腿
金额也是全额（都不带 `offsetTxIds`）→这一次转账共记 4 条腿（转账 2 条 + 结清配平
2 条，都带同一个 `giftId`）→结清腿带 `settleAdvanceIds`=[被结清的垫付 id]→欠款归零
→代管余额 4810.47（5000−189.53）→来源账户净变化 −5000；对照组（这时 Kuang 还没有
任何代管账户，「该付同事多少」名单照样看得到他，DOM 也验证过）；撤回这笔转账（4 条
腿全部消失、垫付 `paidAt` 清掉恢复欠着、来源账户回到「只扣了那笔垫付」的状态、代管
余额归零，重新转一次又能干净地结清一次，不留半吊子痕迹）；再花 506（`paidFrom:'cash'`）
之后代管 4304.47、本月支出含那 506；首屏卡片三个数「给了/花了/还剩」且不出现拆行字样；
对照组（不欠钱的人转账只有 2 条腿，没有多出结清那一对，确认框也不提结清）；撤销抵扣
（`offsetGiftGroups()`/`undoBossDebtOffset()`，这条是给**第一版**旧规则已经抵过的
历史资料用的，两码事——造一笔那种旧格式资料，撤销后两条腿改回全额、代管余额加回、
欠款恢复、云端走"删旧建新"且字段合规，可重复点、没有可撤销的会提示）。
【44】是另一组真实数字端到端核对（欠 189.53、转 5000 自动结清、再花 224），五个数字
逐一核对（手上还剩 4586.47、用现金花掉 224、来源账户净变化 −5000、本月支出 413.53、
欠款归零）+ 两边口径一致（跟同事版 `bossCashMonthSpend()` 同一个数）+ 对照组（同一个
人再自己垫一笔不会被自动结清、也不会走 3 条腿）+ 回归（重复收件不让已结清/已标付的
垫付复活）。自检脚本里的编号以文件里 `console.log`/`ok()` 实际标注为准，这里只是帮助
定位改了哪几块。
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

## 首屏卡片显示真实进度（2026-09-10，「已花」算法在同一天二次改版里又变了一次，见上面「代管账户」那节）

### 卡片从「本地显示缓存」改成「真实账目」

`renderOvBossCashGift()` 原本第二行显示 `bossCashGiftLog()`（本地"最近转过谁多少"的
显示缓存），看不出钱现在的状态。改成遍历 `data.accounts` 里所有 `isHolding` 的账户，
对每个人现算「还剩」（`holdingBalance(acc)`，账户余额类用途照算 xfer）和「已花」
（**口径见上面「代管账户」那节的 `staffSpendId` 表格**，不是简单的"非 xfer 支出"了），
全部本地现算、不连网、**不写死任何人名**——这是跟 `holdingAccountId()` 同一条设计铁律。

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
兜底），只是它的显示出口没了。挪到 `renderBossCashGiftModal()` 弹窗表单最下面、字号
缩小、不显眼——留给"万一 `forgetBossCashGift()` 的兜底摘除也没摘干净"这种极端情况
手动清一下，不涉及金额，不用二次确认。`clearBossCashGiftLog()` 内部不再调
`renderOvBossCashGift()`（卡片已经跟这份 log 无关），改成 `toast()` 提示。

**弹窗表单最下面那一排工具（截至最终形态）各管各的，别混着改**：
`clearBossCashGiftLog()`（清显示缓存）／`openBossCashCleanup()`（🧹 整理旧记录，搬的是
"还躺在代管账户里的旧格式消费记录"，改 `accountId` + 补配平腿）／
`convertOldOffsetToSettle()`（🔁 把旧格式转成新格式，见「转账记全额，结清垫付另开一对
配平转账」那节最后一小节）／`undoBossDebtOffset()`（↩️ 撤销抵扣改回全额、欠款恢复未付）／
`openUndoMarkPaid()`（↩️ 撤销标记已付，通用工具，跟代管现金转账无关）／
`repairSpendLegs()`（🔧 补回缺失的配平记录）。`bossDebtRecalcScan()`/`openBossDebtRecalc()`
（第二版存在过的「🔁 按新规则重算欠款」）已经删掉了，历史脉络别再照它理解现在的按钮。
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
  butler-bot 仓库的 `CLAUDE.md`（对外端点表那一节；`SETUP.md` 只有面向使用者的
  说明，没有字段级契约），这里不复述。

自检：`check-staff-page.mjs`【30】——打对端点、带对钥匙与金额/币种、`left` 是还完
之后的数、不送 `person`、只戳一次；**两组对照**：没钥匙时不发通知但**钱照样送**、
通知端挂掉（fetch reject）时归还照样送出且队列不卡住、不冒 JS 报错。

## 两个「钱对不上」的真实 bug（2026-09-10 用户实际踩到）

### 一、老板发一笔，同事收到两笔

用户原话：「我只发一笔5000 他又收到两笔」。**不是**之前那个 `bossGiftsOpBusy` 锁没修好
——那把锁是 JS 模块级变量，**只锁得住自己那个 JS 环境**。同事手机上同时开着「浏览器
分页」和「桌面图标 App」时，那是两个各自独立的环境、却共用同一份 localStorage：
两边各自查到同一笔现金、各自看自己的 `seen` 游标（也是各存各的）、各推一条进
`topups`。锁在这种情况下形同虚设。

修法：`staffSyncBossGifts()` 里，`.get()` 回来之后**重新读一次** `loadBossCash()`，
按 **`giftId`（云端文档 id，天生唯一）去重**才写进去。去重看的是账本身，不是游标——
游标是每个环境各记各的，本来就不可靠。`staffPruneBossGifts()` 同样改成查询回来之后
才读这本账：否则网络往返那几百毫秒里他自己记的账，会被开头那份旧快照覆盖掉。

**这条教训可以推广**：凡是「读 localStorage → 打一趟网络 → 写回 localStorage」的地方，
都要假设中间有人改过这份数据。要么查完再读、要么按唯一 id 合并，不能拿旧的整份覆盖。

### 二之一、同事的账有记录、但**没有账单（收据照片）**

用户原话：「他那两张有记录但是没有账单 不是我删的」。根因在 `submitInboxTx()`：旧写法是
「base64 超过 700KB 就不送照片」。手机随手一拍就是 2~5MB，base64 之后更大——于是
**绝大多数照片都被默默丢掉**，账进去了、凭证没了，同事和老板两边都没有任何提示。

修法两步：
1. **先缩图重压再送**（`shrinkPhotoForInbox()`）：长边逐级缩 1600→1200→900→700→500、
   JPEG 质量逐级降 0.85→0.7→0.55→0.4，第一个塞得下的就用（长边从 2400 起跳，
   收据要看得清金额、店名、日期，一上来就压小等于交一张糊掉的凭证）。目的是**留下看得清金额和店名的
   凭证**，不是留原画质。透明底 PNG 要先铺白，否则转 JPEG 变一片黑（跟
   `shrinkPhotoForPDF()` 同一个坑）。
2. **真的压不下去才放弃，而且一定要出声**：`submitInboxTx()` 回传 `photoDropped`，
   `flushBossQueue()` **不管是不是 loud 都弹提示**（自动补送时同事没在看，但这件事他
   必须知道——老板那边会看到一笔没有凭证的账）。

700KB 这个上限的由来：Firestore 单份文档上限 1MB，账目字段本身还要占一点，
base64 大约是原图的 1.33 倍（也就是原图 500KB 以内可以原样送）。

### 二之二、同事上传的单子少了几笔

用户原话：「kuang上传的单子又少两笔」。这些是**以前在老板这边删过、留了墓碑
（`tombstoneTx`）的记录，同事又送了一次**。`fetchInbox()` 认出墓碑就把云端文档丢掉、
不重复记账——这个行为是对的（不然删过的会复活），错在**一声不吭**：那些笔数被算进
`skipped`，而 `skipped` 只在「这次什么都没收到」时才显示一句「箱子里没有新的账」。
于是同事送 5 笔、这边只进 3 笔，另外 2 笔连云端文档都没了，用户查不出原因。

修法：单独数一个 `skippedDead`，在收件提示里明写「有 N 笔是你以前在这边删掉过的
记录，同事又送了一次，已经跳过没有重复记账」。**丢掉可以，静默不行**——账目自己少
几笔而没人告诉用户，比不丢还糟（跟隔壁「同事删掉了 N 笔」那条注释同一条精神）。

（收据照片这一节 2026-09-11 重新生效：压缩与提示随 PR #573 单独加回来，
自检是 `check-staff-page.mjs`【27】，三种改坏法都验过会红。）

自检：`check-staff-page.mjs`【31】（同 giftId 只收一次＋对照组「不同 giftId 照样收」＋
「查询期间别处写进来的记录不被覆盖」；做过 false-red：拿掉去重后这 3 条立刻红）、
`check-expense-company.mjs`【38】（墓碑记录不复活、对照组新记录照收、提示里讲明笔数）。


## 三度改版：`paidFrom` 让两边口径一致（2026-09-10）

**用户实测抓到的 bug**：同一个人 Kuang，老板端显示「还剩 4776」、同事端显示「手上现金
4586.47」，差 **189.53** ＝ 他在收到现金**之前**自己垫付的那笔。

**根因**：同事端 `bossCashLeft()` 把「记在老板账账户里的**所有**支出」都当成花掉老板的
现金（含他自己垫的），老板端则把垫付算成欠款、不从代管扣。两边各自自洽，凑一起就差了。
连带症状：转现金之前，同事卡片会显示「手上现金 −189.53」这种负数。

**修法：谁出的钱在记账当下就定案，随投递箱一起送，两边不再各自猜。**
- 同事端每笔带 `tx.paidFrom`（`'cash'`＝用老板给的现金付／`'own'`＝自己先垫），
  预设由 `bossCashLeft()` 够不够付自动判定，记账表单里有开关可以手动改。
- 这个字段放在投递箱 payload 的 **`tx` 那个 JSON 字符串里面**，不是顶层字段——
  `firestore.rules` 对 `inbox_boss` 写的是 `hasOnly(['k','tx','photo','from','createdAt'])`，
  加顶层字段会被规则挡下，而且改规则要用户自己去 Console 贴。
- 旧数据回落（`effectivePaidFrom()`）：按「这笔的日期是不是在第一次收到现金之后」判断。
  在第一次收到现金之前，手上根本没有老板的钱可以花，只可能是自己垫的。
- 老板端 `fetchInbox()`：`paidFrom==='own'` 只记**一笔普通真支出**（进欠款），
  **不走 3 条腿、不动代管余额**——即使这个人已经有代管账户。
- **不再有「超支」这个状态**：花超出手上现金的部分会自动判成 `own`（他不可能花掉口袋里
  没有的钱）。手上现金**永远不会是负数**，这是硬不变量。
- **已经送出去的那笔不因为后来收到钱而改判**：它当时就带着 `own` 送到老板那边了，
  回头改判两边又会对不上——正是这次要修的那个 bug。

**顺带抓到的另一个真实 bug**（写自检时发现）：`fetchInbox()` 更新「以前收过的」记录时，
用一份不带 `paidAt` 的 `fromStaff` 整个覆盖回去，**已经结清的垫付会自己活过来**，
「该付同事多少」凭空多一笔——照着付就是**重复付款**。触发条件很平常：上次 `inboxDrop`
失败、或同事重送同一笔。修法是 `mergeInboxTx()`：新资料覆盖旧的，但本机自己加上去的
结算状态（目前是 `fromStaff.paidAt`）一律保留。

**「手上现金永远不会是负数」这条不变量，说的是 `bossCashLeft()` 这个内部函数**（用于
paidFrom 自动判定阈值、归还按钮默认值/校验、归还通知的 `left` 字段），它只减
`paidFrom==='cash'` 那部分，2026-09-10 五度改版之后仍然原样保留、没有被动过。**但
`renderBossCash()` 卡片头部显示出来的数字，五度改版之后不是这个数了**（见下面「五度
改版：拆行拿掉」那节），那个显示数字在「这个月合计比收到的还多」时**可以**呈现「数字
对不上了」的状态——这是刻意接受的取舍，跟这里说的内部不变量是两回事，别搞混。

自检：`check-expense-company.mjs`【44】用用户真实数字做端到端核对：欠 189.53 转 5000
（转账当下自动结清那 189.53）→ 手上还剩 4586.47、用现金花掉 224、来源账户净变化
−5000、本月支出 413.53、欠款归零，外加**两边口径一致**那条（老板端算的「他还剩」必须
等于同事端算的「手上还剩」——以后谁把任何一边改歪，这条直接红）、`own` 不走 3 条腿的
对照组（再垫一笔 50，欠款只剩这 50，不会被自动结清，因为结清只发生在转账那一刻）、以及
手动按「已付」之后重复收件不让已结清/已标付的垫付复活的回归（`mergeInboxTx()` 路径）。
`check-staff-page.mjs` 里旧的「超支」相关断言已经按五度改版的新语义改写（卡片会显示
「数字对不上了」而不是恒非负，见上面那条说明）。做过 false-red：把 `mergeInboxTx()` 的
保留条件改成恒假，立刻红 3 条；把 `pickAdvancesToSettle()` 改成恒不结清，立刻红 20 条
（涵盖确认框文案、4 条腿、settleAdvanceIds、欠款归零、代管余额、来源账户净变化、撤回、
重新转账、本月支出、首屏卡片、两边口径一致、【44】的五个数字、对照组、重复收件回归）。


### 补救：旧规则抵过的资料怎么救（历史脉络，正本见上面「撤销抵扣」那节）

用户在「转钱先抵欠款」规则存在的那几个小时里转出去的钱、以及当时旧版「🔁 按新规则
重算欠款」按钮标过的半吊子状态（只标 `paidAt`、没有把多转出去的钱从代管余额和来源
账户退回去），**2026-09-10 规则整个拿掉之后，正确的补救路径已经改成上面「撤销抵扣：
给已经被旧规则抵过的资料一条路走回全额」那节的 `undoBossDebtOffset()`**——不再是
「先撤销标记已付、再按新版重算」这套两步流程（那套依赖的 `bossDebtRecalcScan()`/
`openBossDebtRecalc()` 已经跟着"重算"这个概念一起删掉了）。

`openUndoMarkPaid()`（↩️ 撤销标记已付）本身**保留**，但现在是一个通用工具——撤销
最近一次手动按「已付」的操作，跟代管现金转账完全无关，不要再把它当成"重算流程"的
前置步骤来理解。


### ⚠️ `boss_cash_gifts` 的字段是规则写死的（2026-09-10 验收抓到的事故）

`firestore.rules` 对这个集合写的是
`hasOnly(['k','person','amount','currency','at','note'])` ＋ `allow update: if false`。

踩过的两个坑，都会**静默失败**（错误被 `.catch(()=>{})` 吞掉，画面上像没事）——这两条
是「转钱先抵欠款」第一版规则存在的那段时间踩的，第一版规则本身已经拿掉（见上面「转账记全额，结清垫付另开一对配平转账」
那节），但**教训本身仍然成立**，往这份文档加任何字段/改任何写法之前都要先想到这两条：
1. `sendBossCashGift()` 一度往 payload 多送 `offsetTxIds`/`offsetTotal` → 规则直接
   permission-denied，**只要抵到过欠款，那笔转账就送不出去**。修法：抵扣明细同事那边
   根本用不到（他只需要净额），改成**只存在本机那两条转账腿上**，撤回时从腿上读。
   规则拿掉之后 `sendBossCashGift()` 送的 payload 已经不再产生这两个字段，但**它们仍然
   会出现在旧数据上**，`undoBossDebtOffset()` 撤销时要从本机腿上读、不能指望云端有。
2. 当年的「按新规则重算欠款」一度用 `.doc(id).update()` 改金额 → `allow update: if false`
   永远拒绝。而且就算规则放行也没用：同事端 `staffSyncBossGifts()` 按 `giftId`
   一次性去重，**已经拉过的文档永远不会再读第二次**。修法：改成**删掉旧的、另建一份
   净额的新的**——规则允许 delete 与 create，同事端也刚好接得住（prune 发现旧 giftId
   不见了会扣掉那笔，sync 看到新文档会把净额加回来），两边自动对齐。本机两条腿要改挂
   到新的 `giftId` 上，否则以后撤回找不到云端那份。**现在 `undoBossDebtOffset()`
   撤销抵扣时照抄的就是这同一套「删旧建新」写法**（新文档金额改成全额，不是净额）。

**通则**：往这份文档加任何字段之前，先改 Console 里的规则，否则一定被挡；而且因为失败
是静默的，不会有人发现。自检里有一条专门守这个——断言送出的 payload 里没有一个字段是
规则不允许的。


## 老板账「本月合计」卡（2026-09-10 新增）

同事版之前老板账那页只有「今天」的小计，没有整月合计，用户要求照抄「明细」页
`#staff-summary` 那张卡的样式（`renderBossSummary()`，`tools/build-staff-page.py`；
生成到 `staff/index.html` 的 `#staff-boss-summary`，挂在跟月份切换器同样的位置，
紧接在 `#staff-boss-cash` 之后）。

**口径，别自己发明**：合计＝这本老板账账户（`STAFF_BOSS_ACC_ID`）里**当前所选月份**的
**支出**总额，**不分是用老板给的现金付（`paidFrom==='cash'`）还是自己先垫的
（`paidFrom==='own'`）**——两种花法都是这个月替老板花掉的钱，都要算。

**跟「手上现金」卡（`#staff-boss-cash`／`bossCashLeft()`）是两个不同的问题，别混**：
`bossCashLeft()` 回答「手上还剩多少现金能花」，所以只减 `paidFrom==='cash'` 那部分
（自己垫的钱从头到尾不是老板给的现金，不该从这个余额扣）。`renderBossSummary()`
回答「这个月总共替老板花了多少」，全部要算。两个函数各自独立计算，改一个时不要
以为另一个会自动跟着对。

跟着页面上的月份切换器走（`state.txYear`/`state.txMonth`），挂在跟 `renderBossCash()`
同一个重画时机（`renderTxList` 包一层那段），记账、删除、切月份都会跟着更新。

**主 App「给同事现金」卡也有同一口径的一行（2026-09-10）**：`renderOvBossCashGift()`
（`expense-tracker.html`）每人那行下面用 `personMonthSpend(person)`（用「代管账户」
那套字段判定：`用现金`＝真支出腿 `t.staffSpendId===t.id`，`他垫`＝有 `fromStaff` 没有
`staffSpendId` 且不落在代管账户本身的那种，跟 `isUnpaidStaffAdvance()` 同一套形状）
算出合计——**不管 `fromStaff.paidAt` 有没有标**，已经还清的垫付那个月照样算，理由跟
同事版一样：合计不该因为"什么时候还的"而跳动。这是**同一笔钱经过投递箱
（`fetchInbox()`）之后的另一半视角**：同事那边记账当下用 `paidFrom` 标好、送进
`inbox_boss`，这边收件按同一个标记分岔成 3 条腿（cash）或单腿（own）——两边理应
分毫不差，改任何一边都要保持这条等式成立。

### 五度改版：拆行拿掉（2026-09-10，同一天）

用户看过「还剩 X（已花 Y）」＋「本月共替你花 Z（用现金 A · 他垫 B）」这套两行拆开的
显示之后，明确要求简化，原话：「他垫付的这些不必出现了，只出现他那边花了多少就好，
不然我自己也乱」。**这次只改显示，不改账**——`paidFrom`（cash/own）、
`isUnpaidStaffAdvance()`/`inboxOwedByPerson()`（该付同事多少）那一整套判断和数据
一个字都没动，只是不再把「用现金/他垫」拆开摆在卡片上。

**主 App 卡片**（`renderOvBossCashGift()`）现在每人一行三个数：

```
Kuang　给了 US$5000.00　花了 US$695.53　还剩 US$4304.47
```

- `给了`＝这个人的代管账户收到过的转账总额（`type==='income'` 的 holdAcc 交易加总，
  累计口径，2026-09-10 五度改版新加的字段，以前这张卡不显示这个数）。
- `花了`＝`personMonthSpend()` 的本月合计（现金付的＋自己垫的都算，月度口径，没变）。
- `还剩`＝`holdingBalance()`（代管账户余额，累计口径，没变）。
- **`给了`/`还剩` 是累计口径，`花了` 是月度口径，三者刻意不是同一个时间范围**——
  `给了－花了≠还剩` 这个减法在一般情况下不成立（只有「这次转账 + 这个月消费恰好是
  这段关系里唯一一次活动」这种典型场景才会碰巧对上，比如用户举的例子本身）。别把
  它们当成一个会自动配平的恒等式去改代码。

**同事版「手上现金」卡**（`renderBossCash()`，`tools/build-staff-page.py`）现在：

```
收到 US$5000.00 · 花掉 US$695.53
手上还剩 US$4304.47
```

- `收到`＝`got`（topups 累计，没变）。
- `花掉`＝新增的共用函数 `bossCashMonthSpend()`（跟本月合计卡 `renderBossSummary()`
  的合计是**同一个函数**、同一个数，不是碰巧一样）。
- `手上还剩`＝**新的显示专用公式** `got − 花掉`——**这不是 `bossCashLeft()`**！
  `bossCashLeft()`（只减 `paidFrom==='cash'` 那部分）原样保留、一个字没动，继续给
  归还按钮默认值/校验、`paidFrom` 自动判定阈值、归还通知的 `left` 字段用，这些都是
  「这次只改显示，不改账」要保住的内部逻辑。卡片头部这个显示数字**可以**因为「这个月
  合计比收到的还多」而变成「数字对不上了」状态（不再像三度改版那样恒非负）——这是
  用户明确要的口径（跟老板端对上），不是回归到三度改版之前的「超支」bug，两者的
  触发条件和背后的账都不一样，改这块前务必先读三度改版那节，separately理解这两套
  「非负」/「可能显负」分别指哪个函数。
- 「📝 这本机记录你自己先垫了…」那行**直接拿掉**（不是改中性说法）——新模型下垫付
  已经可能在转账当下被结清了，留着这句话会让同事以为老板还欠他，容易误会。
- 旧的 `offsetTotal` 附加说明（「另有 X 结清了你垫付的」）也一并拿掉——那是给第一版
  「先抵欠款」规则用的展示，规则本身已经拿掉两版了，这句话早就是死文案。

**「本月合计」卡**（`renderBossSummary()`）保留合计与笔数，拆行（「用现金 X · 自己垫
Y」）拿掉，改用同一个 `bossCashMonthSpend()`。

自检：`check-staff-page.mjs`【35】（合计/笔数不变，断言不再拆行；手上现金卡新公式，
`收到500−花掉245.53=254.47`）、【23】（花超之后卡片呈现「数字对不上了」+「¥50.00」
不是裸负数、内部 `paidFrom` 判定仍然正确不受影响、又收到钱之后回到正常状态）；
`check-expense-company.mjs`【47】（三个数的格式、断言不出现「他垫/自己垫」字样、
对照组：只有现金消费的人一样有「花了」这行、上个月的消费不进「花了」但「还剩」照样
反映真实累计余额）＋跟同事版 `bossCashMonthSpend()`/`renderBossSummary()` 算法重放比对
（两边口径一致，仍然用 `personMonthSpend()` 的返回值直接验证，不依赖卡片文案）；【41】
的「该付同事多少」DOM 对照组（没收到过现金、只有垫付的人照样出现在名单里，不受这次
拆行简化影响）。做过 false-red：把 `renderBossCash()` 的新公式改回 `got`（漏减
`花了`），`check-staff-page.mjs` 8 条断言立刻红；`personMonthSpend()`/两边口径一致的
false-red 见【47】原有记录（改坏卡片渲染那一行、改坏 `personMonthSpend()` 本身，两条
路都能让"两边口径一致"那两条断言当场变红）。

## 月底账单（账户明细 PDF）不列任何转账（2026-09-10）

用户原话：「月底账单里我也不要出现转账给谁，这些是不该显示的，该出现的只有老板注资
和开销」。`buildStatementPDF()`（`expense-tracker.html`）里所有 `xfer` 交易——给同事
现金那两条、结清垫付那两条、同事消费的配平腿、一键归还那两条——整个从明细行**和**
汇总总计里剔除，不只是藏明细行：以前 `isPairedSpendLeg()` 那套只藏配平腿的明细行，
汇总总计仍沿用未过滤数字（为了保住「期初＋收入－支出＝期末」这条恒等式）；这次范围
更大，连汇总总计都要排除全部转账，直接用更宽的 `!t.xfer` 筛（`isPairedSpendLeg()`
挡的那几条本来就是 `xfer`，天然也被这次的过滤器盖住，`buildStatementPDF()` 里不用再
叠这个判断，但 `renderTxList()`/首屏「最近」等别的地方仍然要用 `isPairedSpendLeg()`，
它没有被这次改动废弃，只是 PDF 这一处换了更宽的筛法）。

**但账要对得平**：藏掉转账之后，「期初＋注资－开销」会比真实的「期末余额」差一截——
差的正是这段期间净转出去、还没转回来的钱。所以合计区（「收支汇总」表）新增一行
「在同事手上的现金」：

```
holdingLine = expenseXferTotal（这段期间该账户的转账支出，如给同事现金）
            − incomeXferTotal（这段期间该账户的转账收入，如结清转回/一键归还/代管转回）
```

这个定义**不是近似值，是代数上的精确恒等式**：`incomeTotal − expenseTotal`（真实、
含全部 xfer）拆成「非 xfer 部分」和「xfer 部分」两半，挪一下项就是
`期初＋注资(非xfer)－开销(非xfer)－holdingLine＝期末(真实)`，任何情况下都成立，不会
出现"凑不平"的风险。「期末余额」本身（`closingBalance`）**没有改公式**，仍然是真实
账户余额（含全部 xfer 效果）——PDF 顶部信息栏和「收支汇总」最后一行显示的都是这个真实
数字，跟 App 里这个账户的实际余额对得上。

**已知局限（老实标注，别当 bug 修）**：`holdingLine` 是**这段报表期间**的净转出，不是
「当前代管账户还有多少余额」的cumulative口径——两者只有在「转账、消费、结清都发生在
同一份报表覆盖的期间内」时才完全相等（这正是老板实际最典型的用法：一趟行程/一个月内
给现金、花用、结清都发生完）。如果报表只覆盖某一个月、钱是上个月给的这个月才花完，
这一行代表的是「这个月净转出多少」而不是「现在还剩多少」——但上面那条恒等式在任何
情况下都精确成立，不会因为跨月而假平。行为要点：
- 币别不同的账户各自独立算这一行（这行本来就是该账户自己的 `xfer` 净额，天然按币种
  分开，不需要额外去重代管账户的币种）。
- 没有任何代管余额活动时 `holdingLine===0`，这一行不显示。
- 收入明细/支出明细两张表也换成 `!t.xfer` 过滤（`incomeFundTxs`/`expenseFundTxs`），
  支出汇总按类别的 `catMap`、附件编号 `pMap` 也都改用 `expenseFundTxs`——转账没有
  单据，天然不受影响，但改用 Fund 数组是为了不让转账混进类别汇总。
- 「收支汇总」说明栏原本区分「新增注资」/「代管转回」两种收入来源（2026-09-09 那次
  改造加的），现在「代管转回」这类 xfer 收入整个不出现了，说明栏简化成只报真注资的
  笔数。

自检：`check-expense-company.mjs`【35】（真走 `buildStatementPDF()`，`stubPdfLibs()`
桩掉 jsPDF/html2canvas；注资只算真收入的笔数、代管转回那笔不出现在 PDF 任何地方、
真开销「买菜」照常出现）；【46】（配平腿/「给同事现金」转账都不出现在支出明细行，
真支出照常出现，`incomeTotal` 这个真实统计仍沿用未过滤数组给恒等式用）；【48】
（手算 fixture：老板注资、Kuang 垫付 189.53、转 5000 顺带结清 189.53、再用代管现金花
506——支出/收入明细里没有任何转账字样（给X的现金/配平/结清/转入/转回），真开销照常
出现，「在同事手上的现金」＝US$4,304.47，且「期初＋注资－开销－在同事手上的现金＝
期末」这条恒等式精确成立；对照组：没有代管余额时这一行是 0）。**这三条自检里只有
【35】真的调用 `buildStatementPDF()`**（其余两条因为这个测试环境把外部网域全断了、
拿不到 jsPDF，改成照抄同一段算法直接验证——跟【46】原本的写法是同一个手法），做
false-red 时也确认过：把 `incomeFundTxs`/`expenseFundTxs` 的过滤条件改错（忘记排除
`xfer`），只有【35】那条「代管转回不出现在 PDF 任何地方」断言会变红，【46】/【48】
测的是各自重放的算法、抓不到 `buildStatementPDF()` 本体的真实回归——这是这类"因为
依赖外部库而改成照抄算法"自检的已知局限，不是这次新引入的，往这块加新自检时要留意
这一层，只信【46】/【48】不能替代【35】。


## ⚠️ 结清垫付：**只记代管账户那一条，绝不往来源账户补收入**（2026-09-11 用户拍板）

今天为这件事来回三轮，结论写死在这里，**后人不要改回去**。

**规则**：转现金给同事、顺带结清他垫付的旧账时——
- 转账两条腿记**全额**（老板输入多少就是多少，不缩水）
- 结清**只记一条**：代管账户支出（`xfer:true` ＋ `settleAdvanceIds`），隐藏不显示
- **不记**来源账户那条 `+settle.total` 的配平收入

**用户的理由**（原话）：「他本来那个记的那边就在我账里了，你在往我这里加一条他垫付的，
总账就加一条 189 了，这样肯定不对」「你都扣掉他垫付的了，你再还回来，死的是我吧」。
同事垫付那笔消费在报账进来当下就已经从来源账户扣过一次，结清时再加回来，在他看来
就是把同一笔钱记两次。

**已知且用户明确接受的副作用**：来源账户余额会比「手上实际现金」少 `settle.total`
（那笔钱在垫付时记过一次支出，又包含在交出去的现金里）。用户跟老板对账看的是
「注资 − 开销」那条线，不是拿账户余额去对钞票，所以这个差额对他不构成问题。
**这是取舍，不是 bug。**

卡片三个数仍然对得起来：给了 5000 − 花了 702.97（开销 513.44 ＋ 垫付 189.53）
＝ 还剩 4297.03。

自检钉死了两条：`check-expense-company`
- 「来源账户里一条『结清』记录都没有」
- 「结清只记在代管账户那一条」（新转账与旧资料转换两条路都验）
另外把原本断言「4 条腿／来源账户净变化 −5000」的旧断言改写成断言新形态
（3 条腿／净变化 −5189.53），**不是删掉**。


### 补救：清掉旧版已经加进来源账户的那条「结清」收入

新版不再产生它，但**用户现有资料里已经有一条**——光把显示藏起来没用，账上那笔还在。
所以有个 `openClearSettleCredits()`（弹窗里「🧽 清掉『结清』加进来的收入」）：

- 只清 **`type==='income'` ＋ `xfer` ＋ 带 `settleAdvanceIds`** 那一种
- 代管账户那条**支出**同样带 `settleAdvanceIds`，那一条是对的、**必须留着**（少了它代管余额会多算）
- 先预览（列出哪个账户、几笔、合计多少、清掉之后余额会减多少）再动手
- 从 `data.transactions` 移除记录，所以**每一条都落墓碑**（`tombstoneTx`）——不落的话云端同步会把它复活
- 可重复点，第二次提示「没有需要清掉的」

自检：`check-expense-company`【51】，含三组对照（代管那条支出留着、代管余额不变、
转账两条腿不动）＋ 墓碑断言 ＋ 可重复点。
