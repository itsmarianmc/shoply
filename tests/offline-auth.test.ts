import { expect, it, vi } from "vitest";
import { db } from "@/lib/db";
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";

it("rejects an ISO session that expired earlier today and reads the current role", async () => {
  const id = Number(db.prepare("INSERT INTO users (name, role, password_hash) VALUES ('Session user', 'ADMIN', 'x')").run().lastInsertRowid);
  const token = crypto.randomUUID();
  vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: token }) } as unknown as Awaited<ReturnType<typeof cookies>>);
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(token, id, new Date(Date.now() - 60000).toISOString());
  expect(await getCurrentUser()).toBeNull();
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(token, id, new Date(Date.now() + 60000).toISOString());
  expect((await getCurrentUser())?.role).toBe("ADMIN");
  db.prepare("UPDATE users SET role = 'MEMBER' WHERE id = ?").run(id);
  expect((await getCurrentUser())?.role).toBe("MEMBER");
  db.prepare("DELETE FROM sessions WHERE id = ?").run(token);
  expect(await getCurrentUser()).toBeNull();
});
