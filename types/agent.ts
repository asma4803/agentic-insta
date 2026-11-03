export const CAPTION_STYLES = [
  "Minimal",
  "Poetic",
  "Emotional",
  "Aesthetic",
  "Personal",
  "Urdu-English",
] as const;

export type CaptionStyle = (typeof CAPTION_STYLES)[number];

export const CAPTION_DIRECTIONS = [
  "Describe the moment",
  "Express a feeling",
  "Subtle / aesthetic",
  "Tell a story",
  "Unexpected thought",
] as const;

export type CaptionDirection = (typeof CAPTION_DIRECTIONS)[number];

export interface VisualAnalysis {
  subject: string;
  environment: string;
  lighting: string;
  colors: string[];
  composition: string;
  visual_mood: string[];
  visible_details: string[];
  possible_emotional_directions: string[];
  secondary_subjects?: string[];
}

export interface ContentStrategy {
  chosen_direction: string;
  reason: string;
  tone: string[];
  caption_strategy: string;
  things_to_avoid: string[];
}

export interface CaptionDraft {
  primary_caption: string;
  alternatives: [string, string, string];
  hashtags: string[];
}

export interface StrategyAndCaptions {
  strategy: ContentStrategy;
  captions: CaptionDraft;
}

export interface GenerateResult {
  visual_summary: string;
  mood: string[];
  primary_caption: string;
  alternatives: [string, string, string];
  hashtags: string[];
  strategy_note?: string;
}

export interface AgentInput {
  imageDataUrl: string;
  context: string;
  style: CaptionStyle;
  direction: CaptionDirection;
}

export const MOODS = [
  "inspirational",
  "funny",
  "reflective",
  "motivational",
  "casual",
] as const;

export type Mood = (typeof MOODS)[number];

export const POST_FORMATS = ["single", "carousel", "auto"] as const;

export type PostFormatRequest = (typeof POST_FORMATS)[number];

export type ResolvedFormat = "single" | "carousel";

export interface InstagramPage {
  handle: string;
  displayName: string;
  niche: string;
  audience: string;
  voice: string;
  language: string;
  themes: string[];
  captionLength: "short" | "medium";
  alwaysHashtags: string[];
  neverHashtags: string[];
  avoid: string[];
}

export interface Topic {
  id: string;
  theme: string;
  title: string;
  idea: string;
  moods: Mood[];
  hooks: string[];
  avoid: string[];
}

export interface ImageRecord {
  id: string;
  file: string;
  description: string;
  themes: string[];
  moods: Mood[];
  subjects: string[];
}

export interface ImageInspection {
  imageId: string;
  matchesDescription: boolean;
  visibleDetails: string[];
  notes: string;
}

export interface SlideDraft {
  imageId: string;
  text: string;
}

export interface TraceStep {
  tool: string;
  summary: string;
}

export interface PostDraft {
  pageHandle: string;
  displayName: string;
  mood: Mood;
  format: ResolvedFormat;
  theme: string;
  topicTitle: string;
  formatReason: string;
  caption: string;
  hashtags: string[];
  slides: SlideDraft[];
  issues: string[];
  trace: TraceStep[];
}

export interface PageSummary {
  handle: string;
  displayName: string;
  niche: string;
}

export class AgentError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "AgentError";
    this.status = status;
  }
}
