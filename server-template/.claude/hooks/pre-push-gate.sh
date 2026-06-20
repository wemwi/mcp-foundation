#!/usr/bin/env bash
# pre-push-gate.sh — PreToolUse-Hook (Bash) für diesen MCP-Server.
#
# Greift ausschließlich bei `git push` und blockt den Push, wenn ein Tool-Name
# die MCP-Namenskonvention verletzt. Die Hook-Payload kommt als JSON auf stdin.
#
# Schritt 0 — Tool-Namen-Regex:
#   MCP-Tool-Namen müssen ^[a-zA-Z0-9_-]{1,64}$ erfüllen. Punkte sind NICHT
#   erlaubt: example_ping ist gültig, ein gepunkteter Name dagegen nicht.
set -euo pipefail

# --- PreToolUse-Payload lesen, Bash-Kommando extrahieren --------------------
payload="$(cat)"
command=""
if command -v jq >/dev/null 2>&1; then
  command="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
fi
if [ -z "$command" ]; then
  # Fallback ohne jq: best effort.
  command="$(printf '%s' "$payload" | tr ',' '\n' | grep '"command"' | head -1 || true)"
fi

# Nur bei git push gaten — alles andere ungehindert durchlassen.
case "$command" in
  *"git push"*) : ;;
  *) exit 0 ;;
esac

# --- Schritt 0: Tool-Namen-Regex --------------------------------------------
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
server_ts="$script_dir/../../src/server.ts"
[ -f "$server_ts" ] || exit 0

name_re='^[a-zA-Z0-9_-]{1,64}$'
fail=0

# Tool-Namen aus dem TOOL_ALLOWLIST-Array ziehen (Single- oder Multi-Line).
tools="$(awk '/TOOL_ALLOWLIST/{f=1} f{print} f&&/\]/{exit}' "$server_ts" \
  | grep -oE '"[^"]+"' | tr -d '"' || true)"

while IFS= read -r tool; do
  [ -z "$tool" ] && continue
  if ! printf '%s' "$tool" | grep -Eq "$name_re"; then
    echo "pre-push-gate: ungültiger Tool-Name \"$tool\" — muss $name_re erfüllen (keine Punkte)." >&2
    fail=1
  fi
done <<EOF
$tools
EOF

if [ "$fail" -ne 0 ]; then
  echo "pre-push-gate: Push blockiert (Schritt 0)." >&2
  exit 2
fi

exit 0
