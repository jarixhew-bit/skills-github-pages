#!/usr/bin/env python3
"""同一张卡片里不准出现重复照片——**真查要在 CI 跑**（要下载 Google 照片）。

为什么要它（2026-11-05 用户回报）：「星耀樟宜雨漩涡灯光音乐秀 @ Jewel Changi Airport
1-2 号图重复了」。两张图的**网址完全不同**（一张 gps-cs-s、一张 grass-cs），画面却是
同一张照片——Google 会把同一张用户照片挂在好几个网址下。所以光比网址抓不到，
要把图下载下来比「长得像不像」。

做法：
  1. 范围＝tools/lib/trips.py 里还没走完的手册（走完的不查，跟体检、补图同一份日期表）。
  2. 每张卡（<div class="gal"> 里的 <img>）的每张图下载下来，算 64 位 dHash
     （缩成 9×8 灰阶、比较相邻像素明暗；只用 pillow，不另装难装的库）。
  3. 同一张卡里任两张图的汉明距离 ≤ THRESHOLD 就判重复，报出文件、卡片标题、第几张。
     同一张卡里「=」前面完全相同的网址，不必下载就直接判重复。

阈值怎么来的（2026-11-05 校准，样本是 Jewel 那张卡现有 5 张＋新抓 12 张候选，
共 17 张、136 对，用 photo-preview 缩图实算）：
  - 真重复：Jewel 第 1、2 张（用户回报的那对）距离 **0**；候选里另外 5 组「不同网址、
    同一张照片」也全部是 0（Google 同一张照片的不同网址，内容几乎逐像素一致）。
  - 同一处不同角度：雨漩涡白天 vs 晚上紫光 12、白天 vs 晚上金光 15、两张夜景之间 17，
    其余 18 以上。也就是「同一个地方、构图很像」最低也有 12。
  - 取 THRESHOLD = 6：真重复（0）与最像的不同照片（12）正中间，两边各留 6 位余量——
    同一张照片换个裁切/压缩率一般只差几位，不会到 6；不同照片要像到 6 以内，
    肉眼看也就是同一张了。CI 每次都会印出「没判重复但最接近的几对」，以后若有
    不同照片掉进 7~11 这一段，就是该重新校准的信号。

不误报的保护（下载失败**不算**重复，只记 warning）：
  - 下载要回 image/* 且不小于 1 KB；不是就当下载失败，不拿它算哈希。
  - 近乎纯色的图（标准差很小）不算哈希：纯色图的 dHash 全一样，会互相「撞」。
  - 同一份字节出现在 3 张以上不同卡片里，判定是 Google 回的占位图（被挡时常见），
    这些图一律不算。
  - 下载失败过半：判定是这台机器被 Google 挡了（同 refresh-photos 的罢工逻辑），
    整轮不下结论、退出 0 并印 ::warning::——宁可这一轮没查，也不能一下子红一大片。

用法：
    python3 tools/check-photo-dupes.py               # 查所有还没走完的手册（CI）
    python3 tools/check-photo-dupes.py a.html b.html # 只查指定档
    python3 tools/check-photo-dupes.py --ref <commit> # 查某个旧版本（证明修之前会红）
    python3 tools/check-photo-dupes.py --selftest    # 离线验 dHash 与判定（本机可跑）

退出码：0 = 没有重复（或被挡、不下结论）；1 = 有重复；2 = 环境问题（没装 pillow）。
"""
import hashlib
import io
import os
import re
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from itertools import combinations

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(REPO, "tools", "lib"))
import trips  # noqa: E402  哪几趟还没走完——正本在 tools/lib/trips.py

try:
    from PIL import Image, ImageStat
except ImportError:  # 不假装通过
    print("这支检查要 pillow（pip install pillow）。CI 会装；本机没有就跑不了。")
    sys.exit(2)

THRESHOLD = 6          # 依据见文件开头
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
REFERER = "https://jarixhew-bit.github.io/"
TIMEOUT = 25
RETRIES = 3
MIN_BYTES = 1024
FLAT_STDDEV = 4.0      # 灰阶标准差低于这个＝近乎纯色，不算哈希
PLACEHOLDER_CARDS = 3  # 同一份字节出现在这么多张不同卡片 → 当占位图

GAL_RE = re.compile(r'<div class="gal">(.*?)</div>', re.S)
IMG_RE = re.compile(r'<img\b[^>]*\bsrc="(https://[^"]+)"', re.I)
H3_RE = re.compile(r"<h[34]\b[^>]*>(.*?)</h[34]>", re.S)   # 卡片标题：新加坡本用 h3、雅加达本用 h4
CN_RE = re.compile(r'<span class="cn">(.*?)</span>', re.S)
TAG_RE = re.compile(r"<[^>]+>")


# ---------- 哈希 ----------

def dhash(im) -> int:
    """64 位 dHash：缩成 9×8 灰阶，每行相邻两格比明暗。"""
    g = im.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(g.tobytes())
    bits = 0
    for r in range(8):
        for c in range(8):
            bits = (bits << 1) | (px[r * 9 + c] > px[r * 9 + c + 1])
    return bits


def dist(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


def is_flat(im) -> bool:
    return ImageStat.Stat(im.convert("L")).stddev[0] < FLAT_STDDEV


def base(url: str) -> str:
    return url.split("=")[0]


# ---------- 解析页面 ----------

def cards_of(html: str):
    """回传 [(卡片标题, [img 网址...]), ...]，只收有两张以上图的卡。"""
    out = []
    for m in GAL_RE.finditer(html):
        urls = IMG_RE.findall(m.group(1))
        if len(urls) < 2:
            continue
        h3s = list(H3_RE.finditer(html, 0, m.start()))
        title = "（找不到标题）"
        if h3s:
            raw = h3s[-1].group(1)
            cn = CN_RE.search(raw)
            title = TAG_RE.sub("", cn.group(1) if cn else raw).strip()
        out.append((title, urls))
    return out


def read_html(path: str, ref: str = None) -> str:
    if ref:
        return subprocess.run(["git", "show", f"{ref}:{path}"], cwd=REPO,
                              capture_output=True, text=True, check=True).stdout
    with open(os.path.join(REPO, path), encoding="utf-8") as fh:
        return fh.read()


# ---------- 下载 ----------

def download(url: str):
    """回传 (bytes, None) 或 (None, 失败原因)。"""
    why = ""
    for _ in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": REFERER})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                ctype = r.headers.get("Content-Type", "")
                raw = r.read()
            if not ctype.startswith("image/"):
                why = f"不是图片（{ctype or '无类型'}）"
                continue
            if len(raw) < MIN_BYTES:
                why = f"只有 {len(raw)} 字节"
                continue
            return raw, None
        except Exception as e:  # noqa: BLE001  网络错误一律当失败、重试
            why = f"{type(e).__name__}: {str(e)[:80]}"
    return None, why


# ---------- 判定（纯函数，selftest 也走这里） ----------

def judge(cards, info):
    """cards: [(档名, 标题, [url...])]；info: url → {"hash": int|None, "sha": str|None}。
    回传 (重复列表, 没判重复的每一对距离)。重复列表元素：(档名, 标题, i, j, 距离或'同网址')。"""
    # 占位图：同一份字节出现在很多张不同卡片里
    sha_cards = {}
    for f, t, urls in cards:
        for u in urls:
            s = info.get(u, {}).get("sha")
            if s:
                sha_cards.setdefault(s, set()).add((f, t))
    placeholder = {s for s, cs in sha_cards.items() if len(cs) >= PLACEHOLDER_CARDS}

    dupes, near = [], []
    for f, t, urls in cards:
        for (i, a), (j, b) in combinations(enumerate(urls, 1), 2):
            if base(a) == base(b):
                dupes.append((f, t, i, j, "同网址"))
                continue
            ia, ib = info.get(a, {}), info.get(b, {})
            if ia.get("sha") in placeholder or ib.get("sha") in placeholder:
                continue
            ha, hb = ia.get("hash"), ib.get("hash")
            if ha is None or hb is None:
                continue
            d = dist(ha, hb)
            if d <= THRESHOLD:
                dupes.append((f, t, i, j, d))
            else:
                near.append((d, f, t, i, j))
    return dupes, sorted(near), placeholder


# ---------- 主流程 ----------

def pages(argv):
    if argv:
        return argv
    live, _ = trips.split(sorted(trips.TRIPS))
    return [p for p in live if os.path.exists(os.path.join(REPO, p))]


def main(argv) -> int:
    ref = None
    if "--ref" in argv:
        k = argv.index("--ref")
        ref = argv[k + 1]
        argv = argv[:k] + argv[k + 2:]
    files = pages(argv)
    cards = []
    for f in files:
        for title, urls in cards_of(read_html(f, ref)):
            cards.append((f, title, urls))
    urls = sorted({u for _, _, us in cards for u in us})
    print(f"查 {len(files)} 本手册{'（版本 ' + ref + '）' if ref else ''}、"
          f"{len(cards)} 张多图卡片、{len(urls)} 张图；阈值 dHash ≤ {THRESHOLD}")

    info, fails = {}, []
    with ThreadPoolExecutor(12) as ex:
        for u, (raw, why) in zip(urls, ex.map(download, urls)):
            if raw is None:
                fails.append((u, why))
                info[u] = {}
                continue
            try:
                im = Image.open(io.BytesIO(raw))
                im.load()
            except Exception as e:  # noqa: BLE001
                fails.append((u, f"打不开：{e}"))
                info[u] = {}
                continue
            sha = hashlib.sha256(raw).hexdigest()
            info[u] = {"sha": sha, "hash": None if is_flat(im) else dhash(im)}

    for u, why in fails:
        print(f"::warning::下载失败（不算重复）：{why}  {u[:90]}")
    if urls and len(fails) * 2 > len(urls):
        print(f"::warning::{len(fails)}/{len(urls)} 张下载失败，过半——判定是这台机器被 Google "
              "挡了，这一轮不下结论（不报红，也不当作已查过）。")
        return 0

    dupes, near, placeholder = judge(cards, info)
    if placeholder:
        print(f"::warning::有 {len(placeholder)} 份图片字节同时出现在 {PLACEHOLDER_CARDS} 张以上"
              "卡片里，当作 Google 占位图跳过")
    print("没判重复、但最接近的几对（校准用；不同照片落进 7~11 就该重看阈值）：")
    for d, f, t, i, j in near[:8]:
        print(f"  {d:>2}  {f} 「{t}」 第 {i} 与第 {j} 张")
    if not dupes:
        print("通过：没有卡片里有重复照片")
        return 0
    print(f"\n✗ 发现 {len(dupes)} 对重复照片（网址不同也可能是同一张图，要换掉其中一张）：")
    for f, t, i, j, d in dupes:
        print(f"  {f} 「{t}」 第 {i} 张与第 {j} 张重复（距离 {d}）")
    return 1


# ---------- 离线自检 ----------

def selftest() -> int:
    """用 pillow 自己画图验：同一张图换尺寸/压缩率 → 判重复；不同的图 → 不判；
    占位图、纯色图、下载失败都不会被当成重复。"""
    from PIL import ImageDraw, ImageFilter
    bad = []

    def scene(seed):
        im = Image.new("RGB", (800, 600), (30, 60, 90))
        d = ImageDraw.Draw(im)
        import random
        rnd = random.Random(seed)
        for _ in range(40):
            x, y = rnd.randrange(800), rnd.randrange(600)
            r = rnd.randrange(20, 160)
            d.ellipse([x - r, y - r, x + r, y + r],
                      fill=(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)))
        return im.filter(ImageFilter.GaussianBlur(3))

    def recompress(im, size, q):
        buf = io.BytesIO()
        im.resize(size, Image.LANCZOS).save(buf, "JPEG", quality=q)
        return Image.open(io.BytesIO(buf.getvalue()))

    a, b = scene(1), scene(2)
    h_a = dhash(a)
    h_a2 = dhash(recompress(a, (500, 375), 60))   # 同一张：缩小＋重压缩（Google 不同网址的样子）
    h_b = dhash(b)
    if dist(h_a, h_a2) > THRESHOLD:
        bad.append(f"同一张图换尺寸压缩后距离 {dist(h_a, h_a2)}，超过阈值 {THRESHOLD}")
    if dist(h_a, h_b) <= THRESHOLD:
        bad.append(f"两张不同的图距离只有 {dist(h_a, h_b)}，会被误判重复")
    if not is_flat(Image.new("RGB", (100, 100), (200, 200, 200))):
        bad.append("纯色图没被认出来")

    cards = [
        ("x.html", "卡A", ["https://g/a1=s1", "https://g/a2=s1", "https://g/b=s1"]),  # a1/a2 同图
        ("x.html", "卡B", ["https://g/c=s1", "https://g/c=s2"]),                      # 同网址
        ("x.html", "卡C", ["https://g/p1", "https://g/fail"]),                        # 失败不算
        ("x.html", "卡D", ["https://g/p2", "https://g/b2"]),
        ("x.html", "卡E", ["https://g/p3", "https://g/a3"]),
        ("x.html", "卡F", ["https://g/p4", "https://g/p5"]),                          # 两张都是占位图
    ]
    info = {
        "https://g/a1=s1": {"sha": "1", "hash": h_a}, "https://g/a2=s1": {"sha": "2", "hash": h_a2},
        "https://g/b=s1": {"sha": "3", "hash": h_b}, "https://g/c=s1": {"sha": "4", "hash": h_b},
        "https://g/c=s2": {"sha": "5", "hash": h_a}, "https://g/fail": {},
        "https://g/b2": {"sha": "6", "hash": h_b}, "https://g/a3": {"sha": "7", "hash": h_a},
    }
    for k in ("p1", "p2", "p3", "p4", "p5"):
        info[f"https://g/{k}"] = {"sha": "PH", "hash": h_a}
    dupes, _, ph = judge(cards, info)
    got = {(t, i, j) for _, t, i, j, _ in dupes}
    want = {("卡A", 1, 2), ("卡B", 1, 2)}
    if got != want:
        bad.append(f"判定结果 {sorted(got)}，应为 {sorted(want)}")
    if ph != {"PH"}:
        bad.append("占位图没被认出来")

    if bad:
        print("✗ selftest 失败：")
        for b_ in bad:
            print("  -", b_)
        return 1
    print(f"selftest 通过（同图距离 {dist(h_a, h_a2)}、异图距离 {dist(h_a, h_b)}、阈值 {THRESHOLD}）")
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    sys.exit(selftest() if "--selftest" in args else main(args))
