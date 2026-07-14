#!/usr/bin/env python3
"""
IBKR Flex Query → trading/raw/flex_account.json（在 GitHub Actions 上运行）
让 analyzer.py 不用 Claude 也能每天拿到真实持仓底数/现金/净值（以及模板包含时的成交记录）。
与 .github/scripts/ibkr_sync.py 共用同一组密钥（IBKR_FLEX_TOKEN / IBKR_FLEX_QUERY_ID）。
Flex 拉取失败时以非零退出，由 workflow 决定是否继续（沿用上次底数）。
"""
import json
import os
import sys
import time
import xml.etree.ElementTree as ET

import requests

FLEX_TOK = os.environ.get("IBKR_FLEX_TOKEN")
FLEX_QID = os.environ.get("IBKR_FLEX_QUERY_ID")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw", "flex_account.json")

if not FLEX_TOK or not FLEX_QID:
    print("ERROR: IBKR_FLEX_TOKEN / IBKR_FLEX_QUERY_ID not set")
    sys.exit(1)


def fetch_flex_xml():
    base = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService"
    ref = None
    for attempt in range(4):
        if attempt:
            time.sleep(30)
        r1 = requests.get(f"{base}.SendRequest",
                          params={"v": "3", "t": FLEX_TOK, "q": FLEX_QID, "fp": "1"}, timeout=30)
        root1 = ET.fromstring(r1.text)
        ref = root1.findtext("ReferenceCode")
        if ref:
            break
        print(f"WARN: SendRequest attempt {attempt+1}:",
              root1.findtext("ErrorCode"), root1.findtext("ErrorMessage"))
    if not ref:
        sys.exit(1)
    time.sleep(5)
    for _ in range(5):
        r2 = requests.get(f"{base}.GetStatement",
                          params={"v": "3", "q": ref, "t": FLEX_TOK}, timeout=30)
        if "<FlexQueryResponse" in r2.text:
            return ET.fromstring(r2.text)
        time.sleep(5)
    print("ERROR: GetStatement failed")
    sys.exit(1)


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def iso_time(raw, fallback_date):
    """Flex dateTime 形如 '20260625;144256' 或 '2026-06-25 14:42:56'，统一成 ISO"""
    if not raw:
        raw = fallback_date or ""
    s = raw.replace("-", "").replace(":", "").replace(" ", ";")
    d, _, t = s.partition(";")
    if len(d) == 8:
        t = (t + "000000")[:6]
        return f"{d[:4]}-{d[4:6]}-{d[6:]}T{t[:2]}:{t[2:4]}:{t[4:]}Z"
    return raw


root = fetch_flex_xml()
out = {"positions": [], "trades": [], "net_liq": None, "cash": None, "date": None}

nav_rows = list(root.iter("EquitySummaryByReportDateInBase"))
if nav_rows:
    nav = max(nav_rows, key=lambda e: e.get("reportDate", ""))
    out["net_liq"] = to_float(nav.get("total"))
    out["cash"] = to_float(nav.get("cash"))
    d = (nav.get("reportDate") or "").replace("-", "")
    if len(d) == 8:
        out["date"] = f"{d[:4]}-{d[4:6]}-{d[6:]}"

for pos in root.iter("OpenPosition"):
    sym = pos.get("symbol")
    qty = to_float(pos.get("position"))
    avg = to_float(pos.get("costBasisPrice")) or to_float(pos.get("openPrice"))
    if sym and qty:
        out["positions"].append({"symbol": sym, "qty": qty, "avg_price": avg or 0})

for t in root.iter("Trade"):
    sym = t.get("symbol")
    side = (t.get("buySell") or "").upper()
    qty = to_float(t.get("quantity"))
    price = to_float(t.get("tradePrice"))
    if not sym or side not in ("BUY", "SELL") or qty is None or price is None:
        continue
    out["trades"].append({
        "trade_id": "flex." + (t.get("tradeID") or t.get("transactionID") or ""),
        "symbol": sym, "side": side, "size": abs(qty), "price": price,
        "trade_time": iso_time(t.get("dateTime"), t.get("tradeDate")),
        "commission": abs(to_float(t.get("ibCommission")) or 0),
        "net_amount": abs(to_float(t.get("proceeds")) or (abs(qty) * price)),
        "realized_pnl": to_float(t.get("fifoPnlRealized")) or 0,
        "order_id": t.get("ibOrderID"),
        "order_type": t.get("orderType"),
    })

# 报表必须同时含 NAV 汇总与持仓才可信：曾出现只给 OpenPosition/Cash、
# 缺 EquitySummaryByReportDateInBase 的半成品报表——此时持仓已刷新但现金/NAV
# 还是旧值，两者拼起来净值会被算错（旧现金 + 新股数，等于把买入的钱重复计入）
if not out["positions"]:
    print("ERROR: Flex 报表无 OpenPosition，放弃本次（不覆盖旧底数）")
    sys.exit(1)
if not out["net_liq"]:
    print("ERROR: Flex 报表缺 NAV 汇总（疑似半成品报表），放弃本次（不覆盖旧底数）")
    sys.exit(1)

# 汇总持仓需与 NAV 粗对：偏差>5% 视为报表残缺，不落档
pv = sum(to_float(p.get("positionValue")) or 0 for p in root.iter("OpenPosition"))
if pv and abs((pv + (out["cash"] or 0)) / out["net_liq"] - 1) > 0.05:
    print(f"ERROR: 持仓合计 {pv:.0f}+现金 与 NAV {out['net_liq']:.0f} 偏差过大，疑似残缺报表")
    sys.exit(1)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
print(f"OK: {len(out['positions'])} 持仓, {len(out['trades'])} 笔成交, NAV={out['net_liq']}, 现金={out['cash']}, 日期={out['date']}")
