import { buildStrategistGuidance } from "@/lib/agent/contentStrategist";
import { buildCaptionWriterGuidance } from "@/lib/agent/captionWriter";
import { runQualityChecker } from "@/lib/agent/qualityChecker";
import { runVisualAnalyst } from "@/lib/agent/visualAnalyst";
import {
  AIProviderError,
  getAIProvider,
  type AIProvider,
} from "@/lib/ai/provider";
import {
  parseJsonObject,
  validateGenerateResult,
  validateStrategyAndCaptions,
} from "@/lib/validation";
import {
  AgentError,
  type AgentInput,
  type GenerateResult,
  type VisualAnalysis,
} from "@/types/agent";

function buildCombinedStrategyAndWriterPrompt(
  input: AgentInput,
  analysis: VisualAnalysis,
): string {
  // Modules own their prompt sections; Stage 2 + Stage 3 share one text call.
  const strategistPart = buildStrategistGuidance({
    analysis,
    context: input.context,
    style: input.style,
    direction: input.direction,
  });

  const writerPart = buildCaptionWriterGuidance({
    analysis,
    strategy: {
      chosen_direction: input.direction,
      reason: "(fill from your strategy above)",
      tone: ["(derive from style and image)"],
      caption_strategy: "(fill from your strategy above)",
      things_to_avoid: [
        "invented facts",
        "clichés",
        "hashtags in caption body",
      ],
    },
    context: input.context,
    style: input.style,
    direction: input.direction,
  });

  return [
    "Complete BOTH strategy and captions in one JSON response.",
    "First decide the strategy, then write captions that follow it.",
    "",
    "=== STRATEGY INSTRUCTIONS ===",
    strategistPart,
    "",
    "=== CAPTION INSTRUCTIONS ===",
    writerPart,
    "",
    "Return JSON exactly in this shape:",
    JSON.stringify(
      {
        strategy: {
          chosen_direction: "string",
          reason: "short user-facing sentence",
          tone: ["string"],
          caption_strategy: "string",
          things_to_avoid: ["string"],
        },
        captions: {
          primary_caption: "string",
          alternatives: ["string", "string", "string"],
          hashtags: ["#tag"],
        },
      },
      null,
      2,
    ),
  ].join("\n");
}

function mapProviderError(error: unknown): AgentError {
  if (error instanceof AIProviderError) {
    if (error.kind === "missing_key") {
      return new AgentError(error.message, 503);
    }
    if (error.kind === "timeout") {
      return new AgentError(error.message, 504);
    }
    return new AgentError(error.message, 502);
  }

  if (
    error instanceof Error &&
    (error.message.startsWith("invalid_") || error.message === "malformed_json")
  ) {
    return new AgentError(
      "The AI returned an unexpected response. Please try generating again.",
      502,
    );
  }

  return new AgentError(
    "Something went wrong while generating captions. Please try again.",
    500,
  );
}

export async function runCaptionAgent(
  input: AgentInput,
  provider: AIProvider = getAIProvider(),
): Promise<GenerateResult> {
  try {
    // Stage 1 — vision analysis
    const analysis = await runVisualAnalyst(provider, input.imageDataUrl);

    // Stages 2 + 3 — strategy and captions in one text call
    const combinedPrompt = buildCombinedStrategyAndWriterPrompt(input, analysis);
    const combinedRaw = await provider.generateText({
      prompt: combinedPrompt,
      json: true,
    });

    let strategyAndCaptions: ReturnType<typeof validateStrategyAndCaptions>;
    try {
      strategyAndCaptions = validateStrategyAndCaptions(parseJsonObject(combinedRaw));
    } catch (error) {
      if (
        !(error instanceof Error) ||
        (!error.message.startsWith("invalid_") && error.message !== "malformed_json")
      ) {
        throw error;
      }
      const repaired = await provider.generateText({
        json: true,
        prompt: [
          "The previous response failed validation:",
          error.message,
          "Return one JSON object with strategy and captions.",
          "captions.alternatives must be exactly 3 non-empty strings.",
          "captions.hashtags must be 3 to 6 strings, each starting with #.",
          "Do not put hashtags inside caption text.",
          "",
          "Previous response:",
          combinedRaw,
        ].join("\n"),
      });
      strategyAndCaptions = validateStrategyAndCaptions(parseJsonObject(repaired));
    }

    const { strategy, captions } = strategyAndCaptions;

    // Stage 4 — heuristic check + optional single revision
    const checked = await runQualityChecker(provider, {
      analysis,
      strategy,
      draft: captions,
      style: input.style,
      context: input.context,
    });

    const mood = analysis.visual_mood.slice(0, 4);
    while (mood.length < 2) {
      mood.push("Thoughtful");
    }

    const visualSummary = [
      analysis.subject,
      analysis.environment,
      analysis.lighting,
    ]
      .filter(Boolean)
      .join(" · ");

    return validateGenerateResult({
      visual_summary: visualSummary,
      mood: mood.slice(0, 4),
      primary_caption: checked.primary_caption,
      alternatives: checked.alternatives,
      hashtags: checked.hashtags.slice(0, 6),
      strategy_note: strategy.reason,
    });
  } catch (error) {
    if (error instanceof AgentError) {
      throw error;
    }
    throw mapProviderError(error);
  }
}
