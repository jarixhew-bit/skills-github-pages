# xisui/ 結構筆記

一句話：洗髓功法每日練習引導 App（PWA），給使用者本人在手機上每天做完 7 個功法段落
打卡計數；入口 `https://jarixhew-bit.github.io/skills-github-pages/xisui/`。

## 檔案清單

- `index.html`（921 行）——唯一的邏輯檔，單檔 HTML+CSS+JS（無構建、無框架，見
  `skills/pwa-pages.md`）。內含 6 個計數器段落（吐納/收功/垂吊/甩鞭/會陰拍打/腹股溝拍打）
  + 1 個「蓮花動功」7 式輪播段落。改文案/時長/次數、加減段落都動這個檔。
- `manifest.json`——PWA 名稱/icon/顏色/`start_url`。改 App 名稱、圖示、啟動路徑時動它。
- `sw.js`（24 行）——Service Worker，cache-first，`CACHE = 'xisui-v2'`
  （xisui.md:第 1 行常數，見下方 PWA 章節）。
- `icon-192.png` / `icon-512.png`——PWA 圖示，manifest.json 引用，很少需要動。
- 音檔/影片不在 `xisui/` 目錄內：`index.html:389` 引用 `../audio/tuna.mp3`
  （相對於 xisui/ 的上一層，即 repo 根目錄的 `audio/` 資料夾）；蓮花動功 7 式
  在 `index.html:683` 引用 `../videos/lotus1.mp4` ~ `lotus7.mp4`。

## 資料流

- **狀態**：所有打卡進度存瀏覽器 `localStorage`，key 固定 `xisui_state`
  （`index.html:651` 讀、`index.html:865` 寫）。結構：`{counts:{段落id:數字},
  done:{段落id:bool}, lotusDone:{式子索引:bool}, lotusTimers:{式子索引:已計時秒數}}`。
  **無雲端同步、無帳號**——換裝置或清瀏覽器資料進度就沒了，這是設計如此，不是 bug。
- **音訊**：目前只有 `audio/tuna.mp3` 真實存在（已核實，6.1MB）。蓮花動功引用的
  `videos/lotus1.mp4`~`lotus7.mp4` **repo 裡不存在** `videos/` 目錄——2026-07-13 起
  已加優雅降級（`showVideoPlaceholder()`，index.html:660，複用 `.video-placeholder`
  樣式）：影片載入失敗時顯示「示範影片尚未上架」占位而非壞播放器。補影片時見「已知坑」。
- **PWA 快取**：`sw.js` 的 `ASSETS` 陣列（sw.js:2-6）只快取 3 個檔（`/`、
  `index.html`、`manifest.json`），音訊/圖示/影片不進 precache，靠瀏覽器一般 HTTP 快取。

## 高頻修改操作

**改一個計數段落的次數/文案**（如「垂吊」從 320 改 350 下）：
1. `index.html` 的 `COUNTERS` 陣列（約 641-648 行）改對應 `total`。
2. 對應 `<div class="section" id="sec-xxx">` 區塊內三處硬編碼數字要同步改：
   `<span>320 下</span>`（顯示文案）、`/ 320`（counter-total 文字）、
   `onclick="tap('chuidiao', 320)"` 與 `resetCounter('chuidiao', 320)` 的參數。
   四處數字**必須一致**，沒有單一資料源（`COUNTERS` 陣列只管進度條初始化，
   HTML 硬編碼的數字才是實際判斷完成的依據，`tap()`/`resetCounter()` 呼叫時傳入的
   `total` 參數優先生效）。
3. 若改的是 SW 會快取到的檔案內容（index.html 本身），照 PWA 章節升版本號。

**加一個新的計數段落**：複製既有 `<div class="section" id="sec-xxx">` 區塊
（如 `index.html:450-471` 的垂吊段），改 id/文案/次數，並在 `COUNTERS` 陣列
（641-648 行，631 行起是 `LOTUS` 陣列別搞混）加一筆，且在 `init()` 的 `sections` 陣列（903 行）加入新 id
（否則「自動展開第一個未完成段落」邏輯不會巡到它），`updateProgress()` 的
`realTotal`（848 行，目前寫死 `7`）也要跟著調整。

**加一式蓮花動功**：在 `LOTUS` 陣列（632-638 行）加一筆 `{name, file}`，
`buildLotusSlides()`（668-700 行）會自動生成 UI，但需準備對應 `videos/xxxN.mp4`
放進 repo 根目錄 `videos/`（目前該目錄不存在，需新建）；同時 `.lotus-tab` 分頁按鈕
是手寫 HTML（600-606 行附近，`onclick="lotusTab(N)"`），加式子要手動補一個 tab。

## 牽一發動全身

- **段落 id 字串**（如 `'tuna'`、`'chuidiao'`）同時出現在：HTML 的 `id="sec-xxx"`/
  `id="body-xxx"`/`onclick` 參數、`COUNTERS` 陣列、`init()` 的 `sections` 陣列、
  `localStorage` 存的 `state.counts`/`state.done` 的 key。改 id 名稱必須全檔案
  一致改，任何一處漏改會讓該段落的完成判斷或展開邏輯失效。
- `state` 的 JSON 結構（`counts`/`done`/`lotusDone`/`lotusTimers`）是唯一資料格式，
  沒有版本遷移邏輯——若未來改結構（例如加欄位），舊使用者 localStorage 裡的舊格式
  會被 `JSON.parse(... || '{}')` 讀入後靠 `if (!state.xxx) state.xxx = {}` 補預設值
  （651-655 行），新增欄位需照這個模式補，否則舊使用者會報錯。

## PWA 相關（Service Worker 快取版本）

- 版本號位置：`sw.js:1`，`const CACHE = 'xisui-v1';`。
- **硬規則（見 `skills/pwa-pages.md` 第 16 行）：只要改了 `index.html`／
  `manifest.json` 的內容，必須把 `sw.js:1` 的版本號往上升一位（v1→v2），
  否則已安裝 PWA 的使用者會因 cache-first 策略永遠看到舊版本，直到快取自然失效。**
  升版本會觸發 `activate` 事件（sw.js:13-18）清掉舊版快取。
- SW 註冊路徑是 `index.html:917` 的 `navigator.serviceWorker.register('sw.js')`
  ——**相對路徑**（2026-07-13 修正；原本寫死 `/xisui/sw.js`，在
  `/skills-github-pages/` 子路徑部署下是 404，離線模式從未生效過）。
  `sw.js` 內 `ASSETS` 與 `manifest.json:5` 的 `start_url` 仍用
  `/skills-github-pages/...` 絕對路徑，與部署位置一致。

## 已知坑

- ~~SW 註冊路徑錯誤~~ **已於 2026-07-13 修復**（改相對路徑 `'sw.js'`，CACHE 升 v2）。
  該修復意味著老用戶瀏覽器裡從來沒有註冊成功過 SW，修復上線後首次訪問才會真正安裝。
- **蓮花動功影片仍然缺失（已降級，未補片）**：`videos/lotus1.mp4`~`lotus7.mp4` 不存在，
  2026-07-13 起載入失敗會顯示占位提示（不再是壞播放器），計時器照常可用。將來補影片時
  遵守 CLAUDE.md「媒體檔案規則」——上傳 YouTube（不公開）用 iframe 嵌入替換整個
  `<video>` 標籤，不要把 mp4 放進 repo；同時移除 `showVideoPlaceholder` 降級即可。
- `resetAll()`（854-861 行）會清空全部 `localStorage` 進度且無法復原（`confirm()`
  後直接覆蓋），沒有雲端備份，這是已知的資料風險設計，不是 bug。
