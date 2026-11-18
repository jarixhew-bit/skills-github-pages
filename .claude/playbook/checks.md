# 自检清单（正本）

从 CLAUDE.md 铁律 4 搬出来的明细（2026-11-18）：CLAUDE.md 每个 session 都整份载入，
这份清单占了它将近一半却只在「加/改/查某个 check」时才用得上，所以按 maintenance.md
「CLAUDE.md 只放铁律与路由」下沉到这里。原则（建东西必配自检、被用户抓到的错变自检）
仍在 CLAUDE.md 铁律 4；实际有哪些检查以 `ls tools/check-*` 为准，下面的说明可能落后。

总跑器：`python3 tools/check-all.py`（`--list` 看项目、`--only 名字` 单跑、
`--with-network` 连外链体检）。并发下浏览器类偶有超时，单独重跑能过就是偶发。

## 清单与各项来由（原文照搬，按加入时间流水记录）

现有四十一个，全部挂 CI（2026-11-10 加 `check-home.mjs`：总入口首页的倒数天数用固定假日期对手算答案、每个链接的文件都在、行程最后一天与 `trips.py` 一致、还没走完的手册都上了首页；2026-11-08 加 `check-trip-hours`：雅加达手册五家店写「营业时间请订位时确认」等于没查，被用户抓到；2026-11-05 加 `check-flight-live`：新加坡／雅加达机票卡与老板 App 航班项的实时状态框，浏览器故意设成洛杉矶时区，验时刻按出发机场当地显示、没网退缓存、没缓存整框隐藏；同日加 `check-photo-dupes`：同一张卡里不准有重复照片——Jewel 卡 1、2 号网址不同却是同一张图，被用户看出来，所以要下载比感知哈希、只能在 CI 跑；同日加 `check-map-links`：还没走完的手册不准用 Google 地图搜索链接／短链，一律用地点页——搜索链接会落到停车场、私人飞机点；2026-11-04 加 `check-trip-offline`：新加坡／雅加达手册的离线缓存，断网后两本都要打得开；2026-11-03 退订删掉每日 Telegram 新闻摘要，连带删掉只服务它的 `check-morning-positions`——每日新闻对 80/20 二十年持有不可操作，用户原话「其实这个我也没啥看」，而且它挂了两次都没人发现；改由 butler-bot 的管线看门狗负责「停更就推你」；2026-10-30 加 `check-flight-probe`：查航班工具 `flight-probe.yml` 的解析器，fixture 是真实 Google Flights 页面文字，验航班号切分与跨时区全程；该 workflow 每周三实跑一次，抓不到就开 issue；2026-10-29 `check-allocation` 同脚本再管美国资产遗产税提醒（≥$5万，保守：非白名单代码与现金都算，不新增检查文件）；同日加 `check-drawdown`：VOO 大跌开枪提醒（≥20% 一级、≥30% 二级、<15% 才解除，上一状态取自「有没有开着的同名 issue」不提交状态文件），由 `drawdown-check.yml` 周一至五 UTC 22:30 实跑，`--selftest` 手算阈值／滞后／窗口／文案无持仓数字；同日 `check-allocation` 改成标普一边 = VOO+CSPX+VUAA 合计；2026-10-29 加 `check-allocation`：VOO/IBIT 占比偏离政策的纯函数＋`--selftest`，由 `allocation-check.yml` 每月 1、15 号实跑；2026-10-26 加 `check-flex-stale`，并把一直漏在 `check-all.py` 外面的 `check-decision-log` 收进去；2026-10-07 加 `check-board`；2026-09-30 同日再加 `check-fitness`；按 `tools/check-*` 实数重数：原写二十四个已与实际脱节，成对的 boss/boss-2、gamebot/gamebot-logic 各算一个、`check-all` 是总跑器不算；同日加了 `check-map-coords`）：
静态类 `check-html` / `check-secrets` / `check-rules` / `check-rule-homes`（查同一条规则
有没有被复述进第二个档案）/ `check-images` / `check-ai-note` /
`check-pwa-scopes` / `check-workflows` / `check-ci-notify` /
`check-generated`（查「生成又提交进仓库」的产物有没有跟源文件脱节）/
`check-map-links`（查还没走完的手册有没有 `google.com/maps/search`／`maps.app.goo.gl`，只认地点页；真找不到地点页的进脚本里的白名单、附原因）/
`check-trip-hours`（还没走完的手册不准把查营业时间推给读者——「营业时间请…确认」「请出发前在 Google 地图上确认」这类中英写法都拦；每张餐厅卡要写出那几天的日期＋确切时刻；查营业时间走 `fetch-photos.yml`，RESULT 带 `hours`；2026-11-09 起也拦制作者交代工作的口吻，如「逐家查好的」「were looked up」——用户：「要写成读者看的角度」）/
`check-photo-dupes`（还没走完的手册，同一张卡任两张图的 dHash 距离 ≤6 就算重复；另有第二级「近似」——同一处、几乎同一个站位各拍一张，dHash 抓不到（乐城 1、2 号距离 23，用户第二次自己看出），改用 ORB 特征点对得上 ≥25 个就报红；被 Google 挡时整轮罢工不报红；PR 改到手册时跑，check-images.yml 每周一再扫一次）/
`check-map-coords`（查槟城手册总地图：每张带地图链接的卡片都有坐标、都在槟城州、`coords.json` 没孤儿、地图区块与 OSM 署名还在——卡片加了坐标没补，那一家会安静地不上图）/
`check-flight-times`（查旅游手册航班卡的飞行时长有没有把时差算进去——2026-09-18
新加坡手册两段都是拿两地当地时刻直接相减，各错一小时，是用户自己看出来的）/
`check-news`（把 requests/feedparser 打桩，验新闻的两处易错：译文分批时**位置不会
错位**——错位会把 A 公司的消息安到 B 公司头上；以及同一条新闻**跨区块去重**）/
`check-flex-stale`（验 `trading/index.html` 的「持仓底数过期」警告：Flex 天生落后
一个交易日属正常，判据必须数 `nav_series` 的交易日而不是日历天数——算日历的话每个
周一都误报一次，警告就没人看了）/
`check-gamebot`（＋`check-gamebot-logic.mjs`：把安卓 API 打桩，用假屏幕实跑手机脚本，
查语法查不出的行为问题）/ `check-boss-sw`（同一路子：把 self/registration 打桩，派发假的 push 事件，验老板 App
的 Service Worker 收到推送怎么弹——真浏览器发不出 push 事件，这段只能这么验）；浏览器类 `check-fitness.mjs`（减脂训练 App：用固定假历史验加重／减重／减量周建议是不是手算得出的数、备份导入不重复）/ `check-expense-company.mjs` /
`check-staff-page.mjs` / `check-inventory.mjs` / `check-board.mjs`（验 `trading/board.html` 自选股看板的涨跌%／损益／合计／排序／绿涨红跌／无密码不报错，固定 fixture 手算）/ `check-fund.mjs`（验 `trading/fund.html`
那些前端现算的钱的数字：夏普、回撤、VaR、再平衡差额，用手算得出答案的 fixture 去对；
两个数据档全用固定 fixture 拦掉，所以不随每天行情变动而误报）/ `check-weather.mjs`
（验新加坡与槟城手册的天气条：拦住 open-meteo 造出「有预报／超出预报窗口／API 挂掉」
三种情境，确认每天读的是自己那一格、不会错位，也不会开天窗；2026-09-18 起一并守
两本手册的**实时空气质量条**——新加坡拦 data.gov.sg（良好／中等／不健康／API 挂掉四种
读数，PSI 超过 100 一定标红，那是「户外改室内」的触发线）；槟城拦 open-meteo 的空气质量
接口（同样四种，美国 AQI 口径：超过 100 标提醒色＝老人小孩少户外，超过 150 标红＝整团改室内）/ `check-flight-live.mjs`（机票卡与老板 App 航班项的实时状态框：拦 butler-bot `/flight-status` 造出准点／延误／取消／落地／还没到起飞前 48 小时／接口 500／离线有缓存，三处页面那段 JS 必须一字不差）/ `check-trip-offline.mjs`（新加坡／雅加达手册「没网也打得开」：在线只开新加坡那本，断网后两本连同预抓的照片都要出来；恢复上网要拿到服务器新版——SW 不能把「改了刷新就同步」变成永远看旧版）/ `check-penang-v3.mjs`
（槟城 v3 版面：票券／今日模式／一页一天／滑卡／给司机看，用固定假日期实跑）/ `check-boss.mjs`
＋`check-boss-2.mjs`（同一份自检拆成前半／后半两个档并行跑，共用
`tools/lib/boss-check-kit.mjs`；守老板 App 的安全不变量：viewer 身份下写操作控件
必须一个都不进 DOM，**并带 admin 对照组**——没有对照组的话，整个管理功能坏掉也会
显示「通过」）（跑前要先起
`python3 -m http.server 8899`，沙盒里加 `CHROMIUM_PATH=/opt/pw-browsers/chromium`）；
线上类 `check-live`（每天验线上页面＋各 PWA 的 SW 档是不是 main 那一版，CI 每天定时跑；
网页版合并后也可直接本地跑来验上线，见 publish-pages 第 6 步）＋ `fetch-photos`（抓图通道，结果会写回触发分支）
＋ `refresh-photos`（2026-09-18 建，**检测之外还会动手**：每周一体检后自动把
死掉的图换成同一家店新抓的照片并开 PR，用户只要瞄一眼点合并。它带对照组守门——
一次死掉过半时先抓一张新图来探，新图也打不开就判定是这台机器被 Google 挡了、
整轮罢工不动任何文件，否则一次误判会把整本好图换掉。补图＝机器的事，
挑图「哪张好看」仍然是人的事）。
