"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { addItemAction, suggestItemsAction } from "@/app/list/actions";
import { displayCategoryName, displayUnit } from "@/lib/presentation";

type Suggestion = {
  display_name: string;
  category_name: string;
  default_quantity: number | null;
  default_unit: string | null;
};

const DEBOUNCE_MS = 120;

export default function AddItemForm({
  recentItems,
}: {
  recentItems?: Suggestion[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [isPending, startTransition] = useTransition();
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionGenerationRef = useRef(0);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const visibleItems = showSuggestions
    ? suggestions
    : showRecent
      ? (recentItems ?? [])
      : [];
  const isOpen = visibleItems.length > 0;

  const fetchSuggestions = useCallback((value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 1) {
      suggestionGenerationRef.current += 1;
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const generation = ++suggestionGenerationRef.current;
    suggestItemsAction(trimmed).then((result) => {
      if (generation !== suggestionGenerationRef.current) return;
      setSuggestions(result);
      setShowSuggestions(result.length > 0);
      setShowRecent(false);
    }).catch(() => {
      if (generation !== suggestionGenerationRef.current) return;
      setSuggestions([]);
      setShowSuggestions(false);
    });
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => fetchSuggestions(inputValue),
      DEBOUNCE_MS
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, fetchSuggestions]);

  function selectSuggestion(suggestion: Suggestion) {
    const formData = new FormData();
    formData.set("name", suggestion.display_name);
    if (suggestion.default_quantity != null) {
      formData.set("quantity", String(suggestion.default_quantity));
    }
    if (suggestion.default_unit) {
      formData.set("unit", suggestion.default_unit);
    }
    startTransition(async () => {
      try {
        const result = await addItemAction(formData);
        if (result.error) { setError(result.error); return; }
        formRef.current?.reset();
        setInputValue("");
        setSuggestions([]);
        setShowSuggestions(false);
        setShowRecent(false);
        setActiveIndex(-1);
        inputRef.current?.focus();
      } catch {
        setError("Could not save the item. Please try again.");
      }
    });
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await addItemAction(formData);
        if (result.error) { setError(result.error); return; }
        formRef.current?.reset();
        setInputValue("");
        setSuggestions([]);
        setShowSuggestions(false);
        setShowRecent(false);
        setActiveIndex(-1);
      } catch {
        setError("Could not save the item. Please try again.");
      }
    });
  }

  function optionElements(): HTMLElement[] {
    const container = suggestionsRef.current;
    if (!container) return [];
    return Array.from(
      container.querySelectorAll<HTMLElement>('[role="option"]')
    );
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (event.key === "ArrowDown" && (recentItems?.length ?? 0) > 0) {
        event.preventDefault();
        setShowRecent(true);
        setShowSuggestions(false);
        setActiveIndex(-1);
      }
      return;
    }

    const opts = optionElements();
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = (activeIndex + 1) % visibleItems.length;
        setActiveIndex(next);
        opts[next]?.scrollIntoView({ block: "nearest" });
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const next = activeIndex <= 0 ? visibleItems.length - 1 : activeIndex - 1;
        setActiveIndex(next);
        opts[next]?.scrollIntoView({ block: "nearest" });
        break;
      }
      case "Enter":
        if (activeIndex >= 0 && activeIndex < visibleItems.length) {
          event.preventDefault();
          selectSuggestion(visibleItems[activeIndex]!);
        }
        break;
      case "Escape":
        event.preventDefault();
        setShowSuggestions(false);
        setShowRecent(false);
        setActiveIndex(-1);
        break;
      case "Tab":
        setShowSuggestions(false);
        setShowRecent(false);
        setActiveIndex(-1);
        break;
    }
  }

  function onInputBlur(event: React.FocusEvent<HTMLInputElement>) {
    if (!suggestionsRef.current?.contains(event.relatedTarget as Node)) {
      setTimeout(() => {
        setShowSuggestions(false);
        setShowRecent(false);
        setActiveIndex(-1);
      }, 120);
    }
  }

  function onInputFocus() {
    if (inputValue.trim().length >= 1 && suggestions.length > 0) {
      setShowSuggestions(true);
      setShowRecent(false);
    } else if (
      inputValue.trim().length === 0 &&
      (recentItems?.length ?? 0) > 0
    ) {
      setShowRecent(true);
      setShowSuggestions(false);
    }
  }

  return (
    <div className="spl-add-form-wrap">
      <form
        ref={formRef}
        action={handleSubmit}
        className="spl-add-form"
        onSubmit={() => {
          setShowSuggestions(false);
          setShowRecent(false);
        }}
      >
        <div className="spl-add-input-wrap">
          <input
            ref={inputRef}
            name="name"
            placeholder="What do you need?"
            required
            maxLength={200}
            autoComplete="off"
            className="spl-input"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setActiveIndex(-1);
            }}
            onKeyDown={onInputKeyDown}
            onBlur={onInputBlur}
            onFocus={onInputFocus}
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
            }
          />
          {(recentItems?.length ?? 0) > 0 && inputValue.trim().length === 0 && (
            <button
              type="button"
              className="spl-recent-btn"
              onClick={() => {
                setShowRecent(!showRecent);
                setShowSuggestions(false);
                setActiveIndex(-1);
              }}
              aria-label="Recently used items"
              title="Recently used"
              aria-expanded={showRecent}
              aria-haspopup="listbox"
              aria-controls={showRecent ? listboxId : undefined}
            >
              <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
            </button>
          )}
        </div>

        <button
          type="submit"
          className="spl-btn spl-btn-primary spl-btn-icon-only"
          disabled={isPending}
          aria-label="Add item"
          title="Add item"
        >
          <i className="fa-solid fa-plus" aria-hidden="true" />
        </button>
      </form>
      {error && <div className="spl-error" role="alert">{error}</div>}

      {isOpen && (
        <div
          ref={suggestionsRef}
          className="spl-suggestions"
          role="listbox"
          id={listboxId}
          aria-label={
            showSuggestions
              ? "Item suggestions"
              : "Recently used"
          }
        >
          {visibleItems.map((s, i) => {
            const qtyStr =
              s.default_quantity != null
                ? `${s.default_quantity}${s.default_unit ? " " + displayUnit(s.default_unit) : "×"}`
                : "";
            return (
              <div
                key={`${s.display_name}-${i}`}
                id={`${listboxId}-${i}`}
                role="option"
                aria-selected={activeIndex === i}
                data-active={activeIndex === i}
                className="spl-suggestion-item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSuggestion(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectSuggestion(s);
                  }
                }}
                tabIndex={-1}
              >
                <span className="spl-suggestion-name">
                  {highlightMatch(s.display_name, inputValue || "")}
                  {qtyStr && (
                    <span className="spl-suggestion-qty">{qtyStr}</span>
                  )}
                </span>
                <span className="spl-suggestion-cat">{displayCategoryName(s.category_name)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const normalized = text.toLowerCase();
  const idx = normalized.indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <strong className="spl-highlight">{text.slice(idx, idx + query.length)}</strong>
      {text.slice(idx + query.length)}
    </>
  );
}
