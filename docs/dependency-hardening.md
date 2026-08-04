# Bot dependency hardening

Date: 2026-08-04

## Outcome

Production audit reduced from 23 findings (8 high, 15 moderate) to zero known findings.

Candidate source revision: `018d52117eb81cd50e7976792da94aa43b1723a0`

Candidate image: `sha256:3085718a02bdfe363de10d22379bf9267413af88bb1d9023015e0095a9df9398`

Rollback image tag: `minecraft-silas_silasbot:rollback-phase0`

## Changes

- Removed unused `prismarine-viewer`, eliminating 97 packages and the unused Express/Socket.IO/WebSocket attack surface.
- Updated `mineflayer` from 4.35.0 to 4.37.1.
- Updated `dotenv` from 16.6.1 to 17.4.2.
- Updated `mineflayer-auto-eat` from 4.0.0 to 5.0.3.
- Migrated auto-eat integration from `.plugin`/`.enable()`/mutable options to `.loader`/`.setOpts()`/`.enableAuto()`.
- Applied safe transitive updates, including `yggdrasil` 1.8.0.
- Overrode transitive `uuid` to 11.1.1 because `@azure/msal-node` and `yggdrasil` retain vulnerable ranges.
- Added a dependency export and UUID compatibility smoke test.
- Added Bot CI for locked installation, syntax, smoke testing, and production audit enforcement.

## Override rationale

The remaining audit chain was a single moderate `uuid` advisory propagated through Mineflayer's authentication dependencies. Both affected consumers use the stable `uuid.v4()` API. `uuid` 11.1.1 supports CommonJS and passed:

- direct UUID generation/validation;
- Yggdrasil and MSAL module loading;
- clean `npm ci`;
- dependency smoke testing;
- container image smoke testing;
- real cached Microsoft authentication;
- real Mineflayer spawn and server presence checks.

The override should be removed when upstream dependencies natively select a patched UUID release.

## Verification evidence

- `npm ci`: passed.
- `npm test`: passed.
- `node --check bot/index.js`: passed.
- `npm audit --omit=dev`: zero known vulnerabilities.
- `npm outdated --json`: empty.
- Docker build context: approximately 187 KB.
- Image-contained dependency smoke: passed.
- Image-contained production audit: zero known vulnerabilities.
- Microsoft cached authentication: passed without a new device code.
- Mineflayer spawn: passed.
- Bot container: running, healthy, zero restarts.
- RCON: `SilasMcClaw` online.
- Minecraft server: running, healthy, zero restarts.
- Backup service: running, zero restarts.
- Container `/app/index.js` hash matched canonical source.

## Rollback

If delayed regressions appear:

1. Preserve the external auth/data mounts.
2. Tag `minecraft-silas_silasbot:rollback-phase0` as `minecraft-silas_silasbot:latest`.
3. Remove only the stopped bot container to avoid the Compose v1 `ContainerConfig` bug.
4. Recreate only `silasbot` with `--no-deps`.
5. Verify health and RCON presence.
