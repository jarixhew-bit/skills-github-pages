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
    python3 tools/check-secrets.py --history   # 扫 git 全部历史（含已删除的内容）

为什么需要 --history（2026-08-05 加）：默认模式只看当前文件，**从文件里删掉的密钥
它查不到**，而本仓库是公开的、历史永久可查。当天就是这样漏掉了一把 Google Maps key：
它早已从旅游手册页面删除，但仍留在历史里任何人都能翻出来。历史扫描慢（要读全部
blob），所以不挂每次 push，只每月跑一次 ＋ 需要时手动跑。

退出码：0 = 未发现可疑项；1 = 有可疑项待确认。CI 靠退出码把关。
"""
import os
import re
import subprocess
import threading
import sys

# 历史扫描时跳过超过这个大小的 blob：本仓库最大的是 vendored 的 tesseract wasm
# （单行 460 万字符的 base64），逐版本扫它们既慢又只会撞出已知误报。
HISTORY_MAX_BLOB_BYTES = 2 * 1024 * 1024

SKIP_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
            ".woff", ".woff2", ".ttf", ".pdf", ".mp3", ".mp4"}

WHITELIST_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              "secrets-whitelist.txt")

# 第三个字段 = 能否安全地用在超长行上。
# 前四条都以固定字面量开头（AKIA / -----BEGIN / xox / AIza），正则引擎一撞不上就走，
# 再长的行也便宜。最后一条不是：`[A-Za-z0-9_./+=-]{16,}` 后面还要跟引号，在压缩过的
# JS 那种几十万字符的单行上会大量回溯。所以超长行只跑前四条——真实的密钥赋值行都很短。
MAX_LINE_FOR_EXPENSIVE = 2000

PATTERNS = [
    ("AWS Access Key", re.compile(r"AKIA[0-9A-Z]{16}"), True),
    ("私钥区块", re.compile(r"-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----"), True),
    ("Slack token", re.compile(r"xox[baprs]-[0-9A-Za-z-]{10,}"), True),
    ("Google API key 形态", re.compile(r"AIza[0-9A-Za-z_\-]{35}"), True),
    ("通用秘钥赋值", re.compile(
        r"(?i)(secret|password|passwd|token|access[_-]?key)[\"']?\s*[:=]\s*"
        r"[\"'][A-Za-z0-9_./+=-]{16,}[\"']"), False),
]


def match_line(line: str):
    """在一行里找可疑项，返回 (类别, 命中文本) 或 None。"""
    long_line = len(line) > MAX_LINE_FOR_EXPENSIVE
    for name, pat, cheap in PATTERNS:
        if long_line and not cheap:
            continue
        m = pat.search(line)
        if m:
            return name, m.group(0)
    return None


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
        hit = match_line(line)
        if hit:
            name, value = hit
            errors.append(f"{path}:{lineno} 疑似{name}："
                          f"「{value[:60]}」——确认无害后登记进 "
                          f"tools/secrets-whitelist.txt 并写明原因")
    return errors


# 预筛用的关键词：PATTERNS 里每条规则要成立，内容中必然出现其中之一。
# 逐行跑 5 条正则对本仓库几千份行情 JSON 来说太慢（实测直接超过 2 分钟），
# 先用这组廉价的子串判断把它们整块刷掉。改 PATTERNS 时这里要一起改。
PREFILTER_CASED = (b"AKIA", b"PRIVATE KEY", b"xox", b"AIza")
PREFILTER_LOWER = (b"secret", b"password", b"passwd", b"token", b"access")


def may_contain_secret(content: bytes) -> bool:
    if any(t in content for t in PREFILTER_CASED):
        return True
    lower = content.lower()
    return any(t in lower for t in PREFILTER_LOWER)


def scan_history(whitelist: list) -> tuple:
    """扫描 git 历史里出现过的每一份内容（含已被删除的）。

    按 blob 去重，不按提交遍历：本仓库工作日每小时提交一次，同一份内容在几百个
    提交里重复出现，逐提交扫会把同一件事查上百遍。
    """
    out = subprocess.run(["git", "rev-list", "--objects", "--all"],
                         capture_output=True, text=True)
    # rev-list --objects 每行是「sha 路径」（提交/树没有路径，跳过）
    blobs = {}
    for line in out.stdout.splitlines():
        parts = line.split(" ", 1)
        if len(parts) != 2:
            continue
        sha, path = parts[0], parts[1].strip()
        if not path or path == "tools/secrets-whitelist.txt":
            continue
        if os.path.splitext(path)[1].lower() in SKIP_EXT:
            continue
        blobs.setdefault(sha, path)

    if not blobs:
        return [], 0, 0

    # git cat-file --batch 一个进程读完所有 blob，别每个 blob 开一次进程。
    # sha 清单必须用独立线程写：几千个 sha 有几百 KB，远超管道缓冲区（约 64KB），
    # 主线程一次性写会阻塞在 write 上，而此时 git 的 stdout 也满了在等人读——
    # 两边互等，整个扫描永远卡住（2026-08-05 实测跑 6 分钟没有任何输出就是这个原因，
    # 一开始还误判成正则回溯）。
    proc = subprocess.Popen(["git", "cat-file", "--batch"],
                            stdin=subprocess.PIPE, stdout=subprocess.PIPE)

    def feed_shas():
        try:
            proc.stdin.write(("\n".join(blobs) + "\n").encode())
            proc.stdin.close()
        except (BrokenPipeError, ValueError):
            pass

    threading.Thread(target=feed_shas, daemon=True).start()

    findings, seen, skipped_big = {}, set(), 0
    for _ in range(len(blobs)):
        header = proc.stdout.readline().decode("utf-8", "replace").split()
        if len(header) < 3:
            break
        sha, objtype, size = header[0], header[1], int(header[2])
        content = proc.stdout.read(size)
        proc.stdout.read(1)  # 内容后面跟一个换行
        # rev-list --objects 连目录（tree）也会带路径输出，所以这里会混进非 blob。
        # 必须「读完内容再跳过」，不能 break——2026-08-05 第一版就是遇到第一个 tree
        # 直接 break，0.13 秒扫完 4844 个对象报「通过」，而历史里明明有一把已知的 key。
        # 教训：扫描器报通过时，先拿一个已知该被查出的东西验证它真的会报。
        if objtype != "blob":
            continue
        if size > HISTORY_MAX_BLOB_BYTES:
            skipped_big += 1
            continue
        if not may_contain_secret(content):
            continue
        path = blobs[sha]
        for line in content.decode("utf-8", "replace").splitlines():
            if any(w in line for w in whitelist):
                continue
            hit = match_line(line)
            if not hit:
                continue
            name, value = hit
            # 同一个值在同一个文件的多个历史版本里只报一次
            key = (name, value, path)
            if key in seen:
                continue
            seen.add(key)
            findings.setdefault(value, []).append((name, path))
    proc.stdout.close()
    proc.wait()

    errors = []
    for value, hits in findings.items():
        paths = sorted({p for _, p in hits})
        name = hits[0][0]
        errors.append(
            f"历史中疑似{name}：「{value[:50]}」\n"
            f"      出现在：{'、'.join(paths[:4])}{' 等' if len(paths) > 4 else ''}\n"
            f"      查是哪次提交：git log --all --oneline -S'{value[:20]}'\n"
            f"      注意：即使已从文件删除，公开仓库的历史里仍然人人可查——"
            f"该轮换的去轮换，确认可公开的登记进 tools/secrets-whitelist.txt")
    return errors, len(blobs), skipped_big


def main():
    args = sys.argv[1:]

    if "--history" in args:
        whitelist = load_whitelist()
        errors, scanned, skipped = scan_history(whitelist)
        if errors:
            print(f"不通过（{len(errors)} 个可疑项）：")
            for e in errors:
                print(f"  ✗ {e}")
            sys.exit(1)
        extra = f"，跳过 {skipped} 个超大 blob" if skipped else ""
        print(f"通过：git 历史 {scanned} 份内容未发现可疑秘钥{extra}")
        return

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
