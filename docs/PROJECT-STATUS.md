# Project Status

Last updated: 2026-04-02

## Snapshot
- Phase/status: Running project with active bot changes
- Repo/source of truth: GitHub repo awookey/MineKraft
- Working area: `MineKraft`
- Primary goal: Run a family-friendly Minecraft server with a mineflayer quest bot and controlled mayhem mode.

## Current reality
- What works now:
  - Docker-based Minecraft stack is defined.
  - Operational scripts exist.
  - Bot code is active and repo already tracks changes.
- Current gap / risk:
Bot behaviour is still being edited; without explicit handoff, session prune could lose reasoning around current bot changes.
- Blockers:
  - Need better capture of what changed in `bot/index.js` before/after edits.
  - Operational decisions are scattered across README and docs.

## Next moves
1. Record bot change intent before each edit session.
2. Keep docs/test-plan aligned with behaviour changes.
3. Commit checkpoints early when bot logic is stable.

## Resume commands
```bash
cd /home/silas/.openclaw/workspace/MineKraft
git status --short
./scripts/logs.sh silasbot
```

## Evidence / outputs
- `docs/test-plan.md`
- `bot/index.js`
- `scripts/*.sh`

## Session-prune rule
Before any session is pruned, update this file and `docs/SESSION-HANDOFF.md` so progress survives chat cleanup.
