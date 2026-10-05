"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  createCategory,
  renameCategory,
  deleteCategory,
} from "@/lib/categories";
import { createUser, deleteUser, resetPassword } from "@/lib/users";
import { setCheckedItemBehavior, setShoppingScanLanguage } from "@/lib/settings";
import { isShoppingScanLanguageCode } from "@/lib/shopping-scan-languages";
import type { CheckedItemBehavior, Role } from "@/lib/types";
import { assertPositiveSafeId } from "@/lib/validation";

const PASSWORD_LENGTH = Number(process.env.PASSWORD_LENGTH || 64);

export interface AdminActionState {
  error?: string;
  success?: string;
  revealedPassword?: string;
  revealedFor?: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}


export async function createCategoryAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireAdmin();
  try {
    createCategory(String(formData.get("name") ?? ""));
    revalidatePath("/admin");
    revalidatePath("/list");
    return { success: "Category created." };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function renameCategoryAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireAdmin();
  try {
    const id = assertPositiveSafeId(formData.get("categoryId"), "Category ID");
    renameCategory(id, String(formData.get("name") ?? ""));
    revalidatePath("/admin");
    revalidatePath("/list");
    return { success: "Category renamed." };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  await requireAdmin();
    const id = assertPositiveSafeId(formData.get("categoryId"), "Category ID");
  deleteCategory(id);
  revalidatePath("/admin");
  revalidatePath("/list");
}


export async function createUserAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "");
  const role = String(formData.get("role") ?? "MEMBER") as Role;

  try {
    const { password } = await createUser(name, role, PASSWORD_LENGTH);
    revalidatePath("/admin");
    revalidatePath("/login");
    return { revealedPassword: password, revealedFor: name };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function resetPasswordAction(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const userId = assertPositiveSafeId(formData.get("userId"), "User ID");
  const name = String(formData.get("userName") ?? "");

  try {
    const password = await resetPassword(userId, PASSWORD_LENGTH, admin.id);
    return { revealedPassword: password, revealedFor: name };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export async function deleteUserAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = assertPositiveSafeId(formData.get("userId"), "User ID");
  deleteUser(userId, admin.id);
  revalidatePath("/admin");
  revalidatePath("/login");
}


export async function updateSettingAction(formData: FormData): Promise<void> {
  await requireAdmin();
  if (formData.has("shopping_scan_language")) {
    const language = formData.get("shopping_scan_language");
    if (!isShoppingScanLanguageCode(language)) {
      throw new Error("Unsupported shopping-list recognition language.");
    }
    setShoppingScanLanguage(language);
    revalidatePath("/admin");
    return;
  }

  const value = formData.get("checked_item_behavior") ? "ARCHIVE" : "KEEP_IN_LIST";
  setCheckedItemBehavior(value as CheckedItemBehavior);
  revalidatePath("/admin");
}
