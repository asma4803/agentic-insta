import { agentErrorResponse, jsonError } from "@/lib/http";
import { approvePost, getPost } from "@/lib/posts/store";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const existing = await getPost(id);
    if (!existing) return jsonError("That draft is no longer saved.", 404);
    const post = await approvePost(id);
    return Response.json({ post });
  } catch (error) {
    return agentErrorResponse(error, "The draft could not be approved.");
  }
}
