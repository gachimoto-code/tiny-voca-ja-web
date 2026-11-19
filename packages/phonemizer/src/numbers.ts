// Japanese number readings (katakana) for digit tokens, which kuromoji
// leaves without readings. Counter euphony follows the rules used by the
// Python evaluation tooling (numeral_norm.py), extended with 円・時・個.

const ONES = ["", "イチ", "ニ", "サン", "ヨン", "ゴ", "ロク", "ナナ", "ハチ", "キュウ"];
const DIGIT = ["ゼロ", "イチ", "ニ", "サン", "ヨン", "ゴ", "ロク", "ナナ", "ハチ", "キュウ"];

/** Natural reading of an integer 0..99999 (no counter). */
export function intKana(n: number): string {
  if (n === 0) return "ゼロ";
  let out = "";
  const man = Math.floor(n / 10000);
  if (man) out += ONES[man] + "マン";
  n %= 10000;
  const th = Math.floor(n / 1000);
  if (th) out += th === 1 ? "セン" : th === 3 ? "サンゼン" : th === 8 ? "ハッセン" : ONES[th] + "セン";
  const hu = Math.floor((n % 1000) / 100);
  if (hu) out += hu === 1 ? "ヒャク" : hu === 3 ? "サンビャク" : hu === 6 ? "ロッピャク" : hu === 8 ? "ハッピャク" : ONES[hu] + "ヒャク";
  const te = Math.floor((n % 100) / 10);
  if (te) out += te === 1 ? "ジュウ" : ONES[te] + "ジュウ";
  const on = n % 10;
  if (on) out += ONES[on];
  return out;
}

export function digitsKana(s: string): string {
  return [...s].map((d) => DIGIT[Number(d)]).join("");
}

const MONTH: Record<number, string> = { 4: "シガツ", 7: "シチガツ", 9: "クガツ" };
const DAY: Record<number, string> = {
  1: "ツイタチ", 2: "フツカ", 3: "ミッカ", 4: "ヨッカ", 5: "イツカ",
  6: "ムイカ", 7: "ナノカ", 8: "ヨウカ", 9: "ココノカ", 10: "トオカ",
  14: "ジュウヨッカ", 19: "ジュウクニチ", 20: "ハツカ", 24: "ニジュウヨッカ",
};

function minuteKana(n: number): string {
  const on = n % 10;
  if (on === 0) return intKana(n).replace(/ウ$/, "ッ") + "プン"; // ジュップン, ニジュップン...
  if ([1, 3, 4, 6, 8].includes(on)) {
    const base = n > 10 ? intKana(Math.floor(n / 10) * 10) : "";
    return base + { 1: "イップン", 3: "サンプン", 4: "ヨンプン", 6: "ロップン", 8: "ハップン" }[on as 1 | 3 | 4 | 6 | 8];
  }
  return intKana(n) + "フン";
}

/** Reading of number + counter (counter given as its surface kanji). */
export function counterKana(n: number, counter: string): string {
  switch (counter) {
    case "年": return intKana(n) + "ネン";
    case "月": return MONTH[n] ?? intKana(n) + "ガツ";
    case "日": return DAY[n] ?? intKana(n) + "ニチ";
    case "時": return n === 4 ? "ヨジ" : n === 7 ? "シチジ" : n === 9 ? "クジ" : intKana(n) + "ジ";
    case "分": return minuteKana(n);
    case "円": return intKana(n) + "エン";
    case "人": return n === 1 ? "ヒトリ" : n === 2 ? "フタリ" : n === 4 ? "ヨニン" : n === 7 ? "シチニン" : intKana(n) + "ニン";
    case "歳": return n === 1 ? "イッサイ" : n === 8 ? "ハッサイ" : n === 10 ? "ジュッサイ" : n === 20 ? "ハタチ" : intKana(n) + "サイ";
    case "個": return n === 1 ? "イッコ" : n === 6 ? "ロッコ" : n === 8 ? "ハッコ" : n === 10 ? "ジュッコ" : intKana(n) + "コ";
    case "番": return intKana(n) + "バン";
    case "号": return intKana(n) + "ゴウ";
    case "階": return n === 3 ? "サンガイ" : intKana(n) + "カイ";
    case "本": {
      const on = n % 10;
      if (on === 1 || on === 6 || on === 8 || on === 10) return intKana(n - on) + ({ 1: "イッポン", 6: "ロップン", 8: "ハッポン", 10: "ジュッポン" } as Record<number, string>)[on === 10 ? 10 : on];
      if (on === 3) return intKana(n - 3) + "サンボン";
      return intKana(n) + "ホン";
    }
    default: return intKana(n);
  }
}

export const COUNTERS = new Set(["年", "月", "日", "時", "分", "円", "人", "歳", "個", "番", "号", "階", "本"]);

/**
 * Split a number reading into OpenJTalk-style accent-phrase chunks:
 * each non-zero digit group (thousands / hundreds / tens / ones) becomes
 * its own chunk for numbers >= 100; the counter attaches to the last
 * chunk. Two-digit and one-digit numbers stay whole, except 19日,
 * which OpenJTalk reads as ジュウ + クニチ.
 */
export function numberChunksKana(n: number, counter?: string): string[] {
  if (counter === "日" && n === 19) return ["ジュウ", "クニチ"];
  if (n < 100) return [counter ? counterKana(n, counter) : intKana(n)];
  const groups: Array<[number, string]> = [
    [Math.floor(n / 1000), "セン"],
    [Math.floor((n % 1000) / 100), "ヒャク"],
    [Math.floor((n % 100) / 10), "ジュウ"],
    [n % 10, ""],
  ];
  const chunks: string[] = [];
  for (const [digit, unit] of groups) {
    if (!digit) continue;
    let kana: string;
    if (unit === "セン") kana = digit === 1 ? "セン" : digit === 3 ? "サンゼン" : digit === 8 ? "ハッセン" : ONES[digit] + "セン";
    else if (unit === "ヒャク") kana = digit === 1 ? "ヒャク" : digit === 3 ? "サンビャク" : digit === 6 ? "ロッピャク" : digit === 8 ? "ハッピャク" : ONES[digit] + "ヒャク";
    else if (unit === "ジュウ") kana = digit === 1 ? "ジュウ" : ONES[digit] + "ジュウ";
    else kana = ONES[digit];
    chunks.push(kana);
  }
  if (counter) {
    // Re-attach the counter: strip it from the whole-reading tail. The
    // counter reading depends on the full number (e.g. 分 euphony), so
    // compute it from counterKana minus the intKana prefix when possible.
    const whole = counterKana(n, counter);
    const prefix = intKana(n);
    const suffix = whole.startsWith(prefix) ? whole.slice(prefix.length) : "";
    if (suffix) {
      chunks[chunks.length - 1] += suffix;
    } else {
      // Counter reading reshapes the number itself (special readings):
      // fall back to a single chunk.
      return [whole];
    }
  }
  return chunks;
}

/** Reading for a bare digit token (no counter follows). */
export function numberTokenKana(surface: string, opts: { digitByDigit?: boolean } = {}): string {
  const s = surface.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (s.includes(".")) {
    const [ip, fp] = s.split(".");
    return intKana(Number(ip)) + "テン" + digitsKana(fp);
  }
  if (opts.digitByDigit || (s.length > 1 && s.startsWith("0")) || s.length > 5) {
    return digitsKana(s);
  }
  return intKana(Number(s));
}
