import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { addItem, getItemById } from "@/lib/items";
import { getRevision } from "@/lib/revision";
import type { PublicUser } from "@/lib/types";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn(), requireAdmin: vi.fn(), destroySession: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { requireUser, requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { rememberCategoryAction, updateItemAction } from "@/app/list/actions";

let owner: PublicUser;
let other: PublicUser;
let admin: PublicUser;
let itemId: number;

function createUser(name: string, role: PublicUser["role"]): PublicUser {
  const id = Number(db.prepare("INSERT INTO users (name, role, password_hash) VALUES (?, ?, 'x')")
    .run(name, role).lastInsertRowid);
  return { id, name, role };
}

function saveData(name?: string): FormData {
  const data = new FormData();
  data.set("itemId", String(itemId));
  data.set("quantity", "2");
  data.set("unit", "kg");
  data.set("note", "keep note");
  if (name !== undefined) data.set("name", name);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  db.exec("DELETE FROM items; DELETE FROM item_images; DELETE FROM shopping_sessions; DELETE FROM item_history; DELETE FROM users;");
  owner = createUser("owner", "MEMBER");
  other = createUser("other", "MEMBER");
  admin = createUser("admin", "ADMIN");
  addItem("Original", owner.id, { quantity: 2, unit: "kg", note: "keep note" });
  itemId = (db.prepare("SELECT id FROM items ORDER BY id DESC LIMIT 1").get() as { id: number }).id;
  vi.mocked(requireUser).mockResolvedValue(owner);
  vi.mocked(requireAdmin).mockRejectedValue(new Error("NUR_ADMIN_ERLAUBT"));
});

describe("updateItemAction name permissions", () => {
  it("lets a member rename their own item, trims the name and revalidates both pages", async () => {
    const before = getItemById(itemId)!;
    expect(await updateItemAction({}, saveData("  New name  "))).toEqual({ success: true });
    expect(getItemById(itemId)).toEqual({ ...before, name: "New name" });
    expect(revalidatePath).toHaveBeenCalledWith("/list");
    expect(revalidatePath).toHaveBeenCalledWith("/archive");
  });

  it.each(["foreign", "unowned"])("rejects a member's forged rename of a %s item without saving any fields", async (kind) => {
    vi.mocked(requireUser).mockResolvedValue(other);
    if (kind === "unowned") db.prepare("UPDATE items SET added_by_user_id = NULL WHERE id = ?").run(itemId);
    const before = getItemById(itemId);
    const revisionBefore = getRevision();
    const data = saveData("Forbidden");
    data.set("quantity", "99");
    data.set("unit", "l");
    data.set("note", "must not save");
    data.set("role", "ADMIN");
    data.set("isAdmin", "true");
    data.set("added_by_user_id", String(other.id));

    expect(await updateItemAction({}, data)).toEqual({ error: "You can only rename items you added." });
    expect(getItemById(itemId)).toEqual(before);
    expect(getRevision()).toBe(revisionBefore);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["foreign", "unowned"])("lets an admin rename a %s item", async (kind) => {
    vi.mocked(requireUser).mockResolvedValue(admin);
    if (kind === "unowned") db.prepare("UPDATE items SET added_by_user_id = NULL WHERE id = ?").run(itemId);
    const before = getItemById(itemId)!;

    expect(await updateItemAction({}, saveData("Admin name"))).toEqual({ success: true });
    expect(getItemById(itemId)).toEqual({ ...before, name: "Admin name" });
  });

  it.each(["foreign", "unowned"])("still lets a member update quantity, unit and note on a %s item without a name", async (kind) => {
    vi.mocked(requireUser).mockResolvedValue(other);
    if (kind === "unowned") db.prepare("UPDATE items SET added_by_user_id = NULL WHERE id = ?").run(itemId);
    const before = getItemById(itemId)!;
    const data = saveData();
    data.set("quantity", "3");
    data.set("unit", "piece");
    data.set("note", "changed note");

    expect(await updateItemAction({}, data)).toEqual({ success: true });
    expect(getItemById(itemId)).toEqual({ ...before, quantity: 3, unit: "piece", note: "changed note" });
  });

  it("does not restrict other fields when the submitted name stays the same", async () => {
    vi.mocked(requireUser).mockResolvedValue(other);
    const data = saveData("  Original  ");
    data.set("quantity", "4");

    expect(await updateItemAction({}, data)).toEqual({ success: true });
    expect(getItemById(itemId)).toMatchObject({ name: "Original", quantity: 4 });
  });

  it.each(["", "   ", "x".repeat(201)])("rejects invalid names without saving other fields", async (name) => {
    const before = getItemById(itemId);
    const data = saveData(name);
    data.set("quantity", "99");

    expect(await updateItemAction({}, data)).toHaveProperty("error");
    expect(getItemById(itemId)).toEqual(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts a name of exactly 200 characters after trimming", async () => {
    expect(await updateItemAction({}, saveData(`  ${"x".repeat(200)}  `))).toEqual({ success: true });
    expect(getItemById(itemId)?.name).toBe("x".repeat(200));
  });

  it("requires a session before updating anything", async () => {
    vi.mocked(requireUser).mockRejectedValue(new Error("NICHT_ANGEMELDET"));
    const before = getItemById(itemId);

    await expect(updateItemAction({}, saveData("Unauthenticated"))).rejects.toThrow("NICHT_ANGEMELDET");
    expect(getItemById(itemId)).toEqual(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps category changes admin-only even for an item's owner", async () => {
    const before = getItemById(itemId);
    const data = saveData();
    data.set("categoryId", String(before!.category_id));

    await expect(rememberCategoryAction(data)).rejects.toThrow("NUR_ADMIN_ERLAUBT");
    expect(getItemById(itemId)).toEqual(before);
  });
});
