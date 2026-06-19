import { createMcpHandler } from "agents/mcp";
import type { BuildServer } from "../core/types.js";
import type { AuthMiddleware } from "../core/auth.js";
import { createOriginCheck } from "../core/origin.js";
import type { Logger } from "../logging/logger.js";

export interface WorkerHandlerOptions {
  /** Factory, die pro Request eine FRISCHE McpServer-Instanz baut (CVE-Guard). */
  buildServer: BuildServer;
  /** Inbound-Auth (static_bearer zum Start, später OAuth — gleiches Interface). */
  auth: AuthMiddleware;
  /** Erlaubte Origins (DNS-Rebinding). Leer = nur Clients ohne Origin-Header. */
  allowedOrigins?: readonly string[];
  /** MCP-Pfad (Default "/mcp"). Streamable HTTP — niemals "/sse". */
  route?: string;
  /** Optionaler strukturierter Logger. */
  logger?: Logger;
}

type FetchHandler = (
  request: Request,
  env: Record<string, unknown>,
  ctx: ExecutionContext,
) => Promise<Response>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Baut den Cloudflare-Worker-fetch-Handler für einen stateless MCP-Server.
 *
 * Ablauf pro Request:
 *   1. Pfad prüfen (alles außer `route` → 404).
 *   2. Origin validieren (DNS-Rebinding).
 *   3. Inbound-Auth über die Middleware.
 *   4. FRISCHE McpServer-Instanz via buildServer() (Pflicht ab SDK 1.26).
 *   5. An createMcpHandler aus `agents/mcp` delegieren (Streamable HTTP).
 *
 * Auth-Kontext wird als authContext.props an createMcpHandler übergeben und ist
 * in Tools via getMcpAuthContext() erreichbar.
 *
 * Für Session-State/Elicitation stattdessen McpAgent + Durable Object nutzen
 * (siehe Foundation-README); dieser Adapter ist bewusst stateless.
 */
export function createWorkerHandler(opts: WorkerHandlerOptions): FetchHandler {
  const route = opts.route ?? "/mcp";
  const originCheck = createOriginCheck(opts.allowedOrigins ?? []);
  const log = opts.logger;

  return async (request, env, ctx) => {
    const url = new URL(request.url);
    if (url.pathname !== route) {
      return jsonResponse(404, { error: "Not Found" });
    }

    if (!originCheck(request)) {
      log?.warn("origin rejected", { origin: request.headers.get("Origin") });
      return jsonResponse(403, { error: "Origin not allowed" });
    }

    const authResult = await opts.auth.authenticate(request, env);
    if (!authResult.ok) {
      log?.warn("auth rejected", {
        status: authResult.status,
        reason: authResult.message,
      });
      return jsonResponse(authResult.status ?? 401, {
        error: authResult.message ?? "Unauthorized",
      });
    }

    // Frische Instanz pro Request — kein Singleton.
    const server = opts.buildServer({ env, auth: authResult.context });

    // sessionIdGenerator: undefined erzwingt echten Stateless-Betrieb.
    // createMcpHandler defaultet sonst auf () => crypto.randomUUID() (stateful);
    // der Folge-Request träfe eine frische Worker-Invocation ohne diese Session
    // (kein Durable Object, kein storage) → "Session terminated" (-32600).
    const handler = createMcpHandler(server, {
      route,
      sessionIdGenerator: undefined,
      ...(authResult.context
        ? { authContext: { props: authResult.context } }
        : {}),
    });

    return handler(request, env, ctx);
  };
}
