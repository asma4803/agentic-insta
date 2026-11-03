import { getImageFile } from "@/lib/library/content";
import {
  AgentError,
  type PostDraft,
  type PostEdits,
  type SlideDraft,
} from "@/types/agent";
import { isMood, isResolvedFormat } from "@/lib/validation";

const CAPTION_MAX = 2200;
const HASHTAG_MAX = 30;
const ALT_MAX = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeHashtags(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : null;
  if (!source) {
    throw new AgentError("Enter hashtags as a list of tags.", 400);
  }

  const tags: string[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().replace(/^#+/, "");
    if (!trimmed) continue;
    if (!/^[\p{L}\p{N}_]+$/u.test(trimmed)) {
      throw new AgentError(
        `The hashtag #${trimmed} can only use letters, numbers, and underscores.`,
        400,
      );
    }
    const tag = `#${trimmed}`;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  if (tags.length > HASHTAG_MAX) {
    throw new AgentError(`Use at most ${HASHTAG_MAX} hashtags.`, 400);
  }
  return tags;
}

export function instagramCaption(caption: string, hashtags: string[]): string {
  const body = caption.trim();
  const tags = hashtags.join(" ");
  return tags ? `${body}\n\n${tags}` : body;
}

export function assertPublishableCaption(caption: string, hashtags: string[]): string {
  const combined = instagramCaption(caption, hashtags);
  if (combined.length > CAPTION_MAX) {
    throw new AgentError(
      `The caption and hashtags are ${combined.length} characters. Instagram allows ${CAPTION_MAX}.`,
      400,
    );
  }
  if (hashtags.length > HASHTAG_MAX) {
    throw new AgentError(`Use at most ${HASHTAG_MAX} hashtags.`, 400);
  }
  return combined;
}

function parseSlides(value: unknown, current: PostDraft): SlideDraft[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AgentError("Keep at least one image on the post.", 400);
  }

  const allowed = new Set(current.slides.map((slide) => slide.imageId));
  const seen = new Set<string>();
  const slides: SlideDraft[] = [];

  for (const item of value) {
    if (!isRecord(item) || typeof item.imageId !== "string" || !item.imageId.trim()) {
      throw new AgentError("Each image needs an id from this draft.", 400);
    }
    const imageId = item.imageId.trim();
    if (!allowed.has(imageId) || seen.has(imageId)) {
      throw new AgentError("Reorder only the images already chosen for this draft.", 400);
    }
    if (!getImageFile(imageId)) {
      throw new AgentError(`The image ${imageId} is no longer in the library.`, 400);
    }
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (text.length > ALT_MAX) {
      throw new AgentError(`Alt text must be ${ALT_MAX} characters or fewer.`, 400);
    }
    seen.add(imageId);
    slides.push({ imageId, text });
  }

  if (current.format === "single" && slides.length !== 1) {
    throw new AgentError("A single-image post keeps its one image.", 400);
  }
  if (current.format === "carousel" && (slides.length < 2 || slides.length > 10)) {
    throw new AgentError("A carousel needs between 2 and 10 images.", 400);
  }

  return slides;
}

export function validatePostEdits(current: PostDraft, raw: unknown): PostEdits {
  if (!isRecord(raw)) {
    throw new AgentError("The edit was not a JSON object.", 400);
  }
  if (typeof raw.caption !== "string" || !raw.caption.trim()) {
    throw new AgentError("Write a caption before saving.", 400);
  }
  const caption = raw.caption.trim();
  if (caption.length > CAPTION_MAX) {
    throw new AgentError(`The caption must be ${CAPTION_MAX} characters or fewer.`, 400);
  }

  return {
    caption,
    hashtags: normalizeHashtags(raw.hashtags),
    slides: parseSlides(raw.slides, current),
  };
}

export function applyEdits(current: PostDraft, edits: PostEdits): PostDraft {
  return {
    ...current,
    caption: edits.caption,
    hashtags: edits.hashtags,
    slides: edits.slides,
  };
}

export function sameContent(left: PostDraft, right: PostDraft): boolean {
  return (
    left.caption === right.caption &&
    left.hashtags.join("\n") === right.hashtags.join("\n") &&
    left.slides.length === right.slides.length &&
    left.slides.every(
      (slide, index) =>
        slide.imageId === right.slides[index]?.imageId &&
        slide.text === right.slides[index]?.text,
    )
  );
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return [];
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

export function validateIncomingDraft(raw: unknown): PostDraft {
  if (!isRecord(raw)) {
    throw new AgentError("The draft was not a JSON object.", 400);
  }

  const mood = typeof raw.mood === "string" ? raw.mood : "";
  const format = typeof raw.format === "string" ? raw.format : "";
  if (!isMood(mood) || !isResolvedFormat(format)) {
    throw new AgentError("The draft is missing a mood or format.", 400);
  }

  const pageHandle = typeof raw.pageHandle === "string" ? raw.pageHandle.trim() : "";
  const displayName = typeof raw.displayName === "string" ? raw.displayName.trim() : "";
  const theme = typeof raw.theme === "string" ? raw.theme.trim() : "";
  const topicTitle = typeof raw.topicTitle === "string" ? raw.topicTitle.trim() : "";
  const formatReason = typeof raw.formatReason === "string" ? raw.formatReason.trim() : "";
  const caption = typeof raw.caption === "string" ? raw.caption.trim() : "";
  if (!pageHandle || !displayName || !theme || !topicTitle || !formatReason || !caption) {
    throw new AgentError("The draft is missing its page, topic, or caption.", 400);
  }

  const draft: PostDraft = {
    pageHandle,
    displayName,
    mood,
    format,
    theme,
    topicTitle,
    formatReason,
    caption,
    hashtags: [],
    slides: [],
    issues: asStringList(raw.issues),
    trace: [],
  };

  draft.hashtags = normalizeHashtags(raw.hashtags);
  draft.slides = parseSlides(raw.slides, {
    ...draft,
    slides: Array.isArray(raw.slides)
      ? raw.slides.flatMap((item) => {
          if (!isRecord(item) || typeof item.imageId !== "string") return [];
          return [{ imageId: item.imageId.trim(), text: "" }];
        })
      : [],
  });

  if (Array.isArray(raw.trace)) {
    draft.trace = raw.trace.flatMap((step) => {
      if (!isRecord(step) || typeof step.tool !== "string" || typeof step.summary !== "string") {
        return [];
      }
      return [{ tool: step.tool.trim(), summary: step.summary.trim() }];
    });
  }

  return draft;
}
