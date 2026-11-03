"use client";

import { useState } from "react";

import { DraftPreview } from "@/components/DraftPreview";
import { FormatSelector } from "@/components/FormatSelector";
import { GenerateButton } from "@/components/GenerateButton";
import { MoodSelector } from "@/components/MoodSelector";
import type { Mood, PageSummary, PostDraft, PostFormatRequest } from "@/types/agent";

interface DraftStudioProps {
  page: PageSummary;
}

export function DraftStudio({ page }: DraftStudioProps) {
  const [mood, setMood] = useState<Mood>("reflective");
  const [format, setFormat] = useState<PostFormatRequest>("auto");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PostDraft | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood, format, note }),
      });

      const data = (await response.json()) as PostDraft | { error?: string };

      if (!response.ok) {
        const message =
          "error" in data && typeof data.error === "string"
            ? data.error
            : "Something went wrong. Please try again.";
        setError(message);
        return;
      }

      setDraft(data as PostDraft);
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
          @{page.handle}
        </p>
        <h1 className="max-w-xl font-[family-name:var(--font-display)] text-4xl leading-tight tracking-[-0.03em] text-[var(--ink)] md:text-5xl">
          {page.displayName}
        </h1>
        <p className="max-w-lg text-base leading-relaxed text-[var(--muted)]">
          {page.niche}
        </p>
      </header>

      <div className="space-y-10">
        <MoodSelector
          value={mood}
          onChange={(next) => {
            setMood(next);
            setDraft(null);
          }}
          disabled={loading}
        />

        <FormatSelector
          value={format}
          onChange={(next) => {
            setFormat(next);
            setDraft(null);
          }}
          disabled={loading}
        />

        <div className="space-y-3">
          <label
            htmlFor="draft-note"
            className="text-sm font-medium tracking-wide text-[var(--ink)]"
          >
            Note for this draft (optional)
          </label>
          <textarea
            id="draft-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Keep it about the rain, or the two cups."
            rows={3}
            maxLength={500}
            disabled={loading}
            className="w-full resize-y rounded-sm border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm leading-relaxed text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--ink-soft)] disabled:opacity-50"
          />
        </div>

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
            label="Draft post"
            onClick={generate}
          />
          {loading ? (
            <p className="text-sm text-[var(--muted)]">
              Choosing a topic and images for @{page.handle}.
            </p>
          ) : null}
        </div>
      </div>

      {draft ? (
        <div className="mt-16">
          <DraftPreview draft={draft} loading={loading} onRegenerate={generate} />
        </div>
      ) : null}
    </main>
  );
}
