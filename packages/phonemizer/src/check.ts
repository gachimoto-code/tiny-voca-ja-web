// Compare the TypeScript phonemizer against the Python (pyopenjtalk-plus)
// reference fixture: exact-match rate and per-sentence first differences.
// Usage: npm run build && npm run check
// Env: KUROMOJI_DICT (path to kuromoji dict dir), PHONEMIZER_FIXTURE.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initPhonemizer, phonemize } from "./phonemizer.js";

interface Fixture {
  text: string;
  symbols: string[];
  stress: number[];
  ids: number[];
  unknown: string[];
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const fixturePath = process.env.PHONEMIZER_FIXTURE ?? join(root, "tests", "fixture.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture[];

const dicCandidates = [
  process.env.KUROMOJI_DICT,
  join(root, "node_modules", "kuromoji", "dict"),
  join(root, "..", "..", "node_modules", "kuromoji", "dict"),
].filter((p): p is string => !!p);
const dicPath = dicCandidates.find((p) => existsSync(p));
if (!dicPath) throw new Error("kuromoji dict not found; set KUROMOJI_DICT");

function firstDiff(a: string[], b: string[]): string {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      const ctx = (arr: string[]) => arr.slice(Math.max(0, i - 3), i + 4).join(" ");
      return `at ${i}: py[${ctx(a)}] vs ts[${ctx(b)}]`;
    }
  }
  return "";
}

await initPhonemizer(dicPath);
let exact = 0;
for (const [idx, f] of fixture.entries()) {
  const got = await phonemize(f.text);
  const same = JSON.stringify(got.symbols) === JSON.stringify(f.symbols);
  if (same) exact++;
  console.log(
    `${String(idx + 1).padStart(2)} ${same ? "EXACT" : "diff "} len py=${f.symbols.length} ts=${got.symbols.length}` +
      (same ? "" : " | " + firstDiff(f.symbols, got.symbols)),
  );
}
console.log(`\nexact: ${exact}/${fixture.length}`);
