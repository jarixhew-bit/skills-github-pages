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
        elif info["status"] != "open":
            bad.append(f"{page}:{line_of(src, m.start())}  「{info['title']}」状态是 {info['status']}，不能放进手册")
    if seen == 0:
        bad.append(f"{page}: 找不到任何 btn-map，检查本身失效")
    return bad


def check_naver(page, src):
    snap = json.load(open(SNAP, encoding="utf-8")) if os.path.exists(SNAP) else {}
    bad = []
    seen = 0
    # 每个 .links 区块：Google 按钮在前，Naver 按钮（若有）紧随其后
    for m in re.finditer(r'<div class="links">(.*?)</div>', src, re.S):
        blk = m.group(1)
        g = re.search(r'<a class="btn-map" href="([^"]+)"', blk)
        if not g:
            continue
        n = re.findall(r'<a class="btn-map btn-map-naver" href="([^"]*)"', blk)
        if len(n) > 1:
            bad.append(f"{page}:{line_of(src, m.start())}  一张卡里有 {len(n)} 颗 Naver 按钮")
        for u in n:
            seen += 1
            mm = re.fullmatch(r"https://map\.naver\.com/p/entry/place/(\d+)", u)
            if not mm:
                bad.append(f"{page}:{line_of(src, m.start())}  Naver 按钮不是 entry/place/<id> 形式：{u[:80]}")
                continue
            info = snap.get(g.group(1)) or {}
            if info.get("naver_id") != mm.group(1):
                bad.append(f"{page}:{line_of(src, m.start())}  Naver id {mm.group(1)} 与快照记录的 {info.get('naver_id')} 不一致（「{info.get('title')}」）")
            elif info.get("naver_status") == "open":
                pass
            elif info.get("naver_status") == "unknown" and info.get("naver_note"):
                pass
            else:
                bad.append(f"{page}:{line_of(src, m.start())}  「{info.get('title')}」Naver 状态 {info.get('naver_status')} 不是 open")
    for m in re.finditer(r'map\.naver\.com/[^"\s<>]*', src):
        if "/p/entry/place/" not in m.group(0):
            bad.append(f"{page}:{line_of(src, m.start())}  Naver 链接不是地点页：{m.group(0)[:80]}")
    if seen == 0:
        bad.append(f"{page}: 找不到任何 Naver 按钮，检查本身失效")
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


def main(argv):
    page = argv[0] if argv else PAGE
    path = page if os.path.isabs(page) else os.path.join(REPO, page)
    src = open(path, encoding="utf-8").read()
    bad = check_photo_count(page, src) + check_changsal(page, src) + check_status(page, src) + check_naver(page, src) + check_lunch_only(page, src)
    if bad:
        print(f"✗ 首尔手册 {len(bad)} 处不符：")
        for b in bad:
            print("  " + b)
        return 1
    print("✓ 首尔手册：每张地点卡 4 张照片、窗棂纹带完整、所有地点状态都是 open、Naver 按钮与快照一致、只排午餐（无晚餐建议、餐厅都有午餐时段）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
