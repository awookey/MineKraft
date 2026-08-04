# Session Handoff

Last updated: 2026-08-04

## Read this first

1. `README.md`
2. `docs/PROJECT-STATUS.md`
3. `docs/dependency-hardening.md`
4. `docs/phase-0-wood-spec.md`
5. `docs/phase-0-technical-design.md`
6. `docs/test-plan.md`

## Current state

Phase 0 operational recovery is complete.

The live bot now runs from the canonical checkout at `/home/silas/.openclaw/workspace/MineKraft`, authenticates successfully, spawns, reports healthy, and uses the preserved external world/auth/data paths.

Verified runtime image revision:

- `018d52117eb81cd50e7976792da94aa43b1723a0`

Dependency state:

- all direct dependencies current at verification time;
- `npm audit --omit=dev`: zero known vulnerabilities;
- dependency smoke and Bot CI added;
- `uuid` 11.1.1 override retained and live-auth tested pending upstream range updates.

The previous hand-punch wood edit is preserved in:

- `stash@{0}: On main: wip/wood-hand-bootstrap-before-phase0`

Do not apply or ship that stash by itself. Generic wood preflight can still invoke broad collection before `ensureMiningBootstrap()`.

## Next concrete build

Implement wood as a dedicated deterministic primitive:

1. Bind to the named owner only; block if absent.
2. Record starting wood inventory and count job-relative gains.
3. Bypass generic planner, preflight, collectblock, combat bootstrap, and automatic stash behavior.
4. Find a local reachable trunk.
5. Punch locally when no axe exists.
6. Upgrade tools opportunistically when local prerequisites allow.
7. Use a job ID/cancellation token.
8. Persist a target through bounded path/dig attempts and blacklist failed targets.
9. Emit stable state and blocked-reason values.

## Required verification

Static:

- `node --check bot/index.js`
- `bash -n scripts/*.sh`
- `git diff --check`
- unit tests and CI once introduced

Live acceptance:

- existing logs in inventory
- owner present and owner disconnect
- reachable and inaccessible trunks
- mixed species
- cancel while pathing/digging
- new job while one is active
- nearly full inventory
- restart during a job

Record command, commit/image hash, inventory before/after, debug states, path failures, and result.

## Operational warning

The current host has Docker Compose v1.29.2. Recreating a container can fail with `KeyError: 'ContainerConfig'`. Preserve external mounts, remove only the stopped bot container, then create it cleanly. Never remove the Minecraft world or backup containers/data as a workaround.
