import { useRef, useState } from "react";
import { speak } from "./engine";

export default function App() {
  const [text, setText] = useState("今日は2026年11月19日木曜日です。会議は午後3時30分からで、参加者は12人です。");
  const [voice, setVoice] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [info, setInfo] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  async function run() {
    setBusy(true);
    setError("");
    const started = performance.now();
    try {
      const { blob, phonemes } = await speak(text, voice, speed);
      const url = URL.createObjectURL(blob);
      setAudioUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      setInfo(`生成 ${((performance.now() - started) / 1000).toFixed(2)} 秒 / 音素 ${phonemes} 個（ブラウザ内WASMで合成）`);
      requestAnimationFrame(() => audioRef.current?.play().catch(() => {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.4rem" }}>tiny-voca-ja Web（ブラウザ版 / WASM）</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        サーバを使わず、ブラウザの中で WASM 化した C エンジンが読み上げます。初回はモデル（約4.9MB）と形態素辞書の読み込みに少し時間がかかります。
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={200}
        style={{ width: "100%", fontSize: "1rem", padding: "0.5rem", boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", margin: "0.75rem 0", flexWrap: "wrap" }}>
        <label>
          声{" "}
          <select value={voice} onChange={(e) => setVoice(Number(e.target.value))}>
            <option value={0}>F2（女性）</option>
            <option value={1}>M2（男性）</option>
          </select>
        </label>
        <label>
          速度 {speed.toFixed(2)}x{" "}
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </label>
        <button onClick={run} disabled={busy || !text.trim()} style={{ padding: "0.5rem 1.25rem", fontSize: "1rem" }}>
          {busy ? "生成中…" : "読み上げる"}
        </button>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {audioUrl && (
        <div>
          <audio ref={audioRef} controls src={audioUrl} style={{ width: "100%" }} />
          <p style={{ fontSize: "0.85rem", color: "#666" }}>
            {info}{" "}
            <a href={audioUrl} download="tiny-voca-ja.wav">
              WAVをダウンロード
            </a>
          </p>
        </div>
      )}
    </main>
  );
}
