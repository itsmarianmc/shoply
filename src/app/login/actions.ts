"use server";

import { redirect } from "next/navigation";
import { createSession, verifyPassword } from "@/lib/auth";
import { getUserByName } from "@/lib/users";

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !password) {
    return { error: "Enter your name and password." };
  }

  const user = getUserByName(name);
  if (!user) {
    return { error: "Unknown name or incorrect password." };
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return { error: "Unknown name or incorrect password." };
  }

  await createSession(user.id);
  redirect("/list");
}
