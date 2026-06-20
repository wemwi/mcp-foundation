![<Service> Logo](<offizielle-logo-asset-url-des-dienstes>)

# <service>-mcp

<Einzeiler: was dieser MCP-Server tut.>

## Endpoint

- **URL:** `https://<service>-mcp.<account>.workers.dev/mcp`
- **Transport:** streamable-http
- **Auth:** OAuth 2.1 — kein Token-Feld im Connector

## Tools

| Tool | Beschreibung |
|---|---|
| `<prefix>_<verb>_<objekt>` (z.B. `sheets_append_row`) | <Kurzbeschreibung> |

## Konfiguration (Cloudflare-Dashboard)

- **KV-Namespace:** `MCP_OAUTH_<SERVICE>` (Binding `OAUTH_KV`)
- **Secrets:** `MCP_AUTH_PASSWORD_HASH` (inbound) + Outbound-Credential nach Konvention
  `<AUSSTELLER>_<TYP>` (z.B. `GOOGLE_SERVICE_ACCOUNT_JSON`)

Env-Var-Namen sind nicht geheim und gehören hierher; Werte werden nur im Dashboard
gesetzt, nie im Repo.

## Foundation

Eingebundene Foundation-Version: `<git-tag>` (`<foundation-repo>`).

## Deploy

PR gegen `main` → Merge im GitHub-Web → Cloudflare baut automatisch von `main`.
KV-Namespace und Secrets im Dashboard setzen (siehe Konfiguration).
