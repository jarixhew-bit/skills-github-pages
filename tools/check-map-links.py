#!/usr/bin/env python3
"""手册地图链接体检——还没走完的手册不准用「搜索链接」与短链。

为什么要有它（2026-11-05 用户要求：「以后不要用搜索链接，直接准确的地点」）：
`https://www.google.com/maps/search/?api=1&query=…` 是把一串文字丢给 Google 去搜，
落到哪里由 Google 当下的排序决定——2026-11-05 实际踩过：搜「Soekarno-Hatta
Terminal 3」第一个结果是停车场，搜「JetQuay CIP Terminal」落到私人飞机 FBO 点。
`maps.app.goo.gl` 短链则看不出指向哪，也可能哪天失效。
所以手册的地图按钮一律用**地点页**（`https://www.google.com/maps/place/…`，
或 `maps.google.com/?cid=…` 这种指名某一个地点的写法）。

怎么判：读 `tools/lib/trips.py` 的日期表，只查**还没走完**的那几本手册
（走完的没人再打开，不去翻旧账）；页面里出现下面任一写法就红：
  - google.com/maps/search
  - maps.app.goo.gl
  - goo.gl/maps
  - 地点页网址里夹着一段搜索（`/maps/place/…/data=…!1m2!2m1!1z…`）：
    这是从搜索结果点进去复制的网址，打开时 Google 先跑那段搜索、左栏是搜索结果列表，
    用户看到的是「搜寻」不是直达那家店（2026-11-21 首尔手册 6 条，用户：「地图链接我要
    直接去那些地点的 不要搜寻的」）。换成 `maps.google.com/?cid=<十进制>`
    （cid＝网址里 `!1s0x…:0x…` 第二段转十进制）。
例外写在 ALLOW（页面 → 那条链接里的一段特征字串 → 原因＋日期）：只给真的
找不到地点页的那几个，而且每条都要说明为什么。

跑法：
    python3 tools/check-map-links.py
退出码 0 = 全过，1 = 有手册还在用搜索链接／短链。
"""
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "tools", "lib"))
import trips  # noqa: E402

BAD = re.compile(r"""https?://(?:www\.)?(?:google\.com/maps/search|maps\.app\.goo\.gl|goo\.gl/maps)[^"'\s<>]*""")
# 地点页但夹带搜索：/maps/place/…/data=…!2m1!1z…（搜索词）
SEARCHY = re.compile(r"""https?://(?:www\.)?google\.com/maps/place/[^"'\s<>]*?!2m1!1z[^"'\s<>]*""")

# 白名单：{页面: {链接里的特征字串: "原因（日期）"}}。
# 只放「两轮精确查询都找不到对应地点页」的，加之前先在 PR 里说明。
ALLOW = {
}


def main() -> int:
    live, over = trips.split(sorted(trips.TRIPS))
    bad = []
    checked = 0
    for page in live:
        path = os.path.join(REPO, page)
        if not os.path.exists(path):
            continue
        checked += 1
        src = open(path, encoding="utf-8").read()
        allow = ALLOW.get(page, {})
        for m in list(BAD.finditer(src)) + list(SEARCHY.finditer(src)):
            url = m.group(0)
            if any(key in url for key in allow):
                continue
            line = src.count("\n", 0, m.start()) + 1
            bad.append(f"{page}:{line}  {url[:110]}")
    if bad:
        print(f"✗ {len(bad)} 条地图链接是搜索链接／短链，要换成直达地点的链接（/maps/place/…/data=!…!1s0x… 或 ?cid=…）：")
        for b in bad:
            print("  " + b)
        print("拿地点页：跑 fetch-photos.yml（want=1），结果里的 place_url 就是；"
              "务必核对 place_title／address 是同一个地方。真的找不到才进 ALLOW 白名单。")
        return 1
    print(f"✓ {checked} 本还没走完的手册，地图链接都是地点页（已结束 {len(over)} 本不查）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
