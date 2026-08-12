#!/usr/bin/env python3
"""出事通知器 —— 把「坏了 / 好了」的状态变化送到 GitHub issue 与 Telegram。

为什么要有它（2026-08-12 建）：
trading-daily 从 08-11 21:17 起每小时红一次，连红一个多星期都没人知道——
红记录躺在 Actions 页面上，不会有人主动去翻；开 issue 也一样，用户不看 GitHub。
用户实际会看的是 Telegram（早报就走那条路），所以状态变化必须送到那里。
这次故障拖这么久，病根不是修不好，是**坏了没人被告知**。

去重：拿「有没有开着的同名 issue」当状态位，只在状态**变化**时才吵。
    坏了 ＋ 没有开着的 issue → 开 issue ＋ 发 Telegram
    坏了 ＋ 已有开着的 issue → 静默（连红九小时不会刷九条消息）
    好了 ＋ 有开着的 issue   → 关 issue ＋ 发「恢复了」
    好了 ＋ 没有 issue       → 静默（绝大多数情况走这条，什么都不发）

用法（在 GitHub Actions 里，需要 GH_TOKEN / TELEGRAM_TOKEN / TELEGRAM_CHAT_ID）：
    python3 tools/ci-notify.py --title "标题" --state bad \
        --body-file issue.md --tg-bad "坏了的话" --tg-ok "好了的话"

    --dry-run  只印出「会做什么」，不真的开 issue、不真的发消息（自检用）

退出码：0 = 处理完毕（含「什么都不用做」）；1 = 参数或外部命令出错。
通知本身失败不该拖垮整个工作流，调用方请自行加 `|| true`。
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request

TG_API = "https://api.telegram.org"


def run_gh(args, dry_run):
    """跑一条 gh 命令，回传 stdout。dry_run 时只印出来。"""
    if dry_run:
        print(f"[dry-run] gh {' '.join(args)}")
        return ""
    p = subprocess.run(["gh"] + args, capture_output=True, text=True)
    if p.returncode != 0:
        # 印 stderr 方便排查，但不要把整个工作流拖挂——由调用方决定
        print(f"gh {' '.join(args)} 失败：{p.stderr.strip()[:300]}", file=sys.stderr)
        raise RuntimeError("gh 命令失败")
    return p.stdout.strip()


def find_open_issue(title, dry_run):
    """找有没有开着的同名 issue，回传编号或 None。

    用 --search "<title> in:title" 之后**还要再比对一次完整标题**：
    GitHub 的搜索是分词匹配，标题相近的别的 issue 也会被搜出来，
    直接采信第一条会把不相干的 issue 当成状态位关掉。
    """
    if dry_run:
        print(f"[dry-run] 查有没有开着的 issue：{title}")
        return os.environ.get("FAKE_OPEN_ISSUE") or None
    out = run_gh(["issue", "list", "--state", "open", "--search",
                  f"{title} in:title", "--json", "number,title", "--limit", "20"], False)
    for item in json.loads(out or "[]"):
        if item.get("title") == title:
            return str(item["number"])
    return None


def send_telegram(text, dry_run):
    """发一条 Telegram。缺密钥时跳过（本地跑自检不该因此报错）。"""
    if dry_run:
        print(f"[dry-run] 发 Telegram：{text}")
        return
    token = os.environ.get("TELEGRAM_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        print("没有 TELEGRAM_TOKEN / TELEGRAM_CHAT_ID，跳过 Telegram 通知", file=sys.stderr)
        return
    data = urllib.parse.urlencode({
        "chat_id": chat, "text": text, "disable_web_page_preview": "true",
    }).encode()
    req = urllib.request.Request(f"{TG_API}/bot{token}/sendMessage", data=data)
    with urllib.request.urlopen(req, timeout=15) as r:
        r.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", required=True, help="issue 标题，同时充当状态位的名字")
    ap.add_argument("--state", required=True, choices=["ok", "bad"])
    ap.add_argument("--body-file", help="state=bad 且要新开 issue 时的正文文件")
    ap.add_argument("--tg-bad", default="", help="坏了时发的 Telegram 文案")
    ap.add_argument("--tg-ok", default="", help="恢复时发的 Telegram 文案")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    existing = find_open_issue(a.title, a.dry_run)

    if a.state == "ok":
        if not existing:
            print("一切正常，之前也没报过，什么都不用做。")
            return 0
        run_gh(["issue", "close", existing, "--comment",
                "已恢复正常。（自动关闭）"], a.dry_run)
        if a.tg_ok:
            send_telegram(a.tg_ok, a.dry_run)
        print(f"已恢复，关掉 issue #{existing} 并通知。")
        return 0

    if existing:
        print(f"已经有开着的 issue #{existing}，不重复通知。")
        return 0

    cmd = ["issue", "create", "--title", a.title]
    if a.body_file:
        cmd += ["--body-file", a.body_file]
    else:
        cmd += ["--body", "（没有提供详情）"]
    run_gh(cmd, a.dry_run)
    if a.tg_bad:
        send_telegram(a.tg_bad, a.dry_run)
    print("第一次出事，已开 issue 并通知。")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError:
        sys.exit(1)
