"use client";

import { useActionState } from "react";
import {
  createUserAction,
  resetPasswordAction,
  deleteUserAction,
  type AdminActionState,
} from "@/app/admin/actions";
import type { PublicUser } from "@/lib/types";

const ADMIN_LOCK_HINT =
  "For security, you cannot reset another admin's password.";
const ACCOUNT_MANAGEMENT_HINT =
  "Admins can delete member accounts. Admin accounts can only be deleted by the app owner using /delete. Passwords must be reset by an admin; users cannot reset their own passwords.";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ?? "").join("");
}

function PasswordReveal({ state }: { state: AdminActionState }) {
  if (!state.revealedPassword) return null;
  return (
    <div className="spl-password-reveal">
      Password for <strong>{state.revealedFor}</strong> (shown once):
      <br />
      {state.revealedPassword}
    </div>
  );
}

function CreateUserForm() {
  const [state, formAction] = useActionState<AdminActionState, FormData>(createUserAction, {});

  return (
    <form action={formAction} className="spl-form-col">
      <div className="spl-add-form" id="accountManager" style={{ gap: "6px" }}>
        <input name="name" placeholder="Name" required maxLength={50} className="spl-input" />
        <select name="role" className="spl-input spl-select-role" defaultValue="MEMBER">
          <option value="MEMBER">Member</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button type="submit" className="spl-btn spl-btn-primary">
          <i className="fa-solid fa-user-plus" aria-hidden="true" /> Create account
        </button>
      </div>
      {state.error && <div className="spl-error">{state.error}</div>}
      <PasswordReveal state={state} />
    </form>
  );
}

function UserRow({ user, requestingUserId }: { user: PublicUser; requestingUserId: number }) {
  const [resetState, resetAction] = useActionState<AdminActionState, FormData>(
    resetPasswordAction,
    {}
  );

  const isSelf = user.id === requestingUserId;
  const locked = user.role === "ADMIN" && !isSelf;
  const deleteLocked = user.role === "ADMIN";

  function handleDelete(e: React.FormEvent<HTMLFormElement>) {
    if (!confirm(`Delete the account "${user.name}"?`)) {
      e.preventDefault();
    }
  }

  return (
    <div className="spl-user-block">
      <div className="spl-row">
        <span className="spl-avatar" aria-hidden="true">
          {initialsOf(user.name)}
        </span>

        <div className="spl-row-body">
          <span className="spl-row-label">
            {user.name}
            {isSelf ? " (you)" : ""}
          </span>
          <span className="spl-role-pill" data-role={user.role}>
            {user.role === "ADMIN" ? "Admin" : "Member"}
          </span>
        </div>

        <div className="spl-row-actions">
          <form action={resetAction}>
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="userName" value={user.name} />
            <button
              type="submit"
              className="spl-btn spl-btn-secondary spl-btn-sm spl-btn-icon-only"
              disabled={locked}
              aria-label={
                locked
                  ? `Cannot reset the password for ${user.name}`
                  : `Reset the password for ${user.name}`
              }
              title={locked ? ADMIN_LOCK_HINT : "Reset password"}
            >
              <i className="fa-solid fa-key" aria-hidden="true" />
            </button>
          </form>
          {locked && (
            <span
              className="spl-hint"
              role="img"
              aria-label={ADMIN_LOCK_HINT}
              title={ADMIN_LOCK_HINT}
            >
              <i className="fa-solid fa-circle-info" aria-hidden="true" />
            </span>
          )}
          {!isSelf && !deleteLocked && (
            <form action={deleteUserAction} onSubmit={handleDelete}>
              <input type="hidden" name="userId" value={user.id} />
              <button
                type="submit"
                className="spl-btn spl-btn-danger spl-btn-sm spl-btn-icon-only"
                aria-label={`Delete account ${user.name}`}
                title="Delete"
              >
                <i className="fa-solid fa-trash" aria-hidden="true" />
              </button>
            </form>
          )}
          {deleteLocked && !isSelf && (
            <span
              className="spl-hint"
              role="img"
              aria-label="Admin accounts can only be deleted by the app owner using /delete"
              title="Admin accounts can only be deleted by the app owner using /delete"
            >
              <i className="fa-solid fa-shield-halved" aria-hidden="true" />
            </span>
          )}
        </div>
      </div>

      {resetState.error && <div className="spl-error">{resetState.error}</div>}
      <PasswordReveal state={resetState} />
    </div>
  );
}

export default function AdminAccountManager({
  users,
  requestingUserId,
}: {
  users: PublicUser[];
  requestingUserId: number;
}) {
  return (
    <section className="spl-card">
      <div className="spl-card-header">
        <span className="spl-card-icon">
          <i className="fa-solid fa-users" aria-hidden="true" />
        </span>
        <h2 className="spl-card-title">Accounts</h2>
        {users.length > 0 && <span className="spl-card-count">{users.length}</span>}
      </div>

      <p className="spl-card-note">{ACCOUNT_MANAGEMENT_HINT}</p>

      <CreateUserForm />

      <div className="spl-list">
        {users.map((u) => (
          <UserRow key={u.id} user={u} requestingUserId={requestingUserId} />
        ))}
      </div>
    </section>
  );
}
