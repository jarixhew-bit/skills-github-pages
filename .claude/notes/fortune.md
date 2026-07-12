# fortune.html 结构笔记（给 AI 改页面用）

读者：要修改这个占卜页面的模型。行号会漂移，**以函数名/id/class 锚点为准**。
背景规则：`skills/pwa-pages.md`（PWA 三件套通则，本页只部分符合，见下方 PWA 一节）。

一句话：单页占卜工具「玄機閣」，含紫微斗數命盤、塔羅牌、八字命理、周公解夢四个
子功能，纯前端算法（无后端、无 API），繁体中文单语，娱乐用途（页尾已声明「僅供
娛樂參考，不構成任何人生建議」）。
URL: https://jarixhew-bit.github.io/skills-github-pages/fortune.html
配套文件：`fortune-manifest.json`（PWA manifest）、`fortune-icon.svg`（图标）。
**没有** `fortune-sw.js` 或任何 Service Worker 文件——见下方 PWA 一节。

## 结构地图（fortune.html，2135 行）
- `<html lang="zh-TW">`(:2)，manifest 链接(:7)，apple-touch-icon(:11)
- `<body>`：`<canvas id="bg-canvas">` + `#rune-container`（背景动画层，:418-419）
- `<header>`(:421) + `<nav>`四个分区切换按钮(:426-431，`onclick="showSection(id,
  this)"`)
- 四个功能区块（`.section`，通过 `showSection()` 互斥显示）：
  `#ziwei` 紫微斗數(:433起) → `#tarot` 塔羅牌(:478起) → `#bazi` 八字(:505起)
  → `#dream` 解夢(:584起)
- `<script>`(:613起)：导航`showSection()`(:615)、通用工具`loading/showResult/
  rng/pick/seed`(:623-640)、农历换算表`LUNAR_BASE_DATES`等(:645-798)、紫微算法
  `calcZiwei()`及其辅助函数(:706-1346区间)、`tarotCards`牌义数据(:1048)、
  `drawTarot()`(:1346)、八字算法`calcBazi()`及辅助函数(:1445-1920区间)、
  `dreamKeywords`解夢关键词库(:1854)、`interpretDream()`(:1921)、背景动画
  `initBackground()`(:1993起到文件末尾)。

## 高频操作
1. **加一张塔罗牌 / 改牌义**：编辑 `tarotCards` 数组（起于:1048），每张牌是一个
   对象（含牌名、正逆位含义等，具体字段以数组内现有条目为准）。抽牌逻辑
   `drawTarot()`(:1346) 从这个数组里随机 `pick()`，加新条目不需要改抽牌逻辑本身。
2. **加一个解梦关键词 / 梦境符号**：编辑 `dreamKeywords` 对象（起于:1854，
   `{关键词: 解释}` 或类似结构），`interpretDream()`(:1921) 用
   `Object.entries(dreamKeywords)`(:1937) 遍历匹配用户输入的文字，加新键即可，
   若都不匹配会退回 `generalDreamInterp`(:1914) 通用解释数组。
3. **改紫微/八字算法本身**：这是本页最复杂、最容易改错的部分（涉及农历换算、
   真太阳时、干支、五行局等一整套排盘算法），函数之间调用链长（如`calcBazi()`
   :1679 依赖 :1445-1670 一串辅助函数）。**改动前务必先搞清楚要改的是哪一个
   辅助函数、它的输入输出契约是什么，不要凭感觉改中间某一步**——这类算法牵一发
   动全身，改错一个环节会导致后面所有排盘结果连锁出错且不易被发现（页面不会
   报错，只会算错）。没把握时建议先加日志/console.log 核对中间值，或找一组
   已知正确答案的生辰做回归测试。

## 牵一发动全身
- `showSection(id, btn)`(:615) 通过 class `active` 切换四个 `.section` 与四个
  `nav button` 的显隐，新增第五个功能分区需要：加一个 `nav button`
  （`onclick="showSection('新id', this)"`）+ 一个 `.section` 容器，两者 id 要对应。
- `rng(seed)`(:631) 是全站占卜结果的伪随机数生成器（seeded），紫微/塔罗/八字/
  解梦如果依赖「可重现的随机结果」都过这个函数，不要在局部改用 `Math.random()`
  直接替代，否则同一输入会得到不同结果，破坏可重现性。
- 农历换算表 `LUNAR_BASE_DATES`(:645)、`LEAP_MONTHS`(:665)、`MONTH_SIZES`(:686)
  是紫微与八字两个功能共用的农历基础数据，改一处会同时影响两个功能。

## 双语机制
无。整页繁体中文（`lang="zh-TW"`），无 initLang/toggleLang/data-cn/data-en，
无 siteLangUser。不在 CLAUDE.md 双语页面规则的适用范围内（该规则针对给中英文
读者共用的页面，本页目前只服务中文读者）。

## PWA 关键点（本页只部分符合三件套，不要照抄 expense-tracker 的假设）
- 有 `fortune-manifest.json`（:1-18，`start_url`写死为绝对路径
  `/skills-github-pages/fortune.html`，与 expense-tracker 用相对路径不同，
  改仓库路径/改用户名时要注意这里是硬编码的）。
- 有图标 `fortune-icon.svg`，`purpose: "any maskable"` 二合一（icons数组只有
  一条，跟 expense-tracker 分开写 any/maskable 两条不同写法，效果类似）。
- **没有 Service Worker**：全仓库搜索确认 fortune.html 里没有
  `navigator.serviceWorker.register(...)` 调用，也没有 `fortune-sw.js` 文件。
  意味着本页可以「添加到主屏幕」（因为有 manifest），但**没有离线缓存能力**，
  断网时无法打开。如果之后要给它补上离线支持，需要新建 `fortune-sw.js` 并在
  页面里注册，参照 `expense-tracker-sw.js` 的写法（但要评估：本页含大量运行时
  算法/大数据表，SW 版本号升级规则要重新设计，不能直接照抄 expense-tracker 的
  network-first HTML 策略而不假思索）。

## 已知坑
- 文件较大（2135行）且算法部分密度高，改紫微/八字相关代码前建议先用 Explore
  或 Grep 定位具体函数范围，不要整档通读。
- 背景动画 `initBackground()`(:1993起) 用 canvas 逐帧绘制，与占卜功能逻辑无关，
  纯装饰，改占卜算法时不用管这部分；反过来改动画效果也不会影响占卜结果。
- 页面声明「僅供娛樂參考」，改文案时保留这类免责声明，不要因为「简化」而删掉。
