#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

tmp_dir="$(mktemp -d)"
dirty_path="bot/.up-guard-dirty-test"
cleanup() {
  rm -f "$dirty_path" "$tmp_dir/valid.env" "$tmp_dir/missing.env" "$tmp_dir/placeholder.env" "$tmp_dir/quoted-placeholder.env"
  rmdir "$tmp_dir"
}
trap cleanup EXIT

printf 'RCON_PASSWORD=test-only-strong-password\n' > "$tmp_dir/valid.env"
printf 'MC_HOST=minecraft\n' > "$tmp_dir/missing.env"
printf 'RCON_PASSWORD=change_me\n' > "$tmp_dir/placeholder.env"
printf 'RCON_PASSWORD="replace_with_strong_password"\n' > "$tmp_dir/quoted-placeholder.env"

SILAS_VALIDATE_ONLY=1 SILAS_ENV_FILE="$tmp_dir/valid.env" ./scripts/up.sh >/dev/null

for invalid_env in missing.env placeholder.env quoted-placeholder.env; do
  if SILAS_VALIDATE_ONLY=1 SILAS_ENV_FILE="$tmp_dir/$invalid_env" ./scripts/up.sh >/dev/null 2>&1; then
    echo "guard test failed: accepted $invalid_env"
    exit 1
  fi
done

printf 'uncommitted build input\n' > "$dirty_path"
if SILAS_VALIDATE_ONLY=1 SILAS_ENV_FILE="$tmp_dir/valid.env" ./scripts/up.sh >/dev/null 2>&1; then
  echo "guard test failed: accepted dirty bot build context"
  exit 1
fi
rm -f "$dirty_path"

SILAS_VALIDATE_ONLY=1 SILAS_ENV_FILE="$tmp_dir/valid.env" ./scripts/up.sh >/dev/null

echo "startup guard tests: PASS"
