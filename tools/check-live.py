#!/usr/bin/env python3
"""上线烟雾测试 —— 确认线上的页面真的是 main 里的那一版。

背景：CI 全绿只代表「代码进了 main」，不代表「线上换成了新版」。
2026-07 就发生过 GitHub 故障期间 Pages 部署事件被整个丢掉：代码在 main、
检查全绿、线上还是旧版，最后是用户自己发现的（见 .claude/rules/diagnosis.md）。
而 Claude 的沙盒连不上 github.io（代理策略性 403），验不了这件事——
所以这个检查只能住在 CI 上。

三层判定，一层比一层严：
1. HTTP 200        —— 页面还在，网址没坏
2. <title> 对得上  —— 送出来的是这个页面，不是 404 页或别人的页面
3. 内容与 main 一致 —— 部署没有卡住、线上不是旧版（唯一能抓到「部署被吞」的一层）

第 3 层遇到不一致会等 90 秒重试一次：刚推完代码时部署本来就还没跑完，
不等就会天天误报，而误报会让人开始忽略警报，等于白做这个检查。

用法：
    python3 tools/check-live.py              # 检查全部已部署页面
    python3 tools/check-live.py 某页面.html   # 只检查指定页面

退出码：0 = 全部正常；1 = 有页面没上线或线上是旧版。
"""
import html as htmllib
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = "https://jarixhew-bit.github.io/skills-github-pages/"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
TIMEOUT = 30
RETRY_WAIT = 90        # 部署还没跑完时的宽限时间
TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)


def local_pages():
    out = subprocess.run(["git", "ls-files", "*.html"],
                         capture_output=True, text=True)
    return out.stdout.split()


def title_of(text: str) -> str:
    m = TITLE_RE.search(text)
    return htmllib.unescape(m.group(1)).strip() if m else ""


def fetch(url: str):
    """回传 (状态码或错误名, 内容字串)。"""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, r.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return type(e).__name__, ""


def normalize(s: str) -> str:
    """比对前抹掉无意义差异（行尾、首尾空白）。"""
    return s.replace("\r\n", "\n").strip()


def check(path: str, allow_retry: bool = True):
    """回传 (path, 结果, 说明)。结果为 ok / stale / bad。"""
    url = BASE + path
    local = normalize(open(path, encoding="utf-8", errors="replace").read())
    status, body = fetch(url)

    if status != 200:
        return path, "bad", f"HTTP {status}"

    want_title = title_of(local)
    got_title = title_of(body)
    if want_title and want_title != got_title:
        return path, "bad", f"标题对不上：线上是「{got_title[:40]}」，应该是「{want_title[:40]}」"

    if normalize(body) != local:
        if allow_retry:
            # 刚推完代码时部署本来就还没跑完，等一轮再判，避免天天误报
            time.sleep(RETRY_WAIT)
            return check(path, allow_retry=False)
        delta = len(normalize(body)) - len(local)
        return path, "stale", f"内容与 main 不一致（线上少/多 {delta:+d} 字元），部署可能没跑完或被吞掉"

    return path, "ok", "200，内容与 main 一致"


def main():
    pages = sys.argv[1:] or local_pages()
    if not pages:
        print("没有找到任何页面")
        sys.exit(0)

    print(f"检查 {len(pages)} 个线上页面…\n")
    # 并发数压低：同时打太多请求容易被当成异常流量，反而制造误报
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(check, pages))

    ok = [r for r in results if r[1] == "ok"]
    bad = [r for r in results if r[1] == "bad"]
    stale = [r for r in results if r[1] == "stale"]

    for path, kind, info in results:
        mark = {"ok": "✓", "stale": "!", "bad": "✗"}[kind]
        print(f"  {mark} {path} —— {info}")

    print("\n" + "=" * 60)
    if not bad and not stale:
        print(f"通过：{len(ok)} 个页面全部正常上线，内容与 main 一致")
        sys.exit(0)

    print(f"不通过：{len(bad)} 个打不开、{len(stale)} 个是旧版（共 {len(pages)} 个）")
    if stale:
        print("\n线上是旧版通常代表 Pages 部署事件被吞掉了。"
              "重跑别的 workflow 不会补触发部署，"
              "要到 Actions 页面手动重跑 pages-build-deployment："
              "\n  https://github.com/jarixhew-bit/skills-github-pages/actions")
    sys.exit(1)


if __name__ == "__main__":
    main()
