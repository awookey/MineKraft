# Session Handoff

Last updated: 2026-04-02

## Read this first
1. `README.md`
2. `docs/PROJECT-STATUS.md`
3. Relevant code/config paths listed below

## Current focus
Preserve current bot work and operational state across session pruning.

## Important files
- `bot/index.js`
- `docs/test-plan.md`
- `docker-compose.yml`
- `scripts/up.sh`

## Latest decisions / assumptions
- Family-friendly default with admin-controlled mayhem mode.
- Device-code auth is the preferred bot auth path.

## Next concrete step
Before further bot edits, update this handoff with the intended behaviour change and expected verification command.

## Verification after changes
- `git status --short`
- `./scripts/logs.sh silasbot`
- relevant in-game or container smoke test after changes.

## Notes for future session
- Treat chat as scratchpad only. Persist meaningful decisions here or in project docs before stopping.
- If you change direction, update `docs/PROJECT-STATUS.md` first so 4am pruning does not erase the thread.
