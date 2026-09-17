"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { restoreItem } from "@/lib/items";
import { assertPositiveSafeId } from "@/lib/validation";

export async function restoreItemAction(itemId: number): Promise<void> {
  await requireUser();
  restoreItem(assertPositiveSafeId(itemId, "Item ID"));
  revalidatePath("/archive");
  revalidatePath("/list");
}
