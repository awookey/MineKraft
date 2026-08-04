# Project Status

Last updated: 2026-08-04

## Snapshot

- Phase/status: Phase 0 recovery complete; deterministic wood-loop work is next.
- Source of truth: `awookey/MineKraft`.
- Canonical checkout and deployment directory: `/home/silas/.openclaw/workspace/MineKraft`.
- Primary product goal: a family-friendly Minecraft server with a reliable Mineflayer companion/quest bot and admin-controlled mayhem mode.
- Current engineering goal: make owner-local wood gathering deterministic, observable, cancellable, and testable before expanding broader autonomy.

## Verified live state

Verified at 2026-08-04T13:07:10Z:

- `silas-minecraft`: running, healthy, zero restarts.
- `silas-minecraft-backup`: running, zero restarts.
- `silas-mineflayer`: running, healthy, zero restarts after canonical recovery.
- Microsoft device-code authentication completed successfully.
- Mineflayer emitted `[silasbot] spawned`.
- RCON reported `SilasMcClaw` online.
- Container `/app/index.js` hash matches canonical `bot/index.js`.
- Running image revision label: `72abe3fbd81fa89172ec52628081f7d9ca3d5b49`.
- Compose working directory: `/home/silas/.openclaw/workspace/MineKraft`.
- Existing world, backup, auth-cache, and bot-data directories remain externally mounted from the preserved runtime location.

## Phase 0 changes

- Stopped an authentication restart loop after 362 bot restarts.
- Reconciled the useful auth-flow and block-placement changes from the old live source tree.
- Added spawn-based container readiness health checking.
- Added image source/revision labels and reproducible `npm ci` builds.
- Added runtime-data path overrides so canonical source can safely reuse existing persistent data.
- Added `.dockerignore` protection for auth cache, bot state, and local dependencies.
- Hardened `scripts/up.sh` against missing configuration and placeholder RCON credentials.
- Preserved the uncommitted hand-punch wood experiment as `stash@{0}: wip/wood-hand-bootstrap-before-phase0`; it must not be shipped alone.

## Known risks and debt

- The old source directory `/home/silas/.openclaw/workspace/projects/minecraft-silas` still stores persistent runtime data and should not be deleted.
- Docker Compose v1.29.2 has a `ContainerConfig` recreation bug with the current Docker engine. Clean bot recreation works after removing only the stopped bot container.
- `npm audit --omit=dev` reports 23 production findings: 15 moderate and 8 high.
- There are no executable tests or GitHub Actions workflows yet.
- Generic planner/preflight behavior still conflicts with the intended dedicated wood primitive.

## Next moves

1. Build the dedicated owner-bound wood job outside generic planner/collectblock/stash behavior.
2. Add baseline-relative progress, explicit state, job IDs/cancellation, reachability checks, bounded retries, and target blacklisting.
3. Add unit tests and CI.
4. Run and record controlled in-world acceptance tests against an exact commit/image hash.

## Resume commands

```bash
cd /home/silas/.openclaw/workspace/MineKraft
git status --short --branch
docker inspect silas-mineflayer --format '{{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}'
docker exec silas-minecraft rcon-cli list
docker-compose logs --tail=200 silasbot
```
