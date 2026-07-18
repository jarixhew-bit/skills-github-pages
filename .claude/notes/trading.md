# trading/ 結構筆記

一句話：58 檔美股/ETF 技術信號掃描 + IBKR 真實持倉健康追蹤頁面，給使用者本人看；
日常資料由 GitHub Actions 自動產出（零 Claude 消耗），頁面
`https://jarixhew-bit.github.io/skills-github-pages/trading/`，密碼存私有倉庫
`jarixhew-bit/ai-vault` 的 `money/trading-analyzer.md`。**`trading/README.md`
是本專案的權威運行手冊，內容比本筆記更細（含對帳 SOP、數據契約），本筆記只做
「結構導覽＋改哪裡」，兩者衝突以 README.md 為準。**

## 檔案清單與分工

- `README.md`（71 行）——架構總覽、對帳 SOP、常見維護、數據契約，**先讀這個**。
- `universe.json`——58 檔掃描名單（symbol/name/etf/contract_id）。加減股票動這裡。
- `fetch_prices.py`（126 行）——抓行情：Stooq 主源、Yahoo 備援，全量覆盖寫入
  `history/SYM.json`，只保留最近 320 根日線；`main()`（76-125 行）失敗超過 1/4
  檔案會 `sys.exit(1)` 讓 CI 失敗（防止發布殘缺資料，見 121 行）。只在 GitHub Actions
  跑（沙盒網路不通行情源，README.md:3 已註明）。
- `flex_account.py`（122 行）——用 `IBKR_FLEX_TOKEN`/`IBKR_FLEX_QUERY_ID` 兩個
  Secret 拉 IBKR Flex Query，輸出 `raw/flex_account.json`（持倉/現金/NAV/成交）；
  失敗即 `sys.exit(1)`，workflow 層 `|| echo ...` 吞掉失敗、沿用舊底數（不阻斷管線）。
- `analyzer.py`（692 行）——核心管線，兩種模式自動判別（日常模式：只用 `history/`
  重算市值；對帳模式：`raw/` 有 IBKR 轉錄檔時刷新底數與 TWR 基準）。
  `analyze_ticker()`（124-230 行）算技術信號打分；`build_add_suggestions()`
  （331 行起）算加倉建議；`main()`（392 行起）組裝輸出、寫入三個產物檔。
  加密函式 `encrypt_json`/`decrypt_json`（53-74 行）：PBKDF2-SHA256(30 萬次)+AES-256-GCM。
- `data-public.json`——市場掃描信號，**明文**，頁面直接 `fetch` 讀取。
- `data-private.enc` / `state.enc`——持倉健康、台帳、TWR 基準，**加密**，頁面用使用者
  輸入的密碼在瀏覽器端解密（`index.html:214-221` 用 Web Crypto API）。
- `history/*.json`（58 檔）——各股票日線，`fetch_prices.py` 產出，`analyzer.py` 消費。
- `index.html`（457 行）——頁面本體，單檔 HTML（同 `skills/pwa-pages.md` 慣例）。
  密碼輸入框 `pwInput`（153 行），`PW_KEY = "tradingAnalyzerPw"`（194 行，
  localStorage key，與 `expense-tracker.html` 的 IBKR 卡共用同一把密碼，見 README.md:31-32）。
- `ibkr_trader.py`（75 行）——**不獨立執行**，是給 Claude session 內半自動下單用的
  system prompt/watchlist 文字模板，不是管線一部分。
- `signals.py` / `backtest.py`——README.md:34 明確標註「舊原型，不在使用」，
  改動前先確認使用者是否真要重啟這條路，不要當成主要邏輯來源。
- `.gitignore`——排除 `raw/`（對帳模式的臨時轉錄檔，含真實持倉數字，不入庫）。

## 資料流

```
UTC 13-21 點每小時（美股交易時段，週一至五）── GitHub Actions（trading-daily.yml）
  fetch_prices.py → history/*.json（無新行情不重寫，靠此判斷要不要 commit）
  flex_account.py → raw/flex_account.json（失敗不阻斷，沿用舊底數）
  analyzer.py     → data-public.json / data-private.enc / state.enc
  git commit + push → GitHub Pages 自動發布
```
（2026-07-18 由「收盤後 21:40 UTC + 次日 09:40 UTC 補漏跑」改為交易時段內每小時跑，
用戶要求讓 HTML 頁面資料每小時刷新，見下方「已知坑」的相關記錄。）

- `index.html` 讀 `data-public.json`（`index.html:228`，明文，任何人可看）與
  `data-private.enc`（`index.html:246`，需密碼解密才能看持倉）。
- 對帳模式（改真實持倉底數）不在自動化裡，是 Claude session 手動流程，
  完整步驟見 README.md 36-52 行「對帳流程」，此處不重複。

## 高頻修改操作

**加一檔股票進監控**：改 `universe.json` 加一筆 `{symbol,name,etf,contract_id:null}`，
下一次 `trading-daily` 跑時 `fetch_prices.py` 會自動抓歷史、`analyzer.py` 自動納入掃描，
不需要手動回填 `history/`（README.md:56）。

**改信號打分規則**：全部邏輯在 `analyzer.py` 的 `analyze_ticker()`
（124-230 行），例如 RSI 超賣/超買閾值在 178/180 行（`<30`/`>70`）、
MA20/MA50 金死叉在 168-172 行、評分轉建議的門檻在 201-210 行
（`score>=4` 強烈買入 … `score<=-4` 強烈賣出）。改完閾值即生效，
下次 Actions 跑或本地手動跑 `python3 trading/analyzer.py --password-file ...` 驗證。

**改加倉建議規則**：`build_add_suggestions()`（331 行起），目標倉位比例讀
`state.enc` 裡加密的 `targets` 欄位（不在 git 明文中），改比例要解密 state 再重跑
管線，見 README.md:61-63。

**改監控/新聞摘要邏輯**：`.github/scripts/portfolio_news.py`，`fetch_ibkr_positions()`
（55 行起）是**另一套獨立的 Flex 拉取實作**，與 `trading/flex_account.py` 邏輯重複但
不共用程式碼（見「牽一發動全身」）。

## 牽一發動全身

- **history bars 格式**：`["YYYY-MM-DD", o, h, l, c, v]` 升序、留最近 320 根
  （README.md:68）。`fetch_prices.py` 產出、`analyzer.py` 的 `load_history()`/
  `validate_bars()`（235-263 行附近）消費——改這個陣列結構，兩邊都要同步改，
  且 `analyze_ticker()` 內用固定索引 `b[4]`（收盤）、`b[5]`（量）取值，改欄位順序
  會直接讀錯資料且不報錯。
- **加密封裝格式**（`{v,kdf,iter,salt,nonce,ct}`）：`analyzer.py` 的
  `encrypt_json`/`decrypt_json`（Python/cryptography）與 `index.html` 的
  `decryptEnvelope()`（214-221 行，Web Crypto API）是**兩套獨立實作、同一格式**，
  改 KDF 迭代次數、演算法或欄位名稱，兩邊必須同步改，否則頁面端解密會直接失敗
  （無版本協商機制，`v` 欄位目前恆為 1，未做多版本相容判斷，未查證）。
- **IBKR Flex 密鑰**（`IBKR_FLEX_TOKEN`/`IBKR_FLEX_QUERY_ID`）被 `flex_account.py`
  與 `portfolio_news.py` 兩處各自讀取使用，改 Secret 名稱或輪換密鑰要兩處都改；
  兩個 workflow **共用同一組憑證**，改其中一邊的 Flex Query 定義或 token 前，
  務必想到會同時影響另一邊（見下方「已知坑」IBKR 1001 那條）。

## 自動化（GitHub Actions）

- **`trading-daily.yml`**：UTC 13-21 點每小時（美股交易時段，週一至五），跑
  `fetch_prices.py → flex_account.py → analyzer.py`，成功則 commit+push 到 main
  （`concurrency` group 防重疊執行，有 `git pull --rebase` 防推送衝突，
  見 yml 註解「2026-07-12 曾因此推送被拒」）。需要 Secret：`ANALYZER_PW`
  （缺失時私密區停更但公開信號區照跑，README.md:29-30）、`IBKR_FLEX_TOKEN`、
  `IBKR_FLEX_QUERY_ID`。失敗排查：倉庫 Actions 頁看 `trading-daily` 執行日誌。
- **`daily-portfolio-news.yml`**：UTC 00:40（週二至六，=柬埔寨 UTC+7 早上約 09:00，
  用戶 2026-07-17 指定），跑 `.github/scripts/portfolio_news.py` 發 Telegram 摘要
  （新聞翻譯+打分+持倉建議），需要 `TELEGRAM_TOKEN`/`TELEGRAM_CHAT_ID`/
  `IBKR_FLEX_TOKEN`/`IBKR_FLEX_QUERY_ID` 四個 Secret，任一失敗此 workflow 直接失敗
  （腳本用 `os.environ[...]` 硬取值，未做缺失容錯，未查證是否故意如此）。
  失敗排查同上，看該 workflow 的 Actions 日誌。
- **「大批量數據走 CI 不走 Claude」規則的落點**：58 檔×320 根 K 線的抓取與計算全部
  在這兩個 workflow 裡跑完，Claude session 只在「對帳模式」時經手少量帳戶級 JSON
  （positions/summary/trades/perf，通常幾十行），不逐筆抄寫價格數據——這正是
  `dispatch.md` 教訓紀錄 2026-07-10 那條規則的具體實現案例。

## 已知坑

- 兩套 Flex 拉取實作重複（見上「牽一發動全身」），改帳戶欄位解析邏輯容易漏改一邊。
- `analyzer.py` 對「持倉但不在掃描名單/無歷史」的股票會退化成按成本估算市值並記警告
  （analyzer.py:561），不是精確值，深度對帳前不要用它算精確損益。
- `data-private.enc`/`state.enc` 解密密碼與 `expense-tracker.html` 共用同一
  localStorage key `tradingAnalyzerPw`，改其中一邊的密碼機制要考慮另一邊是否受影響。
- **IBKR Flex `ErrorCode=1001` 的真正根因是 Flex Query 定義本身殘缺，不是排隊衝突**
  （2026-07-16~18 排查記錄）：一開始誤判是 `trading-daily` 與 `daily-portfolio-news`
  共用同一組 Flex 憑證、實際執行時間點太接近導致 IBKR 報表生成冷卻期衝突，因此把
  `daily-portfolio-news` 的排程改了兩次（先避開 1 小時，再改到用戶指定的柬埔寨 9 點）；
  但改完排程後、手動觸發驗證仍然 100% 失敗（且觸發時間點離另一個 workflow 已超過
  3.5 小時，遠超正常冷卻期），才確認真正原因是 IBKR 帳戶那邊的 Flex Query 定義本身
  缺 Section（只有 NAV 沒有 Cash Report / Open Positions，且 NAV 裡也只勾了
  Report Date 一個欄位）——報表天生生成不出完整數據，跟哪個時間點請求無關。
  **教訓**：`1001` 報錯本身模糊、不能只從症狀反推「服務器忙/衝突」這類猜測性根因，
  收到同一報錯連續多天出現時，優先直接讓用戶到 IBKR Client Portal → Reports →
  Flex Queries 把對應 Query 手動「運行」一次核對，比在我們這端猜測排程/頻率因素
  快得多、準得多。修復後的 Query 需要三個 Section 都在：**Cash Report**（Currency/
  Starting Cash/Ending Cash/Ending Settled Cash）、**Net Asset Value (NAV) in Base**
  （至少 Report Date + Cash + Stock + Total）、**Open Positions**（Currency/Asset
  Class/Symbol/Quantity/Cost Basis Price/Position Value/Open Price/Mark Price 等）；
  `flex_account.py` 的殘缺報表校驗（見檔案內註解）就是靠這三塊互相對帳（持倉市值+
  現金 應約等於 NAV Total，容差 5%）。
- **`trading-daily.yml` 改成每小時跑後，`state.enc` 幾乎每次都會判定「有變化」並
  提交**：因為加密用隨機 salt/nonce，即使底層持倉數據完全不變，密文每次也不同。
  這是預期行為（用戶要的就是 HTML 頁面每小時刷新），不是 bug，但意味著 main 的
  提交歷史會變得密集（工作日每小時一次），提交訊息已改成帶時鐘點的
  `hourly data update YYYY-MM-DD HH:00 UTC` 格式，方便日後排查。
