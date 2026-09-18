"use client";

import { useEffect, useRef, useState } from "react";
import { addItemAction } from "@/app/list/actions";
import ConfirmDialog from "./ConfirmDialog";
import { confirmScannedItem } from "@/lib/shopping-scan-client";
import type { ShoppingScanResult } from "@/lib/shopping-scan-types";

type PreviewItem = { id: number; name: string; error?: string };

interface ShoppingScanDialogProps {
  result: ShoppingScanResult;
  onClose: () => void;
}

export default function ShoppingScanDialog({ result, onClose }: ShoppingScanDialogProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [items, setItems] = useState<PreviewItem[]>(() => result.items.map((item, index) => ({
    id: index,
    name: item.name,
  })));
  const [addingId, setAddingId] = useState<number | null>(null);
  const [discardingId, setDiscardingId] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    return () => {
      const target = previousFocusRef.current;
      if (target && document.contains(target)) target.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (discardingId !== null) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        sheetRef.current.focus();
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
  }, [discardingId, onClose]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, []);

  async function addItem(item: PreviewItem) {
    if (addingId !== null) return;
    setAddingId(item.id);
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, error: undefined } : entry));
    try {
      const response = await confirmScannedItem(addItemAction, item.name);
      if (response.error) {
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, error: response.error } : entry));
        return;
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setAnnouncement(`${item.name} wurde zur Liste hinzugefügt.`);
    } catch {
      setItems((current) => current.map((entry) => entry.id === item.id ? {
        ...entry,
        error: "Das Item konnte nicht hinzugefügt werden. Bitte erneut versuchen.",
      } : entry));
    } finally {
      setAddingId(null);
    }
  }

  function discardItem() {
    const item = items.find((entry) => entry.id === discardingId);
    if (!item) return;
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setDiscardingId(null);
    setAnnouncement(`${item.name} wurde verworfen.`);
  }

  const unreadable = result.unreadable_count;
  const detected = result.total_detected_lines;

  return (
    <>
      <div className="spl-overlay" onMouseDown={(event) => {
        if (event.target === event.currentTarget && discardingId === null) onClose();
      }}>
        <div
          ref={sheetRef}
          className="spl-sheet spl-scan-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="shopping-scan-title"
          tabIndex={-1}
          aria-hidden={discardingId !== null || undefined}
        >
          <div className="spl-sheet-header">
            <div>
              <h2 id="shopping-scan-title" className="spl-sheet-title">Erkannter Einkaufszettel</h2>
              <p className="spl-scan-stat">{result.successfully_parsed_count} von {detected} Items erkannt · {unreadable} unleserlich</p>
            </div>
            <button ref={closeButtonRef} type="button" className="spl-icon-btn spl-icon-btn-sm" onClick={onClose} aria-label="Scan-Vorschau schließen">
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>

          <div className="spl-scan-list">
            {items.length === 0 ? (
              <div className="spl-scan-empty">
                <i className="fa-solid fa-clipboard-check" aria-hidden="true" />
                Keine Items mehr in der Vorschau.
              </div>
            ) : items.map((item) => (
              <div key={item.id} className="spl-scan-item">
                <div className="spl-scan-item-content">
                  <span className="spl-scan-item-name">{item.name}</span>
                  {item.error && <span className="spl-scan-item-error" role="alert">{item.error}</span>}
                </div>
                <div className="spl-scan-item-actions">
                  <button
                    type="button"
                    className="spl-icon-btn spl-scan-action-add"
                    onClick={() => addItem(item)}
                    disabled={addingId !== null || discardingId !== null}
                    aria-label={`${item.name} zur Einkaufsliste hinzufügen`}
                    title="Zur Liste hinzufügen"
                  >
                    <i className={`fa-solid ${addingId === item.id ? "fa-spinner fa-spin" : "fa-check"}`} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="spl-icon-btn spl-icon-btn-danger"
                    onClick={() => setDiscardingId(item.id)}
                    disabled={addingId !== null || discardingId !== null}
                    aria-label={`${item.name} verwerfen`}
                    title="Verwerfen"
                  >
                    <i className="fa-solid fa-trash" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="spl-sr-only" aria-live="polite">{announcement}</div>
        </div>
      </div>

      {discardingId !== null && (
        <ConfirmDialog
          message="Möchtest du dieses Item wirklich verwerfen?"
          confirmLabel="Verwerfen"
          onConfirm={discardItem}
          onCancel={() => setDiscardingId(null)}
        />
      )}
    </>
  );
}
