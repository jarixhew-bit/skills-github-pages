#!/usr/bin/env python3
"""网页读取通道 —— 只能在 GitHub Actions 上跑。

为什么要它（2026-08-29）：沙盒的出口代理挡掉了绝大多数外站
（gardensbythebay.com.sg、stb.gov.sg、changiairport.com、jetquay.com.sg、
milelion、tripadvisor、wikipedia… WebFetch 一律回 EGRESS_BLOCKED，curl 直连 403）。
一天之内两次因此卡住：查樟宜 JetQuay 贵宾通道流程、查手册里限时活动的官方档期，
两次都只能靠搜索引擎的 AI 摘要交叉印证，读不到官方原文——而手册是七个人照着走的东西，
「摘要说」和「官网写」的差别，就是行程写错与写对的差别。

按 CLAUDE.md「沙盒连不上的外部服务，先想 CI 通道」，把读网页搬到 runner 上跑
（runner 出得去，play-lookup.py、fetch-photos 都是这个路子）。

它做什么：把每个网址抓回来、去掉标签与脚本、压平空白，然后
  - 有给关键字：只印含关键字的那几行（前后各带一行上下文），这是常态用法；
  - 没给关键字：印正文前 3000 字。
结果直接印在 job 日志里，Claude 用 get_job_logs 读回，不落档也不 commit。

跑法（Actions 页面 Run workflow，或 Claude 触发 web-lookup.yml）：
    python3 tools/web-lookup.py "网址1|网址2" "关键字1,关键字2"
"""
import html
import re
import sys
import urllib.error
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0 Safari/537.36")
TIMEOUT = 30
MAX_CHARS = 3000        # 没给关键字时印多少正文
CONTEXT = 1             # 命中行前后各带几行

# 整段丢掉的元素：里面全是代码与样式，混进正文只会把真正的内容挤掉
DROP = re.compile(r"<(script|style|noscript|svg)\b.*?</\1>", re.S | re.I)
TAG = re.compile(r"<[^>]+>")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        raw = r.read()
        enc = r.headers.get_content_charset() or "utf-8"
    return raw.decode(enc, errors="replace")


def to_text(doc: str) -> list:
    doc = DROP.sub(" ", doc)
    # 区块级标签换成换行，否则整页会压成一行、关键字上下文就没意义了
    doc = re.sub(r"</(p|div|li|tr|h[1-6]|section|article|br)\s*>", "\n", doc, flags=re.I)
    doc = TAG.sub(" ", doc)
    doc = html.unescape(doc)
    lines = [re.sub(r"[ \t ]+", " ", l).strip() for l in doc.splitlines()]
    return [l for l in lines if l]


def main() -> int:
    if len(sys.argv) < 2:
        print("用法：web-lookup.py '网址1|网址2' ['关键字1,关键字2']")
        return 2
    urls = [u.strip() for u in sys.argv[1].split("|") if u.strip()]
    keys = [k.strip().lower() for k in (sys.argv[2] if len(sys.argv) > 2 else "").split(",") if k.strip()]

    for url in urls:
        print("=" * 70)
        print("URL:", url)
        try:
            lines = to_text(fetch(url))
        except urllib.error.HTTPError as e:
            print(f"  ✗ HTTP {e.code}")
            continue
        except Exception as e:                     # 超时、DNS、TLS
            print(f"  ✗ {type(e).__name__}: {str(e)[:120]}")
            continue

        if not keys:
            body = "\n".join(lines)
            print(body[:MAX_CHARS])
            if len(body) > MAX_CHARS:
                print(f"  …（正文共 {len(body)} 字，只印前 {MAX_CHARS} 字）")
            continue

        hits = [i for i, l in enumerate(lines) if any(k in l.lower() for k in keys)]
        if not hits:
            print(f"  （{len(lines)} 行正文里没有任何关键字命中）")
            continue
        shown = set()
        for i in hits:
            for j in range(max(0, i - CONTEXT), min(len(lines), i + CONTEXT + 1)):
                if j not in shown:
                    shown.add(j)
                    print(f"  {j:5d}| {lines[j][:300]}")
        print(f"  （命中 {len(hits)} 行 / 正文 {len(lines)} 行）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
