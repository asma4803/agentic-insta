"use client";

interface GenerateButtonProps {
  loading: boolean;
  disabled?: boolean;
  label?: string;
  onClick: () => void;
}

export function GenerateButton({
  loading,
  disabled,
  label = "Generate captions",
  onClick,
}: GenerateButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex min-w-[180px] items-center justify-center rounded-sm bg-[var(--ink)] px-6 py-3 text-sm font-medium tracking-wide text-[var(--paper)] transition hover:bg-[var(--ink-soft)] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {loading ? "Working…" : label}
    </button>
  );
}
