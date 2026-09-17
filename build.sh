#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

IMAGE="shoply"
TAG="latest"

echo "==> Baue shoply-Image (linux/amd64)..."
docker build --platform linux/amd64 -t "${IMAGE}:${TAG}" .

echo
echo "DONE:"
docker images | grep shoply
