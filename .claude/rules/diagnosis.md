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

- [2026-07-12][雲端] 情境：session 進行中用 `claude plugin marketplace add` /
  `claude plugin install` 裝新 plugin（例如 claude-council），裝完立刻在同一對話
  試新 plugin 提供的斜線指令（如 `/plugin-name:command`），回報 `Unknown command`。
  教訓：雲端 session 是同一個從 session 開始就在跑的 `claude` 進程，斜線指令表在
  進程啟動時就固定了，中途裝的 plugin 不會熱更新進去；而且雲端多半每個新 session
  是全新容器，開新對話未必能延續剛裝好的設定。當下可行解法：改用 Bash 直接呼叫
  plugin 內部腳本（路徑通常在
  `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/scripts/` 或
  `commands/*.md` 描述的邏輯）達到同樣效果，不必等指令表刷新；要拿到真正能長期
  用的斜線指令，建議裝在本機 CLI（本機 session 是持久環境，重開就會載入）。
  來源：本機 letter.md 提過使用者想要「一隊 AI 幫他做事」，這次 claude-council
  安裝驗證時踩到的雲端限制。
- [2026-07-12][雲端] 情境：合併後要刪遠端功能分支。教訓：網頁版 session 的 git 代理
  禁止 `git push --delete`（403，策略性非暫時），別重試——觸發 `cleanup-branches.yml`
  workflow（workflow_dispatch，傳分支名）由 CI 代刪，帶 main 保護與合併驗證。
  來源：Fable 5 交接時試刪兩次 403 後建立此通道，一次清掉 14 個積壓分支。注意：要新開/重建功能分支時先 `git fetch origin main`——本地 origin/main 過舊會讓分支基點落後，清理 workflow 的「內容樹在 main」安全閥會攔下不刪（同 session 踩過兩次）；被攔時把分支 force-push 指到 origin/main 再觸發一次即可。
- [2026-07-13／2026-08-03][雲端] 情境：想從沙盒直接連某個外部網域驗證東西上線了沒。
  教訓：代理對 `github.io`、`*.workers.dev`、youtube/bilibili 一律 **403 CONNECT tunnel
  failed**（策略性封鎖，非暫時），別重試也別懷疑對方服務掛了——判別方法：`curl -sv`
  看到 `CONNECT tunnel failed, response 403` 就是代理策略。改成兩步驗證：(1) GitHub MCP
  的 actions_list 查該 commit 的部署 workflow 是否 success；(2) `git show origin/main:檔案`
  read-back 關鍵改動，或寫成不需網路的單元測試／對假端點的 Playwright 測試。
  真實端到端只能交給使用者實際用一次——**CI 綠了不等於線上端點驗過**，交付時要說明白。
  另：actions_list 回傳動輒 40 萬字元，落檔後用 jq 提取，別直接讀。
  來源：洗髓 App 上線驗證（github.io）與 butler-bot Worker 端點驗證（workers.dev）。
- [2026-07-13][雲端] 情境：合併到 main 後 Pages 遲遲不更新。教訓：GitHub 故障（Service
  Unavailable）期間合併的 commit，其「pages build and deployment」觸發事件可能被整個丟掉，
  重跑其他 workflow 不會補觸發——用 deployments API（`/deployments?environment=github-pages`）
  核對最新部署的 sha 是否等於 merge commit；缺失時再合併一個新 commit 重新觸發。
  另：驗證上線必須看到部署記錄裡出現該 sha 才算數，「檢查 workflow 綠了」不等於已部署。
  來源：鮨酒場訂位更新上線時 Pages 事件被 GitHub 故障吞掉，誤報已上線被使用者發現。
- [2026-08-03][皆是] 情境：刪除／修改資料檔（帳本 JSON、設定檔）後 commit。教訓：`git rm` 會
  自動把刪除放進暫存區，但**用 Write/Edit/重定向改過的檔案不會**——同一個 commit 裡混用兩者時，
  只 `git rm` 就 commit，改過的檔案會被靜靜漏掉。commit 前一定跑一次 `git diff --cached --stat`
  確認要改的檔案都在暫存區裡（或直接用 `git add -A`）。**更根本的一條：資料改動的驗證要從
  remote 讀回**（`git show origin/main:路徑`），不能只看本地工作區——工作區顯示正確不代表
  commit 進去了。來源：清空公司帳本時只提交了照片刪除、帳本 JSON 沒 add，結果記錄全在、
  照片全沒，使用者跑月度導出時看到「6 筆帳目都沒有電子收據」才發現，白繞一圈。
- [2026-08-03][皆是] 情境：使用者說「刪除沒用／刪了又出現」。教訓：刪除在多層系統裡有好幾層，
  逐層查完再下結論——(1) 遠端資料源刪了沒（查 commit／API 回應）；(2) 本機刪了沒；
  (3) **有沒有被同步「合併」回來**。取並集的同步（union merge）沒有 tombstone 就一定會復活
  已刪記錄，而這一層在程式碼裡完全看不到「刪除」二字，最容易漏。修法：刪除時落 `{id, at}` 墓碑、
  隨資料一起同步、合併時剔除；並確認**每一處**移除記錄的程式路徑都落了墓碑，漏一處那條路就會復活。
  來源：記帳 App 公司報帳的刪除連續兩次被回報失效，第一次修的是遠端那層，第二次才發現真正的
  病根在雲端合併——`mergeData()` 的註解裡早就寫著這個「已知取捨」，但診斷時沒去看。
- [2026-07-16][皆是] 情境：新建或接手 Firebase 專案，需要判斷資料是否安全。教訓：Firebase
  預設的「測試模式」Firestore 規則（`allow read, write: if request.time <
  timestamp.date(...)`）在到期日之前對**任何人、免登入**開放全庫讀寫，到期後又會反過來
  拒絕所有請求（包含合法使用者）；上線前必須手動改成按 `request.auth.uid` 限權的規則，
  不能沿用預設值也不能拖到到期日才處理。Firestore 規則只在 Firebase Console 網頁 UI 設定，
  repo 內不會有 `firestore.rules` 之類的檔案可查，稽核時要主動去 Console 確認，光看程式碼
  看不出來。來源：稽核 expense-tracker 的 Firebase 專案（my-expense-tracker-a1aee）時發現
  仍是預設規則且將於 2026-07-28 到期（等於已公開暴露所有使用者的記帳資料一段時間），
  已協助改成 `users/{uid}` 限權規則並確認發布；順帶查過本 repo 只有這個專案用到
  Firebase，其餘頁面（含 xisui）未使用，不需要比照檢查。
- [2026-08-08][皆是] 情境：同一份数据在本机和远端各存一份，而其中一边能改、另一边不能改
  （例：记账 App 能改本机记录，公司账本只支持新增/删除）。教训：这种结构**一定会分叉**，
  而且分叉后没有任何提示，只能靠人肉比对发现。设计时必须二选一——要么禁止改能改的那一边
  （锁住表单，只留「删掉重记」这条会同步的路），要么把「改」实现成「远端删旧＋新增新的」。
  「改完弹一句提示告诉用户那边没改」不算解法：提示 2.2 秒就没了，之后两边永远不一样。
  来源：Seryi 2026-08-02 那笔本机 11.76、账本 11.78，老板肉眼比对才发现；查下去
  发现是「已送出的记录被改过」，而这是 App 的既有设计。
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
- [2026-08-05][皆是] 情境：写扫描器/检查工具，跑完报「通过」。教训：**先拿一个已知
  该被查出的东西验证它真的会报**，再信任它的绿灯。当天给 check-secrets.py 加 git 历史
  扫描，第一版 0.13 秒扫完 4844 个对象报「通过」——实际是遇到第一个 tree 对象就
  `break` 中断了整个循环（`git rev-list --objects` 连目录也带路径输出，不是只有 blob）。
  如果不是刚好知道历史里有一把 Maps key 该被查出来，这个假绿灯会一直挂着。
  同一个工具还踩到第二个坑：往 `git cat-file --batch` 的 stdin 一次性写几千个 sha
  （几百 KB）会死锁——超过管道缓冲区约 64KB 后主线程阻塞在 write，而 git 的 stdout
  也满了在等人读，两边互等。要用独立线程喂 stdin。当时先误判成「正则灾难性回溯」，
  是因为没有先确认「到底卡在哪一步」就开始改代码。
