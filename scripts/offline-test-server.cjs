// Isolated production test server. Never points at DATA_DIR or an existing DB.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const root = path.join(process.cwd(), ".npm-cache");
fs.mkdirSync(root, { recursive: true });
const directory = fs.mkdtempSync(path.join(root, "offline-e2e-"));
fs.writeFileSync(path.join(root, "offline-e2e-current.json"), JSON.stringify({ directory }));
const db = new Database(path.join(directory, "shoply.db"));
db.exec(fs.readFileSync("db/schema.sql", "utf8"));
db.exec(fs.readFileSync("db/offline.sql", "utf8"));
for (const [name, role] of [["Offline Admin", "ADMIN"], ["Offline Member", "MEMBER"]]) {
  db.prepare("INSERT INTO users (name, role, password_hash) VALUES (?, ?, ?)").run(name, role, bcrypt.hashSync("offline-test-password", 4));
}
db.prepare("INSERT INTO categories (name, is_default) VALUES ('Uncategorized', 1)").run();
db.prepare("INSERT INTO categories (name) VALUES ('Produce')").run();
db.close();
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3107"], {
  env: { ...process.env, NODE_ENV: "production", DATA_DIR: directory, COOKIE_SECURE: "false", FONTAWESOME_HOST: "" }, stdio: "inherit",
});
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { child.kill(); process.exit(0); });
child.on("exit", code => process.exit(code ?? 1));
