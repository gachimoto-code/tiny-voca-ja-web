import { useRef, useState } from "react";

type Version = {
  url: string;
  label: string;
  downloadName: string;
};

export default function App() {
  const [text, setText] = useState("今日は2026年11月19日木曜日です。会議は午後3時30分からで、参加者は12人です。");
  const [voice, setVoice] = useState("F2");
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [vocoderNote, setVocoderNote] = useState("");
  const [info, setInfo] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  async function fetchSpeak(vocoder: boolean): Promise<Blob> {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, speed, vocoder }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.blob();
  }

  async function speak() {
    setBusy(true);
    setError("");
    setVocoderNote("");
    const started = performance.now();
    try {
      const [original, vocoded] = await Promise.allSettled([
        fetchSpeak(false),
        fetchSpeak(true),
      ]);
      if (original.status === "rejected") throw original.reason;
      const next: Version[] = [
        {
          url: URL.createObjectURL(original.value),
          label: "元音声（ソース・フィルタ式）",
          downloadName: "tiny-voca-ja-original.wav",
        },
      ];
      if (vocoded.status === "fulfilled") {
        next.push({
          url: URL.createObjectURL(vocoded.value),
          label: "ボコーダ再合成（HiFi-GAN）",
          downloadName: "tiny-voca-ja-vocoded.wav",
        });
      } else {
        const reason = vocoded.reason;
        setVocoderNote(
          `ボコーダ版は生成できませんでした: ${reason instanceof Error ? reason.message : String(reason)}`,
        );
      }
      setVersions((old) => {
        for (const v of old) URL.revokeObjectURL(v.url);
        return next;
      });
      setInfo(`生成 ${((performance.now() - started) / 1000).toFixed(2)} 秒`);
      requestAnimationFrame(() => audioRef.current?.play().catch(() => {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "2rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: "1.4rem" }}>tiny-voca-ja Web（サーバ版 / ONNX）</h1>
      <p style={{ color: "#666", fontSize: "0.9rem" }}>
        日本語テキストを入力すると、4.5Mパラメータの小さな音声合成モデルが読み上げます。推論はサーバ側の ONNX Runtime で実行されます。
        生成時に、元音声と HiFi-GAN ボコーダで再合成した音声の両方が作られ、聴き比べできます。
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
          <select value={voice} onChange={(e) => setVoice(e.target.value)}>
            <option value="F2">F2（女性）</option>
            <option value="M2">M2（男性）</option>
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
        <button onClick={speak} disabled={busy || !text.trim()} style={{ padding: "0.5rem 1.25rem", fontSize: "1rem" }}>
          {busy ? "生成中…" : "読み上げる"}
        </button>
      </div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {versions.length > 0 && (
        <div>
          {versions.map((v, i) => (
            <div key={v.label} style={{ marginBottom: "1rem" }}>
              <p style={{ fontSize: "0.9rem", margin: "0 0 0.25rem" }}>
                {v.label}{" "}
                <a href={v.url} download={v.downloadName} style={{ fontSize: "0.85rem" }}>
                  WAVをダウンロード
                </a>
              </p>
              <audio
                ref={i === 0 ? audioRef : undefined}
                controls
                src={v.url}
                style={{ width: "100%" }}
              />
            </div>
          ))}
          {vocoderNote && <p style={{ fontSize: "0.85rem", color: "#a60" }}>{vocoderNote}</p>}
          <p style={{ fontSize: "0.85rem", color: "#666" }}>{info}</p>
        </div>
      )}
    </main>
  );
}
