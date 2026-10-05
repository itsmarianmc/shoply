import { vi, afterAll } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

vi.mock("@/lib/db", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf-8");
  db.exec(schema);
  return { db, DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "shoply-images-test-")) };
});

afterAll(async () => {
  const { DATA_DIR } = await import("@/lib/db");
  if (DATA_DIR && path.resolve(DATA_DIR).startsWith(path.join(os.tmpdir(), "shoply-images-test-"))) {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  }
});
