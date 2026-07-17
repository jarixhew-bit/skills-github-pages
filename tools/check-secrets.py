#!/usr/bin/env python3
"""密钥/秘密扫描器 —— 本仓库是公开仓库，防止误提交 API key、私钥等敏感信息。

来源：精简自第三方工具包 ECC 的 security-reviewer agent（只取"硬编码秘钥检测"
这一项，OWASP 注入/认证/后端那部分对本仓库的纯静态页面不适用）。
2026-07-17 引入首日即在 expense-tracker.html 查到一个真实的 Firebase apiKey——
核实是 Firebase Web SDK 的公开配置值（Google 官方文档：这类客户端 key 设计上
就是公开的，真正的访问控制由 Firestore/Auth 安全规则负责，该项目规则已在
diagnosis.md 2026-07-16 那次稽核里改成 users/{uid} 限权），登记进白名单放行。

检查项（按类别报可疑行，不做语义分析，宁可漏放也不做重的语法解析）：
1. AWS Access Key ID（AKIA...）
2. 私钥区块（-----BEGIN ... PRIVATE KEY-----）
3. Slack token（xox[baprs]-...）
4. Google API key 形态（AIza...）——不代表一定是秘密（Firebase 等场景设计上
   就公开），但陌生的一律先报出来人工确认，不默认信任
5. 通用 secret/password/token/access_key 赋值（key: "16 位以上随机值"）

白名单：tools/secrets-whitelist.txt，一行一个已确认可公开的字面值，登记前
必须写清楚"为什么公开也没事"，不是"看起来像误报就抄进来"。

用法：
    python3 tools/check-secrets.py            # 扫描所有 git 追踪的文本文件
    python3 tools/check-secrets.py 文件1 文件2  # 只扫指定文件

退出码：0 = 未发现可疑项；1 = 有可疑项待确认。CI 靠退出码把关。
"""
import os
import re
import subprocess
import sys

SKIP_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
            ".woff", ".woff2", ".ttf", ".pdf", ".mp3", ".mp4"}

WHITELIST_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              "secrets-whitelist.txt")

PATTERNS = [
    ("AWS Access Key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("私钥区块", re.compile(r"-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----")),
    ("Slack token", re.compile(r"xox[baprs]-[0-9A-Za-z-]{10,}")),
    ("Google API key 形态", re.compile(r"AIza[0-9A-Za-z_\-]{35}")),
    ("通用秘钥赋值", re.compile(
        r"(?i)(secret|password|passwd|token|access[_-]?key)[\"']?\s*[:=]\s*"
        r"[\"'][A-Za-z0-9_./+=-]{16,}[\"']")),
]


def load_whitelist() -> list:
    try:
        lines = open(WHITELIST_PATH, encoding="utf-8").read().splitlines()
    except FileNotFoundError:
        return []
    return [l.strip() for l in lines if l.strip() and not l.startswith("#")]


def scan_file(path: str, whitelist: list) -> list:
    errors = []
    try:
        text = open(path, encoding="utf-8", errors="replace").read()
    except (IsADirectoryError, PermissionError):
        return errors
    for lineno, line in enumerate(text.splitlines(), 1):
        if any(w in line for w in whitelist):
            continue
        for name, pat in PATTERNS:
            m = pat.search(line)
            if m:
                errors.append(f"{path}:{lineno} 疑似{name}："
                              f"「{m.group(0)[:60]}」——确认无害后登记进 "
                              f"tools/secrets-whitelist.txt 并写明原因")
    return errors


def main():
    args = sys.argv[1:]
    if args:
        files = args
    else:
        out = subprocess.run(["git", "ls-files"], capture_output=True, text=True)
        files = [f for f in out.stdout.split()
                 if os.path.splitext(f)[1].lower() not in SKIP_EXT
                 and f != "tools/secrets-whitelist.txt"]

    whitelist = load_whitelist()
    all_errors = []
    for f in files:
        if not os.path.isfile(f):
            continue
        all_errors += scan_file(f, whitelist)

    if all_errors:
        print(f"不通过（{len(all_errors)} 个可疑项）：")
        for e in all_errors:
            print(f"  ✗ {e}")
        sys.exit(1)
    print(f"通过：{len(files)} 个文件未发现可疑秘钥")


if __name__ == "__main__":
    main()
