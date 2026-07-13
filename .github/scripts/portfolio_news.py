import os, html, time, xml.etree.ElementTree as ET
import feedparser, requests, yfinance as yf
from datetime import datetime

TOKEN    = os.environ["TELEGRAM_TOKEN"]
CHAT_ID  = os.environ["TELEGRAM_CHAT_ID"]
FLEX_TOK = os.environ["IBKR_FLEX_TOKEN"]
FLEX_QID = os.environ["IBKR_FLEX_QUERY_ID"]
TODAY    = datetime.now().strftime("%Y-%m-%d")

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

# ── 工具 ───────────────────────────────────────────

def send(text):
    requests.post(
        f"https://api.telegram.org/bot{TOKEN}/sendMessage",
        json={"chat_id": CHAT_ID, "text": text,
              "parse_mode": "HTML", "disable_web_page_preview": True},
        timeout=15
    )

def translate(text):
    if not text.strip(): return text
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

def fetch_ibkr_positions():
    """IBKR Flex Query 拉取持仓"""
    base = "https://gdcdyn.interactivebrokers.com/Universal/servlet/FlexStatementService"
    # Step 1: 请求生成报告（IBKR 报表生成偶发繁忙，重试 4 次，与 trading/flex_account.py 一致）
    ref = None
    for attempt in range(4):
        if attempt:
            time.sleep(30)
        r1 = requests.get(
            f"{base}.SendRequest",
            params={"v": "3", "t": FLEX_TOK, "q": FLEX_QID, "fp": "1"},
            timeout=30
        )
        root1 = ET.fromstring(r1.text)
        ref   = root1.findtext("ReferenceCode")
        if ref:
            break
        print(f"⚠️ SendRequest 第 {attempt+1} 次未返回 ReferenceCode:",
              root1.findtext("ErrorCode"), root1.findtext("ErrorMessage"))
    if not ref:
        print("⚠️ Flex Query 多次重试仍失败，使用默认持仓")
        return None

    # Step 2: 获取报告（最多重试 5 次）
    time.sleep(5)
    for _ in range(5):
        r2   = requests.get(
            f"{base}.GetStatement",
            params={"v": "3", "q": ref, "t": FLEX_TOK},
            timeout=30
        )
        if "<FlexQueryResponse" in r2.text:
            break
        time.sleep(5)

    root2     = ET.fromstring(r2.text)
    positions = {}
    for pos in root2.iter("OpenPosition"):
        sym  = pos.get("symbol", "")
        qty  = float(pos.get("position") or pos.get("quantity") or 0)
        cost = float(pos.get("costBasisPrice") or pos.get("avgCost") or 0)
        ac   = pos.get("assetCategory", "STK")
        if sym and qty and ac == "STK":
            positions[sym] = {"qty": round(qty, 4), "cost": round(cost, 4)}
    return positions if positions else None

def compute_rsi(hist, period=14):
    delta = hist["Close"].diff()
    gain  = delta.where(delta > 0, 0).rolling(period).mean()
    loss  = -delta.where(delta < 0, 0).rolling(period).mean()
    rs    = gain / loss
    rsi   = 100 - 100 / (1 + rs)
    return round(rsi.iloc[-1], 1)

def fetch_price(ticker):
    tk   = yf.Ticker(ticker)
    hist = tk.history(period="1y")
    price     = round(tk.fast_info.last_price, 2)
    prev      = round(hist["Close"].iloc[-2], 2)
    day_chg   = round((price - prev) / prev * 100, 2)
    high52    = round(hist["High"].max(), 2)
    low52     = round(hist["Low"].min(), 2)
    pct_range = round((price - low52) / (high52 - low52) * 100, 1)
    rsi       = compute_rsi(hist)
    return price, day_chg, high52, low52, pct_range, rsi

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
        cn_title   = translate(title);   time.sleep(0.5)
        cn_summary = translate(summary); time.sleep(0.5)
        items.append({"sent": sent, "cn_title": cn_title,
                      "cn_summary": cn_summary, "link": link})
    return items

def fetch_macro():
    result = {}
    for name, sym in {"VIX": "^VIX", "DXY": "DX-Y.NYB", "US10Y": "^TNX"}.items():
        try:
            hist  = yf.Ticker(sym).history(period="5d")
            price = round(hist["Close"].iloc[-1], 2)
            prev  = round(hist["Close"].iloc[-2], 2)
            result[name] = (price, round((price-prev)/prev*100, 2))
        except Exception:
            result[name] = ("N/A", 0)
    return result

def fetch_fear_greed():
    try:
        data = requests.get("https://api.alternative.me/fng/", timeout=10).json()["data"][0]
        return data["value"], data["value_classification"]
    except Exception:
        return "N/A", "N/A"

def buy_rec(price, cost, pct_range, bull_c, bear_c, total, rsi):
    pnl    = (price - cost) / cost * 100
    sratio = bull_c / total if total > 0 else 0.5
    pos    = pct_range / 100
    sc = 0
    if pnl <= 0:        sc += 2
    elif pnl <= 20:     sc += 1
    if pos <= 0.3:      sc += 2
    elif pos <= 0.5:    sc += 1
    if sratio >= 0.6:   sc += 1
    elif sratio <= 0.3: sc -= 1
    if rsi <= 30:       sc += 2
    elif rsi <= 40:     sc += 1
    elif rsi >= 70:     sc -= 1
    if sc >= 5:   return "⭐ 建议分批加仓"
    elif sc >= 3: return "🟡 可小量加仓"
    elif sc >= 0: return "⏸️ 观望为主"
    else:         return "⛔ 建议暂缓"


# ── 主流程 ───────────────────────────────────────────

# 拉取 IBKR 持仓
print("拉取 IBKR 持仓...")
ibkr = fetch_ibkr_positions()

# 默认过滤（只看 ETF，排除 SGOV）
EXCLUDE = {"SGOV"}
NAME_MAP = {
    "IBIT": "比特币 ETF (IBIT)",
    "VOO":  "标普500 ETF (VOO)",
}

STALE = False
if ibkr:
    HOLDINGS = {
        sym: {"name": NAME_MAP.get(sym, sym), "qty": v["qty"], "cost": v["cost"]}
        for sym, v in ibkr.items() if sym not in EXCLUDE
    }
    print(f"成功拉取 IBKR 持仓: {list(HOLDINGS.keys())}")
else:
    # 回退到默认数据（可能非最新，仅作占位，消息里会标注）
    STALE = True
    HOLDINGS = {
        "IBIT": {"name": "比特币 ETF (IBIT)",  "qty": 357.57, "cost": 39.08},
        "VOO":  {"name": "标普500 ETF (VOO)", "qty": 114.18, "cost": 550.46},
    }
    print("使用默认持仓数据（IBKR Flex 拉取失败）")

# 1. 宏观指标
print("拉取宏观指标...")
macro        = fetch_macro()
fg_val, fg_l = fetch_fear_greed()
vix,  vix_c  = macro["VIX"]
dxy,  dxy_c  = macro["DXY"]
tn,   tn_c   = macro["US10Y"]
vix_icon = "🔴" if isinstance(vix, float) and vix > 25 else "🟢"

send(
    f"🌍 <b>宏观指标 — {TODAY}</b>\n"
    f"────────────────────\n"
    f"{vix_icon} VIX 恐慧指数: <b>{vix}</b> ({vix_c:+.2f}%)\n"
    f"   &gt;30 极度恐慧 | 20-30 波动 | &lt;20 平静\n"
    f"💵 美元指数 DXY: <b>{dxy}</b> ({dxy_c:+.2f}%)\n"
    f"📉 10年期国债: <b>{tn}%</b> ({tn_c:+.2f}%)\n"
    f"🔥 BTC 恐慧贪婪: <b>{fg_val}</b> （{fg_l}）\n"
    f"   0-25 极度恐慧 | 25-45 恐慧 | 55+ 贪婪"
)

# 2. 持仓分析
bull_total = bear_total = neut_total = 0

for ticker, info in HOLDINGS.items():
    print(f"处理 {ticker}...")
    price, day_chg, high52, low52, pct_range, rsi = fetch_price(ticker)
    news   = fetch_news(ticker)
    bull_c = sum(1 for n in news if "利好" in n["sent"])
    bear_c = sum(1 for n in news if "利空" in n["sent"])
    neut_c = len(news) - bull_c - bear_c
    bull_total += bull_c; bear_total += bear_c; neut_total += neut_c
    total   = bull_c + bear_c + neut_c
    pnl_pct = (price - info["cost"]) / info["cost"] * 100
    pnl_usd = round((price - info["cost"]) * info["qty"], 2)
    mv      = round(price * info["qty"], 2)
    rec     = buy_rec(price, info["cost"], pct_range, bull_c, bear_c, total, rsi)
    overall = "🟢 利好" if bull_c > bear_c else ("🔴 利空" if bear_c > bull_c else "⚪ 中性")
    day_icon = "🟢" if day_chg >= 0 else "🔴"
    alert = "\n⚠️ <b>单日涨跌超 3%，请关注！</b>" if abs(day_chg) >= 3 else ""
    rsi_note = " 🟢超卖" if rsi <= 30 else (" 🔴超买" if rsi >= 70 else "")

    stale_note = "\n⚠️ <b>IBKR 持仓拉取失败，以下股数/成本为上次已知值，可能非最新</b>" if STALE else ""
    lines = [
        f"📈 <b>{html.escape(info['name'])}</b>{alert}{stale_note}",
        f"持仓 {info['qty']} 股 | 均成本 ${info['cost']}",
        f"当前价 <b>${price}</b> {day_icon} ({day_chg:+.2f}%)",
        f"市值 ${mv:,.0f} | 浮盈亏 <b>${pnl_usd:+,.0f}</b> ({pnl_pct:+.1f}%)",
        f"52周: 高 ${high52} / 低 ${low52} | 位置 {pct_range:.0f}%",
        f"RSI(14): <b>{rsi}</b>{rsi_note}",
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

# 3. 总结
if bull_total > bear_total:   mood = "🟢 利好"
elif bear_total > bull_total: mood = "🔴 利空"
else:                          mood = "⚪ 中性"

send(
    f"📊 <b>组合汇总 — {TODAY}</b>\n"
    f"整体情绪: {mood}\n"
    f"新闻: 利好 {bull_total} | 利空 {bear_total} | 中性 {neut_total}\n"
    f"每日北京 08:00 由 GitHub Actions 自动推送"
)
print("全部完成")
