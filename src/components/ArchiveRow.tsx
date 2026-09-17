"use client";

import { useState, useTransition } from "react";
import { restoreItemAction } from "@/app/archive/actions";
import type { ItemWithNames } from "@/lib/types";
import { displayUnit } from "@/lib/presentation";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : `${iso}Z`);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ArchiveRow({ item }: { item: ItemWithNames }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRestore() {
    setError(null);
    startTransition(async () => {
      try { await restoreItemAction(item.id); }
      catch { setError("Could not restore the item. Please try again."); }
    });
  }

  const quantityDisplay =
    item.quantity != null
      ? ` ${item.quantity}${item.unit ? " " + displayUnit(item.unit) : "×"}`
      : "";

  return (
    <div className="spl-row">
      <div className="spl-row-body">
        <span
          className="spl-item-name"
          style={{ textDecoration: "line-through", color: "var(--spl-text-faint)" }}
        >
          {item.name}{quantityDisplay}
        </span>
        {item.note && (
          <span className="spl-item-note">{item.note}</span>
        )}
        <span className="spl-item-meta">
          {item.added_by_name && `+ ${item.added_by_name}`}
          {item.checked_by_name && ` · ✓ ${item.checked_by_name}`}
          {item.archived_at && ` · ${formatDate(item.archived_at)}`}
        </span>
      </div>
      {error && <span role="alert" className="spl-error">{error}</span>}

      <div className="spl-row-actions">
        <button
          type="button"
          className="spl-btn spl-btn-secondary spl-btn-sm spl-btn-icon-only"
          onClick={handleRestore}
          disabled={isPending}
          aria-label={`Restore "${item.name}"`}
          title="Restore"
        >
          <i className="fa-solid fa-rotate-left" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
