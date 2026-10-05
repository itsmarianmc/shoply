import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { assertPositiveSafeId } from "@/lib/validation";
import { uploadItemImage, getImageStorageUsage, ImageError } from "@/lib/item-images";
import { MAX_IMAGE_BYTES } from "@/lib/image-policy";

export const runtime = "nodejs";
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

async function boundedFormData(request: Request): Promise<FormData> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new ImageError("Choose an image of 10 MB or smaller.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ImageError("Please choose an image file.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ImageError("Choose an image of 10 MB or smaller.", 413);
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks, total);
    return await new Response(body, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
  } catch (error) {
    if (error instanceof ImageError) throw error;
    throw new ImageError("Please choose a valid image file.");
  } finally { reader.releaseLock(); }
}

export async function POST(request: Request) {
  try { await requireUser(); }
  catch { return NextResponse.json({ error: "Please sign in to upload images." }, { status: 401 }); }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid upload origin." }, { status: 403 });
  }
  try {
    const data = await boundedFormData(request);
    let itemId: number;
    try { itemId = assertPositiveSafeId(data.get("itemId"), "Item ID"); }
    catch { throw new ImageError("Invalid item ID."); }
    const file = data.get("image");
    if (!(file instanceof File)) throw new ImageError("Please choose an image file.");
    if (file.size > MAX_IMAGE_BYTES) throw new ImageError("Choose an image of 10 MB or smaller.", 413);
    const imageId = await uploadItemImage(itemId, new Uint8Array(await file.arrayBuffer()));
    revalidatePath("/list");
    revalidatePath("/admin/images");
    return NextResponse.json({ imageId, usage: getImageStorageUsage() });
  } catch (error) {
    if (error instanceof ImageError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not upload the image. Please try again." }, { status: 500 });
  }
}
