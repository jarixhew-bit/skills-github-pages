#!/usr/bin/env python3
"""首尔手册（seoul-trip/index.html）专属自检——只查这一本，别的手册历史不同，不要误伤。

三条都是用户在 2026-11-20 抓到的错，每条修完补一个能抓住它的检查：
  1. 每张地点卡（含酒店、逐日站点、餐厅、玩乐）的 <div class="gal"> 照片恰好 4 张。
     用户要求「每张卡 4 张相关照片」；上一轮「同卡重复照片」检查把重复图删掉后，多数卡只剩 3 张。
     （重复／不相关由 check-photo-dupes 与挑图时亲眼看图把关，这里只管数量。）
  2. 窗棂纹带 --changsal：必须含「最右端竖棂」那一层（100% 0 / 1.5px），且竖棂／格心两层用
     round（格子宽度自动取整，最后一格不被切半）。用户指出纹带右端不完整，修好后没有检查守着。
  3. 营业状态：页面里每个 btn-map 的 place_url，都要能在 tools/lib/seoul-place-status.json
     （抓图器 RESULT 的 status 快照）里查到，而且 status 必须是 open。永久／暂时停业（如 The Sic-ddang、
     TANI、Mongjungheon、首尔广场溜冰场）、或查不到的（没抓过状态就放进手册）都红。
     加新地点时：先用 fetch-photos.yml 抓，把 RESULT 的 place_url／place_title／status 并进这份快照。

  4. Naver 地图按钮（2026-11-20 起，韩国行程营业时间／状态以 Naver 为准）：每张卡的 Google 按钮 `btn-map` 之外，
     抓得到 Naver 的卡另有一颗 `btn-map btn-map-naver`，链接必须是 https://map.naver.com/p/entry/place/<数字>，
     且该 id 要和状态快照里同一地点的 naver_id 一致、naver_status 是 open（住宿／书店／剧场这类 Naver 页面没有状态字段的，
     快照标 unknown 并写 naver_note）。Naver 按钮不准出现在没有 Google 按钮的地方，也不准用搜索链接。

  5. 只排午餐（2026-11-20 用户原话：「吃饭一般我们都只吃午餐 晚餐不必放 这个你要记得 6人团他们都只吃午餐的」）：
     ① 逐日时间轴（#itinerary）和餐厅卡里不得出现晚餐建议（晚餐／晚饭／晚市／宵夜／Dinner／Supper；
        提到机上、航班餐食的行放行）；
     ② 餐厅区开头要有「只吃午餐」说明；
     ③ 每张餐厅卡的营业时间（卡上写的就是 Naver 时间）在 1/3–1/7 五天里，至少 3 天有午餐时段
        （开门 ≤12:30 且午休开始／打烊 ≥13:30）；只开晚上的店（如 17:00 才开的居酒屋）红；
        部分日子午餐不开的店要在卡上标「午餐不营业／No lunch」（chip），别让人白跑。

  6. 1/2（六）出发日（2026-11-21 用户：「2号要写早上9点金边家里出发」）：逐日要有 #day00
     （data-date=2027-01-02），时间轴含 09:00 金边家里出发站点、引用页内航班卡（#fl-cx608／#fl-cx426，且这两张卡真实存在），
     顶部导航有 D0 chip（data-date=2027-01-02 href=#day00）；#day00 里不得出现用餐建议（本团只吃午餐、1/2 不写用餐）。

  7. 每天出发时间（2026-11-21 用户：「出发时间一般是10点早上 时间我们自己定 我们私人团的」）：D1–D5 里
     「从酒店出发」的站点（时间轴 .ev 的标题含「出发」／Leave／Depart）时刻一律 10:00（D2–D5 各至少一个，别让检查空转），
     文字里的「XX:XX 出发／leave at XX:XX」也必须是 10:00；D0 维持 09:00（由第 6 项守）、D6 去机场是赶 10:00 航班（不在此列）；
     逐日区只准有一处「私人团，时间可自行调整／Private group: times are flexible」提示（中英各一）。

  8. 逐日「吃饭」栏只准引用页面现有的餐厅（2026-11-21 用户：「以目前的餐厅来做就行 别再找其他家了」，他们有包车，距离别太远就行）：
     ① D1–D5 每天的吃饭栏里，每个 href="#food-…" 都必须是 #food 区里真实存在的餐厅卡，中英两侧引用的店要一致；
     ② 那家店在当天（D1=1/3 … D5=1/7，用日期推星期）卡上营业时间必须有午餐时段（开门 ≤12:30 且午休／打烊 ≥13:30）；
     ③ 距离：引用的店与当天主要地点的**直线**距离（快照 Naver 坐标，haversine）不得超过当天上限——
        D1 酒店 ≤1 公里、D3 乐天世界商场（乐天塔）≤8 公里、D4 Starfield 高阳 ≤12 公里、D5 The Hyundai Seoul ≤5 公里。
        上限是照用户认可的距离定的（D3 金猪食堂离乐天塔约 9.5 公里，超限就红）；页面写的「直线约 X 公里」要与算出来的差不超过 0.5；
     ④ D2 爱宝乐园不引用任何餐厅（园内吃），但文字要写出「园内」和「直线约 N 公里」，N 与手册里离爱宝最近那家的实际距离差不超过 1；
     ⑤ D0、D6 不放用餐栏。

 12. 每张地点卡同时写 Google 与 Naver 两种评分（2026-11-21 用户：「你把所有景点Google和naver的评论评分都加下去 这样他们看了就不会懵了」）：
     酒店、逐日站点、餐厅、玩乐、活动每张卡标题下有一行 `<div class="rate">`，中文「Google 4.5（64,280 则）· Naver 4.37（40,700 则评论）」、
     英文「Google 4.5 (64,280) · Naver 4.37 (40,700 reviews)」；Naver 隐藏星级的店写「Naver 未显示星级（N 则评论）」／「Naver rating not shown (N reviews)」；
     快照里没有 naver_id 的（G-Plex、南杨州草莓农场）写「Naver 无收录」／「Not listed on Naver」。
     数字一律与快照 google_rating／google_reviews／naver_rating／naver_reviews 逐项相同，快照缺这些字段也红。
     同时：JUMP、VR Zone COEX、国立果川科学馆三张玩乐卡在页面里（fun-jump／fun-vrzone／fun-gwacheon），
     JUMP 与果川科学馆（周一固定休）卡上有「1/4（一）休」／「Closed Mon 4 Jan」标注。

跑法：python3 tools/check-seoul-trip.py [页面.html]     退出码 0 = 全过；1 = 有不符
"""
import json
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGE = "seoul-trip/index.html"
SNAP = os.path.join(REPO, "tools", "lib", "seoul-place-status.json")


def line_of(src, pos):
    return src.count("\n", 0, pos) + 1


def check_photo_count(page, src):
    bad = []
    n = 0
    for m in re.finditer(r'<div class="gal">(.*?)</div>', src, re.S):
        n += 1
        k = len(re.findall(r"<img\b", m.group(1)))
        if k != 4:
            before = src[:m.start()]
            h = re.findall(r"<h[34]>(.*?)</h[34]>", before, re.S)
            name = re.sub(r"<[^>]+>", " ", h[-1]).split("  ")[0].strip() if h else "?"
            bad.append(f"{page}:{line_of(src, m.start())}  「{name}」照片 {k} 张（每张地点卡要恰好 4 张）")
    if n == 0:
        bad.append(f"{page}: 找不到任何照片组（<div class=\"gal\">），检查本身失效")
    return bad


def check_changsal(page, src):
    m = re.search(r"--changsal:(.*?);\s*(?:/\*|--|\})", src, re.S)
    if not m:
        return [f"{page}: 找不到 --changsal 定义"]
    css = m.group(1)
    layers = [l.strip() for l in re.split(r",\s*(?=linear-gradient|radial-gradient)", css) if l.strip()]
    bad = []
    if not any(re.search(r"100%\s+0\s*/\s*1\.5px\s+100%", l) for l in layers):
        bad.append(f"{page}:{line_of(src, m.start())}  --changsal 缺最右端竖棂层（100% 0 / 1.5px 100%），纹带右端会不完整")
    for l in layers:
        if ("90deg" in l or "radial-gradient" in l) and not re.search(r"/\s*14px\s+100%\s+round\b", l):
            bad.append(f"{page}:{line_of(src, m.start())}  --changsal 的竖棂／格心层没用 round：{l[:60]}…")
    return bad


def check_status(page, src):
    if not os.path.exists(SNAP):
        return [f"{page}: 缺 {os.path.relpath(SNAP, REPO)}，无法核对营业状态"]
    snap = json.load(open(SNAP, encoding="utf-8"))
    bad = []
    seen = 0
    for m in re.finditer(r'<a class="btn-map" href="([^"]+)"', src):
        seen += 1
        u = m.group(1)
        info = snap.get(u)
        if info is None:
            bad.append(f"{page}:{line_of(src, m.start())}  地图链接不在营业状态快照里（没核对过 status 就放进手册）：{u[:80]}")
        elif info["status"] != "open" and not (info["status"] == "temporarily_closed" and info.get("seasonal_note")):
            bad.append(f"{page}:{line_of(src, m.start())}  「{info['title']}」状态是 {info['status']}，不能放进手册")
    if seen == 0:
        bad.append(f"{page}: 找不到任何 btn-map，检查本身失效")
    return bad


APP_URL = "https://jarixhew-bit.github.io/skills-github-pages/seoul-trip/"
# Naver 业态类别 → 餐厅分组 id（2026-11-21：用户指出分组混乱，分组一律以 Naver 店家页的类别为准）
CAT_GROUP = {
    "육류,고기요리": "bbq", "돼지고기구이": "bbq", "고기요리": "bbq", "소고기구이": "bbq",
    "일식당": "jp", "장어요리": "jp", "초밥,롤": "jp", "돈가스": "jp", "일본식라면": "jp",
    # 2026-11-21 用户：日本料理统一成一组——居酒屋、烤鸡串都归「日本料理」
    "이자카야": "jp",
    "꼬치": "jp", "닭꼬치": "jp", "야키토리": "jp",
}


def card_blocks(src):
    """每个 .links 区块（Google 按钮在内）→ (在 src 里的位置, google href, 区块内容)。"""
    for m in re.finditer(r'<div class="links">(.*?)</div>', src, re.S):
        g = re.search(r'<a class="btn-map" href="([^"]+)"', m.group(1))
        if g:
            yield m, g.group(1), m.group(1)


def check_naver(page, src):
    """Naver 按钮（2026-11-21 改版）：每张有 naver_id 的卡 = 一颗「导航」launchApp/route ＋ 一颗中文菜单／介绍 m.place ?locale=zh_CN。
    旧写法 map.naver.com/p/entry/place/<id> 会丢掉语言参数（iPhone 跳 m.place 韩文页、Android 落到「请安装 App」页），页面里一处都不准再有。"""
    import html as H
    from urllib.parse import urlparse, parse_qs, unquote
    snap = json.load(open(SNAP, encoding="utf-8")) if os.path.exists(SNAP) else {}
    bad = []
    seen = 0
    for m in re.finditer(r"map\.naver\.com/[^\"\s<>]*", src):
        bad.append(f"{page}:{line_of(src, m.start())}  不准再用 map.naver.com 链接（会丢语言参数、只显示韩文）：{m.group(0)[:70]}")
    food_a = src.find('<section id="food">')
    food_b = src.find('<section id="fun">')
    for m, g, blk in card_blocks(src):
        ln = line_of(src, m.start())
        info = snap.get(g) or {}
        navs = re.findall(r'<a class="btn-map btn-map-naver" href="(https://nmap\.place\.naver\.com/launchApp/route\?[^"]*)"', blk)
        menus = re.findall(r'<a class="btn-map btn-map-naver" href="(https://m\.place\.naver\.com/[^"]*)"([^>]*)>', blk)
        nid = info.get("naver_id")
        if not nid:
            if navs or menus or "btn-map-naver" in blk:
                bad.append(f"{page}:{ln}  快照里这个地点没有 naver_id，却放了 Naver 按钮")
            continue
        seen += 1
        title = info.get("title")
        if len(navs) != 1:
            bad.append(f"{page}:{ln}  「{title}」要恰好一颗 Naver 导航（launchApp/route），实际 {len(navs)} 颗")
        else:
            q = parse_qs(urlparse(H.unescape(navs[0])).query)
            one = lambda k: (q.get(k) or [""])[0]
            if one("did") != nid:
                bad.append(f"{page}:{ln}  「{title}」导航 did={one('did')} 与快照 naver_id {nid} 不一致")
            try:
                lat, lng = float(one("dlat")), float(one("dlng"))
                if not (36.5 <= lat <= 38.5 and 126.0 <= lng <= 128.0):
                    bad.append(f"{page}:{ln}  「{title}」导航坐标 {lat},{lng} 不在首尔一带")
                if str(lat) != str(float(info.get("naver_lat", "x") or 0)) or str(lng) != str(float(info.get("naver_lng", "x") or 0)):
                    bad.append(f"{page}:{ln}  「{title}」导航坐标 {lat},{lng} 与快照 {info.get('naver_lat')},{info.get('naver_lng')} 不一致")
            except ValueError:
                bad.append(f"{page}:{ln}  「{title}」导航缺 dlat/dlng 或不是数字：{navs[0][:90]}")
            if one("path") != "route" or one("type") != "place":
                bad.append(f"{page}:{ln}  「{title}」导航缺 path=route&type=place")
            if one("appname") != APP_URL:
                bad.append(f"{page}:{ln}  「{title}」导航 appname 不是本手册网址（官方要求移动网页填网页 URL）")
            if one("dname") != info.get("naver_title"):
                bad.append(f"{page}:{ln}  「{title}」导航 dname={one('dname')!r} 与 Naver 店名 {info.get('naver_title')!r} 不一致")
        if len(menus) != 1:
            bad.append(f"{page}:{ln}  「{title}」要恰好一颗 m.place 中文菜单／介绍，实际 {len(menus)} 颗")
        else:
            href, attrs = menus[0]
            in_food = food_a < m.start() < food_b
            want = (f"https://m.place.naver.com/restaurant/{nid}/menu/list?locale=zh_CN" if in_food
                    else f"https://m.place.naver.com/place/{nid}/home?locale=zh_CN")
            if href != want:
                bad.append(f"{page}:{ln}  「{title}」菜单／介绍链接应为 {want}，实际 {href}")
            if "data-naver-locale" not in attrs:
                bad.append(f"{page}:{ln}  「{title}」菜单／介绍链接缺 data-naver-locale（切英文时 locale 不会换）")
        if info.get("naver_status") == "open":
            pass
        elif info.get("naver_status") == "unknown" and info.get("naver_note"):
            pass
        else:
            bad.append(f"{page}:{ln}  「{title}」Naver 状态 {info.get('naver_status')} 不是 open")
    if seen == 0:
        bad.append(f"{page}: 找不到任何带 Naver 的卡，检查本身失效")
    # 语言切换要把 locale 在 zh_CN 与 en 之间换
    if not re.search(r"a\[data-naver-locale\][\s\S]{0,200}locale=[\s\S]{0,80}zh_CN[\s\S]{0,40}'en'|a\[data-naver-locale\][\s\S]{0,260}'en'[\s\S]{0,120}zh_CN", src):
        bad.append(f"{page}: applyLang 里没有切换 a[data-naver-locale] 的 locale（zh_CN ↔ en）")
    return bad


def check_groups(page, src):
    """餐厅分组以 Naver 店家页的业态类别为准（2026-11-21 用户抓到：日本料理组混了居酒屋、居酒屋组混了烤鸡串）。
    ① 每张餐厅卡所在分组 = 快照 food_group；② food_group 必须等于 Naver 类别对应的分组（CAT_GROUP），
    有 group_override_note（写明为什么偏离）才放行；③ 每组标题的数字 = 该组卡片数。"""
    snap = json.load(open(SNAP, encoding="utf-8")) if os.path.exists(SNAP) else {}
    a = src.find('<section id="food">')
    b = src.find('<section id="fun">')
    if a < 0 or b < 0:
        return [f"{page}: 找不到 #food／#fun 区块"]
    fs = src[a:b]
    bad, count, head = [], {}, {}
    gid = None
    for m in re.finditer(r'<div class="grp" id="grp-([a-z]+)"><span class="cn">[^<]*?（(\d+) 家）</span><span class="en">[^<]*?\((\d+)\)</span>|'
                         r'<div class="evt" id="(food-[a-z]+)">.*?<a class="btn-map" href="([^"]+)"', fs, re.S):
        if m.group(1):
            gid = m.group(1)
            if gid not in set(CAT_GROUP.values()):
                bad.append(f"{page}:{line_of(src, a + m.start())}  分组 grp-{gid} 不在允许的分组里（{sorted(set(CAT_GROUP.values()))}；日料不再拆居酒屋／烤鸡串）")
            if gid in head:
                bad.append(f"{page}:{line_of(src, a + m.start())}  分组 grp-{gid} 重复出现")
            head[gid] = (int(m.group(2)), int(m.group(3)), a + m.start())
            count[gid] = 0
            continue
        ln = line_of(src, a + m.start())
        if gid is None:
            bad.append(f"{page}:{ln}  {m.group(4)} 不在任何分组下")
            continue
        count[gid] += 1
        info = snap.get(m.group(5)) or {}
        if info.get("food_group") != gid:
            bad.append(f"{page}:{ln}  「{info.get('title')}」放在分组 {gid}，快照记录应在 {info.get('food_group')}（Naver 类别 {info.get('naver_category')}）")
        want = CAT_GROUP.get(info.get("naver_category"))
        if want is None:
            bad.append(f"{page}:{ln}  「{info.get('title')}」Naver 类别 {info.get('naver_category')!r} 不在 CAT_GROUP 对照表里，先补表")
        elif want != info.get("food_group") and not info.get("group_override_note"):
            bad.append(f"{page}:{ln}  「{info.get('title')}」Naver 类别 {info.get('naver_category')} 属于 {want}，却放在 {info.get('food_group')}（要偏离就在快照写 group_override_note）")
    for g, (n_cn, n_en, pos) in head.items():
        if not (n_cn == n_en == count[g]):
            bad.append(f"{page}:{line_of(src, pos)}  分组 {g} 标题写 {n_cn}／{n_en} 家，实际 {count[g]} 张卡")
    if not head:
        bad.append(f"{page}: 找不到任何餐厅分组（<div class=\"grp\" id=\"grp-…\">），检查本身失效")
    return bad


def check_events(page, src):
    """行程期间活动区（#events，2026-11-21）：导航里有入口、至少 10 张卡、每张卡有 Google＋Naver 导航＋中文介绍＋官网按钮。"""
    bad = []
    m = re.search(r'<section id="events">(.*?)</section>', src, re.S)
    if not m:
        return [f"{page}: 找不到 #events 活动区"]
    if 'href="#events"' not in src:
        bad.append(f"{page}: 导航缺「活动」入口（href=\"#events\"）")
    cards = re.findall(r'<div class="evt" id="(ev-[a-z]+)">(.*?)\n</div>\n</div>', m.group(1), re.S)
    if len(cards) < 10:
        bad.append(f"{page}: 活动区只有 {len(cards)} 张卡（应有 10 张）")
    for cid, body in cards:
        for need, label in (('class="btn-map" href="https://maps.google.com/?cid=', "Google ?cid= 地图"),
                            ("launchApp/route", "Naver 导航"), ("data-naver-locale", "Naver 中文介绍"),
                            ('class="btn-map web"', "官网／报道按钮")):
            if need not in body:
                bad.append(f"{page}:{line_of(src, src.find('id=\"'+cid+'\"'))}  活动卡 {cid} 缺 {label}")
    return bad


LUNCH_DAYS = range(3, 8)           # 1/3–1/7
DINNER_RE = re.compile(r"晚餐|晚饭|晚市|宵夜|夜宵|[Dd]inner|[Ss]upper")
FLIGHT_RE = re.compile(r"机上|航班|飞机|[Ii]n-?flight|on board|onboard|on the plane")


def plain(s):
    return re.sub(r"<[^>]+>", "", s)


def lunch_ok(open_h, end_h):
    return open_h <= 12.5 and end_h >= 13.5


def lunch_days_from_hours(hours):
    """把卡上的营业时间字串（；分段）解析成 {日: True/False/None}；None = 解析不了。"""
    res = {}
    for seg in hours.split("；"):
        seg = seg.strip()
        m = re.match(r"1/(\d+)(?:–1/(\d+))?", seg)
        if not m:
            continue
        d1 = int(m.group(1))
        d2 = int(m.group(2) or m.group(1))
        if "公休" in seg:
            val = False
        else:
            t = re.search(r"(\d{1,2}):(\d{2})–(次日 )?(\d{1,2}):(\d{2})", seg)
            if not t:
                val = None
            else:
                o = int(t.group(1)) + int(t.group(2)) / 60
                c = int(t.group(4)) + int(t.group(5)) / 60 + (24 if t.group(3) else 0)
                b = re.search(r"午休 (\d{1,2}):(\d{2})–", seg)
                end = int(b.group(1)) + int(b.group(2)) / 60 if b else c
                val = lunch_ok(o, end)
        for d in range(d1, d2 + 1):
            res[d] = val
    return res


def check_lunch_only(page, src):
    bad = []
    # ① 逐日时间轴里不得有晚餐建议
    a = src.find('<section id="itinerary">')
    b = src.find("</section>", a)
    if a < 0 or b < 0:
        return [f"{page}: 找不到 #itinerary，检查本身失效"]
    for i, ln in enumerate(src[a:b].split("\n")):
        txt = plain(ln)
        if DINNER_RE.search(txt) and not FLIGHT_RE.search(txt):
            bad.append(f"{page}:{line_of(src, a) + i}  逐日里出现晚餐建议（本团只吃午餐）：{DINNER_RE.search(txt).group(0)}")
    # ② 餐厅区
    fa = src.find('<section id="food">')
    fb = src.find("</section>", fa)
    if fa < 0 or fb < 0:
        return bad + [f"{page}: 找不到 #food，检查本身失效"]
    food = src[fa:fb]
    intro = re.search(r'<div class="note amber">(.*?)</div>', food, re.S)
    if not intro or "只吃午餐" not in intro.group(1) or "lunch" not in intro.group(1).lower():
        bad.append(f"{page}:{line_of(src, fa)}  餐厅区开头缺「本团只吃午餐」中英说明")
    # ③ 每张餐厅卡
    n = 0
    for m in re.finditer(r'<div class="evt" id="(food-[^"]+)">(.*?)\n</div>\n</div>', food, re.S):
        n += 1
        cid, blk = m.group(1), m.group(2)
        ln = line_of(src, fa + m.start())
        dm = DINNER_RE.search(plain(blk))
        if dm:
            bad.append(f"{page}:{ln}  {cid} 卡片说明里有「{dm.group(0)}」，要改成午餐角度")
        h = re.search(r"<strong>营业时间：</strong>(.*?)<br>", blk)
        if not h:
            bad.append(f"{page}:{ln}  {cid} 没有营业时间，无法确认有午餐")
            continue
        days = lunch_days_from_hours(h.group(1))
        miss = [d for d in LUNCH_DAYS if d not in days or days[d] is None]
        if miss:
            bad.append(f"{page}:{ln}  {cid} 营业时间解析不出 1/{miss[0]} 等日子：{h.group(1)[:60]}")
            continue
        ok = [d for d in LUNCH_DAYS if days[d]]
        if len(ok) < 3:
            bad.append(f"{page}:{ln}  {cid} 1/3–1/7 只有 {len(ok)} 天有午餐时段（要 ≥3 天；只开晚上的店不放）：{h.group(1)[:70]}")
        elif len(ok) < len(LUNCH_DAYS) and not ("午餐不营业" in blk and "No lunch" in blk):
            no = "、".join(f"1/{d}" for d in LUNCH_DAYS if not days[d])
            bad.append(f"{page}:{ln}  {cid} 部分日子（{no}）没有午餐时段，卡上要标「午餐不营业／No lunch」")
    if n == 0:
        bad.append(f"{page}: 找不到任何餐厅卡，检查本身失效")
    return bad


def check_day00(page, src):
    """1/2 出发日：#day00 存在、日期对、09:00 金边家里出发、航班卡引用、导航 D0 chip、不写用餐建议。"""
    bad = []
    m = re.search(r'<div class="day" data-date="([^"]*)" id="day00">(.*?)(?=\n<div class="day" )', src, re.S)
    if not m:
        return [f'{page}: 找不到 #day00（1/2 出发日；用户要求写早上 9 点金边家里出发）']
    ln = line_of(src, m.start())
    if m.group(1) != "2027-01-02":
        bad.append(f"{page}:{ln}  #day00 的 data-date 应为 2027-01-02，实际 {m.group(1)!r}")
    body = m.group(2)
    if not any(l.startswith('<div class="ev') and '<div class="t">09:00</div>' in l and "金边家里出发" in l for l in body.split("\n")):
        bad.append(f"{page}:{ln}  #day00 缺「09:00 金边家里出发」时间轴站点")
    for fid in ("fl-cx608", "fl-cx426"):
        if f'id="{fid}"' not in src:
            bad.append(f"{page}: #flights 里缺登机牌卡 id={fid}")
        if f'href="#{fid}"' not in body:
            bad.append(f"{page}:{ln}  #day00 没有引用航班卡 #{fid}（不要重复整张卡，用页内链接）")
    if "class=\"bpass\"" in body:
        bad.append(f"{page}:{ln}  #day00 里不要重复整张登机牌卡，改用页内链接")
    if not re.search(r'<a data-date="2027-01-02" href="#day00">\s*<span class="d">D0</span>', src):
        bad.append(f"{page}: 顶部 daystrip 缺 D0 chip（data-date=2027-01-02 href=#day00）")
    elif src.find('href="#day00"') > src.find('href="#day01"'):
        bad.append(f"{page}: D0 chip 要排在 D1 之前")
    if re.search(r'<div class="dayfoot">', body) or DINNER_RE.search(plain(body)):
        bad.append(f"{page}:{ln}  #day00 不写用餐建议（1/2 不排餐，更不能有晚餐）")
    if "1/2（六）从金边出发的两段航班见" in src:
        bad.append(f"{page}: D1 里还留着「1/2（六）从金边出发…」旧说明，应删除（出发日已写在 #day00）")
    return bad


def check_depart_time(page, src):
    """D1–D5 从酒店出发的站点一律 10:00（私人团，用户 2026-11-21）；D2–D5 各至少一个出发站点；私人团提示恰一处。"""
    bad = []
    seen = set()
    for m in re.finditer(r'<div class="day" data-date="[^"]*" id="day0([1-5])">(.*?)(?=\n<div class="day" |\n</section>)', src, re.S):
        d = int(m.group(1))
        body = m.group(2)
        for ev in re.finditer(r'<div class="ev[^"]*"><div class="t">(.*?)</div><h4>(.*?)</h4>', body, re.S):
            title = re.sub(r'<[^>]+>', '', ev.group(2))
            if "机场" in title or "金边" in title:
                continue
            if re.search(r'出发|Depart|Leave for', title):
                seen.add(d)
                t = re.sub(r'<[^>]+>', '', ev.group(1)).strip()
                if t != "10:00":
                    bad.append(f"{page}:{line_of(src, m.start(2) + ev.start())}  D{d} 从酒店出发站点时刻是 {t!r}，应为 10:00（私人团每天 10:00 出发）")
        for x in re.finditer(r'(\d\d:\d\d)\s*出发|(?:leave|set off|depart) at (\d\d:\d\d)', re.sub(r'<[^>]+>', '', body), re.I):
            t = x.group(1) or x.group(2)
            if t != "10:00":
                bad.append(f"{page}:{line_of(src, m.start())}  D{d} 文字里还写着 {t} 出发，应为 10:00")
    for d in (2, 3, 4, 5):
        if d not in seen:
            bad.append(f"{page}: D{d} 缺「10:00 出发」时间轴站点")
    for tag in ("私人团，时间可自行调整", "Private group: times are flexible"):
        n = src.count(tag)
        if n != 1:
            bad.append(f"{page}: 「{tag}」应在逐日区出现恰好 1 次，实际 {n} 次")
    return bad


import math

# 逐日吃饭栏：日 → (当天日期 1/N, 距离基准点在快照里的 title, 直线距离上限公里)
MEAL_REF = {1: (3, "The Westin Josun Seoul", 1.0), 3: (5, "Lotte World Tower", 8.0),
            4: (6, "Sports Monster Goyang", 12.0), 5: (7, "The Hyundai Seoul", 5.0)}


def haversine(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def check_meals(page, src):
    """逐日吃饭栏只引用现有餐厅卡：锚点存在、当天午餐有开、与当天主要地点直线距离在上限内（见文件头第 8 项）。"""
    snap = json.load(open(SNAP, encoding="utf-8"))
    by_title = {v["title"]: v for v in snap.values()}

    def pt(info):
        return (float(info["naver_lat"]), float(info["naver_lng"]))

    fa, fb = src.find('<section id="food">'), src.find('<section id="fun">')
    cards = {}
    for m in re.finditer(r'<div class="evt" id="(food-[a-z]+)">(.*?)\n</div>\n</div>', src[fa:fb], re.S):
        blk = m.group(2)
        g = re.search(r'class="btn-map" href="([^"]+)"', blk)
        h = re.search(r"<strong>营业时间：</strong>(.*?)<br>", blk)
        cards[m.group(1)] = (snap.get(g.group(1)) if g else None, lunch_days_from_hours(h.group(1)) if h else {})
    bad = []
    for d in range(0, 7):
        m = re.search(rf'<div class="day" data-date="[^"]*" id="day0{d}">(.*?)(?=\n<div class="day" |\n</section>)', src, re.S)
        if not m:
            bad.append(f"{page}: 找不到 #day0{d}，吃饭栏检查失效")
            continue
        ln = line_of(src, m.start())
        foots = re.findall(r'<div class="dayfoot">(.*?)</div>', m.group(1), re.S)
        if d in (0, 6):
            if foots:
                bad.append(f"{page}:{ln}  D{d} 不放用餐栏（出发日／回程日不排用餐）")
            continue
        if len(foots) != 1:
            bad.append(f"{page}:{ln}  D{d} 应有且只有一个吃饭栏，实际 {len(foots)} 个")
            continue
        foot = foots[0]
        spans = re.findall(r'<span class="cn">(.*?)</span><span class="en">(.*?)</span>', foot.split('class="tx"', 1)[-1], re.S)
        if not spans:
            bad.append(f"{page}:{ln}  D{d} 吃饭栏缺中英文字")
            continue
        cn, en = spans[0]
        a_cn, a_en = set(re.findall(r'href="#(food-[a-z]+)"', cn)), set(re.findall(r'href="#(food-[a-z]+)"', en))
        if a_cn != a_en:
            bad.append(f"{page}:{ln}  D{d} 吃饭栏中英两侧引用的餐厅不一致：{sorted(a_cn)} vs {sorted(a_en)}")
        if d == 2:
            if a_cn:
                bad.append(f"{page}:{ln}  D2 爱宝乐园当天在园内吃，不引用首尔市区餐厅：{sorted(a_cn)}")
            ever = by_title.get("Everland")
            near = min(haversine(pt(ever), pt(i)) for i, _ in cards.values() if i)
            x = re.search(r"直线约 ?([\d.]+) ?公里", plain(cn))
            if "园内" not in plain(cn) or not x:
                bad.append(f"{page}:{ln}  D2 吃饭栏要写「园内」和「离爱宝最近的餐厅直线约 N 公里」")
            elif abs(float(x.group(1)) - near) > 1:
                bad.append(f"{page}:{ln}  D2 写离爱宝最近 {x.group(1)} 公里，实际最近的是 {near:.1f} 公里")
            continue
        if not a_cn:
            bad.append(f"{page}:{ln}  D{d} 吃饭栏没有引用任何餐厅卡（href=\"#food-…\"）")
        day_n, ref_title, limit = MEAL_REF[d]
        ref = by_title.get(ref_title)
        if not ref:
            bad.append(f"{page}: 快照里找不到基准点 {ref_title}")
            continue
        for mm in re.finditer(r'href="#(food-[a-z]+)"', cn):
            cid = mm.group(1)
            if cid not in cards:
                bad.append(f"{page}:{ln}  D{d} 引用的 #{cid} 不是页面现有的餐厅卡（本页不新增餐厅）")
                continue
            info, days = cards[cid]
            name = (info or {}).get("title", cid)
            if days.get(day_n) is not True:
                bad.append(f"{page}:{ln}  D{d}（1/{day_n}）引用 {cid}，但卡上营业时间在那天没有午餐时段")
            if not info or not info.get("naver_lat"):
                bad.append(f"{page}:{ln}  D{d} 引用 {cid} 快照没有 Naver 坐标，算不了距离")
                continue
            km = haversine(pt(ref), pt(info))
            if km > limit:
                bad.append(f"{page}:{ln}  D{d} 引用 {cid}（{name}）离当天基准点 {ref_title} 直线 {km:.1f} 公里，超过上限 {limit:g} 公里（别排太远的店）")
            x = re.search(r"直线约 ?([\d.]+) ?公里", plain(cn[mm.end():]))
            if not x:
                bad.append(f"{page}:{ln}  D{d} 引用 {cid} 后面要写「直线约 X 公里」")
            elif abs(float(x.group(1)) - km) > 0.5:
                bad.append(f"{page}:{ln}  D{d} {cid} 写直线约 {x.group(1)} 公里，实际 {km:.1f} 公里")
    return bad


def check_lunch_slot(page, src):
    """午餐 12:30（用户 2026-11-21：「吃饭是12点半到1点之间 10点出发酒店 意思是10-12点这段时间要先去景点」）：
    D1–D5 各有且只有一个 12:30「午餐」时间轴站点；D2–D5 在它之前至少一个景点站点（.stop，非出发非用餐）；
    D1 凌晨 02:30 才到，例外但必须有「上午休息」字样；站点引用的餐厅锚点都是现有餐厅卡；D0、D6 不放午餐站点。"""
    bad = []
    fa, fb = src.find('<section id="food">'), src.find('<section id="fun">')
    cards = set(re.findall(r'<div class="evt" id="(food-[a-z]+)"', src[fa:fb]))
    if not cards:
        return [f"{page}: 找不到餐厅卡，午餐站点检查失效"]
    for d in range(0, 7):
        m = re.search(rf'<div class="day" data-date="[^"]*" id="day0{d}">(.*?)(?=\n<div class="day" |\n</section>)', src, re.S)
        if not m:
            bad.append(f"{page}: 找不到 #day0{d}，午餐站点检查失效")
            continue
        body = m.group(1)
        ln = line_of(src, m.start())
        lunches = [e for e in re.finditer(r'<div class="ev[^"]*"><div class="t">(.*?)</div><h4>(.*?)</h4>(.*?</div></div>)', body, re.S)
                   if re.search(r'午餐|Lunch', plain(e.group(2)))]
        if d in (0, 6):
            if lunches:
                bad.append(f"{page}:{ln}  D{d} 不放午餐站点（出发日／回程日）")
            continue
        if len(lunches) != 1:
            bad.append(f"{page}:{ln}  D{d} 时间轴要有且只有一个「午餐」站点（12:30），实际 {len(lunches)} 个")
            continue
        e = lunches[0]
        t = plain(e.group(1)).strip()
        if t != "12:30":
            bad.append(f"{page}:{line_of(src, m.start(1) + e.start())}  D{d} 午餐站点时刻是 {t!r}，应为 12:30（这团午餐 12:30–13:00）")
        before = body[:e.start()]
        if d == 1:
            if "上午休息" not in before:
                bad.append(f"{page}:{ln}  D1 午餐前要有「上午休息」站点，写明凌晨才到酒店所以上午没有景点")
        elif '<div class="stop"' not in before:
            bad.append(f"{page}:{ln}  D{d} 12:30 午餐之前没有景点站点（10:00 出发后 10–12 点要先去景点）")
        cn, en = re.search(r'<span class="cn">(.*?)</span><span class="en">(.*?)</span>', e.group(3), re.S).groups()
        a_cn, a_en = set(re.findall(r'href="#([a-z0-9-]+)"', cn)), set(re.findall(r'href="#([a-z0-9-]+)"', en))
        if a_cn != a_en:
            bad.append(f"{page}:{ln}  D{d} 午餐站点中英两侧引用的锚点不一致：{sorted(a_cn)} vs {sorted(a_en)}")
        for a in sorted(a_cn):
            if a not in cards:
                bad.append(f"{page}:{ln}  D{d} 午餐站点引用的 #{a} 不是现有餐厅卡（本页不新增餐厅）")
    return bad


def check_seat_maps(page, src):
    """每张登机牌卡：.seats 文字里的「姓名 座位号」要与同卡座位图 .st.on 格子（号码＋名字）一一对应、数量相同
    （用户 2026-11-21 改座位：文字改了、座位图忘了改，要抓得住）。"""
    bad = []
    starts = [m.start() for m in re.finditer(r'<div class="bpass"', src)]
    if len(starts) != 4:
        bad.append(f"{page}: 登机牌卡应有 4 张，实际 {len(starts)} 张")
    for st in starts:
        ends = [i for i in (src.find('<div class="bp-group-label"', st + 10), src.find('<div class="note', st + 10)) if i > 0]
        blk = src[st:min(ends) if ends else st + 20000]
        ln = line_of(src, st)
        fl = re.search(r'<span class="code">CX</span>(CX \d+)', blk)
        fl = fl.group(1) if fl else "?"
        txt = {}
        for t in re.findall(r'<span class="seat">(.*?)</span>', blk):
            mm = re.match(r'(.+?) (\d+[A-Z])$', t.strip())
            if not mm:
                bad.append(f"{page}:{ln}  {fl} .seats 里「{t}」不是「姓名 座位号」格式")
                continue
            txt[mm.group(2)] = mm.group(1).split("/")[-1].strip().lower()
        smap = {}
        for no, who in re.findall(r'<b class="st on"><span class="no">(\w+)</span><span class="who">(.*?)</span></b>', blk):
            smap[no] = who.strip().lower()
        if not txt or not smap:
            bad.append(f"{page}:{ln}  {fl} 找不到座位文字或座位图高亮格，检查失效")
        elif len(txt) != len(smap) or txt != smap:
            only_t = {k: v for k, v in txt.items() if smap.get(k) != v}
            only_m = {k: v for k, v in smap.items() if txt.get(k) != v}
            bad.append(f"{page}:{ln}  {fl} 座位文字与座位图对不上：文字独有 {only_t}，座位图独有 {only_m}（改座位要两处一起改）")
    return bad


def check_ratings(page, src):
    """第 12 项：每张地点卡的 Google＋Naver 评分行与快照一致；新增三家玩乐卡与 1/4 休标注（见文件头第 12 项）。"""
    snap = json.load(open(SNAP, encoding="utf-8")) if os.path.exists(SNAP) else {}
    bad, seen = [], 0
    starts = [m.start() for m in re.finditer(r'<div class="(?:evt|stop)" id="[^"]+">|<div class="hotel">', src)]
    for i, st in enumerate(starts):
        blk = src[st:starts[i + 1] if i + 1 < len(starts) else len(src)]
        g = re.search(r'<a class="btn-map" href="([^"]+)"', blk)
        if not g:
            continue
        seen += 1
        ln = line_of(src, st)
        info = snap.get(g.group(1).replace("&amp;", "&")) or {}
        title = info.get("title", "?")
        rate = re.findall(r'<div class="rate"><span class="cn">(.*?)</span><span class="en">(.*?)</span></div>', blk)
        if len(rate) != 1:
            bad.append(f"{page}:{ln}  「{title}」要恰好一行 Google＋Naver 评分（<div class=\"rate\">），实际 {len(rate)} 行")
            continue
        cn, en = rate[0]
        gr, gn = info.get("google_rating"), info.get("google_reviews")
        if gr is None or gn is None:
            bad.append(f"{page}:{ln}  「{title}」快照缺 google_rating／google_reviews")
            continue
        want_cn = f"Google {gr}（{gn:,} 则）· "
        want_en = f"Google {gr} ({gn:,}) · "
        if info.get("naver_id"):
            nn = info.get("naver_reviews")
            if nn is None or "naver_rating" not in info:
                bad.append(f"{page}:{ln}  「{title}」快照缺 naver_rating／naver_reviews")
                continue
            nr = info["naver_rating"]
            if nr is None:
                want_cn += f"Naver 未显示星级（{nn:,} 则评论）"
                want_en += f"Naver rating not shown ({nn:,} reviews)"
            else:
                want_cn += f"Naver {nr}（{nn:,} 则评论）"
                want_en += f"Naver {nr} ({nn:,} reviews)"
        else:
            want_cn += "Naver 无收录"
            want_en += "Not listed on Naver"
        if cn != want_cn:
            bad.append(f"{page}:{ln}  「{title}」中文评分行 {cn!r} 与快照应有的 {want_cn!r} 不一致")
        if en != want_en:
            bad.append(f"{page}:{ln}  「{title}」英文评分行 {en!r} 与快照应有的 {want_en!r} 不一致")
    if seen == 0:
        bad.append(f"{page}: 找不到任何地点卡，评分检查失效")
    # 新增三家（2026-11-21）
    for cid, why in (("fun-jump", "JUMP"), ("fun-vrzone", "VR Zone COEX"), ("fun-gwacheon", "国立果川科学馆")):
        m = re.search(r'<div class="evt" id="%s">' % cid, src)
        if not m:
            bad.append(f"{page}: 玩乐区缺「{why}」卡（id={cid}）")
            continue
        blk = src[m.start():src.find('<div class="evt" id="', m.end()) if src.find('<div class="evt" id="', m.end()) > 0 else len(src)]
        if cid in ("fun-jump", "fun-gwacheon"):
            if "1/4（一）休" not in blk or "Closed Mon 4 Jan" not in blk:
                bad.append(f"{page}:{line_of(src, m.start())}  「{why}」周一固定休，卡上要标「1/4（一）休」／「Closed Mon 4 Jan」")
    return bad


def main(argv):
    page = argv[0] if argv else PAGE
    path = page if os.path.isabs(page) else os.path.join(REPO, page)
    src = open(path, encoding="utf-8").read()
    bad = check_photo_count(page, src) + check_changsal(page, src) + check_status(page, src) + check_naver(page, src) + check_groups(page, src) + check_events(page, src) + check_lunch_only(page, src) + check_day00(page, src) + check_depart_time(page, src) + check_meals(page, src) + check_lunch_slot(page, src) + check_seat_maps(page, src) + check_ratings(page, src)
    if bad:
        print(f"✗ 首尔手册 {len(bad)} 处不符：")
        for b in bad:
            print("  " + b)
        return 1
    print("✓ 首尔手册：每张地点卡 4 张照片、窗棂纹带完整、所有地点状态都是 open、Naver 导航＋中文菜单／介绍按钮与快照一致且页面零 map.naver.com、餐厅分组与 Naver 类别一致、活动区齐全、只排午餐（无晚餐建议、餐厅都有午餐时段）、1/2 出发日 D0 俱全、D2–D5 每天 10:00 出发、逐日吃饭栏只引用现有餐厅（当天午餐有开、直线距离在上限内）、D1–D5 每天 12:30 午餐站点且饭前先排景点（D1 上午休息）、每张登机牌座位文字与座位图一一对应、每张地点卡 Google＋Naver 两种评分与快照一致（Naver 无收录的写明）、JUMP／VR Zone／国立果川科学馆三卡俱在且 1/4 休已标")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
