#!/usr/bin/env python3
"""GitHub Actions workflow 文件的把关脚本。

跑法：
    python3 tools/check-workflows.py            # 检查 .github/ 底下全部 workflow 与 composite action
    python3 tools/check-workflows.py --quiet    # 只在有问题时输出（CI 用）

为什么需要它（2026-08-11 踩过）：
改 workflow 时我用 `yaml.safe_load()` 验证「语法 OK」，四个文件里 `branches: [main]`
被写了两遍——**PyYAML 对重复键是静默接受的（后面的覆盖前面的）**，所以本地全绿；
而 GitHub 的解析器直接判「Invalid workflow file」，结果每次推 main 都无声地红四条，
名字还显示成文件路径（那正是「这个文件解析不了」的症状）。

也就是说：光用 PyYAML 验 workflow，等于没验。这个脚本补上 PyYAML 不管的那几件事：

1. **重复键** —— 同一层级出现两次同名键（GitHub 拒绝，PyYAML 不吭声）
2. **on / jobs 缺失** —— workflow 必须有触发条件和 job
3. **本仓库自己的约定** —— 有 pull_request 触发的检查类 workflow，路径过滤里必须
   包含它自己（不然「改 CI 配置的 PR」一个检查都不跑，等于改 CI 时 CI 是瞎的）
4. **composite action 的 run 步骤必须写 shell:** —— 少写 GitHub 会拒绝

退出码：0 = 全过；1 = 有问题。
"""
import sys
import re
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
WF_DIR = REPO / ".github" / "workflows"
ACT_DIR = REPO / ".github" / "actions"


class DupKeyLoader(yaml.SafeLoader):
    """跟 SafeLoader 一样，但遇到重复键会报错——这正是 GitHub 的行为。"""


def _no_duplicates(loader, node, deep=False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            line = key_node.start_mark.line + 1
            raise yaml.constructor.ConstructorError(
                None, None, f"第 {line} 行：键 `{key}` 重复了（GitHub 会拒绝整个文件）",
                key_node.start_mark)
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


DupKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _no_duplicates)


def load(path: Path):
    """解析并顺带查重复键。返回 (数据, 错误讯息)。"""
    try:
        return yaml.load(path.read_text(encoding="utf-8"), Loader=DupKeyLoader), None
    except yaml.YAMLError as e:
        return None, str(e).replace("\n", " ")


def rel(p: Path) -> str:
    return str(p.relative_to(REPO))


def check_workflow(path: Path) -> list:
    problems = []
    data, err = load(path)
    if err:
        return [f"{rel(path)}：解析失败 —— {err}"]

    # yaml 会把裸 on: 解析成 True（YAML 1.1 把 on 当布尔值）
    on = data.get("on", data.get(True))
    if on is None:
        problems.append(f"{rel(path)}：没有 on:（不会被任何事件触发）")
    if not data.get("jobs"):
        problems.append(f"{rel(path)}：没有 jobs:")

    # 有 pull_request 且带 paths 的，路径里要包含自己
    if isinstance(on, dict) and isinstance(on.get("pull_request"), dict):
        paths = on["pull_request"].get("paths")
        if paths is not None:
            selfpath = f".github/workflows/{path.name}"
            if not any(selfpath in str(p) for p in paths):
                problems.append(
                    f"{rel(path)}：pull_request 的 paths 里没有它自己 —— "
                    f"改这个 workflow 的 PR 会一个检查都不跑（加一条 '{selfpath}'）")
    return problems


def check_action(path: Path) -> list:
    problems = []
    data, err = load(path)
    if err:
        return [f"{rel(path)}：解析失败 —— {err}"]
    runs = data.get("runs", {})
    if runs.get("using") == "composite":
        for i, step in enumerate(runs.get("steps", []), 1):
            if "run" in step and "shell" not in step:
                problems.append(
                    f"{rel(path)}：第 {i} 个步骤有 run 却没写 shell:（GitHub 会拒绝）")
    return problems


def main() -> int:
    quiet = "--quiet" in sys.argv
    problems = []
    files = sorted(WF_DIR.glob("*.yml")) + sorted(WF_DIR.glob("*.yaml"))
    actions = sorted(ACT_DIR.glob("*/action.yml")) if ACT_DIR.exists() else []

    for f in files:
        problems += check_workflow(f)
    for a in actions:
        problems += check_action(a)

    if not quiet:
        print(f"检查了 {len(files)} 个 workflow、{len(actions)} 个共用步骤")
    if problems:
        print(f"不通过（{len(problems)} 个问题）：")
        for p in problems:
            print("  ✗ " + p)
        return 1
    if not quiet:
        print("通过：全部 workflow 都能被 GitHub 正常解析，约定也满足")
    return 0


if __name__ == "__main__":
    sys.exit(main())
