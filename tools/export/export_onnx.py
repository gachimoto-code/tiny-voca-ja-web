#!/usr/bin/env python
"""Export the tiny-voca-ja checkpoint to ONNX (for the Node/onnxruntime app).

The exported graph is the model's `synthesize` with three changes:
  - batch is fixed to 1 and lengths = [len(tokens)] (the host passes the
    exact token sequence, no padding);
  - the vocoder noise is an INPUT instead of being drawn inside, so the
    host controls the seed. It is a standard-normal stream of
    max_frames * hop samples; the vocoder masks it to the utterance
    length internally, exactly as the padded batch path does;
  - frames are expanded into a fixed max_frames buffer instead of a
    data-dependent size (duration values cannot become graph shapes);
    the valid length is returned in `samples` and the host trims;
  - encode/expand are inlined without their input-validation branches
    (value-dependent asserts cannot be exported); the math is unchanged.

Export uses the dynamo exporter with a dynamic token-length axis.

Inputs : tokens int64 [1, N], stress int64 [1, N], speaker int64 [1],
         speed float32 [1], noise float32 [1, max_frames * hop]
Outputs: wave float32 [1, max_frames * hop], samples int64 [1]

Usage:
  python export_onnx.py --checkpoint inference.pt --out model.onnx
Run with the tiny-voca-ja training/inference environment (needs torch,
onnx, onnxruntime).
"""

import argparse
import json
import math
from pathlib import Path

import torch
from torch import nn
from torch.export import Dim

from tiny_voca.infer import load_model
from tiny_voca.model import length_mask


class OnnxWrapper(nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, tokens, stress, speaker, speed, noise):
        m = self.model
        lengths = torch.tensor([tokens.shape[1]], device=tokens.device)
        # encode (TinyVoca.encode without validation)
        mask = length_mask(lengths, tokens.shape[1])
        x = (m.tokens(tokens) + m.stress(stress) + m.voices(speaker)[:, None]) * mask[..., None]
        hidden = m.encoder(x, mask)
        # predict_durations inlined: the original clamps with an int
        # lower bound (0), which the ONNX type-promotion pass rejects;
        # 0.0 is identical math.
        duration_out = m.duration(hidden, mask).float()
        frames_pred = torch.round(
            torch.expm1(duration_out[..., 0].clamp(0.0, 5.996452088244206)) / speed
        ).long().clamp_min(1)
        present = m.phone_tokens[tokens] | (duration_out[..., 1] > 0)
        durations = torch.where(present, frames_pred, torch.zeros_like(frames_pred)) * mask
        # expand (TinyVoca.expand without validation), into a fixed
        # max_frames buffer; frames past frame_lengths are masked out.
        frame_lengths = durations.sum(1)
        size = m.config.max_frames
        ends = durations.cumsum(1)
        frame = torch.arange(size, device=tokens.device)[None].expand(1, size).contiguous()
        # searchsorted(ends, frame, right=True) written as a comparison
        # sum: aten.searchsorted has no ONNX decomposition in this
        # exporter version. Same result: count of ends <= frame.
        index = (frame.unsqueeze(-1) >= ends.unsqueeze(1)).sum(-1).clamp(max=durations.shape[1] - 1)
        owned = durations.gather(1, index).clamp_min(1)
        offset = frame - (ends.gather(1, index) - durations.gather(1, index))
        relative = (offset.to(hidden.dtype) + 0.5) / owned
        features = torch.stack((relative, 1 - relative, torch.log1p(owned.to(hidden.dtype)) / 4), dim=-1)
        frame_mask = frame < frame_lengths[:, None]
        frames = hidden.gather(1, index[..., None].expand(-1, -1, hidden.shape[-1]))
        frames = (frames + m.frame_position(features) + m.frame_voices(speaker)[:, None]) * frame_mask[..., None]
        # prosody + voiced-vowel fix (identical to TinyVoca.synthesize)
        prosody_hidden, prosody = m.predict_prosody(frames, frame_mask)
        owner = index
        vowel = m.vowel_tokens[tokens].gather(1, owner) & frame_mask
        prosody = torch.cat(
            (prosody[..., :1],
             torch.where(vowel, prosody[..., 1].clamp_min(2.0), prosody[..., 1])[..., None],
             prosody[..., 2:]),
            dim=-1,
        )
        acoustic = m.decode(prosody_hidden, m.hard_prosody(prosody), frame_mask)
        wave = m.vocoder(acoustic, m.frequency(prosody[..., 0]), frame_lengths, noise=noise)
        return wave, frame_lengths * m.config.hop


def _patch_for_export():
    """Work around an ONNX decomposition bug in this torch version:
    cepstrum_response clamps a float tensor with int bounds (-14, 6),
    which the FX type-promotion pass cannot resolve. Identical math
    with float bounds exports cleanly."""
    import tiny_voca.model as model_mod

    def cepstrum_response(causal, anticausal, fft):
        buffer = causal.new_zeros(*causal.shape[:-1], fft)
        buffer[..., : causal.shape[-1]] = causal
        if anticausal is not None:
            buffer[..., fft - anticausal.shape[-1] :] = anticausal.flip(-1)
        spectrum = torch.fft.rfft(buffer, dim=-1)
        return torch.polar(torch.exp(spectrum.real.clamp(-14.0, 6.0)), spectrum.imag)

    model_mod.cepstrum_response = cepstrum_response


def _fix_scatternd_indices(path):
    """ONNX Runtime requires ScatterND indices to be int64; the exporter
    emits int32 indices for some index_put ops. Insert casts."""
    import onnx
    from onnx import TensorProto, helper

    model = onnx.load(path, load_external_data=False)
    new_nodes = []
    counter = 0
    for node in model.graph.node:
        if node.op_type == "ScatterND" and len(node.input) >= 2:
            # Cast unconditionally: value_info does not cover every
            # intermediate, and casting int64 -> int64 is a no-op.
            cast_out = f"{node.input[1]}_i64_{counter}"
            counter += 1
            new_nodes.append(helper.make_node("Cast", [node.input[1]], [cast_out], to=TensorProto.INT64))
            node.input[1] = cast_out
        new_nodes.append(node)
    del model.graph.node[:]
    model.graph.node.extend(new_nodes)
    onnx.save(model, path)
    print(f"patched {counter} ScatterND indices to int64")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    _patch_for_export()
    model = load_model(args.checkpoint, check_frontend=False)
    wrapper = OnnxWrapper(model).eval()

    tokens = torch.tensor([[1, 40, 30, 30, 2]], dtype=torch.int64)
    stress = torch.tensor([[0, 1, 0, 0, 0]], dtype=torch.int64)
    speaker = torch.tensor([0], dtype=torch.int64)
    speed = torch.tensor([1.0], dtype=torch.float32)
    noise = torch.randn(1, model.config.max_frames * model.config.hop)

    n_dim = Dim("n", min=2, max=model.config.max_tokens)
    torch.onnx.export(
        wrapper,
        (tokens, stress, speaker, speed, noise),
        args.out,
        input_names=["tokens", "stress", "speaker", "speed", "noise"],
        output_names=["wave", "samples"],
        dynamo=True,
        dynamic_shapes={
            "tokens": {1: n_dim},
            "stress": {1: n_dim},
            "speaker": None,
            "speed": None,
            "noise": None,
        },
    )
    _fix_scatternd_indices(args.out)
    meta = {
        "sample_rate": model.config.sample_rate,
        "hop": model.config.hop,
        "max_tokens": model.config.max_tokens,
        "max_frames": model.config.max_frames,
        "voices": list(model.config.speakers),
        "vocab_size": model.config.vocab_size,
    }
    Path(args.out + ".json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print("wrote", args.out, "and", args.out + ".json", meta)


if __name__ == "__main__":
    main()
