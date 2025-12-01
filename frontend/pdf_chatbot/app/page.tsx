"use client";

import { ChangeEvent, useMemo, useState } from "react";

const BACKEND_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

type SourceType = "pdf" | "txt" | "text";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
};

const SOURCE_OPTIONS: Array<{ label: string; value: SourceType; description: string }>
  = [
    {
      label: "PDF Upload",
      value: "pdf",
      description: "Drag in a .pdf file up to a few MB.",
    },
    {
      label: "TXT Upload",
      value: "txt",
      description: "Works best for clean, plain text files.",
    },
    {
      label: "Paste Text",
      value: "text",
      description: "Paste or type paragraphs of text.",
    },
  ];

const generateId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

export default function Home() {
  const [sourceType, setSourceType] = useState<SourceType>("pdf");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [txtFile, setTxtFile] = useState<File | null>(null);
  const [plainText, setPlainText] = useState("");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [chatStatus, setChatStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const hasActiveDocument = Boolean(documentId);

  const cleanedMessages = useMemo(() => messages, [messages]);

  const resetFileInputs = () => {
    setPdfFile(null);
    setTxtFile(null);
    setPlainText("");
    setFileInputKey((key) => key + 1);
  };

  const handleFileSelection = (
    event: ChangeEvent<HTMLInputElement>,
    setter: (file: File | null) => void,
  ) => {
    const file = event.target.files?.[0] ?? null;
    setter(file);
  };

  const handleUpload = async () => {
    setError(null);
    setUploadStatus("");

    const formData = new FormData();

    if (sourceType === "pdf") {
      if (!pdfFile) {
        setError("Select a PDF file first.");
        return;
      }
      formData.append("pdf_file", pdfFile);
    } else if (sourceType === "txt") {
      if (!txtFile) {
        setError("Select a TXT file first.");
        return;
      }
      formData.append("txt_file", txtFile);
    } else {
      if (!plainText.trim()) {
        setError("Paste some text before uploading.");
        return;
      }
      formData.append("plain_text", plainText.trim());
    }

    try {
      setIsUploading(true);
      setUploadStatus("Uploading and indexing…");
      const response = await fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error((await response.text()) || "Upload failed.");
      }

      const data = (await response.json()) as { document_id: string };
      setDocumentId(data.document_id);
      setMessages([]);
      setQuestion("");
      setUploadStatus("Document ready. Start chatting!");
      resetFileInputs();
    } catch (err) {
      setUploadStatus("");
      setError((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendQuestion = async () => {
    const trimmedQuestion = question.trim();
    if (!hasActiveDocument) {
      setError("Upload a document before chatting.");
      return;
    }
    if (!trimmedQuestion) {
      setError("Type a question first.");
      return;
    }

    setError(null);
    setChatStatus("Thinking…");
    setIsSending(true);

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: trimmedQuestion,
    };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");

    try {
      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmedQuestion,
          document_id: documentId,
        }),
      });

      if (!response.ok) {
        throw new Error((await response.text()) || "Chat request failed.");
      }

      const data = (await response.json()) as {
        answer: string;
        sources?: string[];
      };

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: data.answer?.trim() || "I wasn't able to craft a response.",
        sources: data.sources ?? [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: `⚠️ ${ (err as Error).message }`,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setChatStatus("");
      setIsSending(false);
    }
  };

  const switchSource = (value: SourceType) => {
    setSourceType(value);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[360px,1fr] lg:px-10">
        <aside className="space-y-6">
          <header className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-slate-900/40">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">
              Document Playground
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight">
              Upload a PDF or text, then chat with it like a teammate.
            </h1>
            {hasActiveDocument && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                <span className="block h-2 w-2 rounded-full bg-emerald-300" />
                Document indexed
              </p>
            )}
          </header>

          <section className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-slate-900/30">
            <div className="flex items-center justify-between text-sm font-medium text-white/80">
              <span>Source</span>
              <span className="text-xs uppercase tracking-widest text-white/40">
                Choose input
              </span>
            </div>
            <div className="grid gap-3">
              {SOURCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => switchSource(option.value)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition hover:border-white/50 ${
                    sourceType === option.value
                      ? "border-emerald-300/60 bg-emerald-400/10 shadow-lg"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="text-xs text-white/60">{option.description}</p>
                </button>
              ))}
            </div>

            {sourceType === "pdf" && (
              <div className="rounded-2xl border border-dashed border-white/20 bg-slate-950/40 p-4 text-sm text-white/70">
                <p className="mb-3 font-medium">Drop your PDF</p>
                <input
                  key={`pdf-${fileInputKey}`}
                  type="file"
                  accept="application/pdf"
                  className="block w-full text-xs text-white/60 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white"
                  onChange={(event) => handleFileSelection(event, setPdfFile)}
                />
                {pdfFile && (
                  <p className="mt-2 text-xs text-emerald-200">{pdfFile.name}</p>
                )}
              </div>
            )}

            {sourceType === "txt" && (
              <div className="rounded-2xl border border-dashed border-white/20 bg-slate-950/40 p-4 text-sm text-white/70">
                <p className="mb-3 font-medium">Upload a .txt file</p>
                <input
                  key={`txt-${fileInputKey}`}
                  type="file"
                  accept="text/plain"
                  className="block w-full text-xs text-white/60 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white"
                  onChange={(event) => handleFileSelection(event, setTxtFile)}
                />
                {txtFile && (
                  <p className="mt-2 text-xs text-emerald-200">{txtFile.name}</p>
                )}
              </div>
            )}

            {sourceType === "text" && (
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 text-sm text-white/70">
                <p className="mb-3 font-medium">Paste your text</p>
                <textarea
                  value={plainText}
                  onChange={(event) => setPlainText(event.target.value)}
                  rows={6}
                  placeholder="Paste the document contents here…"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-emerald-300"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleUpload}
              disabled={isUploading}
              className="w-full rounded-2xl bg-emerald-400/90 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-950 shadow-lg shadow-emerald-500/40 transition hover:bg-emerald-300 disabled:opacity-50"
            >
              {isUploading ? "Indexing…" : hasActiveDocument ? "Replace Document" : "Upload & Index"}
            </button>

            {uploadStatus && (
              <p className="text-xs text-emerald-200">{uploadStatus}</p>
            )}
            {error && (
              <p className="text-xs text-rose-300">{error}</p>
            )}
          </section>
        </aside>

        <section className="flex flex-col rounded-3xl border border-white/10 bg-slate-950/50 p-6 shadow-2xl shadow-slate-950/60">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-white/40">
                Chat
              </p>
              <h2 className="text-2xl font-semibold">Ask anything about your document</h2>
            </div>
            {chatStatus && (
              <p className="text-xs font-medium text-white/60">{chatStatus}</p>
            )}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-white/5 bg-slate-950/60 p-5">
            {cleanedMessages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center text-sm text-white/40">
                <p className="text-base font-semibold text-white/70">
                  No messages yet
                </p>
                <p className="mt-1 max-w-sm text-white/50">
                  Upload a document on the left, then ask your first question to start the conversation.
                </p>
              </div>
            ) : (
              cleanedMessages.map((message) => {
                const isUser = message.role === "user";
                const bubbleClasses = isUser
                  ? "self-end bg-emerald-500/20 border-emerald-300/40"
                  : "self-start bg-white/10 border-white/20";
                const sources = (message.sources ?? []).filter(Boolean);
                return (
                  <div
                    key={message.id}
                    className={`flex flex-col gap-2 rounded-2xl border px-4 py-3 text-sm leading-relaxed ${bubbleClasses}`}
                  >
                    <p className="text-xs uppercase tracking-wide text-white/50">
                      {isUser ? "You" : "Assistant"}
                    </p>
                    <p className="text-base whitespace-pre-wrap text-white/90">
                      {message.content}
                    </p>
                    {sources.length > 0 && (
                      <div className="text-xs text-white/60">
                        Sources:
                        <ul className="mt-1 list-disc space-y-0.5 pl-4">
                          {sources.map((src, index) => (
                            <li key={`${message.id}-${index}`}>{src}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={3}
              placeholder={hasActiveDocument ? "Ask a question about the document…" : "Upload a document first"}
              className="w-full rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-emerald-300"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-white/40">
                Answers are grounded in the indexed document.
              </p>
              <button
                type="button"
                onClick={handleSendQuestion}
                disabled={isSending}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold uppercase tracking-wide text-slate-950 shadow-lg shadow-white/40 transition hover:bg-emerald-100 disabled:opacity-50"
              >
                {isSending ? "Thinking…" : "Send"}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
