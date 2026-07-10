#!/usr/bin/env python3
"""
行情抓取（在 GitHub Actions 上运行，本仓库沙盒的网络策略不放行行情源）
- 数据源：Stooq（主）→ Yahoo Finance chart API（备援）
- 每次全量下载并整档覆盖 history/SYM.json（避免拆股/分红调整造成的历史漂移）
- 只保留最近 320 根日线
仅用标准库。
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
HIST_DIR = os.path.join(BASE, "history")
KEEP_BARS = 320
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}


def http_get(url, timeout=30):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def from_stooq(sym):
    body = http_get(f"https://stooq.com/q/d/l/?s={sym.lower()}.us&i=d")
    lines = body.strip().splitlines()
    if len(lines) < 2 or not lines[0].startswith("Date"):
        raise ValueError("stooq 无数据")
    bars = []
    for ln in lines[1:]:
        p = ln.split(",")
        if len(p) < 5 or not p[1]:
            continue
        vol = int(float(p[5])) if len(p) > 5 and p[5] not in ("", "0") else 0
        bars.append([p[0], float(p[1]), float(p[2]), float(p[3]), float(p[4]), vol])
    return bars


def from_yahoo(sym):
    body = http_get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=2y&interval=1d")
    r = json.loads(body)["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    bars = []
    for i, ts in enumerate(r["timestamp"]):
        o, h, l, c = q["open"][i], q["high"][i], q["low"][i], q["close"][i]
        if None in (o, h, l, c):
            continue
        d = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
        v = q["volume"][i] or 0
        bars.append([d, round(o, 4), round(h, 4), round(l, 4), round(c, 4), int(v)])
    return bars


def validate(sym, bars):
    if len(bars) < 200:
        return f"{sym}: 仅 {len(bars)} 根，不足 200"
    last = datetime.strptime(bars[-1][0], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - last > timedelta(days=10):
        return f"{sym}: 最后日期 {bars[-1][0]} 过旧"
    for i, b in enumerate(bars):
        d, o, h, l, c, v = b
        tol = c * 0.001
        if not (h >= l and h >= c - tol and l <= c + tol and h >= o - tol and l <= o + tol):
            return f"{sym} {d}: OHLC 异常 o={o} h={h} l={l} c={c}"
        if i and b[0] <= bars[i - 1][0]:
            return f"{sym} {d}: 日期未升序"
        if i and bars[i - 1][4] > 0 and abs(c / bars[i - 1][4] - 1) > 0.5:
            return f"{sym} {d}: 单日涨跌超±50%"
    return None


def main():
    with open(os.path.join(BASE, "universe.json"), encoding="utf-8") as f:
        universe = json.load(f)["tickers"]
    os.makedirs(HIST_DIR, exist_ok=True)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ok, failed = [], []
    for u in universe:
        sym = u["symbol"]
        bars, src, err = None, None, None
        for name, fn in (("stooq", from_stooq), ("yahoo", from_yahoo)):
            try:
                cand = fn(sym)[-KEEP_BARS:]
                err = validate(sym, cand)
                if err is None:
                    bars, src = cand, name
                    break
            except Exception as e:
                err = f"{sym}: {name} 失败 {e}"
            time.sleep(0.4)
        if bars is None:
            failed.append(err or sym)
            print("FAIL", err, file=sys.stderr)
            continue
        with open(os.path.join(HIST_DIR, f"{sym}.json"), "w", encoding="utf-8") as f:
            json.dump({"symbol": sym, "contract_id": u.get("contract_id"), "currency": "USD",
                       "source": src, "updated": today, "bars": bars},
                      f, ensure_ascii=False, separators=(",", ":"))
        ok.append(f"{sym}({src},{len(bars)})")
        time.sleep(0.4)
    print(f"成功 {len(ok)}/{len(universe)}: {' '.join(ok)}")
    if failed:
        print(f"失败 {len(failed)}: {'; '.join(failed)}", file=sys.stderr)
    # 超过 1/4 失败视为数据源故障，让 CI 失败以免发布残缺数据
    if len(failed) > len(universe) // 4:
        sys.exit(1)


if __name__ == "__main__":
    main()
