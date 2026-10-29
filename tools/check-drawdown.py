#!/usr/bin/env python3
"""大跌开枪提醒：VOO 收盘价较过去 252 个交易日最高收盘价回落多少，决定要不要叫人用 SGOV 抄底。

为什么有它（2026-10-29）：用户把 SGOV 当大跌子弹。规则：
    跌幅 >= 20% → 一级提醒（卖一半 SGOV 买入）
    跌幅 >= 30% → 二级提醒（卖剩下一半）
    回到跌幅 < 15% 才解除（滞后区间，避免在 20% 附近来回抖动反复开关）
    15%~20% 之间：原来有提醒就保持，原来没有就不开。
行情是公开的（trading/history/VOO.json），所以提醒可以写 VOO 的跌幅与日期；
**禁止写任何持仓数量、金额、SGOV 余额**（仓库公开，issue 与日志谁都看得到）。本脚本根本不读持仓。

用法：
    python3 tools/check-drawdown.py --selftest   # 自检：固定假行情手算
    python3 tools/check-drawdown.py --run        # CI 用：读行情＋读「已有的 open issue」当上一状态，
                                                 # 写 $GITHUB_OUTPUT 与通知正文
    python3 tools/check-drawdown.py --text KEY   # 印静态文案（workflow 取标题用）

状态来源：不往仓库提交状态文件，用「有没有开着的同名 issue」当上一状态（tools/ci-notify.py 同一机制）：
    二级 issue 开着 → 上次是 2；否则一级 issue 开着 → 上次是 1；都没有 → 0。
    读 issue 失败时整轮罢工（退出码 1），绝不当成「没有」——否则会在回落区间里误关提醒。
级别 → issue：level>=1 时一级 issue 应开着，level==2 时二级 issue 也应开着（标题不同，
所以二级能在一级之后再开一次）；回到 <15% 两个都自动关。一步跌穿 30% 会两个一起开。
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
HIST_PATH = os.environ.get("DD_HISTORY_PATH") or os.path.join(REPO, "trading", "history", "VOO.json")

WINDOW = 252      # 交易日
L1, L2 = 0.20, 0.30
RELEASE = 0.15
EPS = 1e-9        # 浮点：恰好 20%、30% 要算触发
MIN_BARS = 20     # 少于这个数的历史没意义，判数据缺失
MAX_STALE_DAYS = 10  # 最后一根收盘离今天超过这么多天，判行情过期（长假也撑得住）

TEXT = {
    "l1-title": "大跌一级提醒：VOO 较近一年高点回落一档",
    "l2-title": "大跌二级提醒：VOO 较近一年高点回落两档",
    "missing-title": "大跌检查缺行情数据，请查看",
    "l1-tg-ok": "VOO 回落已收窄到解除线以内，大跌一级提醒解除。",
    "l2-tg-ok": "VOO 回落已收窄到解除线以内，大跌二级提醒解除。",
    "missing-tg-bad": "大跌检查拿不到可用的 VOO 行情，没法判断，请看仓库 issue。",
    "missing-tg-ok": "大跌检查的行情数据已恢复。",
    "missing-body": (
        "大跌开枪检查这次读不到可用的 VOO 行情（文件缺失、格式不对、历史太短或已过期），\n"
        "所以没法判断有没有触发。常见原因：行情抓取（trading-daily）连续失败。\n\n"
        "（本 issue 刻意不写任何数字。数据恢复后会自动关闭。）\n"
    ),
}


# ---------------- 纯函数 ----------------

def evaluate(closes, prev=0):
    """closes: 升序的收盘价列表；prev: 上一次的级别 0/1/2。

    回传 dict：level（0/1/2）、dd（跌幅，小数）、high、last、high_idx（最高收盘在 closes 里的下标）、
    used（实际参与的根数）、short（历史不足 252 根）。数据不合法回 level=None。
    """
    try:
        cs = [float(c) for c in closes]
    except (TypeError, ValueError):
        return {"level": None, "reason": "收盘价不是数字"}
    if len(cs) < MIN_BARS or any(not (c == c and c > 0 and c != float("inf")) for c in cs):
        return {"level": None, "reason": "历史太短或含非法收盘价"}
    start = max(0, len(cs) - WINDOW)
    win = cs[start:]
    high = max(win)
    last = cs[-1]
    dd = (high - last) / high
    if dd >= L2 - EPS:
        level = 2
    elif dd >= L1 - EPS:
        level = max(1, prev if prev in (1, 2) else 0)   # 在二级之后回到 20~30% 之间：保持二级（有 issue 开着）
    elif prev in (1, 2) and dd >= RELEASE - EPS:
        level = prev                                     # 滞后区间：15%~20% 保持原状
    else:
        level = 0
    return {"level": level, "dd": dd, "high": high, "last": last,
            "high_idx": start + win.index(high), "used": len(win), "short": len(cs) < WINDOW}


def build_text(res, high_date, last_date):
    """通知正文。只写公开行情：跌幅百分比与日期、参与计算的交易日数。**不写持仓。**"""
    pct = f"{res['dd'] * 100:.1f}%"
    note = ""
    if res["short"]:
        note = f"（注意：行情历史只有 {res['used']} 个交易日，不足 {WINDOW} 个，已用现有全部计算。）\n"
    lvl = res["level"]
    if lvl == 2:
        todo = "二级：卖出剩下的一半 SGOV，买入 VOO（或同指数的 CSPX／VUAA）。"
    else:
        todo = "一级：卖出一半 SGOV，买入 VOO（或同指数的 CSPX／VUAA）。"
    body = (
        f"VOO 收盘价较近 {WINDOW} 个交易日最高收盘价（{high_date}）回落 {pct}（{last_date} 收盘）。\n\n"
        f"按大跌规则：{todo}\n"
        f"{note}\n"
        "回落收窄到解除线以内后，本提醒会自动关闭。\n\n"
        "（本 issue 只写公开行情，刻意不写任何持仓、金额或 SGOV 余额，因为仓库是公开的。）\n"
    )
    tg = f"VOO 较近一年高点回落 {pct}（{last_date}），{todo}（持仓数字不外发）"
    return body, tg


# ---------------- 取数（只在 --run 用） ----------------

def load_bars(path=None):
    path = path or HIST_PATH
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    bars = d["bars"]
    return [b[0] for b in bars], [b[4] for b in bars]


def stale_days(last_date, today=None):
    import datetime
    t = today or datetime.date.today()
    return (t - datetime.date.fromisoformat(last_date)).days


def prev_level_from_issues():
    """读开着的 issue 标题推上一次级别。失败抛异常（调用方必须罢工，不可当 0）。"""
    p = subprocess.run(["gh", "issue", "list", "--state", "open", "--limit", "100",
                        "--json", "title"], capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError("gh issue list 失败")
    titles = {i["title"] for i in json.loads(p.stdout or "[]")}
    return 2 if TEXT["l2-title"] in titles else 1 if TEXT["l1-title"] in titles else 0


def write_outputs(states, outdir, files):
    os.makedirs(outdir, exist_ok=True)
    for name, content in files.items():
        with open(os.path.join(outdir, name), "w", encoding="utf-8") as f:
            f.write(content)
    lines = [f"{k}={v}" for k, v in states.items()]
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    print("；".join(lines))


def run(outdir, prev_fn=prev_level_from_issues, today=None):
    prev = prev_fn()   # 失败直接抛，整轮罢工
    try:
        dates, closes = load_bars()
        res = evaluate(closes, prev)
        if res["level"] is None:
            raise ValueError(res["reason"])
        if stale_days(dates[-1], today) > MAX_STALE_DAYS:
            raise ValueError("行情过期")
    except Exception as e:
        print(f"读行情失败（{type(e).__name__}），判为数据缺失")
        write_outputs({"l1": "skip", "l2": "skip", "missing": "bad"}, outdir,
                      {"missing-body.md": TEXT["missing-body"]})
        return 0
    lvl = res["level"]
    print(f"级别：{lvl}（上次 {prev}）；跌幅 {res['dd'] * 100:.1f}%（公开行情）")
    body, tg = build_text(res, dates[res["high_idx"]], dates[-1]) if lvl else ("", "")
    write_outputs({"l1": "bad" if lvl >= 1 else "ok", "l2": "bad" if lvl >= 2 else "ok", "missing": "ok"},
                  outdir, {"body.md": body, "tg.txt": tg})
    return 0


# ---------------- 自检 ----------------

def series(high, last, n=300, high_at=None):
    """造 n 根收盘：最高点 high 放在 high_at（默认末尾往前 100 根），其余在 high 与 last 之间，末根 = last。"""
    mid = (high + last) / 2
    cs = [mid] * n
    cs[(n - 100) if high_at is None else high_at] = high
    cs[-1] = last
    return cs


def selftest():
    global HIST_PATH
    fails = []

    def expect(name, cond, detail=""):
        if not cond:
            fails.append(f"{name} {detail}")

    def lv(last, prev=0, **kw):
        return evaluate(series(100, last, **kw), prev)["level"]

    # 1. 阈值（高点 100，手算）
    expect("跌 19.9% 无提醒", lv(80.1) == 0)
    expect("跌 20% 一级", lv(80) == 1)
    expect("跌 29.9% 一级", lv(70.1) == 1)
    expect("跌 30% 二级", lv(70) == 2)
    expect("跌 50% 二级", lv(50) == 2)
    expect("没跌无提醒", lv(100) == 0)
    r = evaluate(series(100, 80), 0)
    expect("跌幅手算", abs(r["dd"] - 0.2) < 1e-12, str(r["dd"]))
    # 2. 滞后：已在一级时回到 16% 仍保持；15% 恰好仍保持；14.9% 解除；没提醒时 16% 不开
    expect("一级后回到 16% 保持", lv(84, prev=1) == 1)
    expect("一级后回到 15% 仍保持", lv(85, prev=1) == 1)
    expect("一级后回到 14.9% 解除", lv(85.1, prev=1) == 0)
    expect("无提醒时 16% 不开", lv(84, prev=0) == 0)
    expect("无提醒时 19.9% 不开", lv(80.1, prev=0) == 0)
    # 3. 二级的滞后：二级后回到 25% 保持二级；回到 16% 保持；回到 14.9% 全解除；一级后跌到 30% 升二级
    expect("二级后回到 25% 保持二级", lv(75, prev=2) == 2)
    expect("二级后回到 16% 保持二级", lv(84, prev=2) == 2)
    expect("二级后回到 14.9% 解除", lv(85.1, prev=2) == 0)
    expect("一级后跌到 30% 升二级", lv(70, prev=1) == 2)
    # 4. 窗口：只看最近 252 根；窗口外的高点不算
    far = [50.0] * 300
    far[10] = 200.0   # 第 10 根在 252 根窗口外
    expect("窗口外高点不计", abs(evaluate(far)["dd"]) < 1e-12 and evaluate(far)["level"] == 0, str(evaluate(far)))
    inside = [50.0] * 300
    inside[300 - 252] = 200.0   # 窗口内最早的一根
    inside[-1] = 50.0
    expect("窗口内最早一根计入", evaluate(inside)["level"] == 2 and evaluate(inside)["used"] == 252)
    # 5. 历史不足 252 根：用现有全部并标注
    short = evaluate(series(100, 80, n=100), 0)
    expect("不足 252 根仍能判", short["level"] == 1 and short["short"] and short["used"] == 100, str(short))
    expect("满 252 根不标注", not evaluate(series(100, 80, n=252))["short"])
    expect("太短判缺失", evaluate([100.0] * 5)["level"] is None)
    expect("含非法价判缺失", evaluate([100.0] * 30 + [0.0])["level"] is None)
    expect("含 None 判缺失", evaluate([100.0] * 30 + [None])["level"] is None)
    expect("空判缺失", evaluate([])["level"] is None)

    # 6. 文案：不含持仓；数字只能是公开行情（跌幅、日期、交易日数）
    res = evaluate(series(100, 70.1), 0)
    for r_ in (res, evaluate(series(100, 60), 0), evaluate(series(100, 80, n=100), 0)):
        body, tg = build_text(r_, "2026-01-02", "2026-10-28")
        pct = f"{r_['dd'] * 100:.1f}%"
        for name, t in (("正文", body), ("Telegram", tg)):
            rest = t.replace(pct, "").replace("2026-01-02", "").replace("2026-10-28", "")
            rest = rest.replace(str(r_["used"]), "").replace(str(WINDOW), "")
            expect(f"文案无其他数字:{name}", not any(c.isdigit() for c in rest), rest)
            for bad in ("$", "股数", "余额：", "市值", "金额："):
                expect(f"文案无持仓用语:{name}", bad not in rest, bad)
        expect("文案提到 SGOV 但不带余额", "SGOV" in body and "余额，" in body)
    for k, t in TEXT.items():
        expect(f"静态文案无数字:{k}", not any(c.isdigit() for c in t), t)
    expect("标题互不相同", len({TEXT["l1-title"], TEXT["l2-title"], TEXT["missing-title"]}) == 3)
    b1, _ = build_text(evaluate(series(100, 75), 0), "a", "b")
    b2, _ = build_text(evaluate(series(100, 65), 0), "a", "b")
    expect("一二级内容不同", b1 != b2 and "一半 SGOV" in b1 and "剩下的一半" in b2)

    # 7. 端到端 --run：假行情文件＋假的上一状态，看写出的状态
    import datetime
    today = datetime.date(2026, 10, 29)
    dates = [(datetime.date(2026, 10, 28) - datetime.timedelta(days=299 - i)).isoformat() for i in range(300)]

    def e2e(last, prev, name, want, mk_file=True, fail_prev=False):
        global HIST_PATH
        cs = series(100, last)
        with tempfile.TemporaryDirectory() as d:
            fp = os.path.join(d, "VOO.json")
            if mk_file:
                json.dump({"symbol": "VOO", "bars": [[dt, c, c, c, c, 1] for dt, c in zip(dates, cs)]},
                          open(fp, "w"))
            gh = os.path.join(d, "out.txt")
            old = {k: os.environ.get(k) for k in ("GITHUB_OUTPUT",)}
            os.environ["GITHUB_OUTPUT"] = gh
            saved, HIST_PATH = HIST_PATH, fp

            def pf():
                if fail_prev:
                    raise RuntimeError("gh 挂了")
                return prev
            try:
                try:
                    run(os.path.join(d, "o"), prev_fn=pf, today=today)
                    got = open(gh, encoding="utf-8").read().strip().replace("\n", "；") if os.path.exists(gh) else ""
                except RuntimeError:
                    got = "RAISED"
                expect(name, want in got, got)
                if want.startswith("l1=bad"):
                    for fn in ("body.md", "tg.txt"):
                        txt = open(os.path.join(d, "o", fn), encoding="utf-8").read()
                        expect(name + f" {fn} 无持仓", "$" not in txt and "余额：" not in txt and "SGOV" in txt)
            finally:
                HIST_PATH = saved
                for k, v in old.items():
                    if v is None:
                        os.environ.pop(k, None)
                    else:
                        os.environ[k] = v

    e2e(80.1, 0, "端到端 19.9% 无提醒", "l1=ok；l2=ok；missing=ok")
    e2e(80, 0, "端到端 20% 一级", "l1=bad；l2=ok；missing=ok")
    e2e(70, 1, "端到端 30% 二级", "l1=bad；l2=bad；missing=ok")
    e2e(84, 1, "端到端 回到 16% 保持", "l1=bad；l2=ok")
    e2e(85.1, 1, "端到端 回到 14.9% 解除", "l1=ok；l2=ok")
    e2e(85.1, 2, "端到端 二级解除", "l1=ok；l2=ok")
    e2e(80, 0, "端到端 文件缺失判缺数据", "l1=skip；l2=skip；missing=bad", mk_file=False)
    e2e(80, 0, "端到端 读 issue 失败罢工", "RAISED", fail_prev=True)
    # 行情过期
    with tempfile.TemporaryDirectory() as d:
        fp = os.path.join(d, "VOO.json")
        json.dump({"bars": [[dt, 1, 1, 1, 100.0, 1] for dt in dates]}, open(fp, "w"))
        gh = os.path.join(d, "out.txt")
        os.environ["GITHUB_OUTPUT"] = gh
        saved, HIST_PATH = HIST_PATH, fp
        try:
            run(os.path.join(d, "o"), prev_fn=lambda: 0, today=datetime.date(2026, 12, 1))
            expect("行情过期判缺数据", "missing=bad" in open(gh, encoding="utf-8").read())
        finally:
            HIST_PATH = saved
            os.environ.pop("GITHUB_OUTPUT", None)

    # 8. 真实行情文件可读且格式对（不判级别，行情天天变）
    try:
        ds, cs = load_bars(HIST_PATH)
        expect("真行情升序", ds == sorted(ds) and len(ds) >= MIN_BARS)
        expect("真行情可评估", evaluate(cs)["level"] in (0, 1, 2))
    except Exception as e:
        fails.append(f"真行情读取失败：{e}")

    if fails:
        print("check-drawdown 自检失败：")
        for f in fails:
            print("  -", f)
        return 1
    print("check-drawdown 自检通过")
    return 0


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--selftest", action="store_true")
    g.add_argument("--run", action="store_true")
    g.add_argument("--text", metavar="KEY")
    ap.add_argument("--outdir", default=os.path.join(tempfile.gettempdir(), "drawdown"))
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if a.text:
        print(TEXT[a.text])
        return 0
    return run(a.outdir)


if __name__ == "__main__":
    sys.exit(main())
