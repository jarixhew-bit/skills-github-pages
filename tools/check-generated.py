#!/usr/bin/env python3
"""生成物有没有跟源文件脱节。

为什么它必须叫 `check-`（2026-08-12 建，起因就是被这件事咬了一口）：
本仓库有些文件是**生成出来、又提交进仓库**的——GitHub Pages 部署时不跑构建，
所以成品必须先躺在仓库里。这类文件天生会漂移：源文件改了、成品没跟上。

而 CLAUDE.md 的规则写的是「跑 `tools/` 底下全部 check-*」。负责抓漂移的
`build-staff-page.py --check` **不叫 check-**，所以照着规则做正好会漏掉它。
更糟的是漏掉之后**本地会全绿**：`check-staff-page.mjs` 验的是同事版现有内容，
而它还是旧的，旧内容配旧断言当然通过——绿灯是真的，只是它没在看这件事。

所以这个文件的全部意义就是**改名**：把那个检查搬进 check-* 这个命名空间，
让「跑全部 check-*」这句话真的覆盖得到，不再靠谁记得有个例外。
（仓库原则：同一类错误出现第二次，就该变成脚本，别再靠记性。）

顺带守第二层：**新增了生成器却没登记进来**也会红。不然过两个月多一个
build-xxx.py，同样的坑会原样再来一次。

用法：python3 tools/check-generated.py
退出码：0 = 所有生成物都是最新的；1 = 有脱节，或有生成器没登记。
"""
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 登记表：每个「生成 + 提交」的产物一条。加新生成器时**必须**加进来，
# 否则下面的发现逻辑会报错——这是刻意的，见文件头第二层。
GENERATED = [
    {
        "out": "staff/index.html",
        "src": "expense-tracker.html",
        "builder": "tools/build-staff-page.py",
        "check": ["tools/build-staff-page.py", "--check"],
        "regen": "python3 tools/build-staff-page.py",
    },
]


def run(argv):
    p = subprocess.run([sys.executable] + argv, cwd=REPO,
                       capture_output=True, text=True)
    # 生成脚本可能印 SyntaxWarning 之类的噪音，只留真正的输出
    out = "\n".join(l for l in (p.stdout + p.stderr).splitlines()
                    if l.strip() and "Warning" not in l and "BOOTSTRAP" not in l)
    return p.returncode, out


def main():
    fails = []

    # 第一层：登记在案的生成物，逐个问它「你还是最新的吗」
    for g in GENERATED:
        for rel in (g["out"], g["src"], g["builder"]):
            if not os.path.exists(os.path.join(REPO, rel)):
                fails.append((g["out"], f"找不到 {rel}", g["regen"]))
                break
        else:
            code, out = run(g["check"])
            tail = out.splitlines()[-1] if out else "(没有输出)"
            if code == 0:
                print(f"  · {g['out']} ← {g['src']}：{tail}")
            else:
                print(f"  ✗ {g['out']} ← {g['src']}：{tail}")
                fails.append((g["out"], f"跟 {g['src']} 对不上了", g["regen"]))

    # 第二层：有没有哪个生成器没登记。只看 tools/build-*.py，够用且不会误报。
    known = {g["builder"] for g in GENERATED}
    tools = os.path.join(REPO, "tools")
    found = sorted("tools/" + f for f in os.listdir(tools)
                   if f.startswith("build-") and f.endswith(".py"))
    for f in found:
        if f not in known:
            print(f"  ✗ {f} 没有登记进 GENERATED")
            fails.append((f, "新增了生成器却没登记，它的产物没人守着",
                          f"在 tools/check-generated.py 的 GENERATED 里加一条"))

    if fails:
        print(f"\n不通过：{len(fails)} 项")
        for what, why, how in fails:
            print(f"  ✗ {what}：{why}")
            print(f"      修法：{how}")
        return 1

    print(f"\n通过：{len(GENERATED)} 个生成物都是最新的，"
          f"{len(found)} 个生成器都已登记")
    return 0


if __name__ == "__main__":
    sys.exit(main())
