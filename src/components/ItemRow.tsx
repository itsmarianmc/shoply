"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  checkItemAction,
  uncheckItemAction,
  moveItemAction,
} from "@/app/list/actions";
import { getCategoryIcon } from "@/lib/category-icons";
import type { Category, ItemWithNames } from "@/lib/types";
import { displayCategoryName, displayUnit } from "@/lib/presentation";
import ItemDetailDialog from "./ItemDetailDialog";
import "@/lib/undo-global";

interface Props {
  item: ItemWithNames;
  isAdmin: boolean;
  categories: Category[];
}

export default function ItemRow({ item, isAdmin, categories }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showDetail, setShowDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isChecked = item.status === "CHECKED";
  const nameButtonRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      try {
        if (isChecked) {
          await uncheckItemAction(item.id);
        } else if (await checkItemAction(item.id)) {
          const stack = window.__shoplyUndoStack ?? [];
          stack.push({ itemId: item.id, itemName: item.name });
          window.__shoplyUndoStack = stack;
        }
      } catch {
        setError("Could not update the item. Please try again.");
      }
    });
  }

  function openDetail() {
    setShowDetail(true);
  }

  function closeDetail() {
    setShowDetail(false);
    requestAnimationFrame(() => nameButtonRef.current?.focus());
  }

  const quantityDisplay =
    item.quantity != null
      ? `${item.quantity}${item.unit ? " " + displayUnit(item.unit) : "×"}`
      : "";

  const metaParts = [
    item.added_by_name ? `+ ${item.added_by_name}` : null,
    isChecked && item.checked_by_name ? `✓ ${item.checked_by_name}` : null,
  ].filter((part): part is string => part !== null);

  return (
    <>
      <div className="spl-row" data-checked={isChecked}>
        <button
          type="button"
          className="spl-checkbox"
          data-checked={isChecked}
          aria-pressed={isChecked}
          aria-label={isChecked ? "Mark as active" : "Mark as checked"}
          onClick={toggle}
          disabled={isPending}
        >
          <i className="fa-solid fa-check spl-check" aria-hidden="true" />
        </button>

        <div className="spl-row-body">
          <button
            type="button"
            ref={nameButtonRef}
            className="spl-item-name-btn"
            onClick={openDetail}
            aria-label={`Open details for ${item.name}`}
          >
            <span className="spl-item-name">
              {item.name}
            </span>
            {quantityDisplay && (
              <span className="spl-item-qty">{quantityDisplay}</span>
            )}
          </button>
          {item.note && (
            <span className="spl-item-note">{item.note}</span>
          )}
          {metaParts.length > 0 && (
            <span className="spl-item-meta">{metaParts.join(" · ")}</span>
          )}
        </div>
        {error && <div className="spl-error" role="alert">{error}</div>}

        {isAdmin && (
          <MoveMenu item={item} categories={categories} isPending={isPending} />
        )}
      </div>

      {showDetail && (
        <ItemDetailDialog
          item={item}
          categories={categories}
          isAdmin={isAdmin}
          onClose={closeDetail}
        />
      )}
    </>
  );
}

interface MoveMenuProps {
  item: ItemWithNames;
  categories: Category[];
  isPending: boolean;
}


function MoveMenu({ item, categories, isPending }: MoveMenuProps) {
  const [open, setOpen] = useState(false);
  const [isMoving, startMoving] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  const options = categories.filter((category) => category.id !== item.category_id);
  const busy = isPending || isMoving;

  const close = useCallback((refocusTrigger: boolean) => {
    setOpen(false);
    if (refocusTrigger) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        close(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  function openMenu() {
    setOpen(true);
  }

  function optionElements(): HTMLElement[] {
    const list = listRef.current;
    if (!list) return [];
    return Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
  }

  function focusOptionAt(index: number) {
    const options = optionElements();
    if (options.length === 0) return;
    const clamped = Math.min(options.length - 1, Math.max(0, index));
    options[clamped]?.focus();
  }

  function onTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      close(false);
    }
  }

  function onListKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    const currentIndex = optionElements().findIndex(
      (el) => el === document.activeElement
    );

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusOptionAt(currentIndex + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusOptionAt(currentIndex <= 0 ? 0 : currentIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        focusOptionAt(0);
        break;
      case "End":
        event.preventDefault();
        focusOptionAt(optionElements().length - 1);
        break;
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  function select(categoryId: number) {
    close(true);
    const formData = new FormData();
    formData.set("itemId", String(item.id));
    formData.set("categoryId", String(categoryId));
    startMoving(async () => {
      await moveItemAction(formData);
    });
  }

  if (options.length === 0) return null;

  return (
    <div className="spl-move" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="spl-icon-btn spl-icon-btn-sm"
        onClick={openMenu}
        onKeyDown={onTriggerKeyDown}
        disabled={busy}
        aria-label="Move to category"
        title="Move to category"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        <i className="fa-solid fa-arrows-up-down-left-right" aria-hidden="true" />
      </button>

      {open && (
        <ul
          id={menuId}
          ref={listRef}
          className="spl-menu"
          role="listbox"
          aria-label="Choose a category"
          tabIndex={-1}
          onKeyDown={onListKeyDown}
        >
          {options.map((category) => (
            <li
              key={category.id}
              role="option"
              aria-selected="false"
              tabIndex={-1}
              className="spl-menu-item"
              onClick={() => select(category.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  select(category.id);
                }
              }}
            >
              <i
                className={`fa-solid ${getCategoryIcon(category.name, category.is_default === 1)}`}
                aria-hidden="true"
              />
              {displayCategoryName(category.name)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
