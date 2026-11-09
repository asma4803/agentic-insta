import { AgentError, type InstagramConnection } from "@/types/agent";

const DEFAULT_GRAPH_VERSION = "v23.0";

export interface InstagramConfig {
  userId: string;
  accessToken: string;
  publicBaseUrl: string;
  graphVersion: string;
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function publicBaseUrlError(value: string): string | null {
  if (!value) {
    return "Set PUBLIC_BASE_URL to a public https origin that serves this app. Instagram cannot fetch localhost.";
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "PUBLIC_BASE_URL must be an https URL, such as https://your-host.example.";
  }
  const host = url.hostname.toLowerCase();
  const local =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local");
  if (url.protocol !== "https:" || local) {
    return "PUBLIC_BASE_URL must be a public https origin. Instagram cannot fetch localhost.";
  }
  return null;
}

export function readInstagramConnection(): {
  config: InstagramConfig | null;
  connection: InstagramConnection;
} {
  const missing: string[] = [];
  const userId = clean(process.env.IG_USER_ID);
  const accessToken = clean(process.env.IG_ACCESS_TOKEN);
  const publicBaseUrl = clean(process.env.PUBLIC_BASE_URL).replace(/\/$/, "");
  const graphVersion = clean(process.env.META_GRAPH_VERSION) || DEFAULT_GRAPH_VERSION;

  if (!userId) missing.push("Set IG_USER_ID to the Instagram professional account id.");
  if (!accessToken) {
    missing.push("Set IG_ACCESS_TOKEN to a long-lived Instagram user token.");
  }
  const baseError = publicBaseUrlError(publicBaseUrl);
  if (baseError) missing.push(baseError);

  if (missing.length > 0) {
    return {
      config: null,
      connection: { ready: false, missing, quota: null },
    };
  }

  return {
    config: { userId, accessToken, publicBaseUrl, graphVersion },
    connection: { ready: true, missing: [], quota: null },
  };
}

export function requireInstagramConfig(): InstagramConfig {
  const { config, connection } = readInstagramConnection();
  if (!config) {
    throw new AgentError(connection.missing.join(" "), 400);
  }
  return config;
}

export function imagePublicUrl(config: InstagramConfig, imageId: string): string {
  return `${config.publicBaseUrl}/api/library/images/${encodeURIComponent(imageId)}`;
}

export function graphUrl(config: InstagramConfig, path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `https://graph.instagram.com/${config.graphVersion}${suffix}`;
}
