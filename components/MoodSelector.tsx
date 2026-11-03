"use client";

import { MOODS, type Mood } from "@/types/agent";

interface MoodSelectorProps {
  value: Mood;
  onChange: (value: Mood) => void;
  disabled?: boolean;
}

export function MoodSelector({ value, onChange, disabled }: MoodSelectorProps) {
  return (
    <div className="space-y-3">
      <p id="post-mood" className="text-sm font-medium tracking-wide text-[var(--ink)]">
        Mood
      </p>
      <div className="flex flex-wrap gap-2">
        {MOODS.map((mood) => {
          const selected = mood === value;
          return (
            <button
              key={mood}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(mood)}
              className={`rounded-sm px-3.5 py-2 text-sm capitalize transition ${
                selected
                  ? "bg-[var(--ink)] text-[var(--paper)]"
                  : "bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {mood}
            </button>
          );
        })}
      </div>
    </div>
  );
}
