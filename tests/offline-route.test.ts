import { beforeEach, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { accountKeyFor } from "@/lib/offline/account";
import { addItem } from "@/lib/items";
import { syncItem } from "@/lib/offline/server";
import type { PublicUser } from "@/lib/types";
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/push", () => ({ sendShoppingSessionStartedNotification: vi.fn() }));
import { getCurrentUser } from "@/lib/auth";
import { sendShoppingSessionStartedNotification } from "@/lib/push";
import { GET, POST } from "@/app/api/offline/route";
let user: PublicUser;
let payload: object;
const request = (body = payload, headers = {}) => new Request("http://localhost/api/offline", { method: "POST", headers: { origin: "http://localhost", "content-type": "application/json", "x-shoply-sync": "1", ...headers }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  const name = crypto.randomUUID();
  user = { id: Number(db.prepare("INSERT INTO users (name, role, password_hash) VALUES (?, 'ADMIN', 'x')").run(name).lastInsertRowid), name, role: "ADMIN" };
  const item = syncItem(addItem("Route test", user.id))!;
  payload = { protocol: 1, accountKey: accountKeyFor(user.id), operation: { id: crypto.randomUUID(), kind: "check", target: item.key, base: item, delayed: true } };
  vi.mocked(getCurrentUser).mockResolvedValue(user);
});
it("returns private no-store snapshots without passwords or session credentials", async () => {
  const response = await GET(); const text = await response.text();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(text).not.toContain("password_hash"); expect(text).not.toContain("shoply_session");
});
it("rejects expired/revoked sessions for snapshots and every mutation", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect((await GET()).status).toBe(401); expect((await POST(request())).status).toBe(401);
});
it("rejects foreign origins, missing protocol headers, foreign account queues and oversized bodies", async () => {
  expect((await POST(request(payload, { origin: "https://foreign.example" }))).status).toBe(403);
  expect((await POST(request(payload, { "x-shoply-sync": "" }))).status).toBe(403);
  expect((await POST(request({ ...payload, accountKey: "another-account" }))).status).toBe(403);
  expect((await POST(request({ ...payload, extra: "x".repeat(65536) }))).status).toBe(400);
});
it("keeps malformed operations and unknown protocol versions out of the database", async () => {
  expect((await POST(request({ ...payload, operation: { kind: "delete" } }))).status).toBe(400);
  expect((await POST(request({ ...payload, protocol: 2 }))).status).toBe(409);
});
it("never delivers a delayed push or a duplicate live notification on HTTP retry", async () => {
  await POST(request()); expect(sendShoppingSessionStartedNotification).not.toHaveBeenCalled();
  db.prepare("UPDATE shopping_sessions SET ended_at = datetime('now') WHERE ended_at IS NULL").run();
  const item = syncItem(addItem("Live route", user.id))!;
  const live = { protocol: 1, live: true, accountKey: accountKeyFor(user.id), operation: { id: crypto.randomUUID(), kind: "check", target: item.key, base: item, delayed: false } };
  await POST(request(live)); await POST(request(live));
  expect(sendShoppingSessionStartedNotification).toHaveBeenCalledTimes(1);
});
