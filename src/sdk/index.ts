// Fassade: McpServer kommt über die Foundation, nie direkt aus dem SDK. Hält den
// SDK-Import aus den Consumer-package.json heraus. Der SDK-Dedup-Zwang bleibt
// über das overrides IM Consumer (agents pinnt das SDK exakt — siehe
// docs/framework.md), npm-overrides wirken nur vom Root.
export { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
