import { AgentError } from "@/types/agent";

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export function agentErrorResponse(error: unknown, fallback: string) {
  if (error instanceof AgentError) {
    return jsonError(error.message, error.status);
  }
  return jsonError(fallback, 500);
}
