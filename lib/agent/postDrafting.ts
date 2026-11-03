import type {
  ImageInspection,
  InstagramPage,
  Mood,
  PostFormatRequest,
  ResolvedFormat,
  SlideDraft,
  Topic,
} from "@/types/agent";

const BANNED_PHRASES = [
  "capture the essence",
  "embrace the beauty",
  "where dreams meet",
  "nature's masterpiece",
  "lost in the moment",
  "link in bio",
  "shop now",
  "buy now",
];

export interface WrittenDraft {
  topic: Topic;
  format: ResolvedFormat;
  formatReason: string;
  caption: string;
  hashtags: string[];
  slides: SlideDraft[];
  inspections: ImageInspection[];
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function hashtagInBody(text: string): boolean {
  return /(?:^|\s)#[\p{L}\p{N}_]+/u.test(text);
}

export function applyHashtagPolicy(tags: string[], page: InstagramPage): string[] {
  const banned = new Set(page.neverHashtags.map((tag) => tag.toLowerCase()));
  const kept: string[] = [];

  for (const tag of tags) {
    const normalized = tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`;
    if (normalized.length < 2 || banned.has(normalized.toLowerCase())) continue;
    if (kept.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
      continue;
    }
    kept.push(normalized);
  }

  for (const tag of page.alwaysHashtags) {
    const normalized = tag.startsWith("#") ? tag : `#${tag}`;
    if (kept.some((existing) => existing.toLowerCase() === normalized.toLowerCase())) {
      continue;
    }
    kept.push(normalized);
  }

  const required = page.alwaysHashtags.map((tag) => tag.toLowerCase());
  const pinned = kept.filter((tag) => required.includes(tag.toLowerCase()));
  const optional = kept.filter((tag) => !required.includes(tag.toLowerCase()));
  return [...optional.slice(0, Math.max(0, 6 - pinned.length)), ...pinned];
}

export function collectCodeIssues(draft: WrittenDraft, page: InstagramPage): string[] {
  const issues: string[] = [];
  const captionLimit = page.captionLength === "short" ? 70 : 120;

  if (wordCount(draft.caption) > captionLimit) {
    issues.push(`Caption is longer than a ${page.captionLength} caption for this page.`);
  }

  const texts = [draft.caption, ...draft.slides.map((slide) => slide.text)];
  for (const text of texts) {
    if (hashtagInBody(text)) {
      issues.push("Hashtags belong in the hashtag list, not in the caption or slide text.");
      break;
    }
    const lower = text.toLowerCase();
    if (BANNED_PHRASES.some((phrase) => lower.includes(phrase))) {
      issues.push("The copy uses a banned cliché or a hard sell.");
      break;
    }
  }

  if (draft.slides.some((slide) => wordCount(slide.text) > 22)) {
    issues.push("A slide line is too long.");
  }

  if (draft.hashtags.length < 3 || draft.hashtags.length > 6) {
    issues.push("Use 3 to 6 hashtags.");
  }

  const expected = draft.format === "single" ? 1 : 3;
  if (draft.slides.length !== expected) {
    issues.push(
      draft.format === "single"
        ? "A single post needs exactly one image."
        : "A carousel needs exactly three slides.",
    );
  }

  return issues;
}

export function buildWriterPrompt(input: {
  page: InstagramPage;
  mood: Mood;
  topic: Topic;
  draft: Pick<WrittenDraft, "format" | "formatReason" | "inspections">;
  previousIssues?: string[];
}): string {
  const slidePlan =
    input.draft.format === "carousel"
      ? "Write three slide lines in this order: setup, turn, landing. One short line each."
      : "Write one slide line for the single image.";

  return [
    `Write an Instagram draft for @${input.page.handle}.`,
    `Page: ${input.page.displayName}. Niche: ${input.page.niche}.`,
    `Audience: ${input.page.audience}.`,
    `Voice: ${input.page.voice}.`,
    `Language: ${input.page.language}. Caption length: ${input.page.captionLength}.`,
    `Never do this: ${input.page.avoid.join("; ")}.`,
    `Mood: ${input.mood}.`,
    `Topic: ${input.topic.title}. ${input.topic.idea}`,
    `Topic must avoid: ${input.topic.avoid.join("; ")}.`,
    `Format: ${input.draft.format}. Reason: ${input.draft.formatReason}`,
    slidePlan,
    "Use only details from the inspections below and the topic idea.",
    "Do not invent a city, brand, person, or event.",
    "Do not put hashtags in the caption or slide lines.",
    "Return 3 to 6 hashtags, each starting with #.",
    input.previousIssues?.length
      ? `Fix these issues: ${input.previousIssues.join(" ")}`
      : "",
    "",
    "Inspections:",
    JSON.stringify(input.draft.inspections, null, 2),
    "",
    "Return JSON:",
    JSON.stringify(
      {
        caption: "string",
        hashtags: ["#tag"],
        slides: input.draft.inspections.map((inspection) => ({
          imageId: inspection.imageId,
          text: "string",
        })),
      },
      null,
      2,
    ),
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCritiquePrompt(input: {
  page: InstagramPage;
  mood: Mood;
  draft: WrittenDraft;
}): string {
  return [
    `You are checking an Instagram draft for @${input.page.handle}.`,
    `Niche: ${input.page.niche}. Voice: ${input.page.voice}. Mood: ${input.mood}.`,
    "Fail the draft if it could belong to any account, invents facts, leaves the niche, or if carousel slides are unrelated.",
    "Only a carousel must read as setup, then a turn, then a landing. A single image needs one line, not three parts.",
    "Return JSON: {\"pass\": true, \"issues\": [] }. issues is an array of short strings.",
    "",
    "Topic:",
    `${input.draft.topic.title}. ${input.draft.topic.idea}`,
    "",
    "Inspections:",
    JSON.stringify(input.draft.inspections, null, 2),
    "",
    "Draft:",
    JSON.stringify(
      {
        format: input.draft.format,
        caption: input.draft.caption,
        slides: input.draft.slides,
        hashtags: input.draft.hashtags,
      },
      null,
      2,
    ),
  ].join("\n");
}

export function formatConstraint(request: PostFormatRequest): string {
  if (request === "single") return "The user required a single-image post.";
  if (request === "carousel") return "The user required a three-slide carousel.";
  return "The user left format on auto. Choose a single image, or a three-slide carousel when at least three images share the topic. Say why.";
}
