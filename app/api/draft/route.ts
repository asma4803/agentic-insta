import { NextResponse } from "next/server";

import { runPostAgent } from "@/lib/agent/postAgent";
import { validateDraftRequest } from "@/lib/validation";
import { AgentError } from "@/types/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const input = validateDraftRequest(body);
    const draft = await runPostAgent(input);
    return NextResponse.json(draft);
  } catch (error) {
    if (error instanceof AgentError) {
      return errorResponse(error.message, error.status);
    }

    if (
      error instanceof Error &&
      (error.message === "invalid_request" || error.message.startsWith("invalid_field:"))
    ) {
      return errorResponse("Choose a mood and a post format, then try again.", 400);
    }

    if (error instanceof SyntaxError) {
      return errorResponse("The draft request was not valid JSON.", 400);
    }

    return errorResponse(
      "Something went wrong while drafting the post. Please try again.",
      500,
    );
  }
}
