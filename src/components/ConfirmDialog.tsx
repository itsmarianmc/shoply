"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  title?: string;
  cancelLabel?: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title = "Item verwerfen",
  cancelLabel = "Abbrechen",
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    cancelRef.current?.focus();
    return () => {
      const previousFocus = previousFocusRef.current;
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
    };
  }, [mounted]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  if (!mounted) return null;
  return createPortal(
    <div className="spl-overlay spl-confirm-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <div
        ref={dialogRef}
        className="spl-sheet spl-confirm-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-confirm-title"
        tabIndex={-1}
      >
        <h2 id="scan-confirm-title" className="spl-sheet-title">{title}</h2>
        <p className="spl-confirm-message">{message}</p>
        <div className="spl-confirm-actions">
          <button type="button" className="spl-btn spl-btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button ref={cancelRef} type="button" className="spl-btn spl-btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>, document.body
  );
}
