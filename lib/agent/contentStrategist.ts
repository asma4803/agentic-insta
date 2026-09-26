import type { CaptionDirection, CaptionStyle, VisualAnalysis } from "@/types/agent";

export function buildStrategistGuidance(input: {
  analysis: VisualAnalysis;
  context: string;
  style: CaptionStyle;
  direction: CaptionDirection;
}): string {
  const contextBlock = input.context.trim()
    ? `User context (supplementary only — never override what is visibly in the image):\n${input.context.trim()}`
    : "User context: none provided.";

  return [
    "You are a content strategist for thoughtful Instagram captions.",
    "Choose a caption approach that fits the photograph, requested style, and direction.",
    "Never invent people, places, objects, events, or circumstances that cannot reasonably be inferred from the image.",
    "User context may color tone and personal detail but must not invent unseen facts.",
    "The 'reason' field must be a short USER-FACING explanation (one sentence), not private chain-of-thought.",
    "",
    "Visual analysis:",
    JSON.stringify(input.analysis, null, 2),
    "",
    contextBlock,
    "",
    `Requested style: ${input.style}`,
    `Requested direction: ${input.direction}`,
    "",
    "Produce a strategy object with:",
    "- chosen_direction: string",
    "- reason: short user-facing sentence",
    "- tone: string[]",
    "- caption_strategy: brief plan for the captions",
    "- things_to_avoid: string[]",
  ].join("\n");
}
