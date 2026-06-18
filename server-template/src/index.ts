import { createWorkerHandler } from "mcp-foundation/hosting";
import { createStaticBearerAuth } from "mcp-foundation/core";
import { createLogger } from "mcp-foundation/logging";
import { buildServer } from "./server.js";

/** Typsicheres Env für diesen Server. */
interface Env {
  /** Inbound-Bearer — identisch zum Token im Console-Vault. */
  MCP_INBOUND_TOKEN: string;
  // Outbound-Secrets hier ergänzen, z.B.:
  // UPSTREAM_API_KEY: string;
}

const logger = createLogger({
  level: "info",
  bindings: { server: "example-mcp" },
});

const handler = createWorkerHandler({
  buildServer,
  auth: createStaticBearerAuth({ tokenEnvVar: "MCP_INBOUND_TOKEN" }),
  // Server-to-Server-Agents senden keinen Origin. Browser-Origins hier whitelisten.
  allowedOrigins: [],
  route: "/mcp",
  logger,
});

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handler(request, env as unknown as Record<string, unknown>, ctx);
  },
};
