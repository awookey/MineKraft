#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 1 ]]; then
  echo "Usage: $0 backups/manual/world-YYYY-MM-DD_HHMMSS.tar.gz"
  exit 1
fi
archive="$1"
cd "$(dirname "$0")/.."
[[ -f "$archive" ]] || { echo "Archive not found: $archive"; exit 1; }

echo "[!] This will overwrite current world data."
read -rp "Type RESTORE to continue: " ok
[[ "$ok" == "RESTORE" ]] || { echo "Cancelled."; exit 1; }

docker-compose stop minecraft silasbot
rm -rf server-data/world server-data/world_nether server-data/world_the_end

tar -xzf "$archive" -C server-data

docker-compose start minecraft silasbot
echo "Restore complete."
