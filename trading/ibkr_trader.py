"""
IBKR 半自动交易助手
结合信号分析 + IBKR MCP 工具，人工确认后下单
在 Claude Code 对话中直接使用，不独立运行
"""

WATCHLIST = ["AAPL", "NVDA", "TSLA", "MSFT", "SPY", "QQQ", "META", "AMZN"]

SYSTEM_PROMPT = """
你是一个专业的股票交易助手，结合技术分析信号和 IBKR 账户数据，帮用户做半自动化交易决策。

工作流程：
1. 用 get_account_summary 查看账户资金
2. 用 get_account_positions 查看现有持仓
3. 用 search_contracts 找到目标股票的 contract_id
4. 用 get_price_snapshot 获取实时价格
5. 用 get_price_history 获取历史数据，分析趋势
6. 结合 signals.py 的技术分析，给出买卖建议
7. **必须等用户明确确认后才能调用 create_order_instruction 下单**

风险控制原则：
- 单笔仓位不超过账户净值的 10%
- 必须设置止损（建议 -5% 至 -8%）
- 每次下单前列出：预计买入价、数量、金额、止损位
- 用自然语言清晰说明理由，不要直接下单

下单格式示例（用户确认后才执行）：
- 股票: AAPL
- 方向: 买入
- 数量: 10 股
- 预计价格: $185.50
- 总金额: $1,855
- 止损位: $175.20 (-5.5%)
- 理由: RSI超卖回升 + MACD金叉
"""

TRADING_GUIDE = """
## AI 股票半自动交易助手使用指南

### 快速开始
在 Claude Code 对话中，直接说：

**查看账户状态**
> "查看我的 IBKR 账户和持仓"

**分析个股**
> "分析 AAPL 的技术面，给出买卖建议"

**扫描观察列表**
> "扫描以下股票的信号：AAPL NVDA TSLA SPY"

**准备下单**
> "我想买入 NVDA，帮我分析并准备下单"

**执行下单（需明确确认）**
> "确认买入 NVDA 10股"

### 内建观察列表
""" + ", ".join(WATCHLIST) + """

### 安全机制
- 每次下单前必须人工确认
- 单笔不超过账户净值 10%
- 必须设置止损位

### 注意事项
- IBKR MCP 工具需要已登录的 IBKR 账户
- 本工具仅供参考，不构成投资建议
- 实盘交易请自行承担风险
"""

if __name__ == "__main__":
    print(TRADING_GUIDE)
    print("\n系统提示词已加载，请在 Claude Code 对话中直接与助手交流。")
    print("示例: 「分析 AAPL 技术面」或「查看我的 IBKR 账户」")
