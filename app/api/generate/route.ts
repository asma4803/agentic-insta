import { NextResponse } from "next/server";

import { runCaptionAgent } from "@/lib/agent/captionAgent";
import {
  isAllowedImageType,
  isCaptionDirection,
  isCaptionStyle,
  MAX_IMAGE_BYTES,
  normalizeMimeType,
} from "@/lib/validation";
import { AgentError, type CaptionDirection, type CaptionStyle } from "@/types/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = normalizeMimeType(file.type || "application/octet-stream");
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");
    const contextRaw = formData.get("context");
    const styleRaw = formData.get("style");
    const directionRaw = formData.get("direction");

    if (!(image instanceof File) || image.size === 0) {
      return errorResponse("Please upload a photograph to continue.", 400);
    }

    const mime = normalizeMimeType(image.type);
    if (!isAllowedImageType(mime)) {
      return errorResponse(
        "Unsupported image type. Please use JPG, JPEG, PNG, or WEBP.",
        400,
      );
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return errorResponse(
        "That image is too large. Please use a file under 4 MB.",
        400,
      );
    }

    if (typeof styleRaw !== "string" || !isCaptionStyle(styleRaw)) {
      return errorResponse("Please choose a valid caption style.", 400);
    }

    if (typeof directionRaw !== "string" || !isCaptionDirection(directionRaw)) {
      return errorResponse("Please choose a valid caption direction.", 400);
    }

    const context =
      typeof contextRaw === "string" ? contextRaw.trim().slice(0, 2000) : "";

    const imageDataUrl = await fileToDataUrl(image);

    const result = await runCaptionAgent({
      imageDataUrl,
      context,
      style: styleRaw as CaptionStyle,
      direction: directionRaw as CaptionDirection,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AgentError) {
      return errorResponse(error.message, error.status);
    }

    return errorResponse(
      "Something went wrong while generating captions. Please try again.",
      500,
    );
  }
}
