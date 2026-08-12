#!/usr/bin/env python3
"""验证早报真的读得懂 trading-daily 写的持仓底数。

为什么需要（2026-08-12 建，当场就抓到一个 bug）：
早报改成不再自己打 IBKR Flex，改读 analyzer.py 加密提交的 trading/state.enc。
两个文件各自实作一份解密，第一版就分岔了——analyzer 用 300_000 次 PBKDF2 迭代，
早报照记忆写了 200_000，解不开。

而**失败的表现极其安静**：早报会默默改用 fallback 底数，照常发出一封看起来
正常的早报，只是持仓数字是旧的。跟「一切正常」几乎分不出来。
所以这一层必须有机器守着。

做法：用 analyzer.py 真正的加密函数造一份 state.enc，再用早报真正的解密函数
去读，比对拿到的持仓与写进去的一致。两边都是**从源文件抽出来的真代码**，
不是复制一份来测——复制一份就会跟着分岔，等于没测。

跑法：python3 tools/check-morning-positions.py
退出码：0 = 读得懂且数字对得上；1 = 读不懂或对不上。
"""
import ast
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANALYZER = os.path.join(ROOT, "trading", "analyzer.py")
MORNING = os.path.join(ROOT, ".github", "scripts", "portfolio_news.py")

PW = "自检用的密码-not-a-real-secret"
SAMPLE = [
    {"symbol": "VOO", "qty": 114.1816, "avg_price": 512.34},
    {"symbol": "IBIT", "qty": 407.5694, "avg_price": 61.2},
    {"symbol": "SGOV", "qty": 32.6428, "avg_price": 100.41},
]


def load_funcs(path, names, extra=None):
    """从源文件里抽出指定的顶层函数/赋值，在乾净的命名空间里执行。

    直接 import 不行：这两个文件都有模块级主流程，一 import 就会真的去发早报。
    但也不能把代码复制进本檔——复制品不会跟着源文件改，测了等于没测。
    所以用 AST 只挑出要的那几个节点，执行的是**源文件里的真代码**。
    """
    tree = ast.parse(open(path, encoding="utf-8").read())
    ns = dict(extra or {})
    ns["__file__"] = path

    imports, keep = [], []
    for node in tree.body:
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            imports.append(node)
        elif isinstance(node, ast.FunctionDef) and node.name in names:
            keep.append(node)
        elif isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id in names for t in node.targets):
            keep.append(node)

    # import 一条一条来、失败就跳过：早报顶部会 import feedparser/yfinance，
    # 但要测的那两个函数只用到标准库＋cryptography。整批 exec 会因为缺一个
    # 第三方套件就全灭，等于这个检查在 CI 上永远跑不起来。
    for node in imports:
        try:
            exec(compile(ast.Module(body=[node], type_ignores=[]), path, "exec"), ns)
        except ImportError:
            pass

    exec(compile(ast.Module(body=keep, type_ignores=[]), path, "exec"), ns)  # 真代码，非复制
    return ns


def main():
    for p in (ANALYZER, MORNING):
        if not os.path.exists(p):
            print(f"不通过：找不到 {p}")
            return 1

    # 1) 用 analyzer 真正的加密函数造一份 state.enc
    try:
        a = load_funcs(ANALYZER, {"encrypt_json", "_derive_key", "PBKDF2_ITER"})
        envelope = a["encrypt_json"]({"positions": SAMPLE, "cash": 1679.53}, PW)
    except Exception as e:
        print(f"不通过：用 analyzer 的 encrypt_json 加密失败 —— {type(e).__name__}: {e}")
        return 1
    print(f"  · analyzer 加密完成（iter={json.loads(envelope).get('iter')}）")

    # 2) 摆成早报期待的目录结构：<root>/trading/state.enc，脚本在 <root>/.github/scripts/
    with tempfile.TemporaryDirectory() as d:
        os.makedirs(os.path.join(d, "trading"))
        os.makedirs(os.path.join(d, ".github", "scripts"))
        with open(os.path.join(d, "trading", "state.enc"), "w", encoding="utf-8") as f:
            f.write(envelope)
        fake_script = os.path.join(d, ".github", "scripts", "portfolio_news.py")

        m = load_funcs(MORNING, {"_derive_key", "fetch_ibkr_positions"},
                       extra={"ANALYZER_PW": PW})
        m["__file__"] = fake_script          # 让它算出临时目录里的 state.enc
        got, err = m["fetch_ibkr_positions"]()

    if got is None:
        print(f"\n不通过：早报读不懂 analyzer 写的 state.enc —— {err}")
        print("  最常见的原因是两边的 PBKDF2 参数分岔（早报应从 envelope 的 iter 字段读）。")
        return 1
    print(f"  · 早报解密成功，读到 {len(got)} 项持仓")

    # 3) 数字必须一模一样——解得开但数字错掉，比解不开更危险
    want = {p["symbol"]: (round(p["qty"], 4), round(p["avg_price"], 4)) for p in SAMPLE}
    bad = []
    for sym, (qty, cost) in want.items():
        if sym not in got:
            bad.append(f"{sym} 不见了")
        elif (got[sym]["qty"], got[sym]["cost"]) != (qty, cost):
            bad.append(f"{sym} 对不上：写进去 qty={qty} cost={cost}，"
                       f"读出来 qty={got[sym]['qty']} cost={got[sym]['cost']}")
    if bad:
        print("\n不通过：解开了但数字对不上")
        for b in bad:
            print(f"  ✗ {b}")
        return 1

    print(f"\n通过：{len(want)} 项持仓的股数与成本价都对得上")
    return 0


if __name__ == "__main__":
    sys.exit(main())
