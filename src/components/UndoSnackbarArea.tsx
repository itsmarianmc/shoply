"use client";

import { useRef, useEffect, useState, useTransition } from "react";
import { undoCheckItemAction } from "@/lib/offline/actions";
import type { UndoEntry } from "@/lib/undo-global";

const UNDO_TIMEOUT_MS = 6000;


export default function UndoSnackbarArea() {
  const [items, setItems] = useState<(UndoEntry & { noticeId: number })[]>([]);
  const noticeId = useRef(0);

  useEffect(() => {
    function checkStack() {
      const stack = window.__shoplyUndoStack;
      if (stack && stack.length > 0) {
        window.__shoplyUndoStack = [];
        const fresh = [...new Map(stack.map(entry => [entry.itemId, entry])).values()].map(entry => ({ ...entry, noticeId: ++noticeId.current }));
        setItems((prev) => [...prev.filter(entry => !fresh.some(next => next.itemId === entry.itemId)), ...fresh]);
      }
    }
    const timer = setInterval(checkStack, 200);
    return () => clearInterval(timer);
  }, []);

  function removeItem(itemId: number) {
    setItems((prev) => prev.filter((i) => i.itemId !== itemId));
  }

  if (items.length === 0) return null;

  return (
    <div className="spl-undo-area" aria-label="Undo notifications">
      {items.map((item) => (
        <UndoItem key={item.noticeId} item={item} onDone={() => removeItem(item.itemId)} />
      ))}
    </div>
  );
}

function UndoItem({ item, onDone }: { item: UndoEntry; onDone: () => void }) {
  const [visible, setVisible] = useState(true);
  const [isPending, startTransition] = useTransition();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setVisible(false);
      onDoneRef.current();
    }, UNDO_TIMEOUT_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [item.itemId]);

  function handleUndo() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    startTransition(async () => {
      try {
        const changed = await undoCheckItemAction(item.itemId);
        if (!changed) { setError("This item has already changed."); return; }
        setVisible(false);
        onDone();
      } catch {
        setError("Could not undo that action. Please try again.");
      }
    });
  }

  if (!visible) return null;

  return (
    <div className="spl-undo-snackbar" role="status" aria-live="polite">
      <span className="spl-undo-text">
        <i className="fa-solid fa-check" aria-hidden="true" /> {item.itemName} checked
      </span>
      <button
        type="button"
        className="spl-undo-btn"
        onClick={handleUndo}
        disabled={isPending}
      >
        Undo
      </button>
      {error && <span role="alert" className="spl-error">{error}</span>}
    </div>
  );
}
