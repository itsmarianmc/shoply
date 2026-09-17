"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createCategoryAction,
  renameCategoryAction,
  deleteCategoryAction,
  type AdminActionState,
} from "@/app/admin/actions";
import { getCategoryIcon } from "@/lib/category-icons";
import type { Category } from "@/lib/types";

function CreateCategoryForm() {
  const [state, formAction] = useActionState<AdminActionState, FormData>(
    createCategoryAction,
    {}
  );
  return (
    <form action={formAction} className="spl-add-form">
      <input name="name" placeholder="New category…" required maxLength={100} className="spl-input" />
      <button
        type="submit"
        className="spl-btn spl-btn-primary spl-btn-icon-only"
        aria-label="Create category"
        title="Create category"
      >
        <i className="fa-solid fa-plus" aria-hidden="true" />
      </button>
      {state.error && <div className="spl-error">{state.error}</div>}
    </form>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [renameState, renameAction] = useActionState<AdminActionState, FormData>(
    renameCategoryAction,
    {}
  );

  useEffect(() => {
    if (renameState.success) {
      setEditing(false);
    }
  }, [renameState]);

  function handleDelete(e: React.FormEvent<HTMLFormElement>) {
    if (!confirm(`Delete "${category.name}"? Its items will be moved to "Uncategorized".`)) {
      e.preventDefault();
    }
  }

  if (editing) {
    return (
      <div className="spl-row spl-row-edit">
        <form action={renameAction} className="spl-add-form">
          <input type="hidden" name="categoryId" value={category.id} />
          <input name="name" defaultValue={category.name} required maxLength={100} className="spl-input" />
          <button type="submit" className="spl-btn spl-btn-primary spl-btn-sm">
            OK
          </button>
          <button type="button" className="spl-btn spl-btn-secondary spl-btn-sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
        {renameState.error && <div className="spl-error">{renameState.error}</div>}
      </div>
    );
  }

  return (
    <div className="spl-row">
      <div className="spl-row-body">
        <span className="spl-row-label">
          <i className={`fa-solid ${getCategoryIcon(category.name)} spl-cat-icon`} aria-hidden="true" />
          {category.name}
        </span>
      </div>
      <div className="spl-row-actions">
        <button
          type="button"
          className="spl-btn spl-btn-secondary spl-btn-sm spl-btn-icon-only"
          onClick={() => setEditing(true)}
          aria-label={`Rename category "${category.name}"`}
          title="Rename"
        >
          <i className="fa-solid fa-pen" aria-hidden="true" />
        </button>
        <form action={deleteCategoryAction} onSubmit={handleDelete}>
          <input type="hidden" name="categoryId" value={category.id} />
          <button
            type="submit"
            className="spl-btn spl-btn-danger spl-btn-sm spl-btn-icon-only"
            aria-label={`Delete category "${category.name}"`}
            title="Delete"
          >
            <i className="fa-solid fa-trash" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminCategoryManager({ categories }: { categories: Category[] }) {
  const editable = categories.filter((c) => c.is_default === 0);

  return (
    <section className="spl-card">
      <div className="spl-card-header">
        <span className="spl-card-icon">
          <i className="fa-solid fa-layer-group" aria-hidden="true" />
        </span>
        <h2 className="spl-card-title">Categories</h2>
        {editable.length > 0 && <span className="spl-card-count">{editable.length}</span>}
      </div>

      <CreateCategoryForm />

      {editable.length === 0 ? (
        <div className="spl-list-empty">
          <i className="fa-solid fa-box-open" aria-hidden="true" />
          No custom categories yet.
        </div>
      ) : (
        <div className="spl-list">
          {editable.map((c) => (
            <CategoryRow key={c.id} category={c} />
          ))}
        </div>
      )}
    </section>
  );
}
