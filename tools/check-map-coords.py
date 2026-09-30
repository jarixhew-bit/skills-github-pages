#!/usr/bin/env python3
"""槟城手册总地图的坐标自检（静态，不开浏览器）。

背景（2026-09-30 建）：总地图从试装页 with-map.html 并入 penang-trip/index.html。
图钉坐标不是浏览器现查的，而是 CI 抓回 penang-trip/coords.json、核对后写进页面
`MAP_COORDS`。以后加卡片最容易漏的就是「卡片加了、坐标没补」——页面不会坏，
只是那一家安安静静地不上图（或被列成「坐标待核对」），没人会发现。

检查项（任何一项不过就印出是哪一家、退出码 1）：
  ① 每张带地图链接的卡片（cid 或地图链接）在 coords.json 与页面 MAP_COORDS 里都有坐标，
     且两边数字一致
  ② 坐标都在槟城州范围（纬 5.1–5.6、经 100.15–100.6）——放错位置的图钉比没有更糟
  ③ coords.json 没有对不上任何卡片的孤儿（删卡片忘了删坐标）
  ④ index.html 里有地图区块（section#map）与 OpenStreetMap 署名（OSM 使用条款要求）

用法：python3 tools/check-map-coords.py
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "penang-trip" / "index.html"
COORDS = ROOT / "penang-trip" / "coords.json"
LAT = (5.1, 5.6)
LNG = (100.15, 100.6)


def card_places(src: str):
    """回传 [(key, 名称)]：key＝cid（有的话）否则地图链接本身。"""
    out = []
    for block in re.split(r'<div class="rcard"', src)[1:]:
        m = re.search(r'<a class="btn-map" href="([^"]+)"', block)
        if not m:
            continue
        href = html.unescape(m.group(1))
        cid = re.search(r"[?&]cid=(\d+)", href)
        name = re.search(r'<h3><span class="cn">(.*?)</span><span class="en">(.*?)</span>', block)
        label = f"{name.group(1)} / {name.group(2)}" if name else href
        out.append((cid.group(1) if cid else href, re.sub(r"<[^>]+>", "", label)))
    return out


def main() -> int:
    errs = []
    src = PAGE.read_text(encoding="utf-8")
    try:
        coords = json.loads(COORDS.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"❌ 读不了 {COORDS.relative_to(ROOT)}：{e}")
        return 1

    by_key = {}
    for c in coords:
        for k in (c.get("cid"), c.get("query")):
            if k:
                by_key[str(k)] = c

    m = re.search(r"var MAP_COORDS = (\{.*?\});", src)
    if not m:
        errs.append("页面里找不到 `var MAP_COORDS = {...};`（地图坐标表）")
        page_coords = {}
    else:
        page_coords = json.loads(m.group(1))

    places = card_places(src)
    if not places:
        errs.append("页面里一张带地图链接的卡片都没找到（卡片结构变了？）")
    used = set()
    for key, label in places:
        c = by_key.get(key)
        if not c or c.get("lat") is None or c.get("lng") is None:
            errs.append(f"① {label}：coords.json 里没有坐标（{key}）——跑 fetch-coords.yml 补上")
            continue
        used.add(id(c))
        lat, lng = c["lat"], c["lng"]
        if not (LAT[0] <= lat <= LAT[1] and LNG[0] <= lng <= LNG[1]):
            errs.append(f"② {label}：坐标 {lat},{lng} 不在槟城州范围")
        pc = page_coords.get(key)
        if not pc:
            errs.append(f"① {label}：页面 MAP_COORDS 里没有这一家（{key}），它不会上图")
        elif abs(pc["lat"] - lat) > 1e-6 or abs(pc["lng"] - lng) > 1e-6:
            errs.append(f"① {label}：页面 MAP_COORDS {pc['lat']},{pc['lng']} 与 coords.json {lat},{lng} 对不上")

    keys = {k for k, _ in places}
    for c in coords:
        if id(c) not in used:
            errs.append(f"③ coords.json 孤儿：{c.get('title') or c.get('query')}（cid {c.get('cid')}）对不上任何卡片")
    for k in page_coords:
        if k not in keys:
            errs.append(f"③ 页面 MAP_COORDS 孤儿：{k} 对不上任何卡片")

    if not re.search(r'<section id="map"', src):
        errs.append('④ index.html 里没有地图区块 <section id="map">')
    if "openstreetmap.org/copyright" not in src:
        errs.append("④ index.html 里没有 OpenStreetMap 署名（openstreetmap.org/copyright）")

    if errs:
        print(f"❌ 槟城总地图坐标自检：{len(errs)} 项不过")
        for e in errs:
            print("  - " + e)
        return 1
    print(f"✅ 槟城总地图坐标自检通过：{len(places)} 张卡片都有坐标、都在槟城州，coords.json 无孤儿，地图区块与 OSM 署名在")
    return 0


if __name__ == "__main__":
    sys.exit(main())
