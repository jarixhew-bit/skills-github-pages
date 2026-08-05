#!/usr/bin/env python3
"""ai_note.py 防编造逻辑的自检。

为什么单独测这一段：AI 点评显示在私密区，用户会拿它当账目看。模型编一个金额出来
（2026-07/08 已有两次因错误金额失去信任的前科）比当天没有点评严重得多，而这道防线
全靠 bad_numbers() 一个函数。这里用合成数据测它，不需要密码、不碰真实持仓，
所以可以挂 CI 每次改动都跑。

用法：python3 tools/check-ai-note.py     退出码 0 = 通过，1 = 有用例不符预期
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "trading"))
import ai_note as A  # noqa: E402

# 合成事实：数字特意选得好认，不用真实持仓
FACTS = {
    "净值": 100258.82,
    "现金": 1672.52,
    "现金占比": 1.7,
    "收益率百分比": {"ytd": 12.41, "mtd": 2.2, "1d": 1.06},
    "目标配置": {"VOO": 80, "IBIT": 20},
    "持仓": [
        {"标的": "VOO", "现价": 705.35, "市值": 80537.99, "占组合比例": 80.3, "浮动盈亏百分比": 28.14},
        {"标的": "IBIT", "现价": 36.24, "市值": 14770.32, "占组合比例": 14.7, "浮动盈亏百分比": -6.2},
    ],
    "系统已算出的操作提示": ["IBIT 低于目标配置 20%（现 14.7%），补齐约需 $5,314"],
}

# (应否拦截, 用例名, 文本)
CASES = [
    (False, "原样引用事实数字", "净值 100258.82 美元，年初至今 12.41%，补齐约需 5314 美元。"),
    (False, "带千分位写法", "净值 100,258.82 美元，IBIT 市值 14,770.32 美元。"),
    (False, "合理四舍五入", "净值约 100259 美元，IBIT 占 15%，VOO 占 80%。"),
    (False, "小整数措辞", "距离 20% 目标还差约 5 个百分点，继续按老规矩分批加仓即可。"),
    (False, "完全不带数字", "配置基本在目标线上，没什么需要动的，继续放着就行。"),
    (True, "编造金额", "IBIT 补齐约需 5200 美元。"),
    (True, "编造百分比", "VOO 今年上涨了 18.7%，表现强劲。"),
    (True, "接近但错的净值", "净值 100300 美元，表现稳健。"),
    (True, "编造股价", "IBIT 现价 36.91，低于你的成本。"),
    (True, "编造大额现金", "账户现金 12500 美元，缓冲充足。"),
    (True, "编造历史数字", "相比去年同期的 87654.32 美元有明显增长。"),
]


# (应否判为不完整, 用例名, 文本)
COMPLETENESS_CASES = [
    (True, "被截断的半句话", "截至2026-08-05，你的账户总净值为1"),
    (True, "结尾缺句号", "账户净值 100258.82 美元，配置基本在目标线上，IBIT 还差一点，"
                        "手头现金可以先补一部分，其余等后续资金到位"),
    (True, "只回了一个词", "好的。"),
    (True, "模型没听指令写了长文", "净值 100258.82 美元。" + "这段话在解释再平衡的原理，" * 30),
    (False, "正常的一段点评", "净值 100258.82 美元，年初至今 12.41%。VOO 占 80.3% 正在目标线上，"
                            "IBIT 占 14.7% 还差一截，补齐约需 5314 美元。手头现金先投一部分，"
                            "其余等资金到位再补。"),
    (False, "以问号结尾也算完整", "账户净值 100258.82 美元，配置没什么要动的。真要说的话，"
                                "只有 IBIT 那 5314 美元的缺口值得留意，不急着一次补完，你说呢？"),
]


def main():
    allowed = A.allowed_numbers(FACTS)
    failures = []

    for expect_bad, name, text in COMPLETENESS_CASES:
        reason = A.incomplete_reason(text)
        got_bad = reason is not None
        if got_bad != expect_bad:
            failures.append(
                f"[完整性] {name}：预期{'拒收' if expect_bad else '接受'}，"
                f"实际{'拒收（' + reason + '）' if got_bad else '接受'}\n    文本：{text[:50]}"
            )

    for expect_bad, name, text in CASES:
        bad = A.bad_numbers(text, allowed)
        got_bad = bool(bad)
        if got_bad != expect_bad:
            failures.append(
                f"{name}：预期{'拦截' if expect_bad else '通过'}，"
                f"实际{'拦截 ' + str(bad) if got_bad else '通过'}\n    文本：{text}"
            )

    if failures:
        print(f"不通过（{len(failures)} 个用例不符预期）：")
        for f in failures:
            print(f"  - {f}")
        print("\n改 ai_note.py 的 bad_numbers/allowed_numbers 前请先看这些用例——"
              "放宽这道防线等于允许模型把编造的金额写上页面。")
        return 1

    print(f"通过：{len(CASES)} 个防编造用例 + {len(COMPLETENESS_CASES)} 个完整性用例全部符合预期")
    return 0


if __name__ == "__main__":
    sys.exit(main())
