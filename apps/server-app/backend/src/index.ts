// tiny-voca-ja server app (Route A): Express + onnxruntime-node.
//
// POST /api/speak { text, voice?: "F2"|"M2", speed?: 0.5..2, vocoder?: boolean }
//   -> audio/wav (24 kHz, 16-bit PCM, mono)
// Text is phonemized by @tiny-voca-ja/phonemizer (kuromoji + rules),
// the waveform is synthesized by the ONNX model in packages/model-assets.
// With vocoder: true the synthesized waveform is re-synthesized through
// the HiFi-GAN vocoder in packages/model-assets/vocoder_gen.onnx
// (log-mel extraction in src/mel.ts, inference in src/vocoder.ts).

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";
import express from "express";
import * as ort from "onnxruntime-node";
import { initPhonemizer, phonemize } from "@tiny-voca-ja/phonemizer";
import { Vocoder } from "./vocoder.js";

dotenv.config();

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, "..");
const modelPath =
  process.env.MODEL_PATH ||
  resolve(backendRoot, "../../../packages/model-assets/model.onnx");
const meta = JSON.parse(
  readFileSync(resolve(dirname(modelPath), "meta.json"), "utf8"),
) as { sample_rate: number; hop: number; max_frames: number; max_tokens: number; voices: string[] };
const vocoderPath =
  process.env.VOCODER_MODEL_PATH ||
  resolve(dirname(modelPath), "vocoder_gen.onnx");
const vocoder = new Vocoder(vocoderPath);

const require = createRequire(import.meta.url);
const dicPath = join(dirname(require.resolve("kuromoji/package.json")), "dict");

// Deterministic standard-normal noise (mulberry32 + Box-Muller), seed 0.
// The model treats it as vocoder excitation; a fixed stream makes the
// output reproducible for a given input.
function makeNoise(length: number): Float32Array {
  let a = 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 2) {
    const u1 = Math.max(next(), 1e-12);
    const u2 = next();
    const r = Math.sqrt(-2 * Math.log(u1));
    out[i] = r * Math.cos(2 * Math.PI * u2);
    if (i + 1 < length) out[i + 1] = r * Math.sin(2 * Math.PI * u2);
  }
  return out;
}

function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buffer;
}

const noise = makeNoise(meta.max_frames * meta.hop);
let session: ort.InferenceSession;

const app = express();
app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: "tiny-voca-ja", voices: meta.voices, vocoder: vocoder.available });
});

app.post("/api/speak", async (req, res) => {
  try {
    const { text, voice = "F2", speed = 1, vocoder: useVocoder = false } = req.body ?? {};
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text is required" });
    }
    if (text.length > 200) {
      return res.status(400).json({ error: "text is too long (max 200 chars)" });
    }
    const speaker = meta.voices.indexOf(voice);
    if (speaker < 0) {
      return res.status(400).json({ error: `voice must be one of ${meta.voices.join(", ")}` });
    }
    const spd = Number(speed);
    if (!Number.isFinite(spd) || spd < 0.5 || spd > 2) {
      return res.status(400).json({ error: "speed must be between 0.5 and 2" });
    }
    const { ids, stress } = await phonemize(text.trim());
    if (ids.length > meta.max_tokens) {
      return res.status(400).json({ error: "text is too long for one utterance" });
    }
    const feeds: Record<string, ort.Tensor> = {
      tokens: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      stress: new ort.Tensor("int64", BigInt64Array.from(stress.map(BigInt)), [1, ids.length]),
      speaker: new ort.Tensor("int64", BigInt64Array.from([BigInt(speaker)]), [1]),
      speed: new ort.Tensor("float32", Float32Array.from([spd]), [1]),
      noise: new ort.Tensor("float32", noise, [1, noise.length]),
    };
    const out = await session.run(feeds);
    const wave = out.wave.data as Float32Array;
    const samples = Number(out.samples.data[0]);
    let trimmed: Float32Array = wave.subarray(0, samples);
    if (useVocoder === true) {
      if (!vocoder.available) {
        return res.status(503).json({
          error: "vocoder model not found; run `node tools/fetch-vocoder-model.mjs` first",
        });
      }
      trimmed = await vocoder.vocode(Float32Array.from(trimmed));
    }
    let peak = 0;
    for (const v of trimmed) peak = Math.max(peak, Math.abs(v));
    if (peak > 0.99) {
      const scale = 0.99 / peak;
      trimmed = Float32Array.from(trimmed, (v) => v * scale);
    }
    res.set("Content-Type", "audio/wav");
    res.set("X-Phonemes", String(ids.length));
    res.set("X-Vocoder", useVocoder === true ? "on" : "off");
    res.send(encodeWav(trimmed, meta.sample_rate));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "synthesis failed" });
  }
});

const port = Number(process.env.PORT || 3001);
await initPhonemizer(dicPath);
session = await ort.InferenceSession.create(modelPath);
app.listen(port, () => {
  console.log(`tiny-voca-ja server listening on http://localhost:${port}`);
});
