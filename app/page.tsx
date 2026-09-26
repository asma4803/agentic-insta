"use client";

import { useState } from "react";

import { CaptionResults } from "@/components/CaptionResults";
import { DirectionSelector } from "@/components/DirectionSelector";
import { GenerateButton } from "@/components/GenerateButton";
import { ImageUploader } from "@/components/ImageUploader";
import { StyleSelector } from "@/components/StyleSelector";
import type {
  CaptionDirection,
  CaptionStyle,
  GenerateResult,
} from "@/types/agent";

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [context, setContext] = useState("");
  const [style, setStyle] = useState<CaptionStyle>("Minimal");
  const [direction, setDirection] =
    useState<CaptionDirection>("Express a feeling");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  async function generate() {
    if (!file) {
      setError("Please upload a photograph before generating.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("context", context);
      formData.append("style", style);
      formData.append("direction", direction);

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as
        | GenerateResult
        | { error?: string };

      if (!response.ok) {
        const message =
          "error" in data && typeof data.error === "string"
            ? data.error
            : "Something went wrong. Please try again.";
        setError(message);
        return;
      }

      setResult(data as GenerateResult);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16 md:py-24">
      <header className="mb-14 space-y-4">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--muted)]">
          Frame & Words
        </p>
        <h1 className="max-w-xl font-[family-name:var(--font-display)] text-4xl leading-tight tracking-[-0.03em] text-[var(--ink)] md:text-5xl">
          Turn a photograph into a story.
        </h1>
        <p className="max-w-lg text-base leading-relaxed text-[var(--muted)]">
          Upload a photograph. Choose a style and direction. Get Instagram-ready
          captions grounded in what the image actually shows.
        </p>
      </header>

      <div className="space-y-10">
        <ImageUploader
          file={file}
          onFileChange={(next) => {
            setFile(next);
            setResult(null);
          }}
          onError={setError}
        />

        <div className="space-y-3">
          <label
            htmlFor="moment-context"
            className="text-sm font-medium tracking-wide text-[var(--ink)]"
          >
            Tell me anything about this moment (optional)
          </label>
          <textarea
            id="moment-context"
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="Taken during a rainy evening walk..."
            rows={3}
            maxLength={2000}
            className="w-full resize-y rounded-sm border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm leading-relaxed text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--ink-soft)]"
          />
        </div>

        <StyleSelector value={style} onChange={setStyle} disabled={loading} />

        <DirectionSelector
          value={direction}
          onChange={setDirection}
          disabled={loading}
        />

        {error ? (
          <div
            role="alert"
            className="border border-[var(--error-line)] bg-[var(--error-surface)] px-4 py-3 text-sm text-[var(--error-ink)]"
          >
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <GenerateButton
            loading={loading}
            disabled={!file}
            onClick={generate}
          />
          {!file ? (
            <p className="text-sm text-[var(--muted)]">
              Upload a photograph to generate captions.
            </p>
          ) : null}
        </div>
      </div>

      {result ? (
        <div className="mt-16">
          <CaptionResults
            result={result}
            loading={loading}
            onRegenerate={generate}
          />
        </div>
      ) : null}
    </main>
  );
}
