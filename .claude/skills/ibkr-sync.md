# IBKR Sync

Fetch the latest IBKR account balance and publish it to GitHub Pages so the expense tracker PWA shows the current balance.

## Steps

1. Call `mcp__Interactive_Brokers_IBKR__get_account_summary` to get net liquidation value and key metrics.
2. Call `mcp__Interactive_Brokers_IBKR__get_account_balances` to get cash and stock breakdown.
3. Build a JSON object:
   ```json
   {
     "netLiquidation": <number>,
     "currency": "USD",
     "cash": <number>,
     "stockValue": <number>,
     "unrealizedPnl": <number>,
     "updatedAt": "<ISO timestamp>"
   }
   ```
4. Use `mcp__github__create_or_update_file` to write/update `ibkr-snapshot.json` in the `jarixhew-bit/skills-github-pages` repo on the `main` branch. Get the current file SHA first if the file already exists (use `mcp__github__get_file_contents`).
5. Tell the user the balance and that it will appear in the app within ~1 minute.

## Notes
- Always use the BASE/USD row from `get_account_balances` for the numbers.
- Round all numbers to 2 decimal places.
- `updatedAt` should be the current UTC time in ISO 8601 format.
