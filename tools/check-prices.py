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
import json
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

    print("\n【4】非美股上市线（伦敦 CSPX/VUAA）的币种／量级护栏（2026-10-29 建）")
    # 基准 SPY 约 772；CSPX 美元线约 835（比值 1.08），VUAA 约 150（比值 0.194）
    spy = good_bars(base=700.0)
    spy[-1][4] = 772.0
    spy[-1][1:4] = [771.0, 773.0, 770.0]

    def line(close):
        b = good_bars(base=close * 0.9)
        b[-1] = [day(0), close, close + 1, close - 1, close, 1]
        return b

    g = lambda sym, close, ratio: fp.usd_guard(sym, line(close), spy, ratio)
    ok("CSPX 美元量级（约 835）接受", g("CSPX", 835.0, 1.0815) is None, g("CSPX", 835.0, 1.0815))
    ok("VUAA 美元量级（约 150）接受", g("VUAA", 150.0, 0.1940) is None, g("VUAA", 150.0, 0.1940))
    ok("CSPX GBp 量级（便士，约 65800）拒绝", g("CSPX", 65800.0, 1.0815) is not None)
    ok("VUAA GBp 量级（约 11800）拒绝", g("VUAA", 11800.0, 0.1940) is not None)
    ok("CSPX GBP 量级（约 660，差 1.27 倍）拒绝", g("CSPX", 660.0, 1.0815) is not None)
    ok("VUAA GBP 量级（约 118）拒绝", g("VUAA", 118.0, 0.1940) is not None)
    ok("基准行情缺失时拒绝（宁缺勿错）",
       fp.usd_guard("CSPX", line(835.0), None, 1.0815) is not None)

    # Yahoo meta.currency：GBp／GBP 直接抛错，USD 放行
    def yahoo_with(cur):
        ts = [1_700_000_000 + 86400 * i for i in range(3)]
        body = json.dumps({"chart": {"result": [{"meta": {"currency": cur}, "timestamp": ts,
            "indicators": {"quote": [{"open": [1, 1, 1], "high": [2, 2, 2], "low": [1, 1, 1],
                                      "close": [1.5, 1.5, 1.5], "volume": [1, 1, 1]}]}}]}})
        orig = fp.http_get
        fp.http_get = lambda url, timeout=30: body
        try:
            return fp.from_yahoo("CSPX.L")
        finally:
            fp.http_get = orig

    for cur in ("GBp", "GBP"):
        try:
            yahoo_with(cur)
            ok(f"Yahoo 币种 {cur} 拒绝", False, "未抛错")
        except ValueError:
            ok(f"Yahoo 币种 {cur} 拒绝", True)
    ok("Yahoo 币种 USD 放行", len(yahoo_with("USD")) == 3)

    # universe 登记：两档都有 contract_id、行情代码覆盖、护栏，且比值能让真实美元线通过
    with open(os.path.join(BASE, "trading", "universe.json"), encoding="utf-8") as f:
        uni = {u["symbol"]: u for u in json.load(f)["tickers"]}
    for sym, cid, st, ya in (("CSPX", 76023663, "cspx.uk", "CSPX.L"), ("VUAA", 366244335, "vuaa.uk", "VUAA.L")):
        u = uni.get(sym) or {}
        ok(f"universe 登记 {sym}（合约号／stooq／yahoo／护栏）",
           u.get("contract_id") == cid and u.get("stooq") == st and u.get("yahoo") == ya
           and u.get("usd_guard", {}).get("ref") == "SPY", u)

    print("\n【5】持仓含 CSPX 时按最新收盘价计市值（不是成本价）")
    import shutil
    import subprocess
    import tempfile
    sys.path.insert(0, os.path.join(BASE, "trading"))
    import analyzer
    tmp = tempfile.mkdtemp(prefix="analyzer-cspx-")
    try:
        os.makedirs(os.path.join(tmp, "history"))
        shutil.copy(os.path.join(BASE, "trading", "analyzer.py"), tmp)
        with open(os.path.join(tmp, "universe.json"), "w", encoding="utf-8") as f:
            json.dump({"tickers": [{"symbol": "CSPX", "name": "t", "etf": True, "contract_id": 76023663}]}, f)
        bars = good_bars(base=700.0)
        last_close = bars[-1][4]
        with open(os.path.join(tmp, "history", "CSPX.json"), "w", encoding="utf-8") as f:
            json.dump({"symbol": "CSPX", "currency": "USD", "bars": bars}, f)
        pw = "selftest-pw"
        qty, cost = 10, 500.0
        with open(os.path.join(tmp, "state.enc"), "w", encoding="utf-8") as f:
            f.write(analyzer.encrypt_json({"trades": [], "nav_series": [], "cash": 0, "twr_base": None,
                "positions": [{"symbol": "CSPX", "qty": qty, "avg_price": cost}]}, pw))
        r = subprocess.run([sys.executable, os.path.join(tmp, "analyzer.py")], cwd=tmp,
                           env={**os.environ, "ANALYZER_PW": pw}, capture_output=True, text=True)
        ok("analyzer 在临时目录跑通", r.returncode == 0, r.stderr[-300:])
        priv = analyzer.decrypt_json(open(os.path.join(tmp, "data-private.enc"), encoding="utf-8").read(), pw)
        pos = next((p for p in priv.get("positions", []) if p["symbol"] == "CSPX"), None)
        ok("CSPX 市值 = 数量 × 最新收盘价",
           pos is not None and abs(pos["value"] - qty * last_close) < 0.05, pos)
        ok("CSPX 市值不是按成本价估的", pos is not None and abs(pos["value"] - qty * cost) > 1, pos)
        ok("不再有「按成本估算」警告", "按成本估算" not in (r.stdout + r.stderr), r.stdout[-300:])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

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
