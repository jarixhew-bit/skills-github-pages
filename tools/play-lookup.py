#!/usr/bin/env python3
"""Google Play 查询通道 —— 只能在 GitHub Actions 上跑。

为什么要它（2026-08-12）：沙盒的出口代理把 play.google.com、apkcombo 这类站
全挡了（EGRESS_BLOCKED），Claude 在容器里查不到任何 App 的包名。而
game-bot/ 的脚本第一件事就是要包名。按 CLAUDE.md「沙盒连不上的外部服务，
先想 CI 通道」，把查询搬到 runner 上跑——runner 出得去。

它做什么：拿关键字去 Play 商店搜，把搜到的每个 App 的「真实标题 + 包名 +
开发商」印出来。标题一律原样输出，不做任何字符正规化——「暗夜」和「暗影」
差一个字就是两款不同的游戏，正规化会把人骗了。

跑法（Actions 页面 Run workflow，或 Claude 调 API 触发 play-lookup.yml）：
    python3 tools/play-lookup.py "关键字" "TW,HK,SG"

结果直接印在 job 日志里（输出很短，不必落档），Claude 用 get_job_logs 读回。
"""
import html
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
PKG_RE = re.compile(r"/store/apps/details\?id=([A-Za-z0-9_][A-Za-z0-9_.]*)")
# 详情页的标题与开发商都躺在 og / itemprop 这几个标签里
TITLE_RE = re.compile(r'<meta\s+property="og:title"\s+content="([^"]*)"', re.I)
DESC_RE = re.compile(r'<meta\s+name="description"\s+content="([^"]*)"', re.I)


def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def search(keyword, gl):
    q = urllib.parse.quote(keyword)
    url = f"https://play.google.com/store/search?q={q}&c=apps&hl=zh_TW&gl={gl}"
    try:
        page = fetch(url)
    except urllib.error.HTTPError as e:
        print(f"  [{gl}] 搜索页 HTTP {e.code}")
        return []
    except Exception as e:
        print(f"  [{gl}] 搜索页拿不到：{type(e).__name__} {e}")
        return []

    seen, order = set(), []
    for m in PKG_RE.finditer(page):
        pkg = m.group(1)
        if pkg not in seen:
            seen.add(pkg)
            order.append(pkg)
    return order


def detail(pkg, gl):
    url = f"https://play.google.com/store/apps/details?id={pkg}&hl=zh_TW&gl={gl}"
    try:
        page = fetch(url)
    except Exception as e:
        return None, f"详情页拿不到（{type(e).__name__}）"
    t = TITLE_RE.search(page)
    d = DESC_RE.search(page)
    title = html.unescape(t.group(1)) if t else "(读不到标题)"
    desc = html.unescape(d.group(1))[:70].replace("\n", " ") if d else ""
    return title, desc


def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print("要传关键字")
        return 2
    keyword = sys.argv[1].strip()
    regions = [g.strip() for g in (sys.argv[2] if len(sys.argv) > 2 else "TW").split(",") if g.strip()]

    print("=" * 60)
    print(f"关键字：{keyword}")
    print(f"地区：{', '.join(regions)}")
    print("=" * 60)

    命中 = {}
    for gl in regions:
        pkgs = search(keyword, gl)
        print(f"\n[{gl}] 搜索页命中 {len(pkgs)} 个包名")
        for pkg in pkgs[:12]:
            if pkg in 命中:
                continue
            title, desc = detail(pkg, gl)
            命中[pkg] = (title, desc, gl)
            # 标题里含关键字的标出来，方便一眼看到
            标记 = " ★" if title and keyword in title else ""
            print(f"  {pkg}")
            print(f"      标题：{title}{标记}")
            if desc:
                print(f"      简介：{desc}")

    print("\n" + "=" * 60)
    完全匹配 = [p for p, (t, _, _) in 命中.items() if t and keyword in t]
    if 完全匹配:
        print(f"标题里含「{keyword}」的：")
        for p in 完全匹配:
            print(f"  {p}  ←  {命中[p][0]}")
    else:
        print(f"没有任何一个 App 的标题里含「{keyword}」。")
        print("可能是：这个游戏不在 Google Play 上（只在别的商店或官网发）、")
        print("在这几个地区搜不到（换 gl 试试）、或者名字不是这几个字。")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
