import type { AIProvider } from "@/lib/ai/provider";
import { BANNED_PHRASES } from "@/lib/agent/captionWriter";
import {
  parseJsonObject,
  validateCaptionDraft,
} from "@/lib/validation";
import type {
  CaptionDraft,
  CaptionStyle,
  ContentStrategy,
  VisualAnalysis,
} from "@/types/agent";

export interface QualityIssue {
  code: string;
  message: string;
}

function countEmojis(text: string): number {
  const matches = text.match(/\p{Extended_Pictographic}/gu);
  return matches?.length ?? 0;
}

function hashtagInCaptionBody(caption: string): boolean {
  // Hashtags as words in the caption body (not just a lone # mention).
  return /(?:^|\s)#[\p{L}\p{N}_]+/u.test(caption);
}

function containsBannedPhrase(caption: string): boolean {
  const lower = caption.toLowerCase();
  return BANNED_PHRASES.some((phrase) => lower.includes(phrase.toLowerCase()));
}

export function runQualityHeuristics(
  draft: CaptionDraft,
  style: CaptionStyle,
): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const allCaptions = [draft.primary_caption, ...draft.alternatives];

  for (const [index, caption] of allCaptions.entries()) {
    const label = index === 0 ? "primary" : `alternative ${index}`;

    if (!caption.trim()) {
      issues.push({ code: "empty", message: `${label} caption is empty` });
      continue;
    }

    if (caption.length > 320) {
      issues.push({
        code: "too_long",
        message: `${label} caption is too long`,
      });
    }

    if (countEmojis(caption) > 3) {
      issues.push({
        code: "emoji",
        message: `${label} caption has too many emojis`,
      });
    }

    if (hashtagInCaptionBody(caption)) {
      issues.push({
        code: "hashtag_in_caption",
        message: `${label} caption contains hashtags in the body`,
      });
    }

    if (containsBannedPhrase(caption)) {
      issues.push({
        code: "cliche",
        message: `${label} caption uses a banned cliché phrase`,
      });
    }
  }

  if (draft.hashtags.length < 3 || draft.hashtags.length > 8) {
    issues.push({
      code: "hashtag_count",
      message: "Hashtag count should be between 3 and 6 (up to 8 accepted)",
    });
  }

  for (const tag of draft.hashtags) {
    if (!tag.startsWith("#") || tag.length < 2) {
      issues.push({
        code: "hashtag_format",
        message: "Hashtags must start with #",
      });
      break;
    }
  }

  if (style === "Minimal") {
    const tooWordy = allCaptions.some((c) => c.split(/\s+/).length > 40);
    if (tooWordy) {
      issues.push({
        code: "style_mismatch",
        message: "Minimal style captions should stay concise",
      });
    }
  }

  return issues;
}

export function buildRevisionPrompt(input: {
  analysis: VisualAnalysis;
  strategy: ContentStrategy;
  draft: CaptionDraft;
  issues: QualityIssue[];
  style: CaptionStyle;
  context: string;
}): string {
  return [
    "Revise these Instagram captions to fix quality issues.",
    "Keep them grounded in the photograph. Never invent unseen facts.",
    "User context is supplementary only.",
    "Do not put hashtags in caption bodies. Keep emojis sparse. Avoid clichés.",
    "Return JSON with primary_caption, alternatives (exactly 3), and hashtags (3–6, each starting with #).",
    "",
    `Style: ${input.style}`,
    `Issues to fix: ${input.issues.map((i) => i.message).join("; ")}`,
    "",
    "Visual analysis:",
    JSON.stringify(input.analysis, null, 2),
    "",
    "Strategy:",
    JSON.stringify(input.strategy, null, 2),
    "",
    input.context.trim()
      ? `User context: ${input.context.trim()}`
      : "User context: none.",
    "",
    "Current draft:",
    JSON.stringify(input.draft, null, 2),
  ].join("\n");
}

export async function runQualityChecker(
  provider: AIProvider,
  input: {
    analysis: VisualAnalysis;
    strategy: ContentStrategy;
    draft: CaptionDraft;
    style: CaptionStyle;
    context: string;
  },
): Promise<CaptionDraft> {
  const issues = runQualityHeuristics(input.draft, input.style);
  if (issues.length === 0) {
    return input.draft;
  }

  const revisedRaw = await provider.generateText({
    prompt: buildRevisionPrompt({ ...input, issues }),
    json: true,
  });

  const revised = validateCaptionDraft(parseJsonObject(revisedRaw.content));
  const remaining = runQualityHeuristics(revised, input.style);

  // Prefer the revised draft if it improves or matches; otherwise keep best validated.
  if (remaining.length <= issues.length) {
    return revised;
  }

  return input.draft;
}
