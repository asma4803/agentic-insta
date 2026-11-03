"use client";

import type { CallEvent, TokenUsage } from "@/types/agent";

interface ActivityPanelProps {
  calls: CallEvent[];
}

function formatDuration(durationMs: number): string {
  if (durationMs >= 1000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${durationMs} ms`;
}

function formatUsage(usage: TokenUsage | null | undefined): string {
  if (!usage) return "Usage not reported";
  return `${usage.promptTokens} in / ${usage.completionTokens} out / ${usage.totalTokens} total`;
}

export function ActivityPanel({ calls }: ActivityPanelProps) {
  const finished = calls.filter((call) => call.status !== "in_progress");
  const modelCalls = finished.filter((call) => call.model !== "local");
  const counts = new Map<string, number>();
  for (const call of modelCalls) {
    counts.set(call.model, (counts.get(call.model) ?? 0) + 1);
  }
  const completed = finished.filter((call) => call.status === "completed").length;
  const failed = finished.filter((call) => call.status === "failed").length;
  const totalMs = finished.reduce((sum, call) => sum + (call.durationMs ?? 0), 0);
  const totalTokens = modelCalls.reduce(
    (sum, call) => sum + (call.usage?.totalTokens ?? 0),
    0,
  );
  const reportedUsage = modelCalls.some((call) => call.usage);

  return (
    <section className="space-y-5 border-t border-[var(--line)] pt-12">
      <div className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          Agent activity
        </h2>
        <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
          {counts.size === 0
            ? "No model calls yet."
            : [...counts.entries()]
                .map(([model, count]) => `${model}: ${count} call${count === 1 ? "" : "s"}`)
                .join(" · ")}
          {finished.length > 0
            ? ` · ${completed} completed · ${failed} failed · ${formatDuration(totalMs)}`
            : ""}
          {reportedUsage ? ` · ${totalTokens} tokens` : ""}
        </p>
      </div>

      <ol className="space-y-4">
        {calls.map((call, index) => (
          <li
            key={call.id}
            className="space-y-2 border-t border-[var(--line)] pt-4 text-sm leading-relaxed"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="font-medium text-[var(--ink)]">
                <span className="mr-2 text-[var(--muted)]">{index + 1}.</span>
                {call.purpose}
              </p>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                {call.status === "in_progress"
                  ? "In progress"
                  : call.status === "completed"
                    ? "Completed"
                    : "Failed"}
              </p>
            </div>
            <p className="text-[var(--ink-soft)]">
              {call.model === "local" ? "Local step" : call.model}
              {call.durationMs !== undefined ? ` · ${formatDuration(call.durationMs)}` : ""}
              {call.model !== "local" && call.status !== "in_progress"
                ? ` · ${formatUsage(call.usage)}`
                : ""}
            </p>
            <p className="text-[var(--muted)]">In: {call.inputSummary}</p>
            {call.outputSummary ? (
              <p className="text-[var(--ink-soft)]">Out: {call.outputSummary}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
