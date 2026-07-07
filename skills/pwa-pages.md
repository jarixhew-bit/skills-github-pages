# 技能：單檔網頁與 PWA 的工程慣例

## 目的
本 repo 的產品形態統一是「單一 HTML 檔＝一個完整應用」（無構建步驟、無框架、無依賴安裝），部分升級為 PWA（`expense-tracker.html`、`xisui/`）。這個形態是刻意選擇，弱模型容易「順手現代化」把它破壞掉。

## 何時觸發
新建頁面/App，或修改現有 HTML 頁面時。

## 機械步驟
1. **單檔原則**：HTML/CSS/JS 全部寫進一個 `.html` 檔。不拆檔、不引入構建工具（webpack/vite）、不引入框架（React/Vue）。原因：GitHub Pages 直接伺服、使用者環境無 node、單檔可以整檔發給人。
2. 外部庫**只允許** CDN `<script>` 引入，且要選有明確版本號的 URL（如 Tesseract.js 之於 expense-tracker）。加庫前先問自己：原生 JS 300 行內能不能做到？能就不加。
3. **升級 PWA 的固定三件套**（照 `expense-tracker` / `xisui/` 抄）：
   - `*.webmanifest` / `manifest.json`（名稱、icon、theme_color、display: standalone）
   - Service Worker（`*-sw.js`）：cache-first，**快取列表寫死版本號**（v5→v6 這樣升）
   - HTML head 里 link manifest ＋註冊 SW
4. **改了頁面內容必升 SW 快取版本號**，否則已安裝 PWA 的使用者永遠看到舊版。這是本形態最容易漏的一步——把它當成「改 expense-tracker.html = 必改 expense-tracker-sw.js 版本號」的成對操作。
5. 資料存 localStorage/IndexedDB（本地優先，無後端）。寫存取代碼一律包 try/catch。

## 硬規則
- 禁止引入需要 `npm install` 或構建步驟的任何東西。這個 repo 的部署故事是「push 即上線」，加構建步驟等於毀掉它。
- 大功能（如 OCR）優先找「純瀏覽器端」方案（Tesseract.js 在本地跑，單據不上傳任何伺服器——這同時是隱私要求）。
- 效能敏感操作（圖像處理）注意手機端：降採樣、限制輸出尺寸（參照 #90 的做法：透視變換輸出 2400px 上限）。

## 本專案實例
commit `3333968`（#91）給記帳本加 OCR：選型 Tesseract.js 而不是雲端 OCR API。判斷鏈：單據含金額與消費紀錄（隱私）→ 不上傳；使用者無後端、無 API key 管理能力 → 純前端；Tesseract.js 純瀏覽器可跑 → 入選；識別慢 → 異步跑、不阻塞保存流程。**每一步都是拿本專案的約束（隱私、無後端、非工程師使用者）當篩子，而不是拿「業界最佳方案」當篩子。**
