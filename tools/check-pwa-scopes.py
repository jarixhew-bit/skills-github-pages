#!/usr/bin/env python3
"""检查本仓库各个 PWA 的 manifest scope 有没有互相圈住。

为什么要有（2026-08-10）：记账本的 manifest 在仓库根目录、scope 写的是 "./"，
解析出来是整个 /skills-github-pages/ 文件夹——把 inventory/ 和 staff/ 也圈进去了。
后果不是报错，而是**浏览器认为库存页是记账本的一部分**：用户想把库存装到主屏时
提示「已经安装过」，两个 App 只能装一个。这种错没有任何报错信息，只有真机安装
时才发现，所以必须机器守着。

规则：任何一份 manifest 的 scope，都不能是另一份 manifest 的 scope 的前缀
（相等也不行）。每个 PWA 只圈自己那一页或自己那个文件夹。

跑法：
    python3 tools/check-pwa-scopes.py
退出码 0 = 通过，1 = 有 scope 互相圈住。
"""
import json
import sys
from pathlib import Path
from urllib.parse import urljoin

# 线上根路径。scope 是相对 manifest 自己的位置解析的，所以要按真实部署路径算，
# 不能按仓库里的相对路径算（算错了这个检查就形同虚设）。
SITE_ROOT = "https://jarixhew-bit.github.io/skills-github-pages/"


def manifest_scope(repo_root: Path, mf_path: Path):
    """返回 (manifest 相对仓库的路径, 解析后的绝对 scope URL)。"""
    rel = mf_path.relative_to(repo_root).as_posix()
    base = urljoin(SITE_ROOT, rel)          # manifest 自己的绝对地址
    data = json.loads(mf_path.read_text(encoding="utf-8"))
    scope = data.get("scope")
    if scope is None:
        # 没写 scope 时，浏览器默认用 manifest 所在目录——同样要参与比较
        scope = "./"
    return rel, urljoin(base, scope)


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    files = sorted(repo_root.glob("**/*.webmanifest"))
    files = [f for f in files if "node_modules" not in f.parts]
    if not files:
        print("没找到任何 .webmanifest，跳过")
        return 0

    entries = []
    for f in files:
        try:
            entries.append(manifest_scope(repo_root, f))
        except json.JSONDecodeError as e:
            print(f"❌ {f.relative_to(repo_root)} 不是合法 JSON：{e}")
            return 1

    print(f"共 {len(entries)} 份 manifest：")
    for rel, scope in entries:
        print(f"  {rel:<42} scope = {scope}")

    bad = []
    for i, (rel_a, scope_a) in enumerate(entries):
        for j, (rel_b, scope_b) in enumerate(entries):
            if i == j:
                continue
            # a 圈住了 b：b 的 scope 以 a 的 scope 开头
            if scope_b.startswith(scope_a):
                bad.append((rel_a, scope_a, rel_b, scope_b))

    if bad:
        print("\n❌ 有 manifest 的 scope 圈住了别的 App：")
        for rel_a, scope_a, rel_b, scope_b in bad:
            print(f"  {rel_a} 的 scope（{scope_a}）")
            print(f"    圈住了 {rel_b}（{scope_b}）")
        print("\n后果：浏览器会把被圈住的那个当成前者的一部分，装它时提示"
              "「已经安装过」，两个 App 只能装一个。")
        print("修法：把范围大的那份 scope 收窄到只圈自己（单页 App 就写自己的文件名，"
              "整个文件夹的 App 就写 \"./\" 并确保自己在独立文件夹里）。")
        return 1

    print("\n通过：各个 App 的 scope 互不重叠，可以分别安装")
    return 0


if __name__ == "__main__":
    sys.exit(main())
