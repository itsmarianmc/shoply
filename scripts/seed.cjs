#!/usr/bin/env node


const fs = require("node:fs");
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

function parseNameList(envValue) {
  if (!envValue) return [];
  return envValue
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function generatePassword(length) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  db.exec(fs.readFileSync(schemaPath, "utf-8"));

  const defaultCat = db
    .prepare("SELECT id FROM categories WHERE is_default = 1")
    .get();
  if (!defaultCat) {
    db.prepare(
      "INSERT INTO categories (name, sort_order, is_default) VALUES (?, -1, 1)"
    ).run("Uncategorized");
    console.log('[seed] Default category "Uncategorized" created.');
  }

  const defaultCategories = parseNameList(process.env.DEFAULT_CATEGORIES);
  const maxOrderRow = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories")
    .get();
  let nextOrder = maxOrderRow.m + 1;
  const insertCategory = db.prepare(
    "INSERT INTO categories (name, sort_order, is_default) VALUES (?, ?, 0)"
  );
  const findCategory = db.prepare("SELECT id FROM categories WHERE name = ?");
  for (const name of defaultCategories) {
    if (!findCategory.get(name)) {
      insertCategory.run(name, nextOrder++);
      console.log(`[seed] Category "${name}" created.`);
    }
  }

  const adminNames = parseNameList(process.env.ADMIN_NAMES);
  const memberNames = parseNameList(process.env.MEMBER_NAMES);
  const findUser = db.prepare("SELECT id FROM users WHERE name = ?");
  const insertUser = db.prepare(
    "INSERT INTO users (name, role, password_hash) VALUES (?, ?, ?)"
  );

  const created = [];
  const roster = [
    ...adminNames.map((name) => ({ name, role: "ADMIN" })),
    ...memberNames.map((name) => ({ name, role: "MEMBER" })),
  ];

  for (const { name, role } of roster) {
    if (findUser.get(name)) continue;
    const password = generatePassword(PASSWORD_LENGTH);
    const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    insertUser.run(name, role, hash);
    created.push({ name, role, password });
  }

  if (created.length > 0) {
    console.log("");
    console.log("========================================================");
    console.log(" Shoply: new accounts created - record the passwords now!");
    console.log(" (they will only be shown in plain text this once)");
    console.log("========================================================");
    for (const u of created) {
      console.log(`  ${u.role.padEnd(6)} ${u.name.padEnd(20)} ${u.password}`);
    }
    console.log("========================================================");
    console.log("");
  } else {
    console.log("[seed] No new accounts to create (already exist or none configured).");
  }

  db.close();
}

main();
