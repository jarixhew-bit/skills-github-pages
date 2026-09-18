#!/usr/bin/env python3
"""破图自动补——找出失效的手册图片，重抓同一家店的照片补上。**只能在 CI 跑。**

为什么要有它（2026-09-18 用户要求）：「想说让你搞自动化，结果我还是一直要手动
选图什么的，不能搞简单化一点吗」。在这之前，一张图坏掉的完整流程是：
家人看到破图 → 告诉用户 → 用户告诉 Claude → Claude 触发抓图 → 换图 → 开 PR。
五步里有三步是人。而这件事没有一步需要判断力：哪张死了机器验得出来，
换成同一家店的哪张照片也不需要人拍板——**需要人拍板的只有「好不好看」，
那是挑图，不是补破图**。

所以这支脚本把补破图整条做完：
  1. 扫手册里的图片，逐张探测（沿用 check-images 的判定：非 image/* 或
     内容不足 1KB 都算死，因为过期的 Google 链接会回 200 加一坨非图片内容）
  2. 死图往下找最近的地图链接（cid）或卡片标题，定出「这是哪家店的图」
  3. 对需要补图的店各抓一轮照片（走 tools/fetch-photos.mjs，CI 上才连得到 Google）
  4. 用这家店**还没被用过**的候选，按顺序补上死掉的位置
  5. 印出摘要，改动留在工作区，由 workflow 提交并开 PR 给用户过目

补不满不硬凑：抓不到就如实报「这家店补不了」，留着让人处理，
绝不拿别家店的照片顶上（那是「图不对题」，2026-09-16 被用户挡过一次）。

用法：
    python3 tools/refresh-photos.py                    # 全部手册
    python3 tools/refresh-photos.py penang-trip/index.html
    python3 tools/refresh-photos.py --dry-run          # 只报告不改档
退出码 0 = 跑完（不管有没有补到），1 = 参数或环境错误。
"""
import glob
import importlib.util
import json
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WANT = 8                      # 每家店抓几张候选：补 1 张也抓 8 张，之后好挑
PAGES = ["*.html", "*/index.html"]

# 借用 check-images 的探测逻辑，不要在这里复制一份判定规则——
# 「什么算死图」只能有一个定义，两份迟早会分岔。
_spec = importlib.util.spec_from_file_location(
    "check_images", os.path.join(REPO, "tools", "check-images.py"))
check_images = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(check_images)

IMG_LINE = re.compile(r'<img\b[^>]*\bsrc="([^"]+)"[^>]*>')
CID = re.compile(r'<a[^>]+class="btn-map"[^>]+href="([^"]*cid=(\d+)[^"]*)"')
TITLE = re.compile(r"<h[34][^>]*>(.*?)</h[34]>", re.S)


def pages(argv: list) -> list:
    os.chdir(REPO)
    files = [a for a in argv if not a.startswith("--")]
    if files:
        return files
    out = []
    for p in PAGES:
        out += glob.glob(p)
    return sorted(out)


def card_of(html: str, pos: int):
    """这张图属于哪家店：往后找最近的地图链接（cid），拿不到就用卡片标题。

    往「后」找是因为手册的卡片一律是「图在上、店名与地图按钮在下」。
    回传 (查询字符串, 人看得懂的名字)；两者都拿不到回传 (None, None)。
    """
    tail = html[pos:pos + 6000]
    m = CID.search(tail)
    name = None
    t = TITLE.search(tail)
    if t:
        name = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t.group(1))).strip()[:40]
    if m:
        return m.group(1).replace("&amp;", "&"), name or ("cid=" + m.group(2))
    if name:
        return name, name
    return None, None


def fetch(queries: list) -> dict:
    """跑抓图器，回传 {查询: [候选网址]}。只能在 CI 跑（沙盒连不上 Google）。"""
    env = dict(os.environ, QUERIES="|".join(queries), WANT=str(WANT))
    proc = subprocess.run(["node", "tools/fetch-photos.mjs"],
                          capture_output=True, text=True, env=env, cwd=REPO)
    out = {}
    for line in proc.stdout.splitlines():
        if not line.startswith("RESULT "):
            continue
        j = json.loads(line[7:])
        # 只要长效格式：place-photos 那种带签名的链接约一个月就过期，
        # 拿它补图等于把同一个坑再挖一次（2026-09-18 槟城整本就是这么破的）
        out[j["query"]] = [u for u in j.get("urls", []) if "/gps-cs-s/" in u]
    if proc.returncode != 0 and not out:
        print("  ⚠ 抓图器没有产出：", (proc.stderr or proc.stdout)[-400:])
    return out


def main() -> int:
    dry = "--dry-run" in sys.argv
    targets = pages(sys.argv[1:])
    if not targets:
        print("没有要处理的文件")
        return 1

    grand_dead = grand_fixed = 0
    for path in targets:
        html = open(path, encoding="utf-8").read()
        imgs = [(m.group(1).replace("&amp;", "&"), m.start()) for m in IMG_LINE.finditer(html)]
        if not imgs:
            continue
        dead = []
        for url, pos in imgs:
            alive, why = check_images.probe(url, "图片")
            if not alive:
                dead.append((url, pos, why))
        if not dead:
            print(f"{path}：{len(imgs)} 张图全部正常")
            continue
        grand_dead += len(dead)
        print(f"{path}：{len(imgs)} 张图里有 {len(dead)} 张失效")

        # 对照组：一次死掉大半，通常不是图真的全过期，而是 Google 把这台机器挡了
        # （沙盒 100% 会这样，CI 偶尔也会）。没有对照组就直接换的话，等于把一整本
        # 手册的好图换掉。所以先抓一张**刚出炉**的图来探：新图也打不开 → 是这台
        # 机器的问题，整轮罢工；新图打得开 → 那是真的成批过期，照常补。
        if len(dead) > len(imgs) * 0.5:
            probe_q, _ = card_of(html, dead[0][1])
            fresh_probe = fetch([probe_q]).get(probe_q, []) if probe_q else []
            if not fresh_probe:
                print("  ⚠ 失效过半，且抓不到任何新图——判定是这台机器连不上 Google，"
                      "本轮不动任何文件")
                return 0
            alive, why = check_images.probe(fresh_probe[0], "图片")
            if not alive:
                print(f"  ⚠ 失效过半，但刚抓的新图同样打不开（{why}）——"
                      f"判定是这台机器被挡，本轮不动任何文件")
                return 0
            print("  · 失效过半，但新抓的图打得开：确认是成批过期，继续补")

        # 按店归类。同一家店死了好几张，只抓一次。
        by_query = {}
        for url, pos, why in dead:
            q, name = card_of(html, pos)
            line = html.count("\n", 0, pos) + 1
            if not q:
                print(f"  · 第 {line} 行的图找不到所属店家（没有地图链接也没有标题），跳过")
                continue
            by_query.setdefault(q, {"name": name, "items": []})["items"].append((url, line, why))
        if not by_query:
            continue
        if dry:
            for q, info in by_query.items():
                print(f"  · {info['name']}：要补 {len(info['items'])} 张")
            continue

        fresh = fetch(list(by_query))
        for q, info in by_query.items():
            cands = [u for u in fresh.get(q, []) if u not in html]   # 别补成同页重复图
            need = info["items"]
            if len(cands) < len(need):
                print(f"  ✗ {info['name']}：要补 {len(need)} 张，只抓到 {len(cands)} 张可用，"
                      f"这家先留着不动")
                continue
            for (url, line, why), new in zip(need, cands):
                html = html.replace(url, new)
                grand_fixed += 1
                print(f"  ✓ {info['name']} 第 {line} 行（{why}）已换新图")
        open(path, "w", encoding="utf-8").write(html)

    print(f"\n合计：失效 {grand_dead} 张，补上 {grand_fixed} 张")
    if grand_dead and grand_fixed < grand_dead:
        print("有补不上的——通常是那家店在 Google 上照片本来就少，需要人工换卡片或换地点。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
