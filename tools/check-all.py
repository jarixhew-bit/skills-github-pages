#!/usr/bin/env python3
"""一次跑完本仓库全部自检——并行版。

为什么要有这个（2026-08-13）：
CLAUDE.md 要求「改完 expense-tracker.html 要跑 tools/ 底下全部 check-*」，照字面
一个一个跑是**串行**的，实测一轮 5~6 分钟；而 CI 上同样这些检查是并行跑的，
最近十次 PR 全部落在 30~116 秒。差的不是检查本身，是跑法。这个脚本把 CI 的跑法
搬到本地：并行、自动起 http server、自动带 CHROMIUM_PATH。

两个检查**默认不跑**，不是漏了：
  - check-images.py  外链体检，要打几百个外部网址，单独就要 105 秒。它在 CI 是
    每周一的独立定时任务（check-images.yml），从来不在 PR 上跑——本地跟着跑
    等于每次白等一分半。要跑加 --with-network。
  - check-live.py    验线上页面是不是 main 那一版，沙盒连不上 github.io（出口代理
    挡掉），只能在 CI 跑。加 --with-network 也不会跑它。

沙盒注意：`morningpos` 会报 `No module named '_cffi_backend'`——那是容器里少了套件、
不是检查坏了，`pip install cffi` 补上即可（CI 上装了，所以只有沙盒会红）。

用法：
    python3 tools/check-all.py              # 跑全部（不含上面两个）
    python3 tools/check-all.py --with-network   # 连 check-images 一起跑
    python3 tools/check-all.py --only html,secrets   # 只跑指定几项
    python3 tools/check-all.py --list       # 看有哪些项目，不跑

退出码 0 = 全过，1 = 有项目没过（跟 CI 的 all-green 同一个判定）。
"""

import argparse
import http.server
import os
import socketserver
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("CHECK_PORT", 8899))

# (名字, 命令, 要不要 http server)
# 顺序照 checks.yml 的 job 顺序排，方便逐项跟 CI 对照。
CHECKS = [
    ("html-tracker", ["python3", "tools/check-html.py", "expense-tracker.html"], False),
    ("html-staff", ["python3", "tools/check-html.py", "staff/index.html"], False),
    ("secrets", ["python3", "tools/check-secrets.py"], False),
    ("pwa", ["python3", "tools/check-pwa-scopes.py"], False),
    ("ainote", ["python3", "tools/check-ai-note.py"], False),
    ("notify", ["python3", "tools/check-ci-notify.py"], False),
    ("morningpos", ["python3", "tools/check-morning-positions.py"], False),
    ("generated", ["python3", "tools/check-generated.py"], False),
    ("news", ["python3", "tools/check-news.py"], False),
    ("prices", ["python3", "tools/check-prices.py"], False),
    ("rules", ["python3", "tools/check-rules.py", "--quiet"], False),
    ("rule-homes", ["python3", "tools/check-rule-homes.py"], False),
    ("workflows", ["python3", "tools/check-workflows.py"], False),
    ("gamebot", ["python3", "tools/check-gamebot.py"], False),
    ("gamebot-logic", ["node", "tools/check-gamebot-logic.mjs"], False),
    ("fund", ["node", "tools/check-fund.mjs"], True),
    ("company", ["node", "tools/check-expense-company.mjs"], True),
    ("inventory", ["node", "tools/check-inventory.mjs"], True),
    # 同事版跟 CI 一样拆两半并行，最慢那关的墙上时间才降得下来。
    ("staff-1", ["node", "tools/check-staff-page.mjs"], True),
    ("staff-2", ["node", "tools/check-staff-page.mjs"], True),
]

NETWORK_ONLY = [("images", ["python3", "tools/check-images.py"], False)]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class ReusableServer(socketserver.TCPServer):
    # 必须是**类属性**：TCPServer 在 __init__ 里就 bind 了，构造完再设等于没设。
    # 少了这一句，上一轮跑完端口还在 TIME_WAIT，下一轮 bind 直接失败。
    allow_reuse_address = True


def port_alive():
    """端口上真的有人应答吗。绑不上时用来分辨「别人在服务」与「只是 TIME_WAIT」。"""
    import socket

    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=1):
            return True
    except OSError:
        return False


def start_server():
    """起静态服务器给浏览器自检用。回传 (关闭函数, 说明)。

    2026-08-13 教训：绑不上端口时**不准假设**「那是用户自己起的服务」就继续跑——
    TIME_WAIT 里的端口同样绑不上，而那时根本没人在听，浏览器自检会一路
    ERR_CONNECTION_REFUSED 全红，看起来像页面坏了。绑不上就去探活，探不到就直接报错。
    """
    os.chdir(REPO)
    try:
        httpd = ReusableServer(("", PORT), QuietHandler)
    except OSError:
        if port_alive():
            return (lambda: None), f"端口 {PORT} 已有服务，直接用"
        raise SystemExit(
            f"端口 {PORT} 绑不上、又没人应答（多半是上一轮的 TIME_WAIT）。\n"
            f"等几秒重跑，或用 CHECK_PORT 换个端口。"
        )
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    # 等「我要的东西出现了」，不是等「不好的东西不在」——服务器还没 accept 就往下跑，
    # 浏览器自检会撞上 CONNECTION_REFUSED。
    for _ in range(50):
        if port_alive():
            break
        time.sleep(0.1)
    else:
        raise SystemExit(f"http server 起了但 5 秒内没应答，端口 {PORT}")

    return httpd.shutdown, f"已起 http server :{PORT}"


def run_one(name, cmd, env):
    start = time.time()
    try:
        p = subprocess.run(cmd, cwd=REPO, env=env, capture_output=True, text=True, timeout=600)
        out = (p.stdout or "") + (p.stderr or "")
        return name, p.returncode, out, time.time() - start
    except subprocess.TimeoutExpired:
        return name, 124, "超时（600 秒）", time.time() - start
    except FileNotFoundError as e:
        return name, 127, f"命令不存在：{e}", time.time() - start


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--with-network", action="store_true", help="连 check-images 外链体检一起跑（+105 秒）")
    ap.add_argument("--only", default="", help="只跑这几项，逗号分隔，名字见 --list")
    ap.add_argument("--list", action="store_true", help="列出所有项目，不跑")
    ap.add_argument("-j", "--jobs", type=int, default=6, help="并发数（默认 6）")
    args = ap.parse_args()

    checks = list(CHECKS) + (NETWORK_ONLY if args.with_network else [])

    if args.only:
        want = {s.strip() for s in args.only.split(",") if s.strip()}
        unknown = want - {c[0] for c in (CHECKS + NETWORK_ONLY)}
        if unknown:
            print(f"没有这些项目：{', '.join(sorted(unknown))}")
            print(f"可选：{', '.join(c[0] for c in CHECKS + NETWORK_ONLY)}")
            return 1
        checks = [c for c in (CHECKS + NETWORK_ONLY) if c[0] in want]

    if args.list:
        network_names = {n for n, _, _ in NETWORK_ONLY}
        for name, cmd, needs_server in CHECKS + NETWORK_ONLY:
            tag = " [需浏览器]" if needs_server else ""
            if name in network_names:
                tag += " [--with-network 才跑]"
            print(f"  {name:15s} {' '.join(cmd)}{tag}")
        return 0

    env = dict(os.environ)
    # 沙盒里 playwright 找不到浏览器，要指路；本机装了就用本机的。
    if not env.get("CHROMIUM_PATH") and os.path.exists("/opt/pw-browsers/chromium"):
        env["CHROMIUM_PATH"] = "/opt/pw-browsers/chromium"

    stop_server, server_note = (lambda: None), ""
    if any(needs_server for _, _, needs_server in checks):
        stop_server, server_note = start_server()

    print(f"跑 {len(checks)} 项自检，并发 {args.jobs}" + (f"（{server_note}）" if server_note else ""))
    print("-" * 60)

    wall = time.time()
    results = []
    try:
        with ThreadPoolExecutor(max_workers=args.jobs) as pool:
            futures = []
            for name, cmd, _ in checks:
                e = dict(env)
                if name.startswith("staff-"):
                    e["PART"] = name.split("-")[1]
                futures.append(pool.submit(run_one, name, cmd, e))
            for f in futures:
                name, code, out, secs = f.result()
                results.append((name, code, out, secs))
                print(f"{'通过' if code == 0 else '失败'}  {name:15s} {secs:6.1f}s")
    finally:
        stop_server()

    failed = [r for r in results if r[1] != 0]
    print("-" * 60)
    print(f"墙上时间 {time.time() - wall:.1f}s；{len(results) - len(failed)} 过 / {len(failed)} 败")

    for name, code, out, _ in failed:
        print(f"\n=== {name} 失败（退出码 {code}）===")
        # 只印尾部：检查脚本的结论都在最后，前面多是逐项流水账。
        tail = out.strip().splitlines()[-25:]
        print("\n".join(tail) if tail else "（无输出）")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
