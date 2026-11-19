# @tiny-voca-ja/phonemizer

テキスト → tiny-voca-ja の音素ID列への変換（TypeScript）。
Python 版（pyopenjtalk-plus アダプタ `oj_frontend.py`）の移植で、
アプリA（ONNX+Node）とアプリB（WASM）の両方がこの1実装を共有する。

## 仕組み

1. 文を 。、？！ で節に割り、句読点はそのままトークンにする
2. 節ごとに kuromoji で形態素解析し、読み（カタカナ）を得る
3. アクセント句に相当する区切りを品詞規則で推定する
   （内容語で開始、助詞・助動詞・接尾は付属、名詞+名詞の複合語は結合）
4. 数字は kuromoji が読みを持たないため自前で読む（`numbers.ts`）
   - 助数詞の音便（分→プン、日→クニチ等の例外、7人→シチニン など）
   - 100以上の数は位ごと（千・百・十）に句を分ける（OpenJTalk の読み方に合わせた）
   - 電話番号のようなハイフン区切りは1桁ずつ読む
5. 英語（ラテン文字のトークン）はカタカナ読みに変換する（`english.ts`、ルートA）
   - 辞書引き（`en-dict.json`、約9,400語）: CMUdict の発音記号を日本語の
     外来語表記に変換して生成（生成器は `tools/gen_en_dict.py`）。
     技術用語などは手書きの上書き表で標準的な読みに寄せている
   - 全大文字の略語（AI・GPU・USB など、2〜6文字）は1文字ずつスペルアウト
   - 辞書にない語は綴りからのルール変換（近似。固有名詞もここに入る）
   - 英字+数字の混在（Windows11 など）は英字部と数字部に分けて読む
6. カタカナ読み → OpenJTalk 系音素（オウ→オー、エイ→エー の長音化を含む）
   → モデルの eSpeak 系トークン表（84記号）へ変換し、句頭の母音に stress を立てる

## Python 版との一致度（検証済み）

`tests/fixture.json`（Python 版の出力、未学習23文）との比較:

- **完全一致 13/23 文**
- 残りの差は主に3種類で、いずれも読み自体は正しい日本語になる
  - アクセント句の区切り（`<sp>` = 短いポーズ）の位置が1〜2か所違う
  - 辞書の読みの違い（例: 端 を kuromoji は「ハジ」、OpenJTalk は「ハシ」。
    十九日 は「ジュウキュウニチ」/「ジュウクニチ」）
  - 電話番号の桁のまとめ方、小数（2.5 を「ニーテンゴ」/ OpenJTalk は「ニイテンゴ」）

検証の再実行: `npm install && npm run build && npm run check`

## 使い方

```ts
import { initPhonemizer, phonemize } from "@tiny-voca-ja/phonemizer";

await initPhonemizer("/path/to/kuromoji/dict");
const { symbols, ids, stress } = await phonemize("今日は2026年11月19日木曜日です。");
```
