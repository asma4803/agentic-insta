import { agentErrorResponse, jsonError } from "@/lib/http";
import { validateIncomingDraft } from "@/lib/posts/edits";
import { createPost } from "@/lib/posts/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("The draft was not valid JSON.", 400);
  }

  const record =
    body && typeof body === "object" && "draft" in body
      ? (body as { draft: unknown }).draft
      : body;

  try {
    const draft = validateIncomingDraft(record);
    const post = await createPost(draft);
    return Response.json({ post });
  } catch (error) {
    return agentErrorResponse(error, "The draft could not be saved.");
  }
}
