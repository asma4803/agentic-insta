import { AsyncLocalStorage } from "async_hooks";

import type { CallEvent, TokenUsage } from "@/types/agent";
import { extractJsonObjectText } from "@/lib/validation";

export interface ModelCompletion {
  content: string;
  model: string;
  durationMs: number;
  usage: TokenUsage | null;
}

interface ModelCallScope {
  purpose: string;
  inputSummary: string;
  emit: (event: CallEvent) => void;
}

const modelCallScope = new AsyncLocalStorage<ModelCallScope>();

export function trackModelCall<T>(
  scope: ModelCallScope,
  fn: () => Promise<T>,
): Promise<T> {
  return modelCallScope.run(scope, fn);
}

export interface AIProvider {
  analyzeImage(input: {
    imageDataUrl: string;
    prompt: string;
    jsonSchemaHint?: string;
  }): Promise<ModelCompletion>;
  generateText(input: { prompt: string; json?: boolean }): Promise<ModelCompletion>;
}

type ProviderKind = "nvidia" | "openai";

const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
/**
 * Vision-capable NVIDIA NIM model (OpenAI-compatible image_url content).
 * meta/llama-3.2-11b-vision-instruct is still listed, but many API keys get
 * 404 because that hosted function is not deployed for the account.
 */
const NVIDIA_DEFAULT_MODEL = "nvidia/nemotron-3.5-bolt-e4b";
const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const REQUEST_TIMEOUT_MS = 45_000;

export class AIProviderError extends Error {
  readonly kind: "missing_key" | "timeout" | "provider" | "empty";

  constructor(
    message: string,
    kind: "missing_key" | "timeout" | "provider" | "empty" = "provider",
  ) {
    super(message);
    this.name = "AIProviderError";
    this.kind = kind;
  }
}

function firstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function resolveProviderKind(): ProviderKind | null {
  // Prefer NVIDIA when its key is set (NVIDIA_* or legacy NVAPI_* alias).
  if (firstEnv("NVIDIA_API_KEY", "NVAPI_API_KEY")) return "nvidia";
  if (firstEnv("OPENAI_API_KEY")) return "openai";
  return null;
}

function getConfig(): {
  kind: ProviderKind;
  apiKey: string;
  model: string;
  baseUrl: string;
  supportsJsonResponseFormat: boolean;
  maxTokensField: "max_tokens" | "max_completion_tokens";
} {
  const kind = resolveProviderKind();

  if (!kind) {
    throw new AIProviderError(
      "No AI API key configured. Set NVIDIA_API_KEY (or OPENAI_API_KEY) in your environment.",
      "missing_key",
    );
  }

  if (kind === "nvidia") {
    const apiKey = firstEnv("NVIDIA_API_KEY", "NVAPI_API_KEY")!;
    return {
      kind,
      apiKey,
      // Model id may include slashes (e.g. nvidia/nemotron-3.5-bolt-e4b);
      // it is sent only in the JSON body, never as a URL path segment.
      model:
        firstEnv("NVIDIA_MODEL", "NVAPI_MODEL") || NVIDIA_DEFAULT_MODEL,
      baseUrl: (
        firstEnv("NVIDIA_BASE_URL", "NVAPI_BASE_URL") ||
        NVIDIA_DEFAULT_BASE_URL
      ).replace(/\/$/, ""),
      // Many NVIDIA NIM models reject response_format; rely on prompt + parseJsonObject.
      supportsJsonResponseFormat: false,
      maxTokensField: "max_tokens",
    };
  }

  const apiKey = firstEnv("OPENAI_API_KEY")!;
  return {
    kind,
    apiKey,
    model: firstEnv("OPENAI_MODEL") || OPENAI_DEFAULT_MODEL,
    baseUrl: (
      firstEnv("OPENAI_BASE_URL") || OPENAI_DEFAULT_BASE_URL
    ).replace(/\/$/, ""),
    supportsJsonResponseFormat: true,
    maxTokensField: "max_tokens",
  };
}

function mapHttpError(
  status: number,
  kind: ProviderKind,
): AIProviderError {
  const keyHint =
    kind === "nvidia"
      ? "Check NVIDIA_API_KEY."
      : "Check OPENAI_API_KEY.";

  if (status === 401 || status === 403) {
    return new AIProviderError(
      `The AI service rejected the API key. ${keyHint}`,
      "provider",
    );
  }

  if (status === 404) {
    return new AIProviderError(
      kind === "nvidia"
        ? "Model not available. Check NVIDIA_MODEL (use a vision-capable NIM model id)."
        : "Model not available. Check OPENAI_MODEL.",
      "provider",
    );
  }

  return new AIProviderError(
    "The AI service could not complete this request. Please try again.",
    "provider",
  );
}

let callSeq = 0;

function clipSummary(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 180) return oneLine;
  return `${oneLine.slice(0, 179)}…`;
}

function readUsage(value: unknown): TokenUsage | null {
  if (typeof value !== "object" || value === null) return null;
  const usage = value as Record<string, unknown>;
  const prompt = usage.prompt_tokens;
  const completion = usage.completion_tokens;
  const total = usage.total_tokens;
  if (
    typeof prompt !== "number" ||
    typeof completion !== "number" ||
    typeof total !== "number"
  ) {
    return null;
  }
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: total,
  };
}

function emitCall(event: Omit<CallEvent, "type" | "purpose" | "inputSummary"> & {
  purpose?: string;
  inputSummary?: string;
}): void {
  const scope = modelCallScope.getStore();
  if (!scope) return;
  scope.emit({
    type: "call",
    purpose: event.purpose ?? scope.purpose,
    inputSummary: event.inputSummary ?? scope.inputSummary,
    ...event,
  });
}

async function chatCompletion(
  body: Record<string, unknown>,
): Promise<ModelCompletion> {
  const { apiKey, model, baseUrl, kind } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = performance.now();
  const id = `call-${++callSeq}`;
  let settled = false;

  const fail = (message: string) => {
    if (settled) return;
    settled = true;
    emitCall({
      id,
      status: "failed",
      model,
      outputSummary: message,
      durationMs: Math.round(performance.now() - started),
      usage: null,
    });
  };

  emitCall({ id, status: "in_progress", model });

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, ...body }),
      signal: controller.signal,
    });

    if (!response.ok) {
      // Never leak raw provider payloads or keys to callers.
      const error = mapHttpError(response.status, kind);
      fail(error.message);
      throw error;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: unknown;
    };

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      const error = new AIProviderError(
        "The AI service returned an empty response. Please try again.",
        "empty",
      );
      fail(error.message);
      throw error;
    }

    const completion: ModelCompletion = {
      content,
      model,
      durationMs: Math.round(performance.now() - started),
      usage: readUsage(data.usage),
    };
    settled = true;
    emitCall({
      id,
      status: "completed",
      model,
      outputSummary: clipSummary(content),
      durationMs: completion.durationMs,
      usage: completion.usage,
    });
    return completion;
  } catch (error) {
    if (error instanceof AIProviderError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutError = new AIProviderError(
        "The request timed out. Please try again with a smaller image or simpler context.",
        "timeout",
      );
      fail(timeoutError.message);
      throw timeoutError;
    }
    const providerError = new AIProviderError(
      "Something went wrong talking to the AI service. Please try again.",
      "provider",
    );
    fail(providerError.message);
    throw providerError;
  } finally {
    clearTimeout(timeout);
  }
}

function jsonRepairPrompt(raw: string, schemaHint?: string): string {
  return [
    "Convert the following text into ONE JSON object and nothing else.",
    "No markdown, no preface, no trailing text.",
    "Every string value must be a non-empty phrase grounded in the text. Never use an empty string.",
    "Where the shape shows an array, return an array of strings. Use [] only when the text says there are none.",
    schemaHint
      ? `Required shape:\n${schemaHint}`
      : "Preserve the JSON fields requested in the text.",
    "",
    "Text:",
    raw,
  ].join("\n");
}

/**
 * llama-3.2 vision answers in prose even when asked for JSON.
 * Keep a valid object as-is; otherwise ask the same model (text-only) to format it.
 */
async function repairJsonObject(
  raw: string,
  schemaHint?: string,
): Promise<ModelCompletion> {
  const { maxTokensField } = getConfig();
  const parent = modelCallScope.getStore();
  const run = () =>
    chatCompletion({
      temperature: 0,
      [maxTokensField]: 2048,
      messages: [
        { role: "system", content: "You output valid JSON only." },
        { role: "user", content: jsonRepairPrompt(raw, schemaHint) },
      ],
    });

  const repaired = parent
    ? await modelCallScope.run(
        {
          ...parent,
          purpose: "Repair malformed JSON",
          inputSummary: "The model response was not valid JSON.",
        },
        run,
      )
    : await run();

  return {
    ...repaired,
    content: extractJsonObjectText(repaired.content) ?? repaired.content,
  };
}

export class OpenAIProvider implements AIProvider {
  async analyzeImage(input: {
    imageDataUrl: string;
    prompt: string;
    jsonSchemaHint?: string;
  }): Promise<ModelCompletion> {
    const { supportsJsonResponseFormat, maxTokensField } = getConfig();
    const systemParts = [
      "You are a careful visual analyst for photography. Respond with valid JSON only.",
      "Never invent people, places, objects, events, or circumstances that cannot reasonably be inferred from the image.",
    ];
    if (input.jsonSchemaHint) {
      systemParts.push(`JSON shape hint: ${input.jsonSchemaHint}`);
    }

    const raw = await chatCompletion({
      ...(supportsJsonResponseFormat
        ? { response_format: { type: "json_object" } }
        : {}),
      [maxTokensField]: 2048,
      messages: [
        { role: "system", content: systemParts.join(" ") },
        {
          role: "user",
          content: [
            { type: "text", text: input.prompt },
            {
              type: "image_url",
              image_url: { url: input.imageDataUrl },
            },
          ],
        },
      ],
    });

    if (extractJsonObjectText(raw.content)) {
      return { ...raw, content: extractJsonObjectText(raw.content) ?? raw.content };
    }
    return repairJsonObject(raw.content, input.jsonSchemaHint ?? input.prompt);
  }

  async generateText(input: { prompt: string; json?: boolean }): Promise<ModelCompletion> {
    const { supportsJsonResponseFormat, maxTokensField } = getConfig();
    const wantJson = Boolean(input.json);

    const raw = await chatCompletion({
      ...(wantJson && supportsJsonResponseFormat
        ? { response_format: { type: "json_object" } }
        : {}),
      [maxTokensField]: 2048,
      messages: [
        {
          role: "system",
          content: wantJson
            ? "You are a precise writing assistant. Respond with valid JSON only."
            : "You are a precise writing assistant.",
        },
        { role: "user", content: input.prompt },
      ],
    });

    if (!wantJson) return raw;
    if (extractJsonObjectText(raw.content)) {
      return { ...raw, content: extractJsonObjectText(raw.content) ?? raw.content };
    }
    return repairJsonObject(raw.content, input.prompt);
  }
}

let cachedProvider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!cachedProvider) {
    cachedProvider = new OpenAIProvider();
  }
  return cachedProvider;
}
