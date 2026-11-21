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


def main(argv):
    page = argv[0] if argv else PAGE
    path = page if os.path.isabs(page) else os.path.join(REPO, page)
    src = open(path, encoding="utf-8").read()
    bad = check_photo_count(page, src) + check_changsal(page, src) + check_status(page, src) + check_naver(page, src) + check_groups(page, src) + check_events(page, src) + check_lunch_only(page, src) + check_day00(page, src)
    if bad:
        print(f"✗ 首尔手册 {len(bad)} 处不符：")
        for b in bad:
            print("  " + b)
        return 1
    print("✓ 首尔手册：每张地点卡 4 张照片、窗棂纹带完整、所有地点状态都是 open、Naver 导航＋中文菜单／介绍按钮与快照一致且页面零 map.naver.com、餐厅分组与 Naver 类别一致、活动区齐全、只排午餐（无晚餐建议、餐厅都有午餐时段）、1/2 出发日 D0 俱全")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
