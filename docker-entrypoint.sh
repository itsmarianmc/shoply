#!/bin/sh
set -e

echo "[entrypoint] Prepare data directory and permissions…"
mkdir -p "$DATA_DIR"
chown -R shoply:shoply "$DATA_DIR" /app

echo "[entrypoint] Checking and creating database and accounts…"
gosu shoply node scripts/seed.cjs

echo "[entrypoint] Starting Shoply on port ${PORT:-3000}…"
exec gosu shoply npm run start
