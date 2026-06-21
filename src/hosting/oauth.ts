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
import {
  OAuthProvider,
  type PurgeOptions,
  type PurgeResult,
} from "@cloudflare/workers-oauth-provider";
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
   * Refresh-Token-Lebensdauer in Sekunden. Default `undefined` = unendlich (nie
   * ablaufen).
   *
   * Headless Managed Agents sollen nur den Erst-Connect interaktiv durch
   * /authorize machen — danach hält das Refresh-Token die Verbindung am Leben.
   * Deshalb hier NICHT setzen (`undefined` = unendlich). ACHTUNG: `0` stellt
   * GAR KEIN Refresh-Token aus → der Client muss stündlich (nach Ablauf des
   * Access-Tokens) neu durch /authorize → genau der Re-Login-Bug, den man
   * vermeiden will. `n > 0` lässt das Refresh-Token nach n Sekunden ablaufen.
   */
  refreshTokenTTL?: number;
  /** Endpoint-Pfade (Provider-Defaults der Foundation). */
  authorizeEndpoint?: string;
  tokenEndpoint?: string;
  clientRegistrationEndpoint?: string;
}

/**
 * Worker-Oberfläche, die `createOAuthWorker` zurückgibt — der `export default`
 * einer Server-`index.ts`. `fetch` reicht an den Provider durch; `scheduled` ist
 * der von der Foundation ergänzte Cron-Handler für die KV-Hygiene
 * ({@link purgeExpiredData}), den so jeder Server erbt.
 */
export interface OAuthWorker {
  fetch(
    request: Request,
    env: OAuthEnv,
    ctx: ExecutionContext,
  ): Promise<Response>;
  scheduled(
    controller: ScheduledController,
    env: OAuthEnv,
    ctx: ExecutionContext,
  ): Promise<void>;
}

/**
 * Räumt abgelaufene und verwaiste OAuth-Records aus `OAUTH_KV` (Grants ohne Client,
 * abgelaufene Grants, verwaiste Tokens) — delegiert an die Provider-Implementierung.
 *
 * Wird vom `scheduled`-Handler in {@link createOAuthWorker} automatisch periodisch
 * aufgerufen (Cron Trigger) und ist hier zusätzlich für manuelle/Test-Aufrufe
 * exportiert. Pflicht zur KV-Hygiene, weil bei `refreshTokenTTL: undefined` (Default
 * — nie ablaufen, gewollt für headless Agents) Grants nicht von selbst verfallen und
 * jeder Reconnect einen toten DCR-Client + Grant hinterlässt. Siehe storage.md.
 */
export function purgeExpiredData(
  provider: OAuthProvider<OAuthEnv>,
  env: OAuthEnv,
  options?: PurgeOptions,
): Promise<PurgeResult> {
  return provider.purgeExpiredData(env, options);
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
export function createOAuthWorker(opts: OAuthWorkerOptions): OAuthWorker {
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

      // sessionIdGenerator: undefined erzwingt echten Stateless-Betrieb.
      // createMcpHandler defaultet sonst auf () => crypto.randomUUID() (stateful);
      // der Folge-Request träfe eine frische Worker-Invocation ohne diese Session
      // (kein Durable Object, kein storage) → "Session terminated" (-32600).
      const handler = createMcpHandler(server, {
        route,
        sessionIdGenerator: undefined,
        authContext: { props: authContext },
      });

      return handler(
        request,
        env as unknown as Record<string, unknown>,
        ctx,
      );
    },
  };

  const provider = new OAuthProvider<OAuthEnv>({
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
    // undefined = infinite (headless Agents).
    refreshTokenTTL: opts.refreshTokenTTL,
  });

  // Der Provider liefert `fetch` (+ `purgeExpiredData`). Den `scheduled`-Handler
  // ergänzt die Foundation, damit JEDER Server die KV-Hygiene erbt, ohne sie selbst
  // zu verdrahten: weil `refreshTokenTTL` undefined ist (Refresh-Tokens laufen nie
  // ab), räumen sich Grants und verwaiste DCR-Clients nicht von selbst — der Cron
  // Trigger ruft periodisch purgeExpiredData (Schedule kommt aus triggers.crons der
  // wrangler.jsonc des Servers; siehe storage.md).
  return {
    fetch(request, env, ctx) {
      return provider.fetch(request, env, ctx);
    },
    scheduled(_controller, env, ctx) {
      ctx.waitUntil(
        purgeExpiredData(provider, env)
          .then((result) => log?.info("purgeExpiredData", { ...result }))
          .catch((error) =>
            log?.error("purgeExpiredData failed", { error: String(error) }),
          ),
      );
      return Promise.resolve();
    },
  };
}
