#!/usr/bin/env python3
"""用 Gemini 免费档生成账户点评，写回加密数据（data-private.enc / state.enc）。

在 analyzer.py 之后运行：analyzer 负责算数字，本脚本只负责把数字翻成一段人话。

三条设计底线：
1. **每天只生成一次**。管线每小时跑一次，但 80/20 长期再平衡的账户一天内没有新东西
   可说，每小时调用纯属浪费免费额度。state 里已有当天日期就直接跳过。
2. **失败一律不阻断**。缺 GEMINI_API_KEY、网络不通、模型返回异常，全都 exit 0 并保留
   旧点评——页面已有过期标灰机制（index.html），旧点评不会伪装成最新的。
3. **数字防编造**。模型输出里凡是带小数点或 >=1000 的数字，都必须能在喂进去的事实里
   原样找到，否则整段丢弃。2026-07-14 与 08-04 两次事故都是「页面上出现一个错误金额」
   导致用户不再信任账目，宁可当天没有新点评，也不能让 LLM 编一个金额出来。
"""
import json
import os
import re
import sys
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
from analyzer import decrypt_json, encrypt_json  # noqa: E402  加解密只此一处实现

PRIV = os.path.join(BASE, "data-private.enc")
STATE = os.path.join(BASE, "state.enc")
PUBLIC = os.path.join(BASE, "data-public.json")

API_ROOT = "https://generativelanguage.googleapis.com/v1beta"
# 偏好顺序：免费档额度最宽松的 flash 系列优先。写死单一模型名会踩 404——
# Google 的模型命名换得勤（2026-08-05 首次上线时 gemini-2.5-flash 就对本密钥返回 404），
# 所以改成每次先问 ListModels 有哪些可用，名字变了也不用改代码。
MODEL_PREFS = ("gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash")

PROMPT = """你在为一位长期投资者写他自己账户的每日点评，直接给他本人看。

他的策略（不要质疑、不要改变它）：VOO 与 IBIT 按 80/20 长期持有并再平衡，20 年期限，
不做择时，不看技术指标决定买卖，只看「实际配置离目标差多少」来决定补哪个。

写作要求：
- 用简体中文写 3 到 5 句话，一段，不分点、不加标题。
- 先说账户当前状态，再说配置偏离情况，最后一句说该做什么（或不该做什么）。
- **只能使用下面「事实」里出现的数字，必须原样照抄，禁止四舍五入、禁止自己计算新数字、
  禁止编造任何金额或百分比**。宁可少说一个数字，也不要写一个事实里没有的数字。
- 不要提及任何外部新闻、行情预测或你不掌握的信息。
- 语气像一位熟悉他策略的朋友，平实、不夸张、不喊口号。

事实（JSON）：
"""


def build_facts(private, state, public):
    """挑出点评需要的事实。只送必要字段，不把整个持仓档案发给外部服务。"""
    by_symbol = {t["symbol"]: t for t in public.get("tickers", [])}
    positions = []
    for p in private.get("positions", []):
        sig = p.get("signal") or {}
        pub = by_symbol.get(p["symbol"], {})
        positions.append({
            "标的": p["symbol"],
            "股数": p.get("qty"),
            "成本价": p.get("avg_price"),
            "现价": p.get("price"),
            "市值": p.get("value"),
            "浮动盈亏百分比": p.get("upct"),
            "占组合比例": p.get("weight"),
            "今日涨跌百分比": pub.get("chg1d"),
            "距52周高点百分比": sig.get("from_52w_high"),
        })
    acct = private.get("account") or {}
    return {
        "日期": (private.get("generated_at") or "")[:10],
        "净值": acct.get("net_liq"),
        "现金": acct.get("cash"),
        "现金占比": acct.get("cash_pct"),
        "收益率百分比": private.get("perf") or {},
        "目标配置": state.get("targets"),
        "持仓": positions,
        "系统已算出的操作提示": private.get("actions") or [],
    }


NUM_RE = re.compile(r"-?\d[\d,]*(?:\.\d+)?")


def _variants(x):
    """一个数字在文字里可能出现的写法，全部收进白名单。"""
    out = set()
    for v in (x, -x if x else x):
        for s in (repr(v), f"{v:.2f}", f"{v:.1f}", f"{v:.0f}"):
            s = s.rstrip("0").rstrip(".") if "." in s else s
            out.add(s.lstrip("-") or "0")
    return out


def allowed_numbers(facts):
    """递归收集事实里所有数字（含常见写法变体）。"""
    allowed = set()

    def walk(node):
        if isinstance(node, dict):
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
        elif isinstance(node, bool):
            pass
        elif isinstance(node, (int, float)):
            allowed.update(_variants(float(node)))
        elif isinstance(node, str):
            # actions 里的金额是字符串形式（如「补齐约需 $5,314」），一并收进来
            for m in NUM_RE.findall(node):
                try:
                    allowed.update(_variants(float(m.replace(",", ""))))
                except ValueError:
                    pass

    walk(facts)
    return allowed


def incomplete_reason(text):
    """点评是否像一段写完的话；不是就回一句原因，是就回 None。

    2026-08-05 首次真实生成写出「截至2026-08-05，你的账户总净值为1」就挂上了页面
    （思考 token 吃光输出预算被截断）。半句话比没有更糟——它带着当天日期，
    看起来像是最新的正常内容。
    """
    if len(text) < 60:
        return f"内容过短（{len(text)} 字，正常 3-5 句应在 60 字以上）"
    if text[-1] not in "。！？.!?":
        return f"结尾不是完整句子，疑似截断（结尾：…{text[-15:]}）"
    return None


def bad_numbers(text, allowed):
    """挑出文中「事实里没有」的数字。

    只严查带小数点或 >=1000 的数字——这类是金额与精确百分比，编错代价最大；
    100 以内的整数多是「差 5 个百分点」「20% 目标」这类措辞，放行以免误杀正常句子。
    """
    bad = []
    for tok in NUM_RE.findall(text):
        norm = tok.lstrip("-").replace(",", "")
        try:
            val = float(norm)
        except ValueError:
            continue
        risky = ("." in norm) or abs(val) >= 1000
        if not risky:
            continue
        canon = repr(val).rstrip("0").rstrip(".") if "." in repr(val) else repr(val)
        if canon not in allowed and norm not in allowed:
            bad.append(tok)
    return bad


def pick_model(api_key, timeout=15):
    """问 Google 这把密钥能用哪些模型，挑一个 flash。

    失败时回退到偏好列表第一个——总比不试强，反正外层会接住异常。
    """
    import requests

    r = requests.get(f"{API_ROOT}/models", params={"key": api_key}, timeout=timeout)
    r.raise_for_status()
    usable = [
        m["name"].split("/")[-1]
        for m in r.json().get("models", [])
        if "generateContent" in (m.get("supportedGenerationMethods") or [])
    ]
    for pref in MODEL_PREFS:
        if pref in usable:
            return pref
    # 偏好名都没有：退而求其次挑任意 flash（排除思考版，费额度且这活用不上）
    flash = [n for n in usable if "flash" in n and "thinking" not in n]
    if flash:
        return flash[0]
    if usable:
        return usable[0]
    raise RuntimeError("这把密钥没有任何支持 generateContent 的模型")


def call_gemini(facts, api_key, timeout=30):
    import requests

    model = pick_model(api_key)
    prompt = PROMPT + json.dumps(facts, ensure_ascii=False, indent=1)
    # 2.5 系列的「思考」token 也算进 maxOutputTokens，给 500 会让正文只剩几个字就被切断
    # （2026-08-05 首次生成就写出「你的账户总净值为1」这种半句话）。
    # 所以：额度给足 + 关掉思考（这活不需要）+ 下面按 finishReason 拒收截断结果。
    gen_cfg = {"temperature": 0.4, "maxOutputTokens": 2000, "thinkingConfig": {"thinkingBudget": 0}}

    def post(cfg):
        return requests.post(
            f"{API_ROOT}/models/{model}:generateContent",
            params={"key": api_key},
            json={"contents": [{"parts": [{"text": prompt}]}], "generationConfig": cfg},
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )

    r = post(gen_cfg)
    if r.status_code == 400:
        # 老模型不认 thinkingConfig，去掉重试一次
        gen_cfg.pop("thinkingConfig")
        r = post(gen_cfg)
    r.raise_for_status()

    cand = r.json()["candidates"][0]
    finish = cand.get("finishReason")
    if finish and finish != "STOP":
        raise RuntimeError(f"模型未正常写完（finishReason={finish}），丢弃避免出现半句话")
    text = "".join(p.get("text", "") for p in cand["content"]["parts"]).strip()
    print(f"[ai_note] 使用模型 {model}，finishReason={finish}")
    return text


def main():
    password = os.environ.get("ANALYZER_PW", "").strip()
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not password:
        print("[ai_note] 无 ANALYZER_PW，跳过")
        return 0
    if not api_key:
        print("[ai_note] 无 GEMINI_API_KEY，跳过（保留旧点评）")
        return 0
    if not (os.path.exists(PRIV) and os.path.exists(STATE)):
        print("[ai_note] 加密数据不存在，跳过")
        return 0

    try:
        private = decrypt_json(open(PRIV, encoding="utf-8").read(), password)
        state = decrypt_json(open(STATE, encoding="utf-8").read(), password)
        public = json.load(open(PUBLIC, encoding="utf-8"))
    except Exception as e:
        print(f"[ai_note] 读取失败，跳过：{e}")
        return 0

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # AI_NOTE_FORCE：手动触发 workflow 时勾选，用来重写当天已生成但不满意的点评
    force = os.environ.get("AI_NOTE_FORCE", "").strip().lower() not in ("", "0", "false")
    if state.get("ai_note_date") == today and not force:
        print(f"[ai_note] 今天（{today}）已生成过，跳过")
        return 0

    facts = build_facts(private, state, public)
    try:
        text = call_gemini(facts, api_key)
    except Exception as e:
        print(f"[ai_note] 调用失败，保留旧点评：{e}")
        # 把诊断信息直接打进日志，省得为了知道「密钥到底能用什么」再跑一轮
        try:
            import requests

            r = requests.get(f"{API_ROOT}/models", params={"key": api_key}, timeout=15)
            r.raise_for_status()
            names = [m["name"].split("/")[-1] for m in r.json().get("models", [])]
            print(f"[ai_note] 这把密钥可用的模型（前 20 个）：{names[:20]}")
        except Exception as e2:
            print(f"[ai_note] 连模型清单也拿不到：{e2}")
            print("[ai_note] 多半是密钥本身无效，或该 Google 项目没启用 Generative Language API")
        return 0

    text = " ".join(text.split())
    problem = incomplete_reason(text)
    if problem:
        print(f"[ai_note] {problem}，丢弃（保留旧点评）：{text[:60]!r}")
        return 0

    bad = bad_numbers(text, allowed_numbers(facts))
    if bad:
        print(f"[ai_note] 输出含事实中不存在的数字 {bad}，整段丢弃（保留旧点评）")
        return 0

    nav = (private.get("account") or {}).get("net_liq")
    for blob in (state, private):
        blob["ai_note"] = text
        blob["ai_note_date"] = today
        blob["ai_note_nav"] = nav
    with open(PRIV, "w", encoding="utf-8") as f:
        f.write(encrypt_json(private, password))
    with open(STATE, "w", encoding="utf-8") as f:
        f.write(encrypt_json(state, password))
    print(f"[ai_note] 已生成（{len(text)} 字）：{text[:60]}...")
    return 0


if __name__ == "__main__":
    sys.exit(main())
