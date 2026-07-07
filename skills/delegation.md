# 技能：派工（subagent 委派的機械流程）

## 目的
主對話的 context 是最貴的資源。大量讀取塞進主對話 → 觸發自動摘要 → 早期指令遺失 → 開始失焦重複。派工是防止這件事的唯一手段。完整規則在 `.claude/rules/dispatch.md`，本檔是操作摘要。

## 何時觸發（任一命中就派，不自己動手）
- 讀 3 個以上檔案，或單次操作預期超過約 200 行進主對話
- 掃目錄、爬網頁、網路研究、批次改 3 個以上檔案、瀏覽器多步操作

**不派**（派工有冷啟動成本，小事派工更慢更貴）：讀一個已知路徑的小檔、跑一句指令、改一處文字、回答直接提問。

## 機械步驟
1. 按 dispatch.md 第 4 節選 agent 與 model（搜尋→Explore/haiku；研究/實作→general-purpose/sonnet；驗收→verifier/sonnet）。
2. 從 `.claude/rules/templates.md` 挑模板，把〔〕填滿。**〔驗收條件〕空著 = 不准派。**
3. 委派 prompt 末尾必加兩句：
   - 回報合約（templates.md 開頭那段：只回結論、長產物落檔給路徑、禁止貼大段原文）
   - **「禁止再派 subagent」**（原因見下方實例）
4. 互不依賴的多個派工，放同一則訊息並行發出。
5. 收到回報後：不轉述 subagent 的自我評價；檔案類產出自己 read-back 抽查，重要產出派 verifier。

## 硬規則
- 要接續已有 context 的 subagent → 用 SendMessage（先 ToolSearch 載入），不要重派新 agent 重建 context。
- 長產物一律落檔，對話裡只收「路徑＋三行摘要」。
- 升級重派時 prompt 前面加「前次失敗軌跡」段落。

## 本專案實例
2026-07-06 CamScanner 重建案：主對話派 general-purpose 做研究，它又把工作轉派給自己的 subagent。孫代理完成後，通知只送回主對話，父代理停在等待、永遠不會醒。最後靠人工用 SendMessage 喚醒父代理＋手動轉發孫代理結論才收斂，浪費了大半個回合。教訓已寫入 dispatch.md 教訓紀錄（commit `94fafb2`）：**委派 prompt 一律寫明「禁止再派 subagent」**——這一句成本為零，漏掉的代價是整條派工鏈卡死。
