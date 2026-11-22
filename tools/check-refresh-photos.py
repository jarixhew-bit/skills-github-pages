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


def run(page_html, dead_urls, fresh_by_query, argv=None, naver_by_id=None, calls=None):
    """用打桩的探测与抓图器跑一次，回传 (改完的页面, 印出来的文字)。
    naver_by_id：Naver 抓取器的假结果 {地点编号: [候选]}；calls：传个 dict 进来，记下两条通道各被查了什么。"""
    mod = load()
    mod.check_images.probe = lambda url, kind="": (
        (False, "403") if url in dead_urls else (True, "200"))

    def google(queries):
        if calls is not None:
            calls.setdefault("google", []).extend(queries)
        return {q: fresh_by_query.get(q, []) for q in queries}

    def naver(ids):
        if calls is not None:
            calls.setdefault("naver", []).extend(ids)
        return {i: (naver_by_id or {}).get(i, []) for i in ids}
    mod.fetch = google
    mod.fetch_naver = naver

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

# ---- 7. 走完的行程不再碰（2026-09-19 用户要求）----
import datetime  # noqa: E402
sys.path.insert(0, os.path.join(REPO, "tools", "lib"))
import trips  # noqa: E402

mod = load()
scan = mod.pages([])
check(all("japan-trip" not in p and "xiamen" not in p for p in scan),
      "已经走完的行程（日本、厦门）不该再被扫")
# 不写死「槟城还没出发」：2026-10-17 槟城走完后，写死的断言一夜之间变红（时间炸弹）。
# 改成校对「扫不扫」是否跟登记表一致——没走完的就该被扫，走完的就该被跳过。
check(any("penang-trip/index.html" in p for p in scan)
      == (not trips.is_over("penang-trip/index.html")),
      "槟城手册扫不扫，要跟登记表的行程结束日一致（没走完照常扫，走完了就跳过）")
# 边界：最后一天当天仍算进行中——那天大家正在用手册，破图最要命。
# 日期写死在这里，不从登记表读：从表里读的话，表少了一行会变成 KeyError 崩掉，
# 而不是干净地报「这本没登记」（2026-09-19 写这条自检时踩过）。
trips.TRIPS["__自检用的假手册.html"] = "2026-10-17"
end = datetime.date(2026, 10, 17)
check(not trips.is_over("__自检用的假手册.html", end), "行程最后一天当天仍算进行中")
check(trips.is_over("__自检用的假手册.html", end + datetime.timedelta(days=1)),
      "过了最后一天才算结束")
del trips.TRIPS["__自检用的假手册.html"]
check(not trips.is_over("没登记过的新手册.html"),
      "没登记的页面要当常青页照常检查（宁可多跑，也不要让正在用的手册悄悄漏掉）")
# 漏登记最难发现：新手册建好、体检照跑，但没人知道它该不该停
import glob as _glob  # noqa: E402
os.chdir(REPO)
handbooks = [f for f in _glob.glob("*/index.html") + _glob.glob("*.html")
             if 'class="gal"' in open(f, encoding="utf-8").read()]
missing = [f for f in handbooks if f not in trips.TRIPS]
check(not missing, f"每本带照片的手册都要登记行程日期（漏了：{missing}）")

# ---- 8. 韩国手册（首尔）：Naver 照片坏了走 Naver 补（2026-11-22 加）----
#     首尔的照片以 Naver 为准（CLAUDE.md 媒体规则），233 张里 213 张是 search.pstatic.net 代理图。
#     改之前：只会走 Google；Naver 网址在 HTML 里写成 &amp;，整串替换对不上、却照样印「已换新图」；
#     首尔的卡片标题在相册上面、Google 链接多半是 /maps/place/（没有 cid），旧写法会认到下一张卡。
#     这一段（含下面第 9 段）用改之前的 refresh-photos.py／check-images.py 跑会红 5 项（2026-11-22 验过）。
import urllib.parse  # noqa: E402


def naver_url(orig):
    return ("https://search.pstatic.net/common/?autoRotate=true&type=w560_sharpen&src="
            + urllib.parse.quote(orig, safe=""))


def esc(u):  # HTML 属性里的写法
    return u.replace("&", "&amp;")


ORIG_A = "https://ldb-phinf.pstatic.net/20250101_1/AAA_JPEG/a.jpg"
N_A = naver_url(ORIG_A)
N_B_DEAD = naver_url("https://ldb-phinf.pstatic.net/20250101_2/BBB_JPEG/b.jpg")
N_NEW = naver_url("https://ldb-phinf.pstatic.net/20250101_3/NEW_JPEG/n.jpg")
N_A_ALT = ("https://search.pstatic.net/common/?src=" + urllib.parse.quote(ORIG_A, safe="")
           + "&type=w560_sharpen")       # 同一张原图，参数顺序不同
N_YI = naver_url("https://ldb-phinf.pstatic.net/20250101_4/YI_JPEG/y.jpg")
G_YA = "https://lh3.googleusercontent.com/gps-cs-s/YA=s4800-w800-h600"
G_YB_DEAD = "https://lh3.googleusercontent.com/gps-cs-s/YB=s4800-w800-h600"
G_YNEW = "https://lh3.googleusercontent.com/gps-cs-s/YNEW=s4800-w800-h600"
G_BA = "https://lh3.googleusercontent.com/gps-cs-s/BA=s4800-w800-h600"
G_BB = "https://lh3.googleusercontent.com/gps-cs-s/BB=s4800-w800-h600"
G_BNEW = "https://lh3.googleusercontent.com/gps-cs-s/BNEW=s4800-w800-h600"
JIA_MAP = "https://www.google.com/maps/place/Jia/data=!4m2!3m1"
YI_MAP = "https://www.google.com/maps/place/Yi/data=!3m1!4b1"
BING_MAP = "https://maps.google.com/?cid=333"

SEOUL_CARD = """<div class="evt" id="{id}">
<h3><span class="cn">{name}</span><span class="en">{name}</span></h3>
<div class="desc"><span class="cn">{filler}</span></div>
<div class="gal">
<img loading="lazy" alt="{name} 照片 1" src="{a}"/>
<img loading="lazy" alt="{name} 照片 2" src="{b}"/>
</div>
<div class="links"><a class="btn-map" href="{gmap}" target="_blank" rel="noopener">Google 地图</a>{naver}</div>
</div>
"""


def naver_btns(nid):
    return (f'<a class="btn-map btn-map-naver" href="https://nmap.place.naver.com/launchApp/route?path=route'
            f'&amp;type=place&amp;did={nid}&amp;dname=x">导航</a>'
            f'<a class="btn-map btn-map-naver" href="https://m.place.naver.com/restaurant/{nid}/menu/list?locale=zh_CN">菜单</a>')


def seoul_page():
    filler = "说明" * 300   # 卡片够长：旧写法往后看 6000 字，正好看得到下一张卡的 cid
    cards = [
        dict(id="food-jia", name="甲店", a=esc(N_A), b=esc(N_B_DEAD), gmap=JIA_MAP, naver=naver_btns("11583198")),
        dict(id="fun-yi", name="乙馆", a=G_YA, b=G_YB_DEAD, gmap=YI_MAP, naver=naver_btns("1090896277")),
        dict(id="fun-bing", name="丙场", a=G_BA, b=G_BB, gmap=BING_MAP, naver=""),
    ]
    return "<html><body>\n" + "".join(SEOUL_CARD.format(filler=filler, **c) for c in cards) + "</body></html>\n"


calls = {}
out, log = run(seoul_page(), {N_B_DEAD, G_YB_DEAD},
               {YI_MAP: [G_YNEW], BING_MAP: [G_BNEW]},
               naver_by_id={"11583198": [N_A_ALT, N_NEW], "1090896277": [N_YI]}, calls=calls)
check(f'src="{esc(N_NEW)}"' in out and esc(N_B_DEAD) not in out,
      "首尔：甲店坏掉的 Naver 照片要换成 Naver 新抓的图，写回 HTML 时 & 要写成 &amp;")
check("11583198" in calls.get("naver", []) and JIA_MAP not in calls.get("google", []),
      f"首尔：Naver 的图要走 Naver 抓取器（用卡上 Naver 按钮的地点编号），不能去抓 Google 的图顶替（实得 {calls}）")
check(esc(N_A_ALT) not in out and N_A_ALT not in out,
      "首尔：候选跟页面上已有的是同一张原图（只是参数顺序不同）也要认得出，不能拿来补成重复图")
check(G_YNEW in out and G_YB_DEAD not in out and G_BNEW not in out,
      "首尔版型（标题在相册上面、Google 链接是 /maps/place/ 没有 cid）：乙馆的死图要用乙馆自己的链接补，"
      "不能认到下一张卡（丙场）拿它的图来补")
check(esc(N_YI) not in out and "1090896277" not in calls.get("naver", []),
      "首尔：卡上有 Naver 按钮、但坏的是 Google 的图（当初 Naver 没合适的图才用 Google 补）→ 照旧走 Google")
check("甲店" in log and "（naver）" in log,
      "首尔：日志要写出是哪家（标题在相册上面也要找得到）、走的是哪条通道")
out2, log2 = run(seoul_page(), {N_B_DEAD}, {}, naver_by_id={"11583198": []})
check(esc(N_B_DEAD) in out2 and "这家先留着不动" in log2,
      "首尔：Naver 抓不到候选（例如被验证码挡住）时，那张破图原样留着、讲清楚，不拿 Google 的图顶替")

# ---- 9. 每周体检（check-images）看得到 Naver 图，失效时 issue 里写明要用 source=naver ----
mod = load()
ci = mod.check_images
d = tempfile.mkdtemp()
seoul_path = os.path.join(d, "index.html")
open(seoul_path, "w", encoding="utf-8").write(seoul_page())
found = [u for kind, u, _ in ci.extract(seoul_path) if kind == "图片"]
check(N_A in found and N_B_DEAD in found,
      "check-images 要把 search.pstatic.net 的照片收进体检（网址里的 &amp; 要还原成 &，才是浏览器真正请求的网址）")
ci.probe = lambda url, kind="": ((False, "404") if url == N_B_DEAD else (True, "200"))
import io  # noqa: E402
import contextlib  # noqa: E402
buf = io.StringIO()
code = None
try:
    with contextlib.redirect_stdout(buf):
        ci.sys.argv = ["check-images.py", seoul_path]
        ci.main()
except SystemExit as e:
    code = e.code
report = buf.getvalue()
check(code == 1 and N_B_DEAD in report,
      f"check-images：Naver 照片失效要判不通过、列进清单（退出码 {code}）——每周体检就是靠这个开 issue")
check("source=naver" in report,
      "check-images：失效清单里有 Naver 照片时要写明「重抓用 fetch-photos.yml 的 source=naver」（这段会进 issue）")

print(f"通过 {len(ok)} 项")
if fails:
    print(f"\n未通过 {len(fails)} 项：")
    for f in fails:
        print("  ✗ " + f)
    sys.exit(1)
print("自动补破图自检全部通过")
