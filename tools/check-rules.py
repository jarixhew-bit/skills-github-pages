#!/usr/bin/env python3
"""制度档体检器 —— 把 .claude/rules/maintenance.md 的精简门槛变成可执行检查。

背景：maintenance.md 第 4 节写了「教训满 10 条或单档超 150 行就触发精简」，
第 5 节写了「精简时顺带 audit 路由表指向的档案是否还存在」。规矩写在那里，
但没有任何机制会去执行它——本脚本就是那两节的可执行版本，配合每月一次的
定时任务自动跑。

检查项（门槛全部照抄 maintenance.md，本脚本不自行发明新门槛）：
1. 行数超标 —— rules 单档 >150 行、agent 单档 >200 行、
   skill 单档 >400 行（maintenance.md 第 4、7 节）
2. 教训纪录条数 —— 任一档案的「教训纪录」满 10 条（maintenance.md 第 4 节）
3. 路由表失效 —— CLAUDE.md 与各制度档里引用的仓库内路径必须真实存在
   （maintenance.md 第 5 节防退化 audit；judgment.md 第 5 节「档内路径引用真实存在」）

skills/*.md（根目录技能库）只报告行数、不判定超标：maintenance.md 未为它
定义门槛，脚本不擅自新增规则（新增会约束未来 session 的规则要先问用户）。

用法：
    python3 tools/check-rules.py            # 完整体检
    python3 tools/check-rules.py --quiet    # 只在超标时输出（定时任务用）

退出码：0 = 无需精简；1 = 有项目超标，该按 maintenance.md 第 4 节精简了。
"""
import os
import re
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 行数门槛，照抄 maintenance.md 第 7 节
LINE_LIMITS = [
    (".claude/rules", 150, "rules"),
    (".claude/agents", 200, "agent"),
]
SKILL_LIMIT = 400  # .claude/skills/*/SKILL.md
LESSON_LIMIT = 10  # maintenance.md 第 4 节

# 教训条目格式：- [2026-07-03][本机/云端/皆是] 情境：…
LESSON_RE = re.compile(r"^- \[\d{4}-\d{2}-\d{2}\]")

# 仓库内路径引用：backtick 包住、含 / 或以 .md 结尾的相对路径
PATH_RE = re.compile(r"`([^`\s]+\.(?:md|py|ya?ml|html|json|txt|sh))`")


def rel(path: str) -> str:
    return os.path.relpath(path, REPO).replace(os.sep, "/")


def walk_md(subdir: str):
    """列出某目录下的 .md 档（不递归子目录）。"""
    d = os.path.join(REPO, subdir)
    if not os.path.isdir(d):
        return []
    return sorted(os.path.join(d, f) for f in os.listdir(d)
                  if f.endswith(".md"))


def governance_files() -> list:
    """所有受管辖的制度档（maintenance.md 第 0 行定义的管辖范围）。"""
    files = [os.path.join(REPO, "CLAUDE.md")]
    files += walk_md(".claude/rules") + walk_md(".claude/agents")
    skills_dir = os.path.join(REPO, ".claude", "skills")
    if os.path.isdir(skills_dir):
        for name in sorted(os.listdir(skills_dir)):
            p = os.path.join(skills_dir, name, "SKILL.md")
            if os.path.isfile(p):
                files.append(p)
    files += walk_md("skills")
    return [f for f in files if os.path.isfile(f)]


def limit_for(path: str):
    """回传 (行数门槛, 类别名)；None = 只报告不判定。"""
    r = rel(path)
    for prefix, limit, label in LINE_LIMITS:
        if r.startswith(prefix + "/"):
            return limit, label
    if r.startswith(".claude/skills/"):
        return SKILL_LIMIT, "skill"
    if r == "CLAUDE.md":
        return None, "CLAUDE.md"      # 无硬门槛，只看是否明显膨胀
    return None, "技能库"              # skills/*.md 只报告


def check_lines(files: list) -> tuple:
    """回传 (超标清单, 全部档案的行数表)。"""
    problems, table = [], []
    for f in files:
        n = sum(1 for _ in open(f, encoding="utf-8", errors="replace"))
        limit, label = limit_for(f)
        over = limit is not None and n > limit
        table.append((rel(f), n, limit, label, over))
        if over:
            problems.append(
                f"{rel(f)} 有 {n} 行，超过 {label} 门槛 {limit} 行"
                f"——按 maintenance.md 第 4 节精简"
            )
    return problems, table


def check_lessons(files: list) -> tuple:
    problems, table = [], []
    for f in files:
        text = open(f, encoding="utf-8", errors="replace").read()
        n = sum(1 for line in text.splitlines() if LESSON_RE.match(line))
        if n == 0:
            continue
        table.append((rel(f), n))
        if n >= LESSON_LIMIT:
            problems.append(
                f"{rel(f)} 的教训纪录有 {n} 条，达到 {LESSON_LIMIT} 条门槛"
                f"——按 maintenance.md 第 4 节的六种判定精简"
            )
    return problems, sorted(table, key=lambda x: -x[1])


def check_refs(files: list) -> list:
    """制度档里引用的仓库内路径必须真实存在。"""
    problems = []
    for f in files:
        text = open(f, encoding="utf-8", errors="replace").read()
        for lineno, line in enumerate(text.splitlines(), 1):
            for ref in PATH_RE.findall(line):
                # 排除：本机全局路径、Windows 路径、glob、URL、纯档名占位
                if (ref.startswith(("~", "/", "http")) or "\\" in ref
                        or "*" in ref or "<" in ref):
                    continue
                if "/" not in ref:
                    continue  # 裸档名（如 dispatch.md）在多处互引，不判定
                if not os.path.exists(os.path.join(REPO, ref)):
                    problems.append(
                        f"{rel(f)}:{lineno} 引用的 `{ref}` 不存在"
                        f"——路由失效（maintenance.md 第 5 节）"
                    )
    return problems


def main():
    quiet = "--quiet" in sys.argv[1:]
    files = governance_files()

    line_problems, line_table = check_lines(files)
    lesson_problems, lesson_table = check_lessons(files)
    ref_problems = check_refs(files)
    problems = line_problems + lesson_problems + ref_problems

    if not quiet:
        print(f"制度档体检：共 {len(files)} 个档案\n")
        print("行数（门槛内以 · 标记，超标以 ✗ 标记，— = 无硬门槛）")
        for r, n, limit, label, over in line_table:
            mark = "✗" if over else ("·" if limit else "—")
            cap = f"/{limit}" if limit else ""
            print(f"  {mark} {n:>4}{cap:<5} {r}")
        if lesson_table:
            print(f"\n教训纪录条数（门槛 {LESSON_LIMIT} 条）")
            for r, n in lesson_table:
                print(f"  {'✗' if n >= LESSON_LIMIT else '·'} {n:>3}  {r}")
        print()

    if problems:
        print(f"需要精简（{len(problems)} 项超标）：")
        for p in problems:
            print(f"  ✗ {p}")
        sys.exit(1)

    if not quiet:
        print("通过：所有制度档都在门槛内，本月无需精简")
    sys.exit(0)


if __name__ == "__main__":
    main()
