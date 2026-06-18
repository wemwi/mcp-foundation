import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BuildServer } from "mcp-foundation/core";
import { createAllowlistedRegistrar } from "mcp-foundation/tooling";

/**
 * Allowlist: die einzige Wahrheit darüber, welche Tools live gehen.
 * Jedes Tool muss hier stehen, sonst wirft die Registrierung.
 */
const TOOL_ALLOWLIST = ["example.ping"] as const;

/**
 * buildServer wird PRO REQUEST aufgerufen → immer eine frische Instanz.
 * Niemals einen McpServer im Modul-Scope cachen (CVE-Guard ab SDK 1.26).
 */
export const buildServer: BuildServer = ({ env, auth }) => {
  const server = new McpServer({
    name: "example-mcp",
    version: "1.0.0",
  });

  const register = createAllowlistedRegistrar(server, TOOL_ALLOWLIST);

  register(
    "example.ping",
    {
      title: "Ping",
      description: "Antwortet mit pong und der Auth-Methode.",
      inputSchema: { message: z.string().optional() },
    },
    async ({ message }) => {
      const method =
        typeof auth?.authMethod === "string" ? auth.authMethod : "none";
      return {
        content: [
          {
            type: "text" as const,
            text: `pong (${method})${message ? `: ${message}` : ""}`,
          },
        ],
      };
    },
  );

  // Outbound-Secrets kommen NUR aus env (wrangler secret), nie aus dem Code:
  // const apiKey = env.UPSTREAM_API_KEY;

  return server;
};
