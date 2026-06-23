"""
Market Analysis & Signal Generator
数据来源：IBKR MCP (get_price_history) 或传入 DataFrame
"""
import pandas as pd
import numpy as np
from datetime import datetime


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # 移动平均
    df["ma20"] = df["close"].rolling(20).mean()
    df["ma50"] = df["close"].rolling(50).mean()

    # RSI
    delta = df["close"].diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rs = gain / loss.replace(0, np.nan)
    df["rsi"] = 100 - 100 / (1 + rs)

    # MACD
    ema12 = df["close"].ewm(span=12).mean()
    ema26 = df["close"].ewm(span=26).mean()
    df["macd"] = ema12 - ema26
    df["macd_signal"] = df["macd"].ewm(span=9).mean()
    df["macd_hist"] = df["macd"] - df["macd_signal"]

    # 布林带
    df["bb_mid"] = df["close"].rolling(20).mean()
    bb_std = df["close"].rolling(20).std()
    df["bb_upper"] = df["bb_mid"] + 2 * bb_std
    df["bb_lower"] = df["bb_mid"] - 2 * bb_std

    # 成交量均线
    if "volume" in df.columns:
        df["vol_ma20"] = df["volume"].rolling(20).mean()

    return df


def ibkr_bars_to_df(bars: list) -> pd.DataFrame:
    """将 IBKR get_price_history 返回的 bars 转为 DataFrame"""
    rows = []
    for b in bars:
        rows.append({
            "date": pd.to_datetime(b["t"], unit="s"),
            "open":   b.get("o", b.get("open",  0)),
            "high":   b.get("h", b.get("high",  0)),
            "low":    b.get("l", b.get("low",   0)),
            "close":  b.get("c", b.get("close", 0)),
            "volume": b.get("v", b.get("volume",0)),
        })
    df = pd.DataFrame(rows).set_index("date").sort_index()
    return df


def generate_signal(df: pd.DataFrame, ticker: str = "") -> dict:
    df = add_indicators(df)
    df = df.dropna()

    if len(df) < 2:
        return {"ticker": ticker, "error": "数据不足"}

    latest = df.iloc[-1]
    prev   = df.iloc[-2]

    signals = []
    score = 0

    # MA 趋势
    if latest["ma20"] > latest["ma50"]:
        signals.append(("MA趋势", f"多头排列 (MA20 {latest['ma20']:.2f} > MA50 {latest['ma50']:.2f})", +1))
        score += 1
    else:
        signals.append(("MA趋势", f"空头排列 (MA20 {latest['ma20']:.2f} < MA50 {latest['ma50']:.2f})", -1))
        score -= 1

    # RSI
    rsi = latest["rsi"]
    if rsi < 30:
        signals.append(("RSI", f"超卖 ({rsi:.1f}) ← 潜在买点", +2)); score += 2
    elif rsi > 70:
        signals.append(("RSI", f"超买 ({rsi:.1f}) ← 潜在卖点", -2)); score -= 2
    else:
        signals.append(("RSI", f"中性 ({rsi:.1f})", 0))

    # MACD 金叉/死叉
    if prev["macd_hist"] < 0 and latest["macd_hist"] > 0:
        signals.append(("MACD", "金叉 ↑", +2)); score += 2
    elif prev["macd_hist"] > 0 and latest["macd_hist"] < 0:
        signals.append(("MACD", "死叉 ↓", -2)); score -= 2
    elif latest["macd_hist"] > 0:
        signals.append(("MACD", f"正值 ({latest['macd_hist']:.4f})", +1)); score += 1
    else:
        signals.append(("MACD", f"负值 ({latest['macd_hist']:.4f})", -1)); score -= 1

    # 布林带
    price = latest["close"]
    band_range = latest["bb_upper"] - latest["bb_lower"]
    bb_pct = (price - latest["bb_lower"]) / band_range if band_range > 0 else 0.5
    if bb_pct < 0.2:
        signals.append(("布林带", f"接近下轨 {bb_pct:.0%}", +1)); score += 1
    elif bb_pct > 0.8:
        signals.append(("布林带", f"接近上轨 {bb_pct:.0%}", -1)); score -= 1
    else:
        signals.append(("布林带", f"中间区域 {bb_pct:.0%}", 0))

    # 成交量
    if "vol_ma20" in df.columns and not pd.isna(latest.get("vol_ma20")):
        if latest["volume"] > latest["vol_ma20"] * 1.5:
            direction = +1 if score > 0 else -1
            signals.append(("成交量", "放量 (>1.5x均量)", direction)); score += direction

    # 止损建议
    stop_loss = round(price * 0.93, 2)  # -7%

    if score >= 3:   action = "强烈买入 🟢"
    elif score >= 1: action = "观望偏多 🔵"
    elif score <= -3: action = "强烈卖出 🔴"
    elif score <= -1: action = "观望偏空 🟠"
    else:             action = "中性观望 ⚪"

    return {
        "ticker": ticker,
        "date": str(latest.name.date()) if hasattr(latest.name, "date") else str(latest.name),
        "price": round(float(price), 2),
        "score": score,
        "action": action,
        "stop_loss": stop_loss,
        "signals": signals,
        "indicators": {
            "ma20": round(float(latest["ma20"]), 2),
            "ma50": round(float(latest["ma50"]), 2),
            "rsi":  round(float(rsi), 1),
            "macd_hist": round(float(latest["macd_hist"]), 4),
            "bb_upper": round(float(latest["bb_upper"]), 2),
            "bb_lower": round(float(latest["bb_lower"]), 2),
        }
    }


def print_signal(r: dict):
    if "error" in r:
        print(f"\n❌ {r['ticker']}: {r['error']}")
        return
    print(f"\n{'='*55}")
    print(f"  📊 {r['ticker']}  ${r['price']}  ({r['date']})")
    print(f"  综合信号: {r['action']}  (得分: {r['score']:+d})")
    print(f"  建议止损: ${r['stop_loss']}")
    print(f"{'─'*55}")
    for name, detail, _ in r["signals"]:
        print(f"  • {name:<8} {detail}")
    print(f"{'='*55}")
