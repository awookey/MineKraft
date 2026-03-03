#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "[!] Created .env from template. Edit values before first run."
fi
docker-compose up -d --build
