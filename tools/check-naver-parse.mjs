#!/usr/bin/env node
// Naver 抓取器（tools/fetch-photos-naver.mjs）的解析自检。不开浏览器、不连网，沙盒与 CI 都能跑。
//
// 为什么要它（2026-11-20）：用户拍板韩国行程「照片、营业时间、营业状态、菜单看 Naver」，
// 这四样全靠解析 Naver 页面的 __APOLLO_STATE__，而抓取器只能在 CI 跑——解析错了
// 要烧一轮 CI 才看得到，而且错法很安静：
//   (1) 营业时间漏掉「정기휴무」或缺列的那天 → 手册写成天天开，读者白跑；
//   (2) 把「휴무」（今天公休）当成歇业，或把「폐업」当成营业；
//   (3) 菜单板照、博客截图混进照片（用户 2026-09-19：「店＋食物，不要菜单」）；
//   (4) place id 拿错 → 地图链接指到别家。
// fixture 在 tools/fixtures/naver/：home-*.html 是 2026-11-20 CI 实抓的真实店家首页
// （删掉与解析无关的物件瘦身），其余是照真实结构手写的边界情况。
// 这里 import 发布出去的那个函数来测（tools/lib/naver-parse.mjs），不另抄一份逻辑。
//
// 跑法：node tools/check-naver-parse.mjs      退出码 0 = 全过；1 = 有不符
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isCaptcha, placeIdFromUrl, naverPlaceUrl, parseSearchIds, extractApolloState, parseHome,
  parseHours, businessStatus, parseMenu, selectPhotos, photoSource, unwrapPstatic, parsePhotoState,
  harvestPhotoUrls, labelByFilter, photoCandsFromState,
} from './lib/naver-parse.mjs';

const FX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'naver');
const read = f => fs.readFileSync(path.join(FX, f), 'utf8');

let pass = 0;
const fails = [];
function eq(desc, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else fails.push(`${desc}：期望 ${w}，实际 ${g}`);
}
function ok(desc, cond, detail = '') {
  if (cond) pass++; else fails.push(`${desc}${detail ? '：' + detail : ''}`);
}

// ── place id ────────────────────────────────────────────────
eq('id·entry 链接', placeIdFromUrl('https://map.naver.com/p/entry/place/11592650?c=15'), '11592650');
eq('id·手机版 restaurant', placeIdFromUrl('https://m.place.naver.com/restaurant/2007385665/home'), '2007385665');
eq('id·pcmap', placeIdFromUrl('https://pcmap.place.naver.com/place/1745549429/photo'), '1745549429');
eq('id·search 页带 place', placeIdFromUrl('https://map.naver.com/p/search/명동교자/place/11592650'), '11592650');
eq('id·不是 naver 链接', placeIdFromUrl('https://www.google.com/maps/place/1234567'), '');
eq('id·店名', placeIdFromUrl('명동교자 본점'), '');
eq('精准链接格式', naverPlaceUrl('11592650'), 'https://map.naver.com/p/entry/place/11592650');
{
  const ids = parseSearchIds(read('list-myeongdong.html'));
  eq('搜索·第一个就是正确的店', ids[0], { id: '11592650', name: '명동교자 본점' });
  eq('搜索·不重复、公交路线（名称纯数字）不算', ids.map(x => x.id), ['11592650', '11679429']);
}
eq('搜索·m.search 网址形式', parseSearchIds('<a href="https://m.place.naver.com/restaurant/2007385665/home">x</a><a href="https:\\/\\/m.place.naver.com\\/place\\/123456\\/home">').map(x => x.id), ['2007385665', '123456']);

// ── 验证码 ──────────────────────────────────────────────────
ok('验证码·allSearch 的 ncaptcha', isCaptcha(read('captcha-allsearch.json')));
ok('验证码·graphql 回的 captcha 页', isCaptcha('<!doctype html><html><head title="captcha"><script src="https://ncpt.naver.com/v1/wcpt/m/challenge/wtm_captcha_x.js">'));
ok('验证码·正常首页不是', !isCaptcha(read('home-11592650.html')));
// 2026-11-20 首轮实跑：正常页面也引用 ncpt.naver.com 的脚本，六家全被误判成验证码
ok('验证码·正常页面引用了 ncpt 脚本也不算', !isCaptcha('<html><head><title>명동교자</title><script src="https://ncpt.naver.com/v1/wcpt/x.js"></script></head><body><script>window.__APOLLO_STATE__ = {"ROOT_QUERY":{}};</script>' + 'x'.repeat(80000)));

// ── 真实店家首页 ─────────────────────────────────────────────
const homes = {};
for (const id of ['11592650', '2007385665', '1745549429']) {
  const st = extractApolloState(read(`home-${id}.html`));
  homes[id] = st && parseHome(st);
  ok(`首页 ${id} 解析得出来`, !!homes[id]);
}
{
  const h = homes['11592650'];
  eq('명동교자·id', h.naver_id, '11592650');
  eq('명동교자·名称', h.place_title, '명동교자 본점');
  eq('명동교자·地址', h.address, '서울 중구 퇴계로 129');
  eq('명동교자·评分', [h.naver_rating, h.naver_reviews], [4.37, 40700]);
  eq('명동교자·营业状态', h.business_status, '营业中');
  // 2026-11-21：手册的「导航」按钮要经纬度、餐厅分组要 Naver 业态类别，两样都从首页取
  eq('명동교자·业态类别（餐厅分组依据）', h.category, '칼국수,만두');
  eq('명동교자·坐标（导航按钮的 dlat/dlng，x=经度 y=纬度）', h.coord, { x: '126.9861471', y: '37.5611325' });
  eq('명동교자·营业时间 7 天＋备注', h.hours.length, 8);
  eq('명동교자·周一（月→日排序、带라스트오더）', h.hours[0], '월 10:30–21:00（라스트오더 20:30）');
  eq('명동교자·周日', h.hours[6], '일 10:30–21:00（라스트오더 20:30）');
  eq('명동교자·菜单前两项', h.menu.slice(0, 2), [{ name: '칼국수', price: '12,000원' }, { name: '만두', price: '13,000원' }]);
  eq('명동교자·菜单板照 8 张认得出', h.menu_images.length, 8);
  const sel = selectPhotos(h.top_photos, { menuUrls: h.menu_images });
  ok('명동교자·博客图一张都不进', sel.every(p => !/blogfiles/.test(p.orig)), sel.map(p => p.orig).join(' '));
  ok('명동교자·短视频封面不进', sel.every(p => !/clip-service/.test(p.orig)));
  eq('명동교자·店家图排在访客图前', sel.map(p => p.source), ['owner', 'owner', 'visitor']);
  ok('명동교자·输出是能 <img> 的代理图', sel.every(p => p.url.startsWith('https://search.pstatic.net/common/?') && unwrapPstatic(p.url) === p.orig));
}
{
  const h = homes['2007385665'];
  eq('대물섬·业态类别', h.category, '한식');
  eq('대물섬·坐标', h.coord, { x: '126.9840613', y: '37.5691329' });
  eq('대물섬·跨夜营业照写', h.hours.find(x => x.startsWith('금')), '금 11:00–01:00');
  eq('대물섬·周日', h.hours.find(x => x.startsWith('일')), '일 13:00–23:00');
  eq('대물섬·菜单最多 20 项', h.menu.length, 20);
  eq('대물섬·菜单第一项', h.menu[0], { name: '<점심>대물 정식(2인 이상)', price: '27,000원' });
}
{
  const h = homes['1745549429'];
  eq('짱오락실·星级隐藏就是 null（不能当 0 分）', h.naver_rating, null);
  eq('짱오락실·没菜单', h.menu, []);
  eq('짱오락실·业态类别', h.category, '오락실');
  eq('짱오락실·坐标', h.coord, { x: '126.9870544', y: '37.5698297' });
  eq('짱오락실·营业中', h.business_status, '营业中');
}

// ── 营业时间边界：정기휴무、缺列的那天、브레이크 ───────────────────
{
  const st = extractApolloState(read('home-closedday.html'));
  const h = parseHome(st);
  ok('公休店·解析得出来', !!h);
  ok('公休店·정기휴무 带出', h.hours.includes('정기휴무: 매주 월요일'), JSON.stringify(h.hours));
  eq('公休店·closed_days', h.closed_days, '매주 월요일');
  eq('公休店·周一标休（不安静当营业）', h.hours.find(x => x.startsWith('월')), '월 정기휴무');
  eq('公休店·브레이크 带出', h.hours.find(x => x.startsWith('화')), '화 11:30–22:00（브레이크 15:00–17:00，라스트오더 21:00）');
  eq('公休店·没列出的周日标出来', h.hours.find(x => x.startsWith('일')), '일 휴무（未列出）');
  eq('公休店·今天休息≠歇业', h.business_status, '营业中');
}
{
  const h = parseHome(extractApolloState(read('home-closed.html')));
  eq('폐업店·判成歇业', h.business_status, '歇业');
  eq('폐업店·没营业时间', h.hours, []);
}
eq('状态·휴업', businessStatus(['임시 휴업 중입니다']), '休业');
eq('状态·휴무（今天）', businessStatus(['휴무']), '营业中');
eq('状态·영업 종료（今天收了）', businessStatus(['영업 종료', '11:00에 영업 시작']), '营业中');
eq('状态·什么都没有', businessStatus([]), 'unknown');
eq('状态·只有店名', businessStatus(['짱오락실 종로점']), 'unknown');
eq('营业时间·空', parseHours(null).hours, []);

// ── 照片分类过滤（照片页 photoViewer） ───────────────────────────
eq('来源·ldb-phinf 是店家', photoSource('https://ldb-phinf.pstatic.net/2026/a.jpg'), 'owner');
eq('来源·pup-review 是访客', photoSource('https://search.pstatic.net/common/?type=w560&src=https%3A%2F%2Fpup-review-phinf.pstatic.net%2Fx.jpg'), 'visitor');
eq('来源·blogfiles 是博客', photoSource('https://blogfiles.pstatic.net/x.jpg'), 'blog');
{
  const cands = parsePhotoState(extractApolloState(read('photo-state.html')));
  ok('照片页·认得出 photoViewer 里的照片', cands.length >= 6, String(cands.length));
  const sel = selectPhotos(cands, { menuUrls: ['https://ldb-phinf.pstatic.net/menuboard/board.jpg'] });
  const origs = sel.map(p => p.orig);
  ok('照片页·메뉴 分类排除', !origs.some(u => /menu-cat/.test(u)), origs.join(' '));
  ok('照片页·菜单板照（menuImages）排除', !origs.some(u => /menuboard/.test(u)));
  ok('照片页·同一张图在 메뉴 也出现就排除', !origs.some(u => /both/.test(u)));
  ok('照片页·博客图排除', !origs.some(u => /blogfiles/.test(u)));
  eq('照片页·排序：店家食物 > 访客内部 > 店家没分类 > 访客外部',
    sel.map(p => `${p.source}/${p.category || '-'}`), ['owner/food', 'visitor/interior', 'owner/-', 'visitor/exterior']);
}
{
  // DOM 页签那条路：同一张代理图与原图是同一张，不能算两张
  const u = 'https://ldb-phinf.pstatic.net/20260617_271/a.jpg';
  const sel = selectPhotos([{ url: u, category: '' }, { url: 'https://search.pstatic.net/common/?autoRotate=true&type=w560_sharpen&src=' + encodeURIComponent(u), category: '음식·음료' }]);
  eq('去重·代理图与原图算同一张，分类取具体的', sel.map(p => [p.orig, p.category]), [[u, 'food']]);
  const v = 'https://pup-review-phinf.pstatic.net/MjA/abc.JPEG/1000032488.jpg.jpg';
  eq('缩图参数去掉才是原图', selectPhotos([{ url: v + '?type=w278_sharpen' }]).map(p => p.orig), [v]);
  eq('短视频封面与 png 截图排最后', selectPhotos([
    { url: 'https://ldb-phinf.pstatic.net/a/notice.png' },
    { url: 'https://pup-review-phinf.pstatic.net/b/video_thumbnail.jpg' },
    { url: 'https://pup-review-phinf.pstatic.net/c/food.jpg' },
  ]).map(p => p.orig.split('/').pop()), ['food.jpg', 'notice.png', 'video_thumbnail.jpg']);
  eq('过滤·界面头像不进', selectPhotos([{ url: 'https://g-place.pstatic.net/assets/shared/images/icon_default_profile.png' }]), []);
}

// ── 分类页（?filterType=）──────────────────────────────────────
{
  const html = '<img src="https://search.pstatic.net/common/?autoRotate=true&amp;type=w560_sharpen&amp;src=https%3A%2F%2Fldb-phinf.pstatic.net%2Fa%2F1.jpg">'
    + '<script>{"originalUrl":"https:\\u002F\\u002Fpup-review-phinf.pstatic.net\\u002Fb\\u002F2.jpg"}</script>';
  eq('分类页·代理图（&amp;）与 JSON 转义网址都捞得到', harvestPhotoUrls(html).sort(),
    ['https://ldb-phinf.pstatic.net/a/1.jpg', 'https://pup-review-phinf.pstatic.net/b/2.jpg']);
  const base = ['a', 'b', 'c', 'd', 'e'].map(x => `https://ldb-phinf.pstatic.net/${x}.jpg`);
  // Naver 不认参数时回的就是「全部」那页：不能整页标成 메뉴 把好图全排除
  const ign = labelByFilter(base, { 메뉴: base.slice() });
  eq('分类页·参数没生效就不贴分类', ign.ignored, ['메뉴']);
  eq('分类页·参数没生效时好图还在', selectPhotos(ign.cands).length, 5);
  const same = base.concat(['https://ldb-phinf.pstatic.net/x.jpg', 'https://ldb-phinf.pstatic.net/y.jpg']);
  const ign2 = labelByFilter(base.slice(0, 2), { 메뉴: same, 내부: same, '음식·음료': same });
  eq('分类页·几个分类页一模一样＝参数没生效', ign2.ignored, ['메뉴', '내부', '음식·음료']);
  eq('分类页·一模一样时「全部」那页的照片不被当菜单排除', selectPhotos(ign2.cands).length, 2);
  const real = labelByFilter(base, { 메뉴: [base[0]], '음식·음료': [base[1], 'https://ldb-phinf.pstatic.net/f.jpg'] });
  const sel = selectPhotos(real.cands).map(p => p.orig.slice(-5));
  eq('分类页·真分类：메뉴 那张排除、음식 那张排前', sel, ['b.jpg', 'f.jpg', 'c.jpg', 'd.jpg', 'e.jpg']);
}

// 2026-11-20 第三轮实跑：整页正则把菜品图（PlaceMenuItem）当成「没分类的店家照」排在最前
{
  const st = extractApolloState(read('home-2007385665.html'));
  const dish = 'https://ldb-phinf.pstatic.net/20260205_156/1770272710539YmJa6_JPEG/IMG_6818.jpeg';
  const typed = photoCandsFromState(st);
  ok('物件分类·菜品图标成 메뉴', typed.some(c => c.url === dish && c.category === '메뉴'));
  const sel = selectPhotos([{ url: dish, category: '' }, ...typed]);
  ok('物件分类·菜品图即使也以「没分类」出现仍排除', !sel.some(p => p.orig === dish), sel.map(p => p.orig).join(' '));
  ok('物件分类·店家代表图还在', sel.some(p => /1763691731189BcJv5/.test(p.orig)));
}

if (fails.length) {
  console.log(`不通过：${fails.length} 项不符（${pass} 项通过）`);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log(`通过：Naver 解析 ${pass} 项全对`);
