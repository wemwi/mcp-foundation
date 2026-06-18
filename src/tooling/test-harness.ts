/**
 * Leichtgewichtiges Test-Harness für MCP-fetch-Handler.
 *
 * Schickt synthetische JSON-RPC-Requests an einen Handler
 * `(request, env, ctx) => Promise<Response>` und parst die Antwort (JSON oder
 * Single-Event-SSE). Gedacht für Unit-Tests von buildServer/Adapter, NICHT als
 * Ersatz für den MCP Inspector gegen den laufenden Worker.
 */

type FetchHandler = (
  request: Request,
  env: Record<string, unknown>,
  ctx: unknown,
) => Promise<Response>;

export interface CallOptions {
  env?: Record<string, unknown>;
  /** Zusätzliche Header, z.B. { Authorization: "Bearer test" }. */
  headers?: Record<string, string>;
  route?: string;
}

let nextId = 1;

/** Minimaler ExecutionContext-Stub. */
function fakeCtx() {
  return { waitUntil: () => {}, passThroughOnException: () => {} };
}

/** Extrahiert den JSON-RPC-Payload aus JSON- oder SSE-Response. */
async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  const contentType = res.headers.get("Content-Type") ?? "";
  if (contentType.includes("text/event-stream")) {
    // Letzte "data:"-Zeile herausziehen.
    const dataLine = text
      .split("\n")
      .reverse()
      .find((line) => line.startsWith("data:"));
    if (!dataLine) return null;
    return JSON.parse(dataLine.slice("data:".length).trim());
  }
  return text ? JSON.parse(text) : null;
}

/** Sendet einen JSON-RPC-Call und gibt Status + geparsten Body zurück. */
export async function callMcp(
  handler: FetchHandler,
  method: string,
  params: Record<string, unknown> = {},
  opts: CallOptions = {},
): Promise<{ status: number; body: unknown }> {
  const route = opts.route ?? "/mcp";
  const request = new Request(`http://localhost${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(opts.headers ?? {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  const res = await handler(request, opts.env ?? {}, fakeCtx());
  return { status: res.status, body: await parseBody(res) };
}

/** Bequemer Shortcut: tools/list. */
export function listTools(handler: FetchHandler, opts?: CallOptions) {
  return callMcp(handler, "tools/list", {}, opts);
}
