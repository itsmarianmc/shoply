"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "@/app/login/actions";
import type { PublicUser } from "@/lib/types";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="spl-btn spl-btn-primary" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export default function LoginForm({ users }: { users: PublicUser[] }) {
  const initialState: LoginState = {};
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {state.error && <div className="spl-error">{state.error}</div>}

      <div>
        <label className="spl-field-label" htmlFor="name">
          Who are you?
        </label>
        <select id="name" name="name" required className="spl-input" defaultValue="">
          <option value="" disabled>
            Select your name…
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.name}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <div className="spl-field">
        <label className="spl-field-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="spl-input"
          style={{ width: "100%" }}
        />
      </div>

      <SubmitButton />
    </form>
  );
}
