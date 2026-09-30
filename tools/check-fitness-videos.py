#!/usr/bin/env python3
"""减脂训练 App（fitness/）的真人示范影片体检。**只能在 CI 跑**（沙盒连不上 YouTube）。

为什么要有（2026-09-30）：App 里每个动作嵌一段别人的 YouTube 教学影片来示范。
影片不是我们的——作者删片、改成私人、关掉「允许嵌入」，App 里那一格就会变成
「影片无法播放」，而且没有任何报错，只有打开的人看得到。所以每周验一次。

判定用 YouTube 的 oEmbed 接口（不需要金钥）：
  200 → 存在且允许嵌入；401 → 作者关了嵌入；404/400 → 删了或私人。

两种跑法：
  python3 tools/check-fitness-videos.py            # 体检：每个动作「正在用的」那支（清单第一支）
  python3 tools/check-fitness-videos.py --report   # 选片用：所有候选都验，并把每支影片
        # YouTube 自动截的三格画面（约 25%/50%/75% 处）拼成对照图，写进 .photos/videos/，
        # 由 workflow 提交回触发分支，给 Claude 亲眼看「影片里到底在做什么动作」。
退出码：0 = 全部可用；1 = 有失效（体检模式）。
"""
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "fitness", "videos.json")
UA = {"User-Agent": "Mozilla/5.0 (fitness-video-check)"}


def oembed(vid):
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/watch?v={vid}")
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
            d = json.load(r)
            return "ok", d.get("title", ""), d.get("author_name", "")
    except urllib.error.HTTPError as e:
        return {401: "embed-off", 403: "embed-off", 404: "gone", 400: "gone"}.get(e.code, f"http{e.code}"), "", ""
    except Exception as e:  # 网络抖动：算失败但写清楚原因，不假装没事
        return f"error:{type(e).__name__}", "", ""


def fetch(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
            return r.read()
    except Exception:
        return None


def report(data):
    from PIL import Image, ImageDraw, ImageFont
    out = os.path.join(ROOT, ".photos", "videos")
    os.makedirs(out, exist_ok=True)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
    except Exception:
        font = ImageFont.load_default()
    lines, rows = [], []
    for key, cands in data["videos"].items():
        for i, c in enumerate(cands):
            vid = c.get("id")
            if not vid:
                lines.append(f"{key}\t#{i}\t-\tNONE\t\t")
                continue
            st, title, author = oembed(vid)
            lines.append(f"{key}\t#{i}\t{vid}\t{st}\t{author}\t{title}")
            frames = []
            for n in (1, 2, 3):
                raw = fetch(f"https://i.ytimg.com/vi/{vid}/hq{n}.jpg")
                try:
                    im = Image.open(io.BytesIO(raw)).convert("RGB") if raw else None
                except Exception:
                    im = None
                frames.append(im)
            rows.append((f"{key} #{i} [{st}] {vid} | {author} | {title}"[:120], frames))
    # 每张对照图放 12 行（每行一支影片、三格画面），方便一张一张看
    W, H, LAB = 240, 180, 22
    for p in range(0, len(rows), 12):
        chunk = rows[p:p + 12]
        sheet = Image.new("RGB", (W * 3, (H + LAB) * len(chunk)), "white")
        d = ImageDraw.Draw(sheet)
        for r, (label, frames) in enumerate(chunk):
            y = r * (H + LAB)
            d.text((4, y + 3), label, fill="black", font=font)
            for k, im in enumerate(frames):
                if im is None:
                    d.rectangle([k * W, y + LAB, k * W + W - 1, y + LAB + H - 1], fill="#ddd")
                    continue
                im = im.copy(); im.thumbnail((W, H))
                sheet.paste(im, (k * W + (W - im.width) // 2, y + LAB + (H - im.height) // 2))
        sheet.save(os.path.join(out, f"sheet-{p // 12 + 1:02d}.jpg"), "JPEG", quality=72)
    with open(os.path.join(out, "report.tsv"), "w", encoding="utf-8") as f:
        f.write("key\tcand\tid\tstatus\tchannel\ttitle\n" + "\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0


def check(data):
    bad = []
    for key, cands in data["videos"].items():
        c = next((c for c in cands if c.get("id")), None)
        if not c:
            continue  # 这个动作本来就没有影片（用照片／3D），不算失效
        st, title, author = oembed(c["id"])
        print(f"{'✓' if st == 'ok' else '✗'} {key}: {c['id']} {st} {author} {title}")
        if st != "ok":
            bad.append(f"{key}（{c['id']}：{st}）")
    if bad:
        print(f"\n失效 {len(bad)} 支：" + "、".join(bad))
        print("处理：跟 Claude 说「修一下健身 App 失效的影片」——它会从 videos.json 的备选里换一支，或重新找。")
        return 1
    print("\n通过：健身 App 正在用的示范影片全部能播放")
    return 0


if __name__ == "__main__":
    data = json.load(open(SRC, encoding="utf-8"))
    sys.exit(report(data) if "--report" in sys.argv else check(data))
