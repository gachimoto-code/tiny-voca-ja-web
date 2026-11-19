// Copy runtime assets into public/: the model weights (from the shared
// model-assets package) and the kuromoji dictionary files.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(root, "..", "..", "..");
mkdirSync(join(root, "public", "model"), { recursive: true });
cpSync(join(repoRoot, "packages/model-assets/tvoca.bin"), join(root, "public", "model", "tvoca.bin"));
const dictCandidates = [
  join(root, "node_modules", "kuromoji", "dict"),
  join(repoRoot, "node_modules", "kuromoji", "dict"),
];
const dictSrc = dictCandidates.find((p) => existsSync(p));
if (!dictSrc) {
  console.error("kuromoji dict not found; run npm install first");
  process.exit(1);
}
cpSync(dictSrc, join(root, "public", "kuromoji-dict"), { recursive: true });
console.log("assets prepared: public/model/tvoca.bin, public/kuromoji-dict/");
