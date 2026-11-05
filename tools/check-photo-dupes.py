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

第二级「近似」（2026-11-05 加，用户第二次抓到同类问题）：
  用户回报「乐城海南鸡饭 1、2 号图其实也是很接近、差不多一样的」。那两张**不是同一张
  照片**：同一个店面、几乎同一个站位、隔一会儿各拍一张（桌面盖布不同、一张横一张竖、
  竖的那张拉近了）。dHash 实测距离 23（沙盒缩图；CI 原图见 PR 记录）——比 Jewel 白天
  vs 晚上（12）还远，调 dHash 阈值永远抓不到它，调到能抓就会把整本手册的不同照片全报红。
  dHash 比的是「整张图的明暗布局」，构图一裁切、一横一竖就全变了；人眼看的却是
  「画面里是不是同一批东西」。所以第二级换一种比法：
  - ORB 特征点（OpenCV）＋ RANSAC 单应矩阵，数「两张图里有多少个点能用同一个透视变换
    对上」（inliers）。同一个招牌、同一面玻璃从差不多的位置拍，几十个点对得上；
    不同东西、或同一处但换了大角度／换了光线，只有零星几个（随机误配）。
  - 沙盒用乐城 16 张缩图实测：旧 1、2 张 56 个；其余不同照片两两最高 8 个（多数 0~6）；
    同一家店另一个角度的门面（远景、带客人）跟旧 1 号 0 个。
  - 阈值 NEAR_INLIERS = 25：落在 8 与 56 的中间偏低（宁可多抓一点近似）。三本还没走完的
    手册全部卡片在 CI 上的实测分布写在下一段。
  - CI 实测（2026-11-05，PR #761，3 本手册 59 张多图卡、265 张图、0 张下载失败，原图）：
    修之前那版：乐城旧 1、2 张 **46** 个、dHash 23 → 第二级报红，第一级照旧没抓到。
    其余全部卡片两两最高：Jewel 第 1 与第 4 张 18（同一个雨漩涡、换了角度和光线——这正是
    「同一处不同角度」该放过的那种），潮乐轩第 1、2 张 12，观音庙 10，其余 ≤8。
    25 落在 18 与 46 之间，两边都有余量；以后不同照片爬到 20 以上就该重看阈值。
  - **报红，不是只报 warning**：PR 上的 warning 没人会点进去看，周检也只在退出码 1 时
    开 issue；用户已经两次自己看出这种问题，再让它只当 warning 等于没修。真要在同一张
    卡放两张近似的图（例如刻意前后对比），把那一对加进 NEAR_ALLOW 并写原因。
  - 要 opencv-python-headless；没装时第二级整个跳过并印 warning（本机 check-all 只跑
    --selftest，CI 会装），**不假装通过**也不报红。

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
NEAR_INLIERS = 25      # 第二级「近似」：ORB＋RANSAC 对得上的点数 ≥ 这个就报红（依据见文件开头）
ORB_SIDE = 480         # 算特征点前把长边缩到这么大，跟校准时一致（点数随尺寸变）
# 刻意放在同一张卡、允许近似的图对：{(网址「=」前面, 网址「=」前面): "原因"}
NEAR_ALLOW = {}
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


try:  # 第二级要 OpenCV；没有就跳过第二级（main 里印 warning），第一级照查
    import cv2
    import numpy as np
except ImportError:
    cv2 = None


def orb_feats(im):
    """回传 (点坐标 ndarray, 描述子) 或 None（点太少）。"""
    g = im.convert("L")
    k = ORB_SIDE / max(g.size)
    g = g.resize((max(1, round(g.width * k)), max(1, round(g.height * k))), Image.LANCZOS)
    kps, des = cv2.ORB_create(nfeatures=1000).detectAndCompute(np.asarray(g), None)
    if des is None or len(kps) < 8:
        return None
    return np.float32([p.pt for p in kps]), des


def inliers(fa, fb) -> int:
    """两张图之间能用同一个透视变换对上的特征点数（Lowe 比值筛＋RANSAC）。"""
    if fa is None or fb is None:
        return 0
    ms = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(fa[1], fb[1], k=2)
    good = [m[0] for m in ms if len(m) == 2 and m[0].distance < 0.75 * m[1].distance]
    if len(good) < 8:
        return 0
    pa = np.float32([fa[0][g.queryIdx] for g in good])
    pb = np.float32([fb[0][g.trainIdx] for g in good])
    _, mask = cv2.findHomography(pa, pb, cv2.RANSAC, 5.0)
    return int(mask.sum()) if mask is not None else 0


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

def judge(cards, info, near_score=None):
    """cards: [(档名, 标题, [url...])]；info: url → {"hash": int|None, "sha": str|None}。
    near_score(url_a, url_b) → 第二级的对得上点数（None＝没有第二级）。
    回传 (重复列表, 没判重复的每一对距离, 占位图, 每一对的第二级分数)。
    重复列表元素：(档名, 标题, i, j, 说明)。"""
    # 占位图：同一份字节出现在很多张不同卡片里
    sha_cards = {}
    for f, t, urls in cards:
        for u in urls:
            s = info.get(u, {}).get("sha")
            if s:
                sha_cards.setdefault(s, set()).add((f, t))
    placeholder = {s for s, cs in sha_cards.items() if len(cs) >= PLACEHOLDER_CARDS}

    dupes, near, scores = [], [], []
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
                continue
            near.append((d, f, t, i, j))
            if near_score is None:
                continue
            n = near_score(a, b)
            scores.append((n, f, t, i, j))
            if n >= NEAR_INLIERS and (base(a), base(b)) not in NEAR_ALLOW \
                    and (base(b), base(a)) not in NEAR_ALLOW:
                dupes.append((f, t, i, j, f"近似：{n} 个特征点对得上，dHash {d}"))
    return dupes, sorted(near), placeholder, sorted(scores, reverse=True)


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
            flat = is_flat(im)
            info[u] = {"sha": sha, "hash": None if flat else dhash(im),
                       "orb": orb_feats(im) if cv2 is not None and not flat else None}

    for u, why in fails:
        print(f"::warning::下载失败（不算重复）：{why}  {u[:90]}")
    if urls and len(fails) * 2 > len(urls):
        print(f"::warning::{len(fails)}/{len(urls)} 张下载失败，过半——判定是这台机器被 Google "
              "挡了，这一轮不下结论（不报红，也不当作已查过）。")
        return 0

    if cv2 is None:
        print("::warning::没装 opencv-python-headless，第二级「近似」这一轮没查（只查了同一张图）")
        near_score = None
    else:
        def near_score(a, b):
            return inliers(info[a].get("orb"), info[b].get("orb"))
    dupes, near, placeholder, scores = judge(cards, info, near_score)
    if placeholder:
        print(f"::warning::有 {len(placeholder)} 份图片字节同时出现在 {PLACEHOLDER_CARDS} 张以上"
              "卡片里，当作 Google 占位图跳过")
    print("没判重复、但最接近的几对（校准用；不同照片落进 7~11 就该重看阈值）：")
    for d, f, t, i, j in near[:8]:
        print(f"  {d:>2}  {f} 「{t}」 第 {i} 与第 {j} 张")
    if scores:
        print(f"第二级：特征点对得上最多的几对（≥ {NEAR_INLIERS} 报红；不同照片爬到 20 以上就该重看阈值）：")
        for n, f, t, i, j in scores[:12]:
            print(f"  {n:>4}  {f} 「{t}」 第 {i} 与第 {j} 张")
    if not dupes:
        print("通过：没有卡片里有重复照片")
        return 0
    print(f"\n✗ 发现 {len(dupes)} 对重复或近似照片（网址不同也可能是同一张图；"
          "「近似」是同一处、几乎同一个角度各拍一张——读者看来一样，要换掉其中一张）：")
    for f, t, i, j, d in dupes:
        print(f"  {f} 「{t}」 第 {i} 张与第 {j} 张（{d if isinstance(d, str) else '距离 %d' % d}）")
    return 1


# ---------- 离线自检 ----------

# 乐城海南鸡饭旧第 1、2 张（门面横幅 vs 同一站位的直幅，2026-11-05 用户回报）。
# dhash：photo-preview 缩图实算（CI 下载原图算出的距离同样是 23）；
# inliers：CI 原图实测 46；other_max：CI 上三本手册其余所有图对的最高分（Jewel 1 vs 4）。
# 都是抄下来的数字，不下载。
LECHENG = {"dhash": (0x41033eec9e366afb, 0x18007fe6bf6fe683), "inliers": 46, "other_max": 18}


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
    dupes, _, ph, _ = judge(cards, info)
    got = {(t, i, j) for _, t, i, j, _ in dupes}
    want = {("卡A", 1, 2), ("卡B", 1, 2)}
    if got != want:
        bad.append(f"判定结果 {sorted(got)}，应为 {sorted(want)}")
    if ph != {"PH"}:
        bad.append("占位图没被认出来")

    # 阳性样本：乐城旧 1、2 张（用户 2026-11-05 回报「差不多一样」）。哈希值是实测抄下来的，
    # 不每次下载。它证明两件事：第一级 dHash 抓不到它（所以才要第二级），第二级抓得到。
    lc1, lc2 = LECHENG["dhash"]
    if dist(lc1, lc2) <= THRESHOLD:
        bad.append("乐城那对的 dHash 落进第一级了——fixture 抄错，或阈值被调松到会误报")
    urls = ["https://g/lc1=s", "https://g/lc2=s", "https://g/lc3=s"]
    info2 = {urls[0]: {"sha": "a", "hash": lc1}, urls[1]: {"sha": "b", "hash": lc2},
             urls[2]: {"sha": "c", "hash": h_b}}
    score = {frozenset(urls[:2]): LECHENG["inliers"],               # 近似
             frozenset((urls[0], urls[2])): LECHENG["other_max"],   # 实测不同照片的最高分
             frozenset((urls[1], urls[2])): 0}
    d2, _, _, _ = judge([("x.html", "乐城", urls)], info2, lambda a, b: score[frozenset((a, b))])
    if {(i, j) for _, _, i, j, _ in d2} != {(1, 2)}:
        bad.append(f"第二级判定 {[(i, j) for _, _, i, j, _ in d2]}，应只有乐城 1、2")
    NEAR_ALLOW[(base(urls[0]), base(urls[1]))] = "selftest"
    d3, _, _, _ = judge([("x.html", "乐城", urls)], info2, lambda a, b: score[frozenset((a, b))])
    NEAR_ALLOW.clear()
    if d3:
        bad.append("NEAR_ALLOW 里登记过的图对仍被报红")

    # 第二级的特征点比对本身（要 OpenCV；CI 会装，本机没有就跳过这一段并说清楚）
    orb_msg = "本机没装 OpenCV，特征点比对那段没跑（CI 会跑）"
    if cv2 is not None:
        def shop(seed):  # 有招牌、窗格、字块的「店面」，ORB 才有角点可抓
            import random
            rnd = random.Random(seed)
            im = Image.new("RGB", (800, 600), (rnd.randrange(256), 200, 180))
            dr = ImageDraw.Draw(im)
            for _ in range(60):
                x, y = rnd.randrange(760), rnd.randrange(560)
                dr.rectangle([x, y, x + rnd.randrange(10, 120), y + rnd.randrange(10, 90)],
                             fill=(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)),
                             outline=(0, 0, 0))
            return im
        s1, s2 = shop(11), shop(12)
        # 同一个店面换个站位：透视变形＋裁掉一块＋改成直幅（乐城旧 2 号的样子）
        w = s1.transform((800, 600), Image.PERSPECTIVE,
                         (1.05, 0.04, -30, 0.02, 1.02, -10, 0.00004, 0.00002), Image.BICUBIC)
        w = w.crop((250, 0, 700, 600))
        f1, fw, f2 = orb_feats(s1), orb_feats(w), orb_feats(s2)
        n_same, n_diff = inliers(f1, fw), inliers(f1, f2)
        if n_same < NEAR_INLIERS:
            bad.append(f"同一店面换站位只对上 {n_same} 点，没到 {NEAR_INLIERS}")
        if n_diff >= NEAR_INLIERS:
            bad.append(f"两个不同店面对上 {n_diff} 点，会误报")
        orb_msg = f"特征点：同店换站位 {n_same}、不同店 {n_diff}、阈值 {NEAR_INLIERS}"

    if bad:
        print("✗ selftest 失败：")
        for b_ in bad:
            print("  -", b_)
        return 1
    print(f"selftest 通过（同图距离 {dist(h_a, h_a2)}、异图距离 {dist(h_a, h_b)}、阈值 {THRESHOLD}；"
          f"乐城那对 dHash {dist(lc1, lc2)}；{orb_msg}）")
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    sys.exit(selftest() if "--selftest" in args else main(args))
