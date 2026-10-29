#!/usr/bin/env python3
"""配置偏离检查：标普500一边（VOO+CSPX+VUAA 合计）/ IBIT 市值占比有没有偏离长期政策超过门槛。

为什么有它（2026-10-29）：政策是 VOO 80% / IBIT 20%（SGOV 当现金缓冲不计入），
偏离目标超过 5 个百分点才需要再平衡。人不会每天去算，所以交给 GitHub Actions 定期查，
超限就开 issue（并走 Telegram）。零 Claude 用量。

两种用法：
    python3 tools/check-allocation.py --selftest   # 自检：固定假持仓手算，不碰任何真数据
    python3 tools/check-allocation.py --run        # CI 用：解密 data-private.enc 现算，
                                                    # 把状态写进 $GITHUB_OUTPUT，并产出通知正文
    python3 tools/check-allocation.py --text KEY   # 印出通知文案（workflow 取标题用）

数据来源：data-private.enc（trading-daily 每小时用 Flex 刷新的持仓底数×最新收盘价），
用 Secret ANALYZER_PW 解密。**不另打 IBKR Flex**——Flex 按 token 限流，见 .claude/notes/trading.md。

铁则：公开仓库的 Actions 日志与 issue 都是公开的，所以 --run 模式**什么数字都不印**，
通知文案里也不得含任何数字（自检会逐字拦）。

三种状态：ok（在范围内）/ breach（超限）/ missing（数据缺失——缺了绝不能当通过）。

同一个脚本另管「美国资产遗产税提醒」（2026-10-29 加）：用户是马来西亚居民，美国资产超过
60,000 美元身故时要交美国遗产税，提醒线放 50,000（留缓冲）。判定从保守：持仓里不在
policy.us_situs.non_us_symbols 的代码一律算美国资产，账户美元现金也算（IB LLC 是美国券商，
现金是否算美国资产未查证）。状态 ok / over（>= 提醒线就算 over）/ missing，用 evaluate_us_situs()。
同样只印状态不印数字。
边界：恰好偏离 band 判在范围内，严格超过才算超限。
"""
import argparse
import importlib.util
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
POLICY_PATH = os.path.join(REPO, "trading", "allocation-policy.json")
PRIVATE_PATH = os.environ.get("ALLOC_PRIVATE_PATH") or os.path.join(REPO, "trading", "data-private.enc")
EPS = 1e-9  # 浮点误差：恰好 5 个百分点（如 25% 对 20%）算出来可能是 0.05000000000000002

PAGE = "https://jarixhew-bit.github.io/skills-github-pages/trading/"

# 通知文案。**不得含任何数字**（金额、股数、百分比一律不写）——自检会检查。
TEXT = {
    "breach-title": "配置偏离超过门槛，请查看",
    "breach-body": (
        "标普一边（VOO／CSPX／VUAA 合计）与 IBIT 的市值占比，偏离长期配置政策已超过门槛，该考虑再平衡了。\n\n"
        "请打开页面查看当前占比，并对照政策书决定怎么调：\n"
        f"{PAGE}\n\n"
        "做法提示：新入金优先买低配的那一边，尽量不卖。\n\n"
        "（本 issue 刻意不写任何数字，因为仓库是公开的。回到范围内后会自动关闭。）\n"
    ),
    "breach-tg-bad": "配置偏离超过门槛，请打开交易页面查看（数字不外发）。",
    "breach-tg-ok": "配置已回到范围内。",
    "missing-title": "配置检查缺数据，请查看",
    "missing-body": (
        "配置偏离检查这次拿不到可用的持仓数据，所以没法判断有没有偏离。\n\n"
        "常见原因：IBKR 持仓同步（Flex）连续失败、密码 Secret 缺失或不对、持仓里标普一边（VOO／CSPX／VUAA）一只都没有，或缺了 IBIT。\n"
        "先看是否已有「持仓同步失败」的 issue，再看交易页面是否正常显示：\n"
        f"{PAGE}\n\n"
        "（本 issue 刻意不写任何数字。数据恢复后会自动关闭。）\n"
    ),
    "missing-tg-bad": "配置检查缺数据，没法判断是否偏离，请看仓库 issue。",
    "missing-tg-ok": "配置检查的数据已恢复。",
    # 美国资产遗产税提醒（文案同样不得含任何数字）
    "us-title": "美国资产已超过提醒线，请查看",
    "us-body": (
        "美国资产已超过提醒线：比特币部分可考虑改买非美国的 iShares Bitcoin ETP（BTCN），先看政策书再决定。\n\n"
        "背景：马来西亚居民持有的美国资产超过免税额，身故时要交美国遗产税。\n"
        "本检查把持仓里所有非白名单代码和账户美元现金都保守地算作美国资产。\n"
        "对照政策书，决定要不要把美国上市的比特币基金换成瑞士发行的 BTCN：\n"
        f"{PAGE}\n\n"
        "（本 issue 刻意不写任何数字，因为仓库是公开的。回到提醒线以下后会自动关闭。）\n"
    ),
    "us-tg-bad": "美国资产已超过提醒线：比特币部分可考虑改买非美国的 iShares Bitcoin ETP（BTCN），先看政策书再决定。",
    "us-tg-ok": "美国资产已回到提醒线以下。",
    "us-missing-title": "美国资产检查缺数据，请查看",
    "us-missing-body": (
        "美国资产提醒这次拿不到可用的持仓或现金数据，所以没法判断有没有超过提醒线。\n\n"
        "常见原因：IBKR 持仓同步（Flex）连续失败、密码 Secret 缺失或不对、现金字段缺失。\n"
        f"先看交易页面是否正常显示：\n{PAGE}\n\n"
        "（本 issue 刻意不写任何数字。数据恢复后会自动关闭。）\n"
    ),
    "us-missing-tg-bad": "美国资产检查缺数据，没法判断是否超线，请看仓库 issue。",
    "us-missing-tg-ok": "美国资产检查的数据已恢复。",
}


# ---------------- 纯函数 ----------------

def _num(v):
    """合法的市值：有限的数字（不含 bool）。其余一律当缺失。"""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    if v != v or v in (float("inf"), float("-inf")):
        return None
    return float(v)


def evaluate(values, policy):
    """values: {symbol: 市值}；policy: 读自 allocation-policy.json 的 dict。

    每一「边」（targets 的键）的市值 = members 里列出的代码市值合计（标普500一边可以
    是 VOO、CSPX、VUAA 任意组合）。没写 members 的边，就用边名本身当代码。
    回传 dict：status in {"ok","breach","missing"}，另有 shares（各边占比，缺失时为 None）、
    deviations（各边偏离，单位小数）。SGOV 等 excluded 标的完全不参与。
    缺失判定：某一边的所有代码都拿不到合法市值才算 missing（换仓期间 VOO 没了但 CSPX 在，不算缺）。
    """
    targets = policy["targets"]
    members = policy.get("members") or {}
    band = float(policy["band"])
    vals = {}
    for side in targets:
        got = []
        for sym in members.get(side) or [side]:
            v = _num((values or {}).get(sym))
            if v is not None and v >= 0:
                got.append(v)
        if not got:
            return {"status": "missing", "shares": None, "deviations": None,
                    "reason": f"{side} 一边的代码全部缺失或不合法"}
        vals[side] = sum(got)
    total = sum(vals.values())
    if total <= 0:
        return {"status": "missing", "shares": None, "deviations": None,
                "reason": "两边合计不为正"}
    shares = {s: vals[s] / total for s in targets}
    devs = {s: shares[s] - float(targets[s]) for s in targets}
    breach = any(abs(d) > band + EPS for d in devs.values())
    return {"status": "breach" if breach else "ok", "shares": shares, "deviations": devs}


def evaluate_us_situs(values, cash, policy):
    """美国资产合计是否到提醒线。values: {代码: 市值}；cash: 账户现金（美元）；policy 读自政策文件。

    保守：不在 non_us_symbols 里的代码一律算美国资产（含未知代码）；现金也算（负现金/融资不抵扣，
    当 0）。>= 提醒线就是 over。
    missing：values 不是 dict 或为空；某个会计入的代码市值不合法；现金不合法。
    例外：已经确定 over 时（缺的东西只会让合计更大）直接回 over，不因缺现金漏报。
    """
    us = policy["us_situs"]
    line = float(us["alert_usd"])
    non_us = {str(x).upper() for x in us["non_us_symbols"]}
    if not isinstance(values, dict) or not values:
        return {"status": "missing", "reason": "持仓为空或格式不对"}
    total = 0.0
    for sym, v in values.items():
        if str(sym).upper() in non_us:
            continue
        n = _num(v)
        if n is None or n < 0:
            return {"status": "missing", "reason": "有美国资产代码的市值不合法"}
        total += n
    c = _num(cash)
    if c is None:
        if total >= line - EPS:
            return {"status": "over"}
        return {"status": "missing", "reason": "现金缺失"}
    total += max(c, 0.0)
    return {"status": "over" if total >= line - EPS else "ok"}


# ---------------- 取数（只在 --run 用） ----------------

def load_policy(path=POLICY_PATH):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_values_from_private(password):
    """解密 data-private.enc，回传 {symbol: value}。失败抛异常（由调用方判成 missing）。"""
    return load_private(password)[0]


def load_private(password):
    """解密 data-private.enc，回传 ({symbol: value}, 现金)。失败抛异常。"""
    spec = importlib.util.spec_from_file_location("analyzer", os.path.join(REPO, "trading", "analyzer.py"))
    analyzer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(analyzer)
    with open(PRIVATE_PATH, encoding="utf-8") as f:
        data = analyzer.decrypt_json(f.read(), password)
    vals = {p["symbol"]: p.get("value") for p in data.get("positions") or []}
    return vals, (data.get("account") or {}).get("cash")


def write_outputs(breach_state, missing_state, outdir, us_state="skip", us_missing_state="skip"):
    """各 state: ok | bad | skip。写 GITHUB_OUTPUT 与通知正文档。"""
    os.makedirs(outdir, exist_ok=True)
    for k in ("breach", "missing", "us", "us-missing"):
        with open(os.path.join(outdir, f"{k}-body.md"), "w", encoding="utf-8") as f:
            f.write(TEXT[f"{k}-body"])
    out = os.environ.get("GITHUB_OUTPUT")
    lines = [f"breach={breach_state}", f"missing={missing_state}",
             f"us={us_state}", f"usmissing={us_missing_state}"]
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    print("；".join(lines))


def run(outdir):
    pw = (os.environ.get("ANALYZER_PW") or "").strip()
    policy = None
    values = cash = None
    try:
        policy = load_policy()
        if not pw:
            raise RuntimeError("no password")
        values, cash = load_private(pw)
        res = evaluate(values, policy)
    except Exception as e:  # 解密失败、文件缺失、格式变了：一律判数据缺失，不印细节（防泄漏）
        print(f"取数失败（{type(e).__name__}），判为数据缺失")
        res = {"status": "missing"}
    st = res["status"]
    print(f"状态：{st}")  # 只印状态，不印任何数字
    # 美国资产提醒：和配置偏离共用同一份数据，独立判定
    try:
        us = evaluate_us_situs(values, cash, policy)["status"]
    except Exception:
        us = "missing"
    print(f"美国资产状态：{us}")
    # missing：开缺数据 issue，over 的 issue 保持不动（不能因为看不到就把它关掉）
    us_state = {"ok": "ok", "over": "bad", "missing": "skip"}[us]
    us_missing = "bad" if us == "missing" else "ok"
    if st == "missing":
        write_outputs("skip", "bad", outdir, us_state, us_missing)
    elif st == "breach":
        write_outputs("bad", "ok", outdir, us_state, us_missing)
    else:
        write_outputs("ok", "ok", outdir, us_state, us_missing)
    return 0


# ---------------- 自检 ----------------

POL = {"targets": {"SP500": 0.8, "IBIT": 0.2},
       "members": {"SP500": ["VOO", "CSPX", "VUAA"], "IBIT": ["IBIT"]},
       "band": 0.05, "excluded": ["SGOV"]}


def selftest():
    fails = []

    def expect(name, cond, detail=""):
        if not cond:
            fails.append(f"{name} {detail}")

    def st(values):
        return evaluate(values, POL)["status"]

    # 1. 范围内：82578 / 18414 → IBIT 占 18.2%（手算 18414 / 100992 = 0.18233…）
    r = evaluate({"VOO": 82578, "IBIT": 18414}, POL)
    expect("范围内", r["status"] == "ok", r["status"])
    expect("占比手算", abs(r["shares"]["IBIT"] - 0.1823) < 5e-4, str(r["shares"]))
    expect("占比合计 1", abs(sum(r["shares"].values()) - 1) < 1e-12)
    # 2. 超限：IBIT 占 26% 与 14%（总额取 100000 好手算）
    expect("IBIT 26% 超限", st({"VOO": 74000, "IBIT": 26000}) == "breach")
    expect("IBIT 14% 超限", st({"VOO": 86000, "IBIT": 14000}) == "breach")
    # 3. 边界：恰好 5 个百分点在范围内（25% / 15%），略过一点就超限
    expect("边界 25% 在范围内", st({"VOO": 75000, "IBIT": 25000}) == "ok")
    expect("边界 15% 在范围内", st({"VOO": 85000, "IBIT": 15000}) == "ok")
    expect("边界外 25.1% 超限", st({"VOO": 74900, "IBIT": 25100}) == "breach")
    expect("边界外 14.9% 超限", st({"VOO": 85100, "IBIT": 14900}) == "breach")
    # 4. 缺失：VOO 或 IBIT 不在 / 为 None / 非数字，判缺失，不是通过
    expect("缺 IBIT", st({"VOO": 80000}) == "missing")
    expect("缺 VOO", st({"IBIT": 20000}) == "missing")
    expect("IBIT 为 None", st({"VOO": 80000, "IBIT": None}) == "missing")
    expect("IBIT 为字串", st({"VOO": 80000, "IBIT": "x"}) == "missing")
    expect("全空", st({}) == "missing")
    expect("None 输入", st(None) == "missing")
    expect("两者皆零", st({"VOO": 0, "IBIT": 0}) == "missing")
    expect("负值", st({"VOO": 80000, "IBIT": -5}) == "missing")
    # 5. SGOV 不计入：再大的 SGOV 也不改变结果
    expect("SGOV 不计入", st({"VOO": 80000, "IBIT": 20000, "SGOV": 9_999_999}) == "ok")
    r2 = evaluate({"VOO": 82578, "IBIT": 18414, "SGOV": 5e6}, POL)
    expect("SGOV 不动占比", abs(r2["shares"]["IBIT"] - r["shares"]["IBIT"]) < 1e-12)
    # 5b. 标普500一边是多代码合计：VOO+CSPX 混持、只有 CSPX、VOO+CSPX+VUAA 三者都有
    r3 = evaluate({"VOO": 40000, "CSPX": 40000, "IBIT": 20000}, POL)
    expect("VOO+CSPX 混持合计", r3["status"] == "ok" and abs(r3["shares"]["SP500"] - 0.8) < 1e-12, str(r3))
    expect("只有 CSPX", st({"CSPX": 80000, "IBIT": 20000}) == "ok")
    expect("只有 VUAA", st({"VUAA": 80000, "IBIT": 20000}) == "ok")
    expect("三者合计", st({"VOO": 30000, "CSPX": 30000, "VUAA": 20000, "IBIT": 20000}) == "ok")
    expect("合计后仍会超限", st({"VOO": 30000, "CSPX": 30000, "IBIT": 40000}) == "breach")
    expect("S&P 三者全无判缺失", st({"IBIT": 20000, "SGOV": 50000}) == "missing")
    expect("S&P 三者全无但有别的代码", st({"SPY": 80000, "IBIT": 20000}) == "missing")
    expect("S&P 一边有但 IBIT 无", st({"CSPX": 80000}) == "missing")
    expect("S&P 某成员非法被忽略", st({"VOO": "x", "CSPX": 80000, "IBIT": 20000}) == "ok")
    # 6. 清仓 IBIT（值为 0）是真实状态，应判超限而不是缺失
    expect("IBIT 清仓判超限", st({"VOO": 80000, "IBIT": 0}) == "breach")

    # 7. 通知文案不得含任何数字（含全角数字）；两个 issue 的标题不能相同
    for k, t in TEXT.items():
        bad = [c for c in t if c.isdigit()]
        expect(f"文案无数字:{k}", not bad, f"含 {bad}")
    titles = [TEXT[k] for k in TEXT if k.endswith("-title")]
    expect("标题不重名", len(titles) == len(set(titles)))
    expect("US 文案含 BTCN 与 iShares Bitcoin ETP", "BTCN" in TEXT["us-tg-bad"] and "iShares Bitcoin ETP" in TEXT["us-tg-bad"])

    # 8. 政策文件：目标合计 1、不含持仓数量/金额类字段
    try:
        pol = load_policy()
        expect("政策目标合计为 1", abs(sum(pol["targets"].values()) - 1) < 1e-12)
        expect("政策两边是 SP500+IBIT", set(pol["targets"]) == {"SP500", "IBIT"})
        expect("S&P 一边含 VOO/CSPX/VUAA", set(pol["members"]["SP500"]) == {"VOO", "CSPX", "VUAA"})
        expect("IBIT 一边只有 IBIT", pol["members"]["IBIT"] == ["IBIT"])
        expect("SGOV 不在任何一边", not ({"SGOV"} & {s for m in pol["members"].values() for s in m}))
        expect("evaluate 吃真政策文件", evaluate({"CSPX": 80000, "IBIT": 20000}, pol)["status"] == "ok")
        expect("政策 band 为 0.05", abs(pol["band"] - 0.05) < 1e-12)
        expect("SGOV 不计入", "SGOV" in pol.get("excluded", []))
        usp = pol["us_situs"]
        expect("US 提醒线为 50000", usp["alert_usd"] == 50000)
        expect("US 非美国清单", set(usp["non_us_symbols"]) == {"CSPX", "VUAA", "SXR8", "IB1T", "BTCN"})
        expect("US 保守：VOO/IBIT/SGOV 不在白名单",
               not ({"VOO", "IBIT", "SGOV"} & set(usp["non_us_symbols"])))
        expect("US 吃真政策文件", evaluate_us_situs({"IBIT": 49000}, 1000, pol)["status"] == "over")
        extra = set(pol) - {"_说明", "targets", "members", "band", "excluded", "us_situs"}
        expect("政策无多余字段（防混入持仓）", not extra, str(extra))
    except Exception as e:
        fails.append(f"政策文件读取失败：{e}")

    # 8b. 美国资产遗产税提醒（提醒线 50000，保守：未知代码与现金都算）
    UP = {"us_situs": {"alert_usd": 50000, "non_us_symbols": ["CSPX", "VUAA", "SXR8", "IB1T", "BTCN"]}}

    def us(values, cash):
        return evaluate_us_situs(values, cash, UP)["status"]

    expect("US IBIT+SGOV 低于线", us({"IBIT": 20000, "SGOV": 29000}, 0) == "ok")
    expect("US IBIT+SGOV+现金刚好线", us({"IBIT": 20000, "SGOV": 20000}, 10000) == "over")
    expect("US 差一块不到线", us({"IBIT": 20000, "SGOV": 20000}, 9999) == "ok")
    expect("US 现金单独计入", us({"IBIT": 1000}, 49000) == "over")
    expect("US CSPX 不计入", us({"CSPX": 900000, "IBIT": 20000}, 1000) == "ok")
    expect("US BTCN 不计入", us({"BTCN": 900000, "IB1T": 900000, "VUAA": 9e6, "SXR8": 9e6, "IBIT": 10}, 0) == "ok")
    expect("US VOO 计入", us({"VOO": 50000}, 0) == "over")
    expect("US 未知代码计入", us({"XYZ": 50000, "CSPX": 1}, 0) == "over")
    expect("US 代码大小写不敏感", us({"cspx": 900000}, 0) == "ok")
    expect("US 负现金不抵扣", us({"IBIT": 30000}, -999999) == "ok")
    expect("US 缺数据 None", us(None, 0) == "missing")
    expect("US 空持仓", us({}, 0) == "missing")
    expect("US 市值非法", us({"IBIT": "x"}, 0) == "missing")
    expect("US 缺现金且未到线", us({"IBIT": 100}, None) == "missing")
    expect("US 缺现金但持仓已超线仍报 over", us({"IBIT": 60000}, None) == "over")
    expect("US 全是非美国资产只有现金", us({"CSPX": 5}, 100) == "ok")

    # 9. --run 的失败路径：没密码 → 数据缺失 → 开缺数据 issue、偏离 issue 不动
    with tempfile.TemporaryDirectory() as d:
        gh = os.path.join(d, "out.txt")
        old = {k: os.environ.get(k) for k in ("ANALYZER_PW", "GITHUB_OUTPUT")}
        os.environ.pop("ANALYZER_PW", None)
        os.environ["GITHUB_OUTPUT"] = gh
        try:
            run(os.path.join(d, "o"))
            got = open(gh, encoding="utf-8").read()
            expect("无密码 → missing=bad", "missing=bad" in got and "breach=skip" in got
                   and "us=skip" in got and "usmissing=bad" in got, got)
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    # 10. 端到端：用 analyzer 真实的加密函数造一个假 data-private.enc，走完整 --run 路径
    try:
        spec = importlib.util.spec_from_file_location("analyzer", os.path.join(REPO, "trading", "analyzer.py"))
        an = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(an)
        an.encrypt_json({}, "x")  # 缺 cryptography 会在这里抛
    except Exception as e:
        print(f"（跳过端到端：本机缺 cryptography？{type(e).__name__}）")
        an = None
    if an:
        cases = [("端到端 范围内", 82578, 18414, "breach=ok", "missing=ok"),
                 ("端到端 超限", 74000, 26000, "breach=bad", "missing=ok")]
        for name, voo, ibit, w1, w2 in cases:
            # 假持仓：VOO 全算美国资产，VOO+IBIT+SGOV 远超线 → us=bad
            with tempfile.TemporaryDirectory() as d:
                enc = os.path.join(d, "p.enc")
                fake = {"account": {"cash": 100}, "positions": [{"symbol": "VOO", "value": voo}, {"symbol": "IBIT", "value": ibit},
                                      {"symbol": "SGOV", "value": 50000}]}
                open(enc, "w", encoding="utf-8").write(an.encrypt_json(fake, "pw-test"))
                gh = os.path.join(d, "out.txt")
                globals()["PRIVATE_PATH"] = enc
                old = {k: os.environ.get(k) for k in ("ANALYZER_PW", "GITHUB_OUTPUT")}
                os.environ["ANALYZER_PW"] = "pw-test"
                os.environ["GITHUB_OUTPUT"] = gh
                try:
                    run(os.path.join(d, "o"))
                    got = open(gh, encoding="utf-8").read()
                    expect(name, w1 in got and w2 in got and "us=bad" in got and "usmissing=ok" in got, got)
                    os.environ["ANALYZER_PW"] = "wrong"  # 密码不对 → 缺失，不是通过
                    open(gh, "w").close()
                    run(os.path.join(d, "o"))
                    expect(name + "（错密码）", "missing=bad" in open(gh, encoding="utf-8").read())
                finally:
                    for k, v in old.items():
                        if v is None:
                            os.environ.pop(k, None)
                        else:
                            os.environ[k] = v

    if fails:
        print("check-allocation 自检失败：")
        for f in fails:
            print("  -", f)
        return 1
    print("check-allocation 自检通过")
    return 0


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--selftest", action="store_true")
    g.add_argument("--run", action="store_true")
    g.add_argument("--text", metavar="KEY")
    ap.add_argument("--outdir", default=os.path.join(tempfile.gettempdir(), "allocation"))
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if a.text:
        print(TEXT[a.text])
        return 0
    return run(a.outdir)


if __name__ == "__main__":
    sys.exit(main())
