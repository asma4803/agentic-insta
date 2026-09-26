import type { AIProvider } from "@/lib/ai/provider";
import { parseJsonObject, validateVisualAnalysis } from "@/lib/validation";
import type { VisualAnalysis } from "@/types/agent";

const SCHEMA_HINT = `{
  "subject": "string",
  "environment": "string",
  "lighting": "string",
  "colors": ["string"],
  "composition": "string",
  "visual_mood": ["string"],
  "visible_details": ["string"],
  "possible_emotional_directions": ["string"],
  "secondary_subjects": ["string"]
}`;

export function buildVisualAnalystPrompt(): string {
  return [
    "Analyze this photograph carefully for Instagram caption writing.",
    "Describe only what is visibly present or reasonably inferable.",
    "Never invent people, places, objects, events, or circumstances that cannot reasonably be inferred from the image.",
    "Return JSON with these fields:",
    "- subject: main subject of the photo",
    "- environment: setting / surroundings",
    "- lighting: quality and feel of the light",
    "- colors: dominant colors (array)",
    "- composition: framing / visual structure",
    "- visual_mood: 2–5 mood words grounded in the image",
    "- visible_details: concrete observed details",
    "- possible_emotional_directions: plausible emotional angles supported by the image",
    "- secondary_subjects: optional array of secondary subjects if any",
  ].join("\n");
}

export async function runVisualAnalyst(
  provider: AIProvider,
  imageDataUrl: string,
): Promise<VisualAnalysis> {
  const raw = await provider.analyzeImage({
    imageDataUrl,
    prompt: buildVisualAnalystPrompt(),
    jsonSchemaHint: SCHEMA_HINT,
  });

  return validateVisualAnalysis(parseJsonObject(raw));
}
