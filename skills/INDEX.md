# 技能庫索引（按「每 token 買到多少品質」排序）

這是 2026-07-07 交接時寫下的技能庫。排序標準：**讀這個檔花掉的 token，能換回多少避免的損失／提升的品質。** 排名越前，越應該在拿不準時優先讀。

## 使用方式
- 不要每次全讀。按下表「觸發情境」命中哪條讀哪條。
- 第 1-4 名建議每個較大任務開始前掃一遍標題級內容——它們防的是不可逆錯誤。
- 本技能庫與 `.claude/rules/` 分工：rules/ 是制度正本（派工、判斷、維護協議），skills/ 是操作手冊（怎麼做具體的事）。兩者衝突時以 rules/ 為準並回報矛盾。

## 排名

| # | 技能檔 | 觸發情境 | 為什麼排這裡 |
|---|---|---|---|
| 1 | [failure-patterns.md](failure-patterns.md) | 動手前掃一眼；覺得「應該沒問題吧」時 | 每條都是以「天」計代價的真實事故，幾百 token 換掉重踩一次的成本，性價比無可匹敵 |
| 2 | [verify-your-work.md](verify-your-work.md) | 每次宣告「完成」前 | 半成品交付是信任的頭號殺手；一張查表就能攔下絕大多數「應該可以」式交付 |
| 3 | [scope-control.md](scope-control.md) | 想動計劃外檔案時 | 防的是不可逆錯誤（誤刪上線頁面、動了發過網址的檔名），一次事故就抵得上讀一千遍 |
| 4 | [numbers-and-money.md](numbers-and-money.md) | 產出含金額/日期/合計時 | 數字錯一個就毀信任，且使用者無法自行發現；抽 3 筆＋重算合計成本極低 |
| 5 | [delegation.md](delegation.md) | 大量讀取/爬網/批次改檔前 | context 保衛戰的核心；不派工 → 對話失焦 → 所有其他技能全部失效 |
| 6 | [debugging.md](debugging.md) | 任何操作第一次失敗時 | 「失敗 2 次換路」一條規則就能救回弱模型最常見的死亡螺旋 |
| 7 | [deploy-and-branches.md](deploy-and-branches.md) | 改動要上線時 | 每次上線都用，步驟完全機械化，照抄零思考成本 |
| 8 | [repo-organization.md](repo-organization.md) | 建新檔案/新專項前 | 「私密內容進了公開 repo」是唯一無法撤銷的錯誤類型，查表 10 秒 |
| 9 | [environment-awareness.md](environment-awareness.md) | session 開始；涉及安裝/shell/持久化時 | 判錯環境會給出根本錯誤的方案；含本專案最貴的一次事故（啟動 hook） |
| 10 | [communicate-with-user.md](communicate-with-user.md) | 每次回覆 | 內容做對但交付讀不懂 = 白做；規則簡單但每次都用，累積收益大 |
| 11 | [plan-before-work.md](plan-before-work.md) | 每個會產生改動的任務開頭 | 防返工；價值高但部分內容與 3、8 重疊，故排後 |
| 12 | [bilingual-pages.md](bilingual-pages.md) | 建/改中英雙語頁面時 | 場景專用；命中時直接抄 initLang 模式，省掉整輪設計與返工 |
| 13 | [pwa-pages.md](pwa-pages.md) | 建/改 HTML 頁面或 PWA 時 | 場景專用；最大價值是「改內容必升 SW 版本號」這一條成對操作 |
| 14 | [media-files.md](media-files.md) | 頁面要放影片/圖片/音訊時 | 查表即得答案（影片→YouTube、手冊圖→外鏈）；防的是 git 歷史不可逆的膨脹 |
| 15 | [rules-maintenance.md](rules-maintenance.md) | 要改規則/技能檔時 | 用得最少，且完整協議在 rules/maintenance.md，此檔只是摘要入口 |

## 一段話總結（如果只能記住三件事）
1. **不可逆的錯誤（刪錯、洩密、發錯）永遠值得停下來查表**——排名 1、3、8 就是為此存在。
2. **「應該可以」不是完成**——宣告完成前照 2、4 驗證，重要產出派 verifier。
3. **context 是最貴的資源**——大活派出去（5），失敗兩次換路（6），別讓主對話淹死。
