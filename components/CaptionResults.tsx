"use client";

import { CopyButton } from "@/components/CopyButton";
import { GenerateButton } from "@/components/GenerateButton";
import type { GenerateResult } from "@/types/agent";

interface CaptionResultsProps {
  result: GenerateResult;
  loading: boolean;
  onRegenerate: () => void;
}

export function CaptionResults({
  result,
  loading,
  onRegenerate,
}: CaptionResultsProps) {
  return (
    <section className="space-y-10 border-t border-[var(--line)] pt-12">
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          Visual mood
        </p>
        <p className="text-lg text-[var(--ink)] md:text-xl">
          {result.mood.join(" · ")}
        </p>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          {result.visual_summary}
        </p>
        {result.strategy_note ? (
          <p className="max-w-2xl text-sm italic leading-relaxed text-[var(--ink-soft)]">
            {result.strategy_note}
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Primary caption
          </h2>
          <CopyButton text={result.primary_caption} />
        </div>
        <p className="max-w-2xl whitespace-pre-wrap text-2xl leading-snug tracking-[-0.01em] text-[var(--ink)] md:text-[1.75rem]">
          {result.primary_caption}
        </p>
      </div>

      <div className="space-y-5">
        <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          Alternatives
        </h2>
        <ul className="space-y-5">
          {result.alternatives.map((caption, index) => (
            <li
              key={`${index}-${caption.slice(0, 24)}`}
              className="flex items-start justify-between gap-6 border-t border-[var(--line)] pt-5"
            >
              <p className="max-w-2xl whitespace-pre-wrap text-base leading-relaxed text-[var(--ink-soft)]">
                {caption}
              </p>
              <CopyButton text={caption} />
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Hashtags
          </h2>
          <CopyButton text={result.hashtags.join(" ")} label="Copy all" />
        </div>
        <p className="text-sm leading-relaxed tracking-wide text-[var(--ink-soft)]">
          {result.hashtags.join("  ")}
        </p>
      </div>

      <GenerateButton
        loading={loading}
        label="Regenerate"
        onClick={onRegenerate}
      />
    </section>
  );
}
