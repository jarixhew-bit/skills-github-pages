#!/usr/bin/env python3
"""HTML 结构检查器 —— 本仓库所有 HTML 改动 commit 前必跑。

来源教训（.claude/rules/dispatch.md 2026-07-11）：修奥林匹克博物馆卡片时
把 </div> 补错位置，D07 起整段跑版，上线数日才被用户发现。
此后规则：div 开闭不平衡不准 commit。本脚本就是那条规则的可执行版本。

检查项：
1. 标签开闭平衡（div/section/main/header/footer/article/table/ul/ol）：
   按出现顺序追踪深度，深度 < 0（多余关闭）或结尾深度 != 0（缺关闭）
   即失败，并报出问题行号。开标签跨多行也能正确计数。
2. 双语页面检查：页面若含 initLang/toggleLang 语言切换，语言偏好写入
   （setItem）必须用全站统一 key siteLangUser（CLAUDE.md 双语页面规则，
   2026-07-12 起）；读取旧 key 做迁移兼容是允许的。

用法：
    python3 tools/check-html.py 文件1.html [文件2.html ...]
    python3 tools/check-html.py --all              # 检查仓库内所有 .html
    python3 tools/check-html.py 文件.html --trace div   # 深度逐行追踪，定位缺口

退出码：0 = 全部通过；1 = 有失败。CI 靠退出码把关。
"""
import re
import subprocess
import sys

# 需要平衡检查的容器标签（自闭合标签如 img/br 不在此列）
BALANCED_TAGS = ["div", "section", "main", "header", "footer",
                 "article", "table", "ul", "ol"]


def strip_noise(html: str) -> str:
    """去掉注释、script、style 内容，避免字符串里的 '<div' 干扰计数。
    替换为等行数的空白，保持行号对应。"""
    def blank_keep_lines(m):
        return "\n" * m.group(0).count("\n")

    html = re.sub(r"<!--.*?-->", blank_keep_lines, html, flags=re.S)
    # script/style 只清内部内容，保留标签本身
    html = re.sub(r"(<script\b[^>]*>)(.*?)(</script>)",
                  lambda m: m.group(1) + "\n" * m.group(2).count("\n") + m.group(3),
                  html, flags=re.S | re.I)
    html = re.sub(r"(<style\b[^>]*>)(.*?)(</style>)",
                  lambda m: m.group(1) + "\n" * m.group(2).count("\n") + m.group(3),
                  html, flags=re.S | re.I)
    return html


def tag_events(text: str, tag: str):
    """返回 [(字符位置, +1/-1), ...]，开标签可跨多行。"""
    events = []
    for m in re.finditer(rf"<{tag}(?=[\s>/])[^>]*(?<!/)>", text, re.I | re.S):
        events.append((m.start(), 1))
    for m in re.finditer(rf"</{tag}\s*>", text, re.I):
        events.append((m.start(), -1))
    events.sort()
    return events


def line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def check_balance(path: str, html: str) -> list:
    errors = []
    text = strip_noise(html)
    for tag in BALANCED_TAGS:
        depth = 0
        neg_line = None
        for pos, d in tag_events(text, tag):
            depth += d
            if depth < 0 and neg_line is None:
                neg_line = line_of(text, pos)
        if neg_line is not None:
            errors.append(f"{path}:{neg_line} <{tag}> 深度变为负数——"
                          f"此行附近有多余的 </{tag}>")
        elif depth != 0:
            errors.append(f"{path}: <{tag}> 结尾深度 = {depth}——"
                          f"缺 {depth} 个 </{tag}>（用 --trace {tag} 定位）")
    return errors


def check_lang_key(path: str, html: str) -> list:
    """双语页面语言偏好的写入必须用全站统一 key siteLangUser。
    读取（getItem）旧 key 做迁移兼容是允许的。"""
    errors = []
    if "toggleLang" not in html and "initLang" not in html:
        return errors
    set_keys = set(re.findall(
        r"localStorage\.setItem\(\s*['\"]([^'\"]+)['\"]", html))
    lang_set_keys = {k for k in set_keys if "lang" in k.lower()}
    bad = lang_set_keys - {"siteLangUser"}
    if bad:
        errors.append(f"{path}: 语言偏好写入了非统一 key {sorted(bad)}，"
                      f"setItem 必须统一用 siteLangUser（CLAUDE.md 双语页面规则）")
    if lang_set_keys and "siteLangUser" not in lang_set_keys:
        errors.append(f"{path}: 有语言切换但从未写入 siteLangUser，"
                      f"语言选择无法全站共用（CLAUDE.md 双语页面规则）")
    return errors


def trace_tag(path: str, html: str, tag: str):
    """辅助定位：打印该标签每次深度变化的行号，人工找缺口用。"""
    text = strip_noise(html)
    depth = 0
    for pos, d in tag_events(text, tag):
        depth += d
        print(f"  行 {line_of(text, pos):>5}  {'+' if d > 0 else ''}{d}  深度 -> {depth}")
    print(f"结尾深度：{depth}")


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(2)

    if "--trace" in args:
        idx = args.index("--trace")
        tag = args[idx + 1]
        files = args[:idx] + args[idx + 2:]
        for f in files:
            print(f"== {f} <{tag}> 深度追踪 ==")
            trace_tag(f, open(f, encoding="utf-8", errors="replace").read(), tag)
        return

    if args == ["--all"]:
        out = subprocess.run(["git", "ls-files", "*.html"],
                             capture_output=True, text=True)
        files = out.stdout.split()
    else:
        files = args

    all_errors = []
    for f in files:
        html = open(f, encoding="utf-8", errors="replace").read()
        all_errors += check_balance(f, html)
        all_errors += check_lang_key(f, html)

    if all_errors:
        print(f"不通过（{len(all_errors)} 个问题）：")
        for e in all_errors:
            print(f"  ✗ {e}")
        sys.exit(1)
    print(f"通过：{len(files)} 个文件结构检查全部 OK")


if __name__ == "__main__":
    main()
