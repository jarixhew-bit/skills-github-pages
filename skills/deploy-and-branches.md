# 技能：部署與分支流程（改動如何上線）

## 目的
本 repo 的頁面全部經 GitHub Pages 上線，網址已發到使用者的親友手上。上線流程做錯的後果是「別人打開網址看到壞頁面」。此檔把流程固化成不用思考的步驟。

## 何時觸發
任何改動要對外生效時（頁面、App、腳本）。

## 機械步驟
1. 改動 commit 到**功能分支**（網頁版 session 會自動給 `claude/*` 分支；本地自建，命名描述用途）。
2. push：`git push -u origin <分支名>`。失敗且是網路錯誤 → 2s/4s/8s/16s 退避重試最多 4 次。
3. 建 PR 並**自動合併到 main**，合併方式固定 **squash merge**（CLAUDE.md 分支策略；這是使用者授權過的自動流程，不用每次再問）。
4. 有衝突 → 先在功能分支 `git merge origin/main` 解掉，再合併。
5. 合併後**刪除功能分支**。分支只是合併前的臨時工作區，不用於分類——分類靠資料夾。
6. 驗證真的進了 main：`git show origin/main:<路徑>` 從 remote 讀回抽驗。
   ⚠️ **雲端 session 抓不到 `github.io`**（出口代理 403，見 diagnosis.md），
   「WebFetch 線上網址確認」在雲端做不到，別試。線上那層由 `tools/check-live.py`
   ＋ `live-check.yml` 每天自動驗；本機 CLI 不受此限，可以直接 WebFetch 驗。
7. 回覆使用者時直接給網址。更新後對方刷新即同步，**不需要重發檔案**。
8. 收工時把本地 HEAD 切回 main（做法與理由見 `.claude/skills/publish-pages/SKILL.md` 第 7 步，
   此處不重複）。

## 硬規則
- 禁止直接 push main（唯一例外：本地 CLI 無 PR 工具時可直推 main，但必須在回覆裡說明）。
- 一個 PR 只做一件事。混裝多個不相關改動的 PR，squash 之後歷史無法追溯。
- commit 訊息用中文、寫「做了什麼＋為什麼」，看 git log 就能當變更日誌讀（參照現有風格，如 `0b3d6d9`）。
- 第 6 步「確認真的進了 main」不可省。merge 成功 ≠ 內容真的在 main（混用 `git rm` 與
  Write/Edit 時最容易漏）。至於**線上**是否生效，雲端驗不了，別把它寫成交付條件。

## 本專案實例
commit `0b3d6d9`「只保留『导出账户明细』；收支汇总改三栏并自动生成注资说明 (#94)」——一次功能改動、一個分支、一個 PR、squash 合併、PR 號自動進 commit 訊息。整個 git log 讀起來就是 expense-tracker 的版本演進史（#88 拍單據 → #89 裁剪與憑證編號 → #90 性能 → #91 OCR → #93/#94 導出）。這種可讀性不是天上掉的，是「一 PR 一事＋中文訊息」兩條規則機械執行的結果。
