"use client";

import { useEffect, useRef, useState } from "react";

import { CopyButton } from "@/components/CopyButton";
import { GenerateButton } from "@/components/GenerateButton";
import type {
  InstagramConnection,
  PostDraft,
  PostEdits,
  SlideDraft,
  StoredPost,
} from "@/types/agent";

interface DraftPreviewProps {
  post: StoredPost;
  loading: boolean;
  connection: InstagramConnection | null;
  onRegenerate: () => void;
  onPostChange: (post: StoredPost) => void;
}

function tagsFromInput(value: string): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const part of value.split(/[\s,]+/)) {
    const trimmed = part.replace(/^#+/, "").trim();
    if (!trimmed) continue;
    const tag = `#${trimmed}`;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

function editsFrom(caption: string, hashtagText: string, slides: SlideDraft[]): PostEdits {
  return {
    caption: caption.trim(),
    hashtags: tagsFromInput(hashtagText),
    slides,
  };
}

function contentChanged(draft: PostDraft, edits: PostEdits): boolean {
  if (draft.caption !== edits.caption) return true;
  if (draft.hashtags.join(" ") !== edits.hashtags.join(" ")) return true;
  if (draft.slides.length !== edits.slides.length) return true;
  return draft.slides.some(
    (slide, index) =>
      slide.imageId !== edits.slides[index]?.imageId ||
      slide.text !== edits.slides[index]?.text,
  );
}

async function readPostResponse(response: Response): Promise<StoredPost> {
  let data: { error?: string; post?: StoredPost };
  try {
    data = (await response.json()) as { error?: string; post?: StoredPost };
  } catch {
    throw new Error("The draft could not be saved.");
  }
  if (!response.ok || !data.post) {
    throw new Error(
      typeof data.error === "string" ? data.error : "The draft could not be saved.",
    );
  }
  return data.post;
}

export function DraftPreview({
  post,
  loading,
  connection,
  onRegenerate,
  onPostChange,
}: DraftPreviewProps) {
  const [caption, setCaption] = useState(post.draft.caption);
  const [hashtagText, setHashtagText] = useState(post.draft.hashtags.join(" "));
  const [slides, setSlides] = useState<SlideDraft[]>(post.draft.slides);
  const [actionError, setActionError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const writeChain = useRef<Promise<unknown>>(Promise.resolve());

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = writeChain.current.then(task, task);
    writeChain.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  useEffect(() => {
    setCaption(post.draft.caption);
    setHashtagText(post.draft.hashtags.join(" "));
    setSlides(post.draft.slides);
    setActionError(null);
  }, [post.id]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  const locked = post.status === "publishing" || post.status === "published" || loading;
  const edits = editsFrom(caption, hashtagText, slides);
  const dirty = contentChanged(post.draft, edits);
  const captionWithTags = [edits.caption, edits.hashtags.join(" ")].filter(Boolean).join("\n\n");

  async function persist(next: PostEdits): Promise<StoredPost> {
    const response = await fetch(`/api/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const saved = await readPostResponse(response);
    onPostChange(saved);
    return saved;
  }

  function scheduleSave(next: PostEdits) {
    if (locked) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void enqueue(() => persist(next)).catch((error: unknown) => {
        setActionError(error instanceof Error ? error.message : "The draft could not be saved.");
      });
    }, 500);
  }

  function updateCaption(value: string) {
    setCaption(value);
    scheduleSave(editsFrom(value, hashtagText, slides));
  }

  function updateHashtags(value: string) {
    setHashtagText(value);
    scheduleSave(editsFrom(caption, value, slides));
  }

  function updateSlides(next: SlideDraft[]) {
    setSlides(next);
    scheduleSave(editsFrom(caption, hashtagText, next));
  }

  function moveSlide(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= slides.length) return;
    const next = slides.slice();
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    updateSlides(next);
  }

  async function approve() {
    setApproving(true);
    setActionError(null);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const current = editsFrom(caption, hashtagText, slides);
    if (!current.caption) {
      setActionError("Write a caption before approving.");
      setApproving(false);
      return;
    }
    try {
      const saved = await enqueue(async () => {
        if (contentChanged(post.draft, current)) {
          await persist(current);
        }
        const response = await fetch(`/api/posts/${post.id}/approve`, { method: "POST" });
        return readPostResponse(response);
      });
      onPostChange(saved);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The draft could not be approved.");
    } finally {
      setApproving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/posts/${post.id}/publish`, { method: "POST" });
      const data = (await response.json()) as { error?: string; post?: StoredPost };
      if (data.post) onPostChange(data.post);
      if (!response.ok) {
        setActionError(
          typeof data.error === "string" ? data.error : "Instagram did not publish this post.",
        );
      }
    } catch {
      setActionError("Could not reach the server. Please try again.");
    } finally {
      setPublishing(false);
    }
  }

  const statusLabel =
    post.status === "approved"
      ? "Approved"
      : post.status === "publishing"
        ? "Publishing"
        : post.status === "published"
          ? "Published"
          : post.status === "failed"
            ? "Failed"
            : "Draft";

  const publishDisabled =
    post.status !== "approved" || dirty || approving || publishing || loading;
  const approveDisabled =
    locked || publishing || approving || (post.status === "approved" && !dirty);

  return (
    <section className="space-y-10 border-t border-[var(--line)] pt-12">
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          {statusLabel} for @{post.draft.pageHandle}
        </p>
        <p className="text-lg text-[var(--ink)] md:text-xl">
          {post.draft.topicTitle} · {post.draft.format === "single" ? "Single image" : "Carousel"}
        </p>
        <p className="max-w-2xl text-sm italic leading-relaxed text-[var(--ink-soft)]">
          {post.draft.formatReason}
        </p>
      </div>

      <StatusNote post={post} dirty={dirty} />

      <div
        className={
          slides.length > 1 ? "grid gap-6 sm:grid-cols-3" : "max-w-md"
        }
      >
        {slides.map((slide, index) => (
          <figure key={slide.imageId} className="space-y-3">
            <img
              src={`/api/library/images/${slide.imageId}`}
              alt={slide.text || `Image ${index + 1}`}
              className="aspect-square w-full rounded-sm object-cover"
            />
            {slides.length > 1 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                  {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => moveSlide(index, -1)}
                  disabled={locked || index === 0}
                  className="text-xs text-[var(--ink-soft)] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Move earlier
                </button>
                <button
                  type="button"
                  onClick={() => moveSlide(index, 1)}
                  disabled={locked || index === slides.length - 1}
                  className="text-xs text-[var(--ink-soft)] underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Move later
                </button>
              </div>
            ) : null}
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                Alt text
              </span>
              <textarea
                value={slide.text}
                onChange={(event) => {
                  const next = slides.slice();
                  next[index] = { ...slide, text: event.target.value };
                  updateSlides(next);
                }}
                rows={3}
                maxLength={1000}
                disabled={locked}
                className="w-full resize-y rounded-sm border border-[var(--line)] bg-[var(--paper)] px-3 py-2 text-sm leading-relaxed text-[var(--ink)] outline-none transition focus:border-[var(--ink-soft)] disabled:opacity-50"
              />
            </label>
          </figure>
        ))}
      </div>

      {post.draft.format === "carousel" ? (
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Instagram crops every carousel image to the first image. Alt text is sent with each
          image. The caption is on the post, not on the slides.
        </p>
      ) : (
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Alt text is sent with the image. It is not drawn on the photo.
        </p>
      )}

      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
            Caption
          </h2>
          <CopyButton text={captionWithTags} label="Copy caption" />
        </div>
        <textarea
          value={caption}
          onChange={(event) => updateCaption(event.target.value)}
          rows={5}
          maxLength={2200}
          disabled={locked}
          className="w-full resize-y rounded-sm border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-lg leading-snug tracking-[-0.01em] text-[var(--ink)] outline-none transition focus:border-[var(--ink-soft)] disabled:opacity-50 md:text-xl"
        />
        <label className="block space-y-2">
          <span className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            Hashtags
          </span>
          <input
            value={hashtagText}
            onChange={(event) => updateHashtags(event.target.value)}
            disabled={locked}
            className="w-full rounded-sm border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm leading-relaxed tracking-wide text-[var(--ink-soft)] outline-none transition focus:border-[var(--ink-soft)] disabled:opacity-50"
          />
        </label>
      </div>

      {post.draft.issues.length > 0 ? (
        <div
          role="status"
          className="border border-[var(--error-line)] bg-[var(--error-surface)] px-4 py-3 text-sm text-[var(--error-ink)]"
        >
          {post.draft.issues.join(" ")}
        </div>
      ) : null}

      {actionError || (post.status === "failed" && post.error) ? (
        <div
          role="alert"
          className="border border-[var(--error-line)] bg-[var(--error-surface)] px-4 py-3 text-sm text-[var(--error-ink)]"
        >
          {actionError || post.error}
        </div>
      ) : null}

      <div className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--muted)]">
          How the agent decided
        </h2>
        <ol className="space-y-3">
          {post.draft.trace.map((step, index) => (
            <li
              key={`${index}-${step.tool}`}
              className="text-sm leading-relaxed text-[var(--ink-soft)]"
            >
              <span className="mr-2 text-[var(--muted)]">{index + 1}.</span>
              {step.summary}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <GenerateButton
          loading={approving}
          disabled={approveDisabled}
          label={post.status === "approved" && !dirty ? "Approved" : "Approve"}
          onClick={() => void approve()}
        />
        <button
          type="button"
          onClick={() => void publish()}
          disabled={publishDisabled}
          className="inline-flex min-w-[180px] items-center justify-center rounded-sm border border-[var(--ink)] px-6 py-3 text-sm font-medium tracking-wide text-[var(--ink)] transition hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {publishing || post.status === "publishing"
            ? "Publishing…"
            : post.status === "published"
              ? "Published"
              : "Publish"}
        </button>
        <GenerateButton loading={loading} label="Draft again" onClick={onRegenerate} />
      </div>

      {connection && !connection.ready ? (
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          {connection.missing.join(" ")} Approval still works. Publishing waits until the account
          is connected.
        </p>
      ) : null}

      {connection?.quota ? (
        <p className="text-sm text-[var(--muted)]">
          API publishes used in the current window: {connection.quota.usage} of{" "}
          {connection.quota.total}. A carousel counts as one post.
        </p>
      ) : null}

      {connection?.quotaError ? (
        <p className="text-sm text-[var(--muted)]">{connection.quotaError}</p>
      ) : null}
    </section>
  );
}

function StatusNote({ post, dirty }: { post: StoredPost; dirty: boolean }) {
  if (post.status === "publishing") {
    return (
      <p className="text-sm leading-relaxed text-[var(--ink-soft)]">Publishing is in progress.</p>
    );
  }
  if (post.status === "published") {
    return (
      <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
        Published
        {post.permalink ? (
          <>
            {" "}
            <a
              href={post.permalink}
              className="underline decoration-[var(--line)] underline-offset-4"
            >
              View on Instagram
            </a>
          </>
        ) : null}
        .
      </p>
    );
  }
  if (dirty && (post.status === "approved" || post.status === "failed")) {
    return (
      <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
        You changed this draft. Approve it again before publishing.
      </p>
    );
  }
  if (post.status === "approved") {
    return (
      <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
        Approved. Publishing sends this version only.
      </p>
    );
  }
  if (post.status === "failed") {
    return (
      <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
        Publishing failed. Edit the draft if you need to, then approve it again.
      </p>
    );
  }
  return (
    <p className="text-sm leading-relaxed text-[var(--ink-soft)]">
      Review the images, caption, and hashtags. Nothing is published until you approve it and
      choose Publish.
    </p>
  );
}
