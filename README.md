# mcp-foundation

Server-agnostisches Framework für eigene MCP-Server auf **Cloudflare Workers**.
Wird als **versionierte Git-Dependency** konsumiert (`github:DEINE-ORG/mcp-foundation#v1.x`),
nicht über npm publiziert. **Kein GitHub-Template.**

## Struktur

Ein npm-Paket mit Subpath-Exports (kein Workspace — installiert sauber als Git-Dep):

| Import | Inhalt |
|---|---|
| `mcp-foundation/core` | `BuildServer`-Typ, Auth-Contract + `createStaticBearerAuth`, `createOriginCheck` |
| `mcp-foundation/logging` | `createLogger` (strukturiertes JSON) + `redact` (Secret-Redaction) |
| `mcp-foundation/hosting` | `createWorkerHandler` — Cloudflare-Adapter (Origin → Auth → Factory → `createMcpHandler`) |
| `mcp-foundation/tooling` | `createAllowlistedRegistrar`, Test-Harness (`callMcp`/`listTools`), Eject-Script |

`server-template/` ist die Kopiervorlage für einen neuen Server.

## Architektur-Regeln

- **Transport:** Streamable HTTP unter `/mcp` (niemals `/sse`).
- **Stateless als Default:** `createWorkerHandler` → `createMcpHandler` (aus `agents/mcp`), kein Durable Object.
  Session-State/Elicitation nötig? → `McpAgent` + Durable Object + SQLite-Migration, `jurisdiction: "eu"`.
- **Factory pro Request:** `buildServer()` liefert bei JEDEM Request eine frische `McpServer`-Instanz.
  Pflicht ab MCP SDK 1.26 (CVE — geteilte Instanzen leaken Cross-Client-Responses). Kein Singleton.
- **Inbound-Auth:** `static_bearer` als austauschbare Middleware. OAuth-Upgrade später ohne Server-Rewrite
  (gleiches `AuthMiddleware`-Interface, Tausch der Implementierung).
- **Outbound-Secrets:** ausschließlich `wrangler secret`, nie im Git (`.dev.vars`/`.env` hart in `.gitignore`).
- **Tools:** Allowlist statt Denylist (`createAllowlistedRegistrar`).
- **Logging:** strukturiert + Redaction (greift bei Keys wie token/secret/authorization und maskiert `Bearer …`).

## Wichtig: SDK-Dedup per `overrides`

`agents` pinnt das MCP-SDK exakt (Stand 0.2.35: `1.23.0`). Ohne Gegenmaßnahme liegen zwei SDK-Kopien
im Baum → Typkonflikt (`McpServer` nominal inkompatibel) und potenzieller Runtime-Versions-Skew.

**Jedes Consumer-Repo** (selectedleafs-mcp, *-mcp) braucht daher:

```jsonc
// package.json (npm) — bei pnpm analog unter "pnpm": { "overrides": { … } }
"overrides": { "@modelcontextprotocol/sdk": "$@modelcontextprotocol/sdk" }
```

Das zwingt den ganzen Baum (inkl. `agents`) auf die eine Version aus den eigenen dependencies (1.29.0).
Im `server-template` ist das bereits gesetzt.

## Neuen Server aufsetzen

1. `server-template/` kopieren, in `package.json` `name` + die `mcp-foundation`-Git-URL/Tag anpassen.
2. `wrangler.jsonc`: `name` setzen, `compatibility_date` = heutiges Datum. `nodejs_compat` bleibt Pflicht.
3. Tools in `src/server.ts` definieren — jeder Name muss in `TOOL_ALLOWLIST` stehen.
4. Inbound-Secret setzen: `wrangler secret put MCP_INBOUND_TOKEN`.
5. Lokal testen: `npm run dev`, dann `npm run inspect` (MCP Inspector gegen `http://localhost:8788/mcp`).
6. Deploy: `npm run deploy`.

## Vault-Flow (Console Managed Agents)

Der Inbound-Bearer liegt **zweifach** und beide Werte müssen identisch sein:

- **Console-Vault:** hält das Token, gekeyt auf die exakte `/mcp`-URL → der Agent sendet `Authorization: Bearer <token>`.
- **Worker:** hält denselben Wert als `wrangler secret` (`MCP_INBOUND_TOKEN`) und vergleicht serverseitig.

Pro Mandant ein eigener Console-Workspace + eigener (workspace-scoped) Vault.

## Eject (Kunden-Übergabe)

Macht ein `*-mcp`-Kundenrepo self-contained, danach keine Propagation mehr:

```bash
# im Kundenrepo (normaler User):
npx mcp-foundation-eject
```

Kopiert die Foundation nach `vendor/mcp-foundation/` und nennt die manuellen Restschritte
(tsconfig-`paths`-Alias, Dep entfernen, install, Typecheck). Danach Ownership übertragen.

## Verifizierte Tech-Fixpunkte (Stand 18.06.2026)

MCP SDK `1.29.0` (stable, single-package; v2-Split pre-alpha, Launch 28.07.2026) ·
`agents` `0.2.x` (`createMcpHandler` aus `agents/mcp`) · Zod `3.25+`/`4` · Node 24 LTS Zielruntime.
