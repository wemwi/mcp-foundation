/**
 * OAuth-2.1-Wiring für einen stateless MCP-Server auf Cloudflare Workers.
 *
 * `@cloudflare/workers-oauth-provider` wrappt den ganzen Worker: er verifiziert
 * eingehende Access-Tokens VOR dem apiHandler und implementiert /token,
 * /register und die /.well-known-Discovery selbst. NUR /authorize (die
 * Login-Seite) baut die Foundation (siehe auth-ui.ts).
 *
 * Bleibt bewusst stateless: KV statt Durable Object, kein McpAgent. Pro Request
 * eine FRISCHE McpServer-Instanz (CVE-Guard ab MCP SDK 1.26 — geteilte Instanzen
 * leaken Cross-Client-Responses).
 *
 * Static-Bearer (createStaticBearerAuth) bleibt im Code, ist aber im OAuth-Pfad
 * dormant: die Token-Prüfung macht jetzt der Provider, nicht die AuthMiddleware.
 */
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp";
import type { BuildServer } from "../core/types.js";
import { createOriginCheck } from "../core/origin.js";
import type { Logger } from "../logging/logger.js";
import {
  createLoginUiHandler,
  type LoginUiOptions,
  type OAuthEnv,
} from "./auth-ui.js";

export interface OAuthWorkerOptions {
  /** Factory, die pro Request eine FRISCHE McpServer-Instanz baut (CVE-Guard). */
  buildServer: BuildServer;
  /** Konfiguration der /authorize-Login-Seite (defaultHandler). */
  login?: LoginUiOptions;
  /** Erlaubte Origins (DNS-Rebinding). Leer = nur Clients ohne Origin-Header. */
  allowedOrigins?: readonly string[];
  /** MCP-Pfad (Default "/mcp"). Streamable HTTP — niemals "/sse". */
  route?: string;
  /** Optionaler strukturierter Logger. */
  logger?: Logger;
  /** Angekündigte Scopes. Default ["mcp"]. */
  scopesSupported?: readonly string[];
  /** Access-Token-Lebensdauer in Sekunden. Default 3600. */
  accessTokenTTL?: number;
  /**
   * Refresh-Token-Lebensdauer in Sekunden. Default 0 = nie ablaufen.
   *
   * Headless Managed Agents sollen nur den Erst-Connect interaktiv durch
   * /authorize machen. ACHTUNG: `0` deaktiviert den Ablauf — `undefined`
   * würde auf den Provider-Default (30 Tage) zurückfallen.
   */
  refreshTokenTTL?: number;
  /** Endpoint-Pfade (Provider-Defaults der Foundation). */
  authorizeEndpoint?: string;
  tokenEndpoint?: string;
  clientRegistrationEndpoint?: string;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Baut den gesamten OAuth-Worker (das `export default` einer index.ts).
 *
 * Ablauf eines authentifizierten /mcp-Requests:
 *   1. Provider verifiziert das Access-Token (vor dem apiHandler).
 *   2. apiHandler prüft den Origin (DNS-Rebinding).
 *   3. Provider-Props landen als ctx.props → werden Auth-Kontext.
 *   4. FRISCHE McpServer-Instanz via buildServer() (Pflicht ab SDK 1.26).
 *   5. Delegation an createMcpHandler aus `agents/mcp` (Streamable HTTP).
 *
 * Der Auth-Kontext ist in Tools via getMcpAuthContext() erreichbar.
 * Es findet KEIN eigener Bearer-Check mehr statt — das macht der Provider davor.
 */
export function createOAuthWorker(opts: OAuthWorkerOptions): OAuthProvider {
  const route = opts.route ?? "/mcp";
  const originCheck = createOriginCheck(opts.allowedOrigins ?? []);
  const log = opts.logger;

  const apiHandler = {
    async fetch(
      request: Request,
      env: OAuthEnv,
      ctx: ExecutionContext,
    ): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== route) {
        return jsonResponse(404, { error: "Not Found" });
      }

      if (!originCheck(request)) {
        log?.warn("origin rejected", { origin: request.headers.get("Origin") });
        return jsonResponse(403, { error: "Origin not allowed" });
      }

      // Props aus dem verifizierten Token (vom completeAuthorization-Aufruf).
      const props =
        (ctx as unknown as { props?: Record<string, unknown> }).props ?? {};
      const authContext: Record<string, unknown> = {
        authMethod: "oauth",
        ...props,
      };

      // Frische Instanz pro Request — kein Singleton.
      const server = opts.buildServer({ env, auth: authContext });

      const handler = createMcpHandler(server, {
        route,
        authContext: { props: authContext },
      });

      return handler(
        request,
        env as unknown as Record<string, unknown>,
        ctx,
      );
    },
  };

  return new OAuthProvider<OAuthEnv>({
    // ⚠️ Muss auf den realen MCP-Pfad zeigen (streamable-http = /mcp).
    apiRoute: route,
    apiHandler,
    // Alles andere (inkl. /authorize) geht an den defaultHandler.
    defaultHandler: createLoginUiHandler({ logger: log, ...opts.login }),

    // /token, /register und /.well-known-Discovery macht der Provider selbst.
    authorizeEndpoint: opts.authorizeEndpoint ?? "/authorize",
    tokenEndpoint: opts.tokenEndpoint ?? "/token",
    clientRegistrationEndpoint: opts.clientRegistrationEndpoint ?? "/register",

    scopesSupported: [...(opts.scopesSupported ?? ["mcp"])],

    // ⚠️ OAuth 2.1: nur S256-PKCE zulassen.
    allowPlainPKCE: false,

    accessTokenTTL: opts.accessTokenTTL ?? 3600,
    // 0 = nie ablaufen (headless Agents). Nicht undefined lassen → 30-Tage-Default.
    refreshTokenTTL: opts.refreshTokenTTL ?? 0,
  });
}
