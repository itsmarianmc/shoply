"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requireAdmin, destroySession } from "@/lib/auth";
import {
  addItemWithMerge,
  checkItem,
  uncheckItem,
  completeShopping,
  deleteItem,
  updateItem,
  undoCheckItem,
  getAutocompleteSuggestions,
} from "@/lib/items";
import { moveItemToCategory, getAllCategories } from "@/lib/categories";
import { getRevision } from "@/lib/revision";
import { assertPositiveSafeId, validateItemFields } from "@/lib/validation";
import { sendShoppingSessionStartedNotification } from "@/lib/push";

export async function addItemAction(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const user = await requireUser();
  try {
    const fields = validateItemFields(formData.get("name"), {
      quantity: formData.get("quantity"), unit: formData.get("unit"), note: formData.get("note"),
    });
    addItemWithMerge(fields.name, user.id, fields, user.role === "ADMIN");
    revalidatePath("/list");
    revalidatePath("/admin");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the item." };
  }
}

export async function checkItemAction(itemId: number): Promise<boolean> {
  const user = await requireUser();
  const result = checkItem(assertPositiveSafeId(itemId, "Item ID"), user.id);
  if (!result) return false;
  if (result.sessionStarted && result.sessionId !== null) {
    try {
      await sendShoppingSessionStartedNotification(user.id, result.sessionId);
    } catch {
      console.error("Web Push session notification failed", { sessionId: result.sessionId });
    }
  }
  revalidatePath("/list");
  revalidatePath("/archive");
  return true;
}

export async function uncheckItemAction(itemId: number): Promise<void> {
  await requireUser();
  uncheckItem(assertPositiveSafeId(itemId, "Item ID"));
  revalidatePath("/list");
}

export async function undoCheckItemAction(itemId: number): Promise<boolean> {
  await requireUser();
  const changed = undoCheckItem(assertPositiveSafeId(itemId, "Item ID"));
  if (!changed) return false;
  revalidatePath("/list");
  revalidatePath("/archive");
  return true;
}

export async function moveItemAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const itemId = assertPositiveSafeId(formData.get("itemId"), "Item ID");
  const categoryId = assertPositiveSafeId(formData.get("categoryId"), "Category ID");
  moveItemToCategory(itemId, categoryId);
  revalidatePath("/list");
}


export async function updateItemAction(
  _prev: { error?: string; success?: boolean },
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  await requireUser();
  try {
    const itemId = assertPositiveSafeId(formData.get("itemId"), "Item ID");
    const fields = validateItemFields("valid", {
      quantity: formData.get("quantity"), unit: formData.get("unit"), note: formData.get("note"),
    });
    updateItem(itemId, fields);
    revalidatePath("/list");
    revalidatePath("/archive");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}


export async function rememberCategoryAction(
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  await requireAdmin();
  const itemId = assertPositiveSafeId(formData.get("itemId"), "Item ID");
  const categoryId = assertPositiveSafeId(formData.get("categoryId"), "Category ID");

  const category = getAllCategories().find((c) => c.id === categoryId);
  if (!category) return { error: "Category not found." };

  moveItemToCategory(itemId, categoryId);
  revalidatePath("/list");
  return { success: true };
}

export async function deleteItemAction(itemId: number): Promise<void> {
  await requireUser();
  deleteItem(assertPositiveSafeId(itemId, "Item ID"));
  revalidatePath("/list");
  revalidatePath("/archive");
}


export async function completeShoppingAction(): Promise<number> {
  const user = await requireUser();
  const count = completeShopping(user.id);
  revalidatePath("/list");
  revalidatePath("/archive");
  return count;
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}


export async function suggestItemsAction(
  prefix: string
): Promise<
  Array<{
    display_name: string;
    category_name: string;
    default_quantity: number | null;
    default_unit: string | null;
  }>
> {
  const user = await requireUser();
  return getAutocompleteSuggestions(prefix, 8, user.role !== "ADMIN");
}


export async function getRevisionAction(): Promise<number> {
  await requireUser();
  return getRevision();
}
