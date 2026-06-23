#!/bin/bash
set -euo pipefail

# Only run in remote (web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Install markitdown-mcp
pip install markitdown-mcp -q

# Write MCP server config to user settings
mkdir -p ~/.claude
cat > ~/.claude/settings.json << 'JSON'
{
  "mcpServers": {
    "markitdown": {
      "command": "markitdown-mcp",
      "type": "stdio"
    }
  }
}
JSON

# Clone and start html-anything
if [ ! -d "$HOME/html-anything" ]; then
  git clone https://github.com/nexu-io/html-anything "$HOME/html-anything" -q
  cd "$HOME/html-anything" && pnpm install -s 2>/dev/null || true
fi
cd "$HOME/html-anything" && pnpm -F @html-anything/next dev --port 3000 > /tmp/html-anything.log 2>&1 &

# Add knowledge-work-plugins marketplace
claude plugin marketplace add anthropics/knowledge-work-plugins 2>/dev/null || true

# Install all 11 core plugins
for plugin in productivity enterprise-search cowork-plugin-management sales finance data legal marketing customer-support product-management bio-research; do
  claude plugin install "${plugin}@knowledge-work-plugins" 2>/dev/null || true
done
