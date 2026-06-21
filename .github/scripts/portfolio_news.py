import os, feedparser, yfinance as yf, urllib.request, urllib.parse, json
from datetime import datetime

HOLDINGS = {
    "IBIT": {"name": "iShares 比特币 ETF", "qty": 357.57, "cost": 39.08},
    "VOO":  {"name": "Vanguard 标普500 ETF",  "qty": 114.18, "cost": 550.46},
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

def score(text):
    t = text.lower()
    bull = sum(1 for w in BULLISH if w in t)
    bear = sum(1 for w in BEARISH if w in t)
    if bull > bear:   return "🟢 利好", bull, bear
    elif bear > bull: return "🔴 利空", bull, bear
    else:             return "⚪ 中性", bull, bear

def fetch_price_data(ticker):
    tk = yf.Ticker(ticker)
    hist = tk.history(period="1y")
    price  = round(tk.fast_info.last_price, 2)
    high52 = round(hist["High"].max(), 2)
    low52  = round(hist["Low"].min(), 2)
    pct    = round((price - low52) / (high52 - low52) * 100, 1)
    return price, high52, low52, pct

def fetch_news(ticker):
    url  = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={ticker}&region=US&lang=en-US"
    feed = feedparser.parse(url)
    items = []
    for e in feed.entries[:6]:
        title   = e.get("title", "")
        link    = e.get("link", "")
        summary = e.get("summary", "")[:150]
        s, b, br = score(title + " " + summary)
        items.append({"title": title, "link": link, "sentiment": s, "summary": summary})
    return items

def buy_recommendation(price, cost, pct_from_low, bull_c, bear_c, total):
    pnl_pct    = (price - cost) / cost * 100
    sent_ratio = bull_c / total if total > 0 else 0.5
    pos        = pct_from_low / 100
    sc = 0
    if pnl_pct <= 0:        sc += 2
    elif pnl_pct <= 20:     sc += 1
    if pos <= 0.3:          sc += 2
    elif pos <= 0.5:        sc += 1
    if sent_ratio >= 0.6:   sc += 1
    elif sent_ratio <= 0.3: sc -= 1
    if sc >= 4:   return "⭐ 建议分批加仓"
    elif sc >= 2: return "🟡 可小量加仓"
    elif sc >= 0: return "⏸️ 观望为主"
    else:         return "⛔ 建议暂缓"

def send_telegram(token, chat_id, text):
    url  = f"https://api.telegram.org/bot{token}/sendMessage"
    data = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": "true"
    }).encode()
    urllib.request.urlopen(url, data=data, timeout=15)

today  = datetime.now().strftime("%Y-%m-%d")
token  = os.environ["TELEGRAM_TOKEN"]
chat_id = os.environ["TELEGRAM_CHAT_ID"]
bull_total = bear_total = neutral_total = 0

for ticker, info in HOLDINGS.items():
    news = fetch_news(ticker)
    price, high52, low52, pct = fetch_price_data(ticker)
    bull_c = sum(1 for n in news if "利好" in n["sentiment"])
    bear_c = sum(1 for n in news if "利空" in n["sentiment"])
    neut_c = len(news) - bull_c - bear_c
    bull_total += bull_c; bear_total += bear_c; neutral_total += neut_c
    total   = bull_c + bear_c + neut_c
    pnl_usd = round((price - info["cost"]) * info["qty"], 2)
    pnl_pct = (price - info["cost"]) / info["cost"] * 100
    mv      = round(price * info["qty"], 2)
    rec     = buy_recommendation(price, info["cost"], pct, bull_c, bear_c, total)

    if bull_c > bear_c:   overall = "🟢 利好"
    elif bear_c > bull_c: overall = "🔴 利空"
    else:                 overall = "⚪ 中性"

    lines = []
    lines.append(f"📈 <b>{info['name']} ({ticker})</b>  {today}")
    lines.append(f"持仓 {info['qty']} 股 | 均成本 ${info['cost']}")
    lines.append(f"当前价 <b>${price}</b> | 市值 ${mv:,.0f}")
    lines.append(f"浮盈亏 <b>${pnl_usd:+,.0f}</b> ({pnl_pct:+.1f}%)")
    lines.append(f"52周: 高 ${high52} / 低 ${low52} | 当前位置 {pct:.0f}%")
    lines.append(f"新闻情绪: {overall} (利好 {bull_c} | 利空 {bear_c} | 中性 {neut_c})")
    lines.append(f"今日建议: <b>{rec}</b>")
    lines.append("")
    lines.append("📰 相关新闻")
    for i, n in enumerate(news, 1):
        lines.append(f"{i}. {n['sentiment']} <a href='{n['link']}'>{n['title']}</a>")
        if n["summary"]:
            lines.append(f"   <i>{n['summary']}...</i>")
    lines.append("")
    lines.append("─" * 20)

    send_telegram(token, chat_id, "\n".join(lines))
    print(f"{ticker} sent.")

# Summary message
if bull_total > bear_total:   mood = "🟢 利好"
elif bear_total > bull_total: mood = "🔴 利空"
else:                          mood = "⚪ 中性"
summary = (
    f"📊 <b>组合总情绪 {today}</b>\n"
    f"整体情绪: {mood}\n"
    f"利好 {bull_total} | 利空 {bear_total} | 中性 {neutral_total}\n"
    f"每日北京 08:00 由 GitHub Actions 自动发送"
)
send_telegram(token, chat_id, summary)
print("Summary sent.")
