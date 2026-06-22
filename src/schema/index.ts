// Fassade: zod läuft ausschließlich über die Foundation. Consumer importieren
// `z` aus "mcp-foundation/schema", nie direkt aus "zod" — so teilen Consumer und
// SDK garantiert dieselbe zod-Instanz, ohne dass der Consumer zod selbst
// deklarieren oder per overrides deduplizieren muss.
export { z } from "zod";
