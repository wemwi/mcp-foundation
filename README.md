# mcp-foundation

![Version](https://img.shields.io/github/v/release/wemwi/mcp-foundation)

> Server-agnostische Basis für eigene MCP-Server auf Cloudflare Workers — Auth,
> Transport und Tooling einmal gebaut, von allen `*-mcp`-Repos geteilt.

## Zweck

Bündelt die immer gleiche Mechanik eines MCP-Servers (OAuth 2.1 / static_bearer,
Streamable-HTTP-Transport, Tool-Allowlist, Secret-Redaction), damit ein Consumer-Repo
nur noch `buildServer` und seine Tools liefern muss. Konsumiert wird sie von den
`*-mcp`-Server-Repos (z. B. `lexware-mcp`, `telegram-mcp`, `google-pagespeed-mcp`) —
ausgelagert, weil sich Auth- und Transport-Logik sonst in jedem Server dupliziert
und Sicherheitsfixes (CVE-Guard, PKCE) zentral landen müssen.

## Bereitstellung

Wird als **Git-Tag-Dependency** konsumiert. Consumer pinnen einen Tag.

Exportierte Oberfläche:

| Export | Zweck |
|--------|-------|
| `mcp-foundation/core` | `BuildServer`-Typ, Auth-Contract + `createStaticBearerAuth` (dormant), `createOriginCheck` |
| `mcp-foundation/logging` | `createLogger` (strukturiertes JSON) + `redact` (Secret-Redaction) |
| `mcp-foundation/hosting` | `createOAuthWorker` (OAuth 2.1, Default) + `createLoginUiHandler`; `createWorkerHandler` (static_bearer, lokales Testing) |
| `mcp-foundation/tooling` | `createAllowlistedRegistrar`, Test-Harness (`callMcp`/`listTools`), Eject-Script |

Consumer-Repos pinnen den **jeweils neuesten Release-Tag** in ihrer Dependency —
sichtbar oben im Badge und unter [„Releases"](https://github.com/wemwi/mcp-foundation/releases).
Keine feste Version aus diesem Text übernehmen.

Quickstart, vollständige `createOAuthWorker`-API und Architektur-Details:
[`docs/framework.md`](docs/framework.md).

## Setup

Im Consumer-Repo als Git-Dependency mit festem Tag einbinden (nicht über npm publiziert):

```jsonc
// package.json des Consumers
"dependencies": {
  "mcp-foundation": "github:wemwi/mcp-foundation#<neuester-tag>"
}
```

`<neuester-tag>` durch den aktuellen Release-Tag ersetzen (siehe Badge / Releases) —
nicht abschreiben. Mindestlaufzeit **Node ≥ 24**. Pflicht im Consumer: `overrides` für
`@modelcontextprotocol/sdk` und der `ai`-Alias (→ [`docs/framework.md`](docs/framework.md)).

> ⚠️ Breaking Changes MÜSSEN als `feat!:` / `BREAKING CHANGE:` markiert werden —
> Consumer ziehen sonst unbemerkt eine inkompatible Version.

## Gotchas

- esbuild bricht beim Deploy mit `Could not resolve 'ai'` ab → `agents` macht ein dynamisches `import("ai")`, das optionale Peer ist nicht installiert → `ai`-Alias auf `./src/empty-ai.js` in `wrangler.jsonc` setzen.
- Typecheck-Fehler `McpServer` nominal inkompatibel → zwei SDK-Kopien im Baum, weil `agents` ein anderes `@modelcontextprotocol/sdk` pinnt → `overrides` für `@modelcontextprotocol/sdk` auf die eigene Version zwingen.
- Headless Agent muss sich stündlich neu einloggen → `refreshTokenTTL: 0` stellt gar kein Refresh-Token aus → `refreshTokenTTL` nicht setzen (`undefined` = unendlich).

## Versionierung

Versionen und Änderungen: siehe [`CHANGELOG.md`](./CHANGELOG.md). Versionierung
läuft automatisch über Conventional Commits + release-please — Tags nicht von Hand setzen.
