#!/usr/bin/env python3
"""game-bot/ 手机脚本的自检 —— 改了 game-bot/ 底下任何东西就该跑。

为什么需要它：这三个 .js 是在手机上跑的，仓库里的 CI 跑不了安卓，
「真的能签到成功」只有用户在手机上才验得了。但有四类错误不必等到手机上
才发现，在这里就能拦掉：

1. **语法错误** —— 脚本推上去、用户手机上一跑直接崩，白等一天。
   用 node --check 静态检查（AutoX.js 的引擎不是 node，但语法同源，
   能抓到括号没配对、逗号漏了这类真正会崩的写法）。
2. **私密信息被填进仓库** —— 本仓库是公开的。daily-login.js 有
   Telegram token 和 chat id 两个栏位，那是给用户填在手机上那一份的，
   一旦有人顺手填在仓库这一份里就是外流。
3. **说明书和脚本对不上** —— 配置区示范用到的模板图文件名（close.png…），
   说明书 index.html 里必须逐个交代要怎么截。改了脚本忘了改说明书，
   用户会照着说明书截出一堆对不上号的图。
4. **自检被简化成永远全绿** —— selftest.js 的价值在于它同时验「找得到」
   和「找不到时会说找不到」。哪天有人觉得阴性那一项多余把它删了，
   自检就退化成骗人的绿灯（diagnosis.md 2026-08-05：绿灯本身要先被验证）。
   所以这里守着那几项必须存在。

跑法：
    python3 tools/check-gamebot.py

退出码：0 = 通过；1 = 有问题。CI 靠退出码把关。
"""
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOT_DIR = os.path.join(ROOT, "game-bot")
SCRIPTS = ["daily-login.js", "capture-helper.js", "selftest.js"]
GUIDE = "index.html"

# selftest.js 里不准消失的东西：少了任何一个，自检就不再是双向验证
SELFTEST_MUST_HAVE = [
    ("阴性测试", "找不到时会说找不到"),
    ("阳性测试", "找图（找得到）"),
    ("位置比对", "对得上"),
    ("纯色画面拦截", "数颜色"),
]

# 公开仓库里必须留空的栏位
MUST_BE_EMPTY = ["TG机器人Token", "TG聊天ID"]


def fail(errors, msg):
    errors.append(msg)


def check_files_exist(errors):
    for name in SCRIPTS + [GUIDE]:
        path = os.path.join(BOT_DIR, name)
        if not os.path.exists(path):
            fail(errors, f"game-bot/{name} 不见了")
        elif os.path.getsize(path) == 0:
            fail(errors, f"game-bot/{name} 是空文件")


def check_syntax(errors):
    node = shutil.which("node")
    if not node:
        fail(errors, "找不到 node，没法做语法检查（CI 上一定有，本地可略过）")
        return
    for name in SCRIPTS:
        path = os.path.join(BOT_DIR, name)
        if not os.path.exists(path):
            continue
        r = subprocess.run([node, "--check", path],
                           capture_output=True, text=True)
        if r.returncode != 0:
            first = (r.stderr.strip().splitlines() or ["(无输出)"])[:4]
            fail(errors, f"game-bot/{name} 语法错误：\n      " + "\n      ".join(first))


def check_no_secrets(errors):
    path = os.path.join(BOT_DIR, "daily-login.js")
    if not os.path.exists(path):
        return
    text = open(path, encoding="utf-8").read()
    for key in MUST_BE_EMPTY:
        m = re.search(r'"' + re.escape(key) + r'"\s*:\s*"([^"]*)"', text)
        if not m:
            fail(errors, f"daily-login.js 里找不到「{key}」这个栏位（被改名或删了？）")
        elif m.group(1).strip():
            fail(errors, f"daily-login.js 的「{key}」被填了值——本仓库是公开的，"
                         f"这个值只能填在手机上那一份，请清空后再提交")


def config_template_names(text):
    """把配置区示范用到的模板图文件名捞出来。

    键名一律按「任何以『图』结尾的键」来抓，不写死成 "图"——配置区后来长出了
    「退出框取消图」这类键，写死的话新键漏进说明书也不会报（2026-08-12）。
    值必须看起来像图片文件名，才不会把「图列表」以外的东西误当模板名。
    """
    names = set()
    for m in re.finditer(r'"[^"]*图"\s*:\s*"([^"]+\.(?:png|jpg|jpeg))"', text, re.I):
        names.add(m.group(1))
    for m in re.finditer(r'"[^"]*图列表"\s*:\s*\[([^\]]*)\]', text):
        for n in re.findall(r'"([^"]+\.(?:png|jpg|jpeg))"', m.group(1), re.I):
            names.add(n)
    return names


def check_guide_in_sync(errors):
    js_path = os.path.join(BOT_DIR, "daily-login.js")
    guide_path = os.path.join(BOT_DIR, GUIDE)
    if not (os.path.exists(js_path) and os.path.exists(guide_path)):
        return
    js = open(js_path, encoding="utf-8").read()
    guide = open(guide_path, encoding="utf-8").read()

    names = config_template_names(js)
    if not names:
        fail(errors, "daily-login.js 配置区里一个模板图文件名都没有，示范配置是不是被删空了？")
    missing = sorted(n for n in names if n not in guide)
    if missing:
        fail(errors, "说明书 index.html 没交代这几张模板图要怎么截："
                     + "、".join(missing) + "（改了脚本要同步改说明书）")

    for name in SCRIPTS:
        if name not in guide:
            fail(errors, f"说明书 index.html 里没提到 {name}，用户不知道它做什么用")


def check_selftest_still_strict(errors):
    path = os.path.join(BOT_DIR, "selftest.js")
    if not os.path.exists(path):
        return
    text = open(path, encoding="utf-8").read()
    for label, needle in SELFTEST_MUST_HAVE:
        if needle not in text:
            fail(errors, f"selftest.js 少了「{label}」（找不到 \"{needle}\"）——"
                         f"自检会退化成永远全绿的假绿灯，不准这样改")


def check_step_types_documented(errors):
    """配置区支持的步骤类型，说明书里必须都有解释。"""
    js_path = os.path.join(BOT_DIR, "daily-login.js")
    guide_path = os.path.join(BOT_DIR, GUIDE)
    if not (os.path.exists(js_path) and os.path.exists(guide_path)):
        return
    js = open(js_path, encoding="utf-8").read()
    guide = open(guide_path, encoding="utf-8").read()
    # 从执行逻辑里捞出真正被实现的类型：类型 === "点图" 这种写法
    types = set(re.findall(r'类型\s*===\s*"([^"]+)"', js))
    if not types:
        fail(errors, "daily-login.js 里认不出任何步骤类型，执行逻辑是不是被改坏了？")
    undocumented = sorted(t for t in types if t not in guide)
    if undocumented:
        fail(errors, "说明书没解释这几种步骤类型：" + "、".join(undocumented))


def main():
    errors = []
    if not os.path.isdir(BOT_DIR):
        print("不通过：game-bot/ 目录不存在")
        return 1

    check_files_exist(errors)
    check_syntax(errors)
    check_no_secrets(errors)
    check_guide_in_sync(errors)
    check_selftest_still_strict(errors)
    check_step_types_documented(errors)

    if errors:
        print(f"不通过（{len(errors)} 个问题）：")
        for e in errors:
            print(f"  ✗ {e}")
        return 1
    print(f"通过：game-bot/ 的 {len(SCRIPTS)} 个脚本语法正常、"
          f"无私密信息、说明书与脚本同步、自检仍是双向验证")
    return 0


if __name__ == "__main__":
    sys.exit(main())
