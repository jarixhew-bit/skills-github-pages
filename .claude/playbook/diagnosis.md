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

- [2026-07-12][雲端] 情境：session 中途裝 plugin，想立刻用它的斜線指令，回報 `Unknown command`。
  教訓：斜線指令表在進程啟動時就固定，中途裝的不會熱更新（下次多半又是全新容器）。當下用 Bash 直接
  呼叫 plugin 內部腳本（`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`）；要長期可用就裝本機 CLI。
- [2026-07-12／2026-08-11／2026-08-12][雲端] 情境：雲端 session 操作功能分支。三坑都踩過：
  (1) **刪遠端分支**：git 代理禁止 `git push --delete`（403，策略性非暫時），別重試——觸發
  `cleanup-branches.yml`（workflow_dispatch 傳分支名）由 CI 代刪，帶 main 保護與合併驗證。
  (2) **新開/重建分支前先 `git fetch origin main`**：本地 origin/main 過舊會讓分支基點落後，清理
  workflow 的「內容樹在 main」安全閥會攔下不刪；被攔時把分支 force-push 指到 origin/main 再觸發一次。
  (3) **每次 squash 合併後、開始下一件事前，先把分支重置到最新 main**（`git fetch origin main &&
  git checkout -B <分支> origin/main`）。不重置就繼續 commit，分支同時帶著合併前的舊 commit 和新改動，
  PR 開出來是 `mergeable_state: dirty`，而 **GitHub 對衝突的 PR 不跑任何檢查**（看起來像卡住）。
  判別法：開 PR 後遲遲沒有檢查記錄，先查 `mergeable_state`，別懷疑 workflow 配置。(3) 已踩三次。
  重置後 stop hook 喊「有 N 個未推送的 commit」是**誤報**（GitHub 合併後自動刪了遠端分支，追蹤引用
  懸空，把 squash 合併提交本身當成未推的工作）：先驗 `git branch -r --contains HEAD` 顯示 `origin/main`
  ＋ `git status --short` 為空，再 `git fetch origin --prune` 後 `git push -u` 重建。**別用
  `--force-with-lease`**（遠端分支已不存在，必回 `stale info`，白費一輪）。已踩兩次。
  (4) **CI 綠了要當場合併，別「等下再回來」**：一個 session 連做好幾件事時，開完 PR 就地等幾分鐘、
  綠了立刻合併＋刪分支，再開始下一件。2026-08-13 開了 #400 就轉頭做下一件，等使用者反問
  「怎麼 Boss 還在」才發現 PR 躺著沒合、他以為功能沒做。真要並行，收工前逐一核對每個 PR 的狀態。
- [2026-07-13／2026-08-03／2026-08-12][雲端] 情境：想確認改動「真的上線了／真的提交進去了」，
  或需要沙盒連不到的外部資料。教訓：沙盒出口代理**擋掉一票外部站**——`github.io`、`*.workers.dev`
  （403）、`play.google.com` 與 apkcombo 等 APK 鏡像（EGRESS_BLOCKED）。另外 `raw.githubusercontent`
  抓非本 session 倉庫的檔案回 404（試了三個確實存在的路徑都 404，是不是策略性未查證）。
  一律別重試，也**別據此判斷對方掛了、或那個檔案不存在**。兩條出路：
  (1) **驗證改動**：`git show origin/main:路徑` 從 remote 讀回——工作區正確不代表 commit 進去了
  （混用 `git rm` 與 Write/Edit 最容易漏，commit 前跑 `git diff --cached --stat` 或直接 `git add -A`）。
  線上那層已由 `check-live.py`＋`live-check.yml` 每天自動驗；**CI 綠了不等於線上驗過**。
  (2) **拿外部資料**：搬到 GitHub Actions，runner 出得去（例：`play-lookup.yml` 查 App 包名）。
  結果怎麼讀回——**短輸出直接印在 job 日誌**，用 MCP `get_job_logs` 讀回（`actions/runs/<id>/logs`
  那個 zip 端點會被代理 403，只能走 MCP）；**長輸出才 commit 回觸發分支**（artifact 要登入，下載不了）。
- [2026-08-03／2026-08-08][皆是] 情境：同一份資料存在兩處（本機＋遠端／App＋帳本），使用者報
  「刪了又出現」或「兩邊數字對不上」。教訓：病根**都在同步那一層**，逐層查完再下結論——遠端刪了沒／
  本機刪了沒／**有沒有被同步合併回來**。取並集的合併沒有墓碑（tombstone）就一定會復活已刪記錄，
  而這層在程式碼裡看不到「刪除」二字，最容易漏；修法是刪除時落 `{id, at}` 墓碑、隨資料一起同步、
  合併時剔除，並確認**每一處**移除路徑都落了墓碑，漏一處那條路就會復活。同理「一邊能改、另一邊
  只能增刪」的結構**一定會分叉**，設計時只有兩條路：禁止改能改的那邊（只留刪掉重記），或把「改」
  實現成「遠端刪舊＋新增新的」——「彈一句提示說那邊沒改」不算解法。
  來源：公司報帳刪除兩次被回報失效；Seryi 那筆本機 11.76、帳本 11.78。
- [2026-07-16][皆是] 情境：新建或接手 Firebase 專案。教訓：預設的「測試模式」Firestore 規則在到期日前
  對**任何人、免登入**開放全庫讀寫，到期後又反過來拒絕所有人；上線前必須手動改成按 `request.auth.uid`
  限權。規則只在 Firebase Console 網頁 UI，repo 內看不到對應檔案——稽核要主動去 Console 確認。
  來源：expense-tracker 被查出仍是預設規則、且已公開暴露記帳資料一段時間。
- [2026-08-05／2026-08-11／2026-08-12][皆是] 情境：写检查工具、或改它的等待方式，跑完报「通过」。
  教训：**绿灯本身要先被验证——拿一个已知该报的东西试它，确认它真的会红。** 五种踩法：
  (1) check-secrets 扫 git 历史，0.13 秒扫完 4844 个对象报通过，实际是遇到第一个 tree 对象就 `break`；
  (2) 把死等换成 `until(条件)` 时条件写成**否定式**（「没有『加载中』」）——还没开始加载时就成立，
  等于没等。**等条件要写「我要的东西出现了」，不要写「我不要的东西不在」**；
  (3) 本地连跑两轮全绿不等于稳，要主动制造慢速（给假服务端注入 200ms～1.2s 延迟再跑）；
  (4) `node xxx | tee out.txt` 的退出码取自 `tee`，脚本崩了照样显示成功——**管道一律 `set -o pipefail`**；
  且 `package.json` 为 `type: module` 时 `.js` 里的 `require` 失效（要写 `.mjs`，已踩两次）。两件叠起来 CI 绿了三分钟其实什么都没跑。
  (5) 「双击生出两条一样的记录」这类闸门自测通过、真机仍重复：双击是两个各自跑到底的事件不是竞态，
  加解锁在同一执行栈内做完等于没挡，要用 `setTimeout` 延后解锁；测法必须 `el.click(); el.click();`
  连打两下（`page.evaluate` 连调两次是顺序调用、Playwright `page.click()` 会等元素可操作，都测不出来）。
  (6) 往既有自检档案**尾巴**追加断言等于白写：贴在「总结＋process.exit」之后的断言照样跑、照样印 ✅，
  但不计入通过数也不影响退出码（2026-08-13 追加 8 项路税断言全绿，总结仍停在 66 项）。追加前先 grep
  `process.exit` 插到它之前，跑完看总结那行数字有没有变大。
  附带：往 `git cat-file --batch` 的 stdin 一次写几百 KB 会死锁（管道满了两边互等），要用独立线程喂。
  另（2026-08-10）：占位符别写真实 NUL 字节（要写 JS 转义 \u0000）——自检全绿但 git/grep 从此把文件
  当二进制，`git diff` 只剩「Binary files differ」。踩过两次，已由 `check-html.py` 的
  `check_control_bytes` 守着别删。通则：**同一类错误出现第二次就变成脚本。**
- [2026-08-11／2026-08-13][皆是] 情境：嫌慢、嫌 token 烧得凶——CI 跑太久、Actions 记录多到看不完，
  或「最近做什么都变慢」。总原则：**先量固定开销，别先怀疑手上这件事。**
  ① CI 侧先看三处，都不必动测试逻辑。(1) **同一份代码是不是验了两遍**——workflow 同时挂 `push` 与 `pull_request` 时，
  推分支跑一遍、开 PR 又跑一遍，而 concurrency 按 `github.ref` 分组，两者 ref 不同彼此不取消，
  白烧一倍；改成 `push` 只在 main 触发即可减半。(2) **最慢那一关决定墙上时间**——并行时只有拆开
  最慢的那个才有意义（同事版自检加 `PART` 开关拆成两条腿，117 秒→70 秒）。(3) **重复样板**抽成 `.github/actions/*/action.yml` 的 composite action。
  另：**改 CI 配置的 PR 往往一个检查都不跑**（各 workflow 的路径过滤里不含自己），等于改 CI 时
  CI 是瞎的——路径里要把 workflow 自己和它依赖的共用步骤都写进去。
  另：**机器人不该开 PR**（`GITHUB_TOKEN` 开的 PR 不触发 workflow，永远等不到 `all-green`；`gh pr create`
  又受仓库开关管，**功能依赖人手开关＝随时会再坏**）。正解：推暂存分支 → statuses API 盖章 → 直推受保护
  ref，重试须整轮重来。完整的三轮踩坑记录在 `.github/workflows/trading-daily.yml`「提交数据」的注释里。
  ② session 侧量**每轮的固定开销**，三个地方：(1) **`.claude/rules/` 是自动载入目录**——放进去的 `.md`
  每轮都被当 project instructions 塞进 context，而 `notes/`、`agents/` 不会（实测 notes/ 1084 行完全没进）。
  所以「路由表叫你按需读」放在 `rules/` 里等于自欺，本仓库已搬成 `.claude/playbook/`。**新增制度档别再
  放回 `rules/`，除非真要它每轮都在。** (2) MCP server 的工具名与 skill 描述也是每轮固定成本，
  用不到的连接器要关（只有用户能关）。(3) 自检脚本数量会复利成长——「建东西必配自检」三周内
  把 tools/ 从 4 个撑到 27 个，而规则又要求「改完跑全部」，串行 5~6 分钟；解法是并行
  （`tools/check-all.py`）而不是少跑。来源：用户问「做其他项目也超久，是项目太多了吗」，
  量下来页面数三周没变（8 个），变的是每次改动要背的固定开销。
- [2026-08-12][皆是] 情境：外部 API 连续多天回同一个错误码，查了好几轮都对不上。教训：
  **先换一台对等主机再送一次——同一个故障在不同主机上的错误码可能天差地别。** IBKR Flex 的
  `gdcdyn` 回含糊的 `1001 报表生成不出来`，`ndcdyn` 却明说 `1018 Too many requests`，真正的病是
  **限流**；同一个问题因此被误诊三次。通则：错误码含糊时**先想办法拿到第二个信息源**（换主机、
  换端点、换客户端），比在单一信息源上反复推理快得多。第二课：**重试次数本身可能是凶手，排查时
  的手动重跑也算**（当天手动跑七八次、每次烧两个请求，一边查一边加重病情）；限流类故障要减少重试、
  拉长间隔，并把「手动触发也去打那个 API」改成勾选才做。第三课：「手动跑得出来、程式跑不出来」
  正是限流的典型症状（网页走登入 session、不吃额度）。
- [2026-08-16][雲端] 情境：workflow 用 `FOO: ${{ secrets.FOO }}` 傳**可選** secret。教訓：secret 未定義時
  注入的是**空字串**而非「變數不存在」，`os.environ.get("FOO", 預設值)` 永遠拿不到預設值——一律寫
  `.strip() or 預設值`（`trading/ai_note.py:230` 是正確範例）。附帶通則：**步驟耗時本身就是診斷訊號**
  （`fetch_news.py` 那步只跑 2 秒＝請求根本沒發出去）。

