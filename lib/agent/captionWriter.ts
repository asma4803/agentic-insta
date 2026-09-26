import type {
  CaptionDirection,
  CaptionStyle,
  ContentStrategy,
  VisualAnalysis,
} from "@/types/agent";

const BANNED_PHRASES = [
  "Capture the essence",
  "Embrace the beauty",
  "Where dreams meet",
  "Nature's masterpiece",
  "Lost in the moment",
];

export function buildCaptionWriterGuidance(input: {
  analysis: VisualAnalysis;
  strategy: ContentStrategy;
  context: string;
  style: CaptionStyle;
  direction: CaptionDirection;
}): string {
  const contextBlock = input.context.trim()
    ? `User context (supplementary only):\n${input.context.trim()}`
    : "User context: none.";

  const urduNote =
    input.style === "Urdu-English"
      ? "For Urdu-English: use natural Roman Urdu mixed with English. Do not force Urdu into every sentence."
      : "";

  return [
    "You are a thoughtful photographer and content editor writing Instagram captions.",
    "Voice: human, subtle, emotionally intelligent, concise, natural — not a marketing agency.",
    "Never invent people, places, objects, events, or circumstances that cannot reasonably be inferred from the image.",
    "Avoid: generic AI phrases, excessive metaphors, forced positivity, excessive emojis,",
    "cliché Instagram language, unnecessarily long captions, and hashtags stuffed into caption bodies.",
    `Do not use these banned phrases unless the user explicitly asked for that style: ${BANNED_PHRASES.map((p) => `"${p}..."`).join(", ")}.`,
    urduNote,
    "",
    "Visual analysis:",
    JSON.stringify(input.analysis, null, 2),
    "",
    "Strategy:",
    JSON.stringify(input.strategy, null, 2),
    "",
    contextBlock,
    "",
    `Style: ${input.style}`,
    `Direction: ${input.direction}`,
    "",
    "Write:",
    "- primary_caption: one natural Instagram caption (no hashtags in the body)",
    "- alternatives: exactly 3 alternative captions (no hashtags in the body)",
    "- hashtags: 3–6 relevant hashtags, each starting with #",
  ]
    .filter(Boolean)
    .join("\n");
}

export { BANNED_PHRASES };
