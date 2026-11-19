// tiny-voca-ja phonemizer (TypeScript port of the Python pyopenjtalk-plus
// adapter, experiments/frontend-swap/oj_frontend.py).
//
// Pipeline: text -> clauses (split on 。、？！) -> kuromoji tokens ->
// accent-phrase segments -> katakana readings -> OpenJTalk-style phonemes
// -> the checkpoint's eSpeak-style token inventory (symbols + stress + ids).
//
// Differences from the Python version are expected in accent-phrase
// boundaries and some dictionary readings (kuromoji/IPADIC vs OpenJTalk);
// the phoneme inventory and conversion rules are identical.

import kuromoji from "kuromoji";
import vocabJson from "./vocab.json" with { type: "json" };
import { COUNTERS, numberChunksKana, numberTokenKana } from "./numbers.js";

export const SYMBOL_TO_ID = vocabJson as Record<string, number>;
const BOS = "<bos>";
const EOS = "<eos>";
const SP = "<sp>";
const UNK = "<unk>";

const VOWELS = new Set(["æ", "i", "ɯᵝ", "eɪ", "oʊ"]);

const PHONE_MAP: Record<string, string[]> = {
  a: ["æ"], i: ["i"], u: ["ɯᵝ"], e: ["eɪ"], o: ["oʊ"],
  I: ["i"], U: ["ɯᵝ"],
  k: ["k"], g: ["ɡ"], s: ["s"], z: ["z"], t: ["t"], d: ["d"],
  n: ["n"], h: ["h"], b: ["b"], p: ["p"], m: ["m"],
  y: ["j"], r: ["ɽ"], w: ["w"], v: ["v"],
  sh: ["ɕ"], ch: ["tɕ"], j: ["dʑ"], ts: ["t", "s"], f: ["ɸ"],
  N: ["ɴ"],
  ky: ["kʲ"], gy: ["ɡ", "j"], ny: ["n", "j"], hy: ["h", "j"],
  by: ["b", "j"], py: ["p", "j"], my: ["m", "j"], ry: ["ɽ", "j"],
  dy: ["d", "j"], ty: ["t", "j"], fy: ["ɸ", "j"],
  kw: ["k", "w"], gw: ["ɡ", "w"],
};

const PUNCT: Record<string, string> = { "。": ".", "、": ",", "？": "?", "！": "!" };
const PUNCT_VALUES = new Set(Object.values(PUNCT));

// ---- katakana -> OpenJTalk phonemes -------------------------------------

const MORA: Record<string, string[]> = {
  ア: ["a"], イ: ["i"], ウ: ["u"], エ: ["e"], オ: ["o"],
  カ: ["k", "a"], キ: ["k", "i"], ク: ["k", "u"], ケ: ["k", "e"], コ: ["k", "o"],
  サ: ["s", "a"], シ: ["sh", "i"], ス: ["s", "u"], セ: ["s", "e"], ソ: ["s", "o"],
  タ: ["t", "a"], チ: ["ch", "i"], ツ: ["ts", "u"], テ: ["t", "e"], ト: ["t", "o"],
  ナ: ["n", "a"], ニ: ["n", "i"], ヌ: ["n", "u"], ネ: ["n", "e"], ノ: ["n", "o"],
  ハ: ["h", "a"], ヒ: ["h", "i"], フ: ["f", "u"], ヘ: ["h", "e"], ホ: ["h", "o"],
  マ: ["m", "a"], ミ: ["m", "i"], ム: ["m", "u"], メ: ["m", "e"], モ: ["m", "o"],
  ヤ: ["y", "a"], ユ: ["y", "u"], ヨ: ["y", "o"],
  ラ: ["r", "a"], リ: ["r", "i"], ル: ["r", "u"], レ: ["r", "e"], ロ: ["r", "o"],
  ワ: ["w", "a"], ヰ: ["i"], ヱ: ["e"], ヲ: ["o"],
  ガ: ["g", "a"], ギ: ["g", "i"], グ: ["g", "u"], ゲ: ["g", "e"], ゴ: ["g", "o"],
  ザ: ["z", "a"], ジ: ["j", "i"], ズ: ["z", "u"], ゼ: ["z", "e"], ゾ: ["z", "o"],
  ダ: ["d", "a"], ヂ: ["j", "i"], ヅ: ["z", "u"], デ: ["d", "e"], ド: ["d", "o"],
  バ: ["b", "a"], ビ: ["b", "i"], ブ: ["b", "u"], ベ: ["b", "e"], ボ: ["b", "o"],
  パ: ["p", "a"], ピ: ["p", "i"], プ: ["p", "u"], ペ: ["p", "e"], ポ: ["p", "o"],
  ァ: ["a"], ィ: ["i"], ゥ: ["u"], ェ: ["e"], ォ: ["o"],
};

// palatalized / loanword combos: first kana -> {small kana -> phonemes}
const COMBO: Record<string, Record<string, string[]>> = {
  キ: { ャ: ["ky", "a"], ュ: ["ky", "u"], ョ: ["ky", "o"] },
  シ: { ャ: ["sh", "a"], ュ: ["sh", "u"], ョ: ["sh", "o"], ェ: ["sh", "e"] },
  チ: { ャ: ["ch", "a"], ュ: ["ch", "u"], ョ: ["ch", "o"], ェ: ["ch", "e"] },
  ジ: { ャ: ["j", "a"], ュ: ["j", "u"], ョ: ["j", "o"], ェ: ["j", "e"] },
  ニ: { ャ: ["ny", "a"], ュ: ["ny", "u"], ョ: ["ny", "o"] },
  ヒ: { ャ: ["hy", "a"], ュ: ["hy", "u"], ョ: ["hy", "o"] },
  ミ: { ャ: ["my", "a"], ュ: ["my", "u"], ョ: ["my", "o"] },
  リ: { ャ: ["ry", "a"], ュ: ["ry", "u"], ョ: ["ry", "o"] },
  ギ: { ャ: ["gy", "a"], ュ: ["gy", "u"], ョ: ["gy", "o"] },
  ヂ: { ャ: ["j", "a"], ュ: ["j", "u"], ョ: ["j", "o"] },
  ビ: { ャ: ["by", "a"], ュ: ["by", "u"], ョ: ["by", "o"] },
  ピ: { ャ: ["py", "a"], ュ: ["py", "u"], ョ: ["py", "o"] },
  フ: { ァ: ["f", "a"], ィ: ["f", "i"], ェ: ["f", "e"], ォ: ["f", "o"] },
  テ: { ィ: ["t", "i"] },
  デ: { ィ: ["d", "i"] },
  ト: { ゥ: ["t", "u"] },
  ド: { ゥ: ["d", "u"] },
  ウ: { ィ: ["w", "i"], ェ: ["w", "e"], ォ: ["w", "o"] },
  ヴ: { ァ: ["b", "a"], ィ: ["b", "i"], ェ: ["b", "e"], ォ: ["b", "o"] },
  ツ: { ァ: ["ts", "a"] },
  ク: { ァ: ["kw", "a"], ォ: ["kw", "o"] },
  グ: { ァ: ["gw", "a"] },
};

const VOWEL_PHONES = new Set(["a", "i", "u", "e", "o"]);

/** Convert a katakana reading string to OpenJTalk-style phonemes. */
export function kanaToPhones(kana: string): string[] {
  const out: string[] = [];
  const lastVowel = () => {
    for (let j = out.length - 1; j >= 0; j--) if (VOWEL_PHONES.has(out[j])) return out[j];
    return null;
  };
  const chars = [...kana];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === "ッ") {
      out.push("cl");
      continue;
    }
    if (c === "ン") {
      out.push("N");
      continue;
    }
    if (c === "ー") {
      // long vowel: repeat the previous vowel phoneme
      const v = lastVowel();
      if (v) out.push(v);
      continue;
    }
    // オウ -> オー, エイ -> エー (OpenJTalk renders these as long vowels)
    if (c === "ウ" && lastVowel() === "o") {
      out.push("o");
      continue;
    }
    if (c === "イ" && lastVowel() === "e") {
      out.push("e");
      continue;
    }
    const next = chars[i + 1];
    if (next && COMBO[c]?.[next]) {
      out.push(...COMBO[c][next]);
      i++;
      continue;
    }
    if (c === "ヴ") {
      out.push("b");
      continue;
    }
    const mora = MORA[c];
    if (mora) {
      out.push(...mora);
    }
    // other characters (・, latin, digits without readings) are skipped
  }
  return out;
}

// ---- kuromoji ------------------------------------------------------------

type Token = kuromoji.IpadicFeatures;

let tokenizerPromise: Promise<kuromoji.Tokenizer<Token>> | null = null;

export function initPhonemizer(dicPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((err, tokenizer) => {
      if (err) reject(err);
      else {
        tokenizerPromise = Promise.resolve(tokenizer);
        resolve();
      }
    });
  });
}

async function tokenize(text: string): Promise<Token[]> {
  if (!tokenizerPromise) throw new Error("initPhonemizer(dicPath) must be called first");
  const tokenizer = await tokenizerPromise;
  return tokenizer.tokenize(text);
}

// POS rules for accent-phrase segmentation (approximating OpenJTalk's
// accent phrases, which roughly follow bunsetsu).
function startsPhrase(tok: Token): boolean {
  const pos = tok.pos;
  const detail = tok.pos_detail_1;
  if (pos === "名詞") return detail !== "非自立" && detail !== "接尾";
  if (pos === "動詞" || pos === "形容詞") return detail === "自立";
  if (pos === "副詞" || pos === "連体詞" || pos === "感動詞") return true;
  if (pos === "接頭詞") return detail === "名詞接続" || detail === "数接続";
  return false;
}

const DIGIT_SURFACE = /^[\d０-９][\d０-９.]*$/;

/** Split a clause into accent-phrase phoneme segments via kuromoji. */
export async function clauseToSegments(clause: string): Promise<string[][]> {
  const tokens = await tokenize(clause);
  const segments: string[][] = [];
  let current: string[] = [];
  let prevPos = "";
  const flush = () => {
    if (current.length) segments.push(current);
    current = [];
  };
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const surface = tok.surface_form;
    if (tok.pos === "記号") {
      flush();
      continue;
    }
    if (surface === "-" || surface === "−") continue;    // Digit tokens carry no kuromoji reading: generate one, absorbing a
    // following counter token （円・年・月・日・時・分・人...) when present.
    if (DIGIT_SURFACE.test(surface)) {
      flush();
      let digits = surface;
      // merge a split decimal: 2 . 5
      if (tokens[i + 1]?.surface_form === "." && tokens[i + 2] && DIGIT_SURFACE.test(tokens[i + 2].surface_form)) {
        digits = surface + "." + tokens[i + 2].surface_form;
        i += 2;
      }
      const next = tokens[i + 1];
      if (next && COUNTERS.has(next.surface_form) && !digits.includes(".")) {
        const chunks = numberChunksKana(Number(digits), next.surface_form);
        i++; // consume the counter token
        chunks.forEach((chunk, ci) => {
          if (ci > 0) flush();
          current.push(...kanaToPhones(chunk));
        });
      } else {
        const hyphenated = tokens[i - 1]?.surface_form === "-" || tokens[i + 1]?.surface_form === "-";
        const kana = numberTokenKana(digits, { digitByDigit: hyphenated });
        current.push(...kanaToPhones(kana));
      }
      continue;
    }
    // Particle readings that differ from the dictionary headword reading.
    let reading = tok.reading ?? "";
    if (surface === "こんにちは") reading = "コンニチワ";
    else if (surface === "こんばんは") reading = "コンバンワ";
    if (surface === "は" && tok.pos === "助詞") reading = "ワ";
    else if (surface === "へ" && tok.pos === "助詞") reading = "エ";
    else if (!reading && /^[ァ-ヶー]+$/.test(surface)) reading = surface; // katakana word without a reading
    const phones = reading ? kanaToPhones(reading) : [];
    if (!phones.length) continue;
    // A noun directly following another noun is a compound (人工知能,
    // 音声合成, 電話番号): OpenJTalk keeps it in the same accent phrase.
    const compound = tok.pos === "名詞" && prevPos === "名詞";
    if (current.length && startsPhrase(tok) && !compound) flush();
    current.push(...phones);
    prevPos = tok.pos;
  }
  flush();
  return segments;
}

// ---- assembly (ported from oj_frontend.py) --------------------------------

function geminate(nextPhone: string | undefined): string[] {
  if (nextPhone === "ch") return ["t"];
  if (nextPhone === "j") return ["d"];
  const mapped = nextPhone ? PHONE_MAP[nextPhone] : undefined;
  return mapped ? [mapped[0]] : [];
}

export interface Phonemized {
  symbols: string[];
  ids: number[];
  stress: number[];
  unknown: string[];
}

export async function phonemize(text: string): Promise<Phonemized> {
  const symbols: string[] = [BOS];
  const stress: number[] = [0];
  const unknown: string[] = [];
  const emit = (sym: string, stressed = false) => {
    symbols.push(sym);
    stress.push(stressed ? 1 : 0);
  };

  const clauses: Array<[string, string | null]> = [];
  const splitRe = /([^。、？！]*)([。、？！])/g;
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = splitRe.exec(text)) !== null) {
    clauses.push([m[1], PUNCT[m[2]]]);
    pos = splitRe.lastIndex;
  }
  if (pos < text.length) clauses.push([text.slice(pos), null]);
  const kept = clauses.filter(([c, p]) => c.trim() || p);

  for (const [clause, punct] of kept) {
    if (clause.trim()) {
      const segments = await clauseToSegments(clause);
      for (let segI = 0; segI < segments.length; segI++) {
        const seg = segments[segI];
        if (!seg.length) continue;
        if ((segI > 0 || symbols.length > 1) && !PUNCT_VALUES.has(symbols[symbols.length - 1])) {
          emit(SP);
        }
        let stressedDone = false;
        for (let i = 0; i < seg.length; i++) {
          const phone = seg[i];
          if (phone === "cl") {
            for (const sym of geminate(seg[i + 1])) emit(sym);
            continue;
          }
          let mapped = PHONE_MAP[phone];
          if (!mapped) {
            unknown.push(phone);
            mapped = [UNK];
          }
          for (const sym of mapped) {
            const isVowel = VOWELS.has(sym);
            emit(sym, isVowel && !stressedDone);
            if (isVowel) stressedDone = true;
          }
        }
      }
    }
    if (punct && symbols[symbols.length - 1] !== punct) emit(punct);
  }
  emit(EOS);
  const ids = symbols.map((s) => SYMBOL_TO_ID[s]);
  return { symbols, ids, stress, unknown };
}
