#!/usr/bin/env bash
# pre-push-gate.sh — PreToolUse-Gate fuer MCP-Server-Repos.
#
# Blockiert `git push`, bis Build-Voraussetzungen erfuellt sind. Faengt damit genau
# die wiederkehrenden Fehler ab, BEVOR sie nach dem Merge aufschlagen:
#   - Cloudflare-Build: "entry-point not found" / "Could not detect static files"
#   - Connector-Reject: ungueltiger Tool-Name (Punkt) gegen das Frontend-Pattern
#     ^[a-zA-Z0-9_-]{1,64}$ (FrontendRemoteMcpToolDefinition.name).
#
# Mechanik (Claude Code Hooks): stdin = Hook-JSON; Exit 2 = Aktion blockieren,
# stderr-Text geht als Feedback an Claude. Exit 0 = durchlassen.
#
# Ablage: server-template/.claude/hooks/pre-push-gate.sh (ausfuehrbar: chmod +x).

set -uo pipefail
INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')

# Nur bei `git push` greifen — alles andere ungehindert durchlassen.
if ! printf '%s' "$CMD" | grep -Eq '(^|[;&| ])git[[:space:]]+push'; then
  exit 0
fi

fail() { echo "git push blockiert: $1" >&2; exit 2; }

# 0. Tool-Namen-Regex: jeder TOOL_ALLOWLIST-Eintrag in src/server.ts muss
#    ^[a-zA-Z0-9_-]{1,64}$ erfuellen (kein Punkt/Leerzeichen). Ein Punkt baut zwar
#    durch, wird aber beim Connect vom Frontend abgewiesen. Fail-fast vor dem Build.
if [ -f src/server.ts ]; then
  ALLOW=$(awk '/TOOL_ALLOWLIST/{f=1} f{print} f&&/\]/{exit}' src/server.ts)
  NAMES=$(printf '%s' "$ALLOW" | grep -oE '"[^"]+"|'\''[^'\'']+'\''' | sed -E 's/^.|.$//g')
  for n in $NAMES; do
    printf '%s' "$n" | grep -Eq '^[a-zA-Z0-9_-]{1,64}$' \
      || fail "ungueltiger Tool-Name \"$n\" in TOOL_ALLOWLIST — erlaubt ist ^[a-zA-Z0-9_-]{1,64}\$ (kein Punkt, kein Leerzeichen). Konvention <verb>_<objekt> (snake_case, kein Prefix), z.B. append_row."
  done
fi

# 1. wrangler.jsonc muss im Build-Root liegen (Layout/Root-directory-Falle).
[ -f wrangler.jsonc ] || fail "keine wrangler.jsonc im Build-Root — Repo-Layout / Workers-Builds Root directory pruefen (deploy.md)."

# 2. Typecheck.
echo "Gate: npm run typecheck ..." >&2
npm run typecheck --silent || fail "tsc --noEmit fehlgeschlagen."

# 3. Wrangler-Dry-Run reproduziert Entry-/Config-/Bundling-Fehler lokal.
echo "Gate: npx wrangler deploy --dry-run ..." >&2
npx wrangler deploy --dry-run >/dev/null 2>&1 || fail "wrangler deploy --dry-run fehlgeschlagen — Entry/Config/Bundling pruefen."

echo "Gate ok — push freigegeben." >&2
exit 0
