#!/usr/bin/env python3
"""生成库存页的 App 图标（PNG data URI），供 inventory/index.html 与 manifest 内嵌。

为什么不用 SVG：iOS 的 apple-touch-icon 根本不认 SVG，装到 iPhone 主屏上会退化成
网页截图；安卓 Chrome 的安装提示也偏好 PNG。为什么不放图片文件：本仓库规则是
不往仓库塞图片文件，所以画完直接转成 data URI 内嵌。

改图标就改这个脚本再跑一次，输出会直接打进那两个文件里，不要手改 base64。
"""
import base64, io, sys
from PIL import Image, ImageDraw

BG = (122, 31, 61)      # --p 酒红，跟页面主色一致
FG = (255, 255, 255)

def draw_icon(size, margin=0.20):
    """margin：箱子四周留白占整张图的比例。

    安卓的自适应图标（purpose=maskable）会把图标裁成圆形之类的形状，只保证中间
    约 80% 的圆形区域不被裁掉，所以那一版要用更大的 margin 把箱子往里收；
    普通用途（purpose=any）用小 margin，箱子大一点更好认。
    """
    # 4 倍超采样再缩小，边缘才不会有锯齿
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)

    # 一个箱子：上盖 + 箱体 + 中间那道封箱带（比酒杯合适——以后还要装茶叶和虫草）。
    # 比例是照着「缩到主屏那么小还认得出」调的：封箱带要细（宽了就变成两块板子）、
    # 盖子和箱体之间的缝要看得见（缝太窄会糊成一整块）。
    m = s * margin        # 边距（见 docstring）
    w = s - 2 * m
    lid_h = w * 0.20
    top = s * 0.27
    gap = s * 0.030       # 盖子与箱体之间的缝
    r = int(s * 0.025)
    d.rounded_rectangle([m, top, m + w, top + lid_h], radius=r, fill=FG)
    body_top = top + lid_h + gap
    body_h = w * 0.62
    d.rounded_rectangle([m, body_top, m + w, body_top + body_h], radius=r, fill=FG)
    # 中缝只劈盖子（两片翻盖），箱体保持整块——两边都劈会变成四格窗，认不出是箱子
    strap_w = w * 0.085
    cx = m + w / 2
    d.rectangle([cx - strap_w/2, top, cx + strap_w/2, top + lid_h], fill=BG)
    return img.resize((size, size), Image.LANCZOS)

def to_data_uri(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    raw = buf.getvalue()
    return len(raw), "data:image/png;base64," + base64.b64encode(raw).decode()

# 要生成哪几张：(输出名, 边长, margin)
VARIANTS = [
    ("any192", 192, 0.20),
    ("any512", 512, 0.20),
    ("maskable512", 512, 0.30),   # 留白更多，安卓裁圆之后箱子仍完整
]

if __name__ == "__main__":
    for name, n, margin in VARIANTS:
        nbytes, uri = to_data_uri(draw_icon(n, margin))
        print(f"{name} {n}x{n} margin={margin}: PNG {nbytes} 字节 / data URI {len(uri)} 字符",
              file=sys.stderr)
        print(f"{name}\t{uri}")
