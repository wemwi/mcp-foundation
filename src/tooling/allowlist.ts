import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type RegisterTool = McpServer["registerTool"];

/**
 * Allowlist statt Denylist: erzeugt einen registerTool-Wrapper, der NUR Tools
 * registriert, deren Name in der Allowlist steht. Ein Tool ohne Eintrag wirft
 * sofort beim Bauen des Servers — so kann kein Tool versehentlich live gehen.
 *
 * Der zurückgegebene Registrar trägt die exakte (überladene) Signatur von
 * McpServer.registerTool, der Aufrufer bekommt also volle Typsicherheit.
 *
 * Nutzung in buildServer():
 *   const register = createAllowlistedRegistrar(server, ["lexware.listInvoices"]);
 *   register("lexware.listInvoices", { ... }, handler);
 */
export function createAllowlistedRegistrar(
  server: McpServer,
  allowlist: readonly string[],
): RegisterTool {
  const allowed = new Set(allowlist);
  const register = ((name: string, ...rest: unknown[]) => {
    if (!allowed.has(name)) {
      throw new Error(
        `Tool "${name}" is not in the allowlist. Add it explicitly to register it.`,
      );
    }
    return (server.registerTool as (...a: unknown[]) => unknown)(name, ...rest);
  }) as RegisterTool;
  return register;
}
