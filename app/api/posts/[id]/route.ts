import { agentErrorResponse, jsonError } from "@/lib/http";
import { getPost, updatePost } from "@/lib/posts/store";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const post = await getPost(id);
    if (!post) return jsonError("That draft is no longer saved.", 404);
    return Response.json({ post });
  } catch (error) {
    return agentErrorResponse(error, "The draft could not be read.");
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("The edit was not valid JSON.", 400);
  }

  try {
    const { id } = await context.params;
    const post = await updatePost(id, body);
    return Response.json({ post });
  } catch (error) {
    return agentErrorResponse(error, "The draft could not be updated.");
  }
}
