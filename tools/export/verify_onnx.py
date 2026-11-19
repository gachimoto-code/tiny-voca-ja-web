#!/usr/bin/env python
"""Verify the exported ONNX model against PyTorch synthesis.

Feeds identical tokens/stress/speaker/speed and the same seed-0 noise
stream to both, and reports the max/mean absolute waveform difference
over the valid samples. Also writes both waveforms as WAV for listening
or ASR checks.

Usage:
  python verify_onnx.py --checkpoint inference.pt --onnx model.onnx \
      --fixture /path/to/phonemizer/tests/fixture.json
"""

import argparse
import json

import numpy as np
import torch

from tiny_voca.infer import load_model


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--onnx", required=True)
    ap.add_argument("--fixture", required=True)
    ap.add_argument("--entries", default="2,3")
    args = ap.parse_args()

    import onnxruntime as ort

    model = load_model(args.checkpoint, check_frontend=False)
    meta = json.load(open(args.onnx + ".json"))
    session = ort.InferenceSession(args.onnx, providers=["CPUExecutionProvider"])
    fixture = json.load(open(args.fixture))

    for idx in [int(x) for x in args.entries.split(",")]:
        entry = fixture[idx]
        ids = entry["ids"]
        stress = entry["stress"]
        tokens = torch.tensor([ids], dtype=torch.int64)
        stress_t = torch.tensor([stress], dtype=torch.int64)
        speaker = torch.tensor([0], dtype=torch.int64)  # F2
        with torch.no_grad():
            wave_pt, lengths, _ = model.synthesize(
                tokens, stress_t, torch.tensor([len(ids)]), speaker, 1.0, 0.0, 0, 1.0
            )
        n = int(lengths[0])
        ref = wave_pt[0, :n].numpy()

        rng = torch.Generator().manual_seed(0)
        noise = torch.randn(1, meta["max_frames"] * meta["hop"], generator=rng).numpy()
        wave_onnx, samples = session.run(
            ["wave", "samples"],
            {
                "tokens": np.array([ids], dtype=np.int64),
                "stress": np.array([stress], dtype=np.int64),
                "speaker": np.array([0], dtype=np.int64),
                "speed": np.array([1.0], dtype=np.float32),
                "noise": noise,
            },
        )
        got = wave_onnx[0, : int(samples[0])]
        assert got.shape == ref.shape, (got.shape, ref.shape)
        diff = np.abs(got - ref)
        corr = float(np.corrcoef(got, ref)[0, 1])
        print(f"entry {idx}: {entry['text'][:24]}... samples={n} "
              f"max|diff|={diff.max():.6f} mean|diff|={diff.mean():.6f} corr={corr:.6f}")


if __name__ == "__main__":
    main()
