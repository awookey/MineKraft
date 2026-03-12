# MineKraft Phase 0 Test Plan

Status: draft
Scope: wood-gathering MVP and its immediate observability surface

## 1. Test objective

Prove that `!silas auto mine wood <amount>` behaves in a narrow, predictable, owner-local way.

We are not testing general autonomy here. We are testing whether the bot can gather nearby wood without derping into wide roaming, bootstrap chaos, or silent failure.

## 2. Preconditions

Before each run:

- bot connected and responsive
- auto mode enabled
- operator available in-world as owner anchor
- daylight preferred for baseline tests
- hostile mob pressure minimised for baseline tests
- debug command available

Useful pre-run checks:

- `!silas auto status`
- `!silas auto debug`
- verify inventory state
- verify nearby tree and nearby crafting table conditions where relevant

## 3. Baseline manual tests

### T1. Happy path: nearby visible trunk, axe already available

Setup:

- owner stands near a plain visible tree trunk
- bot has any axe
- request a small amount, for example `!silas auto mine wood 4`

Expected:

- bot starts job
- bot remains near owner
- bot approaches visible trunk
- bot digs log blocks
- progress increases through wood-like inventory count
- bot stops on requested amount
- `auto debug` shows sensible step transitions

Pass if:

- no wide scouting occurs
- no unrelated bootstrap/combat behaviour occurs
- completion message is emitted

### T2. Happy path: no axe, but local bootstrap is possible

Setup:

- owner stands near visible wood
- bot has required wood/planks/sticks path or can make them
- crafting table is nearby or in inventory

Expected:

- bot reports/handles minimal bootstrap
- bot crafts wooden axe locally
- bot proceeds to nearby wood
- job completes or continues normally

Pass if:

- missing axe does not become a wandering search adventure
- bootstrap remains local and explainable

### T3. Blocked path: no nearby visible wood

Setup:

- owner stands somewhere with no visible trunk within local search radius
- start `!silas auto mine wood 4`

Expected:

- bot does not roam the wider world
- bot reports `No nearby visible wood near owner. Move me closer to a trunk.`
- debug/error surface shows `no_visible_target_near_owner:wood`

Pass if:

- operator can immediately understand how to unblock the job

### T4. Blocked path: no local crafting table for axe bootstrap

Setup:

- no axe in inventory
- no nearby crafting table
- no crafting table in inventory

Expected:

- bot reports need for nearby crafting table
- bot does not wander away hunting for one
- error state is stable and readable

Pass if:

- failure is clear and local

### T5. Radius guard

Setup:

- start wood job near visible trees
- move owner away beyond configured safe radius during job

Expected:

- bot regroups to owner instead of continuing detached harvesting
- once back in range, normal scanning may resume

Pass if:

- owner anchoring wins over speculative progress

## 4. Edge cases

### E1. Mixed wood species

Setup:

- nearby forest includes oak, birch, spruce, or other log types

Expected:

- target selection still works
- collected logs count toward progress when wood-like

### E2. Dense forest / adjacent trunks

Expected:

- bot may change target between nearby logs because same-tree lock is not yet implemented
- behaviour should still remain local and understandable

This is acceptable for Phase 0, but should be noted as design debt, not mistaken for finished tree intelligence.

### E3. Water hazard near target

Setup:

- visible wood close to water or while bot is in water/low breath

Expected:

- safety check wins
- bot avoids churn and surfaces a safety-related reason

### E4. Path obstruction

Setup:

- visible trunk exists but path is awkward or blocked

Expected:

- bot should not spiral silently
- debug surface should show meaningful blocked or transition state
- operator should be able to recover by moving the bot/owner closer

## 5. Regression checks

These are the regressions we specifically want to guard against.

### R1. No wide scouting for wood

The bot must not walk off across the map when owner-local wood is absent.

### R2. No unsafe-angle veto on obvious trunk

The bot must not refuse simple visible trunk mining because a generic unsafe dig rule over-fires.

### R3. No combat/bootstrap hijack before obvious wood attempt

A wood job must not disappear into unrelated survival side quests before nearby visible wood is tried.

### R4. No under-counting wood progress

Progress must reflect wood-like inventory gain, not only `oak_log`.

### R5. No silent wedged state

Operator must be able to tell whether the bot is:

- working
- blocked
- regrouping
- complete

## 6. Suggested evidence capture

For each meaningful test run, record:

- timestamp
- setup summary
- command used
- result
- `auto debug` output at least once mid-run or on failure
- relevant commit hash

Suggested format:

```text
Test: T3 no nearby visible wood
Commit: <hash>
Command: !silas auto mine wood 4
Result: PASS
Observed: bot followed owner and reported no nearby visible wood
Debug: step=mine:wood lastError=no_visible_target_near_owner:wood
```

## 7. Exit criteria for Phase 0 ship

Phase 0 wood loop is ready to call shipped when:

- T1 through T5 pass
- R1 through R5 hold
- at least one fresh in-world verification run is recorded against the current code
- docs match observed behaviour

## 8. What must never happen again

- the bot wandering off to do something “smart” when asked for simple local wood
- silence that hides whether work is happening or broken
- obvious nearby logs being ignored
- progress saying one thing while inventory says another
- a simple gather task turning into a bootstrap labyrinth
