#!/usr/bin/env python3
"""菜单照过滤器的自检——**只能在 CI 跑**（要 tesseract 与 pillow）。

为什么要它（2026-09-19）：`tools/photo-filter.py` 决定手册卡片上会不会出现菜单照。
它做对了没人注意；做错的方式有两种，而且都不会报错：
  - 认不出菜单 → 用户又看到一张菜单，回到「还要我手动挑」；
  - 把好照片误判成菜单 → 食物照被排到最后，卡片越换越难看。
真实候选图里**一张菜单都没有**（2026-09-19 校准跑了 24 张，全是「字 0 价 0」，
因为抓图器已经改从 Food & drink 分类取图），所以拿真图当测试等于没有阳性样本——
必须自己造一张菜单。

做法：用 pillow 画两张图——一张真的菜单（菜名＋一排 RM 价格）、一张没有字的
「食物照」（渐层色块）——真的存成 JPG、真的跑 tesseract、真的过一遍判定。
这样测的是整条链路（下载除外），不是只测正则。

跑法（CI）：python3 tools/check-photo-filter.py
本机没有 tesseract/pillow 会直接退出 1 并说明——不假装通过。
"""
import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails, ok = [], []


def check(cond, label):
    (ok if cond else fails).append(label)


def load():
    spec = importlib.util.spec_from_file_location(
        "photo_filter", os.path.join(REPO, "tools", "photo-filter.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pf = load()

# ---- 1. 判定规则本身（不需要 OCR，纯算术）----
check(pf.is_menu(40, 6), "满屏文字＋一排价格 → 菜单")
check(pf.is_menu(pf.WORDS_MAX, 0), "只有文字够多也算菜单（有些菜单不印价）")
check(pf.is_menu(0, pf.PRICES_MAX), "只有价格够多也算菜单（图片菜单常只有数字）")
check(not pf.is_menu(3, 0), "食物照（几乎没字）不该被判成菜单")
check(not pf.is_menu(12, 1), "店招那种几个字＋一个号码不该被判成菜单")
check(pf.PRICE.findall("RM12.50 RM3 18.00") == ["RM12.50", "RM3", "18.00"],
      "价格样式要认得 RM12.50 / RM3 / 18.00 三种写法")
check(pf.PRICE.findall("Open 2024 Tel 04-2109433") == [],
      "年份与电话不能被当成价格（否则店招照会被误杀）")

# ---- 2. 整条链路：真的画图、真的 OCR ----
if not shutil.which("tesseract"):
    print("✗ 这台机器没有 tesseract——这支自检只能在 CI 跑（跟 check-live 同理）")
    sys.exit(1)
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("✗ 这台机器没有 pillow——这支自检只能在 CI 跑")
    sys.exit(1)


def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


tmp = tempfile.mkdtemp()

# 假菜单：白底黑字，菜名＋价格各一排——真实菜单照就长这样
menu = Image.new("RGB", (900, 1200), "white")
d = ImageDraw.Draw(menu)
d.text((60, 40), "MENU", fill="black", font=font(72))
rows = [("Nasi Lemak Ayam", "RM12.50"), ("Char Kuey Teow", "RM11.00"),
        ("Hokkien Mee", "RM10.50"), ("Curry Laksa", "RM13.00"),
        ("Roti Canai Telur", "RM6.50"), ("Teh Tarik Panas", "RM3.20"),
        ("Kopi Peng Special", "RM4.80"), ("Cendol Durian", "RM9.90")]
y = 160
for name, price in rows:
    d.text((60, y), name, fill="black", font=font(48))
    d.text((640, y), price, fill="black", font=font(48))
    y += 120
menu_path = os.path.join(tmp, "menu.jpg")
menu.save(menu_path, quality=95)

# 假食物照：没有任何字的渐层色块
food = Image.new("RGB", (900, 700))
px = food.load()
for x in range(900):
    for y2 in range(700):
        px[x, y2] = (180 + (x // 30) % 60, 90 + (y2 // 25) % 70, 40 + (x // 60) % 50)
food_path = os.path.join(tmp, "food.jpg")
food.save(food_path, quality=90)


def ocr_local(path):
    out = subprocess.run(["tesseract", path, "stdout", "-l", "eng"],
                         capture_output=True, text=True, timeout=60)
    text = out.stdout
    return len(pf.WORD.findall(text)), len(pf.PRICE.findall(text)), text


mw, mp, mtext = ocr_local(menu_path)
fw, fp, _ = ocr_local(food_path)
print(f"假菜单：字 {mw} 价 {mp}；假食物照：字 {fw} 价 {fp}")
check(pf.is_menu(mw, mp), f"画出来的菜单要被认出来（实得 字{mw} 价{mp}，"
                          f"门槛 字≥{pf.WORDS_MAX} 或 价≥{pf.PRICES_MAX}）")
check(not pf.is_menu(fw, fp), f"没有字的食物照不能被误判（实得 字{fw} 价{fp}）")
check("RM" in mtext or mp >= 1, "OCR 至少要读出菜单上的价格文字，否则是 OCR 装坏了")

print(f"\n通过 {len(ok)} 项")
if fails:
    print(f"未通过 {len(fails)} 项：")
    for f in fails:
        print("  ✗ " + f)
    sys.exit(1)
print("菜单照过滤器自检全部通过")
