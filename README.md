# mcp-foundation

Server-agnostisches Framework für eigene MCP-Server auf **Cloudflare Workers**.
Wird als **versionierte Git-Dependency** konsumiert (`github:DEINE-ORG/mcp-foundation#v2.x`),
nicht über npm publiziert. **Kein GitHub-Template.**

> **v2.0 — Inbound-Auth ist OAuth 2.1** (via `@cloudflare/workers-oauth-provider`,
> stateless über KV). `static_bearer` bleibt im Code, ist aber dormant (nur lokales
> Testing). Migrations-Schritte: siehe „Neuen Server aufsetzen" + Checkliste unten.

## Struktur

Ein npm-Paket mit Subpath-Exports (kein Workspace — installiert sauber als Git-Dep):

| Import | Inhalt |
|---|---|
| `mcp-foundation/core` | `BuildServer`-Typ, Auth-Contract + `createStaticBearerAuth` (dormant), `createOriginCheck` |
| `mcp-foundation/logging` | `createLogger` (strukturiertes JSON) + `redact` (Secret-Redaction) |
| `mcp-foundation/hosting` | `createOAuthWorker` (OAuth 2.1, Default) + `createLoginUiHandler`; `createWorkerHandler` (static_bearer, lokales Testing) |
| `mcp-foundation/tooling` | `createAllowlistedRegistrar`, Test-Harness (`callMcp`/`listTools`), Eject-Script |

`server-template/` ist die Kopiervorlage für einen neuen Server.

## Architektur-Regeln

- **Transport:** Streamable HTTP unter `/mcp` (niemals `/sse`).
- **Stateless als Default:** `createOAuthWorker` → `createMcpHandler` (aus `agents/mcp`), OAuth-State in KV,
  kein Durable Object. Session-State/Elicitation nötig? → `McpAgent` + Durable Object + SQLite-Migration, `jurisdiction: "eu"`.
- **Factory pro Request:** `buildServer()` liefert bei JEDEM Request eine frische `McpServer`-Instanz.
  Pflicht ab MCP SDK 1.26 (CVE — geteilte Instanzen leaken Cross-Client-Responses). Kein Singleton.
- **Inbound-Auth:** OAuth 2.1 über `@cloudflare/workers-oauth-provider`. Der Provider wrappt den Worker und
  verifiziert Tokens VOR dem apiHandler; er implementiert `/token`, `/register` und die `/.well-known`-Discovery
  selbst — die Foundation baut nur die `/authorize`-Login-Seite (Passwort gegen `MCP_AUTH_PASSWORD_HASH`,
  Identität = Option A). Nur S256-PKCE (`allowPlainPKCE: false`). `static_bearer` (`AuthMiddleware`) bleibt
  dormant für lokales Testing über `createWorkerHandler`.
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
3. KV-Namespace im Dashboard anlegen (Storage & Databases → KV), ID in `wrangler.jsonc` unter dem
   Binding **`OAUTH_KV`** eintragen (Name ist im Provider hardcodiert — nicht umbenennen). Pro Repo ein Namespace.
4. Tools in `src/server.ts` definieren — jeder Name muss in `TOOL_ALLOWLIST` stehen.
5. Login-Passwort als **Hash** setzen: `wrangler secret put MCP_AUTH_PASSWORD_HASH`
   (Wert = `echo -n 'dein-passwort' | sha256sum`). Nie das Klartext-Passwort ablegen.
6. Lokal testen: `npm run dev`, dann `npm run inspect` (MCP Inspector gegen `http://localhost:8788/mcp`)
   — der Inspector durchläuft den OAuth-Flow (Login-Seite → Passwort → „Erlauben").
7. Deploy: `npm run deploy`.

## OAuth-Flow (Connect)

Stateless, alle Vorgänge in `OAUTH_KV`. Der Erst-Connect ist interaktiv, danach laufen Refreshes
ohne weitere Login-Seite (`refreshTokenTTL: 0` = nie ablaufen, für headless Managed Agents).

1. Client (z.B. claude.ai-Connector / MCP Inspector) ruft `/.well-known/...` ab → Provider liefert Metadata.
2. Client registriert sich dynamisch über `/register` (DCR) und startet den Auth-Code-Flow (S256-PKCE).
3. `/authorize` zeigt die Foundation-Login-Seite: Passwort eingeben → „Erlauben".
   Schutz: CSRF (Cookie == Form-Feld) + State-Token in KV (kurze TTL).
4. Provider tauscht Code gegen Access-/Refresh-Token (`/token`). Die in `completeAuthorization` gesetzten
   `props` (z.B. `{ user }`) erreichen Tools via `getMcpAuthContext()`.

Pro Mandant ein eigenes Repo/Worker + eigener `OAUTH_KV`-Namespace + eigenes Passwort.

## Eject (Kunden-Übergabe)

Macht ein `*-mcp`-Kundenrepo self-contained, danach keine Propagation mehr:

```bash
# im Kundenrepo (normaler User):
npx mcp-foundation-eject
```

Kopiert die Foundation nach `vendor/mcp-foundation/` und nennt die manuellen Restschritte
(tsconfig-`paths`-Alias, Dep entfernen, install, Typecheck). Danach Ownership übertragen.

## OAuth-Stolperfallen-Checkliste

Beim Umbau eines Consumer-Repos auf v2 prüfen:

- [ ] KV-Binding heißt **exakt** `OAUTH_KV` (im Provider hardcodiert).
- [ ] `route`/`apiRoute` zeigt auf den realen MCP-Pfad (`/mcp`, nicht `/sse`).
- [ ] Nur S256-PKCE (`allowPlainPKCE: false` — von `createOAuthWorker` gesetzt).
- [ ] Pro Request frische `McpServer`-Instanz (SDK-1.26-Guard — `buildServer`).
- [ ] `/authorize` prüft CSRF (Cookie == Form) und Passwort-Hash.
- [ ] `refreshTokenTTL: 0` (= nie ablaufen) für headless Agents. **Nicht** `undefined` (→ 30-Tage-Default).
- [ ] `MCP_INBOUND_TOKEN` aus allen Workern entfernt; stattdessen `MCP_AUTH_PASSWORD_HASH` setzen.
- [ ] `createStaticBearerAuth` bleibt im Code, nur dormant (lokales Testing).
- [ ] Outbound-Secrets (`LEXWARE_API_KEY` etc.) unangetastet.
- [ ] Dep `@cloudflare/workers-oauth-provider` ≈ `0.7.x` ergänzt.

## Verifizierte Tech-Fixpunkte (Stand 19.06.2026)

MCP SDK `1.29.0` (stable, single-package; v2-Split pre-alpha, Launch 28.07.2026) ·
`agents` `0.2.x` (`createMcpHandler` aus `agents/mcp`) ·
`@cloudflare/workers-oauth-provider` `0.7.2` (KV-Binding `OAUTH_KV` hardcodiert, `env.OAUTH_PROVIDER`
zur Laufzeit injiziert) · Zod `3.25+`/`4` · Node 24 LTS Zielruntime.
