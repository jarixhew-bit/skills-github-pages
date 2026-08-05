#!/usr/bin/env python3
"""用 Agnes 生成账户点评，写回加密数据（data-private.enc / state.enc）。

在 analyzer.py 之后运行：analyzer 负责算数字，本脚本只负责把数字翻成一段人话。

供应商：Agnes（OpenAI 兼容接口），跟 butler-bot 与记帐工具用的是同一家、同一把 key。
2026-08-05 最初接的是 Gemini 免费档，当天连踩模型名 404、思考 token 把正文截断、
免费额度 429 三个坑（细节见 .claude/notes/trading.md），用户决定直接换成 Agnes。

三条设计底线：
1. **每天只生成一次**。管线每小时跑一次，但 80/20 长期再平衡的账户一天内没有新东西
   可说，每小时调用纯属浪费额度。state 里已有当天日期就直接跳过。
2. **失败一律不阻断**。缺 AGNES_API_KEY、网络不通、模型返回异常，全都 exit 0 并保留
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

# Agnes 的默认接口与模型，与 butler-bot 保持一致（正本在 butler-bot 的 src/ai.js，
# 那边写着：2.x-flash 是 text+vision 模型走 /chat/completions；别用 agnes-image-2.x-flash，
# 那是文字生成图片的）。想换模型/换站点填 AGNES_MODEL、AGNES_BASE_URL 两个 secret，不用改代码。
# 注意：Agnes 分 .cn / .com 两个站，key 不通用，打错站会报「无效的令牌」——看起来像
# key 错了，其实是站点错了（butler-bot 踩过同款坑）。
AGNES_DEFAULT_BASE = "https://apihub.agnes-ai.com/v1"
AGNES_DEFAULT_MODEL = "agnes-2.5-flash"

SYSTEM_PROMPT = """你在为一位长期投资者写他自己账户的每日点评，直接给他本人看。

他的策略（不要质疑、不要改变它）：VOO 与 IBIT 按 80/20 长期持有并再平衡，20 年期限，
不做择时，不看技术指标决定买卖，只看「实际配置离目标差多少」来决定补哪个。

写作要求：
- 用简体中文写 3 到 5 句话，一段，不分点、不加标题、不要 markdown。
- 先说账户当前状态，再说配置偏离情况，最后一句说该做什么（或不该做什么）。
- **只能使用用户给你的「事实」里出现的数字，必须原样照抄，禁止四舍五入、禁止自己计算
  新数字、禁止编造任何金额或百分比**。宁可少说一个数字，也不要写一个事实里没有的数字。
- 不要提及任何外部新闻、行情预测或你不掌握的信息。
- 语气像一位熟悉他策略的朋友，平实、不夸张、不喊口号。
- 必须把话说完整，最后一句要有句号。"""

USER_PROMPT = "以下是今天的事实（JSON），据此写点评：\n"


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


def call_agnes(facts, api_key, timeout=60):
    """调 Agnes（OpenAI 兼容的 /chat/completions）要一段点评。

    只做一次调用、不做模型轮换：Agnes 的模型名由 butler-bot 那边确定并共用，
    不像 Gemini 那样会自己改名换代。
    """
    import requests

    base = os.environ.get("AGNES_BASE_URL", "").strip() or AGNES_DEFAULT_BASE
    model = os.environ.get("AGNES_MODEL", "").strip() or AGNES_DEFAULT_MODEL
    base = base.rstrip("/")

    r = requests.post(
        f"{base}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": USER_PROMPT + json.dumps(facts, ensure_ascii=False, indent=1)},
            ],
            "temperature": 0.4,
            # 3-5 句中文用不了几百 token，给 800 留足余量；写不完会是 finish_reason=length
            "max_tokens": 800,
        },
        timeout=timeout,
    )
    if not r.ok:
        # 把服务端的原话带出来——「无效的令牌」多半是 key 打错了站（.cn / .com）
        raise RuntimeError(f"HTTP {r.status_code}：{r.text[:300]}")

    choice = r.json()["choices"][0]
    finish = choice.get("finish_reason")
    if finish and finish != "stop":
        raise RuntimeError(f"模型未正常写完（finish_reason={finish}），丢弃避免出现半句话")
    text = ((choice.get("message") or {}).get("content") or "").strip()
    print(f"[ai_note] 使用 {model} @ {base}")
    return text


def main():
    password = os.environ.get("ANALYZER_PW", "").strip()
    api_key = os.environ.get("AGNES_API_KEY", "").strip()
    if not password:
        print("[ai_note] 无 ANALYZER_PW，跳过")
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

    def write_back():
        with open(PRIV, "w", encoding="utf-8") as f:
            f.write(encrypt_json(private, password))
        with open(STATE, "w", encoding="utf-8") as f:
            f.write(encrypt_json(state, password))

    def set_note(text, date, nav):
        for blob in (state, private):
            blob["ai_note"] = text
            blob["ai_note_date"] = date
            blob["ai_note_nav"] = nav

    # 先体检已存的点评：坏的一律清掉，哪怕这次生成不出新的。
    # 页面上挂着一句半截话、还标着当天日期，比空着更误导——这正是 2026-08-05
    # 上线当天发生的事（「你的账户总净值为1」被截断后照样显示成最新内容）。
    # 这一步排在「有没有密钥」之前：没密钥也要清，否则坏点评会一直挂着
    old = state.get("ai_note")
    if old and incomplete_reason(old):
        print(f"[ai_note] 已存的点评不合格（{incomplete_reason(old)}），清除")
        set_note(None, None, None)
        write_back()

    if not api_key:
        print("[ai_note] 无 AGNES_API_KEY，跳过生成（保留现有点评）")
        return 0

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # AI_NOTE_FORCE：手动触发 workflow 时勾选，用来重写当天已生成但不满意的点评
    force = os.environ.get("AI_NOTE_FORCE", "").strip().lower() not in ("", "0", "false")
    if state.get("ai_note_date") == today and not force:
        print(f"[ai_note] 今天（{today}）已生成过，跳过")
        return 0

    facts = build_facts(private, state, public)
    try:
        text = call_agnes(facts, api_key)
    except Exception as e:
        print(f"[ai_note] 调用失败，保留现有点评：{e}")
        print("[ai_note] 排查顺序：(1) 报「无效的令牌」= key 打错站，Agnes 分 .cn/.com，"
              "记帐工具里用的是哪把就用哪把；(2) 429 = 额度用尽，等下一次运行自己重试；"
              "(3) 模型名不认 = 填 AGNES_MODEL secret 覆盖")
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

    set_note(text, today, (private.get("account") or {}).get("net_liq"))
    write_back()
    print(f"[ai_note] 已生成（{len(text)} 字）：{text[:60]}...")
    return 0


if __name__ == "__main__":
    sys.exit(main())
