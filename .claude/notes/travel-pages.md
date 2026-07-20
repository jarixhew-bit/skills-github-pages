# 旅游类页面结构笔记（给 AI 改页面用，不给游客看）

读者：要修改这五个页面的模型。行号会漂移，**以 id/class 锚点为准**。
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
