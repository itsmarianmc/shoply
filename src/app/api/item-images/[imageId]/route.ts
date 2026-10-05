import { requireUser } from "@/lib/auth";
import { readStoredImage } from "@/lib/item-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, context: { params: Promise<{ imageId: string }> }) {
  let user;
  try { user = await requireUser(); }
  catch { return new Response(null, { status: 401, headers }); }
  try {
    const { imageId } = await context.params;
    const image = readStoredImage(imageId, user.role === "ADMIN");
    if (!image) return new Response(null, { status: 404, headers });
    return new Response(new Uint8Array(image), { headers: {
      ...headers, "Content-Type": "image/webp", "Content-Length": String(image.length),
    } });
  } catch { return new Response(null, { status: 503, headers }); }
}
