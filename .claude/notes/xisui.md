# xisui/ 結構筆記

一句話：洗髓功法每日練習引導 App（PWA），給使用者本人在手機上每天做完 7 個功法段落
打卡計數；入口 `https://jarixhew-bit.github.io/skills-github-pages/xisui/`。
**2026-07-13 整頁 redesign**（深色鎏金＋襯線標題＋頂欄環形進度），功能與資料結構未變。

## 檔案清單

- `index.html`（977 行）——唯一的邏輯檔，單檔 HTML+CSS+JS（無構建、無框架，見
  `skills/pwa-pages.md`）。內含 6 個計數器段落（吐納/收功/垂吊/甩鞭/會陰拍打/腹股溝拍打）
  + 1 個「蓮花生動功」7 式段落。改文案/時長/次數、加減段落都動這個檔。
- `manifest.json`——PWA 名稱/icon/顏色/`start_url`。改 App 名稱、圖示、啟動路徑時動它。
- `sw.js`（24 行）——Service Worker，cache-first，`CACHE = 'xisui-v3'`（sw.js:1）。
- `icon-192.png` / `icon-512.png`——PWA 圖示，manifest.json 引用，很少需要動。
- 音檔不在 `xisui/` 內：吐納段引用 `../audio/tuna.mp3`（repo 根目錄 `audio/`，已核實存在）。
- **影片不再用本地檔案**：蓮花生動功的示範影片是 B 站 iframe 嵌入
  （index.html:646，`player.bilibili.com/player.html?bvid=BV19J411N7HC`，萬行上師
  蓮花生動功全套 11:54），七式共用一個播放器，使用者自行拖進度。舊的
  `videos/lotus1~7.mp4` 引用已於 2026-07-13 移除，repo 不需要 videos/ 目錄。

## 資料流

- **狀態**：所有打卡進度存瀏覽器 `localStorage`，key 固定 `xisui_state`
  （index.html:710 讀、:923 寫）。結構：`{counts:{段落id:數字},
  done:{段落id:bool}, lotusDone:{式子索引:bool}, lotusTimers:{式子索引:已計時秒數}}`。
  **redesign 未動此結構**，舊進度無縫沿用。無雲端同步、無帳號——換裝置或清瀏覽器
  資料進度就沒了，這是設計如此，不是 bug。
- **PWA 快取**：`sw.js` 的 `ASSETS`（sw.js:2-6）只快取 3 個檔（`/`、`index.html`、
  `manifest.json`），音訊/圖示/B 站 iframe 不進 precache。

## 高頻修改操作

**改一個計數段落的次數/文案**（如「垂吊」從 320 改 350 下）：
1. `COUNTERS` 陣列（index.html:698-706）改對應 `total`。
2. 該段 HTML 裡**四處硬編碼數字**同步改：`<span>320 下</span>`（副標）、
   `/ 320`（counter-total）、`tap('chuidiao', 320)` 與 `resetCounter('chuidiao', 320)`
   的參數、`id="status-chuidiao"` 的初始文字 `0/320`（頂部收合狀態）。
   五處必須一致（`COUNTERS` 只管初始化，onclick 傳入的 total 才是判斷完成的依據）。
3. 改了 index.html 內容就把 `sw.js:1` 版本號 +1（見 PWA 章節）。

**加一個新的計數段落**：複製既有 `<div class="section" id="sec-xxx">` 區塊
（注意 body 內是 `<div class="section-body"><div class="inner">…` 雙層結構，
展開動畫靠外層 grid），改 id/文案/次數；`COUNTERS`（698-706）加一筆；`init()` 的
`sections` 陣列（959 行）加 id；`updateProgress()` 的 `realTotal`（896 行，寫死 7）
跟著調；段落序號用中文數字（`NUMS` 陣列 708 行）。

**改蓮花生動功式名**：`LOTUS` 陣列（688-696 行，只有 `name` 欄位，`file` 欄位已移除）。
現行七式（2026-07-13 依萬行上師體系查證改正）：觀音請聖、仙鶴展翅、**河住江翻**、
**乾坤旋轉**、犀牛望月、荷花搖擺、立地沖天。`buildLotusSlides()`（719 行）自動生成
UI；`.lotus-tab` 分頁按鈕是手寫 HTML（656-662 行），加式子要手動補 tab。

**換示範影片**：改 index.html:646 iframe 的 `bvid=` 參數（B 站）或整個 src（YouTube
用 `youtube.com/embed/ID`）。遵守 CLAUDE.md 媒體規則：影片一律外鏈嵌入，不進 repo。

## 牽一發動全身

- **段落 id 字串**（如 `'tuna'`、`'chuidiao'`）同時出現在：HTML 的 `id="sec-xxx"`/
  `id="body-xxx"`/`id="status-xxx"`/onclick 參數、`COUNTERS` 陣列、`init()` 的
  `sections` 陣列、`localStorage` 的 key。改 id 必須全檔一致改。
- `state` 的 JSON 結構是唯一資料格式，沒有版本遷移邏輯——新增欄位要照
  index.html:711-714 的 `if (!state.xxx) state.xxx = {}` 模式補預設值，否則老用戶報錯。
- 頂欄環形進度（SVG，周長 97.4 寫死在 `updateProgress()` 898 行附近）與 `progress-text`
  綁定 `realTotal`；動 realTotal 不用動周長。

## PWA 相關（Service Worker 快取版本）

- 版本號位置：`sw.js:1`，`const CACHE = 'xisui-v3';`。
- **硬規則（見 `skills/pwa-pages.md`）：改了 `index.html`／`manifest.json` 內容就把
  版本號 +1（v3→v4），否則已安裝 PWA 的使用者因 cache-first 永遠看到舊版。**
- SW 註冊：index.html:973，相對路徑 `register('sw.js').catch(()=>{})`（2026-07-13 修正，
  原絕對路徑 `/xisui/sw.js` 在子路徑部署下 404，離線模式從未生效過；修復上線後
  老用戶首次訪問才會真正安裝 SW）。

## 已知坑

- B 站 iframe 在無網路時顯示空白（SW 不快取跨域 iframe）——離線只能用計數/計時功能，
  屬預期行為。
- `resetAll()`（916 行附近）清空全部進度且無法復原（`confirm()` 後直接覆蓋），
  無雲端備份，是已知的資料風險設計，不是 bug。
- 沙盒/本地 `file://` 打開時 SW 註冊必失敗（已 `.catch` 靜默），Playwright 測試時
  這不算錯誤。
