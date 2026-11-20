# model-assets

tiny-voca-ja のモデル資産（A/B 両アプリ共通）。

| ファイル | 用途 |
|---|---|
| `model.onnx` + `model.onnx.data` | アプリA（ONNX + Node）用。重みは `.data` 側（約19MB） |
| `meta.json` | ONNX の入出力仕様（サンプルレート、hop、最大トークン数、声の種類） |
| `tvoca.bin` | アプリB（WASM）用。C エンジン形式の重み（約4.9MB、int8量子化） |

## 生成方法

- ONNX: `tools/export/export_onnx.py`（チェックポイント → ONNX、PyTorch との数値一致を `verify_onnx.py` で検証済み: 相関 1.000000、最大誤差 0.0009）
- tvoca.bin: ESP32 移植時の変換スクリプト（`tiny-voca-esp32/export_ja.py`）で生成し、ホスト版エンジンで検証済みのもの

現在のチェックポイント: **v2（114,000ステップ、2026-11-20 ファインチューン版）**。ONNX は v2 で再書き出し・再検証済み（相関 1.000000、最大誤差 0.0005）。tvoca.bin も v2 から再生成済み。

元のチェックポイント: https://huggingface.co/gachimoto/tiny-voca-ja
