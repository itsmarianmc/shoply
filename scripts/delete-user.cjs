#!/usr/bin/env node


const path = require("node:path");
const readline = require("node:readline/promises");
const Database = require("better-sqlite3");

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "shoply.db");

async function main() {
  const name = process.argv.slice(2).join(" ").trim();
  if (!name) {
    console.error("Usage: /delete <account-name>");
    process.exitCode = 1;
    return;
  }

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  const user = db
    .prepare("SELECT id, name, role FROM users WHERE name = ?")
    .get(name);

  if (!user) {
    console.error(`Account "${name}" was not found.`);
    db.close();
    process.exitCode = 1;
    return;
  }

  if (user.role === "ADMIN") {
    const adminCount = db
      .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'ADMIN'")
      .get();
    if (adminCount.c <= 1) {
      console.error("The last admin account cannot be deleted.");
      db.close();
      process.exitCode = 1;
      return;
    }
  }

  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await prompt.question(
    `Really delete account "${user.name}" (${user.role})? Type "yes" to confirm: `
  );
  prompt.close();

  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Deletion cancelled.");
    db.close();
    return;
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  db.close();
  console.log(`Account "${user.name}" (${user.role}) was deleted.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown error.");
  process.exitCode = 1;
});
