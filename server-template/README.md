# &lt;service&gt;-mcp

MCP-Server auf **Cloudflare Workers**, aufgesetzt aus `server-template/` der
[`mcp-foundation`](https://github.com/%3Corg%3E/%3Cfoundation-repo%3E). Die Foundation
liefert Auth (OAuth 2.1, stateless über KV) + Transport (Streamable HTTP unter `/mcp`);
dieses Repo liefert nur `buildServer` und die Tools.

Beim Aufsetzen die Platzhalter ersetzen: `<service>` (Worker-/Service-Name),
`<org>`/`<foundation-repo>`/`<git-tag>` (Foundation-Dependency), `<SERVICE>` und
`<AUSSTELLER>_<TYP>` (siehe **Konfiguration**).

## Aufsetzen

1. `package.json`: `name` = `<service>-mcp`, `mcp-foundation`-Git-URL/Tag setzen
   (`github:<org>/<foundation-repo>#<git-tag>`).
2. `wrangler.jsonc`: `name` = `<service>-mcp`, `compatibility_date` = heutiges Datum.
   `nodejs_compat` und der `ai`-Alias auf `./src/empty-ai.js` bleiben Pflicht.
3. KV-Namespace im Dashboard anlegen (Storage & Databases → KV) und die ID unter dem
   Binding **`OAUTH_KV`** in `wrangler.jsonc` eintragen (Name im Provider hardcodiert —
   nicht umbenennen). Pro Repo ein eigener Namespace.
4. Tools in `src/server.ts` definieren — jeder Name muss in `TOOL_ALLOWLIST` stehen und
   die MCP-Konvention `^[a-zA-Z0-9_-]{1,64}$` erfüllen — keine Punkte, also
   `example_ping` statt eines gepunkteten Namens.
5. Login-Passwort als Hash setzen (siehe **Konfiguration**), dann `npm run deploy`.

## Konfiguration

### KV-Namespace

| Zweck | Binding (PFLICHT) | Namespace-Name (Konvention) |
|---|---|---|
| OAuth-State (Login-State, Clients, Grants, Tokens) | `OAUTH_KV` | `MCP_OAUTH_<SERVICE>` |

Der **Binding-Name** `OAUTH_KV` ist im OAuthProvider hardcodiert und nicht frei wählbar.
Der **Namespace-Name** im Dashboard folgt der Konvention `MCP_OAUTH_<SERVICE>` (z.B.
`MCP_OAUTH_LEXWARE`). Pro Repo ein eigener Namespace; die ID in `wrangler.jsonc` eintragen.

### Secrets

Secrets ausschließlich als `wrangler secret` bzw. im Dashboard setzen — **nie ins Git**.

| Secret | Zweck |
|---|---|
| `MCP_AUTH_PASSWORD_HASH` | SHA-256-Hex des Login-Passworts. Erzeugen: `echo -n 'dein-passwort' \| sha256sum`. |
| `<AUSSTELLER>_<TYP>` | Service-spezifisches Outbound-Secret für die angebundene API. |

Outbound-Secrets folgen der Namenskonvention `<AUSSTELLER>_<TYP>`, z.B. `LEXWARE_API_KEY`,
`TELEGRAM_BOT_TOKEN`, `GOOGLE_PSI_API_KEY`. Setzen mit:

```bash
wrangler secret put MCP_AUTH_PASSWORD_HASH
wrangler secret put <AUSSTELLER>_<TYP>
```

## Verbinden (Connector)

Im claude.ai-Connector (oder MCP Inspector) als Connector-URL eintragen:

```
https://<service>-mcp.<dein-subdomain>.workers.dev/mcp
```

Der Erst-Connect ist interaktiv (Login-Seite → Passwort → „Erlauben"), danach laufen
Refreshes ohne weitere Login-Seite.

## Lokal entwickeln

```bash
npm run dev        # wrangler dev
npm run inspect    # MCP Inspector gegen http://localhost:8788/mcp
npm run typecheck  # tsc --noEmit
```
