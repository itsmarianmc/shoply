import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { db } from "@/lib/db";
import { addItem, getItemById } from "@/lib/items";
import { getImageStorageUsage, maintainImageStorage, uploadItemImage } from "@/lib/item-images";
import { MAX_IMAGE_BYTES } from "@/lib/image-policy";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { requireUser, requireAdmin } from "@/lib/auth";
import { POST } from "@/app/api/item-images/route";
import { GET } from "@/app/api/item-images/[imageId]/route";
import { deleteImageAction, updateImageQuotaAction } from "@/app/admin/images/actions";

let itemId: number;
let sample: Buffer;

beforeEach(async () => {
  vi.resetAllMocks();
  db.exec("DELETE FROM items; DELETE FROM item_images; DELETE FROM users;");
  maintainImageStorage();
  const userId = Number(db.prepare("INSERT INTO users (name, role, password_hash) VALUES ('member', 'MEMBER', 'x')").run().lastInsertRowid);
  vi.mocked(requireUser).mockResolvedValue({ id: userId, name: "member", role: "MEMBER" });
  vi.mocked(requireAdmin).mockRejectedValue(new Error("NUR_ADMIN_ERLAUBT"));
  addItem("Bread", userId);
  itemId = (db.prepare("SELECT id FROM items ORDER BY id DESC LIMIT 1").get() as { id: number }).id;
  sample = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).png().toBuffer();
});

function uploadRequest(data?: FormData, headers?: HeadersInit): Request {
  const form = data ?? new FormData();
  if (!data) {
    form.set("itemId", String(itemId));
    // Neither the filename nor the declared MIME type determines image validity.
    form.set("image", new File([new Uint8Array(sample)], "../../bread.exe", { type: "application/octet-stream" }));
  }
  return new Request("http://localhost/api/item-images", { method: "POST", headers, body: form });
}

const context = (imageId: string) => ({ params: Promise.resolve({ imageId }) });

describe("image routes and admin actions", () => {
  it("requires a session for uploads and image reads", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("NICHT_ANGEMELDET"));
    const upload = await POST(uploadRequest());
    expect(upload.status).toBe(401);
    expect((await GET(new Request("http://localhost"), context("anything"))).status).toBe(401);
    expect(getImageStorageUsage().fileCount).toBe(0);
  });

  it("lets a member upload, replace and read an actual image, with no public caching", async () => {
    const response = await POST(uploadRequest());
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.usage.fileCount).toBe(1);
    expect(getItemById(itemId)?.image_id).toBe(result.imageId);
    const read = await GET(new Request("http://localhost"), context(result.imageId));
    expect(read.status).toBe(200);
    expect(read.headers.get("content-type")).toBe("image/webp");
    expect(read.headers.get("cache-control")).toBe("private, no-store");
    const next = await POST(uploadRequest());
    expect(next.status).toBe(200);
    expect((await GET(new Request("http://localhost"), context(result.imageId))).status).toBe(404);
    expect(getImageStorageUsage().fileCount).toBe(1);
  });

  it("blocks cross-origin browser uploads", async () => {
    expect((await POST(uploadRequest(undefined, { origin: "https://attacker.example" }))).status).toBe(403);
    expect(getImageStorageUsage().fileCount).toBe(0);
  });

  it("bounds the entire multipart body even without Content-Length", async () => {
    const request = new Request("http://localhost/api/item-images", {
      method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" },
      body: new Uint8Array(MAX_IMAGE_BYTES + 64 * 1024 + 1),
    });
    expect(request.headers.has("content-length")).toBe(false);
    expect((await POST(request)).status).toBe(413);
    expect((await POST(uploadRequest(undefined, { "Content-Length": String(MAX_IMAGE_BYTES + 100_000) }))).status).toBe(413);
  });

  it("rejects invalid IDs, fake image content and path traversal", async () => {
    const form = new FormData();
    form.set("itemId", "../1");
    expect((await POST(uploadRequest(form))).status).toBe(400);
    form.set("itemId", String(itemId));
    form.set("image", new File(["not an image"], "bread.png", { type: "image/png" }));
    expect((await POST(uploadRequest(form))).status).toBe(400);
    expect((await GET(new Request("http://localhost"), context("../../shoply.db"))).status).toBe(404);
  });

  it("denies member image deletion and quota changes on the server", async () => {
    const id = await uploadItemImage(itemId, sample);
    await expect(deleteImageAction(id)).rejects.toThrow("NUR_ADMIN");
    await expect(updateImageQuotaAction(100_000_000)).rejects.toThrow("NUR_ADMIN");
    expect(getItemById(itemId)?.image_id).toBe(id);
    expect(getImageStorageUsage().limitBytes).toBe(1_000_000_000);
  });

  it("lets admins delete and set quota without exposing filesystem errors", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ id: 10, name: "admin", role: "ADMIN" });
    const id = await uploadItemImage(itemId, sample);
    expect(await updateImageQuotaAction(100_000_000)).toEqual({});
    expect(getImageStorageUsage().limitBytes).toBe(100_000_000);
    expect(await deleteImageAction(id)).toEqual({});
    expect(getImageStorageUsage().fileCount).toBe(0);
    expect(await deleteImageAction("../../shoply.db")).toHaveProperty("error");
  });
});
