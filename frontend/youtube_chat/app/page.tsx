"use client";

import { useState } from "react";

const BACKEND_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

export default function Home() {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"index" | "ask" | null>(null);

  const callBackend = async (path: string, body: unknown) => {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error((await response.text()) || "Request failed.");
    }
    return response.json();
  };

  const prepareVideo = async () => {
    if (!youtubeUrl) {
      setError("Paste a YouTube URL first.");
      return;
    }
    try {
      setLoading("index");
      setStatus("Indexing video…");
      setError("");
      await callBackend("/prepare", { youtube_url: youtubeUrl });
      setStatus("Video ready. Ask away!");
    } catch (err) {
      setStatus("");
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const askVideoQuestion = async () => {
    if (!youtubeUrl || !question) {
      setError("Enter both the URL and a question.");
      return;
    }
    try {
      setLoading("ask");
      setStatus("Thinking…");
      setError("");
      const { answer: ans, sources: srcs } = await callBackend("/ask", {
        youtube_url: youtubeUrl,
        question,
      });
      setAnswer(ans ?? "");
      setSources(srcs ?? []);
      setStatus("");
    } catch (err) {
      setAnswer("");
      setSources([]);
      setStatus("");
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12 ">
        <h1 className="text-3xl font-semibold">YouTube RAG Assistant</h1>
        <section className="space-y-3 rounded-2xl bg-zinc-900 p-5">
          <label className="text-sm font-medium uppercase tracking-wide">
            YouTube URL
          </label>
          <input
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full rounded-lg border border-zinc-700 bg-black/40 p-3 text-base outline-none focus:border-white"
          />
          <button
            onClick={prepareVideo}
            disabled={loading === "index"}
            className="w-full rounded-lg bg-white/10 px-4 py-3 text-sm font-semibold uppercase tracking-wide disabled:opacity-50"
          >
            {loading === "index" ? "Preparing…" : "Prepare Context"}
          </button>
          {status && <p className="text-xs text-emerald-400">{status}</p>}
        </section>
        <section className="space-y-3 rounded-2xl bg-zinc-900 p-5">
          <label className="text-sm font-medium uppercase tracking-wide">
            Question
          </label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
            placeholder="What was the main takeaway...?"
            className="w-full rounded-lg border border-zinc-700 bg-black/40 p-3 text-base outline-none focus:border-white"
          />
          <button
            onClick={askVideoQuestion}
            disabled={loading === "ask"}
            className="w-full rounded-lg bg-white px-4 py-3 text-sm font-semibold uppercase tracking-wide text-black disabled:opacity-50"
          >
            {loading === "ask" ? "Asking…" : "Ask"}
          </button>
        </section>
        {error && (
          <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </p>
        )}
        {answer && (
          <section className="space-y-2 rounded-2xl bg-zinc-900 p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Answer
            </p>
            <p className="text-lg leading-relaxed text-white">{answer}</p>
            {!!sources.length && (
              <div className="text-xs text-zinc-400">
                Sources:
                <ul className="list-disc pl-5">
                  {sources.map((src, i) => (
                    <li key={`${src}-${i}`}>{src || "Transcript chunk"}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
