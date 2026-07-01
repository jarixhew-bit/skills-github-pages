#!/bin/bash
set -euo pipefail

# Only run in remote (web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Install markitdown-mcp
pip install markitdown-mcp -q

# Install ai-team-os (system Python has an apt-managed PyJWT that conflicts
# with pip's PyJWT dependency, hence --ignore-installed)
if ! python3 -c "import aiteam" >/dev/null 2>&1; then
  pip install --ignore-installed ai-team-os -q
fi

# Merge MCP server config + env flags into user settings without clobbering
# other keys that may already be there (e.g. hooks, other mcpServers).
mkdir -p ~/.claude
python3 - << 'PYEOF'
import json, os

p = os.path.expanduser("~/.claude/settings.json")
settings = {}
if os.path.exists(p):
    with open(p) as f:
        settings = json.load(f)

mcp_servers = settings.setdefault("mcpServers", {})
mcp_servers["markitdown"] = {"command": "markitdown-mcp", "type": "stdio"}
mcp_servers["ai-team-os"] = {"command": "ai-team-os-serve", "type": "stdio"}

env = settings.setdefault("env", {})
env["CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS"] = "1"

with open(p, "w") as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)
PYEOF

# Clone and start html-anything
if [ ! -d "$HOME/html-anything" ]; then
  git clone https://github.com/nexu-io/html-anything "$HOME/html-anything" -q || true
  [ -d "$HOME/html-anything" ] && (cd "$HOME/html-anything" && pnpm install -s 2>/dev/null || true)
fi
if [ -d "$HOME/html-anything" ]; then
  cd "$HOME/html-anything" && pnpm -F @html-anything/next dev --port 3000 > /tmp/html-anything.log 2>&1 &
fi

# Add knowledge-work-plugins marketplace
claude plugin marketplace add anthropics/knowledge-work-plugins 2>/dev/null || true

# Install all 11 core plugins
for plugin in productivity enterprise-search cowork-plugin-management sales finance data legal marketing customer-support product-management bio-research; do
  claude plugin install "${plugin}@knowledge-work-plugins" 2>/dev/null || true
done
