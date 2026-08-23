# 旅游类页面结构笔记（给 AI 改页面用，不给游客看）

读者：要修改这六个页面的模型。行号会漂移，**以 id/class 锚点为准**。
改完必跑 `python3 tools/check-html.py 文件名.html`（标签平衡 + siteLangUser key 检查）。
背景规则：`skills/bilingual-pages.md`、`skills/media-files.md`、CLAUDE.md 双语/媒体规则。

## japan-trip-2026.html（1190 行）
主行程手册，9天8夜大阪/京都/东京，双语（全站参考实现）。
URL: .../japan-trip-2026.html
结构：topbar(:268) → `nav#daystrip`(:275-289) → cover(:292) → `#flights`(:315)
→ `#hotels`(:417) → `#itinerary`(:469) → `.day#day01`~`#day09`(:472/498/580/618/
712/745/775/864/941，各含`.dh`日头/`.db`内容/`.dayfoot`雨天备案) → `#weather`(:974)
→ `#checklist`(:998) → `<script>`(:1046起)。
高频操作：
1. 加/替换景点卡片，类名 `.stop`（例 :479）：`.pin`(must★/side○/dine🍽)+`<h4>`
   （cn/en+可选`.star`）+`.gal`（Google Places 图片）+`.desc`(cn/en)+`.chips`
   （hours/verify/ok/book）+`.btn-map`。
2. 加/删一整天：除 `.day` 块本身，必须同步 daystrip 对应 `<a data-date
   href="#dayXX">`(:278-286)，并检查 topbar「9天8夜」(:269)与封面总天数文案。
牵一发：`applyLang/toggleLang/initLang`(:1048-1069)控全站cn/en；`markToday()`
(:1072起)靠`.day[data-date]`与`daystrip a[data-date]`日期字符串一致；`navSetup()`
(:1094起)靠daystrip href与section/day id一致；lightbox(约:1159)靠`.gal>img`结构。
双语：siteLangUser，旧key`handbookV2LangUser`仅读取兜底(:1061)。PWA：不适用。
已知坑：单行图片链接最长699字符；不跑check-html.py易漏闭合标签（曾真实翻车，
见dispatch.md教训2026-07-11）。
内容决定：D04备选=Cup Noodles池田+GIGO道顿堀，**用户2026-07-20确认有意为之**，
不要再把Nintendo Museum卡片/刷票清单项加回来（c158fec的commit信息写反了，勿信）。

## usj-disney-restaurants.html（823 行）
USJ/迪士尼后餐厅指南（大阪+东京各10家），双语，卡片支持按区域筛选。
URL: .../usj-disney-restaurants.html
结构：topbar(:164) → `nav#scstrip`(:174-177，"10 SPOTS"计数) → cover(:180)
→ `#osaka`(:199，`.sec-meta`计数:201 + `.areas`筛选按钮:202-208) → 10张`.card`
(:210起) → `#tokyo`(:457同构) → `<script>`（applyLang:733/toggleLang:738/
initLang:743-752/区域筛选:781-794/lightbox:797-820）。
高频操作：
1. 加/替换餐厅卡片`.card`（例:210）：`.ch`(`.num`①②③手打+区域名+`.bdg`徽章)
   +`.gal`+`.gal-hint`+`.cb`(`<h3>`+`.cuisine`+`.desc`+`.hours`+`.note`+`.links`)。
2. **必须手动同步 4 处计数**（无JS自动生成）：区块内①②③编号顺延、`.card`与
   `.area-chip`的`data-area`字符串须精确相等(筛选逻辑:791用===比对)、
   `.area-chip`内`<span class="n">`计数、`.sec-meta`「N家」(:201)、`#scstrip`
   「N SPOTS」(:175/176)、封面dates文案「大阪N家·东京N家—共M家」(:185)。
   新区域要新增`.area-chip`按钮。
双语：siteLangUser，旧key`restoV2LangUser`兜底(:746)。PWA：不适用。
已知坑：单行最长704字符；①②③手打非JS生成；本页计数同步点最多，最易漏改。

## restaurant-guide.html（673 行，旧页面，仅保网址不主动维护）
东京/大阪/京都35家餐厅指南，**仅中文单语**，中英文名写同一字符串（`&nbsp;`
分隔），非cn/en切换机制。
URL: .../restaurant-guide.html
结构：hero总数统计(:81"35")+**炸鸡餐厅编号交叉引用**(:86) → `.container`(:91)
→ 3个`.city-section`：东京(:94,"16家餐厅"在:97)、大阪(:353,"15家"在:356)、
京都(:597,"4家"在:600)，各含多个`.rest-card`。
高频操作：
1. 加/替换餐厅卡片（例:101-115）：`.rest-card`(`.rest-photo`)→`.rest-body`
   →`.rest-header`(`.rest-num-name`内`.rest-num`①②③手打+`.rest-name`)+
   `.rest-badges`→`.rest-desc`→`.rest-footer`(`.rest-hours`+`.rest-link`+
   可选`.theme-note`)→`.menu-links`。
2. **本页风险最高的坑**——加/删/挪卡片必须同步：a)城市内①②③顺延（每城市
   独立从①开始，见:104/:363/:607）；b)`.city-count`「N家餐厅」；c)hero
   `.stat-num`总数「35」(:81)；d)hero炸鸡编号交叉引用文字(:86，如「东京②④
   ⑬⑭⑮⑯·大阪⑧⑨⑭⑮·京都①②」)——按位置引用编号，编号顺延后**不会报错，
   只会静默失真**，改动前必须手动核对每个数字对应的卡片是否真含炸鸡。
双语：无，`<html lang="zh">`。PWA：不适用。
已知坑：单卡片常压缩成个位数行、单行最长359字符，嵌套span多，手改易漏闭合，
务必跑check-html.py。

## boss-dinner.html（599 行）
老板晚餐候选（大阪14家+东京13家），双语，按场地分组，无编号系统。
URL: .../boss-dinner.html
结构：topbar(:84) → `.page-h1`(:89) → `.page-sub`总数「大阪14家·东京13家」(:90)
→ `.sec-head`(:92) → 6个`h3.city-h`分组（各带`.note.amber`）：Conrad酒店内(:99)、
大阪外出(:120)、大阪中餐(:291)、东京·四季大手町(:323)、东京酒店内(:325)、
东京周边(:372)，各组下接
`.stop`卡片 → lightbox(:529) → `<script>`(lightbox:537/applyLang:579/
toggleLang:583/initLang:588-594)。
高频操作：
1. 加/替换餐厅`.stop`（例:105-118）：结构同japan-trip-2026的`.stop`（`<h4>`
   cn/en+`.star`+`.gal`+`.desc`+`.chips`+`.btn-map`），**无`.pin`图标列**。
   挂在正确的`city-h`分组之后。
2. 加/删后检查`.page-sub`「N家·M家」(:90)是否要更新。**无编号系统**，不存在
   restaurant-guide.html那种交叉引用坑，风险较低。
牵一发：applyLang/toggleLang/initLang与lightbox都是本页**独立复制的一份**，
不引用其他文件，改语言/相册逻辑要单独改这份。
双语：siteLangUser，无需旧key兜底(:590)，说明是key统一后新建的页面。
PWA：不适用。
已知坑：单行最长704字符；五页中改动风险相对最低。

## singapore-trip/index.html（约 1060 行）
新加坡手册，2026-09-23~27 五天四夜，7 人团（老板 Tan Chin Hooi 一行），双语。
URL: .../singapore-trip/ （旧的 8/1–5 那版行程已被这份覆盖，网址沿用不换）
结构：topbar → `nav`（含 `#flights` FLT）→ `#flights`(01) → 酒店区块（MBS 三房 +
分房名单 + MBS 贵宾接送 + 全程包车，都是 `.note green`）→ 特别节目 → `#itinerary`
`.day#day01`~`#day05`（`data-date="2026-09-23"`…）→ 午餐候选 → 老板晚餐备选(05)。
高频操作：
1. 每天卡片开头必须有 `.wxbox`（`.wx[data-wx="YYYY-MM-DD"]` + `.rainplan` cn/en），
   **加一天就要配一组**，否则 `tools/check-weather.mjs` 会红。
2. D1/D2–D4 用 `.stop` 卡；**D5 用时间线** `.tl > .ev`（`.ev.hot` 强调、`.ev.fin` 收尾），
   跟 japan-trip 同一套 CSS。
3. 餐厅卡分两种：正文里的是**午餐**候选；05 区块是**老板晚餐备选**（用户 2026-08-19
   明确：措辞不要用「请」）。
牵一发：天气条是前端现抓 open-meteo，改动它必跑 `node tools/check-weather.mjs`
（先起 `python3 -m http.server 8899`）；`jumpToToday()` 靠 `.day.today`。
内容决定（勿擅自回退）：
- Albert Centre 已删（周四休，用户 2026-08-19 说「吃不了就别放」）。
- 机场贵宾服务是樟宜 **JetQuay CIP**（服务名 Quayside Arrival/Departure）。
  旧的独立贵宾楼 60 Airport Boulevard **2025 年已拆**，现为 T2 内临时贵宾室、走
  T2 VIP Drive 下客，2027 年才有新楼——**别把旧地址写回去**。JetQuay 官方要求
  起飞前 120 分钟到，但**用户 2026-08-19 确认 MBS 的车就定 10:25、不改了**，
  故 D5 改写成「约 10:45 到、距起飞约 100 分钟，10:15 前集合完毕」——别再把
  「建议提早出发」写回去。
  以上查证于 2026-08-19，来源全被沙盒挡、只有搜索摘要，页面上已标「以 MBS 礼宾
  确认为准」；日后若拿到官网原文或 MBS 回覆，以那个为准。

## penang-trip/index.html（1166 行）
槟城家庭手册，2026-10-09~17 九天八夜，6 人（老板一家），双语。
2026-08-21 用户重新整理内容后重上传，本页**内容整批换成那一版**、设计沿用娘惹瓷砖那套；
同时按用户要求**拿掉右下角浮动圆钮**（`.fab` ＋ `.sheet` 快速跳转面板，CSS/HTML/JS 全删），
章节跳转只剩顶部吸顶 navstrip。
URL: .../penang-trip/
风格：娘惹瓷砖（teal #0e6b63 / coral #c4432c / gold），`.tiles` 是纯 CSS 菱格纹
（给 `.band` / `.sec-head .rule` / brand 小方块用，无外部资源）。手机优先：正文 16px。
结构（四个区块，编号 01–04，navstrip 四项与之一一对应）：
`header.topbar`(:339) → `nav.navstrip`(:343，4 个 a) → `.cover`(:350，含 `#countdown`
倒数，JS 算) → `.tip`(:366) → `#flights`(01,:375，4 张 `.bpass` ＋ 2 个 `.transit` ＋行李表)
→ `#dining`(02,:462，**11 张** `.rcard`) → `#places`(03,:720，`.pfilter` 筛选:727
＋ 4 个 `.pgroup` ＋ **9 张** `.rcard`) → `#weather`(04,:955) → footer(:979)
→ lightbox(:986) → `<script>`(:994)。
**已删除且不要加回**（2026-08-21 用户明确删的）：`#stay` 住宿区块、`#checklist` 必办事项
区块（连同 `.ck` 打勾 JS、`renderProgress()`、CSS）、`.fab`/`.sheet` 浮动圆钮与其 JS。
卡片统一形态（`.rcard`，餐厅与去处同一套）：`.galwrap`（`.gal` **每张卡 5 张图**，
`.gal-hint` 浮标，`.idx` 序号由 JS 加）→ `.rb`（`h3`+`.star` / `.addr` / `.desc` /
`.chips` / `.acts` 放 `.btn-map`＋`.btn-web`）。
高频操作：
1. **加去处卡片**：塞进对应 `.pgroup`（`data-cat="arcade|culture|outdoor|mall"`）里，
   卡片上写 `data-cat` 与所属组相同即可；漏写也不会坏（JS :1023 会从父 `.pgroup` 补）。
   现况：arcade 3（Neo Akedo／Pado Fantasyland／Tech Dome）、culture 2（极乐寺／升旗山缆车）、
   outdoor 1（The TOP Penang）、mall 3（Gurney／Queensbay／Sunway Carnival）。
2. **一切数字都是 JS 现算，页面里没有写死的计数**：navstrip 徽章 `[data-count]`、
   筛选 chip `[data-catcount]`、组标题 `[data-groupcount]`、卡片序号 `.idx`
   （`numberCards()`，按组从 01 顺延）、`#pcount` 显示条数。**加卡片不要去改任何数字**，
   改了反而错。**空分类的 chip 会自动 `hidden`**（JS 填完 catcount 后判 0 隐藏，
   配 CSS `.pchip[hidden]{display:none}`），所以不会出现「0」的按钮；加新分类要同时
   新增 `.pgroup` 与一颗 `.pchip`（两边 `data-cat` 字符串必须一模一样，用 === 比对）。
牵一发：`applyLang/toggleLang/initLang`(:996-1016，siteLangUser ＋ storage 事件同步)；
`spy()` 靠 navstrip href 与 section id 一致（现在只有 4 个 section，删区块必须同步删导航项）；
lightbox 从 `.gal>img` 的 src/alt 取图，`#lbImg` 的 alt 会跟着换（所以每张图的 alt
写成「名称 照片 N / Name photo N」，别写空 alt）。
天气区块（04,:955起）跟 singapore-trip 共用同一套「前端现抓 open-meteo」机制，但落地方式
不同——singapore 是挂在每天行程卡上的 `.wx[data-wx]`，penang **没有逐日行程列**，改成
`#weather` 区块里 `#wxNote`（状态/倒数提示，JS 现算「距出发还有 N 天」）+ `#wxdaily`
（默认 `hidden`，只有「进入16天预报窗口且抓到数据」才显示，内含 9 张
`.wxd[data-wx="2026-10-0X"]` 逐日卡，横向可滑动）。三态：①整趟在窗口外（现在就是，距10/9
约49天）→ 不发请求，只显示倒数 ＋ 下方 `.wx-grid` 历史气候平均；②进窗口抓到→渲染9卡，
个别天若API没给就用历史平均「常态」垫底（不留空卡）；③API失败→静默退回倒数提示+一句
「暂时取不到实时预报」，`#wxdaily`仍hidden。坐标
`latitude=5.4141&longitude=100.3288&timezone=Asia/Kuala_Lumpur`。改这段必跑
`node tools/check-weather.mjs`（该脚本已扩充为同时验 singapore + penang 两页，先起
`python3 -m http.server 8899`）。
双语：siteLangUser，新页无旧 key 兜底。PWA：不适用。
已知坑：
- 单行最长约 750 字符（图片外链）；地址等**卡片外壳文字也必须包 cn/en**（如七廊粿條湯的
  「（总店）／(flagship branch)」），否则英文模式下会露出中文。
- 沙盒抓不到 lh3.googleusercontent.com（403），截图自查时图片一律是空框、只显示 alt，属正常。
- 上传原稿里 Tech Dome 地址的 `&` 没转义（`Level 4 & 5`），搬内容时要改成 `&amp;`。
内容决定（勿擅自回退）：
- 外语行话已本地化：唐揚げ→日式炸鸡 / karaage→fried chicken、丼饭→盖饭、
  lor bak→braised pork rolls、Wagyu→和牛、Pizza→披萨、à la carte（中文侧）→单点、
  Amiyaki→网烤 / grilled meat sets。**用户重上传的稿子会把这些改回去，每次搬内容都要重扫一遍。**
- 「笼的传人」是用户 2026-08-21 改的店名（原「龙依北京烤鸭」），Queensbay Mall 描述里也引用了
  这个名字，别改回去。
- 「前2家是你发来的」那句留在 `#places` 的 amber note 里，是用户原稿的话。
- 2026-08-20 那版加过的 11 个电玩城／亲子地点（Games4Life、Timezone、CYC、Penang Bowl、
  Kart Hauz、UFOREA、Jungle Jumpscape、Adventure Zone、Wonderfood、Entopia、Molly Fantasy
  以及壁画街／海滩／ESCAPE／倒立博物馆）**用户 2026-08-21 全部删掉了，不要加回来**。
- 航班区块只有登机牌＋转机条＋行李表，用户重上传时把之前的三条 note（6人名单确认、
  末段座位分开、订位代号 EC966J）都拿掉了，别自己补回去。

## xiamen-trip/index.html（约 830 行）
厦门自由行手册，2026-08-24~27 三晚四天，2 人（HEW/CHERN YANG ＋ TAN/CHIN HOOI），双语。
2026-08-22 新建，**CSS 与 JS 整套复制自 singapore-trip/index.html**（同一套 `.day`／`.stop`／
`.bpass`／`.tl`／lightbox／天气条），改动只有坐标与常态文案。
URL: .../xiamen-trip/
结构：topbar → `nav#daystrip`（FLT/STAY/INFO ＋ D1–D4）→ cover → tip → `#flights`(01，
去程 MF896 金边→厦门、续程 MF8705 厦门→槟城 ＋ 行李表 ＋ 槟城段说明) → `#hotel`(02，安达仕) → `#tips`(03，4 张 `.stop`：包车／上网／天气／入境) → `#itinerary`(04) → `.day#day01`~`#day04`（`data-date="2026-08-24"`…）→ `#eats`(05，晚餐备选三家，**不排进行程**)→ footer。
高频操作：
1. 每天开头一组 `.wxbox`（`.wx[data-wx]` ＋ `.rainplan` cn/en），加一天就配一组。
   坐标 `latitude=24.4798&longitude=118.0894&timezone=Asia/Shanghai`。
   ⚠ `tools/check-weather.mjs` **目前只验 singapore 与 penang 两页，没有涵盖本页**——
   改天气逻辑时要嘛手动用浏览器验，要嘛顺手把本页加进那个脚本。
2. D1–D3 用 `.stop` 卡，**D4 用时间线** `.tl > .ev`（`.ev.hot` 强调、`.ev.fin` 收尾），
   时间线底下接两个方案：A 乌糖（`.stop`）／B 安达仕早餐（`.stop`）。
3. 餐厅（乌糖沙茶面／第稻／闽和南／宴遇／上青本港海鲜／海海人生）与
   南普陀寺、万象城、SM 三个地点是**用户指定**的，地图按钮用用户给的**高德短链**
   （`surl.amap.com/...`）；其余地点用 `https://uri.amap.com/search?keyword=<编码>`。
   **本页不准出现 Google 地图链接**（2026-08-22 用户明确要求全部走高德）。
双语：siteLangUser，新页无旧 key 兜底。PWA：不适用。
已知坑：
- 沙盒连不上 lh3.googleusercontent.com 与 google.com（curl 与 `tools/check-images.py` 一律
  URLError，singapore-trip 这种已知好页也一样），**图片有没有失效只能靠 CI**
  （`check-images.yml` 支持 workflow_dispatch，`file` 输入填单一页面）。
- 第稻客家菜馆在 Google 地图上查无照片（换过四组关键字，抓回来的都是别家同名店：
  台湾的稻鄉村、海沧的另一家）。曾用「所在商场 SM 三期」的照片顶替，**用户 2026-08-22
  说「照片不是食物的呢」，已整个拿掉**，卡上只留一段说明请他给图。
  拿到用户的菜色照片前，别再拿商场照或同名店照片填进去。
内容决定（勿擅自回退，均为 2026-08-22 用户第二轮反馈后定案）：
- 乌糖沙茶面的 ⭐4.4 是**大众点评**分数（Google 只有 4.1／48 则），卡片上已标明出处。
- **D2、D3 都是中午 12:00 才出门**（用户：「我们没用那么早出门 估计12点后」）。
  别再把早上的行程加回去。D2 第一站必须是乌糖沙茶面——它 14:30 打烊，是唯一有时限的一站。
- **鼓浪屿与轮渡码头已全部删除**（用户：「那些鼓浪屿码头这些不必」），
  tips 里的船票那条、天气条里「台风停航」的说法也一并改掉了，别加回来。
  封面图因此从鼓浪屿换成白城沙滩／环岛路（行程里真的会去的地方）。
- 酒店是**厦门安达仕（湖滨东路101号）**，就在万象城（99号）隔壁——D3 晚餐闽和南
  在万象城 3 楼，走路即到，这是 D3 把万象城排在最后的原因。
- D4 排同安饭店（金尚店）不是随便选的：它 10:30 开门、离高崎机场 15 分钟，
  是唯一能塞进 14:05 起飞前的一餐；11:45 离席是硬时间。因为跟「12点后出门」冲突，
  卡片下面配了一张「不想早起就跳过、11:15 直接去机场」的 `.backup`。

### 2026-08-22 第三轮反馈（用户口径，勿擅自回退）
- **晚餐一律不排**：「晚餐不必安排 一般我们都跟朋友出去一起」。好食来／闽和南／宴遇
  三张卡从 D2、D3 的行程里拿掉，搬进新的 `#eats`(05)「餐厅清单」当备选；
  D2、D3 的 dayfoot 各留一条「晚餐不排，跟朋友出去」。别再把晚餐塞回逐日行程。
- **全程包车**：tips 的交通那条整条改写成包车（列各段车程），**地铁、打车费、叫车 App 全部删掉**。
- **手机支付那条已删**：用户「有现金」，不要再加回「支付宝绑外卡」那套。
- **南普陀寺不必预约**：用户「我们去很多次了 说是外国人没用微信就行」。tips 的预约卡已删，
  D2 卡片改成「不用预约，外籍旅客现场说一声就能进」，D2 dayfoot 的预约提醒也删了。
  （厦大入校要预约是另一回事，那条保留。）
- **乌糖沙茶面是「第一天必吃」的惯例**（用户原话），所以固定在 D2 第一站；
  用户问「上机前又要去吃需要预留多少」→ 页面 D4 方案 A 写死：从酒店出发算 **1小时30分**
  （酒店→民族路20分＋吃40分＋民族路→T3 25–30分＋缓冲10分），11:30 必须离席。
  方案 B 同安饭店只要 1小时10分（离机场15分钟）。这两个数字是回答用户提问的正本。

### 2026-08-22 第四轮反馈
- **离境日只给两个方案**（用户：「机场出发只给两个选项 乌糖沙茶面或者酒店早餐」）：
  D4 = A 乌糖（1小时30分，11:30 必须离席）／B 安达仕早餐（11:15 出发，11:35 到 T3）。
  **同安饭店已从 D4 移进 `#eats` 餐厅清单**，别再排回离境日。
- **餐厅清单增至六家**：上青本港海鲜（后江埭路，人均¥220，携程4.7/139）、
  海海人生·上青杰哥主理（上青对面，海鲜高定，人均与时间未查到）、好食来、闽和南、宴遇、同安饭店。
- **抓图：高德通道试过了，不通**（用户：「可以去高德还是大众点评上找 不必一定要 Google 吧」）。
  建了 `tools/fetch-photos-amap.mjs` ＋ workflow 的 `source` 输入，两次 CI 试跑结论：
  高德手机版与桌面版页面上都没有照片元素，照片只走 App 端接口；拦截网络回应也只有界面图。
  第一版还因为把 `img.alicdn.com` 放进白名单而**假成功**（回报抓满 5 张，全是 48x48 图标）——
  过滤已收紧。**别再拿这条通道烧 CI**。
- 目前**第稻客家菜馆**与**海海人生**两张卡没有照片，卡上写明请用户从高德／大众点评截图给。
  上青本港海鲜的照片是 Google 抓到的（4.8／5则，照片 8 张可用）。

### 2026-08-23 第五轮反馈（用户列出「移除这些」＋加一个地点，勿擅自回退）
- **加 D2 一站：厦门园林植物园（万石植物园）**，排 15:30，高德短链
  `https://surl.amap.com/5YleOGyNa3s`。查证结果（researcher，2026-08-23）：门票 ¥30／人、
  **现场售票处收现金**（用户没微信，这条是关键）、旺季 06:30–18:00、
  **雨林世界喷雾 14:30–16:30**（所以排 15:30）、观光车单程¥5/通票¥10、
  逛精华约 2 小时、携程 4.6。**能不能刷境外信用卡查不到**，卡上标了 ⚠。
  南普陀→植物园 直线 2 公里、车程 10–15 分钟。
- **删掉的卡（用户点名，别再加回来）**：D2 的「厦门大学·白城沙滩·环岛路」、
  「中山路步行街＋八市」；D3 的「沙坡尾夜逛」；D2/D3 底下的 `🌙 晚餐` dayfoot 两条；
  `#eats` 的**好食来大排档**与**同安饭店**两张卡。
- 连带改掉的（删卡后会自相矛盾的地方，改动理由记着）：D2 标题改「沙茶面·南普陀寺·植物园」、
  D2 rainplan 改成讲植物园露天、D2 路线 dayfoot 改成 酒店→民族路→南普陀→植物园、
  D3 rainplan 拿掉「可选夜逛」、D1 深夜那段不再推好食来、tips 里老城巷子那句拿掉中山路/八市、
  餐厅家数「三家」→「四家」（现存：闽和南／宴遇／上青本港／海海人生）。
- 封面大图仍是白城沙滩那张（当风景图用，不代表行程有排）。

### 2026-08-23 第六轮反馈（勿擅自回退）
- **D3 午餐：第稻客家菜馆 → 临家闽南菜（SM新生活广场店）**（用户：「我之前搞错了」）。
  高德短链 `https://surl.amap.com/8jxU2bk1m0yg`，Google 4.7，照片 4 张（CI 抓到）。
  D3 标题同步改「闽南菜 · SM · 万象城」。查证到的：厦门本地连锁、2004 年创、
  「老厦门宴客食堂」定位、2017 金砖会晤接待、人均约 ¥100（该分店确切数字查不到，
  同品牌 ¥88–125）。**没查到的（卡上已标 ⚠，别当成已知）**：该分店铺号
  （搜到「红宝石馆 5 楼 C500」，另一份资料写 SM 城市广场，互相矛盾）、
  本店营业时间与电话、点评平台评分、有没有英文菜单。
- **用词禁区**（用户点名要换掉的说法，别再写回去）：
  - 不要写「明天中午 12 点才出门，今晚就直接休息、睡饱」这类叫人睡觉的话。
  - 不要用「外籍旅客没有微信的…」「你们没有微信也进得去」这种把客人标成外国人／
    没微信的写法。要讲免预约就直接讲「不用预约、不用买票」「门口买票就好，收现金」。
  - 包车卡标题不要「不用叫车不用地铁」，就写「全程包车」。
- **MH 座位（用户指出写错了，已按电子机票改正）**：MH1145 与 MH762 两段都是
  **HEW/CHERN YANG 01F**、**TAN/CHIN HOOI 01C**（原本写成「两人座位 01F」）。
  MF 段的座位是对的：MF896 41K／41J，MF8705 12A／12C。
  电子机票渲染图在 scratchpad（`*_MF_0.png`／`*_MH_0.png`），要再核对时看那个。

