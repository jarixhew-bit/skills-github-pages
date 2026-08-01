#!/usr/bin/env python3
"""图片与地图链接体检器 —— 检查页面里的外链图片是不是还活着。

背景：本仓库的手册一律用 Google Places 图片外链、不上传图片进仓库
（CLAUDE.md 媒体文件规则）。外链的坏处是**会悄悄失效**——页面还在、
网址还通，只有打开的人看到一个破图，而发手册的人永远不会知道。
本脚本就是为了让失效被自动发现，不必等家人来说「图片打不开」。

检查项：
1. <img src="https://..."> 的图片链接
2. href="https://maps..." 的地图链接（CLAUDE.md 要求推荐地点必附地图链接）

判定：HTTP 2xx/3xx = 活着；4xx/5xx 或连不上 = 坏了。
为了不误报（误报会让人开始忽略警报，等于白做），每个失败的链接会重试 2 次，
三次都失败才算数。

用法：
    python3 tools/check-images.py --all           # 检查仓库内所有 .html
    python3 tools/check-images.py 某页面.html      # 检查指定文件

注意：沙盒环境连不上 Google，本脚本只能在 GitHub Actions 上跑
（.github/workflows/check-images.yml）。本地跑会全部报错，那是环境问题不是链接问题。

退出码：0 = 全部活着；1 = 有失效链接。
"""
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
REFERER = "https://jarixhew-bit.github.io/"
TIMEOUT = 20
RETRIES = 3          # 三次都失败才算坏，避免网络抖动造成误报
CONCURRENCY = 8

IMG_RE = re.compile(r'<img\b[^>]*\bsrc="(https://[^"]+)"', re.I)
MAP_RE = re.compile(r'href="(https://(?:www\.)?(?:maps|google\.[^"/]*/maps)[^"]+)"', re.I)


def extract(path: str) -> list:
    """回传 [(种类, url), ...]，去重。"""
    html = open(path, encoding="utf-8", errors="replace").read()
    found = []
    for url in IMG_RE.findall(html):
        found.append(("图片", url.replace("&amp;", "&")))
    for url in MAP_RE.findall(html):
        found.append(("地图", url.replace("&amp;", "&")))
    seen, out = set(), []
    for kind, url in found:
        if url not in seen:
            seen.add(url)
            out.append((kind, url))
    return out


def probe(url: str):
    """回传 (是否活着, 说明)。2xx/3xx 算活着。"""
    # 地图链接里常带中文店名（如 .../search/鶏Soba+座銀+総本店/），非 ASCII 字符
    # 直接丢进 urllib 会 UnicodeEncodeError，要先 percent-encode。
    safe = urllib.parse.quote(url, safe=":/?#[]@!$&'()*+,;=~-._%")
    last = ""
    for _ in range(RETRIES):
        req = urllib.request.Request(
            safe, headers={"User-Agent": UA, "Referer": REFERER})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                if 200 <= r.status < 400:
                    return True, str(r.status)
                last = str(r.status)
        except urllib.error.HTTPError as e:
            if 200 <= e.code < 400:
                return True, str(e.code)
            last = str(e.code)
        except Exception as e:                       # 超时、DNS、TLS 等
            last = type(e).__name__
    return False, last


def main():
    args = [a for a in sys.argv[1:] if a != "--all"]
    if "--all" in sys.argv[1:] or not args:
        out = subprocess.run(["git", "ls-files", "*.html"],
                             capture_output=True, text=True)
        files = out.stdout.split()
    else:
        files = args

    jobs = []
    for f in files:
        for kind, url in extract(f):
            jobs.append((f, kind, url))

    if not jobs:
        print("没有找到任何外链图片或地图链接")
        sys.exit(0)

    print(f"检查 {len(files)} 个页面里的 {len(jobs)} 个链接…\n")

    broken = []
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        results = pool.map(lambda j: probe(j[2]), jobs)
        for (f, kind, url), (ok, info) in zip(jobs, results):
            if not ok:
                broken.append((f, kind, url, info))

    if broken:
        print(f"不通过（{len(broken)} 个链接失效）：")
        for f, kind, url, info in broken:
            print(f"  ✗ [{info}] {f} 的{kind}：{url}")
        sys.exit(1)

    print(f"通过：{len(jobs)} 个链接全部正常")
    sys.exit(0)


if __name__ == "__main__":
    main()
