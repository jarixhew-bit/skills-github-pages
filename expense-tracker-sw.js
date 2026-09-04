const CACHE = 'expense-tracker-v26';
const ASSETS = [
  'expense-tracker.html',
  'expense-tracker-icon.svg',
  'expense-tracker.webmanifest'
];

// Android "分享到" this app posts the shared photo here (see share_target in
// the manifest). There's no real server — we intercept the POST ourselves,
// stash the file in the same IndexedDB the app already uses for receipt
// attachments (expense-tracker.html's ATTACH_DB_NAME/ATTACH_STORE), then
// redirect to a plain GET so the page loads normally and picks it up.
const SHARE_DB_NAME = 'expenseTrackerFiles';
const SHARE_STORE = 'attachments';
const SHARE_KEY = '__shared_photo__';

function openShareDb(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const dbi = req.result;
      if(!dbi.objectStoreNames.contains(SHARE_STORE)) dbi.createObjectStore(SHARE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function handleShareTarget(request){
  try{
    const formData = await request.formData();
    const file = formData.get('photo');
    if(file){
      const dbi = await openShareDb();
      await new Promise((resolve, reject) => {
        const tx = dbi.transaction(SHARE_STORE, 'readwrite');
        tx.objectStore(SHARE_STORE).put(file, SHARE_KEY);
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
    }
  }catch(e){ console.error('Share target handling failed:', e); }
  return Response.redirect('expense-tracker.html?share=1', 303);
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Share target POST (see share_target in the manifest + handleShareTarget above)
  if(e.request.method === 'POST' && new URL(e.request.url).pathname.endsWith('/expense-tracker.html')){
    e.respondWith(handleShareTarget(e.request));
    return;
  }
  // HTML: network-first so updates are always picked up immediately
  if(e.request.destination === 'document'){
  // ⚠️ 必须带 cache:'reload'（2026-08-28 教训）：光「网络优先」还不够——GitHub Pages
  // 给 HTML 带 10 分钟的浏览器 HTTP 缓存，普通 fetch() 会吃那层缓存，于是用户关掉
  // App 重开、甚至重开两次，拿到的仍是旧页面。今天为此反复困惑了好几轮（「你说改了
  // 怎么还是老样子」）。reload 会绕过 HTTP 缓存直接问服务器，离线时照旧回落缓存。
    e.respondWith(fetch(e.request, { cache: 'reload' }).catch(() => caches.match(e.request)));
    return;
  }
  // Other assets (icons, manifest, SW): cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
