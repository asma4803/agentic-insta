import { runPostAgent } from "@/lib/agent/postAgent";
import { getAIProvider } from "@/lib/ai/provider";
import { validateDraftRequest } from "@/lib/validation";
import { AgentError, type DraftStreamEvent } from "@/types/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let input: ReturnType<typeof validateDraftRequest>;
  try {
    input = validateDraftRequest(await request.json());
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorResponse("The draft request was not valid JSON.", 400);
    }
    return errorResponse("Choose a mood and a post format, then try again.", 400);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: DraftStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const draft = await runPostAgent(input, getAIProvider(), send);
        send({ type: "draft", draft });
      } catch (error) {
        const message =
          error instanceof AgentError
            ? error.message
            : "Something went wrong while drafting the post. Please try again.";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
