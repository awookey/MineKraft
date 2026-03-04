# SilasCraft: Minecraft + Mineflayer Quest Bot

Family-friendly Minecraft server with a personality bot that can switch to full mayhem PvP mode.

## What is included

- Paper Minecraft server (Docker)
- Daily world backups with retention
- Mineflayer bot with:
  - Follow / guard / come / stay commands
  - Quest generator
  - Family vs Mayhem mode
  - PvP toggle (in mayhem mode)
  - Per-player style memory (`bot/data/profiles.json`)
- One-command up/down/logs scripts

## Quick start

```bash
cd /home/silas/.openclaw/workspace/projects/minecraft-silas
cp .env.example .env
# Edit .env for ops/whitelist/password/bot username
./scripts/up.sh
```

Join from LAN using the host IP and port `25565`.

## Bot auth (secure)

Do **not** share Microsoft passwords.

Use device-code auth on first bot run:

1. `./scripts/logs.sh silasbot`
2. Copy the Microsoft URL + one-time code shown in logs
3. Sign in on your own device as the bot account
4. Refresh token is saved under `bot/auth-cache`

## In-game commands

Commands start with `!silas`:

- `!silas help`
- `!silas follow <name>`
- `!silas come`
- `!silas stay`
- `!silas guard <name>`
- `!silas quest start [mining|build|combat|scavenger]|status|done|abandon|types`
- `!silas gather <iron|coal|stone|wood|wool|food> [amount]`
- `!silas craft <item> [amount]` (e.g. iron_sword, iron_pickaxe, shield, torch)
- `!silas build <hut|house|tower|wall>`
- `!silas task <plain text>`
- `!silas inventory`
- `!silas deposit`
- `!silas chest` (prepare/place shared chest)
- `!silas stash` (store shared loot in chest)
- `!silas auto on|off|status|cancel`
- `!silas auto mine <iron|coal|stone|wood|wool> <amount>`
- `!silas auto craft <item> <amount>`
- `!silas auto build <hut|house|tower|wall>`
- `!silas profile`
- `!silas class <builder|scout|tank|alchemist>`
- `!silas checkin`
- `!silas party create <name>|join <name>|leave|status`
- `!silas mode family|mayhem` (admin users only)
- `!silas pvp on|off`
- `!silas event now` (admin users only)
- `!silas style <build style>`
- `!silas vibe`

## Operational scripts

- Start: `./scripts/up.sh`
- Stop: `./scripts/down.sh`
- Logs: `./scripts/logs.sh [minecraft|silasbot|mc-backup]`
- Manual backup: `./scripts/backup-now.sh`
- Restore: `./scripts/restore.sh backups/manual/world-....tar.gz`

## Notes

- Keep `ONLINE_MODE=TRUE` for authenticated accounts.
- Keep whitelist enabled for private family server use.
- For internet exposure, put behind firewall rules and set up rate limiting.
