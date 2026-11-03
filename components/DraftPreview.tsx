"use client";

import { CopyButton } from "@/components/CopyButton";
import { GenerateButton } from "@/components/GenerateButton";
import type { PostDraft } from "@/types/agent";

interface DraftPreviewProps {
  draft: PostDraft;
  loading: boolean;
  onRegenerate: () => void;
}

export function DraftPreview({ draft, loading, onRegenerate }: DraftPreviewProps) {
  const captionWithTags = [draft.caption, draft.hashtags.join(" ")].join("\n\n");

  return (
    <section className="space-y-10 border-t border-[var(--line)] pt-12">
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          Draft for @{draft.pageHandle}
        </p>
        <p className="text-lg text-[var(--ink)] md:text-xl">
          {draft.topicTitle} · {draft.format === "single" ? "Single image" : "Carousel"}
        </p>
        <p className="max-w-2xl text-sm italic leading-relaxed text-[var(--ink-soft)]">
          {draft.formatReason}
        </p>
      </div>

      <div
        className={
          draft.slides.length > 1
            ? "grid gap-6 sm:grid-cols-3"
            : "max-w-md"
        }
      >
        {draft.slides.map((slide, index) => (
          <figure key={slide.imageId} className="space-y-3">
            <img
              src={`/api/library/images/${slide.imageId}`}
              alt={slide.text}
              className="aspect-square w-full rounded-sm object-cover"
            />
            <figcaption className="text-sm leading-relaxed text-[var(--ink-soft)]">
              {draft.slides.length > 1 ? (
                <span className="mr-2 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                  {index + 1}
                </span>
              ) : null}
              {slide.text}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Caption
          </h2>
          <CopyButton text={captionWithTags} label="Copy caption" />
        </div>
        <p className="max-w-2xl whitespace-pre-wrap text-2xl leading-snug tracking-[-0.01em] text-[var(--ink)] md:text-[1.75rem]">
          {draft.caption}
        </p>
        <p className="text-sm leading-relaxed tracking-wide text-[var(--ink-soft)]">
          {draft.hashtags.join("  ")}
        </p>
      </div>

      {draft.issues.length > 0 ? (
        <div
          role="status"
          className="border border-[var(--error-line)] bg-[var(--error-surface)] px-4 py-3 text-sm text-[var(--error-ink)]"
        >
          {draft.issues.join(" ")}
        </div>
      ) : null}

      <div className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          How the agent decided
        </h2>
        <ol className="space-y-3">
          {draft.trace.map((step, index) => (
            <li key={`${index}-${step.tool}`} className="text-sm leading-relaxed text-[var(--ink-soft)]">
              <span className="mr-2 text-[var(--muted)]">{index + 1}.</span>
              {step.summary}
            </li>
          ))}
        </ol>
      </div>

      <GenerateButton loading={loading} label="Draft again" onClick={onRegenerate} />
    </section>
  );
}
