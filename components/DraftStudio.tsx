"use client";

import { useEffect, useState } from "react";

import { ActivityPanel } from "@/components/ActivityPanel";
import { DraftPreview } from "@/components/DraftPreview";
import { FormatSelector } from "@/components/FormatSelector";
import { GenerateButton } from "@/components/GenerateButton";
import { MoodSelector } from "@/components/MoodSelector";
import type {
  CallEvent,
  DraftStreamEvent,
  InstagramConnection,
  Mood,
  PageSummary,
  PostDraft,
  PostFormatRequest,
  StoredPost,
} from "@/types/agent";

const POST_STORAGE_KEY = "frameandwords:postId";

interface DraftStudioProps {
  page: PageSummary;
}

export function DraftStudio({ page }: DraftStudioProps) {
  const [mood, setMood] = useState<Mood>("reflective");
  const [format, setFormat] = useState<PostFormatRequest>("auto");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [post, setPost] = useState<StoredPost | null>(null);
  const [calls, setCalls] = useState<CallEvent[]>([]);
  const [connection, setConnection] = useState<InstagramConnection | null>(null);

  useEffect(() => {
    const savedId = window.sessionStorage.getItem(POST_STORAGE_KEY);
    if (!savedId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/posts/${savedId}`);
        if (!response.ok) return;
        const data = (await response.json()) as { post?: StoredPost };
        if (!cancelled && data.post && window.sessionStorage.getItem(POST_STORAGE_KEY) === savedId) {
          setPost(data.post);
        }
      } catch {
        // A refresh without a saved draft just starts from the mood form.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!post) return;
    if (post.status !== "publishing") return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/posts/${post.id}`);
          if (!response.ok) return;
          const data = (await response.json()) as { post?: StoredPost };
          if (!data.post || data.post.status === "publishing") return;
          setPost(data.post);
        } catch {
          // The in-progress request still updates the post when it finishes.
        }
      })();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [post]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/instagram/status");
        if (!response.ok) return;
        const data = (await response.json()) as InstagramConnection;
        if (!cancelled) setConnection(data);
      } catch {
        if (!cancelled) {
          setConnection({
            ready: false,
            missing: ["The Instagram connection could not be checked."],
            quota: null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [post?.id, post?.status]);

  function clearPost() {
    setPost(null);
    window.sessionStorage.removeItem(POST_STORAGE_KEY);
  }

  function rememberPost(next: StoredPost) {
    setPost(next);
    window.sessionStorage.setItem(POST_STORAGE_KEY, next.id);
  }

  function applyCall(event: CallEvent) {
    setCalls((current) => {
      const index = current.findIndex((call) => call.id === event.id);
      if (index === -1) return [...current, event];
      const next = current.slice();
      next[index] = event;
      return next;
    });
  }

  async function saveDraft(draft: PostDraft): Promise<StoredPost> {
    const response = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft }),
    });
    const data = (await response.json()) as { error?: string; post?: StoredPost };
    if (!response.ok || !data.post) {
      throw new Error(
        typeof data.error === "string" ? data.error : "The draft could not be saved.",
      );
    }
    return data.post;
  }

  async function generate() {
    setLoading(true);
    setError(null);
    clearPost();
    setCalls([]);

    let finished = false;

    try {
      const response = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood, format, note }),
      });

      if (!response.ok || !response.body) {
        let message = "Something went wrong. Please try again.";
        try {
          const data = (await response.json()) as { error?: string };
          if (typeof data.error === "string") message = data.error;
        } catch {
          message = "Could not reach the server. Please try again.";
        }
        setError(message);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.split("\n").find((item) => item.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as DraftStreamEvent;
          if (event.type === "call") {
            applyCall(event);
          } else if (event.type === "draft") {
            finished = true;
            rememberPost(await saveDraft(event.draft));
          } else if (event.type === "error") {
            finished = true;
            setError(event.message);
          }
        }
      }

      if (!finished) {
        setError("Could not reach the server. Please try again.");
      }
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
            clearPost();
            setCalls([]);
          }}
          disabled={loading}
        />

        <FormatSelector
          value={format}
          onChange={(next) => {
            setFormat(next);
            clearPost();
            setCalls([]);
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

      {calls.length > 0 ? (
        <div className="mt-16">
          <ActivityPanel calls={calls} />
        </div>
      ) : null}

      {post ? (
        <div className="mt-16">
          <DraftPreview
            post={post}
            loading={loading}
            connection={connection}
            onRegenerate={generate}
            onPostChange={rememberPost}
          />
        </div>
      ) : null}
    </main>
  );
}
