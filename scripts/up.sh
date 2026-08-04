#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  echo "[!] Created .env from template. Edit values, then run this command again."
  exit 1
fi
if grep -Eq '^RCON_PASSWORD=(change_me|replace_with_strong_password)?$' .env; then
  echo "[!] Refusing to start with the placeholder RCON password. Update .env first."
  exit 1
fi
SILAS_BUILD_COMMIT="$(git rev-parse HEAD 2>/dev/null || printf unknown)" docker-compose up -d --build
