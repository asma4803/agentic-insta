import { readFileSync } from "fs";
import path from "path";

import {
  applyHashtagPolicy,
  buildCritiquePrompt,
  buildWriterPrompt,
  collectCodeIssues,
  formatConstraint,
  type WrittenDraft,
} from "@/lib/agent/postDrafting";
import {
  AIProviderError,
  getAIProvider,
  type AIProvider,
} from "@/lib/ai/provider";
import {
  assertLibraryReady,
  loadImages,
  loadInstagramPage,
  loadTopics,
} from "@/lib/library/content";
import { rankImages, rankTopics } from "@/lib/library/search";
import {
  isResolvedFormat,
  parseJsonObject,
  validateImageInspection,
  validateToolCall,
  validateWrittenPost,
} from "@/lib/validation";
import {
  AgentError,
  type ImageInspection,
  type ImageRecord,
  type InstagramPage,
  type Mood,
  type PostDraft,
  type PostFormatRequest,
  type ResolvedFormat,
  type Topic,
  type TraceStep,
} from "@/types/agent";

const MAX_STEPS = 8;
const FILES_DIR = path.join(process.cwd(), "content", "library", "images", "files");

interface Session {
  page: InstagramPage;
  mood: Mood;
  formatRequest: PostFormatRequest;
  note: string;
  topics: Topic[];
  images: ImageRecord[];
  topicHits: Topic[] | null;
  imageHits: ImageRecord[] | null;
  imageHitsTopicId: string | null;
  inspections: Map<string, ImageInspection>;
  draft: WrittenDraft | null;
  critiqueFailures: number;
  passedCritique: boolean;
  lastIssues: string[];
  trace: TraceStep[];
  lastObservation: string;
}

function mapProviderError(error: unknown): AgentError {
  if (error instanceof AIProviderError) {
    if (error.kind === "missing_key") return new AgentError(error.message, 503);
    if (error.kind === "timeout") return new AgentError(error.message, 504);
    return new AgentError(error.message, 502);
  }
  return new AgentError(
    "Something went wrong while drafting the post. Please try again.",
    500,
  );
}

async function askJson(provider: AIProvider, prompt: string): Promise<unknown> {
  const raw = await provider.generateText({ prompt, json: true });
  try {
    return parseJsonObject(raw);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "malformed_json") {
      throw error;
    }
    const repaired = await provider.generateText({
      json: true,
      prompt: [
        "Return one JSON object and nothing else.",
        "Previous response:",
        raw.slice(0, 4000),
      ].join("\n"),
    });
    return parseJsonObject(repaired);
  }
}

function imageFileUrl(record: ImageRecord): string {
  const absolute = path.resolve(FILES_DIR, record.file);
  const bytes = readFileSync(absolute);
  const extension = path.extname(record.file).toLowerCase();
  const mime =
    extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function toResult(session: Session): PostDraft {
  const draft = session.draft;
  if (!draft) {
    throw new AgentError(
      "The agent did not lock a topic and images in time. Please try again.",
      502,
    );
  }

  return {
    pageHandle: session.page.handle,
    displayName: session.page.displayName,
    mood: session.mood,
    format: draft.format,
    theme: draft.topic.theme,
    topicTitle: draft.topic.title,
    formatReason: draft.formatReason,
    caption: draft.caption,
    hashtags: draft.hashtags,
    slides: draft.slides,
    issues: session.passedCritique ? [] : session.lastIssues,
    trace: session.trace,
  };
}

function nextToolExample(session: Session): string {
  if (!session.topicHits) {
    return '{"tool":"search_topics","arguments":{}}';
  }
  if (!session.imageHits) {
    const topicId = session.topicHits[0]?.id ?? "topic-id";
    return `{"tool":"search_images","arguments":{"topicId":"${topicId}"}}`;
  }
  const wantsCarousel =
    session.formatRequest === "carousel" ||
    (session.formatRequest === "auto" && session.imageHits.length >= 3);
  const needed = wantsCarousel ? 3 : 1;
  const inspected = session.imageHits.filter((image) => session.inspections.has(image.id));
  const pending =
    inspected.length < needed
      ? session.imageHits.find((image) => !session.inspections.has(image.id))
      : undefined;
  if (!session.draft && pending) {
    return `{"tool":"inspect_image","arguments":{"imageId":"${pending.id}"}}`;
  }
  if (!session.draft) {
    const topicId = session.imageHitsTopicId ?? session.topicHits[0]?.id ?? "topic-id";
    const imageIds = inspected.map((image) => image.id);
    const format = wantsCarousel ? "carousel" : "single";
    const ids = (format === "carousel" ? imageIds.slice(0, 3) : imageIds.slice(0, 1)).map(
      (id) => `"${id}"`,
    );
    return `{"tool":"draft_post","arguments":{"topicId":"${topicId}","imageIds":[${ids.join(",")}],"format":"${format}","formatReason":"why this format fits the mood"}}`;
  }
  if (!session.passedCritique) {
    if (session.critiqueFailures > 0) {
      const topicId = session.draft?.topic.id ?? "topic-id";
      const imageIds = session.draft?.slides.map((slide) => `"${slide.imageId}"`) ?? [];
      const format = session.draft?.format ?? "single";
      return `{"tool":"draft_post","arguments":{"topicId":"${topicId}","imageIds":[${imageIds.join(",")}],"format":"${format}","formatReason":"revised after critique"}}`;
    }
    return '{"tool":"critique_post","arguments":{}}';
  }
  return '{"tool":"finish","arguments":{}}';
}

function buildChooserPrompt(session: Session): string {
  const knownTopics = session.topicHits
    ? session.topicHits.map((topic) => `${topic.id}: ${topic.title}`).join("; ")
    : "not searched yet";
  const knownImages = session.imageHits
    ? session.imageHits.map((image) => `${image.id}: ${image.description}`).join(" | ") || "none"
    : "not searched yet";

  return [
    `You are drafting one Instagram post for @${session.page.handle}.`,
    `Niche: ${session.page.niche}. Voice: ${session.page.voice}.`,
    `Mood: ${session.mood}.`,
    formatConstraint(session.formatRequest),
    session.note ? `User note: ${session.note}` : "User note: none.",
    "Choose the next tool. Do not write the caption in this response.",
    "Do not repeat a search once its results are listed below.",
    "Inspect every image you will publish before draft_post.",
    "finish is allowed only after critique_post passes.",
    `Topics: ${knownTopics}.`,
    `Images: ${knownImages}.`,
    `Inspections: ${[...session.inspections.keys()].join(", ") || "none"}.`,
    `Draft saved: ${session.draft ? "yes" : "no"}. Critique passed: ${session.passedCritique ? "yes" : "no"}.`,
    `Last observation: ${session.lastObservation || "none"}`,
    `Return JSON in this shape: ${nextToolExample(session)}`,
  ].join("\n");
}

async function searchTopics(session: Session): Promise<string> {
  session.topicHits = rankTopics(session.topics, session.page, session.mood, session.note);
  if (session.topicHits.length === 0) {
    return `No topics on @${session.page.handle} match the mood ${session.mood}.`;
  }
  const lines = session.topicHits.map(
    (topic) => `- ${topic.id}: ${topic.title}. ${topic.idea}`,
  );
  return `Topics for ${session.mood}: ${session.topicHits.map((topic) => topic.title).join(", ")}.\n${lines.join("\n")}`;
}

async function searchImages(session: Session, args: Record<string, unknown>): Promise<string> {
  const topicId = typeof args.topicId === "string" ? args.topicId : "";
  const topic = session.topicHits?.find((item) => item.id === topicId);
  if (!topic) {
    return "topicId must be one of the topics returned by search_topics.";
  }
  session.imageHitsTopicId = topic.id;
  session.imageHits = rankImages(session.images, session.page, topic, session.mood);
  if (session.imageHits.length === 0) {
    return `No images for ${topic.id} overlap the mood ${session.mood}. Choose another topic.`;
  }
  const lines = session.imageHits.map(
    (image) => `- ${image.id}: ${image.description}`,
  );
  const carouselNote =
    session.imageHits.length >= 3
      ? "Three or more images share this topic, so a carousel is possible."
      : "Fewer than three images share this topic, so this must be a single post unless you switch topics.";
  return `Images for ${topic.title}: ${session.imageHits.map((image) => image.id).join(", ")}. ${carouselNote}\n${lines.join("\n")}`;
}

async function inspectImage(
  session: Session,
  provider: AIProvider,
  args: Record<string, unknown>,
): Promise<string> {
  const imageId = typeof args.imageId === "string" ? args.imageId : "";
  const record = session.imageHits?.find((image) => image.id === imageId);
  if (!record) {
    return "imageId must be one of the images returned by search_images.";
  }

  const inspectedRaw = await provider.analyzeImage({
    imageDataUrl: imageFileUrl(record),
    prompt: [
      "Compare this photograph with the catalog description.",
      "List only what is visible. Do not invent a place, brand, or person.",
      `Catalog description: ${record.description}`,
      'Return JSON with matches_description (boolean), visible_details (array of strings), and notes (string).',
    ].join("\n"),
    jsonSchemaHint:
      '{"matches_description":true,"visible_details":["string"],"notes":"string"}',
  });

  let inspection: ReturnType<typeof validateImageInspection>;
  try {
    inspection = validateImageInspection(parseJsonObject(inspectedRaw));
  } catch {
    return `Inspection of ${record.id} was unreadable. Call inspect_image again.`;
  }
  const stored: ImageInspection = { imageId: record.id, ...inspection };
  session.inspections.set(record.id, stored);

  return stored.matchesDescription
    ? `Inspected ${record.id}. Visible: ${stored.visibleDetails.join(", ")}.`
    : `Inspected ${record.id}. It does not match the catalog. Visible: ${stored.visibleDetails.join(", ")}. Pick a different image.`;
}

function resolveFormat(
  session: Session,
  topic: Topic,
  imageIds: string[],
  requested: string,
): { format: ResolvedFormat } | { error: string } {
  if (!isResolvedFormat(requested)) {
    return { error: 'format must be "single" or "carousel".' };
  }

  const hits = session.imageHits ?? [];
  if (session.imageHitsTopicId !== topic.id) {
    return { error: "Call search_images for this topic before drafting." };
  }

  const missingFromSearch = imageIds.filter((id) => !hits.some((image) => image.id === id));
  if (missingFromSearch.length > 0) {
    return { error: `These images were not in the search results: ${missingFromSearch.join(", ")}.` };
  }

  const uninspected = imageIds.filter((id) => !session.inspections.has(id));
  if (uninspected.length > 0) {
    return { error: `Inspect these images before drafting: ${uninspected.join(", ")}.` };
  }

  const contradicted = imageIds.filter(
    (id) => session.inspections.get(id)?.matchesDescription === false,
  );
  if (contradicted.length > 0) {
    return {
      error: `These photos do not match their catalog descriptions: ${contradicted.join(", ")}. Choose others.`,
    };
  }

  if (session.formatRequest === "single" && requested !== "single") {
    return { error: "The user asked for a single-image post." };
  }
  if (session.formatRequest === "carousel" && requested !== "carousel") {
    return { error: "The user asked for a carousel." };
  }
  if (requested === "single" && imageIds.length !== 1) {
    return { error: "A single post uses exactly one imageId." };
  }
  if (requested === "carousel" && imageIds.length !== 3) {
    return { error: "A carousel uses exactly three imageIds, in narrative order." };
  }
  if (requested === "carousel" && hits.length < 3) {
    return {
      error: "This topic has fewer than three matching images. Choose another topic or a single post.",
    };
  }

  return { format: requested };
}

async function draftPost(
  session: Session,
  provider: AIProvider,
  args: Record<string, unknown>,
): Promise<string> {
  const topicId = typeof args.topicId === "string" ? args.topicId : "";
  const topic = session.topicHits?.find((item) => item.id === topicId);
  if (!topic) {
    return "topicId must be one of the searched topics.";
  }

  const imageIds = Array.isArray(args.imageIds)
    ? args.imageIds.filter((id): id is string => typeof id === "string")
    : [];
  const requested = typeof args.format === "string" ? args.format : "";
  const formatReason = typeof args.formatReason === "string" ? args.formatReason.trim() : "";
  if (!formatReason) {
    return "formatReason must explain the format in one sentence.";
  }

  const resolved = resolveFormat(session, topic, imageIds, requested);
  if ("error" in resolved) return resolved.error;

  const inspections = imageIds.map((id) => session.inspections.get(id)!);
  const previousIssues = session.draft ? session.lastIssues : undefined;
  let writtenRaw: unknown;
  try {
    writtenRaw = await askJson(
      provider,
      buildWriterPrompt({
        page: session.page,
        mood: session.mood,
        topic,
        draft: { format: resolved.format, formatReason, inspections },
        previousIssues,
      }),
    );
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("invalid_") || error.message === "malformed_json")) {
      return "The caption response was not valid JSON. Call draft_post again.";
    }
    throw error;
  }

  let written: ReturnType<typeof validateWrittenPost>;
  try {
    written = validateWrittenPost(writtenRaw, imageIds);
  } catch {
    return "The caption JSON did not match the chosen images. Call draft_post again with the same images.";
  }

  session.draft = {
    topic,
    format: resolved.format,
    formatReason,
    caption: written.caption,
    hashtags: applyHashtagPolicy(written.hashtags, session.page),
    slides: written.slides,
    inspections,
  };
  session.passedCritique = false;

  return `Drafted a ${resolved.format} post on ${topic.title}. Call critique_post.`;
}

async function critiquePost(session: Session, provider: AIProvider): Promise<{ summary: string; stop: boolean }> {
  if (!session.draft) {
    return { summary: "Call draft_post before critique_post.", stop: false };
  }

  const codeIssues = collectCodeIssues(session.draft, session.page);
  let modelIssues: string[] = [];
  let modelPass = true;

  try {
    const raw = await askJson(
      provider,
      buildCritiquePrompt({
        page: session.page,
        mood: session.mood,
        draft: session.draft,
      }),
    );
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const record = raw as Record<string, unknown>;
      modelPass = record.pass === true;
      if (Array.isArray(record.issues)) {
        modelIssues = record.issues.filter((issue): issue is string => typeof issue === "string" && issue.trim().length > 0);
      }
    }
  } catch (error) {
    if (!(error instanceof Error) || (!error.message.startsWith("invalid_") && error.message !== "malformed_json")) {
      throw error;
    }
    modelPass = codeIssues.length === 0;
  }

  if (!modelPass && modelIssues.length === 0) {
    modelIssues = ["The draft does not fit this page."];
  }

  const issues = [...codeIssues, ...(modelPass ? [] : modelIssues)];
  session.lastIssues = issues;
  session.passedCritique = issues.length === 0;

  if (session.passedCritique) {
    return { summary: "Critique passed. You may finish.", stop: false };
  }

  session.critiqueFailures += 1;
  const summary = `Critique failed: ${issues.join(" ")}`;
  if (session.critiqueFailures >= 2) {
    return {
      summary: `${summary} Returning this draft with the remaining issues.`,
      stop: true,
    };
  }
  return { summary: `${summary} Call draft_post once more to revise.`, stop: false };
}

export async function runPostAgent(
  input: { mood: Mood; format: PostFormatRequest; note: string },
  provider: AIProvider = getAIProvider(),
): Promise<PostDraft> {
  const page = loadInstagramPage();
  const topics = loadTopics();
  const images = loadImages();
  assertLibraryReady(page, topics, images);

  const session: Session = {
    page,
    mood: input.mood,
    formatRequest: input.format,
    note: input.note,
    topics,
    images,
    topicHits: null,
    imageHits: null,
    imageHitsTopicId: null,
    inspections: new Map(),
    draft: null,
    critiqueFailures: 0,
    passedCritique: false,
    lastIssues: [],
    trace: [],
    lastObservation: "",
  };

  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      let call: ReturnType<typeof validateToolCall>;
      try {
        call = validateToolCall(await askJson(provider, buildChooserPrompt(session)));
      } catch (error) {
        if (error instanceof AIProviderError) throw error;
        session.lastObservation = "Return one JSON tool call with tool and arguments.";
        session.trace.push({ tool: "invalid", summary: session.lastObservation });
        continue;
      }

      if (call.tool === "finish") {
        if (!session.passedCritique) {
          session.lastObservation = "finish is blocked until critique_post passes.";
          session.trace.push({ tool: "finish", summary: session.lastObservation });
          continue;
        }
        session.trace.push({
          tool: "finish",
          summary: `Finished a ${session.draft?.format} draft for @${session.page.handle}.`,
        });
        return toResult(session);
      }

      let summary = "";
      let stop = false;

      if (call.tool === "search_topics") {
        summary = await searchTopics(session);
      } else if (call.tool === "search_images") {
        summary = await searchImages(session, call.arguments);
      } else if (call.tool === "inspect_image") {
        summary = await inspectImage(session, provider, call.arguments);
      } else if (call.tool === "draft_post") {
        summary = await draftPost(session, provider, call.arguments);
      } else {
        const critique = await critiquePost(session, provider);
        summary = critique.summary;
        stop = critique.stop;
      }

      session.lastObservation = summary;
      session.trace.push({
        tool: call.tool,
        summary: summary.split("\n")[0] ?? summary,
      });

      if (stop) return toResult(session);
    }

    if (session.draft) {
      session.lastIssues = [
        ...session.lastIssues,
        "Stopped before a passing critique because the step budget ran out.",
      ];
      session.passedCritique = false;
      session.trace.push({
        tool: "stop",
        summary: "Stopped with the latest draft still open.",
      });
      return toResult(session);
    }

    throw new AgentError(
      "The agent could not assemble a draft in time. Please try again.",
      504,
    );
  } catch (error) {
    if (error instanceof AgentError) throw error;
    throw mapProviderError(error);
  }
}
