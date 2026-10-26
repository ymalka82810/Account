// בדיקת טיפוסים בלי חיבור ל-Convex. convex/_generated לא ב-git, אז כאן נוצר types/convex-shim/_generated/api.d.ts
// מרשימת הקבצים ב-convex/ (בדיוק כמו שהכלי של Convex עושה), ואז tsc רץ על ה-backend ועל ה-frontend.
import { readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const mods = readdirSync("convex").filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts")).map((f) => f.slice(0, -3)).sort();
const lines = [
  "// נוצר אוטומטית ע\"י scripts/typecheck.mjs. לא לערוך.",
  'import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";',
  ...mods.map((m) => `import type * as ${m} from "../${m}.js";`),
  `declare const fullApi: ApiFromModules<{ ${mods.map((m) => `${m}: typeof ${m}`).join("; ")} }>;`,
  'export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;',
  'export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;',
];
writeFileSync("types/convex-shim/_generated/api.d.ts", lines.join("\n") + "\n");

// ה-backend נבדק ב-strict. ה-frontend ב-JS נבדק ב-checkJs רגיל. שגיאות בקבצי convex/ שמופיעות בו הן רעש
// של מצב לא-strict (הן נבדקות כבר בריצת ה-backend). שגיאות props חסרים ברכיבי React (TS2739/TS2741, והודעות IntrinsicAttributes)
// מסוננות, כי הרכיבים לא מוגדרים עם טיפוסים.
const run = (project) => spawnSync("npx", ["tsc", "-p", project, "--pretty", "false"], { encoding: "utf8", shell: true }).stdout;
const errorLines = (out, keep) => out.split("\n").filter((l) => l.includes("error TS") && keep(l));

console.log("backend (strict)");
const be = errorLines(run("tsconfig.convex.json"), () => true);
be.forEach((l) => console.log(l));

console.log("frontend (checkJs)");
const fe = errorLines(run("tsconfig.json"), (l) => l.startsWith("src-react") && !/error TS(2739|2741):|IntrinsicAttributes/.test(l));
fe.forEach((l) => console.log(l));

console.log(`${be.length + fe.length} שגיאות`);
process.exit(be.length + fe.length ? 1 : 0);
