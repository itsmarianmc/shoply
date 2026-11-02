"use client";

import { addLocal, completeLocal, editLocal, localSuggestions, mutateLocal } from "./client";
import type { SyncItem } from "./types";

export const addItemAction = addLocal;
export const suggestItemsAction = async (prefix: string) => localSuggestions(prefix);
export const checkItemAction = async (id: number) => mutateLocal(id, "check");
export const uncheckItemAction = async (id: number) => { await mutateLocal(id, "uncheck"); };
export const undoCheckItemAction = async (id: number) => mutateLocal(id, "undo");
export const deleteItemAction = async (id: number) => { await mutateLocal(id, "delete"); };
export const restoreItemAction = async (id: number) => { await mutateLocal(id, "restore"); };
export const completeShoppingAction = completeLocal;
export const updateItemAction = async (_previous: unknown, form: FormData, baseline?: SyncItem) => editLocal(form, baseline);
export const moveItemAction = async (form: FormData) => {
  await mutateLocal(Number(form.get("itemId")), "edit", { patch: { category_id: Number(form.get("categoryId")) } });
};
export const rememberCategoryAction = async (form: FormData) => { await moveItemAction(form); return { success: true, error: undefined }; };
