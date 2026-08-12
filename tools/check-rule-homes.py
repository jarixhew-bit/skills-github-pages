#!/usr/bin/env python3
"""制度档「一条规则只住一个家」的可执行版本。

为什么需要它（2026-08-12，同一类错误第二次发生）：
maintenance.md 写着「永远禁止：同一规则写进两个档案」，但这条规则本身没有任何
机器在守。结果「上线后 WebFetch github.io 验证」这条写进了三个档案，而沙盒
根本连不到 github.io——修的时候只找到两份，第三份在 skills/ 里又活了一段时间
（没人发现，因为 CLAUDE.md 的路由表从不指向 skills/）。
2026-07-03 的「制度副本分岔」是第一次，这是第二次。按 diagnosis.md 的通则：
**同一类错误出现第二次，就该把它变成脚本，别再靠记性。**

为什么不做逐字比对：试过了，全库零条逐字重复——重复是**语义上**的，同一条规则
在每个档案里换句话说了一遍。所以这里改用「主题登记表」：每个主题声明唯一正本，
再列几个只有在**陈述**这条规则时才会出现的标记词。别的档案出现标记词时，
必须同时出现正本的路径（＝它是在引用而不是在复述），否则判为「第二个家」。

加新主题就在 TOPICS 里加一条。判定错了（某档案确实该展开细节）就把它写进
`例外`，并在那里写清楚为什么——例外要有名字，不能默默放过。

跑法：python3 tools/check-rule-homes.py
退出码：0 = 每条规则都只有一个家；1 = 有规则住了两个家。
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 被管辖的档案：制度档 + 技能库 + 会被自动载入的 skill + CLAUDE.md
SCOPE = [
    ".claude/rules", ".claude/skills", ".claude/agents", "skills",
]
EXTRA_FILES = ["CLAUDE.md"]

TOPICS = [
    {
        "主题": "上线流程与上线验证",
        "正本": ".claude/skills/publish-pages/SKILL.md",
        # 只有在「讲这套流程该怎么做」时才会写出来的东西
        "标记词": ["cleanup-branches.yml", "squash merge", "squash 合并到 main"],
        "例外": {
            # 教训纪录记的是「当初怎么发现 403、为什么建这条通道」，属于事故来源，
            # 不是流程步骤本身；流程步骤在正本里
            ".claude/rules/diagnosis.md": "教训纪录：记录 403 的发现经过与通道由来",
        },
    },
    {
        "主题": "派工门槛与委派三件套",
        "正本": ".claude/rules/dispatch.md",
        "标记词": ["禁止再派 subagent", "派工三件套"],
        "例外": {
            # templates.md 是模板正本，委派 prompt 的成品里本来就要带这句
            ".claude/rules/templates.md": "模板正本，成品 prompt 里必须带这句话",
            ".claude/rules/examples.md": "范例库，填好的 prompt 里必须带这句话",
            # agent 定义档是「把规则用在自己身上」，不是复述规则
            ".claude/agents/html-editor.md": "agent 定义：对自己下的约束，不是复述规则",
            ".claude/agents/researcher.md": "agent 定义：对自己下的约束，不是复述规则",
            # maintenance.md 拿它当「重复规则长什么样」的举例
            ".claude/rules/maintenance.md": "拿它当『两处写同一件事』的举例，非陈述",
        },
    },
    {
        "主题": "制度档维护协议（许可权、精简门槛）",
        "正本": ".claude/rules/maintenance.md",
        "标记词": ["必須先問使用者才能改", "觸發精簡"],
        "例外": {},
    },
    {
        "主题": "各类产出的验证底线表",
        "正本": ".claude/rules/judgment.md",
        "标记词": ["底線檢查（全過才能交付）"],
        "例外": {},
    },
    {
        "主题": "双语页面的 siteLangUser 做法",
        "正本": "skills/bilingual-pages.md",
        "标记词": ["initLang", "siteLangUser"],
        "例外": {
            # CLAUDE.md 放的是「有这条规则」的路由，不是做法本身
            "CLAUDE.md": "路由层：只说有这条规则并指向参考实现，不写做法",
            ".claude/skills/edit-html-page/SKILL.md": "改页面时的检查项，指向本档",
            # letter.md 只是提到「check-html.py 会查这个 key」，没讲做法
            ".claude/rules/letter.md": "只提到检查脚本会查这个 key，未讲做法",
        },
    },
]


def 收集档案():
    out = []
    for d in SCOPE:
        full = os.path.join(ROOT, d)
        if not os.path.isdir(full):
            continue
        for dirpath, _, names in os.walk(full):
            for n in names:
                if n.endswith(".md"):
                    out.append(os.path.relpath(os.path.join(dirpath, n), ROOT))
    for f in EXTRA_FILES:
        if os.path.exists(os.path.join(ROOT, f)):
            out.append(f)
    return sorted(out)


def main():
    档案 = 收集档案()
    内容 = {}
    for f in 档案:
        try:
            内容[f] = open(os.path.join(ROOT, f), encoding="utf-8").read()
        except OSError:
            pass

    问题 = []
    for t in TOPICS:
        正本 = t["正本"]
        if 正本 not in 内容:
            问题.append(f"主题「{t['主题']}」声明的正本不存在：{正本}")
            continue
        # 正本自己必须真的讲了这件事，否则登记表已经过时
        if not any(m in 内容[正本] for m in t["标记词"]):
            问题.append(
                f"主题「{t['主题']}」的正本 {正本} 里找不到任何标记词 "
                f"{t['标记词']}——登记表过时了，或正本被搬走了")
            continue

        for f, text in 内容.items():
            if f == 正本 or f in t["例外"]:
                continue
            命中 = [m for m in t["标记词"] if m in text]
            if not 命中:
                continue
            # 有标记词但也指向了正本 = 它在引用，放过。
            # 引用写法有两种：完整路径，或同目录的相对写法（INDEX.md 的 [x.md](x.md)）
            if 正本 in text or os.path.basename(正本) in text:
                continue
            问题.append(
                f"{f} 在讲「{t['主题']}」（命中 {命中}）却没指向正本 {正本}——"
                f"一条规则只住一个家，这里应该改成引用，或把它登记进该主题的例外")

    if 问题:
        print(f"不通过（{len(问题)} 个问题）：")
        for p in 问题:
            print(f"  ✗ {p}")
        return 1
    print(f"通过：{len(TOPICS)} 个主题各自只有一个家，"
          f"扫了 {len(内容)} 个制度/技能档案")
    return 0


if __name__ == "__main__":
    sys.exit(main())
