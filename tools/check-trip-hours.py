#!/usr/bin/env python3
"""手册营业时间体检——还没走完的手册，营业时间必须查好写死，不准推给读者。

为什么要有它（2026-11-08 用户：「雅加达的几家餐饮怎么没有营业时间，你不会查好了
再放下去吗？……怎么比新加坡手册还差」）：雅加达手册有五家餐厅写的是
「营业时间请订位时电话确认」「请出发前在 Google 地图上确认」「晚市时段请订位时确认」
「最后点餐时间请现场确认」——沙盒连不上 Google，当时没查到，就把查的活丢给了读者。
手册是给老板一行人拿着用的成品，这种话等于没查。查营业时间的路：fetch-photos.yml
的 RESULT 带 `hours`（地点页的每周营业时间表），读不到再找官网／订位平台并附来源。

怎么判：读 `tools/lib/trips.py` 的日期表，只查**还没走完**的手册：
  1. 推卸写法：全文（中英两侧都算）出现下面这类话就红——
     「营业时间请…」「请…确认营业」「请出发前在 Google 地图上确认」
     「最后点餐时间请现场确认」「时段请订位时确认」「…（休业）去之前确认」，
     英文的 "please confirm/check … hours/times/last orders"。
  2. 每张餐厅卡（`<section id="food">` 里每个 `<h3>`）的中文说明，必须同时写出
     日期（如 11/14–11/16）和至少一段确切时刻（如 10:00–22:00）。
     「随商场营业」「每天午晚都营业」这种没有时刻的不算。
查不到的那一格要写明是「未公布」还是「来源不一」并写具体——那不是推卸，不会被拦。

跑法：
    python3 tools/check-trip-hours.py            # 查全部还没走完的手册
    python3 tools/check-trip-hours.py 某个.html  # 只查指定档案（false-red 用）
退出码 0 = 全过，1 = 有问题。
"""
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "tools", "lib"))
import trips  # noqa: E402

# 一个子句之内（不跨句号／分号／标签）
C = r"[^。；;<]"
PUNT = [
    re.compile(rf"(营业|时段|点餐|开放时间|营业时间){C}{{0,20}}请{C}{{0,20}}(确认|查看|询问|核实)"),
    re.compile(rf"请{C}{{0,20}}(确认|查看|核实){C}{{0,10}}(营业|时段|点餐|开放时间)"),
    re.compile(r"请出发前在\s*Google\s*地图上确认"),
    re.compile(rf"(休业|营业|休息){C}{{0,30}}(去之前|出发前|到店前){C}{{0,4}}确认"),
    re.compile(r"(营业时间|时段)(订位时确认|看\s*Google)"),
    re.compile(r"please\s+(re)?(confirm|check|verify)[^.<;]{0,40}\b(hours|times|last\s+orders|opening)", re.I),
    re.compile(r"\b(hours|times|last\s+orders)\b[^.<;]{0,20}\b(please\s+)?(re)?confirm\s+(when|on|by|before)", re.I),
    re.compile(r"check\s+(the\s+)?hours\s+on\s+Google", re.I),
]

DATE = re.compile(r"\d{1,2}/\d{1,2}")
TIME = re.compile(r"\d{1,2}:\d{2}\s*[–\-~至到]\s*(?:次日\s*)?\d{1,2}:\d{2}|24\s*小时")
TAG = re.compile(r"<[^>]+>")


def food_cards(src: str):
    """回传 [(行号, 店名, 中文说明纯文字)]；页面没有 #food 就回空。"""
    i = src.find('<section id="food">')
    if i < 0:
        return []
    j = src.find("</section>", i)
    sec = src[i:j if j > 0 else len(src)]
    heads = list(re.finditer(r'<h3><span class="cn">(.*?)</span>', sec))
    out = []
    for k, h in enumerate(heads):
        end = heads[k + 1].start() if k + 1 < len(heads) else len(sec)
        blk = sec[h.start():end]
        d = re.search(r'<div class="desc"><span class="cn">(.*?)</span><span class="en">', blk, re.S)
        # 2026-11-08 用户：同一张卡营业时间写两遍多余，只留说明里那行——所以只认说明文字
        text = TAG.sub("", d.group(1) if d else "")
        out.append((src.count("\n", 0, i + h.start()) + 1, TAG.sub("", h.group(1)), text))
    return out


def check(page: str, src: str) -> list:
    bad = []
    for r in PUNT:
        for m in r.finditer(src):
            line = src.count("\n", 0, m.start()) + 1
            bad.append(f"{page}:{line}  把查营业时间推给读者：「{m.group(0)[:60]}」")
    ev = src.find('<section id="events">')
    eve = src.find("</section>", ev) if ev >= 0 else -1
    for m in re.finditer(r'class="chip hours"', src):
        if ev >= 0 and ev < m.start() < eve:
            continue  # 限时活动卡的场次标签不算营业时间
        line = src.count("\n", 0, m.start()) + 1
        bad.append(f"{page}:{line}  营业时间又写在小标签里（说明里已经写了，用户 2026-11-08：同一张卡写两遍多余）")
    for line, name, text in food_cards(src):
        if not (DATE.search(text) and TIME.search(text)):
            bad.append(f"{page}:{line}  餐厅卡「{name}」没写出那几天的确切营业时间（要有日期＋时刻）")
    return bad


def main(argv) -> int:
    if argv:
        pages = argv
        over = []
    else:
        pages, over = trips.split(sorted(trips.TRIPS))
    bad, checked = [], 0
    for page in pages:
        path = page if os.path.isabs(page) else os.path.join(REPO, page)
        if not os.path.exists(path) or not path.endswith(".html"):
            continue
        checked += 1
        bad += check(page, open(path, encoding="utf-8").read())
    if bad:
        print(f"✗ {len(bad)} 处营业时间没查实：")
        for b in bad:
            print("  " + b)
        print("查法：fetch-photos.yml 的 RESULT 有 hours（地点页营业时间表）；读不到找官网／订位平台并附来源。"
              "真查不到写明「未公布」或「来源不一」及具体内容，不准写「请自己确认」。")
        return 1
    print(f"✓ {checked} 本还没走完的手册，营业时间都查实了（已结束 {len(over)} 本不查）")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
