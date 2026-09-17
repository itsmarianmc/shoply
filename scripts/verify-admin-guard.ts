
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { resetPassword } from "../src/lib/users";

function insertUser(name: string, role: "ADMIN" | "MEMBER"): number {
  const result = db
    .prepare("INSERT INTO users (name, role, password_hash) VALUES (?, ?, ?)")
    .run(name, role, "irrelevant-hash");
  return Number(result.lastInsertRowid);
}

async function expectBlock(targetId: number, requesterId: number, label: string) {
  try {
    await resetPassword(targetId, 16, requesterId);
    assert.fail(`${label}: expected an error, but reset succeeded`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assert.match(
      message,
      /The password of another admin account cannot be reset\./,
      `${label}: unexpected error message: ${message}`
    );
    console.log(`PASS (blocked): ${label}`);
  }
}

async function main() {
  db.prepare("DELETE FROM sessions").run();
  db.prepare("DELETE FROM users").run();

  const adminA = insertUser("GuardAdminA", "ADMIN");
  const adminB = insertUser("GuardAdminB", "ADMIN");
  const member = insertUser("GuardMember", "MEMBER");

  await expectBlock(adminB, adminA, "admin A resets other admin B");

  const ownPassword = await resetPassword(adminA, 16, adminA);
  assert.ok(ownPassword.length === 16, "own reset should return a new password");
  console.log("PASS (allowed): admin resets own password");

  const memberPassword = await resetPassword(member, 16, adminA);
  assert.ok(memberPassword.length === 16, "member reset should return a new password");
  console.log("PASS (allowed): admin resets member password");

  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(adminA) as {
    password_hash: string;
  };
  assert.notEqual(row.password_hash, "irrelevant-hash", "hash should have been updated");
  console.log("PASS: stored hash was updated");

  console.log("\nAll guard checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
