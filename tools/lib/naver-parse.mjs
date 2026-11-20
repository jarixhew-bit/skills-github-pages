/**
 * Naver 地图（m.place.naver.com）页面的解析函数——全是纯函数，不连网、不开浏览器。
 *
 * 为什么独立成档（2026-11-20 建）：抓取器 tools/fetch-photos-naver.mjs 只能在 CI 跑
 * （沙盒连不上 naver），解析错了要烧一轮 CI 才看得到；拆出来后
 * tools/check-naver-parse.mjs 用存档的真实页面片段（tools/fixtures/naver/）离线验。
 *
 * 用户 2026-11-20 拍板：韩国行程「评分看 Google，其他——营业时间、营业状态、照片、
 * 菜单——看 Naver」。所以这里解析的是后四样；Naver 自己的星级只当参考字段带出
 * （5 分制、部分店隐藏，不能套 Google 的 ≥4.2 门槛）。
 */

/**
 * 页面是不是 Naver 的验证码（ncaptcha / wtm_captcha）。被挡时 200 也可能是验证码页。
 * 注意：正常页面也会引用 ncpt.naver.com 的脚本（2026-11-20 首轮实跑六家全被误判成验证码），
 * 所以只认三种：搜索接口回的 pageId=ncaptcha、<head title="captcha">、
 * 以及「提到 captcha 但根本没有页面资料（__APOLLO_STATE__）」的短页面。
 */
export function isCaptcha(text) {
  if (!text) return false;
  const s = String(text);
  if (/"pageId"\s*:\s*"ncaptcha/.test(s)) return true;
  if (/<head[^>]*title="captcha"/i.test(s.slice(0, 5000))) return true;
  return /wtm_captcha|ncaptcha/i.test(s) && !/__APOLLO_STATE__/.test(s) && s.length < 60000;
}

/** 从 Naver 链接里拿 place id；不是 Naver 链接或没有 id 就回 ''。 */
export function placeIdFromUrl(s) {
  if (!s || !/naver\.(com|me)/.test(s)) return '';
  const m = s.match(/\/(?:entry\/)?(?:place|restaurant|attraction|hairshop|accommodation|cafe|hospital|nailshop)\/(\d{5,})/)
    || s.match(/[?&](?:id|placeId|pinId)=(\d{5,})/);
  return m ? m[1] : '';
}

/** 精准地点链接（CLAUDE.md：只用精准地点链接，不用搜索链接）。 */
export function naverPlaceUrl(id) {
  return id ? `https://map.naver.com/p/entry/place/${id}` : '';
}

/**
 * 从搜索结果页（m.place.naver.com/place/list 或 m.search.naver.com）拿候选 id，按出现顺序。
 * list 页的 apollo state 里同一个 id 会紧跟着 name，能拿就一起带出，方便人工核对名称。
 */
export function parseSearchIds(html) {
  if (!html) return [];
  const clean = String(html).replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  const seen = new Map();
  for (const m of clean.matchAll(/"id":"(\d{5,})","name":"([^"]{1,120})"/g)) {
    // 名称里有搜索高亮 <mark>（JSON 里是 \u003Cmark\u003E）；纯数字的是公交路线，不是店
    const name = m[2].replace(/\\u003C\/?mark\\u003E|<\/?mark>/gi, '').trim();
    if (/^\d+$/.test(name) || /^[가-힣]?\d+[A-Z]?$/.test(name)) continue;
    if (!seen.has(m[1])) seen.set(m[1], name);
  }
  for (const m of clean.matchAll(/place\.naver\.com\/(?:restaurant|place|attraction|hairshop|accommodation|cafe)\/(\d{5,})/g)) {
    if (!seen.has(m[1])) seen.set(m[1], '');
  }
  if (!seen.size) {
    for (const m of clean.matchAll(/"id":"(\d{6,})"/g)) if (!seen.has(m[1])) seen.set(m[1], '');
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}

/**
 * 从 HTML 里抠出 window.__APOLLO_STATE__ 那个对象。用括号配对（会跳过字符串里的括号），
 * 不用「到 }; window. 为止」的正则——店家介绍里真的可能出现那串字。
 */
export function extractApolloState(html) {
  if (!html) return null;
  const s = String(html);
  const at = s.search(/__APOLLO_STATE__\s*=\s*\{/);
  if (at < 0) return null;
  const start = s.indexOf('{', at);
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(s.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

const deref = (state, v) => (v && typeof v === 'object' && v.__ref ? state[v.__ref] : v);

function placeDetailOf(state) {
  const rq = state && state.ROOT_QUERY;
  if (!rq) return null;
  const k = Object.keys(rq).find(k => k.startsWith('placeDetail('));
  return k ? rq[k] : null;
}

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];

/** 一个 WorkingHoursInfo → 「월 11:00–23:00（브레이크 15:00–17:00，라스트오더 20:30）」。 */
function fmtDay(d) {
  const bh = d.businessHours;
  const desc = (d.description || '').trim();
  let s;
  if (bh && bh.start && bh.end) s = `${d.day} ${bh.start}–${bh.end}`;
  else s = `${d.day} ${desc || '휴무'}`;
  const extra = [];
  for (const b of d.breakHours || []) if (b && b.start && b.end) extra.push(`브레이크 ${b.start}–${b.end}`);
  for (const l of d.lastOrderTimes || []) if (l && l.time) extra.push(`라스트오더 ${l.time}`);
  if (bh && desc) extra.push(desc);
  return extra.length ? `${s}（${extra.join('，')}）` : s;
}

/**
 * 营业时间 → 每周各天一行（照 월→일 排），加上「정기휴무／휴무일／备注」行。
 * 列表里缺的那天 Naver 通常就是不开（页面上不列），标成「휴무（未列出）」，
 * 宁可让人多看一眼，也不要安静地当它营业。
 */
export function parseHours(nbhList) {
  const out = { hours: [], closed_days: '', now_status: '', now_desc: '' };
  const nbh = Array.isArray(nbhList) ? nbhList : [];
  if (!nbh.length) return out;
  const multi = nbh.length > 1;
  for (const block of nbh) {
    const prefix = multi && block.name ? `[${block.name}] ` : '';
    const days = (block.businessHours || []).filter(Boolean);
    const byDay = new Map();
    for (const d of days) {
      // day 可能是「월」也可能是「매일」「평일」这种合并写法
      byDay.set(d.day, d);
    }
    const ordered = DAYS.filter(x => byDay.has(x)).map(x => byDay.get(x));
    const others = days.filter(d => !DAYS.includes(d.day));
    for (const d of [...others, ...ordered]) out.hours.push(prefix + fmtDay(d));
    if (ordered.length && !others.length) {
      for (const x of DAYS) if (!byDay.has(x)) out.hours.push(`${prefix}${x} 휴무（未列出）`);
    }
    const reg = (block.comingRegularClosedDays || '').trim();
    if (reg) out.hours.push(`${prefix}정기휴무: ${reg}`);
    const irr = (block.comingIrregularClosedDays || []).filter(Boolean)
      .map(x => (typeof x === 'string' ? x : [x.date || x.startDate, x.endDate, x.description].filter(Boolean).join(' '))).filter(Boolean);
    if (irr.length) out.hours.push(`${prefix}휴무일: ${irr.join('，')}`);
    if (block.freeText && block.freeText.trim()) out.hours.push(`${prefix}备注: ${block.freeText.trim()}`);
    if (!out.closed_days) out.closed_days = [reg, irr.join('，')].filter(Boolean).join('；');
    if (!out.now_status && block.businessStatusDescription) {
      out.now_status = block.businessStatusDescription.status || '';
      out.now_desc = block.businessStatusDescription.description || '';
    }
  }
  return out;
}

/**
 * 营业状态：营业中／休业／歇业／unknown。
 *  - 「휴무」「영업 종료」「영업 전」「브레이크타임」只是**今天**没开或已收，店还在营业 → 营业中
 *    （跟 Google 那边的坑一样：今天还没开门≠停业，check-place-status 守过同一件事）
 *  - 폐업＝永久歇业；휴업／영업 중단／장기 휴무＝暂时休业
 *  - 什么都没有（没营业时间、没状态字）→ unknown，不要猜成营业中
 * texts：从页面上取到的、跟营业状态有关的字（状态字、店名、提示条），不要整页丢进来——
 * 评论里写「옆집 폐업했네」会被误判。
 */
export function businessStatus(texts) {
  const t = (Array.isArray(texts) ? texts : [texts]).filter(Boolean).join('\n');
  if (!t.trim()) return 'unknown';
  if (/폐업/.test(t)) return '歇业';
  if (/휴업|영업\s*중단|영업\s*중지|장기\s*휴무|임시\s*휴점|리뉴얼\s*공사/.test(t)) return '休业';
  if (/영업\s*중|영업\s*종료|영업\s*전|영업\s*시작|휴무|브레이크|라스트\s*오더|24시간/.test(t)) return '营业中';
  return 'unknown';
}

/** 菜单：菜名＋价格，照 Naver 的顺序，前 limit 项。 */
export function parseMenu(state, limit = 20) {
  const pd = placeDetailOf(state);
  const items = [];
  const pm = pd && pd.placeMenus;
  if (pm && Array.isArray(pm.items)) {
    for (const ref of pm.items) {
      const it = deref(state, ref);
      if (!it || !it.name) continue;
      const p = it.price || {};
      const price = typeof p === 'string' ? p : (p.displayText || (p.priceType === 'variable' ? '변동' : ''));
      items.push({ name: it.name.trim(), price: (price || '').trim() });
    }
  }
  if (!items.length) {
    // 旧版结构：Menu:xxx 物件，price 是字串
    for (const [k, v] of Object.entries(state || {})) {
      if (/^Menu:/.test(k) && v && v.name) items.push({ name: String(v.name).trim(), price: String(v.price || '').trim() });
    }
  }
  return items.slice(0, limit);
}

/** search.pstatic.net/common/?src=… 这种代理网址还原成原图网址；本来就是原图就原样回。 */
export function unwrapPstatic(u) {
  if (!u) return '';
  const m = String(u).match(/^https?:\/\/search\.pstatic\.net\/common\/?\?(.*)$/);
  if (!m) return String(u);
  const src = new URLSearchParams(m[1]).get('src');
  return src ? src : String(u);
}

/** 原图 → 能直接 <img> 的 560px 代理图（2026-11-20 实测：无 Referer、github.io Referer 都 200，10 分钟后仍 200）。 */
export function displayUrl(orig) {
  return 'https://search.pstatic.net/common/?autoRotate=true&type=w560_sharpen&src=' + encodeURIComponent(orig);
}

/** 照片来源看原图的主机名：ldb-phinf＝店家上传，pup-review／review-phinf＝访客评论照。 */
export function photoSource(u) {
  const o = unwrapPstatic(u);
  if (/\/\/ldb-phinf\.pstatic\.net\//.test(o)) return 'owner';
  if (/\/\/(?:pup-review-phinf|review-phinf|myplace-phinf|naverbooking-phinf)\.pstatic\.net\//.test(o)) return 'visitor';
  if (/\/\/(?:blogfiles|postfiles|blogthumb|cafeptthumb|cafefiles|mblogthumb-phinf)\.pstatic\.net\//.test(o)) return 'blog';
  if (/\/\/clip-service-phinf\.pstatic\.net\//.test(o)) return 'clip';
  return 'other';
}

/** 照片分类页签名 → food / interior / exterior / menu / ''（全部、或认不得）。 */
export function normCategory(c) {
  const s = String(c || '');
  if (/메뉴|menu/i.test(s)) return 'menu';
  if (/음식|음료|food|drink/i.test(s)) return 'food';
  if (/내부|interior|inside/i.test(s)) return 'interior';
  if (/외부|exterior|outside/i.test(s)) return 'exterior';
  return '';
}

const keyOf = u => unwrapPstatic(u).split('?')[0];

/**
 * 从照片候选里挑图。cands：[{ url, category?, source? }]（url 可以是原图或代理图）。
 * 规则（用户要「店＋食物，不要菜单」）：
 *  - 一律排除：메뉴 分类、menuImages 里的菜单板照、博客图（blogfiles，常带字幕截图）、
 *    短视频封面（clip）、界面图（g-place 头像、phinf/contact）
 *  - 同一张图在多个分类出现：只要有一处是 메뉴 就排除
 *  - 排序：음식·음료／내부 优先，其次外部，再其次没分类的；同档里店家图（owner）先于访客图
 * 回 [{ url(display), orig, source, category }]。
 */
export function selectPhotos(cands, { menuUrls = [], want = 8 } = {}) {
  const menuKeys = new Set(menuUrls.map(keyOf));
  const merged = new Map();
  for (const c of cands || []) {
    if (!c || !c.url) continue;
    const orig = unwrapPstatic(c.url);
    if (!/^https?:\/\//.test(orig)) continue;
    if (/g-place\.pstatic\.net\/assets|phinf\.pstatic\.net\/contact\/|static\.naver\.net|icon|profile/i.test(orig)) continue;
    const k = keyOf(orig);
    const cat = normCategory(c.category);
    const prev = merged.get(k);
    if (!prev) merged.set(k, { orig, cats: new Set(cat ? [cat] : []), source: c.source || '' });
    else { if (cat) prev.cats.add(cat); if (!prev.source && c.source) prev.source = c.source; }
  }
  const rows = [];
  let order = 0;
  for (const [k, v] of merged) {
    order++;
    if (menuKeys.has(k) || v.cats.has('menu')) continue;
    const host = photoSource(v.orig);
    if (host === 'blog' || host === 'clip') continue;
    const source = host === 'owner' || host === 'visitor' ? host : (v.source === 'business' ? 'owner' : 'visitor');
    const cat = v.cats.has('food') ? 'food' : v.cats.has('interior') ? 'interior' : v.cats.has('exterior') ? 'exterior' : '';
    const score = (cat === 'food' || cat === 'interior' ? 4 : cat === 'exterior' ? 2 : 1) + (source === 'owner' ? 2 : 0);
    rows.push({ url: displayUrl(v.orig), orig: v.orig, source, category: cat, score, order });
  }
  rows.sort((a, b) => b.score - a.score || a.order - b.order);
  return rows.slice(0, want).map(({ url, orig, source, category }) => ({ url, orig, source, category }));
}

/**
 * 店家首页（m.place.naver.com/<type>/<id>/home）的 apollo state → 结构化资料。
 * 回 null 表示这不是店家首页（拿到的是验证码页、或页面改版了）。
 */
export function parseHome(state) {
  const pd = placeDetailOf(state);
  if (!pd) return null;
  const base = deref(state, pd.base) || {};
  const h = parseHours(pd.newBusinessHours);
  // 旧版 businessHours（没有 newBusinessHours 时）
  if (!h.hours.length && Array.isArray(pd.businessHours)) {
    for (const d of pd.businessHours) {
      if (!d) continue;
      const st = d.startTime || (d.businessHours && d.businessHours.start);
      const en = d.endTime || (d.businessHours && d.businessHours.end);
      h.hours.push(st && en ? `${d.day} ${st}–${en}` : `${d.day} ${d.description || '휴무'}`);
    }
  }
  const statusTexts = [h.now_status, h.now_desc, base.name, base.missingInfo && base.missingInfo.closedInfo,
    pd.closedInfo, pd.businessStatus, base.businessStatus].filter(x => typeof x === 'string');
  if (h.hours.length && !statusTexts.some(t => t.trim())) statusTexts.push('영업 중');
  const menuImages = (pd.menuImages || []).map(m => m && m.imageUrl).filter(Boolean);
  const topPhotos = [];
  const tp = pd.topPhotos && pd.topPhotos.items;
  for (const ref of tp || []) {
    const it = deref(state, ref);
    if (!it || it.mediaFormat === 'video') continue;
    const u = it.originalUrl || it.thumbnailUrl;
    if (u) topPhotos.push({ url: u, source: it.mediaSource || '', category: '' });
  }
  for (const im of (pd.images && pd.images.images) || []) {
    if (im && im.origin) topPhotos.push({ url: im.origin, source: 'business', category: '' });
  }
  return {
    naver_id: String(base.id || ''),
    place_title: base.name || '',
    category: base.category || '',
    address: base.roadAddress || base.address || '',
    address_jibun: base.address || '',
    coord: base.coordinate ? { x: base.coordinate.x, y: base.coordinate.y } : null,
    phone: base.virtualPhone || base.phone || '',
    naver_rating: typeof base.visitorReviewsScore === 'number' ? base.visitorReviewsScore : null,
    naver_reviews: typeof base.visitorReviewsTotal === 'number' ? base.visitorReviewsTotal : null,
    business_status: businessStatus(statusTexts),
    now_status: h.now_status,
    hours: h.hours,
    closed_days: h.closed_days,
    menu: parseMenu(state, 20),
    menu_images: menuImages,
    top_photos: topPhotos,
    photo_total: pd.topPhotos && typeof pd.topPhotos.total === 'number' ? pd.topPhotos.total : null,
  };
}

/**
 * 照片页（.../photo）的 apollo state 里 photoViewer 查询的结果 → 照片候选。
 * 查询参数里带分类（filter／subFilter／relation 之类）时，把它当 category 带出；
 * 每张照片自己的 mediaSource（business／pai／aiView…）当 source。
 */
export function parsePhotoState(state) {
  const out = [];
  if (!state) return out;
  const visit = (obj, cat) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { for (const x of obj) visit(deref(state, x), cat); return; }
    if (obj.originalUrl && (obj.mediaFormat || 'image') !== 'video') {
      const c = cat || obj.relation || obj.category || obj.subFilterId || obj.filterName || '';
      out.push({ url: obj.originalUrl, source: obj.mediaSource || '', category: c });
      return;
    }
    for (const v of Object.values(obj)) if (v && typeof v === 'object') visit(deref(state, v), cat);
  };
  const rq = state.ROOT_QUERY || {};
  for (const [k, v] of Object.entries(rq)) {
    if (!/photo/i.test(k)) continue;
    let cat = '';
    const m = k.match(/\((\{.*\})\)$/);
    if (m) {
      try {
        const args = JSON.parse(m[1]);
        const inp = args.input || args;
        cat = inp.relation || inp.subFilter || inp.subFilterId || inp.category || inp.filter || '';
        if (Array.isArray(cat)) cat = cat.join(',');
      } catch { /* 参数解析不了就当没分类 */ }
    }
    visit(deref(state, v), String(cat || ''));
  }
  return out;
}

/**
 * 从照片页 HTML（SSR）里直接捞 pstatic 照片网址：原图网址与 search.pstatic.net 代理网址都收。
 * 2026-11-20 第二轮实跑：照片页点页签切分类在无头浏览器里点不动、滚动加载的 graphql 被验证码挡，
 * 但带 ?filterType=분류 的照片页是服务端直接渲染的，HTML 里就有那个分类的首屏照片。
 */
export function harvestPhotoUrls(html) {
  if (!html) return [];
  const clean = String(html).replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/&amp;/g, '&');
  const out = new Set();
  for (const m of clean.matchAll(/https?:\/\/search\.pstatic\.net\/common\/?\?[^"'\s<>)]+/g)) {
    const o = unwrapPstatic(m[0]);
    if (o !== m[0]) out.add(o);
  }
  for (const m of clean.matchAll(/https?:\/\/(?:ldb-phinf|pup-review-phinf|review-phinf|myplace-phinf|blogfiles|clip-service-phinf)\.pstatic\.net\/[^"'\s<>)\\]+/g)) {
    out.add(m[0]);
  }
  return [...out];
}

/**
 * 每个分类页（?filterType=X）抓到的网址 → 带分类的候选。
 * 防呆：Naver 不认那个参数时会回「全部」那一页——这时整页都被标成 X，
 * 若 X 是 메뉴 就会把好图全排除、是 음식 就会把菜单板当食物。
 * 所以某个分类页跟「全部」那页重叠 ≥80% 时判定参数没生效，那页不贴分类。
 * base：全部那页的网址；perFilter：{ 分类名: [网址] }。回 { cands, ignored: [分类名] }。
 */
export function labelByFilter(base, perFilter) {
  const key = u => unwrapPstatic(u).split('?')[0];
  const baseKeys = new Set((base || []).map(key));
  const cands = (base || []).map(url => ({ url, category: '' }));
  const ignored = [];
  for (const [cat, urls] of Object.entries(perFilter || {})) {
    const list = urls || [];
    if (!list.length) continue;
    const overlap = list.filter(u => baseKeys.has(key(u))).length;
    if (baseKeys.size >= 4 && overlap / list.length >= 0.8 && list.length >= baseKeys.size * 0.8) { ignored.push(cat); continue; }
    for (const url of list) cands.push({ url, category: cat });
  }
  return { cands, ignored };
}
