#!/usr/bin/env python3
"""行情校验 `trading/fetch_prices.py: validate()` 的自检。跑法：python3 tools/check-prices.py

不碰网络：只把造好的 bar 阵列喂给 validate()，所以 CI 与沙盒都跑得动
（行情源沙盒连不上，见 CLAUDE.md）。

为什么有这份：2026-08-17 开盘后 6 分钟那次 trading-daily 全红——58 支里 22 支被判
「OHLC 异常」，超过 1/4 门槛让整条管线失败、股票分析页停止更新。病根不是行情源挂了，
是**当天那根还没走完的日线，Yahoo 的 open 停在上一交易日的值**（拿仓库里已存的前一根
比对，SPY/CRM/GE 的 o 一模一样），h/l/c 却是实时的，于是当天有跳空的股票全被判异常。

这份自检守两个方向，缺一不可：
1. **当天那根要放行**——不放行就是每次开盘后那一跑都红（这次的病）。
2. **该红的还是要红**——已收盘的历史根 open 跑出区间、当天那根 close 跑出区间、
   高低倒挂、根数不足、日期过旧或未升序、单日涨跌超 ±50%，一条都不能被顺手放过。
   放宽校验最容易连正事一起放宽，所以第 2 组比第 1 组更重要。
"""
import os
import sys
import importlib.util
from datetime import datetime, timedelta, timezone

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location(
    "fetch_prices", os.path.join(BASE, "trading", "fetch_prices.py"))
fp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fp)

fails = []
oks = []


def ok(name, cond, got=None):
    if cond:
        oks.append(name)
        print(f"  ✅ {name}")
    else:
        fails.append(name)
        print(f"  ❌ {name} —— 实际: {got!r}")


def day(n):
    """今天往前数第 n 个日历日的日期字串（n=0 就是今天）。"""
    return (datetime.now(timezone.utc) - timedelta(days=n)).strftime("%Y-%m-%d")


def good_bars(count=320, base=100.0):
    """一组干净的日线：收盘价缓慢上行，OHLC 自洽，日期升序、最后一根是今天。"""
    bars = []
    for i in range(count):
        c = base + i * 0.1
        bars.append([day(count - 1 - i), c - 0.2, c + 0.5, c - 0.6, c, 1_000_000])
    return bars


def main():
    print("【1】正常资料要通过")
    ok("干净的 320 根通过", fp.validate("T", good_bars()) is None,
       fp.validate("T", good_bars()))

    print("\n【2】当天那根还没走完：open 停在上一根（2026-08-17 的真实病症）")
    # 复刻当天 SPY 的真实数字：o 是上一交易日的开盘价，h/l/c 是实时的
    b = good_bars(base=744.0)          # 让前后价位贴近真实的 SPY，别误触 ±50% 那条
    b[-1] = [day(0), 778.54, 776.775, 775.32, 775.7, 31_000_000]
    ok("当天那根的 open 落在区间外仍放行", fp.validate("SPY", b) is None,
       fp.validate("SPY", b))

    b = good_bars(base=74.0)                                       # 同理，贴近真实的 DIS
    b[-1] = [day(0), 104.99, 106.6375, 105.6, 105.97, 9_000_000]   # DIS：open 低于当日最低
    ok("当天那根的 open 低于最低价也放行", fp.validate("DIS", b) is None,
       fp.validate("DIS", b))

    print("\n【3】该红的还是要红（放宽校验最容易连正事一起放宽）")
    b = good_bars(base=744.0)
    b[-2] = [day(1), 778.54, 776.775, 775.32, 775.7, 31_000_000]   # 同样的错，但已收盘
    ok("已收盘的历史根 open 跑出区间照样报错",
       fp.validate("T", b) is not None, fp.validate("T", b))

    b = good_bars()
    b[-1] = [day(0), 100.0, 101.0, 99.0, 105.0, 1]                 # 当天那根 close 冲出区间
    ok("当天那根的 close 跑出区间照样报错",
       fp.validate("T", b) is not None, fp.validate("T", b))

    b = good_bars()
    b[-1] = [day(0), 100.0, 99.0, 101.0, 100.0, 1]                 # 高低倒挂
    ok("高低倒挂照样报错", fp.validate("T", b) is not None, fp.validate("T", b))

    ok("不足 200 根照样报错",
       fp.validate("T", good_bars(150)) is not None, fp.validate("T", good_bars(150)))

    b = good_bars()
    b[-1][0] = day(30)                                              # 最后一根是一个月前
    ok("最后日期过旧照样报错", fp.validate("T", b) is not None, fp.validate("T", b))

    b = good_bars()
    b[-1][0] = b[-2][0]                                             # 日期没有往前走
    ok("日期未升序照样报错", fp.validate("T", b) is not None, fp.validate("T", b))

    b = good_bars()
    c = 300.0                                                       # 收盘价一天翻三倍
    b[-1] = [day(0), c, c + 1, c - 1, c, 1]
    ok("单日涨跌超 ±50% 照样报错", fp.validate("T", b) is not None, fp.validate("T", b))

    print(f"\n通过 {len(oks)} 项")
    if fails:
        print(f"未通过 {len(fails)} 项：", file=sys.stderr)
        for f in fails:
            print("  ✗ " + f, file=sys.stderr)
        return 1
    print("行情校验自检全部通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
