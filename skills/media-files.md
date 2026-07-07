# 技能：媒體檔案處理（影片、圖片、音訊）

## 目的
這是公開 repo，部署在 GitHub Pages。大檔案會讓 clone 變慢、吃掉 Pages 限額，而且 git 歷史裡的檔案刪了也還在。媒體規則是使用者定的（CLAUDE.md），此檔解釋執行細節與理由，防止「方便起見直接塞進 repo」。

## 何時觸發
任何任務涉及在頁面裡放影片、圖片或音訊時。

## 機械步驟
| 媒體 | 做法 | 禁止 |
|---|---|---|
| 影片 | 請使用者上傳 YouTube 並設「不公開」(unlisted)，頁面用 `<iframe>` 嵌入 | 影片檔進 repo（任何格式、任何大小） |
| 圖片（旅遊手冊類） | 用 Google Places 圖片連結外鏈 | 圖片檔進 repo |
| 音訊 | 可直接進 repo（檔案小） | — |
| 圖示/icon（SVG、小 PNG） | 可直接進 repo（如 `expense-tracker-icon.svg`、`xisui/icon-192.png`） | — |

補充規則：
1. 影片設 unlisted 而不是 public 的原因：內容多是家庭/私人行程，unlisted = 有連結才看得到，又不用登入。不要「順手」建議設 public。
2. Google Places 圖片連結要實際 WebFetch 驗證能載入再交付——外鏈會失效，交付時壞圖 = 沒完成。
3. 使用者直接上傳媒體檔給你時：不要默默 commit 進 repo，先按上表判斷，影片/大圖要回覆說明正確流程（YouTube / 外鏈）。

## 硬規則
- 「檔案不大，放一下沒關係」不成立——git 歷史不可逆，今天 5MB 明天 50MB。唯一例外是音訊與 icon（上表明列）。
- 嵌入 YouTube 用 `youtube-nocookie.com` 域名的 iframe 更乾淨（無 cookie 提示），非強制。

## 本專案實例
`audio/tuna.mp3` 直接放在 repo（音訊小、規則允許）；而旅遊手冊 `japan-trip-2026.html`、`restaurant-guide.html` 的所有圖片都是外鏈，repo 裡一張照片都沒有——這就是為什麼這個有多本圖文並茂手冊的 repo，clone 下來只有幾百 KB 的 HTML。判斷依據不是檔案大小本身，而是**類型規則查表**：影片→YouTube、手冊圖→Places 連結、音訊→可進 repo。查表執行，不現場發明。
