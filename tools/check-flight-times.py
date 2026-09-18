#!/usr/bin/env python3
"""旅游手册的航班时长体检——飞行时间有没有把时差算进去。

为什么要有它（2026-09-18）：新加坡手册两段航班的飞行时间都是拿当地到达时刻
直接减当地起飞时刻算出来的，金边（UTC+7）与新加坡（UTC+8）差一小时，两段各错
一小时——去程写成 3h05m（实际 2h05m）、回程写成 1h15m（实际 2h15m）。
用户自己发现的，不是检查抓到的。

这类错不会让页面报错、也不会破图，肉眼看「18:55 → 22:00 = 3 小时」还很合理，
所以只能靠算。跨时区的航段以后每加一段都可能再踩一次，写成自检守着。

它怎么判：把每张航班卡里「出发机场 + 出发时刻 → 时长 → 到达机场 + 到达时刻」
抓出来，各自减掉机场所在时区换成 UTC 再相减（跨午夜自动 +24h），跟卡上写的时长比对。
机场时区查下面的表；遇到表里没有的机场直接报错——宁可要求补一行，也不要默默放过。

跑法：
    python3 tools/check-flight-times.py
退出码 0 = 全对，1 = 有对不上的（或有机场不在表里）。
"""
import glob
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 机场 → UTC 偏移（小时）。这几个国家都不实行夏令时，所以是固定值；
# 以后若加了有夏令时的机场（欧美），这张表就不够用，要连日期一起算。
TZ = {
    "KTI": 7,   # 金边 Techo
    "PNH": 7,   # 金边 国际（旧）
    "BKK": 7,
    "HKT": 7,
    "SGN": 7,
    "SIN": 8,   # 新加坡 樟宜
    "PEN": 8,   # 槟城
    "KUL": 8,
    "XMN": 8,   # 厦门
    "HKG": 8,
    "TPE": 8,
    "CAN": 8,
    "SZX": 8,
    "PVG": 8,
    "NRT": 9,   # 东京 成田
    "HND": 9,   # 东京 羽田
    "KIX": 9,   # 大阪 关西
    "ICN": 9,
}

# 手册里航班卡的形状：出发机场 → 出发时刻 → 时长 → 到达机场 → 到达时刻
CARD = re.compile(
    r'<div class="iata">([A-Z]{3})</div>.*?<div class="time">(\d{1,2}):(\d{2})</div>'
    r'.*?<div class="dur">\s*([^<]+?)\s*</div>'
    r'.*?<div class="iata">([A-Z]{3})</div>.*?<div class="time">(\d{1,2}):(\d{2})</div>',
    re.S)
DUR = re.compile(r'(\d+)\s*h(?:\s*(\d+)\s*m)?')


def pages() -> list:
    os.chdir(REPO)
    return sorted(glob.glob("*.html") + glob.glob("*/index.html"))


def check(path: str, problems: list) -> int:
    seen = 0
    text = open(path, encoding="utf-8").read()
    for m in CARD.finditer(text):
        a, ah, am, dur, b, bh, bm = m.groups()
        seen += 1
        line = text[:m.start()].count("\n") + 1
        if a not in TZ or b not in TZ:
            missing = [x for x in (a, b) if x not in TZ]
            problems.append(f"{path}:{line} 机场 {'/'.join(missing)} 不在时区表里，"
                            f"请在 tools/check-flight-times.py 的 TZ 补一行")
            continue
        d = DUR.match(dur)
        if not d:
            problems.append(f"{path}:{line} 时长「{dur}」看不懂，预期形如 2h 05m")
            continue
        shown = int(d.group(1)) * 60 + int(d.group(2) or 0)
        # 两端都换成 UTC 再相减；跨午夜的航段补一天
        real = (int(bh) * 60 + int(bm) - TZ[b] * 60) - (int(ah) * 60 + int(am) - TZ[a] * 60)
        if real < 0:
            real += 24 * 60
        if shown != real:
            problems.append(
                f"{path}:{line} {a} {ah}:{am} → {b} {bh}:{bm} 写着 {dur}，"
                f"算进时差应该是 {real // 60}h {real % 60:02d}m"
                f"（差 {abs(shown - real) // 60}h {abs(shown - real) % 60:02d}m）")
    return seen


def main() -> int:
    problems: list = []
    total = 0
    for p in pages():
        total += check(p, problems)
    if problems:
        print(f"❌ 航班时长有 {len(problems)} 处对不上（共查 {total} 段）：")
        for p in problems:
            print("  " + p)
        print("\n算法：到达当地时刻 − 该机场时区，减去 出发当地时刻 − 该机场时区。")
        return 1
    print(f"✅ 航班时长全部对得上时差（共 {total} 段）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
