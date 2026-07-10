# 模型調度守則（可攜版）

讀者：主對話的模型（任何等級）。核心思想：**主對話是指揮官，context 是最貴的資源；
指揮官保持乾淨，粗活派出去，只收結論。**

## 0. 可用的資源（2026-07-03 於本機驗證；雲端以當場清單為準，缺的用備援）

**Agent 類型**（Agent 工具的 `subagent_type` 參數）：
- `Explore`：唯讀搜尋。找檔案、找關鍵字、「X 在哪裡定義」。不能改檔。呼叫時要指定廣度
  （quick / medium / very thorough）。
- `general-purpose`：全工具。研究、爬網、批次改檔、多步任務的預設選擇。
- `Plan`：規劃實作方案用，回傳步驟計畫。
- `claude`：萬用型，沒有更合適的才用。
- `claude-code-guide`：查 Claude Code / Claude API 本身的功能問題。
- 自訂 agent：`verifier`（驗收員，見第 5 節），定義在本 repo `.claude/agents/verifier.md`。
  **備援**：若當前 session 的可用 agent 清單沒有 verifier（agents 目錄新建需重啟才載入，
  或雲端未讀到），改派 `general-purpose`/sonnet，並把 verifier.md 的內文規則整段
  貼進委派 prompt，效果等同。

**模型**（Agent 呼叫的 `model` 參數）：`haiku`、`sonnet`、`opus`。
（`fable` 在參數表裡存在但未來未必可用，不要依賴。）

**effort 的兩個事實**（2026-07-03 經官方文件查證，來源 code.claude.com/docs/en/sub-agents.md）：
- Agent 呼叫時只能指定 model，**不能逐次指定 effort**。
- effort 寫在 agent 定義檔 frontmatter 的 `effort` 欄位，可填 `low/medium/high/xhigh/max`，
  會覆蓋 session 預設。需要高強度思考的常設任務，就為它建專屬 agent 定義檔。

## 1. 指揮官不下場——什麼時候必須派 subagent

出現任一情況就派，不要自己動手：
- 要讀 3 個以上檔案，或單次操作預期塞進主對話超過約 200 行（此門檻與 CLAUDE.md 鐵律 1 一致，唯一定義處為本檔）
- 掃目錄結構、在多處找東西
- 爬網頁、抓網頁內容、網路研究（單一 WebFetch/WebSearch 查一個小事實可以自己來）
- 批次修改 3 個以上檔案
- 瀏覽器多步操作（登入、填表、逐頁翻）

**反例（不要派）**：讀一個已知路徑的小檔、跑一句指令、改一處文字、回答使用者的直接
提問。派工本身有成本（subagent 冷啟動、要重新建立 context），小事派工反而更慢更貴。

## 2. 派工三件套——每個委派 prompt 必含三段

1. **目標與動機**：要做什麼、為什麼要做（動機讓 subagent 在意外情況下能自行取捨）。
2. **驗收條件**：可檢查的完成標準，寫成清單。「找到 X 並列出路徑」是驗收條件；
   「好好研究一下」不是。
3. **回報格式**：明確規定回什麼、多長。預設用第 3 節的回報合約。

模板見 templates.md，直接填空使用。

## 3. 回報合約（寫進每個委派 prompt 的結尾）

> 回報要求：只回結論。格式：(1) 結論／答案，5 行以內；(2) 關鍵證據，用 `檔案路徑:行號`
> 或 URL 列出；(3) 未解決事項與原因。長產物（報告、資料、程式碼）寫到指定檔案，
> 回報中只給路徑。禁止把整頁網頁內容或整段檔案內容貼回來。

指定落檔路徑時：制度性內容放本 repo `.claude/rules/`，一次性產物放臨時目錄
（本機用 scratchpad）或使用者指定處。

## 4. 模型選擇表

| 任務 | agent / model |
|---|---|
| 找檔案、找關鍵字、確認某東西存在 | `Explore` / haiku |
| 讀多個網頁並摘要、一般研究 | `general-purpose` / sonnet |
| 批次套用已定型的修改模式 | `general-purpose` / haiku |
| 實作功能、寫報告、建網頁 | `general-purpose` / sonnet |
| 規劃複雜任務的做法 | `Plan` / sonnet（卡關升 opus） |
| 驗收別人的產出 | `verifier` / sonnet |
| 高風險判斷、多次失敗後的僵局 | `general-purpose` / opus |

## 5. 驗證不自驗

- **檔案類產出**：主對話自己 read-back 抽查（讀回開頭、結尾、隨機中段各一處，
  確認非空、非亂碼、內容對題）。
- **重要或複雜產出**：派 `verifier` agent（fresh context，沒看過製作過程）帶著
  原始驗收條件去查。verifier 只回「通過 / 不通過＋具體缺陷清單」。
- **程式碼**：用測試或實跑驗證，不接受「看起來對」。
- **高風險判斷**（要花錢、不可逆、對外發送）：加第二意見——同一問題再派一個
  fresh agent 獨立作答，兩答不一致就升級模型裁決或問使用者。

## 6. 升降級路徑

- haiku 的 subagent **錯 1 次**：直接換 sonnet 重派，不給第二次機會。
- sonnet 的 subagent **同一子任務連錯 2 次**：升 opus 重派，且 prompt 必須附上
  完整失敗軌跡（做了什麼、錯在哪、錯誤訊息原文），讓 opus 不重蹈覆轍。
- opus 也解不掉：停下來問使用者，附上已嘗試的路徑（見 judgment.md 第 3 節）。
- **降級**：一旦某類問題的解法定型（例如批次改 20 個檔案，前 2 個已由 sonnet 做對
  並確立模式），剩餘的降回 haiku 批次套用，並抽驗其中 1-2 件。
- **同一件事最多重試兩輪**。兩輪 = 兩次「換方法重來」，不是兩次原樣重跑。
  超過就升級或上報。

## 教訓紀錄
- [2026-07-10][雲端] 情境：需要大批量數據（如 58 檔股票×250 根 K 線）時，派 subagent 從 MCP
  工具結果「抄寫」進檔案，token 消耗巨大（一次燒穿兩個 session limit）且易抄錯。教訓：先找
  程式化通道——沙盒網路不通的公開數據源，GitHub Actions 的 runner 通常能直連，把抓取搬到
  CI 上跑（零 Claude 消耗、無抄寫錯誤）；MCP 抄寫只留給真正拿不到的私有數據（如券商帳戶）
  且要配校驗。另：使用者明確要求日常自動化不得消耗 Claude 用量，設計自動化預設先考慮 CI 方案。
- [2026-07-06][皆是] 情境：派 general-purpose 做研究，它又把工作轉派給自己的 subagent，
  孫代理的完成通知只會送回主對話，父代理停在等待、永遠不會被自動喚醒。教訓：委派
  prompt 一律寫明「禁止再派 subagent」（除非刻意要它分派）；若已發生，用 SendMessage
  喚醒父代理並把孫代理結論轉發給它收斂。來源：CamScanner 重建案研究階段轉包三層，
  靠指揮官手動喊停＋轉發才收斂。

## 7. 並行與續用

- 互不依賴的派工，同一回合並行發出（多個 Agent 呼叫放同一則訊息）。
- 要接續已有 context 的 subagent 用 SendMessage（deferred 工具，需先 ToolSearch 載入），
  不要重派新 agent 重建 context。
- 背景執行（`run_in_background: true`）適合長任務；需要結果才能往下走時用同步。
