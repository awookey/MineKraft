# Phase 0 Technical Design

Status: draft for implementation alignment
Scope: MineKraft wood-gathering MVP
Primary file: `bot/index.js`

## 1. Design intent

Phase 0 is deliberately narrow.

The bot should be:

- local
- predictable
- interruptible
- observable
- boring in the good way

This phase does not try to solve general Minecraft autonomy. It solves one stable owner-centred gather loop so later phases have a dependable primitive.

## 2. System boundaries

### Included in this phase

- command parsing for `!silas auto mine wood <amount>`
- job creation and basic auto loop state
- owner anchoring
- local wood scan
- minimal tool bootstrap for wood only
- pathing to a visible log
- dig + progress counting
- clear runtime status/error reporting

### Excluded from this phase

- broad planner-driven wood acquisition
- tree classification and full canopy/connected-component reasoning
- large-area scouting and exploration
- inventory deposit/stash optimisation
- hostile-environment wood harvesting strategies
- automated recovery from all pathfinder failures

## 3. Existing module map inside `bot/index.js`

The current file is monolithic, but the wood loop already falls into practical module boundaries.

### Command and job entry

Relevant functions:

- `startAutoMine(owner, targetRaw, amountRaw)`
- chat command handling under `!silas auto ...`

Responsibilities:

- validate command target
- create `autoState.job`
- initialise `currentStep` and `lastError`

### Shared auto job state

Relevant structure:

- `autoState`

Important fields:

- `enabled`
- `job`
- `busy`
- `currentStep`
- `lastError`
- `lastSuccess`
- `maxRadius`
- `placedCraftingTablePos`

### Owner anchoring

Relevant functions:

- `nearestAnchorForAuto()`
- `safeEntityPosition(entity)`
- `nearestAnchorPosition()`

Responsibilities:

- bind the job to the owner entity where possible
- provide a safe position reference for radius control and local scanning

### Wood targeting and progress

Relevant functions:

- `isWoodLikeName(name)`
- `woodBlockNames()`
- `woodItemCount()`
- `autoJobProgressCount(job)`
- `findNearbyWoodBlock(point, maxRadius)`

Responsibilities:

- define what counts as wood
- count progress across multiple log-like inventory items
- find a nearby visible wood block around the owner anchor

### Minimal bootstrap

Relevant functions:

- `ensureMiningBootstrap(job)`
- `craftPlanksAndSticks()`
- `ensureCraftingTableReady(opts)`
- `craftItem(itemName, amount, table)`
- `hasAnyAxe()`

Responsibilities:

- confirm an axe exists
- if not, attempt a minimal local bootstrap
- refuse to proceed when no nearby table or table-in-inventory path exists

### Runtime mining loop

Relevant function:

- `autoMineTick(job)`

Responsibilities:

- safety check
- completion check
- bootstrap tools
- radius guard
- local scan
- path to target
- dig target
- set clear `lastError` values for operator visibility

## 4. Reuse vs custom decisions

## Reused plugins / primitives

- `mineflayer-pathfinder`
  - movement and path goals
- `mineflayer-tool`
  - best-tool equipping via `equipForBlock`
- `mineflayer-collectblock`
  - useful for some gather loops, but intentionally not the primary Phase 0 wood path

## Custom logic retained deliberately

- manual owner-centred wood scan via `findNearbyWoodBlock()`
- wood progress counting via `woodItemCount()`
- local bootstrap behaviour via `ensureMiningBootstrap()`
- owner-radius enforcement in `autoMineTick()`

## Why custom here

Phase 0 needs deterministic, explainable behaviour more than maximum convenience.

A manual owner-local scan is preferable because it:

- matches the user’s mental model
- avoids wide speculative roaming
- is easier to debug than a generic collect routine
- makes failure modes explicit

## 5. Data and state transitions

### Job shape

Current wood job structure created by `startAutoMine()`:

- `kind: 'mine'`
- `target: 'wood'`
- `item: 'oak_log'`
- `blocks: autoMineTargets.wood.blocks`
- `amount`
- `owner`
- `startedAt`

### State channels in current code

Current state is split across:

- `autoState.job`
- `autoState.currentStep`
- `autoState.lastError`
- `autoState.lastSuccess`

This works, but it is soft state rather than a formal machine.

### Recommended explicit state constants

Recommended addition for code alignment:

```js
const WOOD_JOB_STATE = {
  IDLE: 'IDLE',
  PREPARE_JOB: 'PREPARE_JOB',
  SAFETY_CHECK: 'SAFETY_CHECK',
  ENSURE_AXE: 'ENSURE_AXE',
  REGROUP_OWNER: 'REGROUP_OWNER',
  SCAN_LOCAL_WOOD: 'SCAN_LOCAL_WOOD',
  APPROACH_TARGET: 'APPROACH_TARGET',
  DIG_TARGET: 'DIG_TARGET',
  COMPLETE: 'COMPLETE',
  BLOCKED: 'BLOCKED',
  CANCELLED: 'CANCELLED'
}
```

Recommended per-job additions:

- `state`
- `stateUpdatedAt`
- `blockedReason`
- `targetBlockPos`
- `treeLockId` (future phase, not required in current Phase 0 ship)

## 6. Wood runtime sequence

Happy path:

1. player starts `auto mine wood`
2. job enters `PREPARE_JOB`
3. loop checks completion and safety
4. loop ensures axe availability
5. loop confirms bot is within owner radius
6. loop scans for nearby visible wood around owner anchor
7. loop paths to chosen log
8. loop equips best tool and digs
9. progress count increases
10. repeat until amount reached
11. stop job and report success

Blocked path examples:

- no nearby crafting table for axe bootstrap
- no nearby visible wood near owner
- water or breath safety hazard
- temporarily outside safe owner radius

## 7. Feedback model

### Operator-facing status

The player needs short, unambiguous messages.

Current good patterns already present:

- `Need a nearby crafting table...`
- `Regrouping to stay in safe radius.`
- `No nearby visible wood near owner. Move me closer to a trunk.`
- completion message on success

### Debug-facing status

`!silas auto debug` should remain the primary live diagnostic surface.

Required fields:

- current step
- last error
- last success

### Logging principle

The bot should prefer:

- one clear message per meaningful transition
- no spam on every tick
- stable error labels suitable for regression tests

## 8. Known design debt

### Same-tree lock/classifier missing

Current behaviour selects the nearest qualifying wood block. It does not understand a tree as a unit.

Risks:

- target switching between adjacent trunks
- occasional weirdness in dense forests
- harder reasoning about “finish this tree first” behaviour

Recommended future shape:

- identify a trunk root or tree cluster id
- stay locked to that tree while viable
- abandon lock only on exhaustion, danger, or path failure

### Monolithic bot file

All logic currently lives in `bot/index.js`.

Recommended later extraction:

- `auto/jobs.js`
- `auto/wood.js`
- `auto/bootstrap.js`
- `auto/debug.js`

Not required for Phase 0 ship, but strongly advisable before Phase 1 complexity grows.

## 9. Acceptance tests for this design

Phase 0 design is considered aligned when:

- docs match actual command and runtime behaviour
- wood jobs remain owner-local
- missing prerequisites produce clear errors
- `auto debug` reflects meaningful current step and failure state
- no combat/bootstrap detour occurs before nearby wood is attempted

## 10. Rollback note

If later code alignment work regresses behaviour:

- revert to commit `a7dffbc` as last known narrowed wood-loop baseline
- keep these docs, but mark them as ahead-of-code if necessary
- reintroduce changes in smaller verified slices

## 11. Crawl / walk / run roadmap

### Crawl: Phase 0

- explicit owner-local wood loop
- clear bootstrap boundaries
- clear blocked reasons
- one stable gather primitive

### Walk: Phase 1

- same-tree lock/classifier
- recordable verification runs
- better target persistence and path recovery
- limited deposit/stash behaviour after success

### Run: later phases

- broader gather primitives for stone/iron/wool/food using the same behavioural contract
- formal planner integration only after primitive loops are trustworthy
- richer build/craft/combat orchestration built on dependable local gather actions
