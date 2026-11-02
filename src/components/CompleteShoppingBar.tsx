"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { completeShoppingAction } from "@/lib/offline/actions";

interface Props {
  checkedCount: number;
}

export default function CompleteShoppingBar({ checkedCount }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const shell = bar?.closest<HTMLElement>(".spl-shell");
    const header = shell?.querySelector<HTMLElement>(".spl-header");
    if (!bar || !shell || !header) return;

    const measure = () => {
      shell.style.setProperty("--spl-header-height", `${header.offsetHeight}px`);
      shell.style.setProperty("--spl-complete-bar-height", `${bar.offsetHeight}px`);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      shell.style.removeProperty("--spl-header-height");
      shell.style.removeProperty("--spl-complete-bar-height");
    };
  }, []);

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      try { await completeShoppingAction(); }
      catch { setError("Could not complete shopping. Please try again."); }
    });
  }

  return (
    <div ref={barRef} className="spl-complete-bar" role="status" aria-live="polite">
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
