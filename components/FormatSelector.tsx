"use client";

import { POST_FORMATS, type PostFormatRequest } from "@/types/agent";

const LABELS: Record<PostFormatRequest, string> = {
  auto: "Auto",
  single: "Single",
  carousel: "Carousel",
};

interface FormatSelectorProps {
  value: PostFormatRequest;
  onChange: (value: PostFormatRequest) => void;
  disabled?: boolean;
}

export function FormatSelector({ value, onChange, disabled }: FormatSelectorProps) {
  return (
    <div className="space-y-3">
      <p id="post-format" className="text-sm font-medium tracking-wide text-[var(--ink)]">
        Post format
      </p>
      <div className="flex flex-wrap gap-2">
        {POST_FORMATS.map((format) => {
          const selected = format === value;
          return (
            <button
              key={format}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(format)}
              className={`rounded-sm px-3.5 py-2 text-sm transition ${
                selected
                  ? "bg-[var(--ink)] text-[var(--paper)]"
                  : "bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {LABELS[format]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
