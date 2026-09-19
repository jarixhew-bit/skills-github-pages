#!/usr/bin/env python3
"""哪几本手册的行程还没到——**一处正本**，给体检与自动补图共用。

为什么要有它（2026-09-19 用户要求）：「行程过了的就不用再跑了，只跑还没到的」。
在这之前，每周的外链体检会把日本那趟（7 月已走完）的 178 张过期图一起报出来，
自动补图也会去修它们——花的是 CI 时间与一页页的噪音，修好了也没人会再打开。
判断「跑不跑」的依据只有一个：**这趟走完了没有**。所以日期表只能有一份，
两支脚本都从这里读。

登记规则：
  - 值是行程**最后一天**（YYYY-MM-DD）。过了这天就算结束，当天仍算进行中。
  - 没有自己行程日期、但只服务某一趟的页面（餐厅指南、老板晚餐），
    跟着那趟的结束日期走——那趟走完，它们也就没人看了。
  - 值写 None ＝ 常青页（不绑行程），永远要检查。
  - **新手册一定要在这里加一行**：没登记的页面会被当成常青页照常检查
    （宁可多跑，也不要让一本正在用的手册悄悄不被体检）。

跑法（看现在哪些还在跑）：python3 tools/lib/trips.py
"""
import datetime
import os
import sys

# 页面路径（相对仓库根）→ 行程最后一天；None ＝ 常青页
TRIPS = {
    "japan-trip-2026.html": "2026-07-30",        # 22–30 Jul 2026
    "usj-disney-restaurants.html": "2026-07-30",  # 服务日本那趟
    "usj-disney-restaurants-v2.html": "2026-07-30",  # 跳转页，同上
    "boss-dinner.html": "2026-07-30",            # 服务日本那趟
    "restaurant-guide.html": "2026-07-30",       # 日本餐厅指南
    "xiamen-trip/index.html": "2026-08-27",      # 24–27 Aug 2026
    "singapore-trip/index.html": "2026-09-27",   # 23–27 Sep 2026
    "penang-trip/index.html": "2026-10-17",      # 9–17 Oct 2026
    # 选图页跟着它服务的手册；手册没结束就还要能看
    "penang-trip/photo-picker.html": "2026-10-17",
    "singapore-trip/photo-picker.html": "2026-09-27",
}


def is_over(path: str, today: datetime.date = None) -> bool:
    """这个页面的行程是不是已经走完了。没登记或常青页一律回 False（＝照常检查）。"""
    end = TRIPS.get(path.replace(os.sep, "/").lstrip("./"))
    if not end:
        return False
    today = today or datetime.date.today()
    return datetime.date.fromisoformat(end) < today


def split(paths: list, today: datetime.date = None):
    """把档案分成 (还要跑的, 已结束的)。顺序不变，方便日志对照。"""
    live, over = [], []
    for p in paths:
        (over if is_over(p, today) else live).append(p)
    return live, over


def main() -> int:
    today = datetime.date.today()
    live, over = split(sorted(TRIPS), today)
    print(f"今天 {today}")
    print("还要检查（行程未到或常青）：")
    for p in live:
        print(f"  · {p}（{TRIPS[p] or '常青'}）")
    print("已结束、不再检查：")
    for p in over:
        print(f"  · {p}（{TRIPS[p]} 结束）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
