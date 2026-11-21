// HiFi-GAN vocoder post-processing (ONNX).
//
// The vocoder generator was exported from the mel + HiFi-GAN pilot
// (tiny-voca-ja/vocoder-pilot, round 2: pretrained VCTK_V2 init, 90k steps)
// and verified against the PyTorch model (correlation 1.000000).
// Model file: packages/model-assets/vocoder_gen.onnx
//   input  "mel": float32 [1, 80, frames]  (log-mel, see src/mel.ts)
//   output "wav": float32 [1, 1, samples]  (samples = frames * 256)
// Fetch it with tools/fetch-vocoder-model.mjs when it is missing.

import { existsSync } from "node:fs";
import * as ort from "onnxruntime-node";
import { extractMel, MEL_HOP } from "./mel.js";

export class Vocoder {
  private session: ort.InferenceSession | null = null;
  private loading: Promise<ort.InferenceSession> | null = null;

  constructor(private readonly modelPath: string) {}

  get available(): boolean {
    return existsSync(this.modelPath);
  }

  private async getSession(): Promise<ort.InferenceSession> {
    if (this.session) return this.session;
    if (!this.loading) {
      this.loading = ort.InferenceSession.create(this.modelPath).then((s) => {
        this.session = s;
        return s;
      });
    }
    return this.loading;
  }

  /** Re-synthesize a 24 kHz waveform through the vocoder. */
  async vocode(wav: Float32Array): Promise<Float32Array> {
    const session = await this.getSession();
    const { mel, frames } = extractMel(wav);
    const feeds: Record<string, ort.Tensor> = {
      mel: new ort.Tensor("float32", mel, [1, 80, frames]),
    };
    const out = await session.run(feeds);
    const data = out.wav.data as Float32Array;
    // The generator emits frames * hop samples; trim to the input length
    // so the vocoded version lines up with the original.
    const expected = frames * MEL_HOP;
    const full = data.length >= expected ? data.subarray(0, expected) : data;
    return full.length > wav.length ? full.slice(0, wav.length) : Float32Array.from(full);
  }
}
