#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

tmp_dir="$(mktemp -d)"
dirty_path="bot/.up-guard-dirty-test"
cleanup() {
  rm -f "$dirty_path" "$tmp_dir/valid.env" "$tmp_dir/missing.env" "$tmp_dir/placeholder.env" "$tmp_dir/quoted-placeholder.env" "$tmp_dir/inline-comment.env" "$tmp_dir/interpolated.env"
  rmdir "$tmp_dir"
}
trap cleanup EXIT

printf 'RCON_PASSWORD=test-only-strong-password\n' > "$tmp_dir/valid.env"
printf 'MC_HOST=minecraft\n' > "$tmp_dir/missing.env"
printf 'RCON_PASSWORD=change_me\n' > "$tmp_dir/placeholder.env"
printf 'RCON_PASSWORD="replace_with_strong_password"\n' > "$tmp_dir/quoted-placeholder.env"
printf 'RCON_PASSWORD=change_me # local default\n' > "$tmp_dir/inline-comment.env"
printf 'RCON_DEFAULT=change_me\nRCON_PASSWORD=${RCON_DEFAULT}\n' > "$tmp_dir/interpolated.env"

SILAS_VALIDATE_ONLY=1 SILAS_ENV_FILE="$tmp_dir/valid.env" ./scripts/up.sh >/dev/null

for invalid_env in missing.env placeholder.env quoted-placeholder.env inline-comment.env interpolated.env; do
  if SILAS_VALIDATE_ONLY=1 SILAS_ENV_FILE="$tmp_dir/$invalid_env" ./scripts/up.sh >/dev/null 2>&1; then
    echo "guard test failed: accepted $invalid_env"
    exit 1
  fi
done

if RCON_PASSWORD=change_me SILAS_VALIDATE_ONLY=1 SILAS_ENV_FILE="$tmp_dir/valid.env" ./scripts/up.sh >/dev/null 2>&1; then
  echo "guard test failed: accepted placeholder from calling environment"
  exit 1
fi

printf 'uncommitted build input\n' > "$dirty_path"
if SILAS_VALIDATE_ONLY=1 SILAS_ENV_FILE="$tmp_dir/valid.env" ./scripts/up.sh >/dev/null 2>&1; then
  echo "guard test failed: accepted dirty bot build context"
  exit 1
fi
rm -f "$dirty_path"

SILAS_VALIDATE_ONLY=1 SILAS_ENV_FILE="$tmp_dir/valid.env" ./scripts/up.sh >/dev/null

echo "startup guard tests: PASS"
