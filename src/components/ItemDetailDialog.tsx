"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  updateItemAction,
  deleteItemAction,
  rememberCategoryAction,
} from "@/app/list/actions";
import { VALID_UNITS } from "@/lib/types";
import type { Category, ItemWithNames } from "@/lib/types";
import { displayCategoryName, displayUnit } from "@/lib/presentation";

interface Props {
  item: ItemWithNames;
  categories: Category[];
  isAdmin: boolean;
  onClose: () => void;
}

export default function ItemDetailDialog({
  item,
  categories,
  isAdmin,
  onClose,
}: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [quantity, setQuantity] = useState(item.quantity?.toString() ?? "");
  const [unit, setUnit] = useState(item.unit ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [categoryId, setCategoryId] = useState(item.category_id);
  const [state, setState] = useState<{ error?: string; success?: boolean }>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    (firstInputRef.current ?? sheetRef.current)?.focus();
    return () => {
      const target = previouslyFocusedRef.current;
      if (target && document.contains(target)) target.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && sheetRef.current) {
        const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ));
        if (focusable.length === 0) { e.preventDefault(); sheetRef.current.focus(); return; }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  function handleSave() {
    const quantityNum = quantity === "" ? null : Number(quantity);
    if (quantityNum !== null && (!Number.isFinite(quantityNum) || quantityNum <= 0)) {
      setState({ error: "Quantity must be a positive number." });
      return;
    }

    setState({});
    startTransition(async () => {
      try {
      const fd = new FormData();
      fd.set("itemId", String(item.id));
      if (quantityNum !== null) fd.set("quantity", String(quantityNum));
      if (unit) fd.set("unit", unit);
      if (note) fd.set("note", note);

      const result = await updateItemAction({}, fd);
      if (result.error) {
        setState({ error: result.error });
        return;
      }

      if (isAdmin && categoryId !== item.category_id) {
        const catFd = new FormData();
        catFd.set("itemId", String(item.id));
        catFd.set("categoryId", String(categoryId));
        const categoryResult = await rememberCategoryAction(catFd);
        if (categoryResult.error) { setState({ error: categoryResult.error }); return; }
      }

      setState({ success: true });
      setTimeout(onClose, 250);
      } catch {
        setState({ error: "Could not save changes. Please try again." });
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try { await deleteItemAction(item.id); onClose(); }
      catch { setState({ error: "Could not delete the item. Please try again." }); }
    });
  }

  const metaParts = [
    item.added_by_name ? `+ ${item.added_by_name}` : null,
    item.checked_by_name ? `✓ ${item.checked_by_name}` : null,
  ].filter((p): p is string => p !== null);

  const canDelete = item.status === "CHECKED" || item.archived === 1;
  const currentCategory = categories.find((c) => c.id === item.category_id);

  return (
    <div
      className="spl-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={sheetRef}
        className="spl-sheet"
        role="dialog"
        aria-labelledby={`detail-title-${item.id}`}
        aria-modal="true"
        tabIndex={-1}
      >
        <div className="spl-sheet-header">
          <h2 id={`detail-title-${item.id}`} className="spl-sheet-title">
            {item.name}
          </h2>
          <button
            type="button"
            className="spl-icon-btn spl-icon-btn-sm"
            onClick={onClose}
            aria-label="Close"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        {state.error && (
          <div className="spl-error" role="alert">
            {state.error}
          </div>
        )}

        <div className="spl-sheet-body">
          <label className="spl-detail-label">
            <span className="spl-detail-label-text">Quantity</span>
            <input
              ref={firstInputRef}
              type="number"
              min="0"
              step="any"
              placeholder="-"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="spl-input spl-input-sm"
            />
          </label>

          <label className="spl-detail-label">
            <span className="spl-detail-label-text">Unit</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="spl-input spl-input-sm select"
            >
              <option value="">-</option>
              {VALID_UNITS.map((u) => (
                <option key={u} value={u}>
                  {displayUnit(u)}
                </option>
              ))}
            </select>
          </label>

          <label className="spl-detail-label">
            <span className="spl-detail-label-text">Note</span>
            <input
              type="text"
              placeholder="Optional"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="spl-input spl-input-sm"
            />
          </label>

          {isAdmin ? (
            <label className="spl-detail-label">
              <span className="spl-detail-label-text">Category</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="spl-input spl-input-sm select"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {displayCategoryName(c.name)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            currentCategory && (
              <div className="spl-detail-label">
                <span className="spl-detail-label-text">Category</span>
                <span className="spl-detail-value">{displayCategoryName(currentCategory.name)}</span>
              </div>
            )
          )}

          {metaParts.length > 0 && (
            <div className="spl-detail-meta">{metaParts.join(" · ")}</div>
          )}
        </div>

        <div className="spl-sheet-footer">
          {canDelete && (
            <button
              type="button"
              className="spl-btn spl-btn-danger spl-btn-sm"
              onClick={handleDelete}
              disabled={isPending}
            >
              <i className="fa-solid fa-trash" aria-hidden="true" />
              Delete item
            </button>
          )}
          <button
            type="button"
            className="spl-btn spl-btn-primary spl-btn-sm"
            onClick={handleSave}
            disabled={isPending}
          >
            {state.success ? "✓ Saved" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
