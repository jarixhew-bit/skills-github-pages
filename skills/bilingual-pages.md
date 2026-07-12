# 技能：雙語頁面（中/英切換的標準做法）

## 目的
本 repo 的對外頁面常是中英雙語（給使用者家人/朋友，兩種語言使用者都有）。語言邏輯每頁重新發明一次就會每頁行為不一致。此技能是唯一標準做法，照抄即可。

## 何時觸發
新建或改造任何含中英兩套文案的頁面。

## 機械步驟
1. HTML 裡雙語文案用 `data-zh` / `data-en` 屬性或成對元素承載，JS 統一切換，不寫兩份頁面。
2. 語言初始化邏輯**照抄** `japan-trip-2026.html` 的 `initLang()` 模式：
   ```js
   (function initLang() {
     let lang = null;
     try { lang = localStorage.getItem('siteLangUser'); } catch (e) {}  // 1. 使用者手選過 → 優先
     if (!lang) lang = (navigator.language || '').startsWith('zh') ? 'zh' : 'en'; // 2. 否則跟系統
     applyLang(lang);
   })();
   ```
3. 手動切換按鈕的處理函式（如 `toggleLang()`）做兩件事：套用新語言＋`localStorage.setItem('siteLangUser', next)` 記住手選。注意：CLAUDE.md 提到的 `setLangUser()` 是對這段邏輯的泛稱，實際程式碼裡沒有這個函式名，不要去找它。
4. localStorage key **全站統一用 `siteLangUser`**（2026-07-12 起，取代舊的每頁獨立 key），並監聽 `storage` 事件讓已開頁面即時同步：
   ```js
   window.addEventListener('storage', (e) => {
     if (e.key === 'siteLangUser' && e.newValue) applyLang(e.newValue);
   });
   ```
   改造帶舊 key 的既有頁面時，getItem 加舊 key 作讀取兜底並回寫新 key（見 `japan-trip-2026.html:1061-1062` 的遷移寫法）；新頁面不需要兜底。
5. 所有 localStorage 存取包 try/catch（Safari 無痕模式會 throw，頁面不能因此白屏）。
6. 改完跑 `python3 tools/check-html.py 檔名.html`——它會同時查標籤平衡與 siteLangUser key 是否合規，不通過不准 commit（CI 也會攔）。

## 硬規則
- 優先序固定：使用者手選（localStorage）＞ 系統語言（navigator.language）＞ 預設英文。不許顛倒。
- 判斷中文用 `startsWith('zh')`，涵蓋 zh-CN / zh-TW / zh-HK。
- 交付前兩種語言各實際打開看一遍（改 localStorage 或用瀏覽器語言模擬），只驗一種語言不算驗完。

## 本專案實例
`japan-trip-2026.html` 與 `usj-disney-restaurants.html` 都用此模式（CLAUDE.md 雙語頁面規則指定的參考實現），皆已遷移到統一 key `siteLangUser`（舊 key 僅留作讀取兜底）。當初的設計判斷：收到連結的人有日本親友（英文）也有家人（中文），**首次打開必須不點任何按鈕就看到自己的語言**——所以用系統偵測而不是預設某一種；而手選要記住，是因為系統語言是英文但想看中文的人，不該每次刷新都要重點一次按鈕。
