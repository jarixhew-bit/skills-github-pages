# 技能：環境判別與環境專屬的坑

## 目的
本 repo 被兩個環境共用：Claude Code 網頁版（遠端容器，session 結束即消失）與本地 CLI（Windows，`C:\Users\YANG\skills-github-pages`）。同一句話在兩個環境的正確做法不同，判斷錯環境會給出錯誤建議或踩平台坑。

## 何時觸發
session 開始的第一個任務前；任何涉及「安裝」「持久化」「檔案系統」「shell 指令」的操作前。

## 機械步驟
1. **判別環境**：環境變數 `CLAUDE_CODE_REMOTE=true` → 網頁版容器；路徑是 Windows 格式（`C:\...`）→ 本地。
2. **網頁版容器的三個事實**：
   - 任何「本地安裝」都裝在容器裡，session 結束就消失。要持久的東西只有這個 repo 本身（commit + push 才算保存）。
   - memory 系統不存在；教訓要落檔到 `.claude/rules/` 並 commit（maintenance.md 第 3 節）。
   - 需要使用者自己瀏覽器/登入態的操作（如 claude-in-chrome）做不到 → 明說「此事需本機做」。
3. **本地 Windows 的三個坑**（詳見 diagnosis.md 問題 #3）：
   - PowerShell 5.1 沒有 `&&`/`||`；用 `A; if ($?) { B }`。
   - 寫含中文的檔案一律用 Write/Edit 工具，禁止 `echo >`/`Out-File`（預設 UTF-16 會亂碼）。
   - POSIX 腳本走 Bash 工具，不餵給 PowerShell。
4. **兩地同步**：開工先 `git pull`，改完必 `git push`。發現兩邊 rules 分岔 → 以較新 commit 為準合併。

## 硬規則
- **禁止註冊阻塞式 SessionStart hook。** 如需容器環境初始化，必須後台執行＋超時。
- 回覆裡提到路徑時，按當前環境給對的格式（容器給 POSIX 路徑，本地給 Windows 路徑）。

## 本專案實例
2026-07-05 事故：`.claude/hooks/session-start.sh` 被註冊為 SessionStart hook，內容是 clone + pnpm install + 安裝 11 個插件。結果網頁版**每次開新對話都要先跑完整套安裝**，開對話無限轉圈數天，使用者以為 Claude 壞了。修法：從 settings.json 移除註冊，腳本保留但開頭寫明停用原因（見該檔 1-5 行）。深層教訓：**hook 在每個 session 都會跑，寫 hook 時要按「這會執行一萬次」來設計**——重活永遠後台＋超時，啟動路徑上一毫秒都嫌多。
