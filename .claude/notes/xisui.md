# xisui/ 結構筆記

一句話：洗髓功法每日練習引導 App（PWA），給使用者本人在手機上每天做完 7 個功法段落
打卡；入口 `https://jarixhew-bit.github.io/skills-github-pages/xisui/`。
**2026-07-13 兩次大改**：先整頁 redesign（深色鎏金），隨後**全段落改計時制**
（使用者要求：練功時不方便點按計數），舊的點按計數邏輯已全部移除。

## 檔案清單

- `index.html`（615 行）——唯一的邏輯檔，單檔 HTML+CSS+JS（無構建、無框架，見
  `skills/pwa-pages.md`）。**段落 UI 全部由 JS 從 `SECTIONS` 陣列生成**
  （`buildSections()`，468 行），HTML body 裡只有 header/容器/完成橫幅，沒有手寫段落。
- `manifest.json`——PWA 名稱/icon/顏色/`start_url`。
- `sw.js`（24 行）——Service Worker，cache-first，`CACHE = 'xisui-v4'`（sw.js:1）。
- `icon-192.png` / `icon-512.png`——PWA 圖示。
- 音檔：吐納段引用 `../audio/tuna.mp3`（repo 根目錄 `audio/`，已核實存在）。
- 影片：蓮花生動功段 B 站 iframe（494 行，`bvid=BV19J411N7HC`，萬行上師全套 11:54），
  七式只列名字（`LOTUS_NAMES`，362 行），無分式計時。repo 不需要 videos/ 目錄。

## 資料流

- **狀態**：`localStorage` key 固定 `xisui_state`（369 行讀、383 行寫）。現行結構：
  `{done:{段落id:bool}, secTimers:{段落id:累計秒}, runningSince:{段落id:開始毫秒時間戳}}`。
  舊版欄位 `counts/lotusDone/lotusTimers` 讀取相容：載入時若無 `secTimers` 會把
  `lotusTimers` 合併成蓮花段總秒數並立即落盤（371-380 行的遷移塊）。
- **計時引擎是時間戳制**（`elapsedSec()`，402 行）：顯示值 = 累計秒 + (現在 −
  runningSince)。鎖屏、切後台、重新整理都不丟時間；關掉頁面計時也繼續走
  （重開後 runningSince 還在就自動續跑）。**別改回 setInterval 累加制**。
- **Wake Lock**：計時中申請螢幕常亮（389 行，失敗靜默），全部暫停時釋放；
  visibilitychange 回前台時重新申請＋刷新顯示。
- 無雲端同步、無帳號——換裝置或清瀏覽器資料進度就沒了，設計如此。

## 高頻修改操作

**改段落文案/次數參考**：只動 `SECTIONS` 陣列（352-360 行）的 `name`/`sub` 欄位，
UI 自動跟著變。次數（如「320 下」）現在只是參考文案，不參與任何邏輯。

**加/減段落**：`SECTIONS` 加/刪一筆即可——進度總數（561 行 `SECTIONS.length`）、
自動展開、序號（`NUMS` 中文數字，363 行附近）全部自動。特殊內容用欄位開關：
`audio: '路徑'` 生成音頻塊、`video: true` 生成 B 站 iframe＋七式名列表。

**改蓮花生動功式名**：`LOTUS_NAMES`（362 行）。現行七式（2026-07-13 依萬行上師
體系查證改正）：觀音請聖、仙鶴展翅、**河住江翻**、**乾坤旋轉**、犀牛望月、
荷花搖擺、立地沖天。

**換示範影片**：改 494 行 iframe 的 `bvid=`（B 站）或整個 src（YouTube 用
`youtube.com/embed/ID`）。遵守 CLAUDE.md 媒體規則：影片一律外鏈嵌入，不進 repo。
備選影片清單見 2026-07-13 對話（B 站 BV1yE411L7Fq 釋萬行本人演練等）。

## 牽一發動全身

- **段落 id 字串**同時出現在：`SECTIONS` 陣列、`localStorage` 的
  `done/secTimers/runningSince` 三個 map 的 key。改 id 會讓老用戶該段進度歸零
  （不報錯，但當天要重打卡）。
- `state` 結構無版本遷移框架——新增欄位照 371-380 行的
  `if (!state.xxx) state.xxx = {}` 模式補預設值。
- 計時按鈕一列三顆（開始/重置/完成），`.timer-btns .btn` 有 `white-space: nowrap`
  ＋窄 padding——改按鈕文字超過 4 個字會在 390px 寬手機上溢出，先實測再上。

## PWA 相關（Service Worker 快取版本）

- 版本號位置：`sw.js:1`，`const CACHE = 'xisui-v4';`。
- **硬規則：改了 `index.html`／`manifest.json` 內容就把版本號 +1（v4→v5），
  否則已安裝 PWA 的使用者因 cache-first 永遠看到舊版。**
- SW 註冊：611 行，相對路徑 `register('sw.js').catch(()=>{})`（2026-07-13 修正，
  原絕對路徑在子路徑部署下 404，離線模式從未生效過）。

## 已知坑

- B 站 iframe 離線/沙盒環境顯示空白或加載失敗圖（SW 不快取跨域 iframe），預期行為。
- `resetAll()`（577 行附近）清空全部進度且無法復原，無雲端備份，設計如此。
- `file://` 打開時 SW 註冊必失敗（已 `.catch` 靜默），Playwright 測試時不算錯誤。
- Wake Lock 在 iOS Safari 較舊版本不支援（已 try/catch），不支援時鎖屏會熄螢幕，
  但時間戳制計時不受影響，回來時間照樣是對的。
