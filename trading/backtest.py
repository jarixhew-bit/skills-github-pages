"""
回测框架 — 接受 IBKR bars 数据或 DataFrame
"""
import pandas as pd
import numpy as np
from signals import add_indicators, ibkr_bars_to_df


class BacktestResult:
    def __init__(self, trades, equity, ticker, strategy):
        self.trades  = trades
        self.equity  = equity
        self.ticker  = ticker
        self.strategy = strategy

    def summary(self):
        eq = self.equity
        returns = eq.pct_change().dropna()
        total_ret  = (eq.iloc[-1] / eq.iloc[0] - 1) * 100
        annual_ret = ((eq.iloc[-1] / eq.iloc[0]) ** (252 / max(len(eq), 1)) - 1) * 100
        peak = eq.cummax()
        max_dd = ((eq - peak) / peak).min() * 100
        excess = returns - 0.04 / 252
        sharpe = float(excess.mean() / returns.std() * np.sqrt(252)) if returns.std() > 0 else 0
        won = self.trades[self.trades["pnl"] > 0] if len(self.trades) else pd.DataFrame()
        win_rate = len(won) / len(self.trades) * 100 if len(self.trades) else 0
        return {
            "ticker": self.ticker, "strategy": self.strategy,
            "period": f"{eq.index[0]} ~ {eq.index[-1]}",
            "total_return": round(total_ret, 2),
            "annual_return": round(annual_ret, 2),
            "max_drawdown": round(max_dd, 2),
            "sharpe": round(sharpe, 2),
            "total_trades": len(self.trades),
            "win_rate": round(win_rate, 1),
        }

    def print_report(self):
        s = self.summary()
        ret_sign = "+" if s["total_return"] >= 0 else ""
        print(f"\n{'='*55}")
        print(f"  {s['ticker']} · {s['strategy']}")
        print(f"{'─'*55}")
        print(f"  总收益率:  {ret_sign}{s['total_return']}%   年化: {ret_sign}{s['annual_return']}%")
        print(f"  最大回撤:  {s['max_drawdown']}%   夏普: {s['sharpe']}")
        print(f"  交易次数:  {s['total_trades']}   胜率: {s['win_rate']}%")
        print(f"{'='*55}")


def backtest(df_or_bars, strategy_fn, initial_capital=10000, strategy_name="Custom", ticker=""):
    """
    df_or_bars: DataFrame 或 IBKR bars list
    strategy_fn(df, i) -> "BUY" | "SELL" | None
    """
    if isinstance(df_or_bars, list):
        df = ibkr_bars_to_df(df_or_bars)
    else:
        df = df_or_bars.copy()

    df = add_indicators(df).dropna()

    cash, shares, entry_price = initial_capital, 0, 0
    trades, equity = [], []

    for i in range(len(df)):
        price  = float(df.iloc[i]["close"])
        signal = strategy_fn(df, i)

        if signal == "BUY" and shares == 0 and cash > 0:
            shares      = int(cash / price)
            entry_price = price
            cash       -= shares * price

        elif signal == "SELL" and shares > 0:
            pnl = (price - entry_price) * shares
            trades.append({"date": df.index[i], "price": price, "shares": shares, "pnl": pnl})
            cash  += shares * price
            shares = 0

        equity.append(cash + shares * price)

    trades_df = pd.DataFrame(trades) if trades else pd.DataFrame(columns=["date","price","shares","pnl"])
    equity_s  = pd.Series(equity, index=df.index)
    return BacktestResult(trades_df, equity_s, ticker, strategy_name)


# ── 内建策略 ──────────────────────────────────────

def strategy_ma(df, i):
    if i < 1: return None
    c, p = df.iloc[i], df.iloc[i-1]
    if p["ma20"] <= p["ma50"] and c["ma20"] > c["ma50"]: return "BUY"
    if p["ma20"] >= p["ma50"] and c["ma20"] < c["ma50"]: return "SELL"

def strategy_rsi(df, i, buy=30, sell=70):
    if i < 1: return None
    c, p = df.iloc[i], df.iloc[i-1]
    if p["rsi"] <= buy  and c["rsi"] > buy:  return "BUY"
    if p["rsi"] >= sell and c["rsi"] < sell: return "SELL"

def strategy_macd(df, i):
    if i < 1: return None
    c, p = df.iloc[i], df.iloc[i-1]
    if p["macd_hist"] <= 0 and c["macd_hist"] > 0: return "BUY"
    if p["macd_hist"] >= 0 and c["macd_hist"] < 0: return "SELL"

def strategy_combined(df, i):
    if i < 1: return None
    c, p = df.iloc[i], df.iloc[i-1]
    macd_up = p["macd_hist"] <= 0 and c["macd_hist"] > 0
    macd_dn = p["macd_hist"] >= 0 and c["macd_hist"] < 0
    if macd_up and c["rsi"] < 55: return "BUY"
    if macd_dn and c["rsi"] > 45: return "SELL"


STRATEGIES = {
    "MA金叉死叉": strategy_ma,
    "RSI超买超卖": strategy_rsi,
    "MACD金叉":   strategy_macd,
    "综合策略":   strategy_combined,
}


def run_all_strategies(df_or_bars, ticker="", capital=10000):
    """对同一组数据跑所有内建策略并对比"""
    print(f"\n{'#'*55}")
    print(f"  策略对比: {ticker}")
    print(f"{'#'*55}")
    for name, fn in STRATEGIES.items():
        r = backtest(df_or_bars, fn, capital, strategy_name=name, ticker=ticker)
        r.print_report()
