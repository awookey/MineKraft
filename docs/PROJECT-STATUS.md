# Project Status

Last updated: 2026-08-04

## Snapshot

- Phase/status: Phase 0 recovery and hardening complete; Phase 1 deterministic wood-job candidate is under test.
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
- Running image revision label: `018d52117eb81cd50e7976792da94aa43b1723a0`.
- Compose working directory: `/home/silas/.openclaw/workspace/MineKraft`.
- Existing world, backup, auth-cache, and bot-data directories remain externally mounted from the preserved runtime location.
- Dependency hardening candidate `018d52117eb81cd50e7976792da94aa43b1723a0` passed clean install, dependency smoke, image smoke, cached Microsoft authentication, spawn, health, and RCON presence checks.
- `npm audit --omit=dev` reports zero known production vulnerabilities after dependency hardening.

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
- The `uuid` 11.1.1 security override is required until Mineflayer's transitive auth dependencies widen their supported ranges; CI and live cached-auth testing guard compatibility.
- The dedicated Phase 1 wood primitive is implemented on `phase1/deterministic-wood-job` but is not live until image and in-world acceptance gates pass.
- The pure wood state module and regression suite pass locally; Mineflayer integration still requires candidate-image and controlled world verification.

## Next moves

1. Complete adversarial review and CI for the Phase 1 wood candidate.
2. Build an exact-revision bot image while retaining the Phase 0 rollback tag.
3. Run and record controlled owner-local in-world acceptance tests.
4. Merge only after Codex comments and post-deployment evidence are clean.

## Resume commands

```bash
cd /home/silas/.openclaw/workspace/MineKraft
git status --short --branch
docker inspect silas-mineflayer --format '{{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}'
docker exec silas-minecraft rcon-cli list
docker-compose logs --tail=200 silasbot
```
