// Minimal browser shim for Node's "path" module (posix semantics).
//
// kuromoji's DictionaryLoader calls path.join(dicPath, filename) to build
// dictionary file URLs even in the browser build, and Vite does not
// polyfill Node builtins, so "path" is aliased to this file in
// vite.config.ts. Only the small surface kuromoji-style callers need is
// implemented.

function normalizePosix(p: string): string {
  const isAbsolute = p.startsWith("/");
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!isAbsolute) out.push("..");
      continue;
    }
    out.push(seg);
  }
  const joined = (isAbsolute ? "/" : "") + out.join("/");
  return joined === "" ? "." : joined;
}

export function join(...parts: string[]): string {
  const nonEmpty = parts.filter((part) => part.length > 0);
  if (nonEmpty.length === 0) return ".";
  return normalizePosix(nonEmpty.join("/"));
}

export function resolve(...parts: string[]): string {
  let resolved = "";
  for (const part of parts) {
    if (!part) continue;
    resolved = part.startsWith("/") ? part : `${resolved}/${part}`;
  }
  return normalizePosix(resolved === "" ? "/" : resolved);
}

export function dirname(p: string): string {
  const normalized = normalizePosix(p);
  const idx = normalized.lastIndexOf("/");
  if (idx < 0) return ".";
  if (idx === 0) return "/";
  return normalized.slice(0, idx);
}

export function basename(p: string): string {
  const normalized = normalizePosix(p);
  const idx = normalized.lastIndexOf("/");
  return idx < 0 ? normalized : normalized.slice(idx + 1);
}

export const sep = "/";
export const posix = { join, resolve, dirname, basename, sep };

export default { join, resolve, dirname, basename, sep, posix };
