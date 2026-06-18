import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Kontext, den der Hosting-Adapter pro Request an die buildServer-Factory
 * übergibt. `auth` enthält den von der Auth-Middleware gelieferten Kontext
 * (z.B. authMethod, später OAuth-Claims).
 */
export interface ServerContext {
  /** Worker-Environment (Secrets, Bindings). Bewusst untypisiert — jeder
   *  Server tippt sein eigenes Env in seiner index.ts. */
  env: Record<string, unknown>;
  /** Von der Auth-Middleware gelieferter Kontext, falls authentifiziert. */
  auth?: Record<string, unknown>;
}

/**
 * Factory, die PRO REQUEST eine frische McpServer-Instanz baut.
 *
 * Pflicht ab MCP SDK 1.26: stateless Server dürfen KEINE McpServer- oder
 * Transport-Instanz im globalen Scope teilen (CVE — Cross-Client-Leak).
 * Der Hosting-Adapter ruft diese Factory bei jedem Request neu auf.
 */
export type BuildServer = (ctx: ServerContext) => McpServer;
