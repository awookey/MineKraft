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

# Ask Compose to perform dotenv parsing and interpolation, then inspect only the
# resolved RCON fields. The Python process emits no configuration or secret.
if ! SILAS_ENV_FILE="$ENV_FILE" docker-compose --env-file "$ENV_FILE" config | python3 -c '
import json
import re
import sys

text = sys.stdin.read()
values = re.findall(r"^\s+RCON_PASSWORD:\s*(.*?)\s*$", text, re.MULTILINE)

def decode_yaml_scalar(value):
    if len(value) >= 2 and value[0] == value[-1] == "\047":
        return value[1:-1].replace("\047\047", "\047")
    if len(value) >= 2 and value[0] == value[-1] == "\"":
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value[1:-1]
    return value

resolved = [decode_yaml_scalar(value) for value in values]
placeholders = {"", "change_me", "replace_with_strong_password"}
valid = len(resolved) >= 2 and len(set(resolved)) == 1 and resolved[0] not in placeholders
sys.exit(0 if valid else 1)
'; then
  echo "[!] Refusing to start: Compose resolves RCON_PASSWORD to a missing, inconsistent, or placeholder value."
  exit 1
fi

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

SILAS_ENV_FILE="$ENV_FILE" SILAS_BUILD_COMMIT="$SILAS_BUILD_COMMIT" docker-compose --env-file "$ENV_FILE" up -d --build
