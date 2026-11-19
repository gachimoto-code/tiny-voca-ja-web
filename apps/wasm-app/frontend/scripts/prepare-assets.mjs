// Copy runtime assets into public/: the model weights (from the shared
// model-assets package) and the kuromoji dictionary files.
// Also stage the generated Emscripten engine JS under src/engine-dist/ so
// the app can import it as a regular module: Vite refuses to serve files
// from /public through its module pipeline, so importing the engine from
// /public directly breaks in dev. The .wasm stays in /public/engine/ and
// is fetched at runtime via locateFile.
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
const engineSrc = join(root, "public", "engine", "tv_engine.js");
if (existsSync(engineSrc)) {
  mkdirSync(join(root, "src", "engine-dist"), { recursive: true });
  cpSync(engineSrc, join(root, "src", "engine-dist", "tv_engine.js"));
  console.log("engine staged: src/engine-dist/tv_engine.js");
} else {
  console.warn("warning: public/engine/tv_engine.js not found; place the built engine files (tv_engine.js / tv_engine.wasm) in public/engine/ first");
}
