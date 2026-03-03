#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups/manual
stamp=$(date +%F_%H%M%S)
tar -czf "backups/manual/world-${stamp}.tar.gz" -C server-data world world_nether world_the_end server.properties whitelist.json ops.json 2>/dev/null || true
echo "Backup written: backups/manual/world-${stamp}.tar.gz"
