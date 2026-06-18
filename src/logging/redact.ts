/**
 * Secret-Redaction für strukturiertes Logging.
 *
 * Zwei Ebenen:
 *  1. Key-basiert: Werte zu sensiblen Keys (token, secret, password, …) werden
 *     durch "[REDACTED]" ersetzt.
 *  2. String-Scrubbing: "Bearer <token>" in beliebigen Strings wird maskiert,
 *     falls ein Token doch mal in einer Message landet.
 */

const SECRET_KEY = /(authorization|bearer|token|secret|password|api[_-]?key|cookie|set-cookie)/i;
const BEARER_IN_TEXT = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi;

const REDACTED = "[REDACTED]";

function scrubString(value: string): string {
  return value.replace(BEARER_IN_TEXT, "Bearer [REDACTED]");
}

/**
 * Liefert eine redaktierte Kopie eines beliebigen Wertes. Zyklen werden über
 * ein WeakSet abgefangen. Mutiert die Eingabe nicht.
 */
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;

  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? REDACTED : redact(val, seen);
  }
  return out;
}
