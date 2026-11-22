#!/usr/bin/env python3
"""破图自动补——找出失效的手册图片，重抓同一家店的照片补上。**只能在 CI 跑。**

为什么要有它（2026-09-18 用户要求）：「想说让你搞自动化，结果我还是一直要手动
选图什么的，不能搞简单化一点吗」。在这之前，一张图坏掉的完整流程是：
家人看到破图 → 告诉用户 → 用户告诉 Claude → Claude 触发抓图 → 换图 → 开 PR。
五步里有三步是人。而这件事没有一步需要判断力：哪张死了机器验得出来，
换成同一家店的哪张照片也不需要人拍板——**需要人拍板的只有「好不好看」，
那是挑图，不是补破图**。

所以这支脚本把补破图整条做完：
  1. 扫手册里的图片，逐张探测（沿用 check-images 的判定：非 image/* 或
     内容不足 1KB 都算死，因为过期的 Google 链接会回 200 加一坨非图片内容）
  2. 死图属于哪张卡：从图往后、到下一个相册开始之前，找这张卡的地图按钮
  3. 对需要补图的店各抓一轮照片，**跟死掉的那张同一个图床**：
     - Google 的图（lh3.googleusercontent.com）走 tools/fetch-photos.mjs，查询用卡上的
       Google 地图按钮（?cid= 或 /maps/place/ 都行），没有按钮才用卡片标题；
     - Naver 的图（*.pstatic.net，韩国手册）走 tools/fetch-photos-naver.mjs，用卡上 Naver
       导航／菜单按钮里的地点编号——韩国手册照片以 Naver 为准（CLAUDE.md 媒体规则），
       拿 Google 的图顶替等于换了来源。首尔有几张卡当初是 Naver 没合适的图才用 Google 补的，
       那几张坏了照旧走 Google，不会把挑过的版面打乱。（2026-11-22 加；之前只会走 Google，
       而且 Naver 网址在 HTML 里写成 &amp;，旧的整串替换根本对不上，还照样印「已换新图」。）
     CI 上才连得到 Google 与 Naver。
  4. 用这家店**还没被用过**的候选，按顺序补上死掉的位置
  5. 印出摘要，改动留在工作区，由 workflow 提交并开 PR 给用户过目

补不满不硬凑：抓不到就如实报「这家店补不了」，留着让人处理，
绝不拿别家店的照片顶上（那是「图不对题」，2026-09-16 被用户挡过一次）。

用法：
    python3 tools/refresh-photos.py                    # 全部手册
    python3 tools/refresh-photos.py penang-trip/index.html
    python3 tools/refresh-photos.py --dry-run          # 只报告不改档
退出码 0 = 跑完（不管有没有补到），1 = 参数或环境错误。
"""
import glob
import importlib.util
import json
import os
import re
import subprocess
import sys
import urllib.parse

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WANT = 8                      # 每家店抓几张候选：补 1 张也抓 8 张，之后好挑
PAGES = ["*.html", "*/index.html"]

# 借用 check-images 的探测逻辑，不要在这里复制一份判定规则——
# 「什么算死图」只能有一个定义，两份迟早会分岔。
_spec = importlib.util.spec_from_file_location(
    "check_images", os.path.join(REPO, "tools", "check-images.py"))
check_images = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check_images)

sys.path.insert(0, os.path.join(REPO, "tools", "lib"))
import trips  # noqa: E402  哪几趟还没走完——正本在 tools/lib/trips.py

IMG_LINE = re.compile(r'<img\b[^>]*\bsrc="([^"]+)"[^>]*>')
GAL = '<div class="gal"'
# Google 地图按钮：class 恰好是 btn-map（Naver 的是 "btn-map btn-map-naver"，不算）
GMAP = re.compile(r'<a[^>]+class="btn-map"[^>]+href="([^"]+)"')
# Naver 地点编号：导航按钮的 did=，或中文菜单／介绍按钮的 m.place.naver.com/<类>/<编号>
NAVER_ID = re.compile(r'[?&;]did=(\d{5,})|m\.place\.naver\.com/[a-z]+/(\d{5,})')
NAVER_IMG = re.compile(r"^https://[a-z0-9-]+\.pstatic\.net/")
TITLE = re.compile(r"<h[34][^>]*>(.*?)</h[34]>", re.S)


def pages(argv: list) -> list:
    os.chdir(REPO)
    files = [a for a in argv if not a.startswith("--")]
    if files:
        return files
    # 只碰登记在案的旅游手册：App（记账、老板版）与同事版那些页面里的 <img>
    # 是模板字符串（`${...}`），既不是外链也轮不到这支脚本管。
    out = [p for p in sorted(trips.TRIPS) if os.path.exists(p)]
    # 走完的行程不补图（2026-09-19 用户要求：「行程过了的就不用再跑了」）。
    # 点名单一档案时不套这条——真想补哪一本，指名就补得到。
    live, over = trips.split(out)
    if over:
        print(f"跳过 {len(over)} 个已结束行程的页面：{'、'.join(over)}")
    return live


def _name(fragment: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", fragment)).strip()[:40]


def card_of(html: str, pos: int) -> dict:
    """这张图属于哪张卡：{'google': 地图按钮网址, 'naver': Naver 地点编号, 'name': 卡片标题}，拿不到的是 None。

    手册的卡片一律是「相册在上、地图按钮在下」，所以从图往**后**找按钮——但只找到下一个
    相册开始之前，再往后就是别张卡了。旧写法往后硬看 6000 字、又只认 ?cid=：首尔手册 58 张卡
    有 39 张的 Google 链接是 /maps/place/（没有 cid），会一路找到下一张卡的 cid，
    拿别家的照片来补（2026-11-22 改）。
    标题先往后找，但只算地图按钮之前的（新加坡、槟城的版型：相册→标题→按钮）；
    没有就往前找，不越过上一个相册（首尔的版型：标题→相册→按钮——往后找到的是下一张卡的标题）。
    """
    end = html.find(GAL, pos)
    window = html[pos:end if end >= 0 else len(html)]
    g = GMAP.search(window)
    n = NAVER_ID.search(window)
    first_btn = window.find('class="btn-map')
    t = TITLE.search(window, 0, first_btn if first_btn >= 0 else len(window))
    name = _name(t.group(1)) if t else None
    if not name:
        this_gal = html.rfind(GAL, 0, pos)
        if this_gal >= 0:
            prev_gal = html.rfind(GAL, 0, this_gal)
            before = TITLE.findall(html[max(prev_gal, 0):this_gal])
            name = _name(before[-1]) if before else None
    return {
        "google": g.group(1).replace("&amp;", "&") if g else None,
        "naver": (n.group(1) or n.group(2)) if n else None,
        "name": name,
    }


def source_of(url: str, card: dict):
    """补图走哪条通道、拿什么查：跟死掉的那张同一个图床（理由见文件开头第 3 点）。
    回传 (通道, 查询)；查不了回传 (None, 原因)。"""
    if NAVER_IMG.match(url):
        if card["naver"]:
            return "naver", card["naver"]
        return None, "是 Naver 的图，但这张卡找不到 Naver 地点编号（没有 Naver 导航／菜单按钮）"
    q = card["google"] or card["name"]
    if q:
        return "google", q
    return None, "找不到所属店家（没有地图按钮也没有标题）"


def photo_key(u: str) -> str:
    """同一张照片的比对键。Naver 代理图（search.pstatic.net/common/?…&src=原图）比的是里面的原图，
    参数顺序、尺寸写法不同也认得出是同一张；其他网址整串比。"""
    u = u.replace("&amp;", "&")
    m = re.match(r"^https://search\.pstatic\.net/common/?\?(.*)$", u)
    if m:
        src = urllib.parse.parse_qs(m.group(1)).get("src", [""])[0]
        if src:
            return src.split("?")[0]
    return u


def attr(u: str) -> str:
    """写回 HTML 属性的写法：& 要写成 &amp;（手册里的 Naver 网址都是这样写的）。"""
    return u.replace("&amp;", "&").replace("&", "&amp;")


def fetch(queries: list) -> dict:
    """跑 Google 抓图器，回传 {查询: [候选网址]}。只能在 CI 跑（沙盒连不上 Google）。"""
    env = dict(os.environ, QUERIES="|".join(queries), WANT=str(WANT))
    proc = subprocess.run(["node", "tools/fetch-photos.mjs"],
                          capture_output=True, text=True, env=env, cwd=REPO)
    out = {}
    for line in proc.stdout.splitlines():
        if not line.startswith("RESULT "):
            continue
        j = json.loads(line[7:])
        # 只要长效格式：place-photos 那种带签名的链接约一个月就过期，
        # 拿它补图等于把同一个坑再挖一次（2026-09-18 槟城整本就是这么破的）
        out[j["query"]] = [u for u in j.get("urls", []) if "/gps-cs-s/" in u]
    if proc.returncode != 0 and not out:
        print("  ⚠ 抓图器没有产出：", (proc.stderr or proc.stdout)[-400:])
    return out


def fetch_naver(ids: list) -> dict:
    """跑 Naver 抓取器，回传 {Naver 地点编号: [候选网址]}。只能在 CI 跑（沙盒连不上 Naver）。

    它故意放慢（每家间隔 3–6 秒）、会被验证码挡：挡住的那家就是这轮补不了，照常报出来，
    不重试（重试只会被挡得更久）。候选已经是能直接 <img> 的 search.pstatic.net 代理图，
    菜单分类、菜单板照、博客图在抓取器那边就排除了。"""
    queries = ["https://map.naver.com/p/entry/place/" + i for i in ids]
    env = dict(os.environ, QUERIES="|".join(queries), WANT=str(WANT))
    proc = subprocess.run(["node", "tools/fetch-photos-naver.mjs"],
                          capture_output=True, text=True, env=env, cwd=REPO)
    out = {}
    for line in proc.stdout.splitlines():
        if not line.startswith("RESULT "):
            continue
        j = json.loads(line[7:])
        nid = j.get("naver_id") or ""
        urls = [u for u in j.get("urls", []) if u.startswith("https://search.pstatic.net/")]
        if not urls and j.get("captcha"):
            print(f"  ⚠ Naver {nid or j.get('query')}：被验证码挡住，这家这轮补不了")
        if nid:
            out[nid] = urls
    if proc.returncode != 0 and not out:
        print("  ⚠ Naver 抓取器没有产出：", (proc.stderr or proc.stdout)[-400:])
    return out


def fetch_for(source: str, keys: list) -> dict:
    return (fetch_naver if source == "naver" else fetch)(keys)


def main() -> int:
    dry = "--dry-run" in sys.argv
    targets = pages(sys.argv[1:])
    if not targets:
        print("没有要处理的文件")
        return 1

    grand_dead = grand_fixed = 0
    for path in targets:
        html = open(path, encoding="utf-8").read()
        # (HTML 里原样的写法, 浏览器真正请求的网址, 位置)：替换要用原样的写法才对得上
        imgs = [(m.group(1), m.group(1).replace("&amp;", "&"), m.start()) for m in IMG_LINE.finditer(html)]
        if not imgs:
            continue
        dead, seen = [], set()
        for raw, url, pos in imgs:
            if url in seen:          # 同一张图出现两次（封面＋相册）只算一次，替换时会一起换
                continue
            seen.add(url)
            alive, why = check_images.probe(url, "图片")
            if not alive:
                dead.append((raw, url, pos, why))
        if not dead:
            print(f"{path}：{len(imgs)} 张图全部正常")
            continue
        grand_dead += len(dead)
        print(f"{path}：{len(imgs)} 张图里有 {len(dead)} 张失效")

        # 按店归类。同一家店死了好几张，只抓一次。键是 (通道, 查询)。
        by_query = {}
        for raw, url, pos, why in dead:
            card = card_of(html, pos)
            line = html.count("\n", 0, pos) + 1
            src, q = source_of(url, card)
            if not src:
                print(f"  · 第 {line} 行的图{q}，跳过（要人工处理）")
                continue
            by_query.setdefault((src, q), {"name": card["name"] or q, "items": []})["items"].append(
                (raw, url, line, why))
        if not by_query:
            continue

        # 对照组：一次死掉大半，通常不是图真的全过期，而是图床把这台机器挡了
        # （沙盒 100% 会这样，CI 偶尔也会）。没有对照组就直接换的话，等于把一整本
        # 手册的好图换掉。所以先从同一个图床抓一张**刚出炉**的图来探：新图也打不开 → 是这台
        # 机器的问题，整轮罢工；新图打得开 → 那是真的成批过期，照常补。
        if len(dead) > len(imgs) * 0.5:
            probe_src, probe_q = next(iter(by_query))
            fresh_probe = fetch_for(probe_src, [probe_q]).get(probe_q, [])
            if not fresh_probe:
                print("  ⚠ 失效过半，且抓不到任何新图——判定是这台机器连不上图床，"
                      "本轮不动任何文件")
                return 0
            alive, why = check_images.probe(fresh_probe[0], "图片")
            if not alive:
                print(f"  ⚠ 失效过半，但刚抓的新图同样打不开（{why}）——"
                      f"判定是这台机器被挡，本轮不动任何文件")
                return 0
            print("  · 失效过半，但新抓的图打得开：确认是成批过期，继续补")

        if dry:
            for (src, q), info in by_query.items():
                print(f"  · {info['name']}：要补 {len(info['items'])} 张（走 {src}）")
            continue

        fresh = {}
        for src in ("google", "naver"):
            keys = [q for s, q in by_query if s == src]
            if keys:
                got = fetch_for(src, keys)
                fresh.update({(src, q): got.get(q, []) for q in keys})
        used = {photo_key(u) for _, u, _ in imgs}
        for (src, q), info in by_query.items():
            cands = [u for u in fresh.get((src, q), []) if photo_key(u) not in used]   # 别补成同页重复图
            need = info["items"]
            if len(cands) < len(need):
                print(f"  ✗ {info['name']}：要补 {len(need)} 张，只抓到 {len(cands)} 张可用（{src}），"
                      f"这家先留着不动")
                continue
            for (raw, url, line, why), new in zip(need, cands):
                if raw not in html:
                    print(f"  ✗ {info['name']} 第 {line} 行：页面里找不到原来的网址，没换")
                    continue
                html = html.replace(raw, attr(new))
                used.add(photo_key(new))
                grand_fixed += 1
                print(f"  ✓ {info['name']} 第 {line} 行（{why}）已换新图（{src}）")
        open(path, "w", encoding="utf-8").write(html)

    print(f"\n合计：失效 {grand_dead} 张，补上 {grand_fixed} 张")
    if grand_dead and grand_fixed < grand_dead:
        print("有补不上的——通常是那家店在 Google／Naver 上照片本来就少，或这轮被 Naver 验证码挡住；"
              "需要人工换卡片或换地点（韩国手册的 Naver 图用 fetch-photos.yml 选 source=naver 重抓）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
