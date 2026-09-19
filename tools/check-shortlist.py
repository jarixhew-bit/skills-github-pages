#!/usr/bin/env python3
"""候选清单页产生器的自检——用假候选实跑 tools/build-shortlist.py。

为什么要它（2026-09-19）：这张页面是「你按编号挑」的唯一凭据。它出错的方式
都不会报错，但每一种都会让人挑错：
  - 编号跳号或重号 → 你说「要 7」，我改到别家
  - 评分/地图链接漏印 → 你凭一张照片就要拍板
  - 低于门槛的悄悄混进来 → 你以为都过了筛
  - 没照片的卡片塌掉 → 看起来像坏页，你会以为是我漏做

跑法：python3 tools/check-shortlist.py
退出码 0 = 全过，1 = 有没过的。
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails, ok = [], []


def check(cond, label):
    (ok if cond else fails).append(label)


spec = importlib.util.spec_from_file_location(
    "build_shortlist", os.path.join(REPO, "tools", "build-shortlist.py"))
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)

MAP1 = "https://maps.google.com/?cid=111"
MAP2 = "https://maps.google.com/?cid=222"
MAP3 = "https://maps.google.com/?cid=333"
PIC = "https://lh3.googleusercontent.com/gps-cs-s/AAA%d=s4800-w800-h600"

DATA = {
    "city": "曼谷", "dates": "2026-12-05~09", "pax": 4, "notes": "有小孩、不吃牛",
    "places": [
        {"name": "Somtum Der", "cn": "东北菜", "cat": "餐厅", "rating": 4.4,
         "reviews": 3120, "map": MAP1, "why": "辣度可调，小孩能吃",
         "hours": "每日 11:00–22:00", "addr": "5/5 Sala Daeng Rd"},
        # 评分低于 4.2：该标红、但不能消失
        {"name": "Mediocre Cafe", "cat": "餐厅", "rating": 3.9, "reviews": 88,
         "map": MAP2, "why": "全城唯一一家有婴儿椅的"},
        # 游艺场所门槛放宽到 3.8：4.0 应该算过关
        {"name": "Molly Fantasy", "cat": "游艺", "rating": 4.0, "reviews": 210,
         "map": MAP3, "why": "商场内亲子游乐"},
        # 没照片、没地图：页面仍要完整，且要明讲缺什么
        {"name": "No Data Place", "cat": "景点", "rating": None, "why": ""},
    ],
}
PHOTOS = "\n".join(
    "RESULT " + json.dumps({"query": q, "urls": [PIC % 1, PIC % 2, PIC % 3, PIC % 4]},
                           ensure_ascii=False)
    for q in (MAP1, MAP2, MAP3))

tmp = tempfile.mkdtemp()
jpath = os.path.join(tmp, "cand.json")
ppath = os.path.join(tmp, "photos.txt")
opath = os.path.join(tmp, "out.html")
open(jpath, "w", encoding="utf-8").write(json.dumps(DATA, ensure_ascii=False))
open(ppath, "w", encoding="utf-8").write(PHOTOS + "\n")

r = subprocess.run([sys.executable, os.path.join(REPO, "tools", "build-shortlist.py"),
                    jpath, "--photos", ppath, "-o", opath],
                   capture_output=True, text=True)
check(r.returncode == 0, f"正常输入要能跑完（实得 {r.returncode}：{r.stderr[-200:]}）")
page = open(opath, encoding="utf-8").read() if os.path.exists(opath) else ""

# ---- 编号：连续、不重号、跟候选一一对应 ----
import re  # noqa: E402
nums = [int(n) for n in re.findall(r'data-n="(\d+)"', page)]
check(nums == [1, 2, 3, 4], f"编号要 1..N 连续不重号（实得 {nums}）")

# ---- 每张卡都要有挑选需要的信息 ----
check(page.count("⭐4.4") == 1 and "3,120 评价" in page, "有评分的要把评分与评价数印出来")
check("没有评分" in page, "没有评分的要明讲，不能留空让人以为是满分")
check(page.count('class="btn"') == 3, "有地图链接的三家都要有地图按钮")
check("没有地图链接" in page, "缺地图链接要明讲（现场找不到店就是这条漏的）")

# ---- 门槛：低分标红但不消失；游艺场所门槛放宽 ----
check("Mediocre Cafe" in page, "低于门槛的候选不能被悄悄删掉")
# 数卡片上的红字，不要数页面里出现几次「低于评分门槛」——页首说明里也有这几个字，
# 照字面数会永远多一个（写这条自检时就这么错过一次）
warns = page.count('<div class="warn">')
check(warns == 1, f"应该只有 1 家标红（实得 {warns}）")
check("Molly Fantasy" in page and page.count("低于评分门槛 3.8") == 0,
      "游艺场所门槛是 3.8，4.0 分不该被标红")
check(bs.threshold("餐厅") == 4.2 and bs.threshold("游艺") == 3.8,
      "门槛函数本身要跟 CLAUDE.md 一致（餐厅 4.2、游艺 3.8）")

# ---- 照片：有就排进去，没有也要有话讲 ----
check(page.count("<img") == 9, f"三家有照片的各放 3 张（实得 {page.count('<img')}）")
check("还没抓到照片" in page, "没照片的卡片要明讲，不能塌成空白")

# ---- 没写理由的要点出来，不能装作有 ----
check("研究员没写理由" in page, "缺推荐理由要点出来（没理由的候选等于没做功课）")

# ---- HTML 结构要过得了仓库的检查 ----
hp = os.path.join(tmp, "shortlist.html")
open(hp, "w", encoding="utf-8").write(page)
r2 = subprocess.run([sys.executable, os.path.join(REPO, "tools", "check-html.py"), hp],
                    capture_output=True, text=True)
check(r2.returncode == 0, f"产出的 HTML 要过 check-html（实得：{(r2.stdout + r2.stderr)[-200:]}）")

# ---- 空候选：要干净报错，不要生出一张空页 ----
epath = os.path.join(tmp, "empty.json")
open(epath, "w", encoding="utf-8").write('{"city":"x","places":[]}')
r3 = subprocess.run([sys.executable, os.path.join(REPO, "tools", "build-shortlist.py"),
                     epath, "-o", os.path.join(tmp, "e.html")],
                    capture_output=True, text=True)
check(r3.returncode == 1 and "没有 places" in r3.stdout,
      "候选是空的要干净报错，不要生出一张空页让人以为没找到地方")

print(f"通过 {len(ok)} 项")
if fails:
    print(f"\n未通过 {len(fails)} 项：")
    for f in fails:
        print("  ✗ " + f)
    sys.exit(1)
print("候选清单页自检全部通过")
