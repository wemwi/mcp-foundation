import { createOAuthWorker } from "mcp-foundation/hosting";
import { createLogger } from "mcp-foundation/logging";
import { buildServer } from "./server.js";

/** Typsicheres Env für diesen Server. */
interface Env {
  /**
   * SHA-256-Hex des Login-Passworts (wrangler secret / Dashboard-Secret).
   * Hash erzeugen: `echo -n 'dein-passwort' | sha256sum`
   */
  MCP_AUTH_PASSWORD_HASH: string;
  // OAUTH_KV ist als KV-Binding in wrangler.jsonc gesetzt (Name PFLICHT).
  // OAUTH_PROVIDER wird vom Provider zur Laufzeit injiziert.
  // Outbound-Secrets hier ergänzen. Namenskonvention <AUSSTELLER>_<TYP>, z.B.:
  // LEXWARE_API_KEY: string;
}

const logger = createLogger({
  level: "info",
  bindings: { server: "<service>-mcp" },
});

/**
 * OAuthProvider wrappt den ganzen Worker: er verifiziert eingehende Tokens und
 * implementiert /token, /register, /.well-known-Discovery selbst. Die
 * Foundation baut nur die /authorize-Login-Seite (Passwort gegen
 * MCP_AUTH_PASSWORD_HASH). Stateless: KV statt Durable Object.
 *
 * Erst-Connect: claude.ai-Connector → Login-Seite → Passwort → „Erlauben".
 */
export default createOAuthWorker({
  buildServer,
  login: {
    // userId/Props landen als ctx.props beim Tool-Kontext (getMcpAuthContext()).
    userId: "user",
    title: "<service>-mcp — Login",
  },
  // Server-to-Server-Agents senden keinen Origin. Browser-Origins hier whitelisten.
  allowedOrigins: [],
  route: "/mcp",
  logger,
});
