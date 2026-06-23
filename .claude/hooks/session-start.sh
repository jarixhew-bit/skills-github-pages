#!/bin/bash
set -euo pipefail

# Only run in remote (web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

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
