// Stub für das optionale "ai"-Paket (Vercel AI SDK).
//
// Das Paket `agents` (von `createMcpHandler` / `createOAuthWorker` eingebunden)
// macht intern ein dynamisches `import("ai")`, um `jsonSchema` zu laden. `ai` ist
// dort nur ein optionaler Peer und wird NICHT mitinstalliert. Ohne diesen Stub
// bricht das esbuild-Bundling beim Deploy mit „Could not resolve 'ai'" ab.
//
// Per `alias` in wrangler.jsonc wird "ai" auf diese Datei umgeleitet. In einem
// stateless MCP-Server wird der Codepfad nicht benötigt; `jsonSchema` ist als
// Passthrough implementiert, damit es auch dann nicht crasht, falls er doch
// einmal erreicht wird.
export const jsonSchema = (schema) => schema;
export default {};
