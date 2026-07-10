#!/usr/bin/env python3
"""
股票交易分析器 · 分析管线
================================
两种运行模式（自动判别）：
- 日常模式（GitHub Actions，每个交易日）：无 raw/ 账户文件。用 history/ 最新收盘价
  重算持仓市值/盈亏/净值，生成信号与建议。零 Claude 消耗。
- 对账模式（Claude session，每周或用户说「同步持仓」时）：trading/raw/ 有从 IBKR MCP
  转录的账户文件，刷新持仓底数、现金、TWR 基准，并把新交易并入台账。

输入:
  trading/history/*.json   日线K线（fetch_prices.py 每日全量覆盖）
  trading/raw/              对账模式才有（不入 git）:
    positions.json / summary.json / trades.json / perf.json / ai_note.md
    nav_bootstrap.json      仅首次建库
输出:
  trading/data-public.json  市场扫描信号（公开）
  trading/data-private.enc  持仓健康+复盘（AES-256-GCM 加密）
  trading/state.enc         持仓底数+台账+净值序列+TWR基准（加密持久化）
密码: --password-file 或环境变量 ANALYZER_PW（Actions 用 Secret 注入）
依赖: 标准库 + cryptography
"""
import argparse
import base64
import json
import math
import os
import statistics
import sys
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
HIST_DIR = os.path.join(BASE, "history")
RAW_DIR = os.path.join(BASE, "raw")
UNIVERSE = os.path.join(BASE, "universe.json")
PUB_OUT = os.path.join(BASE, "data-public.json")
PRIV_OUT = os.path.join(BASE, "data-private.enc")
STATE_OUT = os.path.join(BASE, "state.enc")

PBKDF2_ITER = 300_000
CASH_LIKE = {"SGOV"}  # 现金类持仓，不给技术信号建议


# ---------------- 加密 ----------------

def _derive_key(password: str, salt: bytes) -> bytes:
    import hashlib
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITER, dklen=32)


def encrypt_json(obj, password: str) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    salt = os.urandom(16)
    nonce = os.urandom(12)
    key = _derive_key(password, salt)
    ct = AESGCM(key).encrypt(nonce, json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), None)
    return json.dumps({
        "v": 1, "kdf": "PBKDF2-SHA256", "iter": PBKDF2_ITER,
        "salt": base64.b64encode(salt).decode(),
        "nonce": base64.b64encode(nonce).decode(),
        "ct": base64.b64encode(ct).decode(),
    })


def decrypt_json(envelope: str, password: str):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    env = json.loads(envelope)
    key = _derive_key(password, base64.b64decode(env["salt"]))
    pt = AESGCM(key).decrypt(base64.b64decode(env["nonce"]), base64.b64decode(env["ct"]), None)
    return json.loads(pt.decode("utf-8"))


# ---------------- 技术指标（纯标准库） ----------------

def ema(vals, span):
    a = 2.0 / (span + 1)
    out = [vals[0]]
    for v in vals[1:]:
        out.append(a * v + (1 - a) * out[-1])
    return out


def sma_last(vals, n):
    if len(vals) < n:
        return None
    return sum(vals[-n:]) / n


def rsi_last(closes, n=14):
    """Wilder 平滑 RSI 最新值"""
    if len(closes) <= n:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0.0))
        losses.append(max(-d, 0.0))
    avg_g = sum(gains[:n]) / n
    avg_l = sum(losses[:n]) / n
    for i in range(n, len(gains)):
        avg_g = (avg_g * (n - 1) + gains[i]) / n
        avg_l = (avg_l * (n - 1) + losses[i]) / n
    if avg_l < 1e-12:
        return 100.0
    rs = avg_g / avg_l
    return 100.0 - 100.0 / (1.0 + rs)


def atr_last(bars, n=14):
    if len(bars) < n + 1:
        return None
    trs = []
    for i in range(1, len(bars)):
        h, l, pc = bars[i][2], bars[i][3], bars[i - 1][4]
        trs.append(max(h - l, abs(h - pc), abs(l - pc)))
    atr = sum(trs[:n]) / n
    for tr in trs[n:]:
        atr = (atr * (n - 1) + tr) / n
    return atr


def analyze_ticker(bars):
    """输入升序日线，输出信号字典。至少需要 60 根。"""
    closes = [b[4] for b in bars]
    vols = [b[5] for b in bars]
    n = len(closes)
    if n < 60:
        return {"error": f"数据不足({n}根)"}
    price = closes[-1]
    prev_close = closes[-2]
    ma20 = sma_last(closes, 20)
    ma50 = sma_last(closes, 50)
    ma200 = sma_last(closes, 200)
    ma20_prev = sum(closes[-21:-1]) / 20
    ma50_prev = sum(closes[-51:-1]) / 50 if n >= 51 else None

    macd_line = [e12 - e26 for e12, e26 in zip(ema(closes, 12), ema(closes, 26))]
    macd_sig = ema(macd_line, 9)
    hist_now = macd_line[-1] - macd_sig[-1]
    hist_prev = macd_line[-2] - macd_sig[-2]

    rsi_now = rsi_last(closes)

    bb_mid = ma20
    bb_std = statistics.stdev(closes[-20:])
    bb_up, bb_lo = bb_mid + 2 * bb_std, bb_mid - 2 * bb_std
    bb_pct = (price - bb_lo) / (bb_up - bb_lo) if bb_up > bb_lo else 0.5

    vol20 = sma_last(vols, 20)
    atr = atr_last(bars)

    hi_52w = max(b[2] for b in bars[-252:])
    lo_52w = min(b[3] for b in bars[-252:])

    signals, score = [], 0
    if ma50 is not None:
        if price > ma50:
            signals.append(["趋势", f"价格站上50日线 ({ma50:.2f})", 1]); score += 1
        else:
            signals.append(["趋势", f"价格跌破50日线 ({ma50:.2f})", -1]); score -= 1
    if ma200 is not None:
        if price > ma200:
            signals.append(["长期", f"200日线上方，长期多头 ({ma200:.2f})", 1]); score += 1
        else:
            signals.append(["长期", f"200日线下方，长期偏空 ({ma200:.2f})", -1]); score -= 1
    if ma50_prev is not None:
        if ma20_prev <= ma50_prev and ma20 > ma50:
            signals.append(["均线", "MA20 金叉 MA50 ↑", 2]); score += 2
        elif ma20_prev >= ma50_prev and ma20 < ma50:
            signals.append(["均线", "MA20 死叉 MA50 ↓", -2]); score -= 2
        elif ma20 > ma50:
            signals.append(["均线", "MA20 在 MA50 上方（多头排列）", 0])
        else:
            signals.append(["均线", "MA20 在 MA50 下方（空头排列）", 0])
    if rsi_now is not None:
        if rsi_now < 30:
            signals.append(["RSI", f"超卖 ({rsi_now:.0f})，可能反弹", 2]); score += 2
        elif rsi_now > 70:
            signals.append(["RSI", f"超买 ({rsi_now:.0f})，注意回调", -2]); score -= 2
        else:
            signals.append(["RSI", f"中性 ({rsi_now:.0f})", 0])
    if hist_prev < 0 <= hist_now:
        signals.append(["MACD", "金叉 ↑", 2]); score += 2
    elif hist_prev > 0 >= hist_now:
        signals.append(["MACD", "死叉 ↓", -2]); score -= 2
    elif hist_now > 0:
        signals.append(["MACD", "动能为正", 1]); score += 1
    else:
        signals.append(["MACD", "动能为负", -1]); score -= 1
    if bb_pct < 0.2:
        signals.append(["布林带", f"接近下轨 ({bb_pct:.0%})", 1]); score += 1
    elif bb_pct > 0.8:
        signals.append(["布林带", f"接近上轨 ({bb_pct:.0%})", -1]); score -= 1
    if vol20 and vols[-1] > vol20 * 1.5:
        d = 1 if score > 0 else -1 if score < 0 else 0
        if d:
            signals.append(["成交量", "放量（>1.5倍均量），信号增强", d]); score += d

    if score >= 4:
        action, act_cls = "强烈买入", "buy2"
    elif score >= 2:
        action, act_cls = "偏多", "buy1"
    elif score <= -4:
        action, act_cls = "强烈卖出", "sell2"
    elif score <= -2:
        action, act_cls = "偏空", "sell1"
    else:
        action, act_cls = "中性观望", "hold"

    return {
        "price": round(price, 2),
        "prev_close": round(prev_close, 4),
        "chg1d": round((price / prev_close - 1) * 100, 2),
        "score": score,
        "action": action,
        "act_cls": act_cls,
        "rsi": round(rsi_now, 0) if rsi_now is not None else None,
        "ma50": round(ma50, 2) if ma50 else None,
        "ma200": round(ma200, 2) if ma200 else None,
        "above_ma50": price > ma50 if ma50 else None,
        "above_ma200": price > ma200 if ma200 else None,
        "from_52w_high": round((price / hi_52w - 1) * 100, 1),
        "from_52w_low": round((price / lo_52w - 1) * 100, 1),
        "stop_atr": round(price - 2 * atr, 2) if atr else None,
        "signals": signals,
        "date": bars[-1][0],
        "spark": [round(c, 2) for c in closes[-90:]],
    }


# ---------------- 数据读写与校验 ----------------

def load_history(symbol):
    p = os.path.join(HIST_DIR, f"{symbol}.json")
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def validate_bars(symbol, bars):
    errs = []
    for i, b in enumerate(bars):
        if len(b) != 6:
            errs.append(f"{symbol} 第{i}根字段数≠6"); continue
        _, o, h, l, c, v = b
        # 官方收盘价（集合竞价）可比盘中高低价序列偏差几美分，给 0.1% 容差
        tol = c * 0.001
        if not (h >= l and h >= c - tol and h >= o - tol and l <= c + tol and l <= o + tol):
            errs.append(f"{symbol} {b[0]} OHLC 关系异常")
        if v < 0:
            errs.append(f"{symbol} {b[0]} 成交量为负")
        if i > 0:
            if b[0] <= bars[i - 1][0]:
                errs.append(f"{symbol} {b[0]} 日期未升序")
            pc = bars[i - 1][4]
            if pc > 0 and abs(c / pc - 1) > 0.5:
                errs.append(f"{symbol} {b[0]} 单日涨跌超±50%（疑似数据错误）")
    return errs


def read_raw(name):
    p = os.path.join(RAW_DIR, name)
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f) if name.endswith(".json") else f.read()


# ---------------- 复盘统计 ----------------

def build_review(trades):
    if not trades:
        return None
    by_sym = {}
    total_comm = buys = sells = realized = 0.0
    order_pnl = {}
    for t in trades:
        s = by_sym.setdefault(t["symbol"], {"buys": 0.0, "sells": 0.0, "realized": 0.0, "comm": 0.0, "n": 0})
        amt = t.get("net_amount", 0) or 0
        pnl = t.get("realized_pnl", 0) or 0
        comm = t.get("commission", 0) or 0
        s["n"] += 1
        s["comm"] += comm
        total_comm += comm
        if t["side"] == "BUY":
            s["buys"] += amt; buys += amt
        else:
            s["sells"] += amt; sells += amt
        s["realized"] += pnl
        realized += pnl
        if t["side"] == "SELL":
            k = t.get("order_id") or t["trade_id"]
            order_pnl[k] = order_pnl.get(k, 0.0) + pnl
    closed = [v for v in order_pnl.values() if abs(v) > 0.005]
    wins = [v for v in closed if v > 0]
    dates = sorted(t["trade_time"][:10] for t in trades)
    per_sym = [
        {"symbol": k, "n": v["n"], "buys": round(v["buys"], 2), "sells": round(v["sells"], 2),
         "realized": round(v["realized"], 2), "comm": round(v["comm"], 2)}
        for k, v in sorted(by_sym.items(), key=lambda kv: -abs(kv[1]["realized"]))
    ]
    insights = []
    if closed:
        insights.append(f"已了结的 {len(closed)} 笔卖出中 {len(wins)} 笔盈利，胜率 {len(wins)/len(closed):.0%}。")
    if per_sym:
        best = max(per_sym, key=lambda s: s["realized"])
        worst = min(per_sym, key=lambda s: s["realized"])
        if best["realized"] > 0:
            insights.append(f"赚最多：{best['symbol']}（已实现 +${best['realized']:,.0f}）。")
        if worst["realized"] < 0:
            insights.append(f"亏最多：{worst['symbol']}（已实现 -${abs(worst['realized']):,.0f}）。")
    turnover = buys + sells
    if turnover > 0:
        insights.append(f"总手续费 ${total_comm:,.2f}，占成交额 {total_comm/turnover:.3%}——很低，成本控制良好。")
    return {
        "n_trades": len(trades), "first_date": dates[0], "last_date": dates[-1],
        "buys": round(buys, 2), "sells": round(sells, 2),
        "realized": round(realized, 2), "commission": round(total_comm, 2),
        "win_rate": round(len(wins) / len(closed), 3) if closed else None,
        "n_closed": len(closed),
        "per_symbol": per_sym[:20],
        "insights": insights,
    }


# ---------------- 加仓建议（规则式，仅供参考） ----------------

def build_add_suggestions(positions, cash, net_liq, sig_by_sym):
    tips = []
    if cash is None or net_liq is None or cash < 200:
        return tips
    lot = max(100, round(min(cash * 0.5, net_liq * 0.05), -2))  # 单次参考额度
    for p in positions:
        sym = p["symbol"]
        if sym in CASH_LIKE:
            continue
        s = sig_by_sym.get(sym)
        if not s:
            continue
        why = None
        if s["score"] >= 2:
            why = f"技术面偏多（{s['score']:+d}分）"
        elif s["rsi"] is not None and s["rsi"] <= 35 and s.get("above_ma200"):
            why = f"回调至超卖区（RSI {s['rsi']:.0f}）且长期趋势未破"
        elif s["from_52w_high"] <= -12 and s.get("above_ma200"):
            why = f"自52周高点回撤 {abs(s['from_52w_high']):.0f}% 但仍在200日线上方"
        if why:
            tips.append(f"📈 {sym} 加仓参考：{why}，若按计划分批投入，可考虑约 ${lot:,.0f}（现金余 ${cash:,.0f}）")
    cash_pct = cash / net_liq * 100 if net_liq else 0
    spy = sig_by_sym.get("SPY") or sig_by_sym.get("VOO")
    if cash_pct > 20 and spy and spy["score"] >= 2:
        tips.append(f"📈 现金占 {cash_pct:.0f}% 偏高且大盘偏多，可考虑分批投入指数 ETF")
    return tips


# ---------------- 主流程 ----------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--password-file")
    args = ap.parse_args()
    password = None
    if args.password_file and os.path.exists(args.password_file):
        password = open(args.password_file, encoding="utf-8").read().strip()
    elif os.environ.get("ANALYZER_PW"):
        password = os.environ["ANALYZER_PW"].strip()

    warnings = []
    now = datetime.now(timezone.utc)

    with open(UNIVERSE, encoding="utf-8") as f:
        universe = json.load(f)["tickers"]

    # --- 公开部分：全名单信号 ---
    tickers, latest_date = [], None
    for u in universe:
        hist = load_history(u["symbol"])
        if hist is None:
            warnings.append(f"{u['symbol']}: 缺历史文件")
            continue
        errs = validate_bars(u["symbol"], hist["bars"])
        if errs:
            warnings.extend(errs[:2])
        r = analyze_ticker(hist["bars"])
        if "error" in r:
            warnings.append(f"{u['symbol']}: {r['error']}")
            continue
        r["symbol"] = u["symbol"]
        r["name"] = u.get("name", u["symbol"])
        r["etf"] = u.get("etf", False)
        tickers.append(r)
        if latest_date is None or r["date"] > latest_date:
            latest_date = r["date"]

    stale = [t["symbol"] for t in tickers if t["date"] != latest_date]
    if stale:
        warnings.append(f"数据日期落后于 {latest_date}: {', '.join(stale[:8])}")

    above50 = sum(1 for t in tickers if t.get("above_ma50"))
    breadth = round(above50 / len(tickers) * 100) if tickers else 0
    spy = next((t for t in tickers if t["symbol"] == "SPY"), None)
    qqq = next((t for t in tickers if t["symbol"] == "QQQ"), None)

    def trend_word(t):
        if not t:
            return "未知"
        if t["above_ma50"] and t["above_ma200"]:
            return "多头趋势"
        if not t["above_ma50"] and not t["above_ma200"]:
            return "空头趋势"
        return "震荡"

    # 现金类（如短期国债 ETF）不参与买卖信号榜
    opportunities = sorted([t for t in tickers if t["score"] >= 2 and t["symbol"] not in CASH_LIKE],
                           key=lambda t: -t["score"])[:10]
    weak = sorted([t for t in tickers if t["score"] <= -3 and t["symbol"] not in CASH_LIKE],
                  key=lambda t: t["score"])[:6]

    market_line = (f"标普500{trend_word(spy)}、纳指{trend_word(qqq)}；"
                   f"扫描名单中 {breadth}% 个股站上50日线。")
    if opportunities:
        market_line += f" 今日 {len(opportunities)} 只出现买入信号。"

    public = {
        "generated_at": now.strftime("%Y-%m-%d %H:%M UTC"),
        "data_date": latest_date,
        "market": {
            "line": market_line, "breadth": breadth,
            "spy": {"trend": trend_word(spy), "chg1d": spy["chg1d"] if spy else None,
                    "price": spy["price"] if spy else None},
            "qqq": {"trend": trend_word(qqq), "chg1d": qqq["chg1d"] if qqq else None,
                    "price": qqq["price"] if qqq else None},
        },
        "opportunities": [t["symbol"] for t in opportunities],
        "weak": [t["symbol"] for t in weak],
        "tickers": sorted(tickers, key=lambda t: -t["score"]),
        "warnings": warnings,
    }
    with open(PUB_OUT, "w", encoding="utf-8") as f:
        json.dump(public, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[public] {len(tickers)} 只已分析，数据日期 {latest_date}")

    # --- 私密部分 ---
    if not password:
        print("[private] 未提供密码，跳过（页面私密区维持上次数据）")
        if warnings:
            print("[warnings]", *warnings, sep="\n  ")
        return

    state = {"trades": [], "nav_series": [], "positions": [], "cash": None, "twr_base": None}
    if os.path.exists(STATE_OUT):
        loaded = decrypt_json(open(STATE_OUT, encoding="utf-8").read(), password)
        state.update(loaded)

    sync_mode = read_raw("positions.json") is not None

    # 跨来源去重：MCP 与 Flex 的 trade_id 体系不同，同一笔成交用组合签名识别
    def trade_sig(t):
        return (t["symbol"], t["side"], round(float(t["size"]), 4),
                round(float(t["price"]), 4), (t.get("trade_time") or "")[:16])

    def merge_trades(new_trades, label):
        known_ids = {t["trade_id"] for t in state["trades"]}
        known_sigs = {trade_sig(t) for t in state["trades"]}
        added = 0
        for t in new_trades:
            if t["trade_id"] in known_ids or trade_sig(t) in known_sigs:
                continue
            state["trades"].append({k: t.get(k) for k in
                ("trade_id", "symbol", "side", "size", "price", "trade_time",
                 "commission", "net_amount", "realized_pnl", "order_id", "order_type")})
            known_sigs.add(trade_sig(t))
            added += 1
        state["trades"].sort(key=lambda t: t["trade_time"])
        if added:
            print(f"[ledger/{label}] 新增 {added} 笔交易，台账共 {len(state['trades'])} 笔")

    # ---- 对账模式：用 IBKR MCP 数据刷新底数 ----
    raw_trades = read_raw("trades.json")
    if raw_trades:
        merge_trades(raw_trades.get("trades", []), "mcp")

    boot = read_raw("nav_bootstrap.json")
    if boot and not state["nav_series"]:
        state["nav_series"] = boot
        print(f"[nav] 引导净值序列 {len(boot)} 天")

    if sync_mode:
        positions_raw = read_raw("positions.json")
        summary = read_raw("summary.json") or {}
        state["positions"] = [
            {"symbol": p["contract_description"], "qty": p["position"],
             "avg_price": p["average_price"]}
            for p in positions_raw.get("positions", [])
        ]
        state["cash"] = summary.get("total_cash_value")
        perf_raw = read_raw("perf.json")
        nav_now = summary.get("net_liquidation")
        if perf_raw and nav_now:
            state["twr_base"] = {"date": now.strftime("%Y-%m-%d"), "nav": nav_now,
                                 "ytd": perf_raw.get("ytd"), "mtd": perf_raw.get("mtd")}
        print(f"[sync] 持仓底数 {len(state['positions'])} 项、现金 {state['cash']}、TWR 基准已刷新")

    # ---- Flex 对账（CI 每日自动，零 Claude）：MCP 对账缺席时刷新底数 ----
    flex = None if sync_mode else read_raw("flex_account.json")
    if flex:
        if flex.get("positions"):
            state["positions"] = flex["positions"]
        if flex.get("cash") is not None:
            state["cash"] = flex["cash"]
        state["flex_nav"] = {"date": flex.get("date"), "net_liq": flex.get("net_liq")}
        merge_trades(flex.get("trades", []), "flex")
        print(f"[flex] 持仓底数 {len(state['positions'])} 项、现金 {state['cash']}、NAV {flex.get('net_liq')}")

    # ---- 用最新收盘价重算持仓与净值 ----
    sig_by_sym = {t["symbol"]: t for t in tickers}
    positions, actions = [], []
    net_liq = None
    cash = state.get("cash")
    if state["positions"]:
        total_val = 0.0
        pos_calc = []
        for sp in state["positions"]:
            sym, qty, avg = sp["symbol"], sp["qty"], sp["avg_price"]
            sig = sig_by_sym.get(sym)
            if sig is None:
                warnings.append(f"{sym}: 持仓但不在扫描名单/无历史，市值按成本估算")
                price, prev = avg, avg
            else:
                price, prev = sig["price"], sig["prev_close"]
            mv = qty * price
            total_val += mv
            pos_calc.append((sp, sig, price, prev, mv))
        net_liq = total_val + (cash or 0)
        # Flex 提供的官方 NAV（含应计利息等）比收盘价重算更准，日期够新就用它
        fx = state.get("flex_nav") or {}
        if fx.get("net_liq") and fx.get("date") and latest_date and fx["date"] >= latest_date:
            net_liq = fx["net_liq"]

        for sp, sig, price, prev, mv in pos_calc:
            sym, qty, avg = sp["symbol"], sp["qty"], sp["avg_price"]
            upnl = (price - avg) * qty
            upct = (price / avg - 1) * 100 if avg else 0
            weight = mv / net_liq * 100 if net_liq else 0
            pos = {
                "symbol": sym, "qty": round(qty, 4), "avg_price": round(avg, 2),
                "price": round(price, 2), "value": round(mv, 2),
                "upnl": round(upnl, 2), "upct": round(upct, 2),
                "daily_pnl": round((price - prev) * qty, 2),
                "weight": round(weight, 1),
                "signal": {k: sig[k] for k in ("score", "action", "act_cls", "rsi", "stop_atr", "from_52w_high")} if sig else None,
            }
            notes = []
            if weight > 50:
                notes.append(f"占组合 {weight:.0f}%，集中度偏高")
            if upct <= -10:
                notes.append(f"浮亏 {upct:.0f}%，检查当初买入逻辑是否仍成立")
            if sig and sig["score"] <= -3 and sym not in CASH_LIKE:
                notes.append("技术面转弱，留意止损参考位")
            pos["notes"] = notes
            positions.append(pos)
            if notes:
                actions.append(f"⚠️ {sym}：{'；'.join(notes)}")
        positions.sort(key=lambda x: -x["value"])

        # 净值序列逐日累积（同日覆盖）
        nav_date = latest_date or now.strftime("%Y-%m-%d")
        sd = {d: v for d, v in state["nav_series"]}
        sd[nav_date] = round(net_liq, 2)
        state["nav_series"] = sorted(sd.items())

        cash_pct = (cash or 0) / net_liq * 100 if net_liq else 0
        if cash_pct < 3:
            actions.append(f"⚠️ 现金仅占 {cash_pct:.1f}%，缓冲较薄")
        actions.extend(build_add_suggestions(positions, cash, net_liq, sig_by_sym))
        if not actions:
            actions.append("✅ 持仓无异常信号，继续按计划持有")

    # ---- 收益率：TWR 基准 + 净值续算（两次对账间无出入金时是准确的 TWR 链式）----
    navs = state["nav_series"]
    perf = {}
    tb = state.get("twr_base")
    if tb and navs:
        factor = navs[-1][1] / tb["nav"] if tb["nav"] else 1
        if tb.get("ytd") is not None:
            perf["ytd"] = round(((1 + tb["ytd"]) * factor - 1) * 100, 2)
        if tb.get("mtd") is not None and tb["date"][:7] == navs[-1][0][:7]:
            perf["mtd"] = round(((1 + tb["mtd"]) * factor - 1) * 100, 2)
        elif len(navs) >= 2:
            month_start = [v for d, v in navs if d < navs[-1][0][:7] + "-01"]
            if month_start:
                perf["mtd"] = round((navs[-1][1] / month_start[-1] - 1) * 100, 2)
        if len(navs) >= 2:
            perf["1d"] = round((navs[-1][1] / navs[-2][1] - 1) * 100, 2)
        if len(navs) >= 6:
            perf["7d"] = round((navs[-1][1] / navs[-6][1] - 1) * 100, 2)

    review = build_review(state["trades"])
    ai_note = read_raw("ai_note.md")
    if ai_note:
        state["ai_note"] = ai_note.strip()

    private = {
        "generated_at": public["generated_at"],
        "account": {
            "net_liq": round(net_liq, 2) if net_liq else None,
            "cash": round(cash, 2) if cash is not None else None,
            "cash_pct": round(cash / net_liq * 100, 1) if cash is not None and net_liq else None,
            "synced": (state.get("flex_nav") or {}).get("date") or (tb or {}).get("date"),
        },
        "perf": perf,
        "nav_series": navs[-260:],
        "positions": positions,
        "actions": actions,
        "review": review,
        "ai_note": state.get("ai_note"),
    }
    with open(PRIV_OUT, "w", encoding="utf-8") as f:
        f.write(encrypt_json(private, password))
    with open(STATE_OUT, "w", encoding="utf-8") as f:
        f.write(encrypt_json(state, password))
    mode = "对账" if sync_mode else "日常"
    print(f"[private/{mode}] 持仓 {len(positions)} 项、净资产 {net_liq and round(net_liq)}、台账 {len(state['trades'])} 笔、净值 {len(navs)} 天")
    if warnings:
        print("[warnings]", *warnings, sep="\n  ")


if __name__ == "__main__":
    main()
