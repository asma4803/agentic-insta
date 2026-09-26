"use client";

import { CAPTION_DIRECTIONS, type CaptionDirection } from "@/types/agent";

interface DirectionSelectorProps {
  value: CaptionDirection;
  onChange: (value: CaptionDirection) => void;
  disabled?: boolean;
}

export function DirectionSelector({
  value,
  onChange,
  disabled,
}: DirectionSelectorProps) {
  return (
    <div className="space-y-3">
      <label
        htmlFor="caption-direction"
        className="text-sm font-medium tracking-wide text-[var(--ink)]"
      >
        Caption direction
      </label>
      <div className="flex flex-wrap gap-2">
        {CAPTION_DIRECTIONS.map((direction) => {
          const selected = direction === value;
          return (
            <button
              key={direction}
              id={direction === value ? "caption-direction" : undefined}
              type="button"
              disabled={disabled}
              onClick={() => onChange(direction)}
              className={`rounded-sm px-3.5 py-2 text-sm transition ${
                selected
                  ? "bg-[var(--ink)] text-[var(--paper)]"
                  : "bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {direction}
            </button>
          );
        })}
      </div>
    </div>
  );
}
