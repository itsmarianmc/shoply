#!/usr/bin/env node


const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "shoply.db");
const PASSWORD_LENGTH = Number(process.env.PASSWORD_LENGTH || 64);
const BCRYPT_ROUNDS = 12;
const ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generatePassword(length) {
  const bytes = crypto.randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return password;
}

function main() {
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");

  const users = db
    .prepare("SELECT id, name, role FROM users ORDER BY role ASC, name ASC")
    .all();

  if (users.length === 0) {
    console.log("[resetpasswords] No users found.");
    db.close();
    return;
  }

  const reset = db.transaction(() => {
    const updatePassword = db.prepare(
      "UPDATE users SET password_hash = ? WHERE id = ?"
    );
    const revokeSessions = db.prepare("DELETE FROM sessions");
    const credentials = [];

    for (const user of users) {
      const password = generatePassword(PASSWORD_LENGTH);
      updatePassword.run(bcrypt.hashSync(password, BCRYPT_ROUNDS), user.id);
      credentials.push({ ...user, password });
    }

    revokeSessions.run();
    return credentials;
  });

  const credentials = reset();
  db.close();

  console.log("");
  console.log("========================================================");
  console.log(" Shoply: passwords have been reset");
  console.log(" All existing sessions have been revoked.");
  console.log(" Record the passwords now - they will not be shown again.");
  console.log("========================================================");
  for (const user of credentials) {
    console.log(`  ${user.role.padEnd(6)} ${user.name.padEnd(20)} ${user.password}`);
  }
  console.log("========================================================");
  console.log("");
}

main();
