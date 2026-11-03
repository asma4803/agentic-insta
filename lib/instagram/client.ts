import { graphUrl, type InstagramConfig } from "@/lib/instagram/config";
import { AgentError, type InstagramQuota } from "@/types/agent";

interface MetaErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
}

async function graphFetch(
  config: InstagramConfig,
  path: string,
  init?: { method?: "GET" | "POST"; body?: Record<string, string | boolean> },
): Promise<unknown> {
  const url = new URL(graphUrl(config, path));
  const method = init?.method ?? "GET";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.accessToken}`,
  };
  let body: string | undefined;
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init?.body ?? {});
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AgentError("Could not reach Instagram. Check the network and try again.", 502);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new AgentError(formatMetaError(payload, response.status), response.status === 429 ? 429 : 502);
  }
  return payload;
}

function formatMetaError(payload: unknown, status: number): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as MetaErrorBody).error;
    const message =
      error && typeof error.message === "string" && error.message.trim()
        ? error.message.trim()
        : "Instagram rejected the post.";
    if (typeof error?.code === "number") {
      const code =
        typeof error.error_subcode === "number"
          ? `${error.code}/${error.error_subcode}`
          : String(error.code);
      return `${message} (${code})`;
    }
    return message;
  }
  return `Instagram returned HTTP ${status}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function createMedia(
  config: InstagramConfig,
  fields: Record<string, string | boolean>,
): Promise<string> {
  const payload = await graphFetch(config, `/${config.userId}/media`, {
    method: "POST",
    body: fields,
  });
  if (!isRecord(payload) || typeof payload.id !== "string" || !payload.id) {
    throw new AgentError("Instagram did not return a media container id.", 502);
  }
  return payload.id;
}

export async function readContainer(
  config: InstagramConfig,
  containerId: string,
): Promise<{ statusCode: string; status: string }> {
  const payload = await graphFetch(
    config,
    `/${encodeURIComponent(containerId)}?fields=status_code,status`,
  );
  if (!isRecord(payload)) {
    throw new AgentError("Instagram returned an unreadable container status.", 502);
  }
  return {
    statusCode: typeof payload.status_code === "string" ? payload.status_code : "",
    status: typeof payload.status === "string" ? payload.status : "",
  };
}

export async function publishContainer(
  config: InstagramConfig,
  creationId: string,
): Promise<string> {
  const payload = await graphFetch(config, `/${config.userId}/media_publish`, {
    method: "POST",
    body: { creation_id: creationId },
  });
  if (!isRecord(payload) || typeof payload.id !== "string" || !payload.id) {
    throw new AgentError("Instagram did not return a published media id.", 502);
  }
  return payload.id;
}

export async function readPermalink(
  config: InstagramConfig,
  mediaId: string,
): Promise<string | undefined> {
  const payload = await graphFetch(
    config,
    `/${encodeURIComponent(mediaId)}?fields=permalink`,
  );
  if (!isRecord(payload) || typeof payload.permalink !== "string") return undefined;
  return payload.permalink;
}

export async function readPublishingQuota(
  config: InstagramConfig,
): Promise<InstagramQuota> {
  const payload = await graphFetch(
    config,
    `/${config.userId}/content_publishing_limit?fields=quota_usage,config`,
  );
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.data[0])) {
    throw new AgentError("Instagram did not return a publishing quota.", 502);
  }
  const entry = payload.data[0];
  const usage = entry.quota_usage;
  const quotaConfig = entry.config;
  const total =
    isRecord(quotaConfig) && typeof quotaConfig.quota_total === "number"
      ? quotaConfig.quota_total
      : null;
  if (typeof usage !== "number" || total === null) {
    throw new AgentError("Instagram returned an incomplete publishing quota.", 502);
  }
  return { usage, total };
}
