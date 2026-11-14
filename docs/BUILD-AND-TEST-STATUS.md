# Build and verification status — 12 November 2026

This repository contains the full application source for the requested Private Duo feature set. It is not a hosted service: it must be configured with secrets, run against PostgreSQL, and deployed to a server with HTTPS.

## What is present in the source

- Next.js 15 / React 19 responsive client, split into modular components, screens, hooks and game modules.
- Express API, PostgreSQL/Prisma data model, seeded Host and Guest accounts, hashed passwords and access codes, opaque hashed sessions and role checks.
- Socket.IO chat and game inbox messaging, presence, activity events, notifications and WebRTC signalling.
- Butterfly-only in-app notification animation and generic browser/Web Push notification copy.
- Study screen with a local prewritten Hinglish question and a simulated ~60-second response (not a real AI model).
- Separate promo unlock and RESTORE workflows; separate hide/archive/permanent-delete operations.
- Three local playable games with score, timer, progress and restart; persisted game sessions and scores.
- Permission request/review/revoke flows with timestamps and consent-gated remote microphone signalling.
- Host admin views for messages, game messages, promo rotation, permissions, call/notification/audit activity.
- Docker Compose, isolated internal proxy, Postgres volume, coturn service, migration-based API entrypoint, non-root containers, and sample host-Nginx integration snippets.

## Verification completed in this environment

- `npm install` completed successfully.
- `npm run build` passed: server TypeScript compilation and Next.js production build/type checking both succeeded.
- `npx prisma validate` passed.
- `npx prisma generate` completed successfully.
- Initial migration generated at `prisma/migrations/20261112000000_init/migration.sql`.
- Deployment entrypoint changed from `prisma db push` to `prisma migrate deploy`.
- The compiled API boots and `/health` returns `ok: true`.
- Cross-origin state-changing requests are rejected by the origin guard with HTTP 403; allowed-origin requests pass through to validation.
- One-command deployment tooling is present: `scripts/deploy-production.sh`, `scripts/renew-cert.sh`, `scripts/undeploy-production.sh` and `prisma/update-account-passwords.ts`.
- Bash syntax checks (`bash -n`) pass for all deployment/backup/restore scripts.
- The VAPID key-generation code was exercised locally with Node.js (valid P-256 base64url key pair).

## Not verified here

Docker is not installed in this environment and no local PostgreSQL service was verified. Therefore the following have **not** been completed:

- Docker image build and container startup.
- Database migration/seed against a live PostgreSQL instance.
- Browser end-to-end test, two-device chat test, WebRTC/TURN test and real Web Push test.
- Live deployment on the target VPS and host-Nginx integration.
- End-to-end execution of `scripts/deploy-production.sh` (certificate issuance, free-port selection, host-Nginx vhost rollback, password update inside the container, cron installation and uninstall).

Do not treat the acceptance checklist as passed until each item is exercised in the target environment.

## Required before production

1. Configure unique strong secrets in `.env`; never use example values.
2. Start PostgreSQL, then run `prisma migrate deploy` and seed exactly the two accounts.
3. Start the API and web app; run the smoke test with the configured account passwords.
4. Complete `docs/ACCEPTANCE-CHECKLIST.md` with two devices and two independent networks.
5. Configure a reachable TURN service and test call negotiation/reconnection over restrictive NATs.
6. Configure HTTPS, VAPID keys if background push is wanted, firewall rules and database backups.
7. Review host Nginx configuration and back it up before adding only the Private Duo virtual host.

No live deployment has been performed and no account credentials are embedded in this archive.
