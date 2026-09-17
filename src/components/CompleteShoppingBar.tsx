"use client";

import { useState, useTransition } from "react";
import { completeShoppingAction } from "@/app/list/actions";

interface Props {
  checkedCount: number;
}

export default function CompleteShoppingBar({ checkedCount }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      try { await completeShoppingAction(); }
      catch { setError("Could not complete shopping. Please try again."); }
    });
  }

  return (
    <div className="spl-complete-bar" role="status" aria-live="polite">
      <span className="spl-complete-text">
        {checkedCount} {checkedCount === 1 ? "item" : "items"} checked
      </span>
      <button
        type="button"
        className="spl-btn spl-btn-primary spl-btn-sm"
        onClick={handleComplete}
        disabled={isPending}
      >
        <i className="fa-solid fa-check" aria-hidden="true" />
        {isPending ? "Archiving…" : "Finish shopping"}
      </button>
      {error && <span role="alert" className="spl-error">{error}</span>}
    </div>
  );
}
