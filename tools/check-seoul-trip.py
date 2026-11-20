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


def main(argv):
    page = argv[0] if argv else PAGE
    path = page if os.path.isabs(page) else os.path.join(REPO, page)
    src = open(path, encoding="utf-8").read()
    bad = check_photo_count(page, src) + check_changsal(page, src) + check_status(page, src)
    if bad:
        print(f"✗ 首尔手册 {len(bad)} 处不符：")
        for b in bad:
            print("  " + b)
        return 1
    print("✓ 首尔手册：每张地点卡 4 张照片、窗棂纹带完整、所有地点状态都是 open")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
