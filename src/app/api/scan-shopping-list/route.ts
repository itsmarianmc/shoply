import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  GeminiShoppingScanConfigurationError,
  scanShoppingListImage,
} from "@/lib/gemini-shopping-scan";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  try {
    await requireUser();
  } catch {
    return errorResponse("Please sign in to scan a shopping list.", 401);
  }

  let image: FormDataEntryValue | null;
  try {
    image = (await request.formData()).get("image");
  } catch {
    return errorResponse("Please choose a valid image file.", 400);
  }

  if (typeof File === "undefined" || !(image instanceof File)) {
    return errorResponse("Please choose an image file.", 400);
  }
  if (!ACCEPTED_IMAGE_TYPES.has(image.type)) {
    return errorResponse("Only JPEG, PNG, and WebP images can be scanned.", 400);
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return errorResponse("The image must be 10 MB or smaller.", 413);
  }

  try {
    const result = await scanShoppingListImage(
      new Uint8Array(await image.arrayBuffer()),
      image.type as "image/jpeg" | "image/png" | "image/webp"
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GeminiShoppingScanConfigurationError) {
      return errorResponse("Shopping-list scanning is not configured yet.", 503);
    }
    return errorResponse("The shopping list could not be scanned. Please try again.", 502);
  }
}
