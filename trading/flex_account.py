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
    # 只重试 2 次，不是 4 次（2026-08-12 改）。理由不是「省额度」，是**切断放大器**：
    # 正常运作全仓每天只打约 10 次 Flex，跑了好几周没事；一旦有一次偶发失败，
    # 4 次重试立刻把当天流量翻到 40+ 次，触发并维持住 `1018 Too many requests`
    # （gdcdyn 把它含糊回成 1001，ndcdyn 才明说），隔天一开始就在超标状态——
    # **失败本身就是产生额外流量的来源，所以这个循环没有出口**，连坏一个多星期。
    # 现在即使整天全失败也只有 6 次，比健康时的 10 次还少，才有机会自己恢复。
    # 宁可这次拿不到（analyzer 会沿用 state.enc 里的旧底数），也不要重新点燃那个循环。
    for attempt in range(2):
        if attempt:
            time.sleep(90)
        r1 = requests.get(f"{base}.SendRequest",
                          params={"v": "3", "t": FLEX_TOK, "q": FLEX_QID, "fp": "1"}, timeout=30)
        root1 = ET.fromstring(r1.text)
        ref = root1.findtext("ReferenceCode")
        if ref:
            break
        # 只印回应本体，绝不印 URL——URL 里带 token。
        # 2026-08-12：ErrorCode/ErrorMessage 两个字段不足以定位 1001 的成因
        # （query 手动跑得出来、凭证也有效），所以把整段回应留下来。
        print(f"WARN: SendRequest attempt {attempt+1}:",
              root1.findtext("ErrorCode"), root1.findtext("ErrorMessage"))
        print(f"      完整回应: {r1.text.strip()[:400]}")
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
