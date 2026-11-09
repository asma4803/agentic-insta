import { agentErrorResponse, jsonError } from "@/lib/http";
import { preparePublish, publishApprovedDraft } from "@/lib/instagram/publish";
import { AgentError } from "@/types/agent";
import { getPost, markFailed, markPublished, markPublishing } from "@/lib/posts/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const existing = await getPost(id);
    if (!existing) return jsonError("That draft is no longer saved.", 404);
    if (existing.status === "publishing" || existing.status === "published") {
      return Response.json({ post: existing });
    }
    if (existing.status !== "approved" || !existing.approvedSnapshot) {
      return jsonError("Approve the draft before publishing it.", 409);
    }

    try {
      await preparePublish(existing.approvedSnapshot);
    } catch (error) {
      return agentErrorResponse(error, "This draft cannot be published yet.");
    }

    try {
      await markPublishing(id);
    } catch (error) {
      const current = await getPost(id);
      if (current?.status === "publishing" || current?.status === "published") {
        return Response.json({ post: current });
      }
      return agentErrorResponse(error, "Publishing could not be started.");
    }
  } catch (error) {
    return agentErrorResponse(error, "Publishing could not be started.");
  }

  try {
    const current = await getPost(id);
    const snapshot = current?.approvedSnapshot;
    if (!snapshot) {
      const post = await markFailed(id, "The approved draft was missing.");
      return Response.json(
        { error: "The approved draft was missing.", post },
        { status: 502 },
      );
    }

    const result = await publishApprovedDraft(snapshot);
    const post = await markPublished(id, result);
    return Response.json({ post });
  } catch (error) {
    const message =
      error instanceof AgentError
        ? error.message
        : "Instagram did not publish this post.";
    try {
      const post = await markFailed(id, message);
      return Response.json({ error: message, post }, { status: 502 });
    } catch (markError) {
      return agentErrorResponse(markError, message);
    }
  }
}
