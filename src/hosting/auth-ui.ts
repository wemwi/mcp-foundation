/**
 * OAuth-Login-Seite (der `defaultHandler` des OAuthProvider).
 *
 * Das ist der „Empfangstresen" für Option A (eigene Passwort-Login-Seite):
 * der Provider implementiert /token, /register und die /.well-known-Discovery
 * selbst — NUR /authorize bauen wir hier.
 *
 * Zwei Pflicht-Schutzmechanismen laut Cloudflare-Securing-Doc:
 *   1. CSRF-Token: Cookie-Wert und Form-Feld müssen übereinstimmen.
 *   2. State-Token in KV (kurze TTL): hält den OAuth-Request zwischen Anzeige
 *      des Formulars und Absenden zusammen.
 *
 * Identität = ein Passwort. Im Worker liegt NUR der SHA-256-Hash
 * (`MCP_AUTH_PASSWORD_HASH`), nie das Klartext-Passwort.
 */
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { Logger } from "../logging/logger.js";

/**
 * Worker-Env für den OAuth-Pfad. Beide Bindings sind Provider-Konvention:
 *   - OAUTH_KV     : KV-Namespace, im Provider HARDCODIERT (nicht umbenennbar).
 *   - OAUTH_PROVIDER: vom Provider zur Laufzeit injiziert (Helper-API).
 */
export interface OAuthEnv {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  [key: string]: unknown;
}

export interface LoginUiOptions {
  /**
   * Env-Variable (wrangler secret) mit dem SHA-256-Hex des Passworts.
   * Default "MCP_AUTH_PASSWORD_HASH". Nie das Klartext-Passwort ablegen.
   */
  passwordHashEnvVar?: string;
  /** userId, die auf dem Grant vermerkt wird. Default "user". */
  userId?: string;
  /**
   * Props, die an completeAuthorization gehen und später als ctx.props beim
   * apiHandler landen. Default `{ user: <userId> }`.
   */
  props?: Record<string, unknown>;
  /** Default-Scope, falls der Client keinen anfragt. Default ["mcp"]. */
  defaultScope?: readonly string[];
  /** Browser-Tab-/Überschrift-Branding der Login-Seite. */
  title?: string;
  heading?: string;
  /** TTL des zwischengelagerten Login-States in KV (Sekunden). Default 600. */
  stateTtlSeconds?: number;
  /** Optionaler strukturierter Logger. */
  logger?: Logger;
}

/** SHA-256-Hex einer Eingabe (runtime-agnostisch über WebCrypto). */
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Konstant-Zeit-Vergleich (kein Timing-Leak). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(request: Request, name: string): string {
  return (
    (request.headers.get("Cookie") ?? "")
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}

function htmlResponse(body: string, status = 200, extra?: HeadersInit): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...(extra ?? {}) },
  });
}

/**
 * Baut den `defaultHandler` für den OAuthProvider: eine Passwort-Login-Seite
 * unter /authorize (GET zeigt das Formular, POST schließt die Autorisierung ab).
 * Alle anderen Pfade → 404 (Token/Register/Discovery macht der Provider selbst).
 */
export function createLoginUiHandler(opts: LoginUiOptions = {}) {
  const passwordHashEnvVar = opts.passwordHashEnvVar ?? "MCP_AUTH_PASSWORD_HASH";
  const userId = opts.userId ?? "user";
  const props = opts.props ?? { user: userId };
  const defaultScope = opts.defaultScope ?? ["mcp"];
  const title = opts.title ?? "MCP — Login";
  const heading = opts.heading ?? "MCP-Zugang freigeben";
  const stateTtl = opts.stateTtlSeconds ?? 600;
  const log = opts.logger;

  function loginForm(csrf: string, stateKey: string, error?: string): string {
    return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <body style="font-family:system-ui;max-width:22rem;margin:4rem auto;padding:0 1rem">
    <h1 style="font-size:1.1rem">${heading}</h1>
    ${error ? `<p style="color:#c00">${error}</p>` : ""}
    <form method="POST" action="/authorize">
      <input type="hidden" name="csrf" value="${csrf}">
      <input type="hidden" name="state_key" value="${stateKey}">
      <input type="password" name="password" placeholder="Passwort" autofocus required
             style="width:100%;padding:.6rem;margin:.4rem 0">
      <button type="submit" style="width:100%;padding:.6rem">Erlauben</button>
    </form>
  </body>`;
  }

  return {
    async fetch(
      request: Request,
      env: OAuthEnv,
      _ctx: ExecutionContext,
    ): Promise<Response> {
      const url = new URL(request.url);

      // /authorize GET → Login-Formular zeigen.
      if (url.pathname === "/authorize" && request.method === "GET") {
        const oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);

        const csrf = crypto.randomUUID();
        const stateKey = crypto.randomUUID();

        // Original-OAuth-Request für den POST in KV zwischenlagern.
        await env.OAUTH_KV.put(
          `login_state:${stateKey}`,
          JSON.stringify(oauthReqInfo),
          { expirationTtl: stateTtl },
        );

        const cookie =
          `__Host-CSRF=${csrf}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${stateTtl}`;

        return htmlResponse(loginForm(csrf, stateKey), 200, {
          "Set-Cookie": cookie,
        });
      }

      // /authorize POST → CSRF + Passwort prüfen, Autorisierung abschließen.
      if (url.pathname === "/authorize" && request.method === "POST") {
        const form = await request.formData();
        const csrfForm = String(form.get("csrf") ?? "");
        const stateKey = String(form.get("state_key") ?? "");
        const password = String(form.get("password") ?? "");

        // CSRF: Cookie-Wert muss zum Form-Wert passen.
        const cookieCsrf = readCookie(request, "__Host-CSRF");
        if (!csrfForm || !timingSafeEqual(csrfForm, cookieCsrf)) {
          log?.warn("authorize CSRF check failed");
          return new Response("CSRF check failed", { status: 403 });
        }

        // Passwort gegen den serverseitigen Hash prüfen.
        // Diagnose: nur die Schlüsselnamen des env loggen, niemals die Werte.
        log?.info("authorize env keys", { keys: Object.keys(env ?? {}) });
        const expectedHash = env[passwordHashEnvVar];
        if (typeof expectedHash !== "string" || expectedHash.length === 0) {
          log?.warn("authorize password hash not configured", {
            envVar: passwordHashEnvVar,
          });
          return new Response("Server misconfigured", { status: 500 });
        }
        const inputHash = await sha256Hex(password);
        if (!timingSafeEqual(inputHash, expectedHash)) {
          log?.warn("authorize wrong password");
          return htmlResponse(
            loginForm(csrfForm, stateKey, "Falsches Passwort"),
            401,
          );
        }

        // Original-Request aus KV wiederherstellen (einmalig).
        const stored = await env.OAUTH_KV.get(`login_state:${stateKey}`);
        if (!stored) {
          return new Response("Session abgelaufen", { status: 400 });
        }
        await env.OAUTH_KV.delete(`login_state:${stateKey}`);
        const oauthReqInfo = JSON.parse(stored) as AuthRequest;

        // Autorisierung abschließen → Provider stellt Code/Token aus.
        const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
          request: oauthReqInfo,
          userId,
          scope: oauthReqInfo.scope?.length
            ? oauthReqInfo.scope
            : [...defaultScope],
          metadata: {},
          props,
        });

        log?.info("authorization completed", { userId });
        return Response.redirect(redirectTo, 302);
      }

      return new Response("Not found", { status: 404 });
    },
  };
}
