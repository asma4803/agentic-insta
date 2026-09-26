"use client";

import { CAPTION_STYLES, type CaptionStyle } from "@/types/agent";

interface StyleSelectorProps {
  value: CaptionStyle;
  onChange: (value: CaptionStyle) => void;
  disabled?: boolean;
}

export function StyleSelector({ value, onChange, disabled }: StyleSelectorProps) {
  return (
    <div className="space-y-3">
      <label
        htmlFor="caption-style"
        className="text-sm font-medium tracking-wide text-[var(--ink)]"
      >
        Caption style
      </label>
      <div className="flex flex-wrap gap-2">
        {CAPTION_STYLES.map((style) => {
          const selected = style === value;
          return (
            <button
              key={style}
              id={style === value ? "caption-style" : undefined}
              type="button"
              disabled={disabled}
              onClick={() => onChange(style)}
              className={`rounded-sm px-3.5 py-2 text-sm transition ${
                selected
                  ? "bg-[var(--ink)] text-[var(--paper)]"
                  : "bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {style}
            </button>
          );
        })}
      </div>
    </div>
  );
}
