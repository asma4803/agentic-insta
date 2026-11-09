import {
  CAPTION_DIRECTIONS,
  CAPTION_STYLES,
  type CaptionDirection,
  type CaptionDraft,
  type CaptionStyle,
  type ContentStrategy,
  type GenerateResult,
  type Mood,
  type PostFormatRequest,
  type ResolvedFormat,
  type SlideDraft,
  type VisualAnalysis,
} from "@/types/agent";

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  return trimmed;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapJsonRecord(value: unknown): Record<string, unknown> | null {
  if (isJsonRecord(value)) return value;
  if (Array.isArray(value) && value.length === 1 && isJsonRecord(value[0])) {
    return value[0];
  }
  return null;
}

function scanJsonObject(source: string): string | null {
  let searchFrom = 0;

  while (searchFrom < source.length) {
    const start = source.indexOf("{", searchFrom);
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escape = false;
    let found = false;

    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (inString) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const slice = source.slice(start, i + 1);
          try {
            const parsed = unwrapJsonRecord(JSON.parse(slice) as unknown);
            if (parsed) return JSON.stringify(parsed);
          } catch {
            // Try the next opening brace.
          }
          found = true;
          break;
        }
      }
    }

    searchFrom = found ? start + 1 : source.length;
  }

  return null;
}

/** Pull a JSON object out of prose, markdown fences, or a one-element array. */
export function extractJsonObjectText(raw: string): string | null {
  const source = stripMarkdownFences(raw);
  try {
    const parsed = unwrapJsonRecord(JSON.parse(source) as unknown);
    if (parsed) return JSON.stringify(parsed);
  } catch {
    // Fall through to a brace scan when the model adds a preface.
  }
  return scanJsonObject(source);
}

export function parseJsonObject(raw: string): unknown {
  const extracted = extractJsonObjectText(raw);
  if (!extracted) {
    throw new Error("malformed_json");
  }
  return JSON.parse(extracted) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`invalid_field:${field}`);
  }
  return value.trim();
}

function asStringArray(value: unknown, field: string, min = 1): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : null;
  if (!source) {
    throw new Error(`invalid_field:${field}`);
  }
  const items = source
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length < min) {
    throw new Error(`invalid_field:${field}`);
  }
  return items;
}

export function isCaptionStyle(value: string): value is CaptionStyle {
  return (CAPTION_STYLES as readonly string[]).includes(value);
}

export function isCaptionDirection(value: string): value is CaptionDirection {
  return (CAPTION_DIRECTIONS as readonly string[]).includes(value);
}

export function isMood(value: string): value is Mood {
  return (
    value === "inspirational" ||
    value === "funny" ||
    value === "reflective" ||
    value === "motivational" ||
    value === "casual"
  );
}

export function isPostFormat(value: string): value is PostFormatRequest {
  return value === "single" || value === "carousel" || value === "auto";
}

export function validateDraftRequest(raw: unknown): {
  mood: Mood;
  format: PostFormatRequest;
  note: string;
} {
  if (!isRecord(raw)) {
    throw new Error("invalid_request");
  }

  const mood = asString(raw.mood, "mood");
  if (!isMood(mood)) {
    throw new Error("invalid_field:mood");
  }

  const format = asString(raw.format, "format");
  if (!isPostFormat(format)) {
    throw new Error("invalid_field:format");
  }

  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 500) : "";
  return { mood, format, note };
}

const TOOL_NAMES = [
  "search_topics",
  "search_images",
  "inspect_image",
  "draft_post",
  "critique_post",
  "finish",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolCall {
  tool: ToolName;
  arguments: Record<string, unknown>;
}

export function validateToolCall(raw: unknown): ToolCall {
  if (!isRecord(raw)) {
    throw new Error("invalid_tool_call");
  }
  const tool = asString(raw.tool, "tool");
  if (!(TOOL_NAMES as readonly string[]).includes(tool)) {
    throw new Error("invalid_field:tool");
  }
  const args = raw.arguments ?? raw.args ?? {};
  if (!isRecord(args)) {
    throw new Error("invalid_field:arguments");
  }
  return { tool: tool as ToolName, arguments: args };
}

export function validateImageInspection(raw: unknown): {
  matchesDescription: boolean;
  visibleDetails: string[];
  notes: string;
} {
  if (!isRecord(raw)) {
    throw new Error("invalid_inspection");
  }
  if (typeof raw.matches_description !== "boolean") {
    throw new Error("invalid_field:matches_description");
  }
  const notes = typeof raw.notes === "string" ? raw.notes.trim() : "";
  return {
    matchesDescription: raw.matches_description,
    visibleDetails: asStringArray(raw.visible_details, "visible_details"),
    notes: notes || "No extra notes.",
  };
}

export function validateWrittenPost(
  raw: unknown,
  imageIds: string[],
): { caption: string; hashtags: string[]; slides: SlideDraft[] } {
  if (!isRecord(raw)) {
    throw new Error("invalid_written_post");
  }

  const caption = asString(raw.caption, "caption");
  const hashtags = asStringArray(raw.hashtags, "hashtags", 1).map((tag) =>
    tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`,
  );

  if (!Array.isArray(raw.slides) || raw.slides.length !== imageIds.length) {
    throw new Error("invalid_field:slides");
  }

  const slides = raw.slides.map((slide, index) => {
    if (!isRecord(slide)) {
      throw new Error(`invalid_field:slides[${index}]`);
    }
    const imageId = asString(slide.imageId, `slides[${index}].imageId`);
    if (imageId !== imageIds[index]) {
      throw new Error(`invalid_field:slides[${index}].imageId`);
    }
    return {
      imageId,
      text: asString(slide.text, `slides[${index}].text`),
    };
  });

  return { caption, hashtags, slides };
}

export function isResolvedFormat(value: string): value is ResolvedFormat {
  return value === "single" || value === "carousel";
}

export function validateVisualAnalysis(raw: unknown): VisualAnalysis {
  if (!isRecord(raw)) {
    throw new Error("invalid_visual_analysis");
  }

  const analysis: VisualAnalysis = {
    subject: asString(raw.subject, "subject"),
    environment: asString(raw.environment, "environment"),
    lighting: asString(raw.lighting, "lighting"),
    colors: asStringArray(raw.colors, "colors"),
    composition: asString(raw.composition, "composition"),
    visual_mood: asStringArray(raw.visual_mood, "visual_mood"),
    visible_details: asStringArray(raw.visible_details, "visible_details"),
    possible_emotional_directions: asStringArray(
      raw.possible_emotional_directions,
      "possible_emotional_directions",
    ),
  };

  if (raw.secondary_subjects !== undefined) {
    analysis.secondary_subjects = asStringArray(
      raw.secondary_subjects,
      "secondary_subjects",
      0,
    );
  }

  return analysis;
}

export function validateContentStrategy(raw: unknown): ContentStrategy {
  if (!isRecord(raw)) {
    throw new Error("invalid_content_strategy");
  }

  return {
    chosen_direction: asString(raw.chosen_direction, "chosen_direction"),
    reason: asString(raw.reason, "reason"),
    tone: asStringArray(raw.tone, "tone"),
    caption_strategy: asString(raw.caption_strategy, "caption_strategy"),
    things_to_avoid: asStringArray(raw.things_to_avoid, "things_to_avoid", 0),
  };
}

export function validateCaptionDraft(raw: unknown): CaptionDraft {
  if (!isRecord(raw)) {
    throw new Error("invalid_caption_draft");
  }

  const alternativesRaw = raw.alternatives;
  if (!Array.isArray(alternativesRaw) || alternativesRaw.length < 3) {
    throw new Error("invalid_field:alternatives");
  }

  const alternatives = alternativesRaw
    .slice(0, 3)
    .map((item, index) => asString(item, `alternatives[${index}]`)) as [
    string,
    string,
    string,
  ];

  const hashtags = asStringArray(raw.hashtags, "hashtags")
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`))
    .filter((tag) => tag.length > 1)
    .slice(0, 8);

  if (hashtags.length < 3) {
    throw new Error("invalid_field:hashtags");
  }

  return {
    primary_caption: asString(raw.primary_caption, "primary_caption"),
    alternatives,
    hashtags,
  };
}

export function validateStrategyAndCaptions(raw: unknown): {
  strategy: ContentStrategy;
  captions: CaptionDraft;
} {
  if (!isRecord(raw)) {
    throw new Error("invalid_strategy_and_captions");
  }

  const strategySource = isRecord(raw.strategy) ? raw.strategy : raw;
  const captionsSource = isRecord(raw.captions)
    ? raw.captions
    : {
        primary_caption: raw.primary_caption,
        alternatives: raw.alternatives,
        hashtags: raw.hashtags,
      };

  return {
    strategy: validateContentStrategy(strategySource),
    captions: validateCaptionDraft(captionsSource),
  };
}

export function validateGenerateResult(raw: unknown): GenerateResult {
  if (!isRecord(raw)) {
    throw new Error("invalid_generate_result");
  }

  const mood = asStringArray(raw.mood, "mood").slice(0, 4);
  if (mood.length < 2) {
    throw new Error("invalid_field:mood");
  }

  const alternativesRaw = raw.alternatives;
  if (!Array.isArray(alternativesRaw) || alternativesRaw.length < 3) {
    throw new Error("invalid_field:alternatives");
  }

  const alternatives = alternativesRaw
    .slice(0, 3)
    .map((item, index) => asString(item, `alternatives[${index}]`)) as [
    string,
    string,
    string,
  ];

  const hashtags = asStringArray(raw.hashtags, "hashtags")
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`))
    .slice(0, 8);

  if (hashtags.length < 3) {
    throw new Error("invalid_field:hashtags");
  }

  const result: GenerateResult = {
    visual_summary: asString(raw.visual_summary, "visual_summary"),
    mood,
    primary_caption: asString(raw.primary_caption, "primary_caption"),
    alternatives,
    hashtags,
  };

  if (typeof raw.strategy_note === "string" && raw.strategy_note.trim()) {
    result.strategy_note = raw.strategy_note.trim();
  }

  return result;
}

export function normalizeMimeType(mime: string): string {
  const lower = mime.toLowerCase().trim();
  if (lower === "image/jpg") {
    return "image/jpeg";
  }
  return lower;
}

export function isAllowedImageType(mime: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(normalizeMimeType(mime));
}
