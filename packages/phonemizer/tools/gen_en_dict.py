#!/usr/bin/env python3
"""Generate an English -> katakana dictionary (JSON) from CMUdict.

Method: ARPAbet phoneme sequence -> katakana morae, using Japanese
loanword conventions (onset kana tables, coda forms, gemination after
short vowels, schwa-drop before final L/M/N/R, ER -> アー).
Scope: words in google-10000-english that have a CMUdict entry, plus a
hand-written override table for tech terms and common words whose
standard Japanese reading differs from the mechanical conversion.
"""
import json
import re
import sys

# Usage: gen_en_dict.py <cmudict.dict> <google-10000.txt> <out.json>
# Sources: https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict
#          https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english.txt
CMU = sys.argv[1]
G10K = sys.argv[2]
OUT = sys.argv[3] if len(sys.argv) > 3 else "en-dict.json"

VOWELS = {"AA", "AE", "AH", "AO", "AW", "AY", "EH", "ER", "EY", "IH", "IY", "OW", "OY", "UH", "UW"}

# vowel phoneme -> (class, long?)  class in a/i/u/e/o/ai/au/oi/er
VCLASS = {
    "AA": ("a", False), "AE": ("a", False), "AH": ("a", False),
    "AO": ("o", False), "AW": ("au", False), "AY": ("ai", False),
    "EH": ("e", False), "ER": ("er", False), "EY": ("e", True),
    "IH": ("i", False), "IY": ("i", True),
    "OW": ("o", True), "OY": ("oi", False),
    "UH": ("u", False), "UW": ("u", True),
}

# onset kana: consonant -> {vowel class: kana}
ONSET = {
    "B":  {"a": "バ", "i": "ビ", "u": "ブ", "e": "ベ", "o": "ボ", "ai": "バイ", "au": "バウ", "oi": "ボイ", "er": "バー"},
    "CH": {"a": "チャ", "i": "チ", "u": "チュ", "e": "チェ", "o": "チョ", "ai": "チャイ", "au": "チャウ", "oi": "チョイ", "er": "チャー"},
    "D":  {"a": "ダ", "i": "ヂ", "u": "ヅ", "e": "デ", "o": "ド", "ai": "ダイ", "au": "ダウ", "oi": "ドイ", "er": "ダー"},
    "DH": {"a": "ザ", "i": "ジ", "u": "ズ", "e": "ゼ", "o": "ゾ", "ai": "ザイ", "au": "ザウ", "oi": "ゾイ", "er": "ザー"},
    "F":  {"a": "ファ", "i": "フィ", "u": "フ", "e": "フェ", "o": "フォ", "ai": "ファイ", "au": "ファウ", "oi": "フォイ", "er": "ファー"},
    "G":  {"a": "ガ", "i": "ギ", "u": "グ", "e": "ゲ", "o": "ゴ", "ai": "ガイ", "au": "ガウ", "oi": "ゴイ", "er": "ガー"},
    "HH": {"a": "ハ", "i": "ヒ", "u": "フ", "e": "ヘ", "o": "ホ", "ai": "ハイ", "au": "ハウ", "oi": "ホイ", "er": "ハー"},
    "JH": {"a": "ジャ", "i": "ジ", "u": "ジュ", "e": "ジェ", "o": "ジョ", "ai": "ジャイ", "au": "ジャウ", "oi": "ジョイ", "er": "ジャー"},
    "K":  {"a": "カ", "i": "キ", "u": "ク", "e": "ケ", "o": "コ", "ai": "カイ", "au": "カウ", "oi": "コイ", "er": "カー"},
    "L":  {"a": "ラ", "i": "リ", "u": "ル", "e": "レ", "o": "ロ", "ai": "ライ", "au": "ラウ", "oi": "ロイ", "er": "ラー"},
    "M":  {"a": "マ", "i": "ミ", "u": "ム", "e": "メ", "o": "モ", "ai": "マイ", "au": "マウ", "oi": "モイ", "er": "マー"},
    "N":  {"a": "ナ", "i": "ニ", "u": "ヌ", "e": "ネ", "o": "ノ", "ai": "ナイ", "au": "ナウ", "oi": "ノイ", "er": "ナー"},
    "P":  {"a": "パ", "i": "ピ", "u": "プ", "e": "ペ", "o": "ポ", "ai": "パイ", "au": "パウ", "oi": "ポイ", "er": "パー"},
    "R":  {"a": "ラ", "i": "リ", "u": "ル", "e": "レ", "o": "ロ", "ai": "ライ", "au": "ラウ", "oi": "ロイ", "er": "ラー"},
    "S":  {"a": "サ", "i": "シ", "u": "ス", "e": "セ", "o": "ソ", "ai": "サイ", "au": "サウ", "oi": "ソイ", "er": "サー"},
    "SH": {"a": "シャ", "i": "シ", "u": "シュ", "e": "シェ", "o": "ショ", "ai": "シャイ", "au": "シャウ", "oi": "ショイ", "er": "シャー"},
    "T":  {"a": "タ", "i": "チ", "u": "ツ", "e": "テ", "o": "ト", "ai": "タイ", "au": "タウ", "oi": "トイ", "er": "ター"},
    "TH": {"a": "サ", "i": "シ", "u": "ス", "e": "セ", "o": "ソ", "ai": "サイ", "au": "サウ", "oi": "ソイ", "er": "サー"},
    "V":  {"a": "ヴァ", "i": "ヴィ", "u": "ヴ", "e": "ヴェ", "o": "ヴォ", "ai": "ヴァイ", "au": "ヴァウ", "oi": "ヴォイ", "er": "ヴァー"},
    "W":  {"a": "ワ", "i": "ウィ", "u": "ウ", "e": "ウェ", "o": "ウォ", "ai": "ワイ", "au": "ワウ", "oi": "ウォイ", "er": "ワー"},
    "Y":  {"a": "ヤ", "i": "イ", "u": "ユ", "e": "イェ", "o": "ヨ", "ai": "ヤイ", "au": "ヤウ", "oi": "ヨイ", "er": "ヤー"},
    "Z":  {"a": "ザ", "i": "ジ", "u": "ズ", "e": "ゼ", "o": "ゾ", "ai": "ザイ", "au": "ザウ", "oi": "ゾイ", "er": "ザー"},
    "ZH": {"a": "ジャ", "i": "ジ", "u": "ジュ", "e": "ジェ", "o": "ジョ", "ai": "ジャイ", "au": "ジャウ", "oi": "ジョイ", "er": "ジャー"},
}

STANDALONE = {  # vowel with no onset
    "a": "ア", "i": "イ", "u": "ウ", "e": "エ", "o": "オ",
    "ai": "アイ", "au": "アウ", "oi": "オイ", "er": "アー",
}

CODA = {
    "B": "ブ", "CH": "ッチ", "D": "ド", "DH": "ズ", "F": "フ", "G": "グ",
    "JH": "ッジ", "K": "ク", "L": "ル", "M": "ム", "N": "ン", "P": "プ",
    "S": "ス", "SH": "シュ", "T": "ト", "TH": "ス", "V": "ヴ", "Z": "ズ",
}
GEMINATE = {"K": "ック", "T": "ット", "P": "ップ", "G": "ッグ", "D": "ッド"}
SHORT_VOWELS = {"IH", "UH", "AE", "AH", "EH", "AO"}

# consonant + Y + vowel -> palatalized onset (cute, beautiful, music)
PALATAL = {
    "K":  {"a": "キャ", "i": "キ", "u": "キュ", "e": "キェ", "o": "キョ"},
    "G":  {"a": "ギャ", "i": "ギ", "u": "ギュ", "e": "ギェ", "o": "ギョ"},
    "T":  {"a": "チャ", "i": "チ", "u": "チュ", "e": "チェ", "o": "チョ"},
    "D":  {"a": "ヂャ", "i": "ヂ", "u": "ヂュ", "e": "ヂェ", "o": "ヂョ"},
    "N":  {"a": "ニャ", "i": "ニ", "u": "ニュ", "e": "ニェ", "o": "ニョ"},
    "HH": {"a": "ヒャ", "i": "ヒ", "u": "ヒュ", "e": "ヒェ", "o": "ヒョ"},
    "B":  {"a": "ビャ", "i": "ビ", "u": "ビュ", "e": "ビェ", "o": "ビョ"},
    "P":  {"a": "ピャ", "i": "ピ", "u": "ピュ", "e": "ピェ", "o": "ピョ"},
    "M":  {"a": "ミャ", "i": "ミ", "u": "ミュ", "e": "ミェ", "o": "ミョ"},
    "R":  {"a": "リャ", "i": "リ", "u": "リュ", "e": "リェ", "o": "リョ"},
    "L":  {"a": "リャ", "i": "リ", "u": "リュ", "e": "リェ", "o": "リョ"},
    "S":  {"a": "シャ", "i": "シ", "u": "シュ", "e": "シェ", "o": "ショ"},
    "Z":  {"a": "ジャ", "i": "ジ", "u": "ジュ", "e": "ジェ", "o": "ジョ"},
    "F":  {"a": "フャ", "i": "フィ", "u": "フュ", "e": "フェ", "o": "フョ"},
    "V":  {"a": "ヴャ", "i": "ヴィ", "u": "ヴュ", "e": "ヴェ", "o": "ヴョ"},
}


def convert(phones):
    """phones: list of (phoneme, stress) -> katakana string."""
    seq = [p for p, _ in phones]
    out = []
    i = 0
    n = len(seq)
    prev_vowel = None
    while i < n:
        ph = seq[i]
        if ph in VOWELS:
            cls, lng = VCLASS[ph]
            out.append(STANDALONE[cls] + ("ー" if lng and cls in ("i", "u", "e", "o") else ""))
            prev_vowel = ph
            i += 1
            continue
        # consonant
        nxt = seq[i + 1] if i + 1 < n else None
        if ph == "NG":
            if nxt in VOWELS:
                cls, lng = VCLASS[nxt]
                out.append(ONSET["G"][cls] + ("ー" if lng and cls in ("i", "u", "e", "o") else ""))
                prev_vowel = nxt
                i += 2
            else:
                out.append("ング" if i == n - 1 else "ン")
                prev_vowel = None
                i += 1
            continue
        # consonant + Y + vowel -> palatalized onset (cute, beautiful)
        if ph in PALATAL and nxt == "Y" and i + 2 < n and seq[i + 2] in VOWELS:
            v = seq[i + 2]
            cls, lng = VCLASS[v]
            base = PALATAL[ph].get(cls)
            if base is None:  # diphthong / er: palatal a-row + tail
                base = PALATAL[ph]["a"] + {"ai": "イ", "au": "ウ", "oi": "イ", "er": "ー"}[cls]
                lng = False
            out.append(base + ("ー" if lng and cls in ("i", "u", "e", "o") else ""))
            prev_vowel = v
            i += 3
            continue
        if nxt in VOWELS:
            cls, lng = VCLASS[nxt]
            out.append(ONSET[ph][cls] + ("ー" if lng and cls in ("i", "u", "e", "o") else ""))
            prev_vowel = nxt
            i += 2
            continue
        # coda consonant
        if ph == "R":
            out.append("ア" if prev_vowel in ("AO", "OW", "EH", "IH", "IY", "UH") else "ー")
            prev_vowel = None
            i += 1
            continue
        if ph in GEMINATE and i == n - 1 and prev_vowel in SHORT_VOWELS:
            out.append(GEMINATE[ph])
            prev_vowel = None
            i += 1
            continue
        out.append(CODA.get(ph, ""))
        prev_vowel = None
        i += 1
    kana = "".join(out)
    # schwa-drop fix-up: a standalone ア directly before a final ル/ム/ン
    # that came from coda L/M/N is handled at sequence level below instead.
    return kana


def convert_word(phones):
    """Apply schwa-drop pre-pass, then convert."""
    seq = [p for p, _ in phones]
    # AH followed by exactly one consonant (L/M/N/R) at word end -> drop AH
    if len(seq) >= 2 and seq[-2] == "AH" and seq[-1] in ("L", "M", "N", "R"):
        phones = phones[:-2] + phones[-1:]
    return convert(phones)


OVERRIDES = {
    # tech / product names
    "github": "ギットハブ", "python": "パイソン", "javascript": "ジャバスクリプト",
    "typescript": "タイプスクリプト", "server": "サーバー", "data": "データ",
    "cache": "キャッシュ", "async": "エイシンク", "google": "グーグル",
    "microsoft": "マイクロソフト", "windows": "ウィンドウズ", "linux": "リナックス",
    "mac": "マック", "iphone": "アイフォン", "android": "アンドロイド",
    "wifi": "ワイファイ", "bluetooth": "ブルートゥース", "email": "イーメール",
    "internet": "インターネット", "app": "アプリ", "apps": "アプリ",
    "chatgpt": "チャットジーピーティー", "openai": "オープンエーアイ",
    "Muse": "クロード", "gemini": "ジェミニ", "smartphone": "スマートフォン",
    "user": "ユーザー", "users": "ユーザー", "browser": "ブラウザ",
    "training": "トレーニング", "agent": "エージェント", "agents": "エージェント",
    "model": "モデル", "models": "モデル", "token": "トークン", "tokens": "トークン",
    "prompt": "プロンプト", "code": "コード", "file": "ファイル",
    "download": "ダウンロード", "upload": "アップロード", "install": "インストール",
    "program": "プログラム", "software": "ソフトウェア", "hardware": "ハードウェア",
    "keyboard": "キーボード", "screen": "スクリーン", "video": "ビデオ",
    "audio": "オーディオ", "image": "イメージ", "text": "テキスト",
    "voice": "ボイス", "sound": "サウンド", "music": "ミュージック",
    "camera": "カメラ", "photo": "フォト", "news": "ニュース",
    "note": "ノート", "notes": "ノート", "post": "ポスト", "blog": "ブログ",
    "site": "サイト", "page": "ページ", "link": "リンク", "click": "クリック",
    "check": "チェック", "test": "テスト", "start": "スタート", "stop": "ストップ",
    "open": "オープン", "close": "クローズ", "free": "フリー", "online": "オンライン",
    "offline": "オフライン", "digital": "デジタル", "system": "システム",
    "network": "ネットワーク", "security": "セキュリティ", "design": "デザイン",
    "game": "ゲーム", "games": "ゲーム", "movie": "ムービー", "channel": "チャンネル",
    "amazon": "アマゾン", "apple": "アップル", "samsung": "サムスン",
    "sony": "ソニー", "nintendo": "ニンテンドー", "youtube": "ユーチューブ",
    "twitter": "ツイッター", "instagram": "インスタグラム", "facebook": "フェイスブック",
    "line": "ライン", "zoom": "ズーム", "slack": "スラック",
    "api": "エーピーアイ", "ai": "エーアイ", "gpu": "ジーピーユー",
    "cpu": "シーピーユー", "usb": "ユーエスビー", "url": "ユーアールエル",
    "ui": "ユーアイ", "os": "オーエス", "pc": "ピーシー", "tv": "ティービー",
    "web": "ウェブ", "net": "ネット", "blog": "ブログ",
    "docker": "ドッカー", "kubernetes": "クバネティス", "runpod": "ランポッド",
    "react": "リアクト", "expo": "エキスポ", "wasm": "ワズム", "vite": "ヴィート",
    "vercel": "バーセル", "supabase": "スパベース", "firebase": "ファイアベース",
    "kotlin": "コトリン", "huggingface": "ハギングフェイス", "colab": "コラボ",
    "jupyter": "ジュピター", "pytorch": "パイトーチ", "tensorflow": "テンソルフロー",
    "cuda": "クーダ", "nvidia": "エヌビディア", "ryzen": "ライゼン",
    "radeon": "ラデオン", "diffusion": "ディフュージョン", "midjourney": "ミッドジャーニー",
    "whisper": "ウィスパー", "node": "ノード", "nodejs": "ノードジェーエス",
    # common words where the mechanical conversion is off
    "women": "ウィメン", "woman": "ウーマン", "business": "ビジネス",
    "people": "ピープル", "little": "リトル", "water": "ウォーター",
    "world": "ワールド", "work": "ワーク", "word": "ワード",
    "heart": "ハート", "earth": "アース", "learn": "ラーン",
    "idea": "アイデア", "area": "エリア", "really": "リアリー",
    "video": "ビデオ", "radio": "ラジオ", "studio": "スタジオ",
    "energy": "エナジー", "family": "ファミリー", "city": "シティ",
    "money": "マネー", "happy": "ハッピー", "very": "ベリー",
    "story": "ストーリー", "party": "パーティー", "body": "ボディ",
    "study": "スタディ", "country": "カントリー", "company": "カンパニー",
    "level": "レベル", "hotel": "ホテル", "total": "トータル",
    "local": "ローカル", "social": "ソーシャル", "special": "スペシャル",
    "general": "ジェネラル", "natural": "ナチュラル", "national": "ナショナル",
    "international": "インターナショナル", "information": "インフォメーション",
    "education": "エデュケーション", "technology": "テクノロジー",
    "computer": "コンピューター", "computers": "コンピューター",
    "another": "アナザー", "other": "アザー", "mother": "マザー",
    "father": "ファーザー", "brother": "ブラザー", "weather": "ウェザー",
    "together": "トゥゲザー", "over": "オーバー", "under": "アンダー",
    "after": "アフター", "never": "ネバー", "ever": "エバー",
    "river": "リバー", "cover": "カバー", "power": "パワー",
    "center": "センター", "centre": "センター", "member": "メンバー",
    "number": "ナンバー", "order": "オーダー", "paper": "ペーパー",
    "water": "ウォーター", "later": "レイター", "letter": "レター",
    "better": "ベター", "summer": "サマー", "winter": "ウィンター",
    "dinner": "ディナー", "morning": "モーニング", "evening": "イブニング",
    "something": "サムシング", "nothing": "ナッシング", "everything": "エブリシング",
    "anything": "エニシング", "king": "キング", "sing": "シング",
    "during": "デューリング", "being": "ビーイング", "morning": "モーニング",
    "english": "イングリッシュ", "language": "ランゲージ", "japanese": "ジャパニーズ",
    "america": "アメリカ", "american": "アメリカン", "japan": "ジャパン",
    "china": "チャイナ", "korea": "コリア", "tokyo": "トウキョウ",
    "school": "スクール", "class": "クラス", "group": "グループ",
    "point": "ポイント", "part": "パート", "arts": "アーツ",
    "question": "クエスチョン", "answer": "アンサー", "problem": "プロブレム",
    "service": "サービス", "services": "サービス", "office": "オフィス",
    "price": "プライス", "voice": "ボイス", "choice": "チョイス",
    "list": "リスト", "rest": "レスト", "test": "テスト",
    "best": "ベスト", "last": "ラスト", "first": "ファースト",
    "next": "ネクスト", "just": "ジャスト", "most": "モースト",
    "fast": "ファスト", "east": "イースト", "west": "ウェスト",
}


def main():
    g10k = set()
    with open(G10K, encoding="utf-8") as f:
        for line in f:
            w = line.strip().lower()
            if w:
                g10k.add(w)
    result = {}
    with open(CMU, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith(";;;"):
                continue
            m = re.match(r"^([A-Za-z']+)(?:\(\d+\))?\s+(.+)$", line)
            if not m:
                continue
            word, pron = m.group(1).lower(), m.group(2)
            if word in result:  # keep first pronunciation
                continue
            if word not in g10k:
                continue
            phones = []
            ok = True
            for tok in pron.split():
                base = re.sub(r"\d$", "", tok)
                if base not in VOWELS and base not in ONSET and base not in ("NG",):
                    ok = False
                    break
                stress = tok[-1] if tok[-1].isdigit() else "0"
                phones.append((base, stress))
            if not ok or not phones:
                continue
            kana = convert_word(phones)
            if kana:
                result[word] = kana
    result.update(OVERRIDES)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    print(f"entries: {len(result)} -> {OUT}")
    for w in ["the", "hello", "world", "cat", "dog", "book", "street", "school",
              "python", "github", "computer", "water", "people", "think", "three",
              "thank", "sing", "king", "apple", "time", "home", "name", "day",
              "window", "music", "happy", "family", "question", "information",
              "beautiful", "important", "different", "government", "development",
              "available", "possible", "business", "children", "following", "dog", "think", "thank", "beautiful", "cute", "music", "important", "different", "cat", "log", "blog", "new", "news", "use", "future", "value", "issue", "during", "national", "general"]:
        if w in result:
            print(f"  {w}: {result[w]}")


if __name__ == "__main__":
    main()
