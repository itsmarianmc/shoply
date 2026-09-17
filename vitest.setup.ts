import { vi } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/db", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf-8");
  db.exec(schema);
  return { db };
});