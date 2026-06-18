#!/usr/bin/env node
/**
 * Eject: macht ein Kundenrepo self-contained, indem die Foundation aus
 * node_modules nach ./vendor/mcp-foundation kopiert und die externe Git-Dep
 * entfernt wird. Danach gibt es keine Propagation mehr — der Kunde besitzt
 * eine eingefrorene Kopie.
 *
 * Ausführen IM KUNDENREPO (normaler User, nicht root):
 *   npx mcp-foundation-eject
 *   # oder direkt: node node_modules/mcp-foundation/src/tooling/eject.mjs
 *
 * Das Script ist absichtlich konservativ: es kopiert und meldet die manuellen
 * Restschritte, statt package.json/tsconfig automatisch umzuschreiben.
 */
import { cp, readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";

const CWD = process.cwd();
const SRC = resolve(CWD, "node_modules", "mcp-foundation", "src");
const DEST = resolve(CWD, "vendor", "mcp-foundation");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(SRC))) {
    console.error(
      `[eject] Foundation-Quelle nicht gefunden: ${SRC}\n` +
        `        Im Kundenrepo ausführen, in dem mcp-foundation installiert ist.`,
    );
    process.exit(1);
  }

  await cp(SRC, DEST, { recursive: true });
  console.log(`[eject] Foundation kopiert → ${DEST}`);

  // package.json-Hinweis
  let depHint = "";
  const pkgPath = join(CWD, "package.json");
  if (await exists(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    const found = ["dependencies", "devDependencies"].find(
      (k) => pkg[k] && pkg[k]["mcp-foundation"],
    );
    if (found) {
      depHint = `   - "${found}": Eintrag "mcp-foundation" entfernen\n`;
    }
  }

  console.log(
    `\n[eject] Manuelle Restschritte (bewusst nicht automatisiert):\n` +
      depHint +
      `   - tsconfig.json: paths-Alias setzen\n` +
      `       "paths": { "mcp-foundation/*": ["./vendor/mcp-foundation/*/index.ts"] }\n` +
      `   - Imports bleiben unverändert ("mcp-foundation/core" etc.) — der Alias\n` +
      `     zeigt jetzt auf das vendor-Verzeichnis.\n` +
      `   - pnpm install (entfernt die externe Dep aus dem Lockfile)\n` +
      `   - Typecheck + Inspector-Smoke-Test, dann Ownership übertragen.\n`,
  );
}

main().catch((err) => {
  console.error("[eject] Fehlgeschlagen:", err);
  process.exit(1);
});
