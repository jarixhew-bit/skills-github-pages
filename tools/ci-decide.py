#!/usr/bin/env python3
"""看这次改动碰了哪些文件，决定哪几项检查需要跑。

跑法（CI 里用）：
    python3 tools/ci-decide.py origin/main...HEAD
本地想看某次改动会触发什么：
    python3 tools/ci-decide.py            # 拿工作区相对 origin/main 的改动

为什么要它（2026-08-11 用户要求：「不要再看到下一个指令就跑好几条一样的 workflow」）：
原本每项检查各是一个独立 workflow，Actions 页面上一个改动就摊开成五到八行，
看起来像在重复。现在合并成一个 workflow（checks.yml），用这个脚本先算出该跑哪几项，
不需要的 job 直接跳过——页面上永远只有一行，点进去才看得到里面跑了什么。

输出：每行 `名字=true|false`，直接写进 $GITHUB_OUTPUT。
"""
import subprocess
import sys
import os
import fnmatch

# 每项检查关心哪些路径。加新检查就在这里加一行，不要再开新的 workflow 文件。
RULES = {
    "html":      ["**/*.html", "tools/check-html.py", "tools/jargon-whitelist.txt"],
    "secrets":   ["**"],                       # 秘钥扫描每次都跑，很快
    "pwa":       ["**/*.webmanifest", "tools/check-pwa-scopes.py"],
    "ainote":    ["trading/ai_note.py", "tools/check-ai-note.py"],
    "notify":    ["tools/ci-notify.py", "tools/check-ci-notify.py"],
    "morningpos": [".github/scripts/portfolio_news.py", "trading/analyzer.py",
                   "tools/check-morning-positions.py"],
    "rules":     [".claude/rules/**", "CLAUDE.md", "tools/check-rules.py"],
    "workflows": [".github/workflows/**", ".github/actions/**", "tools/check-workflows.py"],
    "company":   ["expense-tracker.html", "tools/check-expense-company.mjs"],
    "inventory": ["expense-tracker.html", "staff/index.html", "inventory/**",
                  "tools/check-inventory.mjs", "tools/build-staff-page.py"],
    "staff":     ["staff/**", "expense-tracker.html", "tools/build-staff-page.py",
                  "tools/check-staff-page.mjs"],
    "gamebot":   ["game-bot/**", "tools/check-gamebot.py",
                  "tools/check-gamebot-logic.mjs"],
}
# 浏览器类检查（慢）额外也盯着共用步骤：它坏了这几项全瞎
BROWSER = ["company", "inventory", "staff"]
SHARED = ".github/actions/browser-check-setup/action.yml"


def changed_files(rangespec: str) -> list:
    out = subprocess.run(["git", "diff", "--name-only", rangespec],
                         capture_output=True, text=True)
    if out.returncode != 0:
        # 拿不到 diff 时保守处理：全部都跑，宁可多跑也不要漏掉
        print(f"::warning::算不出改动范围（{out.stderr.strip()[:120]}），这次全部检查都跑",
              file=sys.stderr)
        return ["__ALL__"]
    return [l for l in out.stdout.splitlines() if l.strip()]


def matches(path: str, patterns: list) -> bool:
    for pat in patterns:
        if pat == "**":
            return True
        if fnmatch.fnmatch(path, pat):
            return True
        # fnmatch 的 ** 不跨目录，这里补上「前缀目录」写法：inventory/** 匹配 inventory/a/b
        if pat.endswith("/**") and path.startswith(pat[:-3] + "/"):
            return True
        if pat.startswith("**/") and fnmatch.fnmatch(os.path.basename(path), pat[3:]):
            return True
    return False


def main() -> int:
    rangespec = sys.argv[1] if len(sys.argv) > 1 else "origin/main...HEAD"
    files = changed_files(rangespec)
    force_all = files == ["__ALL__"]

    lines = []
    for name, patterns in RULES.items():
        pats = patterns + ([SHARED] if name in BROWSER else [])
        need = force_all or any(matches(f, pats) for f in files)
        lines.append(f"{name}={'true' if need else 'false'}")

    print(f"这次改了 {len(files)} 个文件" if not force_all else "算不出改动，全部都跑",
          file=sys.stderr)
    for l in lines:
        print(l)

    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
