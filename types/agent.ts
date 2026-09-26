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

export class AgentError extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "AgentError";
    this.status = status;
  }
}
