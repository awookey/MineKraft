# Phase 1 Deterministic Wood Job

Status: implementation candidate
Scope: `!silas auto mine wood <amount>` and `!silas auto gather wood <amount>`

## Goal

Turn owner-local wood gathering into a dependable primitive rather than a special case inside the generic mining planner.

Phase 1 keeps the useful Phase 0 contract and adds explicit identity, state, reachability, persistence, bounded recovery, and executable tests.

## Behaviour contract

A wood command creates one owner-bound job with:

- a stable job ID;
- the requesting player as the only owner;
- the wood inventory count at job start as its baseline;
- an explicit state and blocked reason;
- one persistent target and tree lock;
- bounded per-target retries, temporary cooldowns, permanent target exhaustion, and a job-wide failure budget;

Only wood collected after job creation counts towards completion. Existing logs do not satisfy the request.

## Dedicated execution path

A Phase 1 wood job uses `kind: wood` and enters `autoWoodTick()` before generic auto handling. It does not invoke:

- `preflightCheck()`;
- `planTask()`;
- `ensureMiningBootstrap()`;
- `ensureWeaponBootstrap()`;
- `collectBlocks()`;
- automatic inventory stashing;
- temporary crafting-table cleanup or movement.

The bot can punch logs immediately. If an axe already exists, the tool plugin equips it. A wooden axe may be crafted only when sufficient planks, sticks, and an already-reachable local crafting table are present. The wood job does not consume newly gathered logs to force a bootstrap detour.

## State machine

States are defined in `bot/lib/wood-job.js`:

- `PREPARE`
- `SAFETY_CHECK`
- `REGROUP_OWNER`
- `SCAN_LOCAL_WOOD`
- `APPROACH_TARGET`
- `DIG_TARGET`
- `BLOCKED`
- `COMPLETE`
- `CANCELLED`

`!silas auto status` exposes job identity, progress, and state. `!silas auto debug` additionally exposes owner, target, tree lock, failure count, current step, and last error.

## Target policy

1. Scan within 16 blocks of the named owner.
2. Group face-connected logs into tree components.
3. Prefer the current target, then the locked tree, then visible nearby low logs.
4. Probe at most eight Pathfinder candidates with a 75 ms per-probe ceiling.
5. Require visibility and `bot.canDigBlock()` for immediate dig targets.
6. Persist the selected target while it remains viable and owner-local.
7. Cool a target down after two failures and permanently exclude it after four lifetime failures.
8. Block the job after twelve total target failures rather than retry forever.
9. Move to another reachable tree when the locked tree is exhausted or unavailable.

Approach attempts are bounded to eight auto ticks. Pathfinder `noPath`, approach timeout, and dig errors all produce stable operator-facing reasons rather than an unbounded loop.

## Owner and cancellation rules

- The named owner is never silently replaced with the nearest player.
- If the owner is unavailable, the job enters `BLOCKED` and movement stops.
- If outside the owner radius, the job enters `REGROUP_OWNER`.
- A different non-admin player cannot cancel, stop, or overwrite the job.
- Follow, stay, come, guard, PvP, chest preparation, inventory transfer, and generic gather/craft/build commands cannot overwrite wood-owned movement or actions.
- A wood job is rejected while a pre-existing survival/bootstrap action or inventory transfer is still draining.
- Close creepers, hostile swarms, and nearby hostiles interrupt digging within the wood-owned safety path and retreat only to the named owner.
- Cancelling stops an in-flight dig and invalidates its target-generation token.
- An administrator can cancel the job.
- Disconnecting or dying cancels an active wood job rather than resuming it with a stale inventory baseline.

## Progress semantics

Progress is:

```text
max(0, current wood-like inventory - starting wood-like inventory)
```

Wood-like inventory includes normal logs, stems, hyphae, and bamboo blocks. Leaves, planks, and stripped logs are excluded to match the target block policy.

## Automated coverage

`bot/test/wood-job.test.js` covers:

- baseline-relative progress;
- mixed wood species;
- required owner and stable ID;
- owner absence, radius regroup, and safety decisions;
- owner/admin cancellation and operation-token invalidation;
- stable tree classification;
- visible target preference;
- target persistence;
- temporary blacklist expiry, permanent target exhaustion, and job-wide failure budgets;
- successful target-state cleanup.

`npm test` runs these tests and the dependency smoke test.

## Live acceptance matrix

Record each run with UTC timestamp, command, job ID, commit/image revision, inventory baseline, final progress, relevant debug output, and outcome.

Required controlled tests:

1. Existing logs do not complete a new job.
2. Nearby reachable trunk completes a small hand-first job.
3. Existing axe is used when available.
4. Mixed log species count towards progress.
5. No nearby reachable trunk enters a clear blocked state without wide roaming.
6. Inaccessible trunk is retried and blacklisted.
7. Moving the owner outside the radius causes regrouping.
8. Owner disappearance blocks the job.
9. Non-owner cancellation is rejected; owner/admin cancellation succeeds.
10. A second job cannot overwrite an active wood job.
11. Nearly full inventory does not trigger automatic stash during the job.
12. Bot disconnect or death cancels rather than silently resuming the job.

## Rollback

The live Phase 0 image remains tagged `minecraft-silas_silasbot:rollback-phase0` until Phase 1 acceptance passes. Deploy only the bot service. Do not recreate or alter the Minecraft server, backup service, world data, auth cache, or persisted bot data.
