// English -> katakana conversion (Route A: no model retraining).
//
// The tiny-voca-ja model only knows Japanese phonemes, so English words
// embedded in Japanese text are read as katakana loanwords:
//   1. dictionary lookup (en-dict.json, ~9,400 common words generated
//      from CMUdict ARPAbet with Japanese loanword conventions, plus
//      hand-written overrides for tech terms),
//   2. all-caps tokens (AI, GPU, USB...) are spelled out letter by letter,
//   3. anything else falls back to grapheme rules (approximate).
//
// Proper nouns and rare words are approximations by design; the goal is
// that a mixed sentence is spoken at all instead of dropping the word.

import enDictJson from "./en-dict.json" with { type: "json" };
import { numberTokenKana } from "./numbers.js";

const EN_DICT = enDictJson as Record<string, string>;

export const LETTER_NAMES: Record<string, string> = {
  a: "エー", b: "ビー", c: "シー", d: "ディー", e: "イー", f: "エフ",
  g: "ジー", h: "エイチ", i: "アイ", j: "ジェー", k: "ケー", l: "エル",
  m: "エム", n: "エン", o: "オー", p: "ピー", q: "キュー", r: "アール",
  s: "エス", t: "ティー", u: "ユー", v: "ブイ", w: "ダブリュー",
  x: "エックス", y: "ワイ", z: "ゼット",
};

function spellOut(word: string): string {
  return [...word.toLowerCase()].map((c) => LETTER_NAMES[c] ?? "").join("");
}

// ---- grapheme fallback ----------------------------------------------------

type Row = [string, string, string, string, string]; // a i u e o
const ONSET_ROW: Record<string, Row> = {
  b: ["バ", "ビ", "ブ", "ベ", "ボ"],
  d: ["ダ", "ヂ", "ヅ", "デ", "ド"],
  f: ["ファ", "フィ", "フ", "フェ", "フォ"],
  g: ["ガ", "ギ", "グ", "ゲ", "ゴ"],
  h: ["ハ", "ヒ", "フ", "ヘ", "ホ"],
  j: ["ジャ", "ジ", "ジュ", "ジェ", "ジョ"],
  k: ["カ", "キ", "ク", "ケ", "コ"],
  l: ["ラ", "リ", "ル", "レ", "ロ"],
  m: ["マ", "ミ", "ム", "メ", "モ"],
  n: ["ナ", "ニ", "ヌ", "ネ", "ノ"],
  p: ["パ", "ピ", "プ", "ペ", "ポ"],
  r: ["ラ", "リ", "ル", "レ", "ロ"],
  s: ["サ", "シ", "ス", "セ", "ソ"],
  t: ["タ", "チ", "ツ", "テ", "ト"],
  v: ["ヴァ", "ヴィ", "ヴ", "ヴェ", "ヴォ"],
  z: ["ザ", "ジ", "ズ", "ゼ", "ゾ"],
};
const CH_ROW: Row = ["チャ", "チ", "チュ", "チェ", "チョ"];
const SH_ROW: Row = ["シャ", "シ", "シュ", "シェ", "ショ"];
const W_ROW: Row = ["ワ", "ウィ", "ウ", "ウェ", "ウォ"];
const Y_ROW: Row = ["ヤ", "イ", "ユ", "エ", "ヨ"];
const CODA: Record<string, string> = {
  b: "ブ", c: "ク", d: "ド", f: "フ", g: "グ", j: "ッジ", k: "ク",
  l: "ル", m: "ム", n: "ン", p: "プ", r: "ー", s: "ス", t: "ト",
  v: "ヴ", x: "クス", z: "ズ",
};
const VOWEL_KANA: Record<string, string> = { a: "ア", e: "エ", i: "イ", o: "オ", u: "ウ" };
const VOWEL_IDX: Record<string, number> = { a: 0, i: 1, u: 2, e: 3, o: 4 };
const DIGRAPH_VOWEL: Record<string, string> = {
  ee: "イー", ea: "イー", ie: "イー", oo: "ウー", ou: "アウ", ow: "アウ",
  ai: "エイ", ay: "エイ", ei: "エイ", ey: "エイ", au: "オー", oi: "オイ",
  oy: "オイ", eu: "ユー", ue: "ウー", ui: "ウイ",
};
// digraph vowel after a consonant: representative row vowel + tail kana
const DIGRAPH_ONSET: Record<string, [number, string]> = {
  ee: [1, "ー"], ea: [1, "ー"], ie: [1, "ー"], oo: [2, "ー"], ue: [2, "ー"],
  ai: [3, "イ"], ay: [3, "イ"], ei: [3, "イ"], ey: [3, "イ"],
  ou: [4, "ウ"], ow: [4, "ウ"], au: [4, ""], oi: [4, "イ"], oy: [4, "イ"],
  eu: [2, ""], ui: [1, ""],
};

/** The vowel (single letter or digraph) starting at j, or null. */
function vowelAt(w: string, j: number): string | null {
  const two = w.slice(j, j + 2);
  if (DIGRAPH_VOWEL[two]) return two;
  if ("aeiou".includes(w[j] ?? "")) return w[j];
  return null;
}

/** Onset kana for a consonant row + vowel (single or digraph). */
function onset(row: Row, v: string): string {
  if (v.length === 2) {
    const [idx, tail] = DIGRAPH_ONSET[v] ?? [0, ""];
    return row[idx] + tail;
  }
  return row[VOWEL_IDX[v] ?? 0];
}

/** Approximate katakana reading of an English word from its spelling. */
export function graphemeToKana(word: string): string {
  let w = word.toLowerCase().replace(/['’]/g, "");
  // silent final e (but keep -ee/-ie/-ye endings handled by vowel rules)
  if (/[^aeiou]e$/.test(w) && w.length > 2) w = w.slice(0, -1);
  let out = "";
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);
    if (rest.startsWith("tion")) { out += "ション"; i += 4; continue; }
    if (rest.startsWith("sion")) { out += "ジョン"; i += 4; continue; }
    if (rest.startsWith("ture")) { out += "チャー"; i += 4; continue; }
    const pair: [string, Row | null, string] | null =
      rest.startsWith("ch") ? ["ch", CH_ROW, "ッチ"] :
      rest.startsWith("sh") ? ["sh", SH_ROW, "シュ"] :
      rest.startsWith("th") ? ["th", ONSET_ROW.s, "ス"] :
      rest.startsWith("ph") ? ["ph", ONSET_ROW.f, "フ"] : null;
    if (pair) {
      const v = vowelAt(w, i + 2);
      if (v && pair[1]) { out += onset(pair[1], v); i += 2 + v.length; }
      else { out += pair[2]; i += 2; }
      continue;
    }
    if (rest.startsWith("ck")) { out += "ック"; i += 2; continue; }
    if (rest.startsWith("ng")) {
      const v = vowelAt(w, i + 2);
      if (v) { out += "ン" + onset(ONSET_ROW.g, v); i += 2 + v.length; }
      else { out += "ング"; i += 2; }
      continue;
    }
    if (rest.startsWith("qu")) {
      const v = vowelAt(w, i + 2);
      if (v && v.length === 1) { out += ONSET_ROW.k[VOWEL_IDX[v]]; i += 3; }
      else { out += "ク"; i += 2; }
      continue;
    }
    const c = w[i];
    // doubled consonant -> geminate mark, then treat as single
    if (c === w[i + 1] && "bcdfgklmnprstz".includes(c)) { out += "ッ"; i += 1; continue; }
    const v = vowelAt(w, i + 1);
    if (v && (ONSET_ROW[c] || c === "c" || c === "y" || c === "w")) {
      if (c === "c") {
        const hard = !(v === "e" || v === "i" || v === "y" || v === "ei" || v === "ie");
        out += onset(hard ? ONSET_ROW.k : ONSET_ROW.s, v);
      } else if (c === "g") {
        const soft = v === "e" || v === "i" || v === "ei" || v === "ie";
        out += onset(soft ? ONSET_ROW.j : ONSET_ROW.g, v);
      } else if (c === "y") out += onset(Y_ROW, v);
      else if (c === "w") out += onset(W_ROW, v);
      else out += onset(ONSET_ROW[c], v);
      i += 1 + v.length;
      continue;
    }
    const two = w.slice(i, i + 2);
    if (DIGRAPH_VOWEL[two]) { out += DIGRAPH_VOWEL[two]; i += 2; continue; }
    if ("aeiou".includes(c)) { out += VOWEL_KANA[c]; i += 1; continue; }
    if (c === "y") { out += "イ"; i += 1; continue; }
    if (c === "w") { i += 1; continue; }
    if (CODA[c]) { out += CODA[c]; i += 1; continue; }
    i += 1; // h and anything unknown: skip
  }
  return out;
}

/** Katakana reading for one English word (letters only). */
export function englishToKana(word: string): string {
  const lower = word.toLowerCase();
  const hit = EN_DICT[lower];
  if (hit) return hit;
  // all-caps acronym (AI, GPU, USB, NASA...): spell it out
  if (word.length >= 2 && word.length <= 6 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
    return spellOut(word);
  }
  if (word.length === 1) return LETTER_NAMES[lower] ?? "";
  return graphemeToKana(word);
}

const FULLWIDTH = /[Ａ-Ｚａ-ｚ０-９]/g;

/**
 * If a kuromoji token surface is Latin letters (optionally mixed with
 * digits), return its katakana reading; otherwise return null.
 * Full-width Latin is normalized first.
 */
export function latinSurfaceToKana(surface: string): string | null {
  const half = surface.replace(FULLWIDTH, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!/^[A-Za-z0-9][A-Za-z0-9'’.-]*$/.test(half) || !/[A-Za-z]/.test(half)) return null;
  // split into letter runs and digit runs: "Web3" -> ウェブ + サン
  let out = "";
  const runs = half.match(/[A-Za-z'’]+|[0-9]+/g) ?? [];
  for (const run of runs) {
    if (/^[0-9]+$/.test(run)) out += numberTokenKana(run);
    else out += englishToKana(run.replace(/['’]/g, ""));
  }
  return out || null;
}
