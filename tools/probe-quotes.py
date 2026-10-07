#!/usr/bin/env python3
"""一次性探测：免费行情源对 GitHub runner 的态度、CORS、批量、新鲜度。验完即删。"""
import json, sys, time, datetime as dt, statistics, urllib.request, urllib.error, urllib.parse
from zoneinfo import ZoneInfo

ORIGIN = "https://jarixhew-bit.github.io"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SYMS = [t["symbol"] for t in json.load(open("trading/universe.json"))["tickers"]]
PUB = {t["symbol"]: t["price"] for t in json.load(open("trading/data-public.json"))["tickers"]}
NOW = time.time()
ny = dt.datetime.now(ZoneInfo("America/New_York"))
open_now = ny.weekday() < 5 and dt.time(9, 30) <= ny.time() < dt.time(16, 0)
out = {"now_utc": dt.datetime.utcnow().isoformat(), "now_ny": ny.isoformat(), "us_regular_session_open": open_now, "probes": []}

def get(url, headers=None, method="GET"):
    h = {"User-Agent": UA, "Origin": ORIGIN, "Accept": "*/*"}
    h.update(headers or {})
    req = urllib.request.Request(url, headers=h, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=25)
        return r.status, dict(r.headers), r.read(), r.headers.get_all("Set-Cookie")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read(), None
    except Exception as e:
        return "ERR " + type(e).__name__ + ": " + str(e)[:120], {}, b"", None

def cors(h):
    hl = {k.lower(): v for k, v in h.items()}
    return {"acao": hl.get("access-control-allow-origin"), "acac": hl.get("access-control-allow-credentials")}

def cmp_pub(prices):  # prices: sym -> float
    diffs = {s: round((p - PUB[s]) / PUB[s] * 100, 3) for s, p in prices.items() if s in PUB and p}
    if not diffs: return None
    a = [abs(x) for x in diffs.values()]
    return {"n": len(diffs), "median_abs_pct": round(statistics.median(a), 3), "max_abs_pct": max(a), "n_equal_within_0.01pct": sum(1 for x in a if x <= 0.01)}

def rec(name, url, status, h, body, extra=None, note=""):
    r = {"name": name, "url": url, "status": status, "cors": cors(h), "bytes": len(body), "body_head": body[:160].decode("utf8", "replace").replace("\n", " ")}
    if extra: r.update(extra)
    if note: r["note"] = note
    out["probes"].append(r)
    print(json.dumps(r, ensure_ascii=False)); sys.stdout.flush()

def fresh_min(ts): return round((NOW - ts) / 60, 1)

# ---- Yahoo ----
cookie = None; crumb = None
for host in ("query1", "query2"):
    u = f"https://{host}.finance.yahoo.com/v8/finance/chart/AAPL?interval=1m&range=1d"
    s, h, b, _ = get(u)
    ex = {}
    if s == 200:
        try:
            m = json.loads(b)["result"][0]["meta"] if "result" in json.loads(b) else json.loads(b)["chart"]["result"][0]["meta"]
            ts = json.loads(b)["chart"]["result"][0].get("timestamp") or [0]
            ex = {"last_1m_bar_fresh_min": fresh_min(ts[-1]), "regularMarketTime": m.get("regularMarketTime"), "fresh_min": fresh_min(m["regularMarketTime"]), "marketState_hint": m.get("currentTradingPeriod", {}).get("regular", {}).get("end"), "price": m.get("regularMarketPrice"), "vs_pub_pct": cmp_pub({"AAPL": m.get("regularMarketPrice")})}
        except Exception as e: ex = {"parse_err": str(e)}
    rec(f"yahoo v8 chart 1m/1d AAPL ({host}), no cookie", u, s, h, b, ex)

# 58 档逐个 v8 chart（浏览器要并发 58 次）
t0 = time.time(); prices = {}; fr = []; st = {}; ac = set()
for sym in SYMS:
    u = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1m&range=1d"
    s, h, b, _ = get(u); st[s] = st.get(s, 0) + 1; ac.add(cors(h)["acao"])
    if s == 200:
        try:
            m = json.loads(b)["chart"]["result"][0]["meta"]; prices[sym] = m["regularMarketPrice"]; fr.append(fresh_min(m["regularMarketTime"]))
        except Exception: pass
rec("yahoo v8 chart x58 serial (one per symbol)", "…/v8/finance/chart/{SYM}?interval=1m&range=1d", dict(st), {"access-control-allow-origin": ",".join(str(x) for x in ac)}, b"", {"got": len(prices), "secs": round(time.time() - t0, 1), "fresh_min_min": min(fr) if fr else None, "fresh_min_max": max(fr) if fr else None, "vs_pub": cmp_pub(prices)})

joined = ",".join(SYMS)
for ver, path in (("v7 quote", "/v7/finance/quote"), ("v6 quote", "/v6/finance/quote")):
    for host in ("query1", "query2"):
        u = f"https://{host}.finance.yahoo.com{path}?symbols={urllib.parse.quote(joined)}"
        s, h, b, _ = get(u)
        ex = {}
        if s == 200:
            try:
                res = json.loads(b)["quoteResponse"]["result"]
                ex = {"got": len(res), "fresh_min_min": min(fresh_min(x["regularMarketTime"]) for x in res), "fresh_min_max": max(fresh_min(x["regularMarketTime"]) for x in res), "vs_pub": cmp_pub({x["symbol"]: x.get("regularMarketPrice") for x in res})}
            except Exception as e: ex = {"parse_err": str(e)}
        rec(f"yahoo {ver} 58 symbols ({host}), no crumb", u[:120], s, h, b, ex)

# cookie + crumb 流程
s, h, b, sc = get("https://fc.yahoo.com/", {"Origin": ""})
cookie = "; ".join(c.split(";")[0] for c in (sc or []))
rec("yahoo fc.yahoo.com (cookie)", "https://fc.yahoo.com/", s, h, b, {"set_cookie_names": [c.split("=")[0] for c in (sc or [])]})
s, h, b, _ = get("https://query1.finance.yahoo.com/v1/test/getcrumb", {"Cookie": cookie})
crumb = b.decode() if s == 200 else None
rec("yahoo getcrumb", "https://query1.finance.yahoo.com/v1/test/getcrumb", s, h, b[:0] if crumb else b, {"crumb_obtained": bool(crumb)})
if crumb:
    u = f"https://query1.finance.yahoo.com/v7/finance/quote?symbols={urllib.parse.quote(joined)}&crumb={urllib.parse.quote(crumb)}"
    s, h, b, _ = get(u, {"Cookie": cookie})
    ex = {}
    if s == 200:
        try:
            res = json.loads(b)["quoteResponse"]["result"]
            ex = {"got": len(res), "fresh_min_min": min(fresh_min(x["regularMarketTime"]) for x in res), "fresh_min_max": max(fresh_min(x["regularMarketTime"]) for x in res), "marketStates": sorted({x.get("marketState") for x in res}), "vs_pub": cmp_pub({x["symbol"]: x.get("regularMarketPrice") for x in res})}
        except Exception as e: ex = {"parse_err": str(e)}
    rec("yahoo v7 quote 58 symbols WITH cookie+crumb", "…/v7/finance/quote?symbols=…&crumb=…", s, h, b, ex)
    u = f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/AAPL?modules=price&crumb={urllib.parse.quote(crumb)}"
    s, h, b, _ = get(u, {"Cookie": cookie}); rec("yahoo v10 quoteSummary AAPL WITH crumb", u[:100], s, h, b)
s, h, b, _ = get("https://query1.finance.yahoo.com/v10/finance/quoteSummary/AAPL?modules=price"); rec("yahoo v10 quoteSummary AAPL no crumb", "…/v10/…/AAPL?modules=price", s, h, b)

u = f"https://query1.finance.yahoo.com/v7/finance/spark?symbols={urllib.parse.quote(joined)}&range=1d&interval=1m"
s, h, b, _ = get(u); ex = {}
if s == 200:
    try:
        j = json.loads(b); res = j["spark"]["result"] if "spark" in j else j
        ex = {"got": len(res)}
    except Exception as e: ex = {"parse_err": str(e)}
rec("yahoo v7 spark 58 symbols", u[:100], s, h, b, ex)

# 预检 OPTIONS（浏览器带自定义头才会发；简单 GET 不会，但记录）
s, h, b, _ = get("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1m&range=1d", {"Access-Control-Request-Method": "GET"}, "OPTIONS")
rec("yahoo v8 chart OPTIONS preflight", "", s, h, b)

# ---- 备选源 ----
s, h, b, _ = get("https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv"); rec("stooq single csv AAPL", "https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv", s, h, b)
sj = "+".join(x.lower() + ".us" for x in SYMS)
s, h, b, _ = get(f"https://stooq.com/q/l/?s={sj}&f=sd2t2ohlcv&h&e=csv")
ex = {}
if s == 200:
    rows = [l.split(",") for l in b.decode("utf8", "replace").strip().splitlines()[1:]]
    pr = {}
    for r in rows:
        try: pr[r[0].replace(".US", "")] = float(r[6])
        except Exception: pass
    ex = {"rows": len(rows), "got_prices": len(pr), "sample_date_time": rows[0][1:3] if rows else None, "vs_pub": cmp_pub(pr)}
rec("stooq batch 58 csv", "https://stooq.com/q/l/?s=…(58)", s, h, b, ex)
s, h, b, _ = get("https://api.twelvedata.com/price?symbol=AAPL&apikey=demo"); rec("twelvedata price demo key", "api.twelvedata.com/price?symbol=AAPL&apikey=demo", s, h, b)
s, h, b, _ = get("https://finnhub.io/api/v1/quote?symbol=AAPL"); rec("finnhub quote no key", "finnhub.io/api/v1/quote?symbol=AAPL", s, h, b)
s, h, b, _ = get("https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=demo"); rec("alphavantage demo key (IBM only)", "alphavantage.co GLOBAL_QUOTE demo", s, h, b)
s, h, b, _ = get("https://api.nasdaq.com/api/quote/AAPL/info?assetclass=stocks"); rec("nasdaq.com public api AAPL", "api.nasdaq.com/api/quote/AAPL/info", s, h, b, {"body_mid": b[200:900].decode("utf8", "replace")})
for sym in ("MSFT", "NVDA", "XOM"):
    s, h, b, _ = get(f"https://api.twelvedata.com/price?symbol={sym}&apikey=demo"); rec(f"twelvedata demo {sym}", "", s, h, b)
s, h, b, _ = get("https://api.twelvedata.com/price?symbol=AAPL,MSFT&apikey=demo"); rec("twelvedata demo batch AAPL,MSFT", "", s, h, b)
cs = "|".join(SYMS)
s, h, b, _ = get(f"https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols={urllib.parse.quote(cs)}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1")
ex = {}
if s == 200:
    try:
        q = json.loads(b)["FormattedQuoteResult"]["FormattedQuote"]
        ex = {"got": len(q), "sample": {k: q[0].get(k) for k in ("symbol", "last", "last_time", "last_timedate", "curmktstatus")}}
        pr = {}
        for x in q:
            try: pr[x["symbol"]] = float(x["last"].replace(",", ""))
            except Exception: pass
        ex["vs_pub"] = cmp_pub(pr)
        ex["missing_price"] = [x["symbol"] for x in q if x["symbol"] not in pr]
        ex["status_counts"] = {k: sum(1 for x in q if x.get("curmktstatus") == k) for k in {x.get("curmktstatus") for x in q}}
        a = [x for x in q if x["symbol"] == "AAPL"][0]
        ex["AAPL_record"] = {k: v for k, v in a.items() if any(w in k.lower() for w in ("last", "ext", "time", "change", "prev", "mkt", "close", "volume"))}
        ex["missing_records"] = [{k: v for k, v in x.items() if k in ("symbol", "last", "last_time", "curmktstatus", "ExtendedMktQuote")} for x in q if x["symbol"] not in pr][:5]
    except Exception as e: ex = {"parse_err": str(e)}
rec("cnbc restQuote batch 58", "quote.cnbc.com/…/restQuote/symbolType/symbol?symbols=…", s, h, b, ex)
s, h, b, _ = get("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1m&range=1d", {"Origin": "https://example.com"}); rec("yahoo v8 chart, Origin=example.com (is ACAO reflected?)", "", s, h, b)
s, h, b, _ = get("https://cdn.jsdelivr.net/gh/jarixhew-bit/skills-github-pages@main/trading/data-public.json"); rec("ref: jsdelivr CDN (CORS reference, not a quote source)", "", s, h, b)

json.dump(out, open("probe-quotes.json", "w"), ensure_ascii=False, indent=1)
