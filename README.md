# MineKraft (SilasCraft)

Family-friendly Minecraft server + Mineflayer bot with autonomous gather/craft/build loops.

## Included

- Paper Minecraft server (Docker)
- Mineflayer bot (`SilasBot`) with quest + auto-job logic
- Daily backups container
- Helper scripts for up/down/logs/backup/restore

## Repository scaffold

- `docker-compose.yml` — stack definition
- `bot/` — Mineflayer bot source
  - `index.js`
  - `Dockerfile`
  - `package.json`
  - `data/` (runtime JSON, gitignored)
  - `auth-cache/` (runtime OAuth cache, gitignored)
- `scripts/` — operational scripts
- `server-data/` (runtime world/config, gitignored)
- `backups/` (runtime backups, gitignored)

## Quick start

```bash
cp .env.example .env
# edit .env values (whitelist/admin/rcon/bot account)
./scripts/up.sh
```

Then tail bot logs for first auth:

```bash
./scripts/logs.sh silasbot
```

Follow device-code login prompt for Microsoft auth.

## Core in-game commands

All commands start with `!silas`.

### Movement / control
- `!silas come`
- `!silas follow <name>`
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

### Testing helpers
- `!silas daytime on|off|status`

## Ops scripts

- Start stack: `./scripts/up.sh`
- Stop stack: `./scripts/down.sh`
- Logs: `./scripts/logs.sh [minecraft|silasbot|mc-backup]`
- Manual backup: `./scripts/backup-now.sh`
- Restore backup: `./scripts/restore.sh <backup-file>`

## Notes

- `.env` is intentionally excluded from git.
- Runtime world data and backups are excluded from git.
- Bot auth cache is excluded from git.
