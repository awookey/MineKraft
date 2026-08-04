# Session Handoff

Last updated: 2026-08-04

## Read this first

1. `README.md`
2. `docs/PROJECT-STATUS.md`
3. `docs/dependency-hardening.md`
4. `docs/phase-1-wood-job.md`
5. `docs/phase-0-wood-spec.md`
6. `docs/phase-0-technical-design.md`
7. `docs/test-plan.md`

## Current state

Phase 0 operational recovery, dependency hardening, and Codex follow-up are complete on `main`.

The live bot remains healthy on the validated dependency image revision:

- `018d52117eb81cd50e7976792da94aa43b1723a0`

The Phase 1 implementation candidate is on:

- branch: `phase1/deterministic-wood-job`
- primary integration: `bot/index.js`
- pure state/selection module: `bot/lib/wood-job.js`
- regression suite: `bot/test/wood-job.test.js`
- design and acceptance contract: `docs/phase-1-wood-job.md`

The candidate has not yet been deployed. Local syntax, ten wood regression tests, dependency smoke, zero-production-audit, shell syntax, Compose validation, and diff checks pass.

## Phase 1 behaviour

The dedicated wood job now:

1. Binds to the requesting owner and blocks if that player is absent.
2. Counts only wood gained after the job starts.
3. Bypasses generic planner, preflight, collectblock, combat bootstrap, and automatic stash paths.
4. Punches by hand when no axe exists and uses/crafts an axe only when local prerequisites already allow it.
5. Uses a stable job ID and explicit states.
6. Rejects non-owner cancellation and prevents another job from overwriting active wood work.
7. Groups logs into tree components and persists the current tree/target.
8. Probes reachability, bounds approach/dig retries, and temporarily blacklists failed targets.
9. Cancels on bot disconnect rather than resuming against a stale inventory baseline.
10. Exposes identity, progress, state, target, tree lock, and failures via status/debug commands.

## Preserved work

The earlier hand-punch experiment remains preserved as:

- `stash@{0}: On main: wip/wood-hand-bootstrap-before-phase0`

It has not been applied wholesale. Its useful hand-first intent was implemented selectively without reverting later authentication, dependency, image, and readiness fixes.

## Remaining gates

1. Complete adversarial implementation review and address findings.
2. Commit and push the candidate.
3. Pass Bot CI, CodeQL, and Codex review.
4. Build a clean image labelled with the exact candidate revision.
5. Retain `minecraft-silas_silasbot:rollback-phase0`.
6. Recreate only `silas-mineflayer` using the proven Compose v1 workaround if required.
7. Verify cached Microsoft authentication, spawn readiness, health, zero restarts, and image/source hash.
8. Run the controlled acceptance matrix in `docs/phase-1-wood-job.md` with an owner present in-world.
9. Update evidence and merge only after review comments are addressed.
10. Re-check Codex/GitHub comments and post-merge main CI.

## Static verification

```bash
node --check bot/index.js
node --check bot/lib/wood-job.js
npm --prefix bot test
npm --prefix bot audit --omit=dev
bash -n scripts/*.sh
git diff --check
docker-compose config -q
```

## Operational warning

The current host has Docker Compose v1.29.2. Recreating a container can fail with `KeyError: 'ContainerConfig'`. Preserve all external mounts, remove only the stopped bot container, then create only `silasbot`. Never remove or recreate the Minecraft world, backup service, auth cache, or persistent data as a workaround.
