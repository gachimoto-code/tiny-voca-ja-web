# model-assets

tiny-voca-ja のモデル資産（A/B 両アプリ共通）。

| ファイル | 用途 |
|---|---|
| `model.onnx` + `model.onnx.data` | アプリA（ONNX + Node）用。重みは `.data` 側（約19MB） |
| `meta.json` | ONNX の入出力仕様（サンプルレート、hop、最大トークン数、声の種類） |
| `tvoca.bin` | アプリB（WASM）用。C エンジン形式の重み（約4.9MB、int8量子化） |
| `vocoder_gen.onnx` | アプリA用。HiFi-GAN ボコーダ（後処理）。入力 `mel` float32 [1,80,frames] → 出力 `wav` [1,1,samples]（約3.8MB） |

## vocoder_gen.onnx の取得

バイナリはリポジトリにコミットしない。無い場合はリポジトリのルートで次を実行すると
Hugging Face（`gachimoto/tiny-voca-ja` の `vocoder/gen_final.onnx`）からダウンロードする。

```sh
node tools/fetch-vocoder-model.mjs
```

ボコーダは tiny-voca-ja 本体の波形生成（ソース・フィルタ式）のザラザラ感を抑えるための
実験的な後処理で、アプリAの `POST /api/speak` に `vocoder: true` を付けると有効になる。
メル抽出仕様は `apps/server-app/backend/src/mel.ts`（基準実装は tiny-voca-ja リポジトリの
`vocoder-pilot/ours/mel.py`、24kHz / n_fft 1024 / hop 256 / 80バンド / Slaneyスケール）。

## 生成方法

- ONNX: `tools/export/export_onnx.py`（チェックポイント → ONNX、PyTorch との数値一致を `verify_onnx.py` で検証済み: 相関 1.000000、最大誤差 0.0009）
- tvoca.bin: ESP32 移植時の変換スクリプト（`tiny-voca-esp32/export_ja.py`）で生成し、ホスト版エンジンで検証済みのもの

現在のチェックポイント: **v2（114,000ステップ、2026-11-20 ファインチューン版）**。ONNX は v2 で再書き出し・再検証済み（相関 1.000000、最大誤差 0.0005）。tvoca.bin も v2 から再生成済み。

元のチェックポイント: https://huggingface.co/gachimoto/tiny-voca-ja
