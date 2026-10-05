"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { deleteStoredImage, setImageStorageQuota } from "@/lib/item-images";

function refreshImages() {
  revalidatePath("/list");
  revalidatePath("/archive");
  revalidatePath("/admin/images");
}

export async function deleteImageAction(id: string): Promise<{ error?: string }> {
  await requireAdmin();
  try { deleteStoredImage(id); refreshImages(); return {}; }
  catch { return { error: "Could not remove the image. Please try again." }; }
}

export async function updateImageQuotaAction(bytes: number): Promise<{ error?: string }> {
  await requireAdmin();
  try { setImageStorageQuota(bytes); refreshImages(); return {}; }
  catch { return { error: "Could not save the storage limit. Choose a value between 100 MB and 10 GB." }; }
}
