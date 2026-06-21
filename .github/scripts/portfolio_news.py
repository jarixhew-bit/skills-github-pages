import os, html, time, feedparser, requests, yfinance as yf
from datetime import datetime

# ── 持仓（第二步将自动从 IBKR 拉取）
HOLDINGS = {
    "IBIT": {"name": "比特币 ETF (IBIT)",  "qty": 357.57, "cost": 39.08},
    "VOO":  {"name": "标普500 ETF (VOO)", "qty": 114.18, "cost": 550.46},
}

BULLISH = [
    "surge","rally","soar","jump","gain","rise","bull","record high","boost",
    "beat","exceed","strong","growth","upgrade","buy","positive","optimistic",
    "inflow","breakout","upside","recover","approval","approve","adoption",
    "rate cut","fed pivot","soft landing","earnings beat","inflation easing",
]
BEARISH = [
    "drop","fall","crash","slump","decline","bear","loss","risk","warn",
    "miss","weak","downgrade","sell","negative","pessimistic","outflow","fear",
    "breakdown","downside","concern","ban","restrict","lawsuit","fine",
    "rate hike","recession","layoff","earnings miss","default","inflation",
]

TOKEN   = os.environ["TELEGRAM_TOKEN"]
CHAT_ID = os.environ["TELEGRAM_CHAT_ID"]
TODAY   = datetime.now().strftime("%Y-%m-%d")


# ── 工具函数 ────────────────────────────────────────

def translate(text):
    """MyMemory 免费翻译 EN → ZH"""
    if not text.strip():
        return text
    try:
        r = requests.get(
            "https://api.mymemory.translated.net/get",
            params={"q": text[:400], "langpair": "en|zh"},
            timeout=10
        )
        result = r.json()["responseData"]["translatedText"]
        return result if result else text
    except Exception:
        return text

def score(text):
    t = text.lower()
    bull = sum(1 for w in BULLISH if w in t)
    bear = sum(1 for w in BEARISH if w in t)
    if bull > bear:   return "🟢 利好"
    elif bear > bull: return "🔴 利空"
    else:             return "⚪ 中性"

def fetch_price(ticker):
    tk   = yf.Ticker(ticker)
    hist = tk.history(period="1y")
    price     = round(tk.fast_info.last_price, 2)
    prev      = round(hist["Close"].iloc[-2], 2)
    day_chg   = round((price - prev) / prev * 100, 2)
    high52    = round(hist["High"].max(), 2)
    low52     = round(hist["Low"].min(), 2)
    pct_range = round((price - low52) / (high52 - low52) * 100, 1)
    return price, prev, day_chg, high52, low52, pct_range

def fetch_news(ticker):
    feed  = feedparser.parse(
        f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
    )
    items = []
    for e in feed.entries[:5]:
        title   = e.get("title", "")
        link    = e.get("link", "")
        summary = e.get("summary", "")[:200]
        sent    = score(title + " " + summary)
        cn_title = translate(title)
        time.sleep(0.5)  # 避免翻译 API 限流
        cn_summary = translate(summary) if summary else ""
        items.append({"sent": sent, "cn_title": cn_title,
                      "cn_summary": cn_summary, "link": link})
    return items

def fetch_macro():
    result = {}
    tickers = {"VIX": "^VIX", "DXY": "DX-Y.NYB", "US10Y": "^TNX"}
    for name, sym in tickers.items():
        try:
            tk    = yf.Ticker(sym)
            hist  = tk.history(period="5d")
            price = round(hist["Close"].iloc[-1], 2)
            prev  = round(hist["Close"].iloc[-2], 2)
            chg   = round((price - prev) / prev * 100, 2)
            result[name] = (price, chg)
        except Exception:
            result[name] = ("N/A", 0)
    return result

def fetch_fear_greed():
    try:
        r    = requests.get("https://api.alternative.me/fng/", timeout=10)
        data = r.json()["data"][0]
        return data["value"], data["value_classification"]
    except Exception:
        return "N/A", "N/A"

def buy_rec(price, cost, pct_range, bull_c, bear_c, total):
    pnl     = (price - cost) / cost * 100
    sratio  = bull_c / total if total > 0 else 0.5
    pos     = pct_range / 100
    sc = 0
    if pnl <= 0:       sc += 2
    elif pnl <= 20:    sc += 1
    if pos <= 0.3:     sc += 2
    elif pos <= 0.5:   sc += 1
    if sratio >= 0.6:  sc += 1
    elif sratio <= 0.3: sc -= 1
    if sc >= 4:   return "⭐ 建议分批加仓"
    elif sc >= 2: return "🟡 可小量加仓"
    elif sc >= 0: return "⏸️ 观望为主"
    else:         return "⛔ 建议暂缓"

def send(text):
    requests.post(
        f"https://api.telegram.org/bot{TOKEN}/sendMessage",
        json={"chat_id": CHAT_ID, "text": text,
              "parse_mode": "HTML", "disable_web_page_preview": True},
        timeout=15
    )


# ── 1. 宏观指标 ────────────────────────────────────────
print("拉取宏观指标...")
macro = fetch_macro()
fg_val, fg_label = fetch_fear_greed()

vix,   vix_chg   = macro["VIX"]
dxy,   dxy_chg   = macro["DXY"]
us10y, us10y_chg = macro["US10Y"]

vix_icon  = "🔴" if isinstance(vix, float) and vix > 25 else "🟢"
fg_icon   = "🟢" if isinstance(fg_val, str) and int(fg_val) >= 50 else "🔴" if isinstance(fg_val, str) else "⚪"

macro_msg = (
    f"🌍 <b>宏观指标 — {TODAY}</b>\n"
    f"────────────────────\n"
    f"{vix_icon} VIX 恐慧指数: <b>{vix}</b>  ({vix_chg:+.2f}%)\n"
    f"   &gt;30 极度恐慧 | 20-30 波动 | &lt;20 平静\n"
    f"💵 美元指数 DXY: <b>{dxy}</b>  ({dxy_chg:+.2f}%)\n"
    f"   美元强 → 对 IBIT/VOO 小利空\n"
    f"📉 10年期国债: <b>{us10y}%</b>  ({us10y_chg:+.2f}%)\n"
    f"   收益率高 → 对成长股小利空\n"
    f"{fg_icon} BTC 恐慧贪婪指数: <b>{fg_val}</b> （{fg_label}）\n"
    f"   0-25 极度恐慧 | 25-45 恐慧 | 45-55 中性 | 55+ 贪婪"
)
send(macro_msg)
print("宏观指标已发送")


# ── 2. 持仓分析 ────────────────────────────────────────
bull_total = bear_total = neut_total = 0

for ticker, info in HOLDINGS.items():
    print(f"处理 {ticker}...")
    price, prev, day_chg, high52, low52, pct_range = fetch_price(ticker)
    news   = fetch_news(ticker)
    bull_c = sum(1 for n in news if "利好" in n["sent"])
    bear_c = sum(1 for n in news if "利空" in n["sent"])
    neut_c = len(news) - bull_c - bear_c
    bull_total += bull_c; bear_total += bear_c; neut_total += neut_c
    total  = bull_c + bear_c + neut_c
    pnl    = (price - info["cost"]) / info["cost"] * 100
    pnl_usd = round((price - info["cost"]) * info["qty"], 2)
    mv     = round(price * info["qty"], 2)
    rec    = buy_rec(price, info["cost"], pct_range, bull_c, bear_c, total)

    if bull_c > bear_c:   overall = "🟢 利好"
    elif bear_c > bull_c: overall = "🔴 利空"
    else:                 overall = "⚪ 中性"

    day_icon = "🟢" if day_chg >= 0 else "🔴"
    alert    = "\n⚠️ <b>单日涨跌超过 3%，请关注！</b>" if abs(day_chg) >= 3 else ""

    lines = [
        f"📈 <b>{html.escape(info['name'])}</b>{alert}",
        f"持仓 {info['qty']} 股 | 均成本 ${info['cost']}",
        f"当前价 <b>${price}</b> {day_icon} ({day_chg:+.2f}%)",
        f"市值 ${mv:,.0f} | 浮盈亏 <b>${pnl_usd:+,.0f}</b> ({pnl:+.1f}%)",
        f"52周: 高 ${high52} / 低 ${low52} | 位置 {pct_range:.0f}%",
        f"情绪: {overall} (利好 {bull_c} | 利空 {bear_c} | 中性 {neut_c})",
        f"今日建议: <b>{rec}</b>",
        "",
        "📰 最新资讯（已翻译）",
    ]
    for i, n in enumerate(news, 1):
        lines.append(f"{i}. {n['sent']} <a href='{n['link']}'>{html.escape(n['cn_title'])}</a>")
        if n["cn_summary"]:
            lines.append(f"   <i>{html.escape(n['cn_summary'][:120])}...</i>")

    send("\n".join(lines))
    print(f"{ticker} 已发送")
    time.sleep(1)


# ── 3. 总结 ────────────────────────────────────────────
if bull_total > bear_total:   mood = "🟢 利好"
elif bear_total > bull_total: mood = "🔴 利空"
else:                          mood = "⚪ 中性"

send(
    f"📊 <b>组合汇总 — {TODAY}</b>\n"
    f"整体情绪: {mood}\n"
    f"新闻: 利好 {bull_total} | 利空 {bear_total} | 中性 {neut_total}\n"
    f"每日北京 08:00 自动推送"
)
print("全部完成")
