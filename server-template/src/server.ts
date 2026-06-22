import { McpServer } from "mcp-foundation/sdk";
import { z } from "mcp-foundation/schema";
import type { BuildServer } from "mcp-foundation/core";
import { createAllowlistedRegistrar } from "mcp-foundation/tooling";

/**
 * Allowlist: die einzige Wahrheit darüber, welche Tools live gehen.
 * Jedes Tool muss hier stehen, sonst wirft die Registrierung beim Bauen.
 * Einträge sind der Tool-`name`: <verb>_<objekt>, snake_case, kein Prefix.
 */
const TOOL_ALLOWLIST = ["ping"] as const;

/**
 * buildServer wird PRO REQUEST aufgerufen → immer eine frische Instanz.
 * Niemals einen McpServer im Modul-Scope cachen (CVE-Guard ab SDK 1.26).
 */
export const buildServer: BuildServer = ({ env, auth }) => {
  const server = new McpServer({ name: "<service>-mcp", version: "1.0.0" });
  const register = createAllowlistedRegistrar(server, TOOL_ALLOWLIST);

  // Outbound-Secrets kommen NUR aus env (wrangler secret), nie aus dem Code.
  // Name = <AUSSTELLER>_<TYP> (siehe secrets.md). Fehlt ein Pflicht-Secret, hier hart
  // werfen — der Fehler erscheint dann nach dem Consent, vor den Tools
  // ("Authorization failed", siehe secrets.md):
  //   const apiKey = env.GOOGLE_API_KEY;
  //   if (typeof apiKey !== "string" || !apiKey) throw new Error("GOOGLE_API_KEY not configured");

  // name = <verb>_<objekt>, snake_case, KEIN Service-Prefix (Regex
  // ^[a-zA-Z0-9_-]{1,64}$). title = menschenlesbarer Anzeigename (Title Case,
  // Leerzeichen erlaubt) — steht NUR hier im Config-Objekt, NIE in der
  // TOOL_ALLOWLIST. Objekt nicht weglassen (list_files, nicht list).
  register(
    "ping",
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

  return server;
};
