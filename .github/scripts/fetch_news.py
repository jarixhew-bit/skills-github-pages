#!/usr/bin/env python3
"""抓新闻，产出 trading/news.json 给 fund.html 用。

跑法（只在 GitHub Actions 跑，沙盒连不上这些 RSS 源）：
    python3 .github/scripts/fetch_news.py

跟 portfolio_news.py 的分工：
  - portfolio_news.py  每天早上把「持仓 + 建议」推 Telegram，是给人看的一封信。
  - 本脚本            每小时产出结构化的 news.json，是给页面读的数据。
两者都抓 Yahoo RSS，但用途、频率、产物都不同，所以各写各的，不互相 import
（portfolio_news.py 顶层就读 TELEGRAM_TOKEN，import 它会直接崩）。

【为什么 news.json 是明文公开的】
它按 symbol 组织 universe.json 里那 58 檔的新闻——那份名单本来就在公开仓库里，
不含任何持仓信息。「哪几檔是我的持仓」留给页面解锁后在前端自己比对高亮，
所以公开这个档不会泄露持仓。**不要**在这里塞任何来自 state.enc 的东西。

【翻译】
优先用 Agnes（跟 ai_note.py 同一把 key）批量翻，一次请求翻十几条，省时也省额度；
没有 key 或调用失败就退回保留英文原文——**绝不编译文**，宁可英文也不要假中文。
"""
import os
import re
import json
import time
import html
import hashlib
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor

import requests
import feedparser

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UNIVERSE = os.path.join(BASE, "trading", "universe.json")
OUT = os.path.join(BASE, "trading", "news.json")

MAX_AGE_HOURS = 48          # 超过这个时间的新闻不要，页面上摆旧闻比没有更糟
PER_SYMBOL = 3              # 每檔最多留几条
TRANSLATE_TOP = 40          # 只翻译最终入选的前几条，控制 API 用量
TRANSLATE_BATCH = 12        # 每批几条。太大会整批超时（40 条实测 60 秒回不来）
TRANSLATE_TIMEOUT = 45      # 单批超时秒数

# ⚠️ 一定要用 `.strip() or 默认值`，不能用 os.environ.get(k, 默认值)：
# workflow 里写了 `AGNES_MODEL: ${{ secrets.AGNES_MODEL }}` 而该 secret 未定义时，
# GitHub 注入的是**空字符串**而不是「变量不存在」，get 的默认值根本轮不到。
# 2026-08-16 第一次上线就踩了：base 变成 ""，请求 URL 成了 "/chat/completions"，
# 瞬间失败 → 整批不翻译，页面上全是英文标题。ai_note.py:230 早就写对了，抄它。
AGNES_KEY = os.environ.get("AGNES_API_KEY", "").strip()
AGNES_MODEL = os.environ.get("AGNES_MODEL", "").strip() or "agnes-2.5-flash"
AGNES_BASE = (os.environ.get("AGNES_BASE_URL", "").strip()
              or "https://apihub.agnes-ai.com/v1").rstrip("/")

# 情绪词表：跟 portfolio_news.py 同源，但这里独立维护（那边是推播文案用的，
# 两边调整节奏不同，硬绑在一起反而会互相牵制）
BULLISH = [
    "surge", "rally", "soar", "jump", "gain", "rise", "bull", "record high", "boost",
    "beat", "exceed", "strong", "growth", "upgrade", "buy", "positive", "optimistic",
    "inflow", "breakout", "upside", "recover", "approval", "approve", "adoption",
    "rate cut", "soft landing", "earnings beat", "inflation easing", "outperform",
    "raises guidance", "tops estimates", "all-time high", "expansion",
]
BEARISH = [
    "drop", "fall", "crash", "slump", "decline", "bear", "loss", "risk", "warn",
    "miss", "weak", "downgrade", "sell", "negative", "pessimistic", "outflow", "fear",
    "breakdown", "downside", "concern", "ban", "restrict", "lawsuit", "fine",
    "rate hike", "recession", "layoff", "earnings miss", "default", "probe",
    "cuts guidance", "misses estimates", "plunge", "tumble", "selloff",
]

# 大盘与宏观：不绑单一个股的财经头条
# 2026-08-16 首跑实测：Yahoo 与 MarketWatch 都有量，CNBC 一条都抓不到
# （Actions 的出口 IP 疑似被挡）。留着它无害——单一源失败只是少那一块。
MACRO_FEEDS = [
    ("CNBC", "https://www.cnbc.com/id/100003114/device/rss/rss.html"),
    ("Yahoo 财经", "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US"),
    ("Yahoo 纳指", "https://feeds.finance.yahoo.com/rss/2.0/headline?s=^IXIC&region=US&lang=en-US"),
    ("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
]
# 加密：IBIT 部位相关
CRYPTO_FEEDS = [
    ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    ("Yahoo 加密", "https://feeds.finance.yahoo.com/rss/2.0/headline?s=BTC-USD&region=US&lang=en-US"),
]


def clean(s: str) -> str:
    """RSS 里常混着 HTML 标签与实体，直接摆上页面会看到一堆 &nbsp; 和 <p>。"""
    s = re.sub(r"<[^>]+>", "", s or "")
    return html.unescape(s).strip()


def score(text: str) -> str:
    t = (text or "").lower()
    b = sum(1 for w in BULLISH if w in t)
    r = sum(1 for w in BEARISH if w in t)
    if b > r:
        return "bull"
    if r > b:
        return "bear"
    return "flat"


def entry_time(e):
    """RSS 的时间字段名不统一，两个都试；都没有就当成现在（宁可留下也不误杀）。"""
    for k in ("published_parsed", "updated_parsed"):
        v = e.get(k)
        if v:
            try:
                return datetime(*v[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    return datetime.now(timezone.utc)


def parse_feed(url, source, limit):
    """抓一个 RSS。任何失败都回空清单——一个源挂掉不该让整份 news.json 产不出来。"""
    try:
        feed = feedparser.parse(url)
    except Exception:
        return []
    cutoff = datetime.now(timezone.utc) - timedelta(hours=MAX_AGE_HOURS)
    out = []
    for e in feed.entries[: limit * 3]:
        title = clean(e.get("title", ""))
        if not title:
            continue
        ts = entry_time(e)
        if ts < cutoff:
            continue
        summary = clean(e.get("summary", ""))[:220]
        out.append({
            "title": title,
            "summary": summary,
            "link": e.get("link", ""),
            "source": source,
            "ts": ts.strftime("%Y-%m-%d %H:%M"),
            "_sort": ts.timestamp(),
            "sent": score(title + " " + summary),
            "id": hashlib.md5(title.encode("utf-8")).hexdigest()[:10],
        })
        if len(out) >= limit:
            break
    return out


def fetch_symbol(item):
    sym = item["symbol"]
    url = (f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={sym}"
           f"&region=US&lang=en-US")
    return sym, parse_feed(url, item.get("name") or sym, PER_SYMBOL)


def translate_all(titles):
    """分批翻译。回 (译文列表, 说明)；整批失败的位置留 None，呼叫端保留英文原文。

    为什么分批（2026-08-16 实测）：一次送 40 条，Agnes 60 秒还没回，整批超时作废——
    抓新闻那步跑了 62 秒就是这么来的（60 秒 timeout + 2 秒抓取）。改成每批 12 条后
    单批负载小得多，而且**一批失败只损失那一批**，不会像原来那样全军覆没。
    """
    if not AGNES_KEY:
        return None, "没有 AGNES_API_KEY，保留英文原文"
    if not titles:
        return None, "没有要翻的标题"

    out, errors, done = [None] * len(titles), [], 0
    for i in range(0, len(titles), TRANSLATE_BATCH):
        chunk = titles[i:i + TRANSLATE_BATCH]
        got, err = translate_batch(chunk)
        if got:
            for j, t in enumerate(got):
                if t:
                    out[i + j] = t
                    done += 1
        elif err:
            errors.append(err)

    if done == 0:
        return None, "翻译全部失败：" + "；".join(errors[:2]) if errors else "翻译全部失败"
    note = f"翻了 {done}/{len(titles)} 条"
    if errors:
        note += f"，{len(errors)} 批失败：{errors[0]}"
    return out, note


def translate_batch(titles):
    """翻一批。回 (译文列表 或 None, 错误说明 或 None)。"""
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(titles))
    prompt = (
        "把下面每条英文财经新闻标题翻成简体中文，要求：\n"
        "1. 一条一行，保持原编号，不要加任何额外说明；\n"
        "2. 只翻译，不要评论、不要补充原文没有的信息、不要改动数字；\n"
        "3. 公司名与股票代号保留原文（如 Apple、NVDA）。\n\n" + numbered
    )
    try:
        r = requests.post(
            f"{AGNES_BASE}/chat/completions",
            headers={"Authorization": f"Bearer {AGNES_KEY}"},
            json={"model": AGNES_MODEL, "temperature": 0,
                  "messages": [{"role": "user", "content": prompt}]},
            timeout=TRANSLATE_TIMEOUT,
        )
        r.raise_for_status()
        text = r.json()["choices"][0]["message"]["content"]
    except Exception as e:
        msg = f"{type(e).__name__}: {str(e)[:120]}"
        print(f"[translate] 这批失败，保留英文：{msg}")
        return None, msg

    lines = [l.strip() for l in text.splitlines() if l.strip()]
    out = {}
    for l in lines:
        m = re.match(r"^(\d+)[.、)]\s*(.+)$", l)
        if m:
            idx = int(m.group(1)) - 1
            if 0 <= idx < len(titles):
                out[idx] = m.group(2).strip()
    # 条数对不上就整批放弃：错位的译文比没有译文危险得多
    if len(out) < len(titles) * 0.8:
        msg = f"回传条数对不上（{len(out)}/{len(titles)}）"
        print(f"[translate] {msg}，这批放弃")
        return None, msg
    return [out.get(i) for i in range(len(titles))], None


def main():
    with open(UNIVERSE, encoding="utf-8") as f:
        universe = json.load(f)["tickers"]

    # 58 檔并发抓，序列跑要好几分钟
    by_symbol = {}
    with ThreadPoolExecutor(max_workers=12) as pool:
        for sym, items in pool.map(fetch_symbol, universe):
            if items:
                by_symbol[sym] = items

    macro, crypto = [], []
    with ThreadPoolExecutor(max_workers=6) as pool:
        macro_res = list(pool.map(lambda f: parse_feed(f[1], f[0], 6), MACRO_FEEDS))
        crypto_res = list(pool.map(lambda f: parse_feed(f[1], f[0], 5), CRYPTO_FEEDS))
    for r in macro_res:
        macro.extend(r)
    for r in crypto_res:
        crypto.extend(r)

    # 全局去重：一条新闻只出现在一个地方。
    # 不能只在 macro/crypto 各自内部去重（2026-08-16 首版就是这样，页面上「NiSource」
    # 在 GOOGL 与 AMZN 底下各出现一次、巴菲特那条在宏观与 KO 底下各一次）——
    # 同一篇文章常同时挂在好几檔的 RSS 上，也常同时进宏观与个股。
    # 优先级：宏观 > 加密 > 个股（个股按 universe 顺序，先到先得）。
    seen_ids = set()

    def take(items):
        out = []
        for it in sorted(items, key=lambda x: -x["_sort"]):
            if it["id"] in seen_ids:
                continue
            seen_ids.add(it["id"])
            out.append(it)
        return out

    macro = take(macro)[:10]
    crypto = take(crypto)[:8]
    by_symbol = {sym: kept for sym, items in by_symbol.items()
                 if (kept := take(items))}

    # 翻译：只翻最终会显示的，按「宏观 → 加密 → 个股（新到旧）」排优先序
    flat = []
    for it in macro + crypto:
        flat.append(it)
    sym_items = [it for items in by_symbol.values() for it in items]
    sym_items.sort(key=lambda x: -x["_sort"])
    flat.extend(sym_items)

    targets = flat[:TRANSLATE_TOP]
    zh, translate_note = translate_all([t["title"] for t in targets])
    if zh:
        for it, t in zip(targets, zh):
            if t:
                it["zh"] = t

    for it in flat:
        it.pop("_sort", None)

    counts = {"bull": 0, "bear": 0, "flat": 0}
    for it in flat:
        counts[it["sent"]] = counts.get(it["sent"], 0) + 1

    out = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "counts": counts,
        "translated": bool(zh),
        # 翻译成不成、翻了几条、为什么失败，直接写进产出。
        # 2026-08-16：CI 日志 API 的 tail 取不到中段步骤的输出，排查一次要试好几轮，
        # 所以诊断跟着产出走——看 news.json 就知道，不必再去翻日志。
        "translate_note": translate_note,
        "macro": macro,
        "crypto": crypto,
        "by_symbol": by_symbol,
        "n_symbols": len(by_symbol),
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    total = len(macro) + len(crypto) + sum(len(v) for v in by_symbol.values())
    print(f"[news] {total} 条（宏观 {len(macro)}、加密 {len(crypto)}、"
          f"个股 {len(by_symbol)} 檔）；翻译：{'是' if zh else '否（保留英文）'}")
    # 每个源各抓到几条——某个源哪天挂了，看这行就知道，不用去翻 news.json
    per_source = {}
    for it in macro + crypto:
        per_source[it["source"]] = per_source.get(it["source"], 0) + 1
    print("[news] 各源：" + "、".join(f"{k} {v}" for k, v in sorted(per_source.items())) or "（无）")
    for name, _ in MACRO_FEEDS + CRYPTO_FEEDS:
        if name not in per_source:
            print(f"::warning::新闻源「{name}」这次一条都没抓到")
    print(f"[news] 翻译设定：base={AGNES_BASE} model={AGNES_MODEL} key={'有' if AGNES_KEY else '无'}")
    if total == 0:
        print("::warning::一条新闻都没抓到，可能是 RSS 源全挂了")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
