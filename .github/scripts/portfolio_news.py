import os, html, time, base64, hashlib, json
import feedparser, requests, yfinance as yf
from datetime import datetime

TOKEN    = os.environ["TELEGRAM_TOKEN"]
CHAT_ID  = os.environ["TELEGRAM_CHAT_ID"]
# 2026-08-12 起本脚本**不再自己去打 IBKR Flex**，改读 trading-daily 已经抓好并
# 加密提交的 trading/state.enc（原因见 fetch_ibkr_positions 的说明）。
ANALYZER_PW = os.environ.get("ANALYZER_PW")
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

def _derive_key(password: str, salt: bytes, iterations: int) -> bytes:
    """PBKDF2-SHA256，参数**从档案自己带的 `iter` 字段读**，不在这里写死。

    为什么（2026-08-12 当场踩到）：analyzer.py 用的是 300_000 次，我第一版在这里
    照记忆写了 200_000，解密会直接失败——而失败的表现是「早报默默改用 fallback
    底数」，跟正常几乎分不出来。两个文件各存一份同样的常数，迟早会分岔；
    envelope 里既然已经写了 iter，就该以它为准，从结构上让分岔不可能发生。
    """
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, dklen=32)


def fetch_ibkr_positions():
    """读 trading/state.enc 里的持仓底数。返回 (positions|None, error_detail|None)

    2026-08-12 改：**本脚本不再自己去打 IBKR Flex。**

    原因有两个，都不是小事：
    (1) 本仓库有两个任务各自去打同一个 Flex Query（本脚本 ＋ trading-daily），
        而仓库自己的笔记里就记着这两个撞车过——「后到的一方撞上报表生成冷却期，
        被 ErrorCode 1001 持续拒绝」。少一个调用方，这类碰撞直接归零。
    (2) 请求量砍一半。2026-08 连坏一个多星期的那次故障，机制是「失败触发重试 →
        流量翻倍 → 1018 限流被维持住 → 隔天继续失败」，少一个调用方就少一份燃料。

    改成读 trading-daily 已经抓好、加密提交进仓库的 state.enc。不损失新鲜度：
    Flex Query 的周期是 LastBusinessDay，给的本来就是上一个交易日收盘的持仓，
    自己去打一次拿到的是同一份数据。

    拿不到就回 None，由主流程走 fallback 档（跟以前一样）。
    """
    if not ANALYZER_PW:
        return None, "没有 ANALYZER_PW，无法解密 trading/state.enc"
    path = os.path.join(os.path.dirname(__file__), "..", "..", "trading", "state.enc")
    if not os.path.exists(path):
        return None, f"找不到 {path}"
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        env = json.loads(open(path, encoding="utf-8").read())
        key = _derive_key(ANALYZER_PW, base64.b64decode(env["salt"]),
                          int(env.get("iter") or 300_000))
        pt = AESGCM(key).decrypt(base64.b64decode(env["nonce"]),
                                 base64.b64decode(env["ct"]), None)
        state = json.loads(pt.decode("utf-8"))
    except Exception as e:
        return None, f"解密 state.enc 失败：{type(e).__name__}: {e}"

    positions = {}
    for p in state.get("positions") or []:
        sym = p.get("symbol")
        qty = float(p.get("qty") or 0)
        # analyzer 那边字段叫 avg_price，本脚本一路用的是 cost，这里对齐
        cost = float(p.get("avg_price") or 0)
        if sym and qty:
            positions[sym] = {"qty": round(qty, 4), "cost": round(cost, 4)}
    if not positions:
        return None, "state.enc 解开了但里面没有持仓（trading-daily 可能还没抓到过）"
    return positions, None


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

print("拉取 IBKR 持仓...")
ibkr, ibkr_error = fetch_ibkr_positions()

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
    STALE = True
    # 底数来自 .github/data/ibkr-positions-fallback.json（由 Claude session 用 IBKR
    # 连接器手动同步刷新）。2026-08-06 前这里是写死在代码里的旧数字，Flex 一失效
    # 早报就拿过期持仓算钱——改成外部档案，刷新时不必动代码，且能标注同步日期。
    fb_path = os.path.join(os.path.dirname(__file__), "..", "data",
                           "ibkr-positions-fallback.json")
    with open(fb_path, encoding="utf-8") as f:
        fb = json.load(f)
    fb_as_of = fb.get("as_of", "未知日期")
    HOLDINGS = {
        sym: {"name": NAME_MAP.get(sym, sym), "qty": v["qty"], "cost": v["cost"]}
        for sym, v in fb["positions"].items() if sym not in EXCLUDE
    }
    print(f"使用备用持仓底数（as_of {fb_as_of}，IBKR Flex 拉取失败）：{ibkr_error}")
    try:
        stale_days = (datetime.now() - datetime.strptime(fb_as_of, "%Y-%m-%d")).days
    except ValueError:
        stale_days = -1
    age_hint = (f"底数同步日期：{fb_as_of}"
                + ("（已 %d 天未刷新，数字可能已偏离）" % stale_days
                   if stale_days > 14 else ""))
    send(
        f"⚠️ <b>IBKR 持仓同步失败 — {TODAY}</b>\n"
        f"以下持仓早报使用备用底数，非实时。\n"
        f"{html.escape(age_hint)}\n"
        f"失败原因: <code>{html.escape(str(ibkr_error))}</code>\n"
        f"连续多天出现 1001 = IBKR 那边的 Flex Query 定义有问题，不是服务器繁忙。"
    )

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
