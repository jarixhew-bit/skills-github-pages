#!/usr/bin/env python3
"""配置偏离检查：VOO / IBIT 市值占比有没有偏离长期政策超过门槛。

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
        "VOO 与 IBIT 的市值占比，偏离长期配置政策已超过门槛，该考虑再平衡了。\n\n"
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
        "常见原因：IBKR 持仓同步（Flex）连续失败、密码 Secret 缺失或不对、持仓里缺了 VOO 或 IBIT。\n"
        "先看是否已有「持仓同步失败」的 issue，再看交易页面是否正常显示：\n"
        f"{PAGE}\n\n"
        "（本 issue 刻意不写任何数字。数据恢复后会自动关闭。）\n"
    ),
    "missing-tg-bad": "配置检查缺数据，没法判断是否偏离，请看仓库 issue。",
    "missing-tg-ok": "配置检查的数据已恢复。",
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

    回传 dict：status in {"ok","breach","missing"}，另有 shares（占比，缺失时为 None）、
    deviations（各标的偏离，单位小数）。SGOV 等 excluded 标的完全不参与。
    """
    targets = policy["targets"]
    band = float(policy["band"])
    vals = {}
    for sym in targets:
        v = _num((values or {}).get(sym))
        if v is None or v < 0:
            return {"status": "missing", "shares": None, "deviations": None,
                    "reason": f"{sym} 缺失或不合法"}
        vals[sym] = v
    total = sum(vals.values())
    if total <= 0:
        return {"status": "missing", "shares": None, "deviations": None,
                "reason": "两者合计不为正"}
    shares = {s: vals[s] / total for s in targets}
    devs = {s: shares[s] - float(targets[s]) for s in targets}
    breach = any(abs(d) > band + EPS for d in devs.values())
    return {"status": "breach" if breach else "ok", "shares": shares, "deviations": devs}


# ---------------- 取数（只在 --run 用） ----------------

def load_policy(path=POLICY_PATH):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_values_from_private(password):
    """解密 data-private.enc，回传 {symbol: value}。失败抛异常（由调用方判成 missing）。"""
    spec = importlib.util.spec_from_file_location("analyzer", os.path.join(REPO, "trading", "analyzer.py"))
    analyzer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(analyzer)
    with open(PRIVATE_PATH, encoding="utf-8") as f:
        data = analyzer.decrypt_json(f.read(), password)
    return {p["symbol"]: p.get("value") for p in data.get("positions") or []}


def write_outputs(breach_state, missing_state, outdir):
    """breach_state / missing_state: ok | bad | skip。写 GITHUB_OUTPUT 与通知正文档。"""
    os.makedirs(outdir, exist_ok=True)
    for k in ("breach", "missing"):
        with open(os.path.join(outdir, f"{k}-body.md"), "w", encoding="utf-8") as f:
            f.write(TEXT[f"{k}-body"])
    out = os.environ.get("GITHUB_OUTPUT")
    lines = [f"breach={breach_state}", f"missing={missing_state}"]
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    print("；".join(lines))


def run(outdir):
    pw = (os.environ.get("ANALYZER_PW") or "").strip()
    try:
        policy = load_policy()
        if not pw:
            raise RuntimeError("no password")
        values = load_values_from_private(pw)
        res = evaluate(values, policy)
    except Exception as e:  # 解密失败、文件缺失、格式变了：一律判数据缺失，不印细节（防泄漏）
        print(f"取数失败（{type(e).__name__}），判为数据缺失")
        res = {"status": "missing"}
    st = res["status"]
    print(f"状态：{st}")  # 只印状态，不印任何数字
    if st == "missing":
        # 数据缺失：开缺数据 issue；偏离 issue 保持不动（不能因为看不到就把它关掉）
        write_outputs("skip", "bad", outdir)
    elif st == "breach":
        write_outputs("bad", "ok", outdir)
    else:
        write_outputs("ok", "ok", outdir)
    return 0


# ---------------- 自检 ----------------

POL = {"targets": {"VOO": 0.8, "IBIT": 0.2}, "band": 0.05, "excluded": ["SGOV"]}


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
    # 6. 清仓 IBIT（值为 0）是真实状态，应判超限而不是缺失
    expect("IBIT 清仓判超限", st({"VOO": 80000, "IBIT": 0}) == "breach")

    # 7. 通知文案不得含任何数字（含全角数字）；两个 issue 的标题不能相同
    for k, t in TEXT.items():
        bad = [c for c in t if c.isdigit()]
        expect(f"文案无数字:{k}", not bad, f"含 {bad}")
    expect("标题不重名", TEXT["breach-title"] != TEXT["missing-title"])

    # 8. 政策文件：目标合计 1、不含持仓数量/金额类字段
    try:
        pol = load_policy()
        expect("政策目标合计为 1", abs(sum(pol["targets"].values()) - 1) < 1e-12)
        expect("政策带 VOO+IBIT", set(pol["targets"]) == {"VOO", "IBIT"})
        expect("政策 band 为 0.05", abs(pol["band"] - 0.05) < 1e-12)
        expect("SGOV 不计入", "SGOV" in pol.get("excluded", []))
        extra = set(pol) - {"_说明", "targets", "band", "excluded"}
        expect("政策无多余字段（防混入持仓）", not extra, str(extra))
    except Exception as e:
        fails.append(f"政策文件读取失败：{e}")

    # 9. --run 的失败路径：没密码 → 数据缺失 → 开缺数据 issue、偏离 issue 不动
    with tempfile.TemporaryDirectory() as d:
        gh = os.path.join(d, "out.txt")
        old = {k: os.environ.get(k) for k in ("ANALYZER_PW", "GITHUB_OUTPUT")}
        os.environ.pop("ANALYZER_PW", None)
        os.environ["GITHUB_OUTPUT"] = gh
        try:
            run(os.path.join(d, "o"))
            got = open(gh, encoding="utf-8").read()
            expect("无密码 → missing=bad", "missing=bad" in got and "breach=skip" in got, got)
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
            with tempfile.TemporaryDirectory() as d:
                enc = os.path.join(d, "p.enc")
                fake = {"positions": [{"symbol": "VOO", "value": voo}, {"symbol": "IBIT", "value": ibit},
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
                    expect(name, w1 in got and w2 in got, got)
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
