# MineKraft (SilasCraft)

Family-friendly Minecraft server + Mineflayer bot with autonomous gather/craft/build loops, LLM planning, and persistent skill memory.

## What this is

- Paper Minecraft server (Docker)
- Mineflayer bot (`SilasMcClaw`) with:
  - normal companion commands (follow/come/stay/guard)
  - quest + profile system
  - **LLM/Codex planning** for prerequisite task generation
  - **skill persistence** (`bot/data/skills.json`) so known-good plans are reused
  - **auto execution** for mine/craft/build with safety + repair loops
- Daily backup container with retention
- One-command ops scripts for start/stop/logs/backup/restore

## Architecture highlights

- Planner path:
  1) load cached skill plan by key
  2) fallback to LLM planner when needed
  3) execute prerequisite tasks in order
  4) record successful plans back to skills store
- Build path:
  - template-driven block placement
  - multi-pass placement retries
  - relocation retry when first build site fails
- Safety path:
  - anti-water and low-breath checks
  - stuck watchdog with guarded reroute
  - 1x1 shaft escape routine
  - combat retreat/re-arm tuning

## Quick start

```bash
cd /home/silas/.openclaw/workspace/MineKraft
cp .env.example .env
# Edit .env for whitelist/admin/rcon/bot account details
./scripts/up.sh
```

Join from LAN on host port `25565`.

## Bot auth (secure)

Use Microsoft device-code auth on first run:

1. `./scripts/logs.sh silasbot`
2. Copy the Microsoft URL + one-time code from logs
3. Sign in as the bot account
4. Refresh token is stored under `bot/auth-cache`

## In-game command surface

All commands start with `!silas`.

### Core control
- `!silas help`
- `!silas follow <name>`
- `!silas come`
- `!silas stay`
- `!silas guard <name>`

### Manual tasks
- `!silas gather <iron|coal|stone|wood|wool|food> [amount]`
- `!silas craft <item> [amount]`
- `!silas build <hut|house|tower|wall> [wood|stone]`
- `!silas task <plain text>`

### Auto mode
- `!silas auto on|off|status|debug|cancel`
- `!silas auto mine <target> <amount>`
- `!silas auto gather <target> <amount>`
- `!silas auto craft <item> <amount>`
- `!silas auto build <hut|house|tower|wall> [wood|stone]`

### Test helper
- `!silas daytime on|off|status`

## Operational scripts

- Start: `./scripts/up.sh`
- Stop: `./scripts/down.sh`
- Logs: `./scripts/logs.sh [minecraft|silasbot|mc-backup]`
- Manual backup: `./scripts/backup-now.sh`
- Restore: `./scripts/restore.sh backups/<file>.tar.gz`

## Repo layout

- `docker-compose.yml`
- `bot/` (Mineflayer source)
  - `index.js`
  - `Dockerfile`
  - `package.json`
  - `data/` (runtime JSON)
  - `auth-cache/` (runtime auth cache)
- `scripts/`
- `server-data/` (runtime world/config)
- `backups/` (runtime backups)

## Notes

- Keep `ONLINE_MODE=TRUE` for authenticated accounts.
- Keep whitelist enabled for private/family play.
- `.env`, runtime world data, backups, and auth cache are intentionally excluded from git.
