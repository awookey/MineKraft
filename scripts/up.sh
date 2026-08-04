#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${SILAS_ENV_FILE:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ "$ENV_FILE" != ".env" ]]; then
    echo "[!] Environment file not found: $ENV_FILE"
    exit 1
  fi
  cp .env.example .env
  chmod 600 .env
  echo "[!] Created .env from template. Edit values, then run this command again."
  exit 1
fi

rcon_password=""
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  if [[ "$line" == RCON_PASSWORD=* ]]; then
    rcon_password="${line#RCON_PASSWORD=}"
  fi
done < "$ENV_FILE"

# Trim surrounding whitespace and an optional matching quote pair.
rcon_password="${rcon_password#"${rcon_password%%[![:space:]]*}"}"
rcon_password="${rcon_password%"${rcon_password##*[![:space:]]}"}"
if [[ ${#rcon_password} -ge 2 ]]; then
  first="${rcon_password:0:1}"
  last="${rcon_password: -1}"
  if [[ ( "$first" == '"' && "$last" == '"' ) || ( "$first" == "'" && "$last" == "'" ) ]]; then
    rcon_password="${rcon_password:1:${#rcon_password}-2}"
  fi
fi

case "$rcon_password" in
  ""|change_me|replace_with_strong_password)
    echo "[!] Refusing to start without a non-placeholder RCON password in $ENV_FILE."
    exit 1
    ;;
esac

if ! git diff --quiet -- bot/ || ! git diff --cached --quiet -- bot/ || [[ -n "$(git ls-files --others --exclude-standard -- bot/)" ]]; then
  echo "[!] Refusing to build from a dirty bot context; commit or stash bot changes first."
  exit 1
fi

SILAS_BUILD_COMMIT="$(git rev-parse --verify HEAD)"

if [[ "${SILAS_VALIDATE_ONLY:-0}" == "1" ]]; then
  echo "Startup guards: PASS (revision $SILAS_BUILD_COMMIT)"
  exit 0
fi

if [[ "$ENV_FILE" != ".env" ]]; then
  echo "[!] SILAS_ENV_FILE is supported only with SILAS_VALIDATE_ONLY=1."
  exit 1
fi

SILAS_BUILD_COMMIT="$SILAS_BUILD_COMMIT" docker-compose up -d --build
