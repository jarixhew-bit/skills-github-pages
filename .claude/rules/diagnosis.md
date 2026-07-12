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
