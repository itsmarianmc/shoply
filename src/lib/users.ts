import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { hashPassword } from "./auth";
import { bumpRevision } from "./revision";
import type { PublicUser, Role } from "./types";

const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";


export function generatePassword(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export function listUsers(): PublicUser[] {
  return db
    .prepare("SELECT id, name, role FROM users ORDER BY role ASC, name ASC")
    .all() as PublicUser[];
}


export async function createUser(
  name: string,
  role: Role,
  passwordLength: number
): Promise<{ user: PublicUser; password: string }> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty.");

  const existing = db.prepare("SELECT id FROM users WHERE name = ?").get(trimmed);
  if (existing) throw new Error("An account with this name already exists.");

  const password = generatePassword(passwordLength);
  const hash = await hashPassword(password);

  const result = db
    .prepare("INSERT INTO users (name, role, password_hash) VALUES (?, ?, ?)")
    .run(trimmed, role, hash);
  bumpRevision();

  return {
    user: { id: Number(result.lastInsertRowid), name: trimmed, role },
    password,
  };
}


export async function resetPassword(
  targetUserId: number,
  passwordLength: number,
  requestingAdminId: number
): Promise<string> {
  const target = db.prepare("SELECT role FROM users WHERE id = ?").get(targetUserId) as
    | { role: Role }
    | undefined;
  if (!target) throw new Error("Account not found.");

  const isOtherAdmin = targetUserId !== requestingAdminId && target.role === "ADMIN";
  if (isOtherAdmin) {
    throw new Error(
      "You cannot reset another admin's password."
    );
  }

  const password = generatePassword(passwordLength);
  const hash = await hashPassword(password);
  db.transaction(() => {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, targetUserId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetUserId);
    bumpRevision();
  })();
  return password;
}


export function deleteUser(userId: number, requestingUserId: number): void {
  if (userId === requestingUserId) {
    throw new Error("You cannot delete your own account.");
  }

  const target = db.prepare("SELECT role FROM users WHERE id = ?").get(userId) as
    | { role: Role }
    | undefined;

  if (!target) throw new Error("Account not found.");
  if (target.role === "ADMIN") {
    throw new Error(
      "Another admin account can only be deleted using the container command /delete."
    );
  }

  const result = db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  if (result.changes > 0) bumpRevision();
}

export function getUserByName(
  name: string
): { id: number; name: string; role: Role; password_hash: string } | undefined {
  return db
    .prepare("SELECT id, name, role, password_hash FROM users WHERE name = ?")
    .get(name) as
    | { id: number; name: string; role: Role; password_hash: string }
    | undefined;
}
