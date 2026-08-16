#!/usr/bin/env python3
"""新闻抓取与翻译的自检。跑法：python3 tools/check-news.py

不碰网络：把 requests 与 feedparser 都换成假的，所以 CI 与沙盒都跑得动
（真的 RSS 与 Agnes 沙盒都连不上，见 CLAUDE.md）。

守的是四件事，每件都真的出过：

1. **位置不错位**——这是最危险的一条。译文按编号回填，某一批失败时后面几批的译文
   绝不能往前挪去补空位，否则 A 公司的消息会安到 B 公司头上。金融页面上这种错
   比没有译文严重得多。
2. **一批失败不拖垮其他批**——2026-08-16 上线时一次送 40 条，Agnes 60 秒没回，
   整批超时作废，167 条新闻一条译文都没有。分批之后失败只损失那一批。
3. **失败要说得出原因**——`translate_note` 会写进 news.json。CI 日志 API 的 tail
   取不到中段步骤的输出（实测两次都够不着），所以诊断必须跟着产出走。
4. **跨区块去重**——同一篇文章常同时挂在好几檔的 RSS 上，也常同时进宏观与个股。
   首版只在 macro/crypto 各自内部去重，页面上「NiSource」在 GOOGL 与 AMZN 底下
   各出现一次、巴菲特那条在宏观与 KO 底下各一次，看起来像灌水。
   这条 fixture 测不出来（假数据不会自然重复），是拿真实产出的页面截图看出来的。
"""
import os
import sys
import json
import types

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, ".github", "scripts"))

fails = []
oks = []


def ok(name, cond, got=None):
    if cond:
        oks.append(name)
        print(f"  ✅ {name}")
    else:
        fails.append(name)
        print(f"  ❌ {name} —— 实际: {got!r}")


def install_fakes(fail_on=()):
    """假的 requests：fail_on 里的批次序号会抛异常，其余正常回。"""
    calls = {"n": 0, "sizes": [], "timeouts": []}
    fake = types.ModuleType("requests")

    class Resp:
        def __init__(self, payload):
            self._p = payload

        def raise_for_status(self):
            pass

        def json(self):
            return self._p

    def post(url, headers=None, json=None, timeout=None):
        calls["n"] += 1
        calls["timeouts"].append(timeout)
        content = json["messages"][0]["content"]
        # 提示词与标题之间隔一个空行，取最后那一段来数，才不会被前言里的编号行干扰
        body = content.strip().split("\n\n")[-1]
        n = len([l for l in body.split("\n") if l.strip()])
        calls["sizes"].append(n)
        if calls["n"] in fail_on:
            raise Exception("Read timed out")
        body = "\n".join(f"{i + 1}. 译文{i + 1}" for i in range(n))
        return Resp({"choices": [{"message": {"content": body}}]})

    fake.post = post
    sys.modules["requests"] = fake
    sys.modules.setdefault("feedparser", types.ModuleType("feedparser"))
    return calls


def check_dedupe(fn):
    """跑一次完整的 main()，用假 RSS 制造「同一篇文章挂在多处」的真实情况。"""
    import tempfile

    # 这一篇会同时出现在宏观、加密与两檔个股底下——正是页面上那个重复的成因
    SHARED = "Shared headline everyone carries"

    class Entry(dict):
        __getattr__ = dict.get

    def fake_parse(url):
        entries = [{"title": SHARED, "link": "u0", "summary": "", "published_parsed": None}]
        # 每个源再各带一条自己独有的
        tag = url[-24:]
        entries.append({"title": f"Unique for {tag}", "link": "u1", "summary": "",
                        "published_parsed": None})
        return types.SimpleNamespace(entries=[Entry(e) for e in entries])

    fn.feedparser.parse = fake_parse
    fn.AGNES_KEY = ""          # 这组不测翻译

    with tempfile.NamedTemporaryFile("w+", suffix=".json", delete=False) as f:
        tmp = f.name
    orig_out = fn.OUT
    fn.OUT = tmp
    try:
        fn.main()
        data = json.load(open(tmp, encoding="utf-8"))
    finally:
        fn.OUT = orig_out
        os.unlink(tmp)

    ids = ([i["id"] for i in data["macro"]] + [i["id"] for i in data["crypto"]] +
           [i["id"] for items in data["by_symbol"].values() for i in items])
    ok("全部条目的 id 互不重复", len(ids) == len(set(ids)),
       f"{len(ids)} 条里只有 {len(set(ids))} 个不同 id")

    shared_count = sum(1 for i in (data["macro"] + data["crypto"] +
                                   [x for v in data["by_symbol"].values() for x in v])
                       if i["title"] == SHARED)
    ok("被多个源同时携带的那篇只留一次", shared_count == 1, shared_count)
    ok("去重后仍有个股新闻（没把整个区块清空）",
       len(data["by_symbol"]) > 0, len(data["by_symbol"]))
    ok("by_symbol 里不留空清单",
       all(len(v) > 0 for v in data["by_symbol"].values()), data["by_symbol"])


def main():
    os.environ["AGNES_API_KEY"] = "test-key"
    calls = install_fakes(fail_on={2})
    import fetch_news as fn
    fn.AGNES_KEY = "test-key"

    titles = [f"Headline {i}" for i in range(30)]

    print("【1】分批：30 条 / 每批 12 → 3 批")
    zh, note = fn.translate_all(titles)
    ok("批次数正确", calls["n"] == 3, calls["n"])
    ok("每批不超过 TRANSLATE_BATCH",
       all(s <= fn.TRANSLATE_BATCH for s in calls["sizes"]), calls["sizes"])
    ok("单批超时用的是 TRANSLATE_TIMEOUT",
       all(t == fn.TRANSLATE_TIMEOUT for t in calls["timeouts"]), calls["timeouts"])

    print("【2】一批失败只损失那一批")
    got = sum(1 for t in (zh or []) if t)
    ok("第 2 批失败后仍翻出 18 条", got == 18, got)
    ok("说明里写出翻了几条", note and "18/30" in note, note)
    ok("说明里写出有批次失败", note and "失败" in note, note)

    print("【3】位置绝不错位（最危险的一条）")
    ok("第 1 批就位", bool(zh[0]) and bool(zh[11]), (zh[0], zh[11]))
    ok("失败那批留空，不被后面的译文顶上",
       zh[12] is None and zh[23] is None, (zh[12], zh[23]))
    ok("第 3 批回到自己的位置", bool(zh[24]) and bool(zh[29]), (zh[24], zh[29]))
    ok("译文总数与留空数加起来等于原条数", len(zh) == len(titles), len(zh))

    print("【4】条数对不上的批要整批放弃，不硬凑")
    # 注意：fetch_news 在 import 时就绑定了当时那个 requests 模块对象，
    # 之后替换 sys.modules["requests"] 对它无效——要直接改 fn.requests。
    orig_post = fn.requests.post

    def short_post(url, headers=None, json=None, timeout=None):
        class R:
            def raise_for_status(self_):
                pass

            def json(self_):
                return {"choices": [{"message": {"content": "1. 只有这一条"}}]}
        return R()
    fn.requests.post = short_post
    got2, err2 = fn.translate_batch(["a"] * 12)
    ok("回传条数不足时整批放弃", got2 is None, got2)
    ok("并说明原因是条数对不上", err2 and "条数对不上" in err2, err2)
    fn.requests.post = orig_post

    print("【5】没有 key 时不编译文、且说得出为什么")
    fn.AGNES_KEY = ""
    zh3, note3 = fn.translate_all(titles)
    ok("不回任何译文", zh3 is None, zh3)
    ok("说明指出缺 key", note3 and "AGNES_API_KEY" in note3, note3)

    print("【6】读可选 secret 不能被空字串坑到")
    src = open(os.path.join(BASE, ".github", "scripts", "fetch_news.py"),
               encoding="utf-8").read()
    # 空 secret 会被注入成 ""，os.environ.get(k, 预设值) 拿不到预设值
    ok("AGNES_BASE 用 `.strip() or 预设值` 而不是 get 的第二参数",
       'os.environ.get("AGNES_BASE_URL", "").strip()' in src, None)
    ok("AGNES_MODEL 同样处理",
       'os.environ.get("AGNES_MODEL", "").strip()' in src, None)

    print("【7】跨区块去重：一条新闻只能出现在一个地方")
    check_dedupe(fn)

    print(f"\n通过 {len(oks)} 项")
    if fails:
        print(f"未通过 {len(fails)} 项：", file=sys.stderr)
        for f in fails:
            print("  ✗ " + f, file=sys.stderr)
        return 1
    print("新闻抓取与翻译自检全部通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
