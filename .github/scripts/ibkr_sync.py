"""Fetch IBKR account data via Claude API (IBKR MCP connector) and update ibkr-snapshot.json."""
import json
import os
import re
import sys
from datetime import datetime, timezone

import requests

api_key = os.environ.get("ANTHROPIC_API_KEY")
if not api_key:
    print("ERROR: ANTHROPIC_API_KEY not set")
    sys.exit(1)

PROMPT = """You have access to Interactive Brokers MCP tools.

Please call:
1. get_account_summary to fetch net liquidation value and metrics
2. get_account_balances to get cash and stock breakdown (USD row)

Return ONLY a JSON object with these exact fields (no markdown, no explanation):
{
  "netLiquidation": <number rounded to 2 decimals>,
  "currency": "USD",
  "cash": <number>,
  "stockValue": <number>,
  "unrealizedPnl": <number>,
  "updatedAt": "<ISO 8601 UTC timestamp>"
}"""

headers = {
    "Content-Type": "application/json",
    "x-api-key": api_key,
    "anthropic-version": "2023-06-01",
    # MCP connector requires this beta header
    "anthropic-beta": "mcp-client-2025-11-20",
}

payload = {
    "model": "claude-sonnet-4-6",
    "max_tokens": 1000,
    "messages": [{"role": "user", "content": PROMPT}],
    "mcp_servers": [
        {
            "type": "url",
            "url": "https://api.ibkr.com/v1/api/mcp",
            "name": "interactive-brokers",
        }
    ],
    # every mcp_server must be referenced by an mcp_toolset entry
    "tools": [{"type": "mcp_toolset", "mcp_server_name": "interactive-brokers"}],
}

response = requests.post(
    "https://api.anthropic.com/v1/messages",
    json=payload,
    headers=headers,
    timeout=300,
)

if response.status_code != 200:
    print(f"ERROR: Claude API returned {response.status_code}")
    print(response.text)
    sys.exit(1)

result = response.json()

text_content = "".join(
    block.get("text", "")
    for block in result.get("content", [])
    if block.get("type") == "text"
)

try:
    account_data = json.loads(text_content)
except json.JSONDecodeError:
    match = re.search(r"\{.*\}", text_content, re.DOTALL)
    if not match:
        print("ERROR: Could not parse account data from Claude")
        print(f"Response: {text_content}")
        sys.exit(1)
    account_data = json.loads(match.group())

if "updatedAt" not in account_data:
    account_data["updatedAt"] = (
        datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    )

with open("ibkr-snapshot.json", "w") as f:
    json.dump(account_data, f, indent=2)

print("OK: IBKR data fetched successfully")
print(f"  Net Liquidation: ${account_data['netLiquidation']:,.2f}")
print(f"  Cash: ${account_data['cash']:,.2f}")
print(f"  Stock Value: ${account_data['stockValue']:,.2f}")
print(f"  P&L: ${account_data['unrealizedPnl']:,.2f}")
