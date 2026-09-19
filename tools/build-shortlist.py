#!/usr/bin/env python3
"""把研究员找到的候选地点，排成一张「你按编号挑」的清单页。

为什么要有它（2026-09-19 用户要求）：「以后要去哪个城市跟你讲一声，你就能自动找了
推荐？我自己选？」——能。找地点、拿评分、抓照片都已经是自动的，唯一缺的是
**一张让人一眼挑完的页面**。在这之前每次都是我在对话里列清单，几十个地点滚上滚下，
挑起来很累，也看不到照片。

它做什么：吃一份候选 JSON（研究员产出）＋一份抓图结果（fetch-photos 产出），
生成一页 HTML——每个候选一张卡：编号、名称、评分（评论数）、类别、推荐理由、
营业时间、地址、地图按钮、三张照片。你只要回「要 3 5 8，备选 12」就行。

评分门槛按 CLAUDE.md：餐厅/景点 ≥4.2，电玩城/保龄球这类游艺场所 ≥3.8。
**低于门槛的不删、但会标红**——研究员有时是刻意收录（例如全城只有这一家），
删掉的话你根本不知道它存在过；标红则是「这家要你自己拍板」。

用法：
    python3 tools/build-shortlist.py 候选.json -o 清单页.html
    python3 tools/build-shortlist.py 候选.json --photos .photos/latest.txt -o out.html

候选 JSON 的形状（研究员照这个交）：
    {"city": "曼谷", "dates": "2026-12-05~09", "pax": 4, "notes": "有小孩、不吃牛",
     "places": [{"name": "Somtum Der", "cn": "東北菜",
                 "cat": "餐厅", "rating": 4.4, "reviews": 3120,
                 "map": "https://maps.google.com/?cid=123",
                 "why": "米其林必比登，辣度可调，小孩能吃",
                 "hours": "每日 11:00–22:00", "addr": "5/5 Sala Daeng Rd"}]}
"""
import argparse
import html
import json
import os
import re
import sys

# 门槛的正本在 CLAUDE.md；这里只是把它写成机器判得出来的形式。
THRESHOLD_DEFAULT = 4.2
THRESHOLD_ARCADE = 3.8
ARCADE_CATS = {"游艺", "电玩", "电玩城", "保龄球", "亲子游艺"}
PHOTOS_PER_CARD = 3


def threshold(cat: str) -> float:
    return THRESHOLD_ARCADE if (cat or "").strip() in ARCADE_CATS else THRESHOLD_DEFAULT


def load_photos(path: str) -> dict:
    """读 fetch-photos 的产出，回传 {查询: [网址]}。没有就回空字典。"""
    out = {}
    if not path or not os.path.exists(path):
        return out
    for line in open(path, encoding="utf-8"):
        if not line.startswith("RESULT "):
            continue
        j = json.loads(line[7:])
        # 只要长效格式：place-photos 那种一个月就过期（2026-09-18 槟城整本因此破图）
        out[j["query"]] = [u for u in j.get("urls", []) if "/gps-cs-s/" in u]
    return out


def photos_for(place: dict, photos: dict) -> list:
    """照地图链接对应；对不上时退回用店名当 key（研究员可能给的是店名）。"""
    for key in (place.get("map"), place.get("name"), place.get("cn")):
        if key and key in photos:
            return photos[key][:PHOTOS_PER_CARD]
    return []


def card(i: int, p: dict, photos: dict) -> str:
    name = html.escape(str(p.get("name") or p.get("cn") or "（没有名字）"))
    cn = html.escape(str(p.get("cn") or ""))
    cat = html.escape(str(p.get("cat") or "未分类"))
    rating = p.get("rating")
    reviews = p.get("reviews")
    low = isinstance(rating, (int, float)) and rating < threshold(p.get("cat"))
    rating_txt = (f"⭐{rating}" + (f"（{reviews:,} 评价）" if isinstance(reviews, int) else "")
                  if rating is not None else "⚠ 没有评分")
    imgs = photos_for(p, photos)
    gal = "".join(
        f'<img alt="{name} 照片 {k}" src="{html.escape(u)}" loading="lazy">'
        for k, u in enumerate(imgs, 1)) or '<div class="noimg">（这家还没抓到照片）</div>'
    warn = ('<div class="warn">⚠ 低于评分门槛 '
            f'{threshold(p.get("cat"))}，要不要留你决定</div>') if low else ""
    bits = []
    for label, key in (("营业", "hours"), ("地址", "addr")):
        if p.get(key):
            bits.append(f'<span class="chip">{label}：{html.escape(str(p[key]))}</span>')
    mapbtn = (f'<a class="btn" href="{html.escape(p["map"])}" target="_blank">📍 地图</a>'
              if p.get("map") else '<span class="chip warnchip">⚠ 没有地图链接</span>')
    return f"""<section class="card{' low' if low else ''}" data-n="{i}">
<div class="head"><span class="n">{i}</span><h2>{name}{f' · {cn}' if cn and cn != name else ''}</h2>
<span class="rate">{rating_txt}</span><span class="cat">{cat}</span></div>
{warn}
<div class="gal">{gal}</div>
<p class="why">{html.escape(str(p.get('why') or '（研究员没写理由——这种通常该问清楚再收）'))}</p>
<div class="chips">{''.join(bits)}{mapbtn}</div>
</section>"""


def build(data: dict, photos: dict) -> str:
    places = data.get("places") or []
    head = html.escape(str(data.get("city") or "新城市"))
    sub = " · ".join(str(x) for x in (data.get("dates"), f"{data.get('pax')} 人"
                                      if data.get("pax") else None, data.get("notes")) if x)
    cards = "\n".join(card(i, p, photos) for i, p in enumerate(places, 1))
    cats = {}
    for p in places:
        cats[p.get("cat") or "未分类"] = cats.get(p.get("cat") or "未分类", 0) + 1
    tally = "、".join(f"{k} {v}" for k, v in sorted(cats.items(), key=lambda kv: -kv[1]))
    return f"""<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>候选清单 · {head}</title>
<style>
 body{{font-family:system-ui,-apple-system,"PingFang SC",sans-serif;margin:0;padding:16px;
      background:#faf8f5;color:#1a1a1a;max-width:900px;margin:0 auto}}
 h1{{font-size:20px;margin:0 0 4px}}
 .sub{{color:#666;font-size:13px;margin:0 0 6px}}
 .how{{background:#fff;border:1px solid #e5ded3;border-radius:10px;padding:10px 13px;
       font-size:13px;line-height:1.7;margin:0 0 18px}}
 .card{{background:#fff;border:1px solid #e5ded3;border-radius:12px;padding:12px 14px;margin:0 0 14px}}
 .card.low{{border-color:#f0c9bd;background:#fffaf8}}
 .head{{display:flex;align-items:center;gap:8px;flex-wrap:wrap}}
 .n{{background:#1a1a1a;color:#fff;border-radius:6px;padding:1px 8px;font-weight:800;font-size:13px}}
 h2{{font-size:15px;margin:0;flex:1 1 auto}}
 .rate{{font-size:13px;font-weight:700;color:#a97a18}}
 .cat{{font-size:12px;color:#666;border:1px solid #e5ded3;border-radius:6px;padding:1px 7px}}
 .warn{{color:#8a2a17;font-size:12.5px;margin-top:6px;font-weight:700}}
 .gal{{display:flex;gap:6px;margin:8px 0;overflow-x:auto}}
 .gal img{{width:33%;min-width:120px;aspect-ratio:4/3;object-fit:cover;border-radius:8px;background:#eee}}
 .noimg{{font-size:12.5px;color:#999;padding:10px 0}}
 .why{{font-size:13.5px;line-height:1.7;margin:6px 0}}
 .chips{{display:flex;gap:6px;flex-wrap:wrap;align-items:center}}
 .chip{{font-size:12px;color:#555;background:#faf8f5;border:1px solid #e5ded3;
        border-radius:6px;padding:2px 8px}}
 .warnchip{{color:#8a2a17;border-color:#f0c9bd}}
 .btn{{font-size:12.5px;font-weight:700;color:#1f4e79;text-decoration:none;
       border:1px solid #c3d7ea;background:#eaf1f8;border-radius:6px;padding:3px 9px}}
</style>
<h1>候选清单 · {head}</h1>
<p class="sub">{html.escape(sub)}</p>
<div class="how">这一页不是手册，是**给你挑的**。看完直接回我编号就行，例如：<br>
「<b>要 1 3 7 12，备选 5 9，其余不要</b>」。<br>
挑完我照你选的出手册（版型跟新加坡／槟城那两本一样）。<br>
共 {len(places)} 个候选（{tally}）。标红的是低于评分门槛、我没自作主张删掉的。</div>
{cards}
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("json", help="候选 JSON（研究员产出）")
    ap.add_argument("--photos", default=".photos/latest.txt", help="抓图结果")
    ap.add_argument("-o", "--out", required=True, help="输出的 HTML")
    a = ap.parse_args()
    data = json.load(open(a.json, encoding="utf-8"))
    if not data.get("places"):
        print("候选 JSON 里没有 places，什么都生不出来")
        return 1
    photos = load_photos(a.photos)
    page = build(data, photos)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    open(a.out, "w", encoding="utf-8").write(page)
    n = len(data["places"])
    withpic = sum(1 for p in data["places"] if photos_for(p, photos))
    low = sum(1 for p in data["places"]
              if isinstance(p.get("rating"), (int, float))
              and p["rating"] < threshold(p.get("cat")))
    print(f"写好 {a.out}：{n} 个候选，{withpic} 个有照片，{low} 个低于门槛（已标红）")
    if withpic < n:
        print(f"  · 有 {n - withpic} 个还没照片——先跑 fetch-photos 抓完再生成会好看很多")
    return 0


if __name__ == "__main__":
    sys.exit(main())
