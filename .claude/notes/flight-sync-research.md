# 研究笔记：VariFlight（飞常准）能否「连接」到 butler-bot 自动同步行程

> **结论已落地（2026-09-27）**：走「Google 日历私密 iCal 地址」这条路，已实作在
> butler-bot 的 `src/cron/calendar_sync.js`（commit 43fc451）。
> 关键事实不是查出来的，是用户自己说的：**他飞常准里的「行程加进日历」开关本来就开着，
> 航班号一加进行程，Google 日历就多一条**——所以不需要读飞常准，读他的日历就够了。
> 下面第 2 节查到的「App 有日历导入开关」正是这条路的依据；第 3 节的 TripIt/Gmail
> 几条方案因此都不必要了，留着当万一日历这条断掉时的备选。

**查证日期**：2026-09-27
**背景**：YANG 用飞常准 App 管理自己的所有航班行程；想知道自建 Telegram 管家 bot
（Cloudflare Worker，目前用 AeroDataBox 按航班号+日期查状态）能不能自动从飞常准
App 里把「他接下来要飞哪几趟」这份行程列表读出来，不用人工输入航班号。

**环境限制说明**：本次查证中 `variflight.com`、`dataworks.variflight.com`、
`apps.apple.com`、`tripit.com`、`help.tripit.com`、`flighty.com`、
`doc.aerodatabox.com`、`cloud.tencent.com`、`jingyan.baidu.com` 等域名被沙盒出网
代理直接拦截（`EGRESS_BLOCKED`），无法用 WebFetch 抓取原始页面全文。以下结论建立在
WebSearch 返回的搜索引擎摘要（多为对官方页面/百度经验/腾讯云等二手转述的抓取快照）
之上，凡是没有直接原文可核对的地方，已在对应条目标注「未能直接核对原文，据搜索
摘要」。

---

## 1. VariFlight / 飞常准有没有面向个人开发者的公开 API？

**结论：有一个个人开发者也能申请的公开 API/MCP 平台（`mcp.variflight.com`，即
「飞友 AI 开放平台」），但它卖的是"航班公开数据查询"（航班状态、票价、机场天气等），
不是"读取某个用户 App 账号里的个人行程列表"。这两者是完全不同的东西——VariFlight
没有后一种（授权读取个人行程）的机制。传统企业级 API（`variflight.com/api`）则明确
走"联系商务、定制方案"路线，价格不公开、需要接洽。**

- **个人可申请的档**：VariFlight 的「AI Open Platform / 飞友 AI 开放平台」
  (`https://mcp.variflight.com/`, 也见 `https://ai.variflight.com`)：
  - 注册即可创建 API Key，每个 Key 有 100 次免费调用；新账号另有 ¥50 试用额度
    （来源：WebSearch 摘要，指向 `https://mcp.variflight.com/`、
    `https://github.com/variflight/variflight-mcp`、
    `https://dataworks.variflight.com/blog/smarter-travel-with-ai-introducing-variflight-s-aviation-mcp-server/`）。
  - 提供 7 类核心能力：航班状态、航线、中转、机场天气、实时机位、舒适度、
    最低票价查询（来源同上）。
  - 这套东西是给 AI Agent／开发者查询"公开航班数据"用的（例如问"MU5137 今天准点吗"），
    **不涉及"这是谁的行程""这个人接下来订了哪几趟机票"**——它没有这个概念。
  - 未能直接核对 `mcp.variflight.com` 原文（域名被拦截），以上基于 WebSearch 摘要。

- **企业级 API**：官网 `variflight.com/api`、`dataworks.variflight.com` 系列页面
  （域名被拦截，无法直接读取全文，以下据 WebSearch 摘要）：
  - 官方商务联系方式：邮件 `business@VariFlight.com`，电话 `4006-350-787`
    （来源：WebSearch 摘要，指向 `https://variflight.com/api?AE71649A58c77=`）。
  - DataWorks 页面描述为"根据数据需求灵活定价，从初创到企业都能适配""提交需求后
    48 小时内联系、可配 14 天免费试用"——即典型的**联系销售、按需报价**模式，没有
    公开价目表（来源：WebSearch 摘要，指向
    `https://dataworks.variflight.com/blog/variflight-s-api-solution-flight-tracking-for-air-freight`
    与 `https://dataworks.variflight.com/products/flight-status-data/`）。
  - 没有查到"最低消费额""企业资质要求"的具体数字或条款原文——**这部分查不到**，
    需要直接联系商务才能确认。

- **关键区别：授权读取个人行程 vs 卖航班数据，VariFlight 属于后者**
  - 没有查到 VariFlight 有任何 OAuth／授权机制允许第三方 App 说"请把 YANG 账号里
    未来的行程列表给我"。它的 API 产品（无论 MCP 开放平台还是企业版）设计上都是
    "你给航班号/日期/城市对，它给你数据"，而不是"你给用户身份，它给你这个用户的
    行程"。
  - 这点在所有搜索到的产品描述里都是一致的（DataWorks 各篇博客、MCP 平台介绍、
    企业 API 页面摘要）——**没有任何一处提到"个人行程读取""账户级 OAuth 授权
    第三方"**。查不到不代表 100% 不存在（原始页面被拦截未能逐字核对），但目前
    所有可得信息指向"没有"。

---

## 2. 飞常准 App 本身有没有导出行程的功能？

**结论：App 内有把行程加进手机系统日历的开关，也有分享行程（转发给别人看）的功能，
但都是"人看的"（图片/文字/日历事件），不是给程序读的开放接口（没有 ICS 订阅链接、
没有邮件推送行程变动、"网页版"只是航班查询站不是个人行程管理后台）。**

逐项：

- **添加到手机系统日历**：查到"日历导入行程"开关，开启后圆点变绿即代表生效
  （来源：WebSearch 摘要，转述自 `https://jingyan.baidu.com/article/27fa7326e7db8907f8271fdf.html`
  这类操作教程；原始页面因域名被拦截未能直接核对全文）。这类"日历导入"本质是
  App 自己往系统日历写日历事件，跟"给第三方程序一个可订阅的地址"是两回事——没有
  查到它对外暴露的是标准 ICS 文件还是 App 私有格式的日历事件。

- **分享行程**：查到"可以通过短信或微信把航班动态分享给朋友""一键共享行程"的描述
  （来源：WebSearch 摘要，转述自 `https://cloud.tencent.com/developer/news/932225`
  等页面；原文未能直接核对）。从描述看这是生成一段文字/卡片发给别人看，不是给出
  一个机器可解析的结构化链接。

- **邮件订阅/邮件推送行程变动**：**查不到**。搜索范围内（官网、应用商店描述、
  各类使用教程）没有出现"邮件订阅""行程变动邮件推送"这类功能的任何提法。

- **ICS / iCal 订阅链接**：**查不到**。没有搜到飞常准提供类似 TripIt/Flighty 那种
  "复制一个日历订阅 URL，让 Google/Apple 日历自动跟着更新"的功能。目前唯一确认的
  是"日历导入"这个开关（写入系统日历一次性事件），未见持续订阅机制的证据。

- **网页版**：`variflight.com`/`wap.veryzhun.com` 首页及"我的-历史行程"这类描述
  存在（来源：WebSearch 摘要转述），但这看起来是网页版 App 里"我的"页面下的
  历史行程查看功能（登录后在网页上看自己录入过的行程），而不是一个独立的、能被
  第三方程序化访问的"我的行程"API 或订阅源。**没有查到它开放给外部读取的迹象。**

**综合看**：飞常准的行程管理功能设计给"人用手指点"，不是给"程序读取"设计的——
它有"导入行程到日历""分享给朋友"这类面向用户体验的功能，但没有任何一处能让一个
外部 bot 不经过人工操作、自动拿到"这个账号未来有哪几趟航班"。

---

## 3. 对照参考：别的服务有没有更好的"个人行程自动同步"方案？

结论先行——**排出来看，"程序能自动拿到用户未来航班列表"这件事，目前没有一个对个人
免费/低成本又稳定开放的现成方案；相对最接近的是 TripIt 的 ICS 订阅链接（免费档就有），
但 TripIt 官方转发建行程 API 已在 2024 年对新开发者关闭注册，2026 年还发生过近一个月
的服务中断。**

- **TripIt**：
  - **转发确认邮件建行程**：确认存在，免费。把订票确认邮件转发到 `plans@tripit.com`
    即可自动建行程（来源：WebSearch 摘要，转述自
    `https://help.tripit.com/en/support/solutions/articles/103000063274-sap-concur-getting-started-with-tripit`
    及 `https://www.tripit.com/web/free`；原始页面域名被拦截，未能逐字核对）。
  - **免费档**：有。包含移动端行程视图、附近地点推荐、日历同步等（来源同上）。
  - **ICS/日历订阅**：**免费档就有，而且是持续同步的动态订阅**——TripIt 提供一个
    日历订阅 URL（不是一次性静态 .ics 文件），可以加进 iOS/Android/Google/Outlook
    日历，行程有变会自动更新（来源：WebSearch 摘要，转述自
    `https://help.tripit.com/en/support/solutions/articles/103000063275-adding-travel-plans-to-tripit`）。
    **这是目前查到的、最接近"程序自动拿到未来航班列表"的现成公开机制**——一个
    bot 理论上可以去抓这个人的 TripIt ICS 订阅链接，解析出未来航班。
  - **TripIt 公开 API**：**2024 年起对新开发者关闭**。官方帮助页面明确写
    "TripIt public API is no longer available for new integrations"（现有已接入的
    应用继续可用，但不再受理新注册）——来源：
    `https://help.tripit.com/en/support/solutions/articles/103000391296-tripit-public-api`
    （WebSearch 摘要转述；原文因域名拦截未能逐字核对全文，但摘要用词明确）。
    另有独立证据：GitHub `tripit/api` 仓库 issue #288（2024-05-30 提出，标题指出
    "注册新应用的链接全部失效"，**截至查证时该 issue 无任何官方回复**）——
    来源：`https://github.com/tripit/api/issues/288`（已用 WebFetch 直接读取原文
    确认）。
    进一步查到：2026 年 8 月底 TripIt 一度对第三方连接返回 404（服务中断），直到
    2026-09-24 才恢复——这条时间线只在 WebSearch 摘要中出现，**未能定位到可核对
    的一手来源 URL，此处列为未查证的细节，仅供参考，不作为结论依据**。
  - **小结**：ICS 订阅（免费、现成、可用）与 API（已停止受理新开发者）要分开看——
    YANG 的场景更适合走 ICS 订阅解析，而不是申请 TripIt API。

- **Flighty（个人航班追踪 App，iOS）**：
  - 有"日历导出"（Calendar Export）：开启后 Flighty 会维护一个日历邀请，航班变动
    （延误/登机口变化）会实时更新那条日历事件（来源：WebSearch 摘要，转述自
    `https://flighty.com/help/calendar-export`；域名被拦截未能核对原文）。
  - 有"日历导入"（Calendar Import）：反向操作，扫描用户系统日历里已有的航班日历
    事件（例如别的软件/航司发的邀请），自动识别并加进 Flighty，无需手动输入航班号
    （来源：WebSearch 摘要，转述自 `https://flighty.com/help/calendar-import`）。
  - 未查到 Flighty 有公开的"Personal API"给第三方程序调用。这些都是 App 内对接
    iOS/系统日历的功能，不是对外开放接口。
  - **没有查到 Flighty 面向个人的公开 API**——查不到。

- **App in the Air**：**已于 2024-09-19 停止服务**（App Store/Google Play/三星商店
  全下架，2024-10-19 后彻底不可用），已经不是一个可选方案（来源：
  `https://www.turningleftforless.com/app-in-the-air-closes-starlux-airlines-oneworld/`、
  `https://app.daily.dev/posts/app-in-the-air-to-shut-down-on-september-19-2024-users-advised-to-export-their-data-now-ox3ugljk1`）。

- **FlightAware 个人版**：本次搜索未深入查证其个人行程订阅功能，**查不到**具体
  是否有面向个人的行程同步机制，这条留待需要时再单独查证。

- **Google（Gmail 自动识别机票确认邮件 / 所谓"Google Trips"）**：
  - Google Trips 产品本身已于多年前停止服务（此为背景常识，本次未专门重新核对，
    不作为查证结论列出）。
  - Gmail 会自动把机票确认邮件识别进 Gmail 搜索/Google 助理的"你的旅行"卡片，
    但**没有查到一个独立公开的、专门给第三方读取"这个用户的行程"的 API**。
  - 唯一程序化路径是通过 **Gmail API + OAuth（`gmail.readonly` 权限）读用户邮箱**，
    自己写正则/LLM 去解析出机票确认邮件里的航班号（来源：WebSearch 摘要，涉及
    多个第三方开发者博客/GitHub 项目，例如 `https://github.com/gpikkio/gmailFlights`）。
    这条路径**技术上可行**，但需要：(1) YANG 授权 bot 读他的 Gmail（OAuth 同意）；
    (2) `gmail.readonly` 是 Google 认定的"受限范围"，用于生产环境的第三方 App
    通常需要过 Google 的安全评估（CASA），个人/内部用途一般可用"测试模式"或
    "内部应用"绕开审核，但仍需完成 OAuth 流程。这点是**推论**，不是查到的官方
    文档原句，标注为推论。

- **综合排序（本节针对"哪种能让 bot 自动拿到行程，不用人工输入航班号"）**：
  1. TripIt 免费档 ICS 订阅链接——现成、免费、持续更新，前提是 YANG 要把机票确认
     邮件转发给 TripIt（或用 TripIt 的邮箱同步功能）先建好行程，bot 再去解析
     订阅链接。
  2. Gmail API 读确认邮件自己解析——不依赖第三方产品，但要走 OAuth 授权且自己写
     解析逻辑，工程量最大。
  3. Flighty 日历导出——需要 YANG 是 iPhone 用户且用 Flighty，导出的是"日历事件"，
     bot 可以去读 YANG 授权的那个日历（iCloud/Google 日历）解析，等于绕了一圈但
     原理类似 TripIt 的 ICS。
  4. 飞常准——目前没有找到任何"导出成程序可读格式"的公开渠道（见第 2 节），排最后。

---

## 4. AeroDataBox 对照：它有没有"行程管理"概念？

**结论：没有。确认 AeroDataBox 是纯粹的"按航班号/日期/机场"查询单次航班状态和相关
公开数据的 API，不存在保存或管理某个用户多趟未来行程的功能。**

- 官方文档站 `doc.aerodatabox.com`（域名被拦截，未能直接抓取原文）。
- 据 WebSearch 摘要及第三方档案站描述（来源：
  `https://github.com/api-evangelist/aerodatabox`——"AeroDataBox is an affordable
  aviation and flight data API platform tailored for small and medium businesses,
  individual developers, researchers, and students"；以及
  `https://aerodatabox.com/api`、`https://rapidapi.com/aedbx-aedbx/api/aerodatabox`）：
  提供的端点类别是航班状态、航班计划、机场信息、飞机信息、统计数据——**都是围绕
  "某一趟航班"或"某个机场/飞机"的公开数据查询，没有任何"用户账户""行程列表"
  "多趟行程管理"的产品概念**。这与 YANG 现在 bot 的用法（自己维护航班号列表，
  拿着航班号去问 AeroDataBox 状态）完全吻合——航班号本身需要人工先告诉它。
- 这点与 VariFlight 的情况完全一致（两者都是"航班公开数据 API"这一类，不是
  "个人行程管理"这一类），印证了第 1 节的结论。

---

## 可行路径排序（按用户要动的手从少到多）

| 排序 | 方案 | 用户要做什么 | 技术上要做什么 | 卡在哪里 |
|---|---|---|---|---|
| 1（最省事，但目前查到的证据显示不可行） | 直接"连接"飞常准账号，bot 自动读行程 | 理论上只需授权一次 | 无——没有这个接口可用 | **飞常准没有开放"读取用户个人行程"的 API/OAuth**（第1、2节），这条路径查证结果是**走不通**，不建议投入开发 |
| 2 | 改用 TripIt：YANG 把机票确认邮件转发给 TripIt（或开 Inbox Sync），bot 定期拉 TripIt 的 ICS 订阅链接解析未来航班 | 订票后转发一次确认邮件到 TripIt（或设置一次 Inbox Sync 自动转发，长期免动手）；把 TripIt 生成的日历订阅 URL 给一次 bot | Worker 端加一个定时任务，抓 ICS 文本，解析出 `VEVENT` 里的航班号/日期，喂给现有 AeroDataBox 查询逻辑 | 需要 YANG 愿意换一个"行程录入入口"（从飞常准换成/并用 TripIt 收确认邮件）；TripIt 服务本身近期（2026-08~09）出现过近一个月中断，稳定性未100%验证 |
| 3 | Gmail API 方案：bot 通过 OAuth 读 YANG 的 Gmail，自动识别机票确认邮件，解析出航班号 | 走一次 Google OAuth 同意授权（给 bot 的 Google Cloud 项目 `gmail.readonly` 权限） | 在 Cloudflare Worker 里接入 Gmail API，写邮件解析逻辑（正则或简单 LLM 抽取），定期拉取新邮件 | 工程量最大：要建 Google Cloud 项目、处理 OAuth token 刷新、自己维护解析逻辑对各航司/代理邮件格式的兼容性；`gmail.readonly` 是受限权限，生产用途可能触发 Google 审核（个人小范围使用通常可以留在"测试模式"绕开） |
| 4（维持现状） | 不接飞常准，继续人工把航班号告诉 bot | 每次订票后手动发一条消息给 bot（"帮我记 CA981 10月5日"） | 无需新开发 | 这是当前已在用的方案，零风险但需要人工介入，不满足"自动"这个诉求 |

**给决策的直接结论**：如果目标是"完全不用手动告诉 bot 航班号"，飞常准这条路
**查证结果是走不通**——它没有对外的个人行程读取接口。最现实的"自动化"路径是
方案 2（TripIt ICS 订阅），代价是 YANG 要把订票确认邮件的转发目标从"只看飞常准"
换成"也转给 TripIt 一份"（这一步仍需人工，但只需转发邮件，不需要手动录入航班号，
且只需设置一次 Inbox Sync 就能长期自动）。方案 3 技术上最灵活但开发和维护成本
最高。若接受"每次订票后手动跟 bot 说一声航班号"，方案 4（现状）已经是最省事的。

---

## 未解决 / 需要人工确认的事项

1. `mcp.variflight.com`（飞友 AI 开放平台）的服务条款/API 文档原文——域名被沙盒
   拦截，未能逐字核对是否 100% 没有"个人行程"相关接口；结论建立在多篇 WebSearch
   摘要的一致指向上，不是逐字读过官方文档。**建议**：如果要彻底排除这条路，
   派人/换网络环境直接打开 `https://mcp.variflight.com/` 看一眼文档目录里有没有
   "trip""itinerary""order"类端点。
2. VariFlight 企业 API 的具体价格、最低消费、企业资质门槛——查不到，需直接联系
   `business@VariFlight.com` 或电话 `4006-350-787` 才能拿到确切数字。
3. 飞常准是否有 ICS 订阅链接——只查到"日历导入"（写入系统日历）的教程转述，没有
   找到"持续订阅链接"的证据，但因原始 App 内菜单未能实测（沙盒无法安装 App/登录
   账号），不能 100% 排除它藏在某个不显眼的设置里。**建议**：YANG 自己在飞常准
   App 的"我的"页面翻一下"设置""导出"相关菜单，看有没有"生成订阅链接"或类似
   选项，比继续网络查证更快出结果。
4. TripIt 2026-08~09 那次近一个月服务中断的细节，只在 WebSearch 摘要中出现，
   没能定位到可直接核对的一手来源 URL，未列入结论依据，仅供参考。
5. FlightAware 个人版是否有行程同步功能——本次未深入查证。
