import { DraftStudio } from "@/components/DraftStudio";
import { loadPageSummary } from "@/lib/library/content";
import { AgentError } from "@/types/agent";

export default function HomePage() {
  try {
    const page = loadPageSummary();
    return <DraftStudio page={page} />;
  } catch (error) {
    const message =
      error instanceof AgentError
        ? error.message
        : "The Instagram page is not configured.";

    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-[var(--ink)]">
          Page not ready
        </h1>
        <p className="mt-4 max-w-lg text-base leading-relaxed text-[var(--muted)]">
          {message}
        </p>
      </main>
    );
  }
}
