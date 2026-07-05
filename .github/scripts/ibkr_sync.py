"""IBKR Flex Query 拉取账户净值/现金/持仓市值，更新 ibkr-snapshot.json。

与 portfolio_news.py 共用同一组密钥（IBKR_FLEX_TOKEN / IBKR_FLEX_QUERY_ID），
不依赖 Claude API。字段提取按可用性逐级回退：
  - EquitySummaryByReportDateInBase（NAV 部分）→ netLiquidation / cash / stockValue
  - CashReportCurrency（现金报告）→ cash
  - OpenPosition → unrealizedPnl（fifoPnlUnrealized 合计）、stockValue（positionValue 合计）
抓不到的字段保留旧快照值并在日志中警告；全部抓不到则报错退出、不覆盖旧档。
"""
import json
import os
import sys
import time
import xml.etree.ElementTree as ET

import requests

FLEX_TOK = os.environ.get("IBKR_FLEX_TOKEN")
FLEX_QID = os.environ.get("IBKR_FLEX_QUERY_ID")
SNAPSHOT = "ibkr-snapshot.json"

if not FLEX_TOK or not FLEX_QID:
    print("ERROR: IBKR_FLEX_TOKEN / IBKR_FLEX_QUERY_ID not set")
    sys.exit(1)


def fetch_flex_xml():
    base = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService"
    r1 = requests.get(
        f"{base}.SendRequest",
        params={"v": "3", "t": FLEX_TOK, "q": FLEX_QID, "fp": "1"},
        timeout=30,
    )
    root1 = ET.fromstring(r1.text)
    ref = root1.findtext("ReferenceCode")
    if not ref:
        print("ERROR: Flex SendRequest failed:",
              root1.findtext("ErrorCode"), root1.findtext("ErrorMessage"))
        sys.exit(1)

    time.sleep(5)
    for _ in range(5):
        r2 = requests.get(
            f"{base}.GetStatement",
            params={"v": "3", "q": ref, "t": FLEX_TOK},
            timeout=30,
        )
        if "<FlexQueryResponse" in r2.text:
            return ET.fromstring(r2.text)
        time.sleep(5)
    print("ERROR: Flex GetStatement did not return a statement after retries")
    print(r2.text[:500])
    sys.exit(1)


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


root = fetch_flex_xml()
extracted = {}

# 1) NAV 部分（需 Flex 模板勾选 Net Asset Value (NAV) in Base）
nav_rows = list(root.iter("EquitySummaryByReportDateInBase"))
if nav_rows:
    nav = max(nav_rows, key=lambda e: e.get("reportDate", ""))
    for key, attr in [("netLiquidation", "total"), ("cash", "cash"), ("stockValue", "stock")]:
        val = to_float(nav.get(attr))
        if val is not None:
            extracted[key] = round(val, 2)
else:
    print("WARN: 报表无 NAV 部分（EquitySummaryByReportDateInBase）——"
          "如需精确净值，请在 IBKR Flex 模板勾选 Net Asset Value (NAV) in Base")

# 2) 现金报告回退
if "cash" not in extracted:
    for row in root.iter("CashReportCurrency"):
        if row.get("currency") == "BASE_SUMMARY":
            val = to_float(row.get("endingCash"))
            if val is not None:
                extracted["cash"] = round(val, 2)
            break

# 3) 持仓合计：未实现盈亏 + 市值回退
pnl_sum, value_sum, has_pnl, has_value = 0.0, 0.0, False, False
for pos in root.iter("OpenPosition"):
    pnl = to_float(pos.get("fifoPnlUnrealized"))
    if pnl is not None:
        pnl_sum += pnl
        has_pnl = True
    pv = to_float(pos.get("positionValue"))
    if pv is None:
        mark, qty = to_float(pos.get("markPrice")), to_float(pos.get("position"))
        pv = mark * qty if mark is not None and qty is not None else None
    if pv is not None:
        value_sum += pv
        has_value = True

if has_pnl:
    extracted["unrealizedPnl"] = round(pnl_sum, 2)
if "stockValue" not in extracted and has_value:
    extracted["stockValue"] = round(value_sum, 2)

# 4) 净值回退：现金 + 持仓市值
if "netLiquidation" not in extracted and "cash" in extracted and "stockValue" in extracted:
    extracted["netLiquidation"] = round(extracted["cash"] + extracted["stockValue"], 2)

if not extracted:
    print("ERROR: 未能从 Flex 报表提取任何字段，保留旧快照不变。"
          "请检查 Flex 模板是否包含 NAV / Cash Report / Open Positions 部分。")
    sys.exit(1)

# 合并：抓到的覆盖，抓不到的保留旧值
try:
    with open(SNAPSHOT) as f:
        snapshot = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    snapshot = {}

snapshot.setdefault("currency", "USD")
snapshot.update(extracted)
snapshot["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

with open(SNAPSHOT, "w") as f:
    json.dump(snapshot, f, indent=2)
    f.write("\n")

print("OK: snapshot updated. Fields from Flex:", ", ".join(sorted(extracted)))
missing = {"netLiquidation", "cash", "stockValue", "unrealizedPnl"} - set(extracted)
if missing:
    print("WARN: 以下字段本次未更新（沿用旧值）:", ", ".join(sorted(missing)))
for k in ("netLiquidation", "cash", "stockValue", "unrealizedPnl"):
    if k in snapshot:
        print(f"  {k}: {snapshot[k]:,.2f}")
