#!/usr/bin/env python3
"""自动补破图的自检——把网络打桩，用假手册实跑 tools/refresh-photos.py。

为什么要它（2026-09-18）：refresh-photos 是**会自己动手改手册**的东西，
而手册已经发给家人了。它做对了没人会注意，做错了是把一整本好图换掉。
真跑它要连 Google（沙盒连不上，CI 上一轮又要几分钟），所以把两处外部依赖
打桩：图片探测（谁死谁活）与抓图器（新候选从哪来），然后用假手册验行为。

守的是四件事，每件都对应一个「错了会怎样」：
  1. 死图换成同一家店的新图        —— 换错家就是「图不对题」，用户 2026-09-16 挡过
  2. 不补成同页已有的图            —— 补出重复图，卡片看起来像偷懒
  3. 抓不满就整家不动              —— 宁可留着破图给人处理，也不要拿别处的顶上
  4. 死掉过半且新图也打不开 → 罢工 —— 这是「机器被 Google 挡」的样子，
                                      不罢工的话一次误判会换掉整本好图

跑法：python3 tools/check-refresh-photos.py
退出码 0 = 全过，1 = 有没过的。
"""
import importlib.util
import os
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

fails, ok = [], []


def check(cond, label):
    (ok if cond else fails).append(label)


def load():
    spec = importlib.util.spec_from_file_location(
        "refresh_photos", os.path.join(REPO, "tools", "refresh-photos.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


CARD = """<div class="stop">
<div class="gal">
<img alt="{name} 照片 1" src="{a}"/>
<img alt="{name} 照片 2" src="{b}"/>
</div>
<h3>{name}</h3>
<a class="btn-map" href="https://maps.google.com/?cid={cid}">地图</a>
</div>
"""


def make_page(cards):
    body = "".join(CARD.format(**c) for c in cards)
    return "<html><body>\n" + body + "</body></html>\n"


def run(page_html, dead_urls, fresh_by_query, argv=None):
    """用打桩的探测与抓图器跑一次，回传 (改完的页面, 印出来的文字)。"""
    mod = load()
    mod.check_images.probe = lambda url, kind="": (
        (False, "403") if url in dead_urls else (True, "200"))
    mod.fetch = lambda queries: {q: fresh_by_query.get(q, []) for q in queries}

    d = tempfile.mkdtemp()
    path = os.path.join(d, "index.html")
    open(path, "w", encoding="utf-8").write(page_html)
    cwd = os.getcwd()
    import io
    import contextlib
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            mod.sys.argv = ["refresh-photos.py", path] + (argv or [])
            mod.pages = lambda argv_: [path]      # 别扫整个仓库，只跑这张假手册
            mod.main()
    finally:
        os.chdir(cwd)
    return open(path, encoding="utf-8").read(), buf.getvalue()


A = "https://lh3.googleusercontent.com/gps-cs-s/AAA=s4800-w800-h600"
B_DEAD = "https://lh3.googleusercontent.com/gps-cs-s/BBB=s4800-w800-h600"
C = "https://lh3.googleusercontent.com/gps-cs-s/CCC=s4800-w800-h600"
D_DEAD = "https://lh3.googleusercontent.com/gps-cs-s/DDD=s4800-w800-h600"
NEW1 = "https://lh3.googleusercontent.com/gps-cs-s/NEW1=s4800-w800-h600"
NEW2 = "https://lh3.googleusercontent.com/gps-cs-s/NEW2=s4800-w800-h600"
Q1 = "https://maps.google.com/?cid=111"
Q2 = "https://maps.google.com/?cid=222"

one = [dict(name="甲餐厅", a=A, b=B_DEAD, cid="111")]
two = [dict(name="甲餐厅", a=A, b=B_DEAD, cid="111"),
       dict(name="乙景点", a=C, b=D_DEAD, cid="222")]

# ---- 1. 死图换成同一家店的新图，活的那张不动 ----
out, log = run(make_page(two), {B_DEAD, D_DEAD}, {Q1: [NEW1], Q2: [NEW2]})
check(NEW1 in out and B_DEAD not in out, "甲餐厅的死图要换成它自己的新图")
check(NEW2 in out and D_DEAD not in out, "乙景点的死图要换成它自己的新图")
check(A in out and C in out, "还活着的图一张都不能动")
# 换错家是最难发现的错：图还在、能打开，只是拍的不是这家店。
# 要验出这件事，得造一个「甲抓不到、乙抓得到」的局面——两家都抓得到时，
# 就算程序把候选混在一起，第一张也刚好是对的，测不出差别（这条一开始就这么漏过）。
out2, _ = run(make_page(two), {B_DEAD, D_DEAD}, {Q1: [], Q2: [NEW2]})
check(B_DEAD in out2, "甲餐厅抓不到候选时，它的破图要留着")
# 位置判定：乙景点的图一定排在甲餐厅那张地图链接之后；
# 若它跑到前面去，就是被拿去顶甲餐厅的缺了
check(out2.count(NEW2) == 1 and out2.index(NEW2) > out2.index("cid=111"),
      "甲餐厅不能拿乙景点的照片顶上（换错家的图最难被发现）")

# ---- 2. 不补成同页已经在用的图 ----
out, log = run(make_page(one), {B_DEAD}, {Q1: [A, NEW1]})
check(out.count(A) == 1, "候选里若有同页已在用的图，不能拿来补（会变重复图）")
check(NEW1 in out, "应该跳过重复的那张，用下一张候选")

# ---- 3. 抓不满就整家不动，不拿别处顶上 ----
out, log = run(make_page(one), {B_DEAD}, {Q1: []})
check(B_DEAD in out, "抓不到候选时，那张破图要原样留着（留给人处理）")
check("这家先留着不动" in log or "只抓到" in log, "抓不满要讲清楚是哪家、差几张")

# ---- 4. 死掉过半 + 新图也打不开 → 整轮罢工 ----
#     这就是「这台机器被 Google 挡了」的样子：页面上的图全探失败，
#     刚抓回来的新图同样探失败。所以死亡名单里要连 NEW1 一起放。
out, log = run(make_page(one), {A, B_DEAD, NEW1}, {Q1: [NEW1]})
check(A in out and B_DEAD in out, "死过半且新图同样打不开时，一个字都不能改")
check("不动任何文件" in log, "罢工时要说明白是判定机器被挡，不是没找到图")

# ---- 5. 死掉过半但新图打得开 → 确认是成批过期，照常补 ----
#     （新图 NEW1/NEW2 不在死亡名单里 = 对照组通过）
out, log = run(make_page(one), {A, B_DEAD}, {Q1: [NEW1, NEW2]})
check(NEW1 in out and NEW2 in out, "死过半但新图打得开时，要认定是成批过期并照常补")

# ---- 6. 没有死图就不该动任何东西 ----
before = make_page(two)
out, log = run(before, set(), {Q1: [NEW1], Q2: [NEW2]})
check(out == before, "没有破图时，文件必须一字不改")
check("全部正常" in log, "没有破图时要明讲全部正常")

print(f"通过 {len(ok)} 项")
if fails:
    print(f"\n未通过 {len(fails)} 项：")
    for f in fails:
        print("  ✗ " + f)
    sys.exit(1)
print("自动补破图自检全部通过")
