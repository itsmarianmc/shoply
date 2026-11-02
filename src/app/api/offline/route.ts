import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { accountKeyFor } from "@/lib/offline/account";
import { applyOperation, getSnapshot, syncItem } from "@/lib/offline/server";
import { maintainImageStorage } from "@/lib/item-images";
import { sendShoppingSessionStartedNotification } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in again. Your pending changes are retained." }, 401);
  const snapshot = getSnapshot(user);
  return json(snapshot);
}

async function boundedJSON(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("Missing request body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 65536) { await reader.cancel(); throw new Error("Operation exceeds 64 KB."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("x-shoply-sync") !== "1" ||
    !request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Invalid request origin or protocol." }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "Sign in again. Your pending changes are retained." }, 401);
  let body: { accountKey?: string; operation?: unknown; protocol?: number; live?: boolean; mode?: string };
  try { body = await boundedJSON(request) as typeof body; }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid request." }, 400); }
  if (!body || body.protocol !== 1) return json({ error: "Update Shoply to synchronize this queue." }, 409);
  if (body.mode === "snapshot") return json(getSnapshot(user));
  if (body.accountKey !== accountKeyFor(user.id)) return json({ error: "These changes belong to a different account. Sign back into that account to recover them." }, 403);
  try {
    const { receipt, replay } = applyOperation(user, body.accountKey, body.operation, body.live === true);
    maintainImageStorage();
    // The durable session row records notification intent in the mutation's
    // transaction. Delivery is at most once, matching existing push semantics.
    if (!replay && receipt.notificationSessionId) {
      try { await sendShoppingSessionStartedNotification(user.id, receipt.notificationSessionId); }
      catch { console.error("Shopping notification delivery failed", { sessionId: receipt.notificationSessionId }); }
    }
    return json({ receipt, currentItem: receipt.serverId ? syncItem(receipt.serverId) : receipt.item });
  } catch (error) {
    if (typeof (error as { code?: unknown })?.code === "string" && (error as { code: string }).code.startsWith("SQLITE_")) {
      console.error("Sync transaction failed; the client will retry");
      return json({ error: "The server could not commit this change. It remains queued for retry." }, 503);
    }
    return json({ error: error instanceof Error ? error.message : "Could not synchronize." }, 400);
  }
}
