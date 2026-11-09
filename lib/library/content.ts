import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";

import {
  AgentError,
  type ImageRecord,
  type InstagramPage,
  type Mood,
  type PageSummary,
  type Topic,
} from "@/types/agent";

const MOOD_VALUES: readonly Mood[] = [
  "inspirational",
  "funny",
  "reflective",
  "motivational",
  "casual",
];

const CONTENT_ROOT = path.join(process.cwd(), "content");
const PAGE_PATH = path.join(CONTENT_ROOT, "page", "instagram.json");
const TOPICS_DIR = path.join(CONTENT_ROOT, "library", "topics");
const IMAGES_DIR = path.join(CONTENT_ROOT, "library", "images");
const FILES_DIR = path.join(IMAGES_DIR, "files");
const MANIFEST_PATH = path.join(IMAGES_DIR, "manifest.json");

function readJson(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch {
    throw new AgentError(
      `The library file ${path.relative(process.cwd(), filePath)} could not be read.`,
      500,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(raw: Record<string, unknown>, field: string, file: string): string {
  const value = raw[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new AgentError(`${file} is missing ${field}.`, 500);
  }
  return value.trim();
}

function requireStringList(raw: Record<string, unknown>, field: string, file: string): string[] {
  const value = raw[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new AgentError(`${file} is missing a list of ${field}.`, 500);
  }
  return value.map((item) => item.trim());
}

function requireMoods(raw: Record<string, unknown>, file: string): Mood[] {
  const moods = requireStringList(raw, "moods", file);
  const allowed = new Set<string>(MOOD_VALUES);
  if (moods.some((mood) => !allowed.has(mood))) {
    throw new AgentError(`${file} has a mood that this app does not use.`, 500);
  }
  return moods as Mood[];
}

export function loadInstagramPage(): InstagramPage {
  if (!existsSync(PAGE_PATH)) {
    throw new AgentError(
      "The Instagram page is not configured. Add content/page/instagram.json.",
      500,
    );
  }

  const raw = readJson(PAGE_PATH);
  if (!isRecord(raw)) {
    throw new AgentError("content/page/instagram.json must be a JSON object.", 500);
  }

  const captionLength = raw.captionLength;
  if (captionLength !== "short" && captionLength !== "medium") {
    throw new AgentError(
      "content/page/instagram.json captionLength must be short or medium.",
      500,
    );
  }

  const themes = requireStringList(raw, "themes", "content/page/instagram.json");
  if (themes.length === 0) {
    throw new AgentError("The Instagram page has no themes.", 500);
  }

  return {
    handle: requireString(raw, "handle", "content/page/instagram.json").replace(/^@/, ""),
    displayName: requireString(raw, "displayName", "content/page/instagram.json"),
    niche: requireString(raw, "niche", "content/page/instagram.json"),
    audience: requireString(raw, "audience", "content/page/instagram.json"),
    voice: requireString(raw, "voice", "content/page/instagram.json"),
    language: requireString(raw, "language", "content/page/instagram.json"),
    themes,
    captionLength,
    alwaysHashtags: requireStringList(raw, "alwaysHashtags", "content/page/instagram.json"),
    neverHashtags: requireStringList(raw, "neverHashtags", "content/page/instagram.json"),
    avoid: requireStringList(raw, "avoid", "content/page/instagram.json"),
  };
}

export function loadTopics(): Topic[] {
  if (!existsSync(TOPICS_DIR)) {
    throw new AgentError("The caption topic library is missing.", 500);
  }

  const files = readdirSync(TOPICS_DIR).filter((name) => name.endsWith(".json"));
  if (files.length === 0) {
    throw new AgentError("Add topic JSON files under content/library/topics.", 500);
  }

  return files.map((name) => {
    const file = path.join(TOPICS_DIR, name);
    const raw = readJson(file);
    if (!isRecord(raw)) {
      throw new AgentError(`${name} must be a JSON object.`, 500);
    }
    const label = `content/library/topics/${name}`;
    return {
      id: requireString(raw, "id", label),
      theme: requireString(raw, "theme", label),
      title: requireString(raw, "title", label),
      idea: requireString(raw, "idea", label),
      moods: requireMoods(raw, label),
      hooks: requireStringList(raw, "hooks", label),
      avoid: requireStringList(raw, "avoid", label),
    };
  });
}

export function loadImages(): ImageRecord[] {
  if (!existsSync(MANIFEST_PATH)) {
    throw new AgentError(
      "The image library is missing content/library/images/manifest.json.",
      500,
    );
  }

  const raw = readJson(MANIFEST_PATH);
  if (!isRecord(raw) || !Array.isArray(raw.images)) {
    throw new AgentError("The image manifest must contain an images array.", 500);
  }

  if (raw.images.length === 0) {
    throw new AgentError(
      "Add images to content/library/images/files and list them in the manifest.",
      500,
    );
  }

  return raw.images.map((item, index) => {
    if (!isRecord(item)) {
      throw new AgentError(`Image manifest entry ${index + 1} is not an object.`, 500);
    }
    const label = `image manifest entry ${index + 1}`;
    const record: ImageRecord = {
      id: requireString(item, "id", label),
      file: requireString(item, "file", label),
      description: requireString(item, "description", label),
      themes: requireStringList(item, "themes", label),
      moods: requireMoods(item, label),
      subjects: requireStringList(item, "subjects", label),
    };
    const absolute = resolveImageFile(record);
    if (!existsSync(absolute)) {
      throw new AgentError(
        `Add ${record.file} to content/library/images/files. The manifest lists it, but the file is missing.`,
        500,
      );
    }
    return record;
  });
}

function resolveImageFile(record: ImageRecord): string {
  const absolute = path.resolve(FILES_DIR, record.file);
  const relative = path.relative(FILES_DIR, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AgentError(`Image ${record.id} points outside the library folder.`, 500);
  }
  return absolute;
}

export function assertLibraryReady(
  page: InstagramPage,
  topics: Topic[],
  images: ImageRecord[],
): void {
  const topicThemes = new Set(topics.map((topic) => topic.theme));
  const usable = page.themes.filter(
    (theme) =>
      topicThemes.has(theme) && images.some((image) => image.themes.includes(theme)),
  );

  if (usable.length === 0) {
    throw new AgentError(
      "The page themes do not match any topic that also has an image. Update content/page/instagram.json or the libraries.",
      500,
    );
  }
}

export function loadPageSummary(): PageSummary {
  const page = loadInstagramPage();
  const topics = loadTopics();
  const images = loadImages();
  assertLibraryReady(page, topics, images);
  return {
    handle: page.handle,
    displayName: page.displayName,
    niche: page.niche,
  };
}

export function getImageFile(id: string): { absolutePath: string; mime: string } | null {
  const images = loadImages();
  const record = images.find((image) => image.id === id);
  if (!record) return null;
  const absolutePath = resolveImageFile(record);
  if (!existsSync(absolutePath)) return null;
  const extension = path.extname(absolutePath).toLowerCase();
  const mime =
    extension === ".png"
      ? "image/png"
      : extension === ".webp"
        ? "image/webp"
        : extension === ".jpg" || extension === ".jpeg"
          ? "image/jpeg"
          : null;
  if (!mime) return null;
  return { absolutePath, mime };
}
