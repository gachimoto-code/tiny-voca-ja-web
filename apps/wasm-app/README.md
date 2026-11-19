# wasm-app（ルートB: ブラウザ完結）

サーバなしで動く版。ngxson の C 推論エンジン（ESP32-S3 移植版）を
WebAssembly 化し、重み（tvoca.bin、約4.9MB）をブラウザに配って合成する。
静的ホスティングにそのまま置ける。

## 構成

- `engine/` — C エンジンの WASM 化
  - `vendor/` — エンジン本体（ngxson/tiny-voca-esp32s3、Apache-2.0、日本語84語彙パッチ適用済み）
  - `tv_wasm.c` — JS から呼ぶための薄いラッパ（init / synth / free）
  - `build.sh` — emcc で `frontend/public/engine/` へビルド
- `frontend/` — Vite + React + TypeScript
  - 読み処理は `@tiny-voca-ja/phonemizer`（サーバ版と共通）
  - `scripts/prepare-assets.mjs` が tvoca.bin と kuromoji 辞書を `public/` へコピーする

## ビルド手順

1. `engine/build.sh`（Emscripten が必要）
2. リポジトリルートで `npm install` 後、このフォルダで `npm run build`

## 注意

- kuromoji の辞書は約12MB（gzip転送）あり、初回読み込み時の主な転送量になる
- 合成はメインスレッドで実行する（長い文では一瞬ブロックする）。Web Worker 化は今後の課題
