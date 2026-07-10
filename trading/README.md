# 股票交易分析器 · 运行手册

页面：https://jarixhew-bit.github.io/skills-github-pages/trading/
密码：私有仓库 `jarixhew-bit/ai-vault` 的 `money/trading-analyzer.md`（本仓库公开，**密码与明文私密数据一律不入库**）。

## 架构（2026-07-10 定稿：日常零 Claude 消耗）

```
每个交易日 21:40 UTC · GitHub Actions（免费，不用 Claude）
  fetch_prices.py  Stooq/Yahoo 下载58只日线 → history/*.json（全量覆盖）
  flex_account.py  IBKR Flex Query 拉真实持仓/现金/NAV/成交（密钥在仓库 Secrets，失败不阻断）
  analyzer.py      信号+持仓重算+加仓建议 → data-public.json / data-private.enc / state.enc
  git push main    → GitHub Pages 自动发布

深度对账（用 Claude，仅两种时机：每月 1 日 Routine 自动 / 用户说「同步持仓」）
  作用：刷新 TWR 收益率基准（Flex 不提供 TWR）、写 AI 点评、核对台账
  从 IBKR MCP 转录 positions/summary/trades/perf 到 trading/raw/ → 跑 analyzer.py
  → 刷新持仓底数、现金、TWR 基准、交易台账，可附 ai_note.md 点评
```

- `state.enc`（加密）：持仓底数(数量/成本)、现金、TWR基准、交易台账、净值序列。
  日常模式用「底数 × 最新收盘价」重算市值盈亏，所以平时不碰 IBKR 也每天更新。
- 收益率：对账日取 IBKR 官方 TWR，之后按净值链式续算（两次对账间无出入金即准确）。
  **用户出入金或交易后需对账**，否则收益率和持仓会漂移。
- Actions 需要仓库 Secret `ANALYZER_PW`（= vault 里的密码）才能更新私密区；
  没有它公开信号区照常更新，私密区停在上次对账。
- `signals.py`/`backtest.py` 为旧原型，不在使用。

## 对账流程（Claude session 照此执行）

1. `git pull` main，建分支 `claude/trading-sync-YYYYMMDD`。
2. add_repo `jarixhew-bit/ai-vault` → 读 `money/trading-analyzer.md` 密码 → 写 `trading/raw/pw.txt`（raw/ 已 gitignore）。
3. 转录到 `trading/raw/`（JSON 原样照抄，数字一字不差）：
   - `positions.json` ← `get_account_positions`
   - `summary.json` ← `get_account_summary`
   - `trades.json` ← `get_account_trades(period="DAYS_30")`（台账按 trade_id 自动去重）
   - `perf.json` ← `get_pa_performance_all_periods` 各期 cps **最后一个值**：`{"1d":…,"7d":…,"mtd":…,"ytd":…}`（小数）
   - （可选）`ai_note.md`：3-5 句中文点评，进加密区
4. 若 cryptography 报缺 `_cffi_backend`：`pip3 install --user cffi`。
5. `python3 trading/analyzer.py --password-file trading/raw/pw.txt`，输出应含 `[sync]`；
   有 `[warnings]` 先排查（多为转录错误）再重跑。
6. read-back：解密 data-private.enc 抽一只持仓核对市值 ≈ 数量×现价。
7. commit（data-*.enc/json、state.enc）→ push → PR → squash merge → 删分支。

失败处理：IBKR MCP 不可用就告知用户改天再对账，不造数。同一步骤失败 2 次换方法，禁止第 3 次原样重试。

## 常见维护

- **加/删股票**：改 `universe.json`（contract_id 可为 null，仅备查），次日 Actions 自动补历史。
- **改密码**：新旧密码各跑一次迁移——用旧密码 `decrypt_json` 解出 state.enc，再用新密码 `encrypt_json`
  写回，重跑管线；同步更新 vault 密码文件和仓库 Secret `ANALYZER_PW`；页面重新输入即可。
- **信号/建议规则**：`analyzer.py` 的 `analyze_ticker()`（打分）、`build_add_suggestions()`（加仓）、
  `main()`（持仓提示），全中文注释。
- **Actions 挂了**：仓库 Actions 页看 trading-daily 日志；行情源失败>1/4 会整跑失败（防发布残缺数据）。

## 数据契约

- history bars：`["YYYY-MM-DD", o, h, l, c, v]` 升序，保留最近 320 根；
  OHLC 校验容差 0.1%（收盘集合竞价 vs 盘中序列的正常偏差）。
- 加密封装：PBKDF2-SHA256(30万次) + AES-256-GCM，`{v,kdf,iter,salt,nonce,ct}`（base64）。
- 已知事实：用户 2026-01-29 有约 $20k 入金（净值图跳涨是真实入金，不是错误）。
