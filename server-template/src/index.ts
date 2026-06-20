import { createOAuthWorker } from "mcp-foundation/hosting";
import { createLogger } from "mcp-foundation/logging";
import { buildServer } from "./server.js";

/** Typsicheres Env für diesen Server. */
interface Env {
  /** SHA-256-Hex des Login-Passworts. Hash: `echo -n 'pw' | sha256sum` */
  MCP_AUTH_PASSWORD_HASH: string;
  // OAUTH_KV ist als KV-Binding in wrangler.jsonc gesetzt (Name PFLICHT).
  // OAUTH_PROVIDER wird vom Provider zur Laufzeit injiziert.
  // Outbound-Secret(s) hier ergänzen — Name = <AUSSTELLER>_<TYP> (siehe secrets.md), z.B.:
  // GOOGLE_SERVICE_ACCOUNT_JSON: string;
}

const logger = createLogger({
  level: "info",
  bindings: { server: "<service>-mcp" },
});

/**
 * createOAuthWorker wrappt den ganzen Worker: Token-Verifikation, /token,
 * /register und /.well-known-Discovery macht der Provider selbst. Die Foundation
 * baut nur die /authorize-Login-Seite (Passwort gegen MCP_AUTH_PASSWORD_HASH).
 * Stateless: KV statt Durable Object.
 *
 * Erst-Connect: claude.ai-Connector → Login-Seite → Passwort → „Erlauben".
 */
export default createOAuthWorker({
  buildServer,
  login: {
    // userId/Props landen als ctx.props beim Tool-Kontext (getMcpAuthContext()).
    userId: "<user-id>",
    title: "<Service> MCP — Login",
  },
  // Server-to-Server-Agents senden keinen Origin. Browser-Origins hier whitelisten.
  allowedOrigins: [],
  route: "/mcp",
  logger,
});

export type { Env };
