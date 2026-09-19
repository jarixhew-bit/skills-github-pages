#!/usr/bin/env python3
"""把「菜单照」从候选里挑出来——用 OCR 数字，不靠人眼。**只能在 CI 跑**（要下载图片）。

为什么要有它（2026-09-19 用户要求）：「图片我要求店＋食物的，不要出现菜单的，
你能做到吗？还是需要我又手动」。

前一步（抓图器改从 Google 的「Food & drink」分类取图）已经砍掉大部分菜单照，
但它挡不住两种情况：① 商场、庙、电玩城这类地点根本没有那个分类页签；
② Google 自己把菜单照归进了食物分类。所以再加一道**看图**的关卡。

Claude 看不到这些图：沙盒连不上 lh3.googleusercontent.com，本机也没有能读图的工具。
但「是不是菜单」不需要审美，只需要认字——菜单的特征是**满屏文字＋一排价格**，
食物与店面照几乎没有字（店招顶多几个）。OCR 数得出来，所以交给 CI 数。

判定（两条任一命中就算菜单照）：
  - 认出的字数 ≥ WORDS_MAX
  - 认出的价格样式 ≥ PRICES_MAX（RM12、$8.50、12.00 这类）
命中的照片**不是删掉，而是排到最后**：抓不到别的图时，有菜单总比开天窗好，
由后面「候选不够就整家不动」那条规则去兜。

用法：
    python3 tools/photo-filter.py .photos/latest.txt            # 就地重排
    python3 tools/photo-filter.py .photos/latest.txt --measure  # 只量不改（校准用）
退出码 0 = 跑完；1 = 参数错或 OCR 不可用。
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
TIMEOUT = 25

# 阈值：2026-09-19 在 CI 上量过真实候选图后定的（见 PR 里的分布表）。
# 宁可放过一两张、也不要误杀好图——误杀的代价是好照片被排到最后，
# 而放过的代价只是用户看到一张菜单、报一句编号换掉。
WORDS_MAX = 18       # 认出 18 个字以上 ≈ 满屏文字
PRICES_MAX = 3       # 三个以上价格样式 ≈ 一排菜价

PRICE = re.compile(r"(?:RM|MYR|SGD|S\$|\$|¥|￥)\s?\d{1,4}(?:[.,]\d{1,2})?"
                   r"|\b\d{1,3}[.,]\d{2}\b")
WORD = re.compile(r"[A-Za-z一-鿿]{2,}")


def ocr(url: str) -> tuple:
    """回传 (字数, 价格数, 前 80 字文字)。下载或 OCR 失败一律当「没字」。"""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = r.read()
    except Exception as e:                       # 下载失败不该让整轮停掉
        return 0, 0, f"(下载失败 {type(e).__name__})"
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        f.write(data)
        path = f.name
    try:
        out = subprocess.run(["tesseract", path, "stdout", "-l", "eng+chi_sim"],
                             capture_output=True, text=True, timeout=60)
        text = out.stdout
    except FileNotFoundError:
        print("✗ 找不到 tesseract——这支脚本只能在装了 OCR 的机器（CI）上跑")
        sys.exit(1)
    except Exception:
        text = ""
    finally:
        os.unlink(path)
    words = WORD.findall(text)
    prices = PRICE.findall(text)
    flat = re.sub(r"\s+", " ", text).strip()
    return len(words), len(prices), flat[:80]


def is_menu(words: int, prices: int) -> bool:
    return words >= WORDS_MAX or prices >= PRICES_MAX


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    measure = "--measure" in sys.argv[1:]
    path = args[0] if args else ".photos/latest.txt"
    if not os.path.exists(path):
        print(f"找不到 {path}")
        return 1

    lines = open(path, encoding="utf-8").read().splitlines()
    out_lines, moved_total, seen_total = [], 0, 0
    for line in lines:
        if not line.startswith("RESULT "):
            out_lines.append(line)
            continue
        j = json.loads(line[7:])
        urls = j.get("urls", [])
        good, menuish = [], []
        print(f"\n— {(j.get('title') or j.get('query'))[:40]}（{len(urls)} 张，"
              f"分类：{j.get('cat') or '全部'}）")
        for i, u in enumerate(urls, 1):
            w, p, snippet = ocr(u)
            seen_total += 1
            flag = is_menu(w, p)
            print(f"   {i}. 字 {w:3d} 价 {p:2d} {'← 判为菜单' if flag else ''}  {snippet}")
            (menuish if flag else good).append(u)
        if menuish and not measure:
            moved_total += len(menuish)
            j["urls"] = good + menuish          # 不删，只排到最后
            j["menuish"] = len(menuish)
            line = "RESULT " + json.dumps(j, ensure_ascii=False)
        out_lines.append(line)

    if measure:
        print(f"\n（只量不改）共看了 {seen_total} 张")
        return 0
    open(path, "w", encoding="utf-8").write("\n".join(out_lines) + "\n")
    print(f"\n共看了 {seen_total} 张，其中 {moved_total} 张判为菜单照、已排到各自最后。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
