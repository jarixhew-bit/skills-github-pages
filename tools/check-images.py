#!/usr/bin/env python3
"""图片与地图链接体检器 —— 检查页面里的外链图片是不是还活着。

背景：本仓库的手册一律用 Google Places 图片外链、不上传图片进仓库
（CLAUDE.md 媒体文件规则）。外链的坏处是**会悄悄失效**——页面还在、
网址还通，只有打开的人看到一个破图，而发手册的人永远不会知道。
本脚本就是为了让失效被自动发现，不必等家人来说「图片打不开」。

检查项：
1. <img src="https://..."> 的图片链接
2. href="https://maps..." 的地图链接（CLAUDE.md 要求推荐地点必附地图链接）
3. 店家官网／订位页外链（tabelog、餐厅自家网站）——官网 404 通常等于**店歇业**，
   是「该换这张卡片了」的早期警报。为免噪音，官网只有 404/410/451 或域名查无此站
   才算失效，403／超时归入「存疑」不报错（见 DEAD_CODES 注释）。

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
CONCURRENCY = 12     # 2026-08-11 扩到店家官网后链接数从 ~700 涨到 ~810

IMG_RE = re.compile(r'<img\b[^>]*\bsrc="(https://[^"]+)"', re.I)
MAP_RE = re.compile(r'href="(https://(?:www\.)?(?:maps|google\.[^"/]*/maps)[^"]+)"', re.I)
HREF_RE = re.compile(r'href="(https://[^"]+)"', re.I)

# 自家网址与社交平台不算「店家官网」：前者失效是我们自己的事（由烟雾测试管），
# 后者常挡机器人、查了也只会制造噪音。
SKIP_HOSTS = ("jarixhew-bit.github.io", "github.com", "instagram.com",
              "facebook.com", "twitter.com", "x.com", "youtube.com")

# 官网检查的判定门槛：只有这些状态码算「店真的没了」。
# 403/429/5xx/超时多半是对方挡 CI 机房 IP 或临时故障，从家里点是好的——
# 把这些算成失效会让每周警报长期红着，红到没人看，等于没做这个检查。
DEAD_CODES = {"404", "410", "451"}
DEAD_ERRORS = {"URLError", "gaierror"}   # DNS 查无此站 = 域名都没了


def extract(path: str) -> list:
    """回传 [(种类, url), ...]，去重。"""
    html = open(path, encoding="utf-8", errors="replace").read()
    found = []
    for url in IMG_RE.findall(html):
        found.append(("图片", url.replace("&amp;", "&")))
    maps = set()
    for url in MAP_RE.findall(html):
        clean = url.replace("&amp;", "&")
        maps.add(clean)
        found.append(("地图", clean))
    # 店家官网／订位页（tabelog、餐厅自家网站）。官网 404 通常就等于店歇业，
    # 是「该换这张卡片了」的早期警报——手册发出去后没人会主动发现这件事。
    for url in HREF_RE.findall(html):
        clean = url.replace("&amp;", "&")
        if clean in maps:
            continue
        host = urllib.parse.urlparse(clean).netloc.lower()
        if any(h in host for h in SKIP_HOSTS):
            continue
        found.append(("官网", clean))
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

    broken, unknown = [], []
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        results = pool.map(lambda j: probe(j[2]), jobs)
        for (f, kind, url), (ok, info) in zip(jobs, results):
            if ok:
                continue
            # 官网只有「确定没了」才算失效，其余归入存疑（见 DEAD_CODES 注释）
            if kind == "官网" and info not in DEAD_CODES and info not in DEAD_ERRORS:
                unknown.append((f, url, info))
            else:
                broken.append((f, kind, url, info))

    if unknown:
        print(f"存疑（不算失效）：{len(unknown)} 个店家官网没能确认，"
              "多半是对方挡 CI 机房 IP 或临时故障，从家用网络点通常是好的。")
        for f, url, info in unknown[:5]:
            print(f"    ? [{info}] {f}：{url[:100]}")
        if len(unknown) > 5:
            print(f"    …另有 {len(unknown) - 5} 个未列出")
        print()

    if not broken:
        print(f"通过：{len(jobs)} 个链接里没有确定失效的")
        sys.exit(0)

    # 失败多的时候，逐条列清单会刷屏且把统计埋掉。改为先分组统计、每组只列样本，
    # 摘要放最后（CI 日志与 issue 都是从尾部看起）。
    by_file, by_code = {}, {}
    for f, kind, url, info in broken:
        by_file.setdefault(f, []).append((kind, url, info))
        by_code[info] = by_code.get(info, 0) + 1

    print("失效样本（每个页面最多列 3 条）：")
    for f in sorted(by_file, key=lambda x: -len(by_file[x])):
        items = by_file[f]
        print(f"\n  {f} —— {len(items)} 个失效")
        for kind, url, info in items[:3]:
            print(f"    ✗ [{info}] {kind}：{url[:110]}")
        if len(items) > 3:
            print(f"    …另有 {len(items) - 3} 个未列出")

    print("\n" + "=" * 60)
    print(f"不通过：{len(jobs)} 个链接里有 {len(broken)} 个失效")
    print("\n按页面：")
    for f in sorted(by_file, key=lambda x: -len(by_file[x])):
        total_in_file = sum(1 for j in jobs if j[0] == f)
        print(f"  {f}: {len(by_file[f])}/{total_in_file}")
    print("\n按状态码：")
    for code in sorted(by_code, key=lambda c: -by_code[c]):
        print(f"  {code}: {by_code[code]} 个")

    # 403 的成因有两种，处理方式完全不同，必须让人能分辨：
    # (a) Google Places 图片链接带签名、会过期 → 真失效，要重抓；
    # (b) Google 挡 CI 机房 IP → 误报，用户从家用网络看是好的。
    # 脚本分不出来，所以只提示、不替人下结论。
    if "403" in by_code:
        print(f"\n注意：有 {by_code['403']} 个 403。403 有两种可能——"
              "Google Places 图片签名过期（真失效，要重抓），"
              "或 Google 挡住 CI 机房 IP（误报，从家用网络看是好的）。"
              "\n分辨方法：在浏览器打开该页面看图片是否真的破了。")
    sys.exit(1)


if __name__ == "__main__":
    main()
