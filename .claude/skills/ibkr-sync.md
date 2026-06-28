---
description: Sync IBKR account balance to the expense tracker app. Fetches net liquidation value, cash, stock value and unrealized P&L from Interactive Brokers, then publishes to ibkr-snapshot.json on GitHub Pages so the mobile app shows the latest balance.
---

## Steps

1. Call `mcp__Interactive_Brokers_IBKR__get_account_summary` to get net liquidation value and key metrics.
2. Call `mcp__Interactive_Brokers_IBKR__get_account_balances` to get cash and stock breakdown. Use the USD row.
3. Get the current SHA of `ibkr-snapshot.json` from GitHub using `mcp__github__get_file_contents` on `jarixhew-bit/skills-github-pages` main branch.
4. Build updated JSON with current UTC timestamp:
   ```json
   {
     "netLiquidation": <number rounded to 2dp>,
     "currency": "USD",
     "cash": <number>,
     "stockValue": <number>,
     "unrealizedPnl": <number>,
     "updatedAt": "<current UTC ISO 8601 timestamp>"
   }
   ```
5. Use `mcp__github__create_or_update_file` to write `ibkr-snapshot.json` to `jarixhew-bit/skills-github-pages` main branch with the SHA from step 3.
6. Report to user: the balance amount and that it will appear in the app within ~1 minute.
