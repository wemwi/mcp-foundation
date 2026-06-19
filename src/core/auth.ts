/**
 * Auth-Middleware-Contract.
 *
 * Das ist der Austauschpunkt: heute static_bearer, später OAuth — ohne
 * Rewrite des Server-Codes. Der Hosting-Adapter kennt nur dieses Interface.
 *
 * HINWEIS (OAuth-Umbau): Im OAuth-Pfad (createOAuthWorker) ist diese
 * AuthMiddleware DORMANT — die Token-Prüfung übernimmt der OAuthProvider VOR
 * dem apiHandler. `createStaticBearerAuth` bleibt für lokales Testing
 * (MCP-Inspector / Header-Client via createWorkerHandler) im Code erhalten.
 */

export interface AuthResult {
  /** true = Request darf durch. */
  ok: boolean;
  /** HTTP-Status bei Ablehnung (Default 401). */
  status?: number;
  /** Klartext-Grund bei Ablehnung (landet im Log, NICHT der Token). */
  message?: string;
  /** Bei Erfolg: Kontext, der Tools via getMcpAuthContext() erreicht. */
  context?: Record<string, unknown>;
}

export interface AuthMiddleware {
  authenticate(
    request: Request,
    env: Record<string, unknown>,
  ): AuthResult | Promise<AuthResult>;
}

/**
 * Konstant-Zeit-String-Vergleich. Runtime-agnostisch (kein node:crypto nötig),
 * damit `core` auf jeder Runtime läuft. Die Länge kann minimal leaken — für
 * einen statischen Bearer akzeptabel; der OAuth-Pfad nutzt später Signaturen.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export interface StaticBearerOptions {
  /**
   * Name der Env-Variable (wrangler secret), die das erwartete Inbound-Token
   * hält. Dieser Wert MUSS identisch zu dem im Console-Vault hinterlegten
   * Token sein (gekeyt auf die exakte /mcp-URL).
   */
  tokenEnvVar: string;
}

/**
 * Static-Bearer-Auth: vergleicht `Authorization: Bearer <token>` gegen das
 * serverseitige Secret aus env[tokenEnvVar].
 */
export function createStaticBearerAuth(
  opts: StaticBearerOptions,
): AuthMiddleware {
  const PREFIX = "Bearer ";
  return {
    authenticate(request, env) {
      const expected = env[opts.tokenEnvVar];
      if (typeof expected !== "string" || expected.length === 0) {
        // Fehlkonfiguration des Servers, nicht des Clients.
        return {
          ok: false,
          status: 500,
          message: `Inbound token secret "${opts.tokenEnvVar}" not configured`,
        };
      }

      const header = request.headers.get("Authorization") ?? "";
      if (!header.startsWith(PREFIX)) {
        return { ok: false, status: 401, message: "Missing bearer token" };
      }

      const provided = header.slice(PREFIX.length);
      if (!timingSafeEqual(provided, expected)) {
        return { ok: false, status: 401, message: "Invalid bearer token" };
      }

      return { ok: true, context: { authMethod: "static_bearer" } };
    },
  };
}
