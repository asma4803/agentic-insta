import { statSync } from "fs";

import { readContainer, createMedia, publishContainer, readPermalink, readPublishingQuota } from "@/lib/instagram/client";
import { imagePublicUrl, requireInstagramConfig, type InstagramConfig } from "@/lib/instagram/config";
import { getImageFile } from "@/lib/library/content";
import { assertPublishableCaption } from "@/lib/posts/edits";
import { AgentError, type InstagramQuota, type PostDraft } from "@/types/agent";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const POLL_ATTEMPTS = 30;
const POLL_DELAY_MS = 2000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertImages(draft: PostDraft) {
  if (draft.format === "single" && draft.slides.length !== 1) {
    throw new AgentError("A single-image post needs exactly one image.", 400);
  }
  if (draft.format === "carousel" && (draft.slides.length < 2 || draft.slides.length > 10)) {
    throw new AgentError("A carousel needs between 2 and 10 images.", 400);
  }

  for (const slide of draft.slides) {
    const file = getImageFile(slide.imageId);
    if (!file) {
      throw new AgentError(`The image ${slide.imageId} is no longer in the library.`, 400);
    }
    if (file.mime !== "image/jpeg") {
      throw new AgentError(
        `Instagram only publishes JPEG images. ${slide.imageId} is ${file.mime}.`,
        400,
      );
    }
    const size = statSync(file.absolutePath).size;
    if (size > MAX_IMAGE_BYTES) {
      throw new AgentError(`The image ${slide.imageId} is larger than 8 MB.`, 400);
    }
  }
}

async function waitUntilFinished(config: InstagramConfig, containerId: string) {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    const container = await readContainer(config, containerId);
    if (container.statusCode === "FINISHED" || container.statusCode === "PUBLISHED") {
      return;
    }
    if (container.statusCode === "ERROR" || container.statusCode === "EXPIRED") {
      throw new AgentError(
        container.status || `Instagram could not process the image (${container.statusCode}).`,
        502,
      );
    }
    await sleep(POLL_DELAY_MS);
  }
  throw new AgentError("Instagram did not finish processing the image in time.", 502);
}

async function publishSingle(
  config: InstagramConfig,
  draft: PostDraft,
  caption: string,
): Promise<string> {
  const slide = draft.slides[0];
  if (!slide) {
    throw new AgentError("A single-image post needs exactly one image.", 400);
  }
  const fields: Record<string, string | boolean> = {
    image_url: imagePublicUrl(config, slide.imageId),
    caption,
  };
  if (slide.text) fields.alt_text = slide.text;
  const containerId = await createMedia(config, fields);
  await waitUntilFinished(config, containerId);
  return publishContainer(config, containerId);
}

async function publishCarousel(
  config: InstagramConfig,
  draft: PostDraft,
  caption: string,
): Promise<string> {
  const childIds: string[] = [];
  for (const slide of draft.slides) {
    const fields: Record<string, string | boolean> = {
      image_url: imagePublicUrl(config, slide.imageId),
      is_carousel_item: true,
    };
    if (slide.text) fields.alt_text = slide.text;
    const childId = await createMedia(config, fields);
    await waitUntilFinished(config, childId);
    childIds.push(childId);
  }

  const parentId = await createMedia(config, {
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
  });
  await waitUntilFinished(config, parentId);
  return publishContainer(config, parentId);
}

export async function readQuotaIfConfigured(): Promise<{
  quota: InstagramQuota | null;
  quotaError?: string;
}> {
  try {
    const config = requireInstagramConfig();
    const quota = await readPublishingQuota(config);
    return { quota };
  } catch (error) {
    if (error instanceof AgentError && error.status === 400) {
      return { quota: null };
    }
    const message =
      error instanceof AgentError
        ? error.message
        : "The publishing quota could not be read.";
    return { quota: null, quotaError: message };
  }
}

export async function assertWithinQuota(config: InstagramConfig) {
  try {
    const quota = await readPublishingQuota(config);
    if (quota.usage >= quota.total) {
      throw new AgentError(
        `This account has used ${quota.usage} of ${quota.total} API publishes in the current 24-hour window.`,
        429,
      );
    }
  } catch (error) {
    if (error instanceof AgentError && (error.status === 429 || error.status === 400)) {
      throw error;
    }
    // A quota lookup failure should not block a publish the account may still have room for.
  }
}

export async function preparePublish(draft: PostDraft): Promise<void> {
  const config = requireInstagramConfig();
  assertImages(draft);
  assertPublishableCaption(draft.caption, draft.hashtags);
  await assertWithinQuota(config);
}

export async function publishApprovedDraft(draft: PostDraft): Promise<{
  instagramMediaId: string;
  permalink?: string;
}> {
  const config = requireInstagramConfig();
  const caption = assertPublishableCaption(draft.caption, draft.hashtags);

  const instagramMediaId =
    draft.format === "carousel"
      ? await publishCarousel(config, draft, caption)
      : await publishSingle(config, draft, caption);

  let permalink: string | undefined;
  try {
    permalink = await readPermalink(config, instagramMediaId);
  } catch {
    permalink = undefined;
  }
  return { instagramMediaId, permalink };
}
