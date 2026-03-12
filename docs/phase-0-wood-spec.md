# Phase 0 Wood Loop Spec

Status: draft for implementation alignment
Scope: `!silas auto mine wood <amount>` only
Goal: make wood gathering boring, local, explainable, and safe enough for repeated family-server use

## 1. Purpose

Phase 0 exists to make one narrow behaviour reliable before expanding into broader autonomy:

- gather nearby wood when explicitly commanded
- stay near the owner instead of wandering across the world
- fail fast when no usable trunk is visible
- avoid bootstrap/combat detours that make the bot feel clever but unreliable

This is intentionally a constrained loop, not a general resource harvester.

## 2. Command surface

Primary command:

- `!silas auto mine wood <amount>`

Related observability commands:

- `!silas auto on`
- `!silas auto off`
- `!silas auto status`
- `!silas auto debug`
- `!silas auto cancel`

Expected operator experience:

- command starts a single active wood job
- bot reports it has started
- bot either gathers wood locally or explains why it cannot proceed
- completion leaves gathered materials in inventory for the next job

## 3. In scope

Phase 0 wood loop is allowed to:

- accept an explicit owner-scoped wood mining job
- count progress based on wood-like inventory items
- search for visible nearby log blocks around the owner first
- move a short distance to a visible target log
- equip the best available axe
- craft a basic wooden axe if ingredients and a nearby crafting table are already available
- stop with a human-readable reason when prerequisites are missing
- stay within the configured safe working radius of the owner

## 4. Explicitly out of scope

Phase 0 wood loop must not:

- roam widely to search forests
- silently detach from the owner for speculative harvesting
- enter combat/bootstrap side quests before chopping a nearby trunk
- perform broad planner-led autonomy for wood jobs
- optimise for perfect tree-felling efficiency
- infer or complete multi-step survival progression beyond the minimum needed axe bootstrap
- pretend success when only repositioning or searching occurred

## 5. Behaviour contract

When a player runs `!silas auto mine wood <amount>` and auto mode is enabled:

1. Create a mine job with target `wood`, item goal `oak_log`, and requested amount.
2. Set `autoState.currentStep` to `prepare-mine:wood`, then later `mine:wood`.
3. On each auto tick:
   - check completion first
   - perform water/breath safety checks
   - ensure an axe exists or can be crafted locally
   - stay inside owner safety radius
   - search for nearby visible wood around the owner
   - path to the chosen target
   - dig it once in range
4. If no visible nearby wood exists, fail soft and clearly:
   - set `lastError=no_visible_target_near_owner:wood`
   - follow/regroup to owner
   - say the owner should move the bot closer to a trunk
5. When enough wood has been collected:
   - award XP
   - stop the auto job
   - leave items in inventory

## 6. Success criteria

A Phase 0 wood run is successful if all of the following are true:

- the bot stays owner-local
- it targets visible trunk blocks rather than wandering away
- it uses or crafts an axe only when local prerequisites are satisfied
- it reports failure reasons clearly
- it stops on completion without weird side jobs
- repeated runs behave similarly in the same terrain

## 7. Failure criteria

Phase 0 is considered failed if any of the following occur:

- bot walks off to scout wide areas for wood
- bot begins unrelated combat/bootstrap behaviour before obvious nearby wood is attempted
- bot loops indefinitely on missing table or missing path conditions
- bot reports mining progress without actually increasing wood inventory
- bot mines unsafe or irrelevant targets while owner-local wood is absent
- bot gives no actionable reason when stuck

## 8. Current implemented control flow

Actual current flow in `bot/index.js`:

- `startAutoMine(owner, 'wood', amount)` creates the job and resets `lastError`
- `autoMineTick(job)` handles the runtime loop
- progress for wood is measured via `woodItemCount()` rather than a single log type
- owner anchor is derived from the job owner if present
- `findNearbyWoodBlock(anchorPos || bot.entity.position, 16)` performs a manual local scan
- if a block is found, pathfinder moves within dig range and `bot.dig()` is attempted
- if not found, bot follows the owner and reports missing nearby visible wood

## 9. Phase 0 state machine

State names are logical states for documentation and future code alignment.
Current code stores them mostly in `autoState.currentStep` plus `lastError`.

### States

- `IDLE`
  - no active auto job
- `PREPARE_JOB`
  - job created, target and amount fixed
- `SAFETY_CHECK`
  - water/breath check before doing work
- `ENSURE_AXE`
  - verify an axe exists or attempt minimal local bootstrap
- `REGROUP_OWNER`
  - move back inside allowed owner radius
- `SCAN_LOCAL_WOOD`
  - search visible wood near owner anchor
- `APPROACH_TARGET`
  - move into dig range of selected log
- `DIG_TARGET`
  - equip best tool and dig selected block
- `COMPLETE`
  - amount reached, reward and stop
- `BLOCKED`
  - clear human-actionable failure reason exists
- `CANCELLED`
  - operator cancelled or system stopped the job

### Transitions

- `IDLE -> PREPARE_JOB`
  - `!silas auto mine wood <amount>`
- `PREPARE_JOB -> SAFETY_CHECK`
  - next auto tick
- `SAFETY_CHECK -> BLOCKED`
  - water-risk or similar immediate hazard
- `SAFETY_CHECK -> ENSURE_AXE`
  - safe to continue
- `ENSURE_AXE -> BLOCKED`
  - no local crafting table / no local bootstrap path
- `ENSURE_AXE -> REGROUP_OWNER`
  - tools ready but owner radius exceeded
- `ENSURE_AXE -> SCAN_LOCAL_WOOD`
  - tools ready and in radius
- `REGROUP_OWNER -> SCAN_LOCAL_WOOD`
  - back inside radius
- `SCAN_LOCAL_WOOD -> BLOCKED`
  - no visible nearby wood near owner
- `SCAN_LOCAL_WOOD -> APPROACH_TARGET`
  - target selected
- `APPROACH_TARGET -> DIG_TARGET`
  - within dig range
- `DIG_TARGET -> COMPLETE`
  - requested amount reached
- `DIG_TARGET -> SCAN_LOCAL_WOOD`
  - target removed, continue loop
- `* -> CANCELLED`
  - operator cancellation / disconnect / auto off

## 10. Logging and player feedback

Minimum required messages:

- start message for wood auto job
- regrouping message when outside owner radius
- explicit missing-local-wood message
- explicit missing-local-crafting-table message
- completion message with target and amount

Debug surface must continue to expose:

- current step
- last error
- last success

## 11. Known gaps between spec and code

The current implementation is close to the intended Phase 0 behaviour, but not fully formalised.

Open gaps:

- logical states are not yet represented as a dedicated enum/constant set
- `findNearbyWoodBlock` is proximity-based and does not classify a whole tree or lock to one trunk
- no same-tree lock means target choice may jump between nearby logs
- `BLOCKED` is implicit through `lastError`, not an explicit state channel
- live end-to-end validation against the newest wood path still needs recording

## 12. What must never happen again

- owner-local wood job turning into long-range wandering
- obvious trunk being ignored because of an over-strict unsafe-angle veto
- silent failure where the operator cannot tell whether the bot is working or wedged
- progress counting only one log type and under-reporting collected wood
- combat/bootstrap side quests hijacking a simple wood job
