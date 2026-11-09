import { readFile } from "fs/promises";
import { NextResponse } from "next/server";

import { getImageFile } from "@/lib/library/content";
import { AgentError } from "@/types/agent";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const file = getImageFile(id);
    if (!file) {
      return NextResponse.json(
        { error: "That image is not in the library." },
        { status: 404 },
      );
    }

    const bytes = await readFile(file.absolutePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    if (error instanceof AgentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "The image library could not be read." },
      { status: 500 },
    );
  }
}
