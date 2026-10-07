#!/usr/bin/env python3
"""盘中复测：CNBC 多次采样，对 Yahoo 1m 线。"""
import json, sys, time, datetime as dt, urllib.request, urllib.parse
from zoneinfo import ZoneInfo
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SYMS = [t["symbol"] for t in json.load(open("trading/universe.json"))["tickers"]]
N = int(sys.argv[1]) if len(sys.argv) > 1 else 4
GAP = int(sys.argv[2]) if len(sys.argv) > 2 else 120
base = "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=%s&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1"
def get(u):
    t = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Origin": "https://jarixhew-bit.github.io"}), timeout=25)
        return r.status, dict(r.headers), r.read(), round(time.time() - t, 2)
    except Exception as e:
        return getattr(e, "code", "ERR " + str(e)[:80]), {}, b"", round(time.time() - t, 2)
for i in range(N):
    now = dt.datetime.now(ZoneInfo("America/New_York"))
    print("=== sample", i, "NY", now.isoformat(), "UTC", dt.datetime.utcnow().isoformat(), flush=True)
    s, h, b, el = get(base % urllib.parse.quote("|".join(SYMS)))
    print("cnbc batch status", s, "secs", el, "bytes", len(b), "acao", h.get("Access-Control-Allow-Origin"), "cache", h.get("Cache-Control"), "age", h.get("Age"), "date", h.get("Date"), flush=True)
    if s == 200:
        q = json.loads(b)["FormattedQuoteResult"]["FormattedQuote"]
        print("got", len(q), "no-price:", [x["symbol"] for x in q if not x.get("last")], flush=True)
        by = {x["symbol"]: x for x in q}
        st = {}
        for x in q: st[x.get("curmktstatus")] = st.get(x.get("curmktstatus"), 0) + 1
        print("status counts", st)
        for k in ("SPY", "AAPL", "IWM", "VXUS", "NVDA"):
            if k in by: print("REC", k, json.dumps(by[k], ensure_ascii=False)[:1500])
        tf = {}
        for x in q:
            tf[(x.get("last_time") or "")[:30]] = tf.get((x.get("last_time") or "")[:30], 0) + 1
        print("last_time distribution (top)", sorted(tf.items(), key=lambda a: -a[1])[:8], flush=True)
    # IWM / VXUS alone and alternate codes
    for alt in ("IWM", "VXUS", "IWM|VXUS|SPY", ".IWM", "ARCX:IWM"):
        s, h, b, el = get(base % urllib.parse.quote(alt))
        try:
            q = json.loads(b)["FormattedQuoteResult"]["FormattedQuote"]
            print("alt", alt, s, [(x.get("symbol"), x.get("last"), x.get("last_time"), x.get("code")) for x in q], flush=True)
        except Exception as e:
            print("alt", alt, s, "parse", e, b[:200], flush=True)
    # Yahoo 1m 参考
    for sym in ("SPY", "AAPL"):
        s, h, b, el = get(f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?interval=1m&range=1d")
        try:
            r = json.loads(b)["chart"]["result"][0]; ts = r["timestamp"]; cl = r["indicators"]["quote"][0]["close"]
            print("yahoo", sym, "last bar", dt.datetime.fromtimestamp(ts[-1], dt.timezone.utc).isoformat(), "close", cl[-1], "meta price", r["meta"]["regularMarketPrice"], "meta time", dt.datetime.fromtimestamp(r["meta"]["regularMarketTime"], dt.timezone.utc).isoformat(), "age_min", round((time.time() - ts[-1]) / 60, 1), flush=True)
        except Exception as e:
            print("yahoo", sym, s, "err", e, flush=True)
    if i < N - 1: time.sleep(GAP)
