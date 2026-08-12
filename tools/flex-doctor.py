#!/usr/bin/env python3
"""IBKR Flex 通道体检器（只在 GitHub Actions 上跑，因为凭证在 Secret 里）。

背景（2026-08-12）：Flex 持续回 ErrorCode 1001，但已排除五个假设——
query 定义完整（网页手动跑得出完整报表）、凭证有效（1001 不是认证错误）、
Secret 已重设、非 IBKR 维护时段、帐户本身正常。
最关键的对比：**同一分钟内，网页跑得出来、Web Service 拿不到**，
所以问题就在 Web Service 这条通道上。

本脚本把「只有拿得到 token 的人才能做的测试」搬进 CI，让人不必手动贴网址。
**绝不打印凭证本身**——只打印长度与字符类别，这两者足以抓出最常见的
贴错（多了换行、少了字元、贴成 query 名字而不是 ID），又不泄漏内容。

用法：GITHUB Actions 里 `python3 tools/flex-doctor.py`
"""
import os
import re
import sys
import time

import requests

TOK = os.environ.get("IBKR_FLEX_TOKEN", "")
QID = os.environ.get("IBKR_FLEX_QUERY_ID", "")

# IBKR 有两个对等的 Flex 服务主机，其中一个出问题时另一个通常还活着。
# 现有程式只用 gdcdyn，所以「换一台主机会不会就好了」从来没被验证过。
HOSTS = [
    "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService",
    "https://ndcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService",
]


def describe(name: str, v: str) -> None:
    """只报长度与字符组成，不报内容。"""
    if not v:
        print(f"  {name}: 【没有设定】")
        return
    stripped = v.strip()
    notes = []
    if v != stripped:
        notes.append(f"⚠ 首尾有空白或换行（原长 {len(v)}，去掉后 {len(stripped)}）")
    if not stripped.isdigit():
        kinds = sorted(set(re.sub(r"[0-9]", "", stripped)))
        notes.append(f"⚠ 含非数字字符：{kinds}")
    print(f"  {name}: 长度 {len(v)}，{'纯数字' if stripped.isdigit() else '非纯数字'}"
          + ("；" + "；".join(notes) if notes else "；看起来正常"))


def probe(host: str, tok: str, qid: str, label: str) -> str:
    """送一次 SendRequest，回传结果摘要。绝不打印 URL（URL 带 token）。"""
    try:
        r = requests.get(f"{host}.SendRequest",
                         params={"v": "3", "t": tok, "q": qid, "fp": "1"},
                         timeout=30)
    except Exception as e:
        print(f"  [{label}] 连不上：{type(e).__name__} {e}")
        return "error"
    body = r.text.strip()
    ref = re.search(r"<ReferenceCode>(\d+)</ReferenceCode>", body)
    code = re.search(r"<ErrorCode>(\d+)</ErrorCode>", body)
    if ref:
        print(f"  [{label}] ✓ 成功拿到 ReferenceCode（长度 {len(ref.group(1))}）")
        return "ok"
    print(f"  [{label}] ✗ HTTP {r.status_code}，ErrorCode={code.group(1) if code else '无'}")
    print(f"        完整回应：{body[:300]}")
    return code.group(1) if code else "unknown"


def main() -> int:
    print("=" * 60)
    print("第 1 项：凭证卫生检查（只看长度与字符类别，不看内容）")
    describe("IBKR_FLEX_TOKEN", TOK)
    describe("IBKR_FLEX_QUERY_ID", QID)

    if not TOK or not QID:
        print("\n凭证没设定，后面不用测了。")
        return 1

    print("\n" + "=" * 60)
    print("第 2 项：两台 IBKR 主机各试一次")
    print("（现有程式只用 gdcdyn，ndcdyn 是对等主机，从没被验证过）")
    results = {}
    for host in HOSTS:
        name = host.split("//")[1].split(".")[0]
        results[name] = probe(host, TOK.strip(), QID.strip(), name)

    print("\n" + "=" * 60)
    print("第 3 项：去掉首尾空白后再试（测『Secret 贴进去时多了换行』）")
    if TOK != TOK.strip() or QID != QID.strip():
        print("  凭证原本就有首尾空白——上一项已经是去掉空白后的结果。")
    else:
        print("  凭证没有首尾空白，此项不适用。")

    print("\n" + "=" * 60)
    print("第 4 项：等 180 秒后重试（测『两个 workflow 撞冷却期』）")
    print("  现有重试只等 30 秒 × 4 次，若 IBKR 的冷却期比这长，就永远等不到。")
    time.sleep(180)
    late = probe(HOSTS[0], TOK.strip(), QID.strip(), "gdcdyn（等 180 秒后）")

    print("\n" + "=" * 60)
    print("结论")
    if "ok" in results.values() or late == "ok":
        who = [k for k, v in results.items() if v == "ok"]
        print(f"  ✓ 通道是通的：{who or ['等久一点就通']}")
        print("  → 改 flex_account.py 用能通的那条路即可，不必动 IBKR 设定。")
    else:
        print("  ✗ 两台主机、拉长等待都拿不到 ReferenceCode。")
        print("  → 凭证若卫生检查也正常，那就只剩『在 IBKR 重建 token/query』这条路。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
