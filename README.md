# tiny-voca-ja-web

tiny-voca-ja（日本語TTS、4.5Mパラメータ）を **Pythonなし** で動かす Web アプリ集。
同じモデル・同じ読み処理を共有し、動かし方だけが違う2アプリを1リポジトリに置く。

## 構成

```
tiny-voca-ja-web/
├─ packages/
│  ├─ phonemizer/        # 共通: テキスト → 音素ID列（TypeScript）
│  │                     #   kuromoji の読み + pyopenjtalk-plus 相当の音素変換規則
│  │                     #   （Python版 oj_frontend.py の移植。検証は Python 出力との一致で担保）
│  └─ model-assets/      # 共通: モデル資産と生成手順
│                        #   model.onnx（A用）/ tvoca.bin（B用）/ vocab・config
├─ apps/
│  ├─ server-app/        # A: ONNX + Node（React/Express の標準構成）
│  │  ├─ frontend/       #   Vite + React + TypeScript
│  │  └─ backend/        #   Express + TypeScript + onnxruntime-node
│  └─ wasm-app/          # B: ブラウザ完結（バックエンドなし）
│     ├─ frontend/       #   Vite + React + TypeScript
│     └─ engine/         #   tv.c（ngxson の C 推論エンジン）の WASM ビルド
├─ tools/
│  └─ export/            # 重み変換スクリプトと手順（PyTorch → ONNX / tvoca.bin）
├─ .env.example
├─ .gitignore            # .env / .env* / !.env.example
└─ README.md
```

## 動かし方

前提は Node.js だけです（動作確認は Node 24）。clone したら、リポジトリのルートで一度だけ実行します。

```sh
npm install
npm run build:phonemizer   # 共通の読み処理パッケージのビルド（A/B どちらにも必要）
```

### A: サーバ版（ONNX + Node）

ターミナルを2つ使います。

```sh
npm run dev:server   # バックエンド（Express、ポート 3001）
npm run dev:web      # フロントエンド（Vite）
```

ブラウザで http://localhost:5173 を開きます。`/api` へのリクエストはフロントの開発サーバがバックエンド（3001）へ中継します。

アプリAには HiFi-GAN ボコーダによる再合成の聴き比べ機能があります（生成時に元音声とボコーダ版の両方が作られます）。ボコーダのモデル `packages/model-assets/vocoder_gen.onnx` はリポジトリに含まれないため、使う場合は一度だけ取得してください（無くても元音声の生成は動きます）。

```sh
node tools/fetch-vocoder-model.mjs   # Hugging Face から vocoder_gen.onnx を取得
```

### B: ブラウザ版（WASM）

```sh
npm run dev -w wasm-app-frontend
```

ブラウザで http://localhost:5173 を開きます（Aのフロントと同時起動の場合は 5174 になります）。バックエンドはなく、推論はすべてブラウザ内で動きます。WASM エンジン（`apps/wasm-app/frontend/public/engine/`）はリポジトリに含まれていて、モデルと形態素辞書は起動時に `prepare-assets` が自動配置します。初回だけ、モデル（約4.9MB）と辞書の読み込みに少し時間がかかります。

本番用には各フロントを `npm run build -w server-app-frontend` / `npm run build -w wasm-app-frontend` でビルドします（Aのバックエンドは `npm run start -w server-app-backend`）。

## 設計方針

- 読み処理（phonemizer）とモデル資産は packages に1つだけ置き、A/B 両アプリが共有する。
  アプリ側に読み処理を複製しない（読みがズレると A/B で声が変わってしまうため）。
- A はサーバで推論するので重みはサーバ側だけに置く。B は重み（tvoca.bin 約4.9MB）を
  ブラウザに配る前提で、静的ホスティングに置ける形にする。
- 環境変数は dotenv。`.env` はコミットしない。`.env.example` のみコミットする。
- 検証は Python 版（正）と突き合わせる: 音素ID列の一致、合成音声の ASR チェック（CER）。

## モデルについて

- 重み: https://huggingface.co/gachimoto/tiny-voca-ja （inference.pt）
- コードと実験: https://github.com/gachimoto-code/tiny-voca-ja
- 声: F2（女性）/ M2（男性）、24kHz モノラル

## モデル資産について

チェックポイントの正本は https://huggingface.co/gachimoto/tiny-voca-ja です。
`packages/model-assets/` の変換済みファイル（`model.onnx` / `model.onnx.data` /
`tvoca.bin`）はこのリポジトリに直接コミットできます。再生成の手順は
`tools/export/` と `packages/model-assets/README.md` にあります。
WASM 版の辞書・モデル配置は `apps/wasm-app/frontend/scripts/prepare-assets.mjs` が
自動で行います。
