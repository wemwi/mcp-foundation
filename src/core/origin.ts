/**
 * Origin-Header-Validierung (DNS-Rebinding-Schutz).
 *
 * MCP-Spec-Pflicht für HTTP-Transports: Requests mit fremdem Origin ablehnen,
 * damit eine bösartige Website den lokal/remote erreichbaren Server nicht
 * über den Browser des Opfers ansprechen kann.
 *
 * Server-to-Server-Clients (z.B. Console Managed Agents) senden i.d.R. KEINEN
 * Origin-Header — diese werden durchgelassen. Nur ein GESETZTER, nicht
 * erlaubter Origin wird blockiert.
 */
export type OriginCheck = (request: Request) => boolean;

export function createOriginCheck(
  allowedOrigins: readonly string[],
): OriginCheck {
  const allowAny = allowedOrigins.includes("*");
  const allowed = new Set(allowedOrigins);
  return (request) => {
    const origin = request.headers.get("Origin");
    // Kein Origin → kein Browser-Kontext → durchlassen.
    if (origin === null || origin === "") return true;
    if (allowAny) return true;
    return allowed.has(origin);
  };
}
