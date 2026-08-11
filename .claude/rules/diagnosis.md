# Harness 診斷報告（2026-07-03，由 Fable 5 撰寫；可攜版）

本檔記錄此環境最漏 token、最容易失焦、最容易出錯的三大問題與修法。
其他制度檔（dispatch.md、judgment.md 等）皆以此為依據。讀者：未來在此環境運作的模型。
標注〔本機限定〕的段落只適用 Windows 本機，雲端（claude.ai/code）忽略。

## 問題 #1：主對話直接吞大輸出（最漏 token）——所有環境適用

**現象**：主對話自己去爬網頁（firecrawl 回傳整頁 markdown）、抓瀏覽器快照
（playwright `browser_snapshot` 等一次回傳整棵 accessibility tree，動輒上萬 token）、
整檔讀長文件。context 被塞滿後觸發自動摘要（compaction），早期指令被壓縮遺失，
模型開始失焦、重複、忘記驗收條件。

**修法**（詳見 dispatch.md）：
- 凡預期回傳超過約 200 行的讀取／爬取／掃描，一律派 subagent 去做，主對話只收結論。
- 長產物（報告、爬回來的資料、整理結果）寫進檔案，對話裡只傳「路徑 + 三行摘要」。
- 瀏覽器多步操作派 subagent 執行，主對話只下目標與驗收條件。

## 問題 #2：工具迷宮——多套重疊工具（最容易失焦）——所有環境適用

**現象**：環境常同時存在多套功能重疊的網頁/瀏覽器工具。弱模型會：挑錯工具、
混用兩套、或一次 ToolSearch 只載一個工具浪費回合。

**修法**——固定路由，不要現場比較：
| 需求 | 首選 | 首選不可用時 |
|---|---|---|
| 讀一個公開網頁的內容 | WebFetch，或 skill `firecrawl:firecrawl-scrape` | 兩者互為備援 |
| 網路搜尋 | WebSearch，或 skill `firecrawl:firecrawl-search` | 兩者互為備援 |
| 需要登入、點擊、填表、用使用者自己的 Chrome | claude-in-chrome〔本機限定〕 | 雲端：告知使用者此事需本機做 |
| 除錯自己寫的網頁、看 console/network | chrome-devtools-mcp | playwright |
| 批量爬整個網站 | skill `firecrawl:firecrawl-crawl`（派 subagent 執行） | 逐頁 WebFetch（派 subagent） |

- 每個環境的可用工具不同（本機 plugin 多、雲端可能較少）：路由表裡的工具若不在
  當場工具清單，先 ToolSearch 查（deferred 工具要載入才能用，WebFetch/WebSearch
  也可能是 deferred），查不到就用同列的備援。
- ToolSearch 一次用逗號批量載入所有預期會用的工具，禁止一次載一個。

## 問題 #3：Windows + PowerShell 5.1 的坑（最容易出錯）〔本機限定〕

**現象**：本機環境踩過中文亂碼（chcp 65001）。PowerShell 5.1 沒有 `&&`/`||`、
預設檔案編碼是 UTF-16。弱模型常見死法：用 bash 語法餵 PowerShell、用 shell 寫檔
造成編碼錯亂、同一句失敗指令反覆重試燒掉整個回合。

**修法**：
- 寫檔案一律用 Write／Edit 工具，禁止用 `echo >`、`Out-File`、`Set-Content` 寫有中文的內容。
  若逼不得已用 shell 寫檔，必加 `-Encoding utf8`。
- POSIX 語法的腳本走 Bash 工具；PowerShell 只跑 Windows 專屬操作。兩者語法不可混用。
- PowerShell 5.1 沒有 `&&`——用 `A; if ($?) { B }`。
- **鐵律（所有環境適用）：同一指令失敗 2 次就換方法（換工具、換寫法、或查文件），
  禁止第 3 次原樣重試。**

## 附帶發現〔本機限定，見 letter.md 第 1 件事〕

本機 settings.json 內含明文 Google Maps API key，詳情與建議只寫在 letter.md，
此處不重複（避免同一件事寫兩個家）。

## 教訓紀錄

- [2026-07-12][雲端] 情境：session 進行中裝 plugin，想立刻用它的斜線指令，回報
  `Unknown command`。教訓：雲端 session 的斜線指令表在進程啟動時就固定，中途裝的
  plugin 不會熱更新；而且下次多半是全新容器。當下解法：用 Bash 直接呼叫 plugin 內部
  腳本（`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`）；要長期可用就裝在本機 CLI。
- [2026-07-12／2026-08-11][雲端] 情境：雲端 session 操作功能分支（合併後刪分支、
  一個 session 内連做好幾件事）。教訓，三條都踩過：
  (1) **刪遠端分支**：git 代理禁止 `git push --delete`（403，策略性非暫時），別重試——
  觸發 `cleanup-branches.yml`（workflow_dispatch，傳分支名）由 CI 代刪，帶 main 保護與合併驗證。
  (2) **新開/重建功能分支前先 `git fetch origin main`**——本地 origin/main 過舊會讓分支基點
  落後，清理 workflow 的「內容樹在 main」安全閥會攔下不刪；被攔時把分支 force-push 指到
  origin/main 再觸發一次即可。
  (3) **每次 squash 合併之後、開始下一件事之前，先把分支重置到最新 main**
  （`git fetch origin main && git reset --hard origin/main`）。不重置就繼續 commit，分支會
  同時帶著「合併前的舊 commit」和新改動，跟 main 上 squash 後的版本衝突：PR 開出來是
  `mergeable_state: dirty`，**GitHub 對衝突的 PR 不跑任何檢查**（頁面上看起來像卡住），
  必須 rebase 再強推才跑得起來——而多推一次就在 Actions 頁面多一行記錄。
  判別法：開 PR 後遲遲沒有檢查記錄，先查 `mergeable_state`，別去懷疑 workflow 配置。
  來源：(1)(2) Fable 5 交接時試刪兩次 403 後建立此通道，一次清掉 14 個積壓分支；
  (3) 使用者回報「一次任務就重複好幾個」，查下來一半是這個，同一天連踩兩次（PR #364、#365）。
- [2026-07-13／2026-08-03][雲端] 情境：想確認一個改動「真的上線了／真的提交進去了」。
  教訓：沙盒**連不到** `github.io`、`*.workers.dev`（代理策略性 403 CONNECT tunnel failed，
  別重試、也別懷疑對方服務掛了），只能三步間接驗證，缺一步就會誤報上線：
  (1) `git show origin/main:路徑` 從 **remote** 讀回關鍵改動——工作區正確不代表 commit 進去了。
  混用 `git rm` 與 Write/Edit 時尤其容易漏（前者自動暫存、後者不會），commit 前跑一次
  `git diff --cached --stat`，或直接 `git add -A`。
  (2) 查 CI 是否 success（actions_list 回傳動輒 40 萬字元，落檔後用 jq 提取，別直接讀）。
  (3) 查 deployments API（`/deployments?environment=github-pages`）裡**出現該 sha** 才算已部署——
  GitHub 故障期間 pages 部署事件會被整個丟掉，重跑別的 workflow 不會補觸發。
  **CI 綠了不等於線上驗過**，真實端到端只能請使用者實際用一次，交付時要說明白。
  來源：洗髓 App／butler-bot 端點驗證；鮨酒場更新時被吞掉的 Pages 事件；清空公司帳本時
  帳本 JSON 沒 add，結果照片全刪、記錄全在，使用者月度導出才發現。
- [2026-08-03／2026-08-08][皆是] 情境：同一份資料存在兩處（本機＋遠端／App＋帳本），
  使用者報「刪了又出現」或「兩邊數字對不上」。教訓：這類問題的病根**都在同步那一層**，
  逐層查完再下結論——(1) 遠端刪了沒（查 commit／API 回應）；(2) 本機刪了沒；
  (3) **有沒有被同步合併回來**。取並集的合併沒有墓碑（tombstone）就一定會復活已刪記錄，
  而這一層在程式碼裡看不到「刪除」二字，最容易漏；修法是刪除時落 `{id, at}` 墓碑、隨資料
  一起同步、合併時剔除，並確認**每一處**移除路徑都落了墓碑，漏一處那條路就會復活。
  同理，「一邊能改、另一邊只能增刪」的結構**一定會分叉**且沒有提示，設計時只有兩條路：
  禁止改能改的那一邊（只留「刪掉重記」），或把「改」實現成「遠端刪舊＋新增新的」——
  「改完彈一句提示說那邊沒改」不算解法，提示兩秒就沒了，兩邊從此永遠不一樣。
  來源：公司報帳刪除連續兩次被回報失效（真病根在 `mergeData()` 註解裡寫著的「已知取捨」）；
  以及 Seryi 那筆本機 11.76、帳本 11.78，靠老闆肉眼比對才發現。
- [2026-07-16][皆是] 情境：新建或接手 Firebase 專案。教訓：預設的「測試模式」Firestore
  規則在到期日前對**任何人、免登入**開放全庫讀寫，到期後又反過來拒絕所有人；上線前必須
  手動改成按 `request.auth.uid` 限權。規則只在 Firebase Console 網頁 UI，repo 內看不到
  對應檔案——稽核時要主動去 Console 確認，光讀程式碼看不出來。
  來源：expense-tracker 的專案被查出仍是預設規則、且已公開暴露記帳資料一段時間。
- [2026-08-08][皆是] 情境：修「双击按钮生出两条一样的记录」这类 bug，第一版闸门
  （同步 disabled=true 再在 finally 里同步 disabled=false）自测通过、但真机仍会重复。
  教训：JS 单线程，双击是两个各自独立、各自跑到底的事件，不是同一时刻的竞态——
  若解锁和加锁在同一个执行栈里做完，等浏览器真的要派发第二次点击时锁早就解开了，
  等于没挡。真正有效的做法是让 `disabled=true` 跨过第一次点击的整个同步执行、
  用 `setTimeout` 延后解锁，让第二次点击落在「按钮还是 disabled」的窗口内被浏览器
  直接吞掉（disabled 的按钮不派发 click，处理函数根本不会被调用）。测试也要注意：
  必须用 `el.click(); el.click();`（原生 DOM 方法）连打两下模拟真双击，
  `page.evaluate(() => fn())` 连调两次是同步顺序调用不是双击，测不出这类窗口期 bug；
  Playwright 的高阶 `page.click()` 会等元素变回可操作再点，同样测不出来。
  来源：expense-tracker.html 的 saveTx() 双击生成两条一样的公司账，用户实机遇到。
- [2026-08-05／2026-08-11][皆是] 情境：写检查工具、或改检查工具的等待方式，跑完报「通过」。
  教训：**绿灯本身要先被验证——拿一个已知该报的东西试它，确认它真的会红。**
  三次踩法：(1) check-secrets 加 git 历史扫描，0.13 秒扫完 4844 个对象报通过，实际是
  遇到第一个 tree 对象就 `break`（`git rev-list --objects` 连目录也输出，不只有 blob）；
  (2) 把自检里的死等换成 `until(条件)` 提速时，条件写成**否定式**（「文字里没有『加载中』」
  「加载提示是隐藏的」）——这类条件在**还没开始加载**时就成立，等于没等，本地机器快看不
  出来、CI 慢一点就整段红。**等条件要写「我要的东西出现了」，不要写「我不要的东西不在」**；
  (3) 本地连跑两轮全绿不等于稳，验证要主动制造慢速（给假服务端注入 200ms～1.2s 延迟再跑）。
  附带一坑：往 `git cat-file --batch` 的 stdin 一次性写几百 KB 会死锁（管道满了两边互等），
  要用独立线程喂；当时误判成「正则回溯」，是因为没先确认「到底卡在哪一步」就动手改代码。
- [2026-08-10][皆是] 情境：写代码时想要一个「不可能跟真实数据撞车」的占位符。教训：别把
  NUL（0x00）这个字节直接写进文件，要写成 JS 转义写法（反斜杠 u0000）。真实字节功能上
  完全正常、浏览器照跑、自检照样全绿，唯一症状是 git 和 grep 从此把该文件当成二进制——
  `git diff` 只显示「Binary files differ」，代码审查等于瞎了。同一个坑踩了两次（先是
  inventory/index.html，再是把库存并进 expense-tracker.html 时又带进去，而那是管钱的
  文件），所以已改成机器守着：`tools/check-html.py` 的 `check_control_bytes` 会拦，
  CI 每次改 HTML 都跑。通则：**同一类错误出现第二次，就该把它变成脚本，别再靠记性。**
- [2026-08-11][雲端] 情境：嫌 CI 跑太久、或翻 Actions 页面发现记录多到看不完。教训：先看
  三处，都不必动测试逻辑。(1) **同一份代码是不是验了两遍**——workflow 同时挂 `push` 与
  `pull_request` 时，推分支跑一遍、开 PR 又跑一遍，而 concurrency 按 `github.ref` 分组，
  两者 ref 不同（`refs/heads/…` vs `refs/pull/…`）彼此不取消，白烧一倍；改成 `push` 只在
  main 触发即可减半。(2) **最慢那一关决定墙上时间**——四个 job 并行时只有拆开最慢的那个才
  有意义（本仓库把同事版自检加了 `PART` 开关拆成两条腿，117 秒→70 秒）。(3) **重复样板**
  抽成 `.github/actions/*/action.yml` 的 composite action，别在四个文件里改同一段话。
  另：**改 CI 配置的 PR 往往一个检查都不跑**（各 workflow 的 pull_request 路径过滤里不含
  自己），等于改 CI 时 CI 是瞎的——路径里要把 workflow 自己和它依赖的共用步骤都写进去。
