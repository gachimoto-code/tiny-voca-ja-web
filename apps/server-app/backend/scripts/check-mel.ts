// Verify src/mel.ts against the Python (PyTorch) reference fixtures.
//
// Usage:
//   npx tsx scripts/check-mel.ts <fixture-dir>
// where <fixture-dir> contains test_input.wav (24 kHz mono PCM16) and
// test_mel.npy (float32 log-mel, shape [1, 80, frames]).
// Passes when the max abs error in the log domain is < 0.01.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractMel } from "../src/mel.js";

function readWavPcm16(path: string): Float32Array {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF/WAVE file");
  }
  let offset = 12;
  let dataStart = -1;
  let dataLength = 0;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(offset + 10);
      sampleRate = buf.readUInt32LE(offset + 12);
      bits = buf.readUInt16LE(offset + 22);
    } else if (id === "data") {
      dataStart = offset + 8;
      dataLength = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataStart < 0 || channels !== 1 || bits !== 16 || sampleRate !== 24000) {
    throw new Error(`expected mono 16-bit 24kHz wav, got ch=${channels} bits=${bits} sr=${sampleRate}`);
  }
  const n = dataLength / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(dataStart + i * 2) / 32768;
  return out;
}

function readNpyFloat32(path: string): { data: Float32Array; shape: number[] } {
  const buf = readFileSync(path);
  if (buf[0] !== 0x93 || buf.toString("ascii", 1, 6) !== "NUMPY") {
    throw new Error("not an npy file");
  }
  const major = buf[6];
  let headerLen: number;
  let headerStart: number;
  if (major === 1) {
    headerLen = buf.readUInt16LE(8);
    headerStart = 10;
  } else {
    headerLen = buf.readUInt32LE(8);
    headerStart = 12;
  }
  const header = buf.toString("ascii", headerStart, headerStart + headerLen);
  if (!header.includes("'<f4'") && !header.includes('"<f4"')) {
    throw new Error(`expected float32 npy, header: ${header}`);
  }
  if (!/fortran_order['"]?\s*:\s*False/.test(header)) {
    throw new Error(`expected C-order npy, header: ${header}`);
  }
  const shapeMatch = header.match(/'shape':\s*\(([^)]*)\)/);
  if (!shapeMatch) throw new Error(`no shape in header: ${header}`);
  const shape = shapeMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number);
  const dataStart = headerStart + headerLen;
  const count = shape.reduce((a, b) => a * b, 1);
  const data = new Float32Array(count);
  for (let i = 0; i < count; i++) data[i] = buf.readFloatLE(dataStart + i * 4);
  return { data, shape };
}

const fixtureDir = process.argv[2];
if (!fixtureDir) {
  console.error("usage: tsx scripts/check-mel.ts <fixture-dir>");
  process.exit(2);
}

const wav = readWavPcm16(join(fixtureDir, "test_input.wav"));
const ref = readNpyFloat32(join(fixtureDir, "test_mel.npy"));
const [, bands, refFrames] = ref.shape;
const { mel, frames } = extractMel(wav);
console.log(`input samples: ${wav.length}, ts frames: ${frames}, ref shape: [${ref.shape}]`);
if (bands !== 80 || frames !== refFrames) {
  console.error("FAIL: shape mismatch");
  process.exit(1);
}
let maxErr = 0;
let sumSq = 0;
for (let i = 0; i < mel.length; i++) {
  const d = Math.abs(mel[i] - ref.data[i]);
  if (d > maxErr) maxErr = d;
  sumSq += d * d;
}
const rms = Math.sqrt(sumSq / mel.length);
console.log(`max abs err: ${maxErr.toExponential(4)}, rms err: ${rms.toExponential(4)}`);
if (maxErr < 0.01) {
  console.log("PASS: max abs err < 0.01");
} else {
  console.error("FAIL: max abs err >= 0.01");
  process.exit(1);
}
