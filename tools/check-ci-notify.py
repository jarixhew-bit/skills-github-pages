#!/usr/bin/env python3
"""tools/ci-notify.py 的自检器。

为什么它需要自检（2026-08-12）：ci-notify 是「坏了通知我」的那一层，
它自己坏掉的症状是**什么都不发**——跟「一切正常」长得一模一样。
这正是本仓库教训里那条「绿灯本身要先被验证」的最坏情况：
通知器静默失效，等于回到这次故障的起点（连红一星期没人知道）。

所以这里不是「跑一次看看会不会崩」，而是拿已知该有的行为逐条比对：
四种状态转换各该做什么、以及搜索回来一堆相近标题时会不会认错 issue。

跑法：
    python3 tools/check-ci-notify.py

退出码：0 = 全部符合预期；1 = 有不符（会印出哪一条、期望什么、实际什么）。
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
NOTIFY = os.path.join(HERE, "ci-notify.py")

# 假 gh：issue list 回传 $FAKE_LIST，其余命令**记进 $FAKE_LOG**、不真的执行。
# 为什么写文件而不是 echo：ci-notify 用 capture_output 收走 gh 的 stdout，
# 光 echo 的话断言永远看不到——第一版就是这样，自检报了三条假红。
FAKE_GH = """#!/bin/bash
if [ "$1" = "issue" ] && [ "$2" = "list" ]; then echo "$FAKE_LIST"; exit 0; fi
echo "gh $*" >> "$FAKE_LOG"
"""

TITLE = "某某任务失败"
OTHER = json.dumps([{"number": 99, "title": "某某任务失败（另一件事，标题相近）"}])
MINE = json.dumps([{"number": 99, "title": "某某任务失败（另一件事，标题相近）"},
                   {"number": 7, "title": TITLE}])

# 每条 = (说明, state, 假的 issue 列表, 必须出现的字样, 不准出现的字样)
CASES = [
    ("坏了＋没报过 → 开 issue 并通知",
     "bad", "[]", ["issue create"], ["issue close"]),
    ("坏了＋已有开着的 → 静默，不刷屏",
     "bad", MINE, ["不重复通知"], ["issue create", "issue close"]),
    ("好了＋没报过 → 完全静默",
     "ok", "[]", ["什么都不用做"], ["issue create", "issue close"]),
    ("好了＋有开着的 → 关掉并报恢复",
     "ok", MINE, ["issue close", "7"], ["issue create"]),
    # 这一条是真正容易写错的地方：GitHub 搜索是分词匹配，标题相近的会一起回来。
    # 直接采信第一条就会把不相干的 issue 当成状态位。
    ("搜索只回相近标题（无完全相同）→ 应视为没报过，照常开新的",
     "bad", OTHER, ["issue create"], ["不重复通知"]),
]


def run_case(state, fake_list, binpath, bodyfile, logfile):
    """跑一次 ci-notify，回传「它印了什么 ＋ 它真的会对 GitHub 下什么命令」。"""
    open(logfile, "w").close()
    env = dict(os.environ)
    env["PATH"] = binpath + os.pathsep + env["PATH"]
    env["FAKE_LIST"] = fake_list
    env["FAKE_LOG"] = logfile
    env.pop("TELEGRAM_TOKEN", None)
    env.pop("TELEGRAM_CHAT_ID", None)
    p = subprocess.run(
        [sys.executable, NOTIFY, "--title", TITLE, "--state", state,
         "--body-file", bodyfile, "--tg-bad", "坏了", "--tg-ok", "好了"],
        capture_output=True, text=True, env=env)
    return p.stdout + p.stderr + open(logfile, encoding="utf-8").read()


def main():
    if not os.path.exists(NOTIFY):
        print(f"不通过：找不到 {NOTIFY}")
        return 1

    with tempfile.TemporaryDirectory() as d:
        binpath = os.path.join(d, "bin")
        os.makedirs(binpath)
        gh = os.path.join(binpath, "gh")
        with open(gh, "w") as f:
            f.write(FAKE_GH)
        os.chmod(gh, 0o755)
        bodyfile = os.path.join(d, "body.md")
        with open(bodyfile, "w") as f:
            f.write("正文")
        logfile = os.path.join(d, "gh-calls.log")

        bad = []
        for desc, state, fake, must, must_not in CASES:
            out = run_case(state, fake, binpath, bodyfile, logfile)
            for m in must:
                if m not in out:
                    bad.append((desc, f"应该出现「{m}」", out.strip()[:200]))
            for m in must_not:
                if m in out:
                    bad.append((desc, f"不该出现「{m}」", out.strip()[:200]))
            print(f"  {'✗' if any(b[0] == desc for b in bad) else '·'} {desc}")

    if bad:
        print(f"\n不通过：{len(bad)} 条不符合预期")
        for desc, want, got in bad:
            print(f"  ✗ {desc}\n      {want}\n      实际输出：{got}")
        return 1
    print(f"\n通过：{len(CASES)} 种情况的行为都符合预期")
    return 0


if __name__ == "__main__":
    sys.exit(main())
