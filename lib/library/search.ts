import type { ImageRecord, InstagramPage, Mood, Topic } from "@/types/agent";

function noteTokens(note: string): string[] {
  return note
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3);
}

export function rankTopics(
  topics: Topic[],
  page: InstagramPage,
  mood: Mood,
  note: string,
): Topic[] {
  const allowed = new Set(page.themes);
  const tokens = noteTokens(note);

  return topics
    .filter((topic) => allowed.has(topic.theme) && topic.moods.includes(mood))
    .map((topic) => {
      const haystack = [topic.title, topic.idea, topic.theme, ...topic.hooks]
        .join(" ")
        .toLowerCase();
      const overlap = tokens.filter((token) => haystack.includes(token)).length;
      return { topic, score: overlap };
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.topic.title.localeCompare(b.topic.title),
    )
    .slice(0, 4)
    .map((entry) => entry.topic);
}

export function rankImages(
  images: ImageRecord[],
  page: InstagramPage,
  topic: Topic,
  mood: Mood,
): ImageRecord[] {
  if (!page.themes.includes(topic.theme)) return [];

  return images
    .filter(
      (image) =>
        image.themes.includes(topic.theme) && image.moods.includes(mood),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 6);
}
