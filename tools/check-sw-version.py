#!/usr/bin/env python3
"""改了 PWA 页面就必须升 Service Worker 的缓存版本号——这个检查专门拦忘记升的情况。

为什么需要它（2026-08-27 真实事故）：修好了「账单只显示一页、滑不动」，页面也合并
上线了，用户却说还是老样子。原因是那次改了 boss/index.html 却没升 boss-sw.js 的
CACHE 版本号——装了 PWA 的设备继续吃缓存里的旧页面，**修复根本没送到用户手上**。

这条规矩本来就写在 skills/pwa-pages.md 里，但全靠人记得。人会忘，所以改成机器查。

判定方式：跟 origin/main 比，某个 PWA 的页面/脚本内容变了，它对应的 SW 里那行
版本号字符串就必须也变。只比较「有没有变」，不管版本号长什么样。

跑法：python3 tools/check-sw-version.py
CI 与本地都能跑；拿不到 origin/main（例如浅克隆）时跳过并说明，不误报。
"""
import re
import subprocess
import sys

# 每个 PWA：SW 文件 → 归它管的页面/资源（这几个文件变了就得升 SW 版本）
PWAS = {
    "boss/boss-sw.js": ["boss/index.html", "boss/manifest.webmanifest"],
    "expense-tracker-sw.js": ["expense-tracker.html", "expense-tracker.webmanifest"],
    "staff/staff-sw.js": ["staff/index.html", "staff/manifest.webmanifest"],
    "xisui/sw.js": ["xisui/index.html", "xisui/manifest.json"],
}

# SW 里那行版本号，形如 const CACHE = 'boss-app-v9';
VERSION_RE = re.compile(r"""(?:CACHE|CACHE_NAME|VERSION)\s*=\s*['"]([^'"]+)['"]""")


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def base_ref():
    """找一个能比的基线：优先 origin/main。"""
    for ref in ("origin/main", "main"):
        if run(["git", "rev-parse", "--verify", "--quiet", ref]).returncode == 0:
            return ref
    return None


def file_at(ref, path):
    r = run(["git", "show", f"{ref}:{path}"])
    return r.stdout if r.returncode == 0 else None


def version_of(text):
    if text is None:
        return None
    m = VERSION_RE.search(text)
    return m.group(1) if m else None


def main():
    ref = base_ref()
    if ref is None:
        print("跳过：找不到 origin/main 作为比较基线（浅克隆？），本次不判定")
        return 0

    problems = []
    checked = 0
    for sw, pages in PWAS.items():
        old_sw = file_at(ref, sw)
        if old_sw is None:
            continue  # 新建的 PWA，没有基线可比
        try:
            new_sw = open(sw, encoding="utf-8").read()
        except FileNotFoundError:
            problems.append(f"{sw} 不见了，但基线里有——是不是删错了？")
            continue

        changed_pages = []
        for p in pages:
            old = file_at(ref, p)
            try:
                new = open(p, encoding="utf-8").read()
            except FileNotFoundError:
                new = None
            if old is not None and new is not None and old != new:
                changed_pages.append(p)
        checked += 1
        if not changed_pages:
            continue

        ov, nv = version_of(old_sw), version_of(new_sw)
        if nv is None:
            problems.append(f"{sw} 里找不到版本号常量（应形如 const CACHE = 'xxx-v1'）")
        elif ov == nv:
            problems.append(
                f"{', '.join(changed_pages)} 改了，但 {sw} 的版本号还是 {nv} —— "
                f"装了 PWA 的设备会继续用缓存里的旧页面，改动送不到用户手上。"
                f"把那行版本号加一即可。"
            )

    if problems:
        print(f"不通过：{len(problems)} 个 PWA 改了页面却没升版本号\n")
        for p in problems:
            print("  ✗ " + p)
        return 1

    print(f"通过：{checked} 个 PWA 的页面改动都配了版本号升级")
    return 0


if __name__ == "__main__":
    sys.exit(main())
