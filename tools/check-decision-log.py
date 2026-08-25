#!/usr/bin/env python3
"""决策日志（analyzer.build_decision_entry）的自检。

为什么单独测：这段的价值全在「没动作时说清楚为什么」，而它的分支不少——有没有成交、
欠配几个标的、现金够不够。分支写错的表现是「日志天天写着一句似是而非的话」，
不像崩溃那样显眼，等你几个月后想复盘时才发现记的全是废话，那时已经补不回来了。

用合成数据测，不碰真实持仓、不需要密码，所以可以挂 CI 每次改动都跑。

用法：python3 tools/check-decision-log.py     退出码 0 = 通过，1 = 有用例不符预期
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "trading"))
from analyzer import build_decision_entry, REBALANCE_TOLERANCE  # noqa: E402

TARGETS = {"VOO": 80, "IBIT": 20}


def pos(**weights):
    return [{"symbol": s, "weight": w} for s, w in weights.items()]


def trade(day, sym):
    return {"trade_time": f"{day}T14:30:00Z", "symbol": sym}


# (用例名, 参数, 断言函数)
CASES = [
    (
        "配置到位就说无需动作",
        dict(date="2026-08-25", net_liq=100000, cash=1000,
             positions=pos(VOO=80.0, IBIT=20.0), targets=TARGETS, trades=[]),
        lambda e: "无需动作" in e["why"] and e["traded"] == 0,
    ),
    (
        "容忍带内（差 1.5 点）仍算到位",
        dict(date="2026-08-25", net_liq=100000, cash=1000,
             positions=pos(VOO=78.5, IBIT=20.0), targets=TARGETS, trades=[]),
        lambda e: "无需动作" in e["why"],
    ),
    (
        "单个标的欠配且现金足够",
        dict(date="2026-08-25", net_liq=100000, cash=9000,
             positions=pos(VOO=80.0, IBIT=15.0), targets=TARGETS, trades=[]),
        lambda e: "IBIT 差 5.0" in e["why"] and "补齐需" in e["why"]
                  and "足够" in e["why"] and "未执行" in e["why"],
    ),
    (
        "单个标的欠配但现金不足",
        dict(date="2026-08-25", net_liq=100000, cash=50,
             positions=pos(VOO=80.0, IBIT=15.0), targets=TARGETS, trades=[]),
        lambda e: "不足" in e["why"] and "未执行" in e["why"],
    ),
    (
        "现金只够补一部分",
        dict(date="2026-08-25", net_liq=100000, cash=1200,
             positions=pos(VOO=80.0, IBIT=15.0), targets=TARGETS, trades=[]),
        lambda e: "只够先投" in e["why"],
    ),
    (
        # 这条是 2026-08-25 实跑真实数据时才发现的：SGOV 与现金占掉权重，
        # VOO 和 IBIT 会同时欠配，只报最大的那个会让人以为另一个已到位
        "两个标的同时欠配要全部列出",
        dict(date="2026-08-25", net_liq=100000, cash=1000,
             positions=pos(VOO=77.6, IBIT=17.6, SGOV=3.2), targets=TARGETS, trades=[]),
        lambda e: "VOO 差 2.4" in e["why"] and "IBIT 差 2.4" in e["why"]
                  and "合计需" in e["why"],   # 多个标的用「合计」，单个用「补齐」
    ),
    (
        "当天有成交要记成交而不是缺口",
        dict(date="2026-08-25", net_liq=100000, cash=1000,
             positions=pos(VOO=80.0, IBIT=15.0), targets=TARGETS,
             trades=[trade("2026-08-25", "IBIT"), trade("2026-08-25", "IBIT")]),
        lambda e: e["traded"] == 2 and "有成交" in e["why"] and "IBIT" in e["why"],
    ),
    (
        "别把别的日子的成交算进今天",
        dict(date="2026-08-25", net_liq=100000, cash=1000,
             positions=pos(VOO=80.0, IBIT=15.0), targets=TARGETS,
             trades=[trade("2026-07-13", "IBIT")]),
        lambda e: e["traded"] == 0 and "有成交" not in e["why"],
    ),
    (
        "没有目标配置也不能崩",
        dict(date="2026-08-25", net_liq=100000, cash=1000,
             positions=pos(VOO=100.0), targets=None, trades=None),
        lambda e: "未设目标配置" in e["why"] and e["gaps"] == {},
    ),
    (
        "净值/现金缺失时不能崩",
        dict(date="2026-08-25", net_liq=None, cash=None,
             positions=pos(VOO=80.0, IBIT=15.0), targets=TARGETS, trades=[]),
        lambda e: e["nav"] is None and e["cash"] is None and isinstance(e["why"], str),
    ),
    (
        "每笔都要带上当天权重快照",
        dict(date="2026-08-25", net_liq=100000, cash=1000,
             positions=pos(VOO=77.6, IBIT=17.6, SGOV=3.2), targets=TARGETS, trades=[]),
        lambda e: e["weights"] == {"IBIT": 17.6, "SGOV": 3.2, "VOO": 77.6},
    ),
]


def main():
    failures = []
    for name, kwargs, ok in CASES:
        try:
            entry = build_decision_entry(**kwargs)
        except Exception as exc:                                  # noqa: BLE001
            failures.append(f"{name}：抛出 {type(exc).__name__}: {exc}")
            continue
        if not ok(entry):
            failures.append(f"{name}：结果不符预期\n      why = {entry['why']!r}")

    # 门槛值本身也检一下：它跟 build_add_suggestions 的 gap>=2 是刻意同一个数，
    # 有人只改一边的话这里会提醒
    if REBALANCE_TOLERANCE != 2.0:
        failures.append(
            f"REBALANCE_TOLERANCE 被改成了 {REBALANCE_TOLERANCE}，"
            "请同步确认 build_add_suggestions 里 gap>=2 的门槛，两处必须一致")

    if failures:
        print(f"不通过（{len(failures)} 项）：")
        for f in failures:
            print(f"  ✗ {f}")
        return 1

    print(f"通过：{len(CASES)} 个决策日志用例全部符合预期")
    return 0


if __name__ == "__main__":
    sys.exit(main())
