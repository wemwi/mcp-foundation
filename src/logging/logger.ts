import { redact } from "./redact.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  /** Erzeugt einen Child-Logger mit fest gebundenem Kontext (z.B. server, requestId). */
  child(bindings: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  /** Minimales Level, das ausgegeben wird (Default "info"). */
  level?: LogLevel;
  /** Fest an jede Zeile gebundener Kontext. */
  bindings?: Record<string, unknown>;
  /** Sink — Default: console. Für Tests überschreibbar. */
  sink?: (line: string) => void;
}

/**
 * Strukturierter Logger: gibt eine JSON-Zeile pro Log aus. Alle Metadaten
 * laufen durch die Secret-Redaction, bevor sie serialisiert werden.
 */
export function createLogger(opts: LoggerOptions = {}): Logger {
  const minLevel = LEVEL_ORDER[opts.level ?? "info"];
  const bindings = opts.bindings ?? {};
  const sink = opts.sink ?? ((line: string) => console.log(line));

  function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    if (LEVEL_ORDER[level] < minLevel) return;
    const record = {
      level,
      time: new Date().toISOString(),
      msg: message,
      ...bindings,
      ...(meta ? (redact(meta) as Record<string, unknown>) : {}),
    };
    sink(JSON.stringify(record));
  }

  return {
    debug: (m, meta) => emit("debug", m, meta),
    info: (m, meta) => emit("info", m, meta),
    warn: (m, meta) => emit("warn", m, meta),
    error: (m, meta) => emit("error", m, meta),
    child: (childBindings) =>
      createLogger({
        level: opts.level,
        bindings: { ...bindings, ...childBindings },
        sink,
      }),
  };
}
