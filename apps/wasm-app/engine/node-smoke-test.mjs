import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import factory from '/home/hatch/workspace/tiny-voca-ja-web/apps/wasm-app/frontend/public/engine/tv_engine.js';
import { initPhonemizer, phonemize } from '/home/hatch/workspace/tiny-voca-ja-web/packages/phonemizer/dist/phonemizer.js';
const ROOT = '/home/hatch/workspace/tiny-voca-ja-web/apps/wasm-app/frontend/public';
const wasmBytes = readFileSync(`${ROOT}/engine/tv_engine.wasm`);
const mod = await factory({
  locateFile: (p) => pathToFileURL(`${ROOT}/engine/${p}`).href,
  instantiateWasm: async (info, receiveInstance) => {
    const { instance } = await WebAssembly.instantiate(wasmBytes, info);
    receiveInstance(instance);
  },
});
const bin = readFileSync(`${ROOT}/model/tvoca.bin`);
const binPtr = mod._malloc(bin.length);
mod.HEAPU8.set(bin, binPtr);
const rc = mod._tvw_init(binPtr, bin.length);
// Do NOT free binPtr: the C model is zero-copy and points into this buffer
// for its whole lifetime (see frontend/src/engine.ts).
console.log('init rc:', rc);
if (rc !== 0) process.exit(2);

await initPhonemizer(`${ROOT}/kuromoji-dict/`);
const ph = await phonemize('今日は晴れです。');
console.log('phonemes:', ph.ids.length, 'unknown:', JSON.stringify(ph.unknown));

const ids = Int32Array.from(ph.ids);
const stress = Int32Array.from(ph.stress);
const idsPtr = mod._malloc(ids.length * 4);
mod.HEAP32.set(ids, idsPtr >> 2);
const stPtr = mod._malloc(stress.length * 4);
mod.HEAP32.set(stress, stPtr >> 2);
const outSamplesPtr = mod._malloc(4);
const outSatPtr = mod._malloc(4);
const audioPtr = mod._tvw_synth(idsPtr, stPtr, ids.length, 0, 1.0, outSamplesPtr, outSatPtr);
const n = mod.HEAP32[outSamplesPtr >> 2];
const sat = mod.HEAP32[outSatPtr >> 2];
console.log('audioPtr:', audioPtr, 'n_samples:', n, 'saturations:', sat);
if (!audioPtr || n <= 0) process.exit(3);
const samples = new Float32Array(mod.HEAPF32.buffer, audioPtr, n).slice();
let peak = 0;
for (const s of samples) peak = Math.max(peak, Math.abs(s));
console.log('duration_s:', (n / 24000).toFixed(2), 'peak:', peak.toFixed(4));
const buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22); buf.writeUInt32LE(24000, 24); buf.writeUInt32LE(48000, 28);
buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36);
buf.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
writeFileSync('/tmp/wasm-smoke.wav', buf);
mod._tvw_free(audioPtr);
console.log('WROTE /tmp/wasm-smoke.wav');
