// Download the HiFi-GAN vocoder model into packages/model-assets/.
//
// The vocoder binary (vocoder_gen.onnx, ~3.8 MB) is hosted on Hugging Face
// and is not committed to this repository. Run once after cloning:
//
//   node tools/fetch-vocoder-model.mjs
//
// Skips the download when the file already exists (pass --force to redo it).

import { createWriteStream, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const URL =
  "https://huggingface.co/gachimoto/tiny-voca-ja/resolve/main/vocoder/gen_final.onnx";
const dest = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/model-assets/vocoder_gen.onnx",
);

if (existsSync(dest) && !process.argv.includes("--force")) {
  console.log(`already exists: ${dest} (use --force to re-download)`);
  process.exit(0);
}

console.log(`downloading ${URL}`);
const res = await fetch(URL);
if (!res.ok || !res.body) {
  console.error(`download failed: HTTP ${res.status}`);
  process.exit(1);
}
await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
console.log(`saved: ${dest}`);
